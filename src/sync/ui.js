/**
 * Sync UI — the "Связать с другим ПК" wizard and approval dialog.
 *
 * Flow (all steps live in one modal so nothing jumps around):
 *
 *   SLAVE side (button "Связать с другим ПК"):
 *     1. user enters a pairing code (short, typed on both devices) and
 *        a name for this device
 *     2. app generates the offer blob → shown with a Copy button
 *     3. user pastes it on the master, then pastes the master's answer back
 *     4. connecting… paired; state arrives from the master
 *
 *   MASTER side (separate entry, "У меня есть код сопряжения"):
 *     1. user enters the same pairing code
 *     2. pastes the slave's blob → app answers with its own blob to copy back
 *     3. on connect: approval dialog "Связать с этим ПК?" — approve → push
 *
 * The master's approval is the "запрос на связывание" from the spec: it is the
 * side that decides, therefore it becomes the master.
 */

import { showConfirm, showNotification } from '../ui/modals.js';
import { escapeHtml } from '../ui/escape.js';
import { t } from '../i18n/index.js';
import { getDeviceId, loadPairings, removePairing, addPairing, ROLES } from './state.js';
import { createSyncManager } from './manager.js';

let _manager = null;
let _statusEl = null;

function getManager() {
  if (!_manager) {
    _manager = createSyncManager({
      onRequest: async ({ peerName }) => {
        return showConfirm({
          title: t('sync.approve_title'),
          message: t('sync.approve_message', { name: peerName }),
          confirmText: t('sync.approve_yes'),
          cancelText: t('sync.approve_no'),
        });
      },
      onStatus: (status, detail) => {
        if (_statusEl) _statusEl.textContent = `${label(status)} — ${detail || ''}`.trim();
      },
      onCode: () => { /* codes are handled inline by the wizard */ },
    });
  }
  return _manager;
}

function label(status) {
  return (
    {
      idle: t('sync.status_idle'),
      pending: t('sync.status_pending'),
      paired: t('sync.status_paired'),
      syncing: t('sync.status_syncing'),
      error: t('sync.status_error'),
    }[status] || status
  );
}

/**
 * Entry point for the "Связать с другим ПК" button — slave side.
 */
export async function showPairWizard() {
  const mgr = getManager();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width: 560px;">
      <h3>${t('sync.title')}</h3>
      <p class="sync-intro">${t('sync.intro_slave')}</p>

      <label class="event-field">
        <span>${t('sync.device_name_label')}</span>
        <input type="text" id="sync-name" placeholder="${t('sync.device_name_placeholder')}" maxlength="32" />
      </label>

      <label class="event-field">
        <span>${t('sync.code_label')}</span>
        <input type="text" id="sync-code" placeholder="${t('sync.code_placeholder')}" maxlength="32" autocomplete="off" />
      </label>

      <div id="sync-step-code" hidden>
        <label class="event-field">
          <span>${t('sync.your_code_label')}</span>
          <div class="sync-code-row">
            <textarea id="sync-blob-out" readonly rows="3" class="sync-blob"></textarea>
            <button type="button" class="btn btn-secondary" id="sync-copy">${t('sync.copy')}</button>
          </div>
          <span class="sync-hint">${t('sync.step2_hint')}</span>
        </label>

        <label class="event-field">
          <span>${t('sync.paste_answer_label')}</span>
          <textarea id="sync-blob-in" rows="3" class="sync-blob" placeholder="${t('sync.paste_answer_placeholder')}"></textarea>
        </label>
      </div>

      <div class="sync-status" id="sync-status" hidden></div>

      <div class="modal-actions">
        <button type="button" class="btn btn-secondary modal-cancel">${t('common.cancel')}</button>
        <button type="button" class="btn btn-primary" id="sync-next">${t('sync.next')}</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  _statusEl = overlay.querySelector('#sync-status');

  const nameInput = overlay.querySelector('#sync-name');
  const codeInput = overlay.querySelector('#sync-code');
  const stepCode = overlay.querySelector('#sync-step-code');
  const blobOut = overlay.querySelector('#sync-blob-out');
  const blobIn = overlay.querySelector('#sync-blob-in');
  const nextBtn = overlay.querySelector('#sync-next');
  const statusEl = overlay.querySelector('#sync-status');

  const close = () => {
    overlay.remove();
    _statusEl = null;
  };
  overlay.querySelector('.modal-cancel').addEventListener('click', () => {
    getManager().close();
    close();
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      getManager().close();
      close();
    }
  });

  // Step 1 → 2: validate code, generate offer.
  nextBtn.addEventListener('click', async () => {
    const code = codeInput.value.trim();
    if (!code) {
      showNotification(t('sync.error_no_code'));
      codeInput.focus();
      return;
    }
    if (blobOut.value) {
      // Step 3: apply the master's answer.
      const answer = blobIn.value.trim();
      if (!answer) {
        showNotification(t('sync.error_no_answer'));
        blobIn.focus();
        return;
      }
      try {
        statusEl.hidden = false;
        await mgr.applyAnswer(answer);
      } catch (e) {
        showNotification(t('sync.error_connect', { message: e.message }));
      }
      return;
    }
    try {
      nextBtn.disabled = true;
      const { blob } = await mgr.startPairing({
        name: nameInput.value.trim(),
        code,
      });
      blobOut.value = blob;
      stepCode.hidden = false;
      nextBtn.textContent = t('sync.connect');
      nextBtn.disabled = false;
    } catch (e) {
      nextBtn.disabled = false;
      showNotification(t('sync.error_offer', { message: e.message }));
    }
  });

  overlay.querySelector('#sync-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(blobOut.value);
      showNotification(t('sync.copied'));
    } catch {
      blobOut.select();
      document.execCommand?.('copy');
    }
  });
}

