#!/usr/bin/env node
/**
 * Real-browser smoke test for OwnSpace in Floorp (Firefox fork).
 *
 * Launches Floorp headless on a throwaway profile with Marionette enabled,
 * installs ownspace.xpi as a TEMPORARY add-on (bypasses signing, exactly like
 * about:debugging → "Load Temporary Add-on"), then:
 *   1. loads newtab.html and checks widgets render,
 *   2. seeds storage with LEGACY calendar config (persisted viewYear/viewMonth)
 *      and reloads — the calendar must still open on the current month,
 *   3. loads the options page and checks its sections render,
 *   4. dumps browser-console errors mentioning the extension.
 *
 * Usage: node tools/smoke-floorp.mjs [--headed]
 */

import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const XPI = path.join(ROOT, 'ownspace.xpi');
const BIN = '/usr/bin/floorp';
const PORT = 2929;
const HEADED = process.argv.includes('--headed');

if (!fs.existsSync(XPI)) {
  console.error(`missing ${XPI} — run bash build.sh first`);
  process.exit(2);
}

// ── throwaway profile ────────────────────────────────────────────────────
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ownspace-smoke-'));
fs.writeFileSync(
  path.join(profile, 'user.js'),
  [
    `user_pref("marionette.port", ${PORT});`,
    'user_pref("browser.shell.checkDefaultBrowser", false);',
    'user_pref("browser.startup.homepage_override.mstone", "ignore");',
    'user_pref("startup.homepage_welcome_url", "about:blank");',
    'user_pref("startup.homepage_welcome_url.additional", "");',
    'user_pref("browser.aboutwelcome.enabled", false);',
    'user_pref("datareporting.policy.dataSubmissionEnabled", false);',
    'user_pref("toolkit.telemetry.enabled", false);',
    'user_pref("extensions.autoDisableScopes", 0);',
    'user_pref("xpinstall.signatures.required", false);',
    'user_pref("browser.sessionstore.resume_from_crash", false);',
    'user_pref("floorp.browser.tabbar.settings", 0);',
  ].join('\n'),
);

const args = [
  '--marionette',
  '-remote-allow-system-access',
  '--no-remote',
  '--profile',
  profile,
  'about:blank',
];
if (!HEADED) args.unshift('--headless');
const proc = spawn(BIN, args, {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, MOZ_DISABLE_AUTO_SAFE_MODE: '1' },
});
const browserLog = [];
proc.stdout.on('data', (d) => browserLog.push(String(d)));
proc.stderr.on('data', (d) => browserLog.push(String(d)));

// ── Marionette wire protocol ────────────────────────────────────────────
class Marionette {
  constructor() {
    this.sock = null;
    this.buf = Buffer.alloc(0);
    this.id = 0;
    this.pending = new Map();
    this.ready = null;
  }

  async connect(timeoutMs = 60000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      try {
        await this._open();
        return await this.ready;
      } catch (e) {
        if (Date.now() > deadline) throw e;
        await new Promise((r) => setTimeout(r, 400));
      }
    }
  }

  _open() {
    return new Promise((resolve, reject) => {
      const sock = net.connect(PORT, '127.0.0.1');
      let handshake;
      this.ready = new Promise((res) => { handshake = res; });
      sock.once('connect', () => {
        this.sock = sock;
        sock.on('data', (chunk) => this._onData(chunk, handshake));
        resolve();
      });
      sock.once('error', reject);
    });
  }

  _onData(chunk, handshake) {
    this.buf = Buffer.concat([this.buf, chunk]);
    for (;;) {
      const sep = this.buf.indexOf(0x3a); // ':'
      if (sep === -1) return;
      const len = parseInt(this.buf.subarray(0, sep).toString(), 10);
      if (Number.isNaN(len)) return;
      if (this.buf.length < sep + 1 + len) return;
      const body = this.buf.subarray(sep + 1, sep + 1 + len).toString();
      this.buf = this.buf.subarray(sep + 1 + len);
      const msg = JSON.parse(body);
      if (!Array.isArray(msg)) { handshake(msg); continue; } // server handshake
      const [, msgId, err, result] = msg;
      const p = this.pending.get(msgId);
      if (!p) continue;
      this.pending.delete(msgId);
      if (err) p.reject(new Error(`${err.error}: ${err.message}`));
      else p.resolve(result);
    }
  }

  send(name, params = {}) {
    const msgId = ++this.id;
    const payload = JSON.stringify([0, msgId, name, params]);
    this.sock.write(`${Buffer.byteLength(payload)}:${payload}`);
    return new Promise((resolve, reject) => {
      this.pending.set(msgId, { resolve, reject });
    });
  }
}

const results = [];
const fail = (name, detail) => { results.push({ ok: false, name, detail }); };
const pass = (name, detail = '') => { results.push({ ok: true, name, detail }); };

const client = new Marionette();
let exitCode = 0;

