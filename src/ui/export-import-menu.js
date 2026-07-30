import { exportData, importData } from '../export-import.js';
import { downloadFile } from '../utils/download.js';
import { showPrompt, showNotification } from './modals.js';
import { showBookmarkImportModal } from '../bookmark-importer.js';
import { showCalDAVSyncSettings } from '../caldav/sync.js';

export function showExportImportMenu() {
  const menu = document.createElement('div');
  menu.className = 'modal-overlay';
  menu.innerHTML = `
    <div class="modal">
      <h3>Экспорт / Импорт</h3>
      <div class="export-options">
        <button id="export-plain">Экспорт (JSON)</button>
        <button id="export-encrypted">Экспорт с паролем</button>
        <button id="import-btn">Импорт</button>
        <input type="file" id="import-file" accept=".json" style="display: none;" />
      </div>
      <hr style="margin: 16px 0; border-color: var(--primary);" />
      <h4>Импорт из start.me</h4>
      <div class="export-options">
        <button id="import-bookmarks">📂 Импорт закладок (HTML)</button>
      </div>
      <hr style="margin: 16px 0; border-color: var(--primary);" />
      <h4>CalDAV Синхронизация</h4>
      <div class="caldav-options">
        <button id="caldav-settings">Настроить CalDAV</button>
      </div>
      <button class="modal-close" id="close-export">Закрыть</button>
    </div>
  `;

  document.body.appendChild(menu);

  menu.querySelector('#export-plain').addEventListener('click', async () => {
    const data = await exportData(false, null);
    downloadFile(data, 'ownspace-backup.json', 'application/json');
    menu.remove();
  });

  menu
    .querySelector('#export-encrypted')
    .addEventListener('click', async () => {
      const password = await showPrompt({
        title: 'Пароль для экспорта',
        message: 'Укажите пароль для шифрования файла',
        inputType: 'password',
        placeholder: 'Пароль',
        required: true,
      });
      if (!password) return;
      const data = await exportData(true, password);
      downloadFile(data, 'ownspace-backup-encrypted.json', 'application/json');
      menu.remove();
    });

  menu.querySelector('#import-btn').addEventListener('click', () => {
    menu.querySelector('#import-file').click();
  });

  menu.querySelector('#import-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        let password = null;
        const parsed = JSON.parse(event.target.result);
        if (parsed.encrypted) {
          password = await showPrompt({
            title: 'Пароль',
            message: 'Введите пароль для расшифровки',
            inputType: 'password',
            placeholder: 'Пароль',
            confirmText: 'Расшифровать',
            required: true,
          });
          if (password === null) return;
        }
        await importData(event.target.result, password);
        location.reload();
      } catch (err) {
        showNotification('Ошибка импорта: ' + err.message);
      }
    };
    reader.readAsText(file);
    menu.remove();
  });

  menu
    .querySelector('#import-bookmarks')
    .addEventListener('click', () => {
      menu.remove();
      showBookmarkImportModal();
    });

  menu
    .querySelector('#caldav-settings')
    .addEventListener('click', () => {
      menu.remove();
      showCalDAVSyncSettings();
    });

  menu
    .querySelector('#close-export')
    .addEventListener('click', () => menu.remove());
  menu.addEventListener('click', (e) => {
    if (e.target === menu) menu.remove();
  });
}
