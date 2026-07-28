import { getActiveWorkspace } from '../state.js';
import { updateWorkspace } from '../workspaces.js';
import { renderWidgetGrid } from '../render/grid.js';

async function compressImage(file) {
  return new Promise((resolve) => {
    if (file.size <= 500 * 1024) {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
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
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target.result);
          reader.readAsDataURL(blob);
        },
        'image/jpeg',
        0.8,
      );
    };
    img.src = URL.createObjectURL(file);
  });
}

export function showBackgroundSettings() {
  const workspace = getActiveWorkspace();
  if (!workspace) return;

  const bg = workspace.background || { type: 'color', value: '#1a1a2e' };

  const menu = document.createElement('div');
  menu.className = 'modal-overlay';
  menu.innerHTML = `
    <div class="modal">
      <h3>Настройка фона</h3>
      <div class="bg-options">
        <label>
          <input type="radio" name="bg-type" value="color" ${bg.type === 'color' ? 'checked' : ''} />
          Сплошной цвет
        </label>
        <input type="color" id="bg-color" value="${bg.type === 'color' ? bg.value : '#1a1a2e'}" />

        <label>
          <input type="radio" name="bg-type" value="gradient" ${bg.type === 'gradient' ? 'checked' : ''} />
          Градиент
        </label>
        <input type="text" id="bg-gradient" placeholder="linear-gradient(135deg, #667eea 0%, #764ba2 100%)" value="${bg.type === 'gradient' ? bg.value : ''}" />

        <label>
          <input type="radio" name="bg-type" value="image" ${bg.type === 'image' ? 'checked' : ''} />
          Изображение
        </label>
        <input type="file" id="bg-image" accept="image/*" />
        ${bg.type === 'image' ? `<img src="${bg.value}" style="max-width: 100px; max-height: 100px;" />` : ''}
      </div>
      <button id="save-bg">Сохранить</button>
      <button class="modal-close" id="close-bg">Отмена</button>
    </div>
  `;

  document.body.appendChild(menu);

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
      } else {
        value = bg.value;
      }
    }

    await updateWorkspace(workspace.id, { background: { type, value } });
    menu.remove();
    renderWidgetGrid();
  });

  menu.querySelector('#close-bg').addEventListener('click', () => menu.remove());
  menu.addEventListener('click', (e) => {
    if (e.target === menu) menu.remove();
  });
}
