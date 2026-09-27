import { getActiveWorkspace } from '../state.js';
import { updateWorkspace } from '../workspaces.js';
import { renderWidgetGrid } from '../render/grid.js';
import { escapeHtml } from '../ui/escape.js';
import { state } from '../state.js';
import { t } from '../i18n/index.js';
import { getSettings, saveSettings } from '../storage.js';

// Built-in gradient presets. Shown as swatches; clicking one fills the
// pickers below with its colors, type and direction.
const GRADIENT_PRESETS = [
  { name: 'modal.bg.preset.sunset',   from: '#ff512f', to: '#dd2476', type: 'linear', angle: 45 },
  { name: 'modal.bg.preset.ocean',    from: '#2193b0', to: '#6dd5ed', type: 'linear', angle: 135 },
  { name: 'modal.bg.preset.amethyst', from: '#8e2de2', to: '#4a00e0', type: 'linear', angle: 90 },
  { name: 'modal.bg.preset.forest',   from: '#134e5e', to: '#71b280', type: 'linear', angle: 180 },
  { name: 'modal.bg.preset.peach',    from: '#ed4264', to: '#ffedbc', type: 'radial', angle: 0 },
];

const GRADIENT_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

const DEFAULT_GRADIENT = {
  type: 'linear',
  angle: 135,
  color1: '#ff512f',
  color2: '#dd2476',
};

export function composeGradient(type, angle, color1, color2) {
  if (type === 'radial') {
    return `radial-gradient(circle, ${color1}, ${color2})`;
  }
  return `linear-gradient(${angle}deg, ${color1}, ${color2})`;
}

// Read a stored gradient back into the picker fields (best effort — legacy
// values typed by hand may use any CSS, so snap the angle to the nearest
// supported step and take the first two hex colors).
export function parseGradientValue(value) {
  if (typeof value !== 'string') return null;
  const type = value.includes('radial-gradient')
    ? 'radial'
    : value.includes('linear-gradient')
      ? 'linear'
      : null;
  if (!type) return null;

  const angleMatch = value.match(/(-?\d+)deg/);
  const colors = value.match(/#[0-9a-fA-F]{3,8}/g) || [];

  return {
    type,
    angle: angleMatch ? parseInt(angleMatch[1], 10) : DEFAULT_GRADIENT.angle,
    color1: colors[0] || DEFAULT_GRADIENT.color1,
    color2: colors[1] || DEFAULT_GRADIENT.color2,
  };
}

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

  // Snap the stored gradient angle onto the closest offered direction.
  const parsedGradient = parseGradientValue(bg.value);
  const gradient = parsedGradient
    ? {
        ...parsedGradient,
        angle:
          Number.isFinite(parsedGradient.angle)
            ? ((Math.round(parsedGradient.angle / 45) * 45) % 360 + 360) % 360
            : DEFAULT_GRADIENT.angle,
      }
    : { ...DEFAULT_GRADIENT };

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
        <div class="bg-gradient-controls" id="bg-gradient-controls" ${bg.type === 'gradient' ? '' : 'hidden'}>
          <div class="bg-gradient-preview" id="grad-preview"></div>
          <div class="bg-preset-row">
            <span class="bg-gradient-label">${t('modal.bg.gradient_presets')}</span>
            ${GRADIENT_PRESETS
              .map((p, i) => `<button type="button" class="bg-preset" data-preset="${i}" title="${t(p.name)}" style="background:${composeGradient(p.type, 135, p.from, p.to)}"></button>`)
              .join('')}
          </div>
          <div class="bg-gradient-row">
            <div class="bg-gradient-field">
              <span>${t('modal.bg.gradient_type')}</span>
              <div class="bg-type-row">
                <label><input type="radio" name="grad-type" value="linear" ${gradient.type === 'linear' ? 'checked' : ''} /> ${t('modal.bg.gradient_linear')}</label>
                <label><input type="radio" name="grad-type" value="radial" ${gradient.type === 'radial' ? 'checked' : ''} /> ${t('modal.bg.gradient_radial')}</label>
              </div>
            </div>
            <div class="bg-gradient-field" id="grad-direction-field">
              <span>${t('modal.bg.gradient_direction')}</span>
              <select id="grad-direction">
                ${GRADIENT_ANGLES.map((a) => `<option value="${a}" ${gradient.angle === a ? 'selected' : ''}>${a}°</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="bg-gradient-row">
            <div class="bg-gradient-field">
              <span>${t('modal.bg.gradient_color1')}</span>
              <input type="color" id="grad-color1" value="${gradient.color1}" />
            </div>
            <div class="bg-gradient-field">
              <span>${t('modal.bg.gradient_color2')}</span>
              <input type="color" id="grad-color2" value="${gradient.color2}" />
            </div>
          </div>
        </div>

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

  // ── Gradient controls ───────────────────────────────────────────────
  const gradControls = menu.querySelector('#bg-gradient-controls');
  const gradPreview = menu.querySelector('#grad-preview');
  const gradColor1 = menu.querySelector('#grad-color1');
  const gradColor2 = menu.querySelector('#grad-color2');
  const gradDirection = menu.querySelector('#grad-direction');
  const directionField = menu.querySelector('#grad-direction-field');

  function readGradientType() {
    return menu.querySelector('input[name="grad-type"]:checked').value;
  }

  // Keep the preview, direction visibility and preset highlight in sync with
  // the current picker state.
  function syncGradientPreview() {
    const type = readGradientType();
    const angle = parseInt(gradDirection.value, 10);
    gradPreview.style.background = composeGradient(
      type,
      angle,
      gradColor1.value,
      gradColor2.value,
    );
    directionField.hidden = type === 'radial';

    menu.querySelectorAll('.bg-preset').forEach((btn) => {
      const preset = GRADIENT_PRESETS[Number(btn.dataset.preset)];
      btn.classList.toggle(
        'active',
        preset.type === type &&
          preset.from === gradColor1.value.toLowerCase() &&
          preset.to === gradColor2.value.toLowerCase(),
      );
    });
  }

  [gradColor1, gradColor2].forEach((input) =>
    input.addEventListener('input', syncGradientPreview),
  );
  gradDirection.addEventListener('change', syncGradientPreview);
  menu
    .querySelectorAll('input[name="grad-type"]')
    .forEach((radio) => radio.addEventListener('change', syncGradientPreview));

  menu.querySelectorAll('.bg-preset').forEach((btn) => {
    btn.addEventListener('click', () => {
      const preset = GRADIENT_PRESETS[Number(btn.dataset.preset)];
      gradColor1.value = preset.from;
      gradColor2.value = preset.to;
      menu.querySelector(
        `input[name="grad-type"][value="${preset.type}"]`,
      ).checked = true;
      gradDirection.value = String(preset.angle);
      syncGradientPreview();
    });
  });

  menu.querySelectorAll('input[name="bg-type"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      gradControls.hidden = radio.value !== 'gradient';
    });
  });

  syncGradientPreview();

  menu.querySelector('#save-bg').addEventListener('click', async () => {
    const type = menu.querySelector('input[name="bg-type"]:checked').value;
    let value = '';

    if (type === 'color') {
      value = menu.querySelector('#bg-color').value;
    } else if (type === 'gradient') {
      value = composeGradient(
        readGradientType(),
        parseInt(gradDirection.value, 10),
        gradColor1.value,
        gradColor2.value,
      );
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
