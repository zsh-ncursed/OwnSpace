// Import UI and logic for bookmarks from HTML

// Show import modal
function showImportModal() {
  console.log('[Importer] showImportModal called');
  // Remove existing modal
  const existing = document.getElementById('import-modal');
  if (existing) existing.remove();
  
  const modal = document.createElement('div');
  modal.id = 'import-modal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal import-modal-content">
      <h3>Импорт закладок</h3>
      <p style="margin: 8px 0 16px; color: var(--text); opacity: 0.7;">
        Загрузите HTML файл, экспортированный из start.me или браузера
      </p>
      
      <input type="file" id="import-file-input" accept=".html,.htm" style="display: none;">
      <button id="select-file-btn" class="add-widget-btn" style="width: 100%; margin: 0;">
        📂 Выбрать HTML файл
      </button>
      
      <div id="import-preview" style="display: none; margin-top: 16px;">
        <h4 style="margin-bottom: 8px;">Найдено:</h4>
        <div id="import-stats"></div>
        <div id="import-widget-list" style="margin: 12px 0;"></div>
        
        <div style="margin: 16px 0;">
          <label style="display: block; margin-bottom: 8px;">Куда импортировать:</label>
          <select id="import-target" class="widget-title-input" style="width: 100%;">
            <option value="new">Создать новый виджет</option>
          </select>
        </div>
        
        <div id="import-error" style="color: var(--accent); margin: 8px 0; display: none;"></div>
        
        <div style="display: flex; gap: 8px; margin-top: 16px;">
          <button id="import-confirm" class="add-widget-btn" style="flex: 1; margin: 0;">Импортировать</button>
          <button id="import-cancel" class="modal-close" style="margin: 0;">Отмена</button>
        </div>
      </div>
      
      <button class="modal-close" style="width: 100%; margin-top: 12px;">Закрыть</button>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Event listeners
  const fileInput = document.getElementById('import-file-input');
  const selectBtn = document.getElementById('select-file-btn');
  const confirmBtn = document.getElementById('import-confirm');
  const cancelBtn = document.getElementById('import-cancel');
  const closeBtn = modal.querySelector('.modal-close');
  
  // Click button to open file picker
  selectBtn.addEventListener('click', () => {
    console.log('[Importer] Select button clicked, opening file picker');
    fileInput.click();
  });
  
  // Wait a bit for scripts to fully load, then enable button
  setTimeout(() => {
    console.log('[Importer] Modal ready, select file button enabled');
  }, 100);
  
  // File selected
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) processImportFile(file);
  });
  
  // Confirm import
  confirmBtn.addEventListener('click', () => {
    const selectedWidget = document.getElementById('import-target').value;
    const targetWidgetId = selectedWidget === 'new' ? null : selectedWidget;
    executeImport(window.currentImportData, targetWidgetId);
  });
  
  // Cancel / Close
  cancelBtn.addEventListener('click', () => closeImportModal());
  closeBtn.addEventListener('click', () => closeImportModal());
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeImportModal();
  });
  
  // Store reference
  window.importModal = modal;
}

// Process imported file
function processImportFile(file) {
  const reader = new FileReader();
  
  reader.onload = (e) => {
    const html = e.target.result;
    const result = BookmarkParser.parseHtml(html);
    
    if (result.bookmarks.length === 0) {
      showImportError('Не удалось найти закладки в файле. Проверьте формат.');
      return;
    }
    
    // Validate
    const { valid, invalid } = BookmarkParser.validateBookmarks(result.bookmarks);
    
    if (valid.length === 0) {
      showImportError('Все найденные закладки имеют невалидные URL.');
      return;
    }
    
    // Store for import
    window.currentImportData = {
      bookmarks: valid,
      widgetGroups: result.widgetGroups,
      format: result.format,
      invalidCount: invalid.length
    };
    
    // Show preview
    showImportPreview(result);
  };
  
  reader.onerror = () => {
    showImportError('Ошибка при чтении файла.');
  };
  
  reader.readAsText(file);
}

