import { getActiveWorkspace } from '../state.js';
import { updateWorkspace } from '../workspaces.js';
import { renderWidgetGrid } from '../render/grid.js';
import { escapeHtml } from '../ui/escape.js';
import { state } from '../state.js';
import { t } from '../i18n/index.js';
import { getSettings, saveSettings } from '../storage.js';

async function compressImage(file) {
  return new Promise((resolve, reject) => {
    if (file.size <= 500 * 1024) {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
      return;
    }

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      const maxDim = 1920;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = (height / width) * maxDim;
          width = maxDim;
        } else {
          width = (width / height) * maxDim;
          height = maxDim;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Failed to compress image'));
            return;
          }
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target.result);
          reader.onerror = () => reject(new Error('Failed to read compressed image'));
          reader.readAsDataURL(blob);
        },
        'image/jpeg',
        0.8,
      );
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
}

export async function showBackgroundSettings() {
  const workspace = getActiveWorkspace();
  if (!workspace) return;

  const bg = workspace.background || { type: 'color', value: '#1a1a2e' };
  const settings = await getSettings();

  // Global widget appearance. The settings are global by design — no opt-in
  // toggle — so the color picker defaults to the current theme's surface
  // color, which keeps the widgets looking unchanged until the user picks
  // something else.
  const surface = getComputedStyle(document.documentElement)
    .getPropertyValue('--surface')
    .trim();
  const savedColor = settings.widgetBgColor || surface;
  const transparency = settings.widgetTransparency != null
    ? settings.widgetTransparency
    : 0;

  const menu = document.createElement('div');
  menu.className = 'modal-overlay';
  menu.innerHTML = `
    <div class="modal">
      <h3>${t('modal.bg.title')}</h3>
      <div class="bg-options">
        <label>
          <input type="radio" name="bg-type" value="color" ${bg.type === 'color' ? 'checked' : ''} />
          ${t('modal.bg.color')}
        </label>
        <input type="color" id="bg-color" value="${bg.type === 'color' ? bg.value : '#1a1a2e'}" />

        <label>
          <input type="radio" name="bg-type" value="gradient" ${bg.type === 'gradient' ? 'checked' : ''} />
          ${t('modal.bg.gradient')}
        </label>
        <input type="text" id="bg-gradient" placeholder="${t('modal.bg.gradient_placeholder')}" value="${escapeHtml(bg.type === 'gradient' ? bg.value : '')}" />

        <label>
          <input type="radio" name="bg-type" value="image" ${bg.type === 'image' ? 'checked' : ''} />
          ${t('modal.bg.image')}
        </label>
        <input type="file" id="bg-image" accept="image/*" />
        ${bg.type === 'image' ? `<img src="${escapeHtml(bg.value)}" style="max-width: 100px; max-height: 100px;" />` : ''}
      </div>
      <h3 class="modal-title">${t('modal.widget.appearance_title')}</h3>
      <form class="widget-settings-form">
        <label class="event-field">
          <span>${t('modal.widget.bg_color')}</span>
          <input type="color" id="widget-bgcolor" value="${escapeHtml(savedColor)}" />
        </label>
        <label class="event-field">
          <span>${t('modal.widget.transparency')}</span>
          <div class="widget-transparency-row">
            <input type="range" id="widget-transparency" min="0" max="100" value="${transparency}" />
            <span id="widget-transparency-value">${transparency}%</span>
          </div>
        </label>
      </form>
      <button class="modal-close" id="save-bg">${t('modal.bg.save')}</button>
      <button class="modal-close" id="close-bg">${t('common.cancel')}</button>
    </div>
  `;

  document.body.appendChild(menu);

  const bgcolorInput = menu.querySelector('#widget-bgcolor');
  const transparencyInput = menu.querySelector('#widget-transparency');
  const transparencyValue = menu.querySelector('#widget-transparency-value');

  transparencyInput.addEventListener('input', () => {
    transparencyValue.textContent = `${transparencyInput.value}%`;
  });

  menu.querySelector('#save-bg').addEventListener('click', async () => {
    const type = menu.querySelector('input[name="bg-type"]:checked').value;
    let value = '';

    if (type === 'color') {
      value = menu.querySelector('#bg-color').value;
    } else if (type === 'gradient') {
      value = menu.querySelector('#bg-gradient').value;
    } else if (type === 'image') {
      const fileInput = menu.querySelector('#bg-image');
      if (fileInput.files.length > 0) {
        value = await compressImage(fileInput.files[0]);
        // ponytail: check storage budget — base64 images × N workspaces can exceed quota
        const estBytes = new Blob([value]).size;
        const otherBgs = state.workspaces
          .filter((ws) => ws.id !== workspace.id && ws.background?.type === 'image')
          .reduce((sum, ws) => sum + new Blob([ws.background.value]).size, 0);
        const totalEst = estBytes + otherBgs;
        const QUOTA_BYTES = 10 * 1024 * 1024;
        if (totalEst > QUOTA_BYTES * 0.9) {
          const usedMB = (totalEst / 1024 / 1024).toFixed(1);
          const limitMB = (QUOTA_BYTES / 1024 / 1024).toFixed(0);
          if (!confirm(t('modal.bg.quota_warning', { used: usedMB, limit: limitMB }))) {
            return;
          }
        }
      } else {
        value = bg.value;
      }
    }

    await updateWorkspace(workspace.id, { background: { type, value } });

    // Global widget appearance (overrides per-widget styles). The slider is a
    // transparency level (100 = fully transparent), stored as-is.
    const newSettings = {
      ...settings,
      widgetBgColor: bgcolorInput.value,
      widgetTransparency: parseInt(transparencyInput.value, 10),
    };
    window._pluginSettings = newSettings;
    await saveSettings(newSettings);

    menu.remove();
    renderWidgetGrid();
  });

  menu.querySelector('#close-bg').addEventListener('click', () => menu.remove());
  menu.addEventListener('click', (e) => {
    if (e.target === menu) menu.remove();
  });
}
