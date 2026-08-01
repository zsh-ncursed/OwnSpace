import { escapeHtml } from './escape.js';
import { t } from '../i18n/index.js';

export function showNotification(message) {
  const existing = document.querySelector('.import-notification');
  if (existing) existing.remove();

  const notification = document.createElement('div');
  notification.className = 'import-notification';
  notification.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: var(--accent);
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    z-index: 2000;
    animation: fadeIn 0.3s ease;
  `;
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.animation = 'fadeOut 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

export function showConfirm({
  title,
  message,
  confirmText,
  cancelText,
  danger = false,
} = {}) {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-overlay';
    backdrop.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="modal-title" id="modal-title">${escapeHtml(title || t('modal.confirm.default_title'))}</div>
        ${message ? `<div class="modal-message">${escapeHtml(message)}</div>` : ''}
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary modal-cancel">${escapeHtml(cancelText || t('common.cancel'))}</button>
          <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'} modal-ok">${escapeHtml(confirmText || t('common.ok'))}</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);
    const okBtn = backdrop.querySelector('.modal-ok');
    okBtn.focus();
    const close = (val) => {
      backdrop.remove();
      document.removeEventListener('keydown', onKey);
      resolve(val);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close(false);
      else if (
        e.key === 'Enter' &&
        document.activeElement !== backdrop.querySelector('.modal-cancel')
      )
        close(true);
    };
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close(false);
    });
    backdrop.querySelector('.modal-cancel').addEventListener('click', () =>
      close(false),
    );
    okBtn.addEventListener('click', () => close(true));
    document.addEventListener('keydown', onKey);
  });
}

export function showPrompt({
  title,
  message,
  defaultValue = '',
  placeholder = '',
  confirmText,
  cancelText,
  inputType = 'text',
  required = false,
} = {}) {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-overlay';
    backdrop.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="modal-title" id="modal-title">${escapeHtml(title || t('modal.prompt.default_title'))}</div>
        ${message ? `<div class="modal-message">${escapeHtml(message)}</div>` : ''}
        <input type="${inputType}" class="modal-input" value="${escapeHtml(defaultValue)}" placeholder="${escapeHtml(placeholder)}" />
        <div class="modal-error" hidden></div>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary modal-cancel">${escapeHtml(cancelText || t('common.cancel'))}</button>
          <button type="button" class="btn btn-primary modal-ok">${escapeHtml(confirmText || t('common.ok'))}</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);
    const input = backdrop.querySelector('.modal-input');
    const errorEl = backdrop.querySelector('.modal-error');
    input.focus();
    input.select();
    const close = (val) => {
      backdrop.remove();
      document.removeEventListener('keydown', onKey);
      resolve(val);
    };
    const submit = () => {
      const v = input.value;
      if (required && !v) {
        errorEl.textContent = t('modal.prompt.required');
        errorEl.hidden = false;
        input.focus();
        return;
      }
      close(v);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close(null);
      else if (e.key === 'Enter') submit();
    };
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close(null);
    });
    backdrop.querySelector('.modal-cancel').addEventListener('click', () =>
      close(null),
    );
    backdrop.querySelector('.modal-ok').addEventListener('click', submit);
    document.addEventListener('keydown', onKey);
  });
}

export function showRecurringDeleteChoice() {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-overlay';
    backdrop.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-title">${t('modal.recurring.title')}</div>
        <div class="modal-message">${t('modal.recurring.message')}</div>
        <div class="modal-actions" style="flex-direction: column; gap: 8px;">
          <button type="button" id="choice-all" class="btn btn-danger">${t('modal.recurring.all')}</button>
          <button type="button" id="choice-one" class="btn btn-primary">${t('modal.recurring.one')}</button>
          <button type="button" id="choice-cancel" class="btn btn-secondary">${t('common.cancel')}</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);
    const close = (val) => {
      backdrop.remove();
      resolve(val);
    };
    backdrop
      .querySelector('#choice-all')
      .addEventListener('click', () => close('all'));
    backdrop
      .querySelector('#choice-one')
      .addEventListener('click', () => close('one'));
    backdrop
      .querySelector('#choice-cancel')
      .addEventListener('click', () => close(null));
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close(null);
    });
  });
}