try {
  await client.connect();
  await client.send('WebDriver:NewSession', { capabilities: {} });
  await client.send('WebDriver:SetTimeouts', { implicit: 0, pageLoad: 60000, script: 30000 });

  // Temporary install — same code path as about:debugging.
  await client.send('Addon:Install', { path: XPI, temporary: true });

  // moz-extension UUID lives in a pref map id → uuid.
  await client.send('Marionette:SetContext', { value: 'chrome' });
  const uuidPref = await client.send('WebDriver:ExecuteScript', {
    script: 'return Services.prefs.getStringPref("extensions.webextensions.uuids", "{}");',
    args: [],
  });
  await client.send('Marionette:SetContext', { value: 'content' });

  const uuid = JSON.parse(uuidPref.value)['ownspace@extension.local'];
  if (!uuid) throw new Error('extension UUID not found — install failed');
  const base = `moz-extension://${uuid}`;
  console.log(`extension base: ${base}`);

  // ── 1. newtab renders ─────────────────────────────────────────────────
  await client.send('WebDriver:Navigate', { url: `${base}/newtab.html` });
  const boot = await client.send('WebDriver:ExecuteAsyncScript', {
    script: `
      const done = arguments[arguments.length - 1];
      const wait = async () => {
        for (let i = 0; i < 60; i++) {
          if (document.querySelector('#widget-grid') || document.querySelector('.workspace-tabs')) break;
          await new Promise((r) => setTimeout(r, 100));
        }
      };
      wait().then(() => done({
        bodyLen: document.body.innerHTML.length,
        hasGrid: !!document.querySelector('#widget-grid'),
        hasTabs: !!document.querySelector('.workspace-tabs, .workspace-tab'),
      }));
    `,
    args: [],
  });
  if (boot.value.hasGrid && boot.value.bodyLen > 200) pass('newtab renders (not blank)', JSON.stringify(boot.value));
  else fail('newtab renders (not blank)', JSON.stringify(boot.value));

  // ── 2. legacy stale month must not stick ──────────────────────────────
  const seed = await client.send('WebDriver:ExecuteAsyncScript', {
    script: `
      const done = arguments[arguments.length - 1];
      const now = new Date();
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 15);
      const ws = [{
        id: 'smoke-ws', name: 'Smoke',
        background: { type: 'color', value: '#1a1a2e' },
        widgets: [{
          id: 'smoke-cal', type: 'calendar', column: 0, order: 0, pinned: false,
          config: {
            events: [], title: '', showWeather: false,
            viewYear: prev.getFullYear(), viewMonth: prev.getMonth(), selectedDay: 12,
          },
        }, {
          id: 'smoke-notes', type: 'notes', column: 1, order: 0, pinned: false,
          config: { content: 'smoke' },
        }],
      }];
      browser.storage.local.set({ workspaces: ws, activeWorkspaceId: 'smoke-ws' })
        .then(() => done({
          seeded: true,
          expected: new Date(now.getFullYear(), now.getMonth(), 1)
            .toLocaleString('en', { month: 'long' }) + ' ' + now.getFullYear(),
          stale: new Date(prev.getFullYear(), prev.getMonth(), 1)
            .toLocaleString('en', { month: 'long' }) + ' ' + prev.getFullYear(),
        }))
        .catch((e) => done({ seeded: false, error: String(e) }));
    `,
    args: [],
  });
  if (!seed.value.seeded) throw new Error(`storage seed failed: ${seed.value.error}`);

  await client.send('WebDriver:Navigate', { url: `${base}/newtab.html?reload=1` });
  const cal = await client.send('WebDriver:ExecuteAsyncScript', {
    script: `
      const done = arguments[arguments.length - 1];
      const wait = async () => {
        for (let i = 0; i < 80; i++) {
          if (document.querySelector('.calendar-title')) return true;
          await new Promise((r) => setTimeout(r, 100));
        }
        return false;
      };
      wait().then((found) => done({
        found,
        title: document.querySelector('.calendar-title')?.textContent.trim() || null,
        todayCells: document.querySelectorAll('.calendar-day.today').length,
        widgets: document.querySelectorAll('.widget').length,
        selectedPanel: !!document.querySelector('.selected-day-panel'),
      }));
    `,
    args: [],
  });
  const v = cal.value;
  if (v.title === seed.value.expected && v.todayCells === 1) {
    pass('calendar opens on current month despite legacy stored month',
      `title="${v.title}" (stale was "${seed.value.stale}"), todayCells=${v.todayCells}`);
  } else {
    fail('calendar opens on current month despite legacy stored month',
      `title="${v.title}" expected="${seed.value.expected}" todayCells=${v.todayCells}`);
  }
  if (v.widgets === 2) pass('all widgets rendered', `count=${v.widgets}`);
  else fail('all widgets rendered', `count=${v.widgets}`);

  // Month navigation still works, and stays out of storage.
  const nav = await client.send('WebDriver:ExecuteAsyncScript', {
    script: `
      const done = arguments[arguments.length - 1];
      document.querySelector('.next-month').click();
      setTimeout(async () => {
        const title = document.querySelector('.calendar-title')?.textContent.trim();
        const stored = await browser.storage.local.get('workspaces');
        const cfg = stored.workspaces[0].widgets.find((w) => w.type === 'calendar').config;
        done({ title, persistedKeys: Object.keys(cfg).filter((k) => /^(viewYear|viewMonth|selectedDay)$/.test(k)) });
      }, 300);
    `,
    args: [],
  });
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextTitle = `${next.toLocaleString('en', { month: 'long' })} ${next.getFullYear()}`;
  if (nav.value.title === nextTitle) pass('next-month navigation works', nav.value.title);
  else fail('next-month navigation works', `got "${nav.value.title}" expected "${nextTitle}"`);
  if (nav.value.persistedKeys.length === 0) pass('view state is not persisted to storage');
  else fail('view state is not persisted to storage', nav.value.persistedKeys.join(','));

  // A second tab (fresh page load) must still show the current month.
  await client.send('WebDriver:Navigate', { url: `${base}/newtab.html?tab2=1` });
  const tab2 = await client.send('WebDriver:ExecuteAsyncScript', {
    script: `
      const done = arguments[arguments.length - 1];
      const wait = async () => {
        for (let i = 0; i < 80; i++) {
          if (document.querySelector('.calendar-title')) return;
          await new Promise((r) => setTimeout(r, 100));
        }
      };
      wait().then(() => done({ title: document.querySelector('.calendar-title')?.textContent.trim() || null }));
    `,
    args: [],
  });
  if (tab2.value.title === seed.value.expected) pass('new tab after navigation shows current month', tab2.value.title);
  else fail('new tab after navigation shows current month', `got "${tab2.value.title}"`);

  // ── 3. options page ───────────────────────────────────────────────────
  await client.send('WebDriver:Navigate', { url: `${base}/options/options.html` });
  const opts = await client.send('WebDriver:ExecuteAsyncScript', {
    script: `
      const done = arguments[arguments.length - 1];
      const wait = async () => {
        for (let i = 0; i < 80; i++) {
          if (document.body.innerHTML.length > 500) return;
          await new Promise((r) => setTimeout(r, 100));
        }
      };
      wait().then(() => done({
        bodyLen: document.body.innerHTML.length,
        sections: document.querySelectorAll('section, .settings-section, .option-section').length,
        errorBox: document.querySelector('#init-error, .init-error')?.textContent?.trim() || null,
      }));
    `,
    args: [],
  });
  if (opts.value.bodyLen > 500 && !opts.value.errorBox) pass('options page renders', JSON.stringify(opts.value));
  else fail('options page renders', JSON.stringify(opts.value));

  // ── 4. console errors ─────────────────────────────────────────────────
  await client.send('Marionette:SetContext', { value: 'chrome' });
  const logs = await client.send('WebDriver:ExecuteScript', {
    script: `
      const out = [];
      for (const m of Services.console.getMessageArray() || []) {
        try {
          const src = m.sourceName || '';
          const txt = m.message || m.errorMessage || String(m);
          if (/moz-extension|OwnSpace/i.test(src + txt)) out.push({ src, txt, flags: m.flags ?? null });
        } catch (e) { /* opaque message */ }
      }
      return out;
    `,
    args: [],
  });
  await client.send('Marionette:SetContext', { value: 'content' });
  // flags: 0 = error, 1 = warning
  const allErrs = (logs.value || []).filter((m) => m.flags === 0 || m.flags === null);
  // Pre-existing, unrelated to widget logic: src/styles/main.css and
  // options/options.css declare @font-face for src/lib/fonts/Inter-Variable.woff2,
  // a file that is not in the repo. Purely cosmetic (the CSS font stack falls
  // back), reported separately so it does not mask real script errors.
  const isMissingFont = (m) => /downloadable font/i.test(m.txt || '');
  const errs = allErrs.filter((m) => !isMissingFont(m));
  const fontErrs = allErrs.filter(isMissingFont);
  if (errs.length === 0) pass('no extension script errors in browser console');
  else fail('no extension script errors in browser console', JSON.stringify(errs.slice(0, 8), null, 2));
  if (fontErrs.length) {
    console.log(`\nnote: ${fontErrs.length} pre-existing missing-font error(s) (Inter-Variable.woff2 is not in the repo; CSS falls back)`);
  }

  try { await client.send('WebDriver:DeleteSession', {}); } catch { /* shutting down */ }
} catch (e) {
  fail('smoke run', e.stack || String(e));
  exitCode = 1;
} finally {
  try { proc.kill('SIGTERM'); } catch { /* already gone */ }
  await new Promise((r) => setTimeout(r, 800));
  try { proc.kill('SIGKILL'); } catch { /* already gone */ }
  fs.rmSync(profile, { recursive: true, force: true });
}

console.log('\n──── OwnSpace smoke test (Floorp, temporary add-on) ────');
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `\n      ${r.detail}` : ''}`);
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
if (failed) {
  console.log('\n── browser stderr tail ──');
  console.log(browserLog.join('').split('\n').slice(-40).join('\n'));
  exitCode = 1;
}
process.exit(exitCode);
