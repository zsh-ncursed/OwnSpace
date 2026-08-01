import { state, getActiveWorkspace } from '../state.js';
import { saveWorkspaces } from '../storage.js';
import { escapeHtml } from '../ui/escape.js';
import { showNotification } from '../ui/modals.js';
import { browserMessaging } from '../export-import.js';
import {
  loadCalDAVCredentialsDecrypted,
  getMasterPasswordHash,
  showChangeMasterPasswordModal,
  ensureMasterPassword,
} from './master-password.js';
import { encryptJson } from '../crypto.js';
import { saveCalDAVCredentials } from '../storage.js';
import { updateWidgetConfig } from '../widgets/management.js';
import { t } from '../i18n/index.js';

export async function syncCalDAVEvents(widgetId) {
  const workspace = getActiveWorkspace();
  const widget = workspace.widgets.find((w) => w.id === widgetId);
  if (!widget || !widget.config.caldavCalendarHref) return false;

  const creds = await loadCalDAVCredentialsDecrypted();
  if (!creds) return false;

  try {
    const response = await browserMessaging.sendMessage({
      type: 'sync',
      payload: {
        url: creds.url,
        username: creds.username,
        password: creds.password,
        calendarUrl: widget.config.caldavCalendarHref,
      },
    });

    if (!response || !response.success) {
      showNotification(
        t('modal.caldav.sync_error', { message: response?.error || t('modal.caldav.sync_generic_error') }),
      );
      return false;
    }

    const remoteEvents = (response.result && response.result.events) || [];
    const localEvents = (widget.config.events || []).filter(
      (e) => e.source !== 'caldav',
    );

    const merged = [...localEvents];
    const seenUids = new Set();
    for (const e of remoteEvents) {
      if (e.uid && !seenUids.has(e.uid)) {
        seenUids.add(e.uid);
        merged.push({
          id: e.uid,
          title: e.title,
          date: e.date,
          time: e.time || undefined,
          source: 'caldav',
          uid: e.uid,
        });
      }
    }

    const workspaceIdx = state.workspaces.findIndex(
      (ws) => ws.id === workspace.id,
    );
    if (workspaceIdx === -1) return false;
    const updatedWidgets = state.workspaces[workspaceIdx].widgets.map((w) =>
      w.id === widgetId
        ? {
            ...w,
            config: {
              ...w.config,
              events: merged,
              caldavLastSync: new Date().toISOString(),
            },
          }
        : w,
    );
    state.workspaces[workspaceIdx] = {
      ...state.workspaces[workspaceIdx],
      widgets: updatedWidgets,
    };
    await saveWorkspaces(state.workspaces);
    return true;
  } catch (e) {
    showNotification(t('modal.caldav.sync_error', { message: e.message }));
    return false;
  }
}