// Show import preview
function showImportPreview(result) {
  const preview = document.getElementById('import-preview');
  const stats = document.getElementById('import-stats');
  const widgetList = document.getElementById('import-widget-list');
  const targetSelect = document.getElementById('import-target');
  
  stats.innerHTML = `
    <div style="display: flex; gap: 16px; flex-wrap: wrap;">
      <span>✅ <strong>${result.bookmarks.length}</strong> закладок</span>
      ${result.widgetGroups.length > 1 ? `<span>📁 <strong>${result.widgetGroups.length}</strong> виджетов</span>` : ''}
      ${window.currentImportData.invalidCount > 0 ? `<span style="color: var(--accent);">⚠️ ${window.currentImportData.invalidCount} пропущено</span>` : ''}
    </div>
  `;
  
  // Populate widget list if multiple groups
  if (result.widgetGroups.length > 1) {
    widgetList.innerHTML = `
      <p style="margin-bottom: 8px; font-size: 14px; opacity: 0.8;">Виджеты для импорта:</p>
      <ul style="list-style: none; padding: 0; max-height: 150px; overflow-y: auto;">
        ${result.widgetGroups.map(wg => `
          <li style="padding: 4px 0; border-bottom: 1px solid var(--primary);">
            📁 ${escapeHtml(wg.name)} — ${wg.bookmarks.length} закладок
          </li>
        `).join('')}
      </ul>
    `;
  } else {
    widgetList.innerHTML = '';
  }
  
  // Populate target select with existing bookmark widgets
  const workspace = window.state?.workspaces?.find(ws => ws.id === window.state.activeWorkspaceId);
  if (workspace) {
    const bookmarkWidgets = workspace.widgets.filter(w => w.type === 'bookmarks');
    bookmarkWidgets.forEach(w => {
      const opt = document.createElement('option');
      opt.value = w.id;
      opt.textContent = `📁 ${w.config.title || 'Закладки'}`;
      targetSelect.appendChild(opt);
    });
  }
  
  preview.style.display = 'block';
}

// Show import error
function showImportError(message) {
  const error = document.getElementById('import-error');
  error.textContent = message;
  error.style.display = 'block';
}

// Execute import
function executeImport(data, targetWidgetId) {
  const { bookmarks, widgetGroups } = data;
  
  console.log('[Importer] executeImport called, window.state:', typeof window.state);
  console.log('[Importer] window.state.activeWorkspaceId:', window.state?.activeWorkspaceId);
  console.log('[Importer] window.state.workspaces length:', window.state?.workspaces?.length);
  
  // Get workspace
  const workspace = window.state?.workspaces?.find(ws => ws.id === window.state.activeWorkspaceId);
  if (!workspace) {
    console.log('[Importer] Workspace not found, using first available');
    // Fallback: try to find any workspace
    if (window.state?.workspaces?.length > 0) {
      window.state.activeWorkspaceId = window.state.workspaces[0].id;
      console.log('[Importer] Set activeWorkspaceId to first workspace');
    }
    const ws = window.state?.workspaces?.find(ws => ws.id === window.state.activeWorkspaceId);
    if (!ws) {
      showImportError('Не удалось найти активное пространство.');
      return;
    }
    // Use ws instead of workspace
    return executeImportToWorkspace(data, ws, targetWidgetId);
  }
  
  executeImportToWorkspace(data, workspace, targetWidgetId);
}

function executeImportToWorkspace(data, workspace, targetWidgetId) {
  const { bookmarks, widgetGroups } = data;
  
  console.log('[Importer] Importing to workspace:', workspace.name);
  
  if (targetWidgetId) {
    // Add to existing widget
    const widget = workspace.widgets.find(w => w.id === targetWidgetId);
    if (widget) {
      const existingUrls = new Set(widget.config.bookmarks.map(b => b.url));
      const newBookmarks = bookmarks.filter(b => !existingUrls.has(b.url));
      widget.config.bookmarks = [...widget.config.bookmarks, ...newBookmarks];
      
      window.saveAndRender().then(() => {
        closeImportModal();
        showNotification(`Импортировано ${newBookmarks.length} закладок`);
      });
    }
  } else {
    // Create widgets for each group
    if (widgetGroups.length > 1) {
      // Create multiple widgets
      widgetGroups.forEach(wg => {
        const newWidget = {
          id: crypto.randomUUID(),
          type: 'bookmarks',
          config: {
            title: wg.name || 'Импорт',
            bookmarks: wg.bookmarks
          }
        };
        workspace.widgets.push(newWidget);
        console.log('[Importer] Created widget:', wg.name, 'with', wg.bookmarks.length, 'bookmarks');
      });
    } else {
      // Create single widget with all bookmarks
      const newWidget = {
        id: crypto.randomUUID(),
        type: 'bookmarks',
        config: {
          title: widgetGroups[0]?.name || 'Импорт закладок',
          bookmarks: bookmarks
        }
      };
      workspace.widgets.push(newWidget);
      console.log('[Importer] Created single widget with', bookmarks.length, 'bookmarks');
    }
    
    window.saveAndRender().then(() => {
      closeImportModal();
      const total = bookmarks.length;
      const count = widgetGroups.length > 1 ? widgetGroups.length : 1;
      showNotification(`Создано ${count} виджет(ов) с ${total} закладками`);
    });
  }
}

// Close import modal
function closeImportModal() {
  const modal = document.getElementById('import-modal');
  if (modal) modal.remove();
  delete window.currentImportData;
}

// Show notification
function showNotification(message) {
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

// Escape HTML helper
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Export for use by app.js
window.BookmarkImporter = {
  showImportModal,
  closeImportModal
};