/**
 * Entry point for the master side ("I have the code" / "Принять запрос").
 */
export async function showAcceptWizard() {
  const mgr = getManager();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width: 560px;">
      <h3>${t('sync.accept_title')}</h3>
      <p class="sync-intro">${t('sync.intro_master')}</p>

      <label class="event-field">
        <span>${t('sync.code_label')}</span>
        <input type="text" id="sync-code" placeholder="${t('sync.code_placeholder')}" maxlength="32" autocomplete="off" />
      </label>

      <label class="event-field">
        <span>${t('sync.paste_offer_label')}</span>
        <textarea id="sync-blob-in" rows="3" class="sync-blob" placeholder="${t('sync.paste_offer_placeholder')}"></textarea>
      </label>

      <div id="sync-step-answer" hidden>
        <label class="event-field">
          <span>${t('sync.answer_label')}</span>
          <div class="sync-code-row">
            <textarea id="sync-blob-out" readonly rows="3" class="sync-blob"></textarea>
            <button type="button" class="btn btn-secondary" id="sync-copy">${t('sync.copy')}</button>
          </div>
          <span class="sync-hint">${t('sync.answer_hint')}</span>
        </label>
      </div>

      <div class="sync-status" id="sync-status" hidden></div>

      <div class="modal-actions">
        <button type="button" class="btn btn-secondary modal-cancel">${t('common.cancel')}</button>
        <button type="button" class="btn btn-primary" id="sync-next">${t('sync.accept')}</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  _statusEl = overlay.querySelector('#sync-status');

  const codeInput = overlay.querySelector('#sync-code');
  const blobIn = overlay.querySelector('#sync-blob-in');
  const stepAnswer = overlay.querySelector('#sync-step-answer');
  const blobOut = overlay.querySelector('#sync-blob-out');
  const nextBtn = overlay.querySelector('#sync-next');
  const statusEl = overlay.querySelector('#sync-status');

  const close = () => {
    overlay.remove();
    _statusEl = null;
  };
  overlay.querySelector('.modal-cancel').addEventListener('click', () => {
    getManager().close();
    close();
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      getManager().close();
      close();
    }
  });

  nextBtn.addEventListener('click', async () => {
    const code = codeInput.value.trim();
    const offer = blobIn.value.trim();
    if (!code || !offer) {
      showNotification(!code ? t('sync.error_no_code') : t('sync.error_no_offer'));
      (!code ? codeInput : blobIn).focus();
      return;
    }
    try {
      statusEl.hidden = false;
      const { blob } = await mgr.receiveOffer({ blob: offer, code });
      blobOut.value = blob;
      stepAnswer.hidden = false;
      nextBtn.disabled = true;
      nextBtn.textContent = t('sync.waiting');
    } catch (e) {
      nextBtn.disabled = false;
      showNotification(t('sync.error_offer', { message: e.message }));
    }
  });

  overlay.querySelector('#sync-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(blobOut.value);
      showNotification(t('sync.copied'));
    } catch {
      blobOut.select();
      document.execCommand?.('copy');
    }
  });
}

/**
 * List of paired devices with an Unlink button — shown on the settings page.
 */
export async function renderPairedDevices(container) {
  const { pairings } = await loadPairings();
  container.innerHTML = pairings.length
    ? pairings
        .map(
          (p) => `
      <div class="sync-pairing" data-id="${p.id}">
        <span class="sync-pairing-icon">${ICONS.action(p.role === ROLES.MASTER ? 'upload' : 'download')}</span>
        <div class="sync-pairing-body">
          <div class="sync-pairing-name">${escapeHtml(p.name)}</div>
          <div class="sync-pairing-role">${p.role === ROLES.MASTER ? t('sync.role_master_short') : t('sync.role_slave_short')}</div>
        </div>
        <button type="button" class="btn btn-secondary sync-unlink" data-id="${p.id}">${t('sync.unlink')}</button>
      </div>
    `,
        )
        .join('')
    : `<p class="sync-empty">${t('sync.no_pairings')}</p>`;

  container.querySelectorAll('.sync-unlink').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      await removePairing(id);
      renderPairedDevices(container);
      showNotification(t('sync.unlinked'));
    });
  });
}

export { ROLES, loadPairings, addPairing, getDeviceId };