export async function showCalDAVCalendarPicker(widgetId) {
  const creds = await loadCalDAVCredentialsDecrypted();
  if (!creds) {
    showNotification(
      t('modal.caldav.configure_first'),
    );
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal caldav-picker-modal">
      <h3>${t('modal.caldav.title')}</h3>
      <p style="margin: 0 0 12px; opacity: 0.7; font-size: 13px;">${t('modal.caldav.searching')}</p>
    </div>
  `;
  document.body.appendChild(overlay);

  try {
    const response = await browserMessaging.sendMessage({
      type: 'test',
      payload: {
        url: creds.url,
        username: creds.username,
        password: creds.password,
      },
    });

    let calendars = [];
    if (response && response.success) {
      calendars = response.result.calendars || [];
    }

    if (!calendars || calendars.length === 0) {
      overlay.querySelector('.modal').innerHTML = `
        <h3>${t('modal.caldav.manual_url_title')}</h3>
        <p style="margin:0 0 8px;opacity:0.7;font-size:13px;">
          ${t('modal.caldav.manual_url_hint')}
        </p>
        <input type="text" id="manual-calendar-url"
               placeholder="https://apidata.googleusercontent.com/caldav/v2/primary/events/"
               value="${escapeHtml(creds.url)}"
               style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);
                      color:var(--text);border-radius:var(--radius-sm);font:inherit;font-size:13px;" />
        <div style="display:flex;gap:8px;margin-top:12px;">
          <button id="save-manual-calendar" style="flex:1;">${t('modal.caldav.connect')}</button>
          <button class="modal-close" style="flex:1;background:transparent;border:1px solid var(--border);">${t('common.cancel')}</button>
        </div>
      `;
      overlay
        .querySelector('#save-manual-calendar')
        .addEventListener('click', async () => {
          const href = overlay
            .querySelector('#manual-calendar-url')
            .value.trim();
          if (!href) return;
          const name =
            href.split('/').filter(Boolean).pop() || t('modal.caldav.empty');
          updateWidgetConfig(widgetId, {
            caldavCalendarHref: href,
            caldavCalendarName: name,
          }, true);
          overlay.remove();
          showNotification(t('modal.caldav.connected', { name }));
          await syncCalDAVEvents(widgetId);
        });
      overlay
        .querySelector('.modal-close')
        ?.addEventListener('click', () => overlay.remove());
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
      });
      return;
    }

    overlay.querySelector('.modal').innerHTML = `
      <h3>${t('modal.caldav.title')}</h3>
      <div class="caldav-calendar-list">
        ${calendars
          .map(
            (c, i) => `
          <button class="caldav-calendar-item" data-href="${escapeHtml(c.href)}" data-name="${escapeHtml(c.name)}">
            <span class="caldav-calendar-dot" style="background:hsl(${i * 137.508}, 60%, 60%)"></span>
            <span>${escapeHtml(c.name)}</span>
          </button>
        `,
          )
          .join('')}
      </div>
      <button class="modal-close" style="margin-top:12px;width:100%;background:transparent;border:1px solid var(--border);">${t('common.cancel')}</button>
    `;

    overlay.querySelectorAll('.caldav-calendar-item').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const href = btn.dataset.href;
        const name = btn.dataset.name;
        updateWidgetConfig(widgetId, {
          caldavCalendarHref: href,
          caldavCalendarName: name,
        });
        overlay.remove();
        showNotification(t('modal.caldav.connected', { name }));
        await syncCalDAVEvents(widgetId);
      });
    });
    overlay
      .querySelector('.modal-close')
      ?.addEventListener('click', () => overlay.remove());
  } catch (e) {
    overlay.querySelector('.modal').innerHTML = `
      <h3>${t('common.error')}</h3>
      <p>${escapeHtml(e.message)}</p>
      <button class="modal-close" style="margin-top:12px;width:100%;">${t('common.close')}</button>
    `;
    overlay
      .querySelector('.modal-close')
      .addEventListener('click', () => overlay.remove());
  }
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

export async function showCalDAVSyncSettings() {
  const existing = await loadCalDAVCredentialsDecrypted();
  const hasMasterPassword = !!(await getMasterPasswordHash());

  const menu = document.createElement('div');
  menu.className = 'modal-overlay';
  menu.innerHTML = `
    <div class="modal">
      <h3>${t('modal.caldav.settings_title')}</h3>
      <p style="margin: 0 0 12px; opacity: 0.7; font-size: 13px;">
        ${t('modal.caldav.encrypted_hint')}
      </p>
      <div class="caldav-form">
        <label>${t('modal.caldav.url')}</label>
        <input type="text" id="caldav-url" placeholder="https://caldav.example.com" value="${escapeHtml(existing?.url || '')}" />

        <label>${t('modal.caldav.username')}</label>
        <input type="text" id="caldav-username" value="${escapeHtml(existing?.username || '')}" />

        <label>${t('modal.caldav.password')}</label>
        <input type="password" id="caldav-password" autocomplete="new-password" value="${escapeHtml(existing?.password || '')}" />

        <button id="caldav-test">${t('modal.caldav.test')}</button>
        <div id="caldav-status" style="min-height: 1em; font-size: 13px;"></div>
      </div>
      <div style="display: flex; gap: 8px; margin-top: 12px;">
        <button id="save-caldav" style="flex: 1;">${t('modal.caldav.save')}</button>
        <button class="modal-close" id="close-caldav" style="flex: 1;">${t('common.cancel')}</button>
      </div>
      ${
        hasMasterPassword
          ? `
        <hr style="margin: 16px 0; border-color: var(--primary);" />
        <button id="change-master" style="width: 100%; background: transparent; border: 1px solid var(--primary);">
          ${t('modal.caldav.change_master')}
        </button>
      `
          : ''
      }
    </div>
  `;

  document.body.appendChild(menu);

  menu.querySelector('#caldav-test').addEventListener('click', async () => {
    const url = menu.querySelector('#caldav-url').value;
    const username = menu.querySelector('#caldav-username').value;
    const password = menu.querySelector('#caldav-password').value;
    const statusEl = menu.querySelector('#caldav-status');

    if (!url || !username || !password) {
      statusEl.textContent = t('modal.caldav.fill_all');
      statusEl.style.color = '';
      return;
    }

    statusEl.textContent = t('modal.caldav.checking');
    statusEl.style.color = '';

    try {
      const response = await browserMessaging.sendMessage({
        type: 'test',
        payload: { url, username, password },
      });

      if (response && response.success) {
        statusEl.textContent = t('modal.caldav.test_success');
        statusEl.style.color = '#4caf50';
      } else {
        statusEl.textContent = t('modal.caldav.test_fail', { error: response?.error || 'Unknown' });
        statusEl.style.color = 'var(--accent)';
      }
    } catch (err) {
      statusEl.textContent = t('modal.caldav.test_fail', { error: err.message });
      statusEl.style.color = 'var(--accent)';
    }
  });

  menu.querySelector('#save-caldav').addEventListener('click', async () => {
    const url = menu.querySelector('#caldav-url').value.trim();
    const username = menu.querySelector('#caldav-username').value;
    const password = menu.querySelector('#caldav-password').value;
    const statusEl = menu.querySelector('#caldav-status');

    if (!url || !username || !password) {
      statusEl.textContent = t('modal.caldav.fill_all');
      statusEl.style.color = 'var(--accent)';
      return;
    }

    const pw = await ensureMasterPassword();
    if (!pw) {
      statusEl.textContent = t('modal.caldav.save_cancelled');
      statusEl.style.color = 'var(--accent)';
      return;
    }

    try {
      const encryptedCreds = await encryptJson(
        { username, password },
        pw,
      );
      await saveCalDAVCredentials({ url, encryptedCreds });
      menu.remove();
      showNotification(t('modal.caldav.saved'));
    } catch (e) {
      statusEl.textContent = t('modal.caldav.encrypt_error', { message: e.message });
      statusEl.style.color = 'var(--accent)';
    }
  });

  const changeBtn = menu.querySelector('#change-master');
  if (changeBtn) {
    changeBtn.addEventListener('click', async () => {
      const ok = await showChangeMasterPasswordModal();
      if (ok) showNotification(t('modal.caldav.master_changed'));
    });
  }

  menu
    .querySelector('#close-caldav')
    .addEventListener('click', () => menu.remove());
  menu.addEventListener('click', (e) => {
    if (e.target === menu) menu.remove();
  });
}
