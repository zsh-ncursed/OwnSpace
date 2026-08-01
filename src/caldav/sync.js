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
        'CalDAV: ' + (response?.error || 'Ошибка синхронизации'),
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
    showNotification('CalDAV: ' + e.message);
    return false;
  }
}

export async function showCalDAVCalendarPicker(widgetId) {
  const creds = await loadCalDAVCredentialsDecrypted();
  if (!creds) {
    showNotification(
      'Сначала настройте CalDAV (Экспорт/Импорт → Настроить CalDAV)',
    );
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal caldav-picker-modal">
      <h3>Выберите календарь</h3>
      <p style="margin: 0 0 12px; opacity: 0.7; font-size: 13px;">Поиск календарей...</p>
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
        <h3>Введите URL календаря</h3>
        <p style="margin:0 0 8px;opacity:0.7;font-size:13px;">
          Сервер не поддерживает автоопределение календарей.
          Введите URL календаря вручную:
        </p>
        <input type="text" id="manual-calendar-url"
               placeholder="https://apidata.googleusercontent.com/caldav/v2/primary/events/"
               value="${escapeHtml(creds.url)}"
               style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);
                      color:var(--text);border-radius:var(--radius-sm);font:inherit;font-size:13px;" />
        <div style="display:flex;gap:8px;margin-top:12px;">
          <button id="save-manual-calendar" style="flex:1;">Подключить</button>
          <button class="modal-close" style="flex:1;background:transparent;border:1px solid var(--border);">Отмена</button>
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
            href.split('/').filter(Boolean).pop() || 'Календарь';
          updateWidgetConfig(widgetId, {
            caldavCalendarHref: href,
            caldavCalendarName: name,
          }, true);
          overlay.remove();
          showNotification(`CalDAV: подключен «${name}»`);
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
      <h3>Выберите календарь</h3>
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
      <button class="modal-close" style="margin-top:12px;width:100%;background:transparent;border:1px solid var(--border);">Отмена</button>
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
        showNotification(`CalDAV: подключен «${name}»`);
        await syncCalDAVEvents(widgetId);
      });
    });
    overlay
      .querySelector('.modal-close')
      ?.addEventListener('click', () => overlay.remove());
  } catch (e) {
    overlay.querySelector('.modal').innerHTML = `
      <h3>Ошибка</h3>
      <p>${escapeHtml(e.message)}</p>
      <button class="modal-close" style="margin-top:12px;width:100%;">Закрыть</button>
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
      <h3>Настройка CalDAV</h3>
      <p style="margin: 0 0 12px; opacity: 0.7; font-size: 13px;">
        🔒 Учётные данные шифруются мастер-паролем (AES-GCM).
      </p>
      <div class="caldav-form">
        <label>URL сервера:</label>
        <input type="text" id="caldav-url" placeholder="https://caldav.example.com" value="${escapeHtml(existing?.url || '')}" />

        <label>Имя пользователя:</label>
        <input type="text" id="caldav-username" value="${escapeHtml(existing?.username || '')}" />

        <label>Пароль:</label>
        <input type="password" id="caldav-password" autocomplete="new-password" value="${escapeHtml(existing?.password || '')}" />

        <button id="caldav-test">Проверить подключение</button>
        <div id="caldav-status" style="min-height: 1em; font-size: 13px;"></div>
      </div>
      <div style="display: flex; gap: 8px; margin-top: 12px;">
        <button id="save-caldav" style="flex: 1;">Сохранить</button>
        <button class="modal-close" id="close-caldav" style="flex: 1;">Отмена</button>
      </div>
      ${
        hasMasterPassword
          ? `
        <hr style="margin: 16px 0; border-color: var(--primary);" />
        <button id="change-master" style="width: 100%; background: transparent; border: 1px solid var(--primary);">
          🔑 Сменить мастер-пароль
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
      statusEl.textContent = 'Заполните все поля';
      statusEl.style.color = '';
      return;
    }

    statusEl.textContent = 'Проверка...';
    statusEl.style.color = '';

    try {
      const response = await browserMessaging.sendMessage({
        type: 'test',
        payload: { url, username, password },
      });

      if (response && response.success) {
        statusEl.textContent = 'Подключение успешно!';
        statusEl.style.color = '#4caf50';
      } else {
        statusEl.textContent =
          'Ошибка: ' + (response?.error || 'Unknown');
        statusEl.style.color = 'var(--accent)';
      }
    } catch (err) {
      statusEl.textContent = 'Ошибка: ' + err.message;
      statusEl.style.color = 'var(--accent)';
    }
  });

  menu.querySelector('#save-caldav').addEventListener('click', async () => {
    const url = menu.querySelector('#caldav-url').value.trim();
    const username = menu.querySelector('#caldav-username').value;
    const password = menu.querySelector('#caldav-password').value;
    const statusEl = menu.querySelector('#caldav-status');

    if (!url || !username || !password) {
      statusEl.textContent = 'Заполните все поля';
      statusEl.style.color = 'var(--accent)';
      return;
    }

    const pw = await ensureMasterPassword();
    if (!pw) {
      statusEl.textContent =
        'Сохранение отменено: требуется мастер-пароль';
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
      showNotification('CalDAV сохранён (зашифровано)');
    } catch (e) {
      statusEl.textContent = 'Ошибка шифрования: ' + e.message;
      statusEl.style.color = 'var(--accent)';
    }
  });

  const changeBtn = menu.querySelector('#change-master');
  if (changeBtn) {
    changeBtn.addEventListener('click', async () => {
      const ok = await showChangeMasterPasswordModal();
      if (ok) showNotification('Мастер-пароль изменён');
    });
  }

  menu
    .querySelector('#close-caldav')
    .addEventListener('click', () => menu.remove());
  menu.addEventListener('click', (e) => {
    if (e.target === menu) menu.remove();
  });
}
