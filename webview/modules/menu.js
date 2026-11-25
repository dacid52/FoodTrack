// --- menu.js ---
// Menu view & management logic
function renderMenuItems(animateList) {
  ensureMenuDialogs();
  const list = document.getElementById('menu-items-list');
  if (!list) return;
  const query = state.menuSearchQuery.toLowerCase();
  const products = state.products.filter((product) =>
    (!query || product.name.toLowerCase().includes(query)) &&
    (state.menuStatusFilter === 'all' || (state.menuStatusFilter === 'active') === product.active));
  setText('menu-total-count', `${state.products.length} món`);
  setText('menu-active-count', String(state.products.filter((item) => item.active).length));
  setText('menu-inactive-count', String(state.products.filter((item) => !item.active).length));
  list.replaceChildren();
  if (!products.length) {
    list.innerHTML = `<p class="py-4 text-center text-xs text-neutral-400">${state.products.length ? 'Không tìm thấy món.' : 'Chưa có món.'}</p>`;
    return;
  }
  products.forEach((product) => {
    const row = document.createElement('div');
    row.className = 'bg-white p-2.5 rounded-2xl border border-neutral-200/80 shadow-sm flex items-center justify-between';
    const image = product.image_uri
      ? `<img src="${escapeHtml(product.image_uri)}" alt="${escapeHtml(product.name)}" class="w-11 h-11 rounded-xl object-cover shrink-0 border border-neutral-100">`
      : '<div class="w-11 h-11 rounded-xl bg-neutral-100 text-neutral-500 flex items-center justify-center shrink-0"><span class="material-symbols-outlined">restaurant</span></div>';
    row.innerHTML = `<div class="flex items-center gap-2.5 min-w-0 flex-1 pr-2">${image}<div class="min-w-0 flex-1"><p class="text-xs font-bold text-neutral-900 truncate">${escapeHtml(product.name)}</p><p class="text-xs font-extrabold text-primary tabular-nums whitespace-nowrap mt-0.5">${formatMoney(product.price_vnd)} đ</p></div></div><div class="flex items-center gap-1.5 shrink-0"><label class="relative inline-flex items-center cursor-pointer mr-1"><input type="checkbox" ${product.active ? 'checked' : ''} class="sr-only peer"><div class="w-9 h-5 bg-neutral-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div></label><button class="p-1 rounded-lg text-neutral-400 hover:text-neutral-700" aria-label="Sửa món"><span class="material-symbols-outlined text-[18px]">edit</span></button><button class="p-1 rounded-lg text-neutral-400 hover:text-red-600" aria-label="Xóa món"><span class="material-symbols-outlined text-[18px]">delete</span></button></div>`;
    const controls = row.querySelectorAll('input,button');
    controls[0].addEventListener('change', () => void toggleProductStatus(product.id, controls[0].checked));
    controls[1].addEventListener('click', () => openEditMenuModal(product.id));
    controls[2].addEventListener('click', () => void deleteProduct(product.id));
    list.appendChild(row);
  });
  if (animateList) applyListStagger(list);
}

function filterMenuItems() {
  state.menuSearchQuery = document.getElementById('menu-search-input')?.value.trim() || '';
  renderMenuItems(true);
}

function setMenuStatusFilter(filter) {
  state.menuStatusFilter = ['active', 'inactive'].includes(filter) ? filter : 'all';
  ['all', 'active', 'inactive'].forEach((value) => {
    const button = document.getElementById(`menu-filter-${value}`);
    if (button) button.className = value === state.menuStatusFilter
      ? 'px-3 py-1 rounded-lg bg-neutral-900 text-white font-semibold whitespace-nowrap transition-colors'
      : 'px-3 py-1 rounded-lg bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-50 whitespace-nowrap transition-colors';
  });
  renderMenuItems(true);
}

async function toggleProductStatus(id, active) {
  const product = state.products.find((item) => item.id === id);
  if (!product) return;
  const previousActive = product.active;
  product.active = active;
  renderMenuItems();
  renderSalesProducts();
  renderCartUI();
  try {
    await runWrite('products.active', { id, active });
  } catch (error) {
    try {
      await refreshAll();
    } catch (refreshError) {
      product.active = previousActive;
      renderMenuItems();
      renderSalesProducts();
      renderCartUI();
      reportError(refreshError);
    }
    reportError(error);
  }
}

async function deleteProduct(id) {
  const product = state.products.find((item) => item.id === id);
  if (!product || state.busy) return;
  state.pendingDeleteProductId = id;
  setText('delete-product-name', product.name);
  showOverlay(document.getElementById('delete-product-modal'));
}

function closeDeleteProductModal() {
  state.pendingDeleteProductId = null;
  hideOverlay(document.getElementById('delete-product-modal'));
}

async function confirmDeleteProduct() {
  const id = state.pendingDeleteProductId;
  const product = state.products.find((item) => item.id === id);
  if (!product || state.busy) return;
  setBusy(true);
  try {
    await runWrite('products.delete', { id });
    closeDeleteProductModal();
    await refreshAll();
    showToast(`Đã xóa món ${product.name}.`);
  } catch (error) { reportError(error); }
  finally { setBusy(false); }
}

function updateMenuImagePreview(value) {
  const image = document.getElementById('menu-form-image-preview');
  const placeholder = document.getElementById('menu-form-image-placeholder');
  if (!image || !placeholder) return;
  if (value) {
    image.onerror = () => { image.classList.add('hidden'); placeholder.classList.remove('hidden'); };
    image.src = value;
    image.classList.remove('hidden');
    placeholder.classList.add('hidden');
  } else {
    image.removeAttribute('src');
    image.classList.add('hidden');
    placeholder.classList.remove('hidden');
  }
}

function formatMenuPriceInput() {
  formatVndInput(document.getElementById('menu-form-price'));
}

function openEditMenuModal(id) {
  const product = state.products.find((item) => item.id === id);
  setText('menu-modal-title', product ? 'Chỉnh sửa món' : 'Thêm món mới');
  document.getElementById('menu-form-id').value = product?.id || '';
  document.getElementById('menu-form-name').value = product?.name || '';
  const priceInput = document.getElementById('menu-form-price');
  if (priceInput) {
    const rawPrice = product?.price_vnd ? String(Math.trunc(Number(product.price_vnd))) : '';
    priceInput.dataset.raw = rawPrice;
    priceInput.value = rawPrice ? Number(rawPrice).toLocaleString('vi-VN') : '';
  }
  document.getElementById('menu-form-image').value = product?.image_uri || '';
  document.getElementById('menu-form-active').checked = product ? product.active : true;
  updateMenuImagePreview(product?.image_uri || '');
  toggleFormStatusLabel();
  showOverlay(document.getElementById('menu-modal'));
}

function closeMenuModal() { hideOverlay(document.getElementById('menu-modal')); }

function toggleFormStatusLabel() {
  const active = Boolean(document.getElementById('menu-form-active')?.checked);
  const label = document.getElementById('menu-form-status-text');
  if (!label) return;
  label.textContent = active ? 'Đang mở bán' : 'Tạm ngưng phục vụ';
  label.className = active ? 'text-xs font-semibold text-emerald-700' : 'text-xs font-semibold text-neutral-500';
}

async function saveMenuItem() {
  if (state.busy) return;
  const id = document.getElementById('menu-form-id')?.value || null;
  const name = document.getElementById('menu-form-name')?.value.trim() || '';
  const price = parseVndInput(document.getElementById('menu-form-price'));
  const image = document.getElementById('menu-form-image')?.value.trim() || null;
  const active = Boolean(document.getElementById('menu-form-active')?.checked);
  if (!name || !Number.isSafeInteger(price) || price <= 0) {
    showToast('Vui lòng nhập tên món và giá bán hợp lệ.', true);
    return;
  }
  setBusy(true);
  try {
    const description = state.products.find((product) => product.id === id)?.description || '';
    await runWrite('products.save', { id, name, description, price_vnd: price, active, image_uri: image });
    closeMenuModal();
    await refreshAll();
    showToast(id ? `Đã cập nhật ${name}.` : `Đã thêm ${name}.`);
  } catch (error) { reportError(error); }
  finally { setBusy(false); }
}

async function pickProductImage() {
  try {
    const result = await requestNative('images.pick');
    if (result.canceled) return;
    if (typeof result.imageUri !== 'string' || !result.imageUri.startsWith('data:image/')) {
      throw new Error('Không nhận được ảnh đã chọn.');
    }
    openImageCropModal(result.imageUri);
  } catch (error) { reportError(error); }
}

// --- Image crop: kéo để di chuyển, slider phóng to, xuất vuông 800x800 ---
const crop = { img: null, cover: 1, scale: 1, x: 0, y: 0, view: 0, drag: null, pinch: null, pointers: new Map(), inited: false };

function applyCropTransform() {
  const img = crop.img;
  if (!img) return;
  const s = crop.cover * crop.scale;
  img.style.width = `${img.naturalWidth * s}px`;
  img.style.height = `${img.naturalHeight * s}px`;
  img.style.transform = `translate(${crop.x}px, ${crop.y}px)`;
}

function clampCrop() {
  const img = crop.img;
  if (!img) return;
  const v = crop.view;
  const dw = img.naturalWidth * crop.cover * crop.scale;
  const dh = img.naturalHeight * crop.cover * crop.scale;
  crop.x = Math.min(0, Math.max(v - dw, crop.x));
  crop.y = Math.min(0, Math.max(v - dh, crop.y));
}

function openImageCropModal(dataUri) {
  const modal = document.getElementById('image-crop-modal');
  const img = document.getElementById('crop-image');
  const viewport = document.getElementById('crop-viewport');
  const zoom = document.getElementById('crop-zoom');
  if (!modal || !img || !viewport || !zoom) {
    document.getElementById('menu-form-image').value = dataUri;
    updateMenuImagePreview(dataUri);
    return;
  }
  if (!crop.inited) {
    crop.inited = true;
    const zoomAt = (cx, cy, newScale) => {
      const clamped = Math.min(4, Math.max(1, newScale));
      const ratio = clamped / crop.scale;
      crop.x = cx - (cx - crop.x) * ratio;
      crop.y = cy - (cy - crop.y) * ratio;
      crop.scale = clamped;
      zoom.value = String(clamped);
    };
    const pinchPoints = () => {
      const pts = [...crop.pointers.values()];
      if (pts.length < 2) return null;
      const [a, b] = pts;
      return {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        mx: (a.x + b.x) / 2,
        my: (a.y + b.y) / 2,
      };
    };
    viewport.addEventListener('pointerdown', (event) => {
      if (!crop.img) return;
      crop.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      try { viewport.setPointerCapture(event.pointerId); } catch {}
      if (crop.pointers.size === 2) {
        const p = pinchPoints();
        crop.pinch = p ? { ...p } : null;
        crop.drag = null;
      } else if (crop.pointers.size === 1) {
        crop.drag = { id: event.pointerId, sx: event.clientX, sy: event.clientY, ox: crop.x, oy: crop.y };
      }
    });
    viewport.addEventListener('pointermove', (event) => {
      if (!crop.img) return;
      const pt = crop.pointers.get(event.pointerId);
      if (pt) { pt.x = event.clientX; pt.y = event.clientY; }
      if (crop.pinch) {
        const p = pinchPoints();
        if (!p || p.dist === 0) return;
        const prev = crop.pinch;
        const rect = viewport.getBoundingClientRect();
        zoomAt(prev.mx - rect.left, prev.my - rect.top, crop.scale * (p.dist / prev.dist));
        crop.x += p.mx - prev.mx;
        crop.y += p.my - prev.my;
        crop.pinch = p;
        clampCrop();
        applyCropTransform();
        return;
      }
      if (!crop.drag || event.pointerId !== crop.drag.id) return;
      crop.x = crop.drag.ox + (event.clientX - crop.drag.sx);
      crop.y = crop.drag.oy + (event.clientY - crop.drag.sy);
      clampCrop();
      applyCropTransform();
    });
    const endPointer = (event) => {
      crop.pointers.delete(event.pointerId);
      if (crop.pointers.size < 2) crop.pinch = null;
      if (crop.pointers.size === 0) crop.drag = null;
      else if (crop.pointers.size === 1 && !crop.drag) {
        const [id, pt] = [...crop.pointers.entries()][0];
        crop.drag = { id, sx: pt.x, sy: pt.y, ox: crop.x, oy: crop.y };
      }
    };
    viewport.addEventListener('pointerup', endPointer);
    viewport.addEventListener('pointercancel', endPointer);
    zoom.addEventListener('input', () => {
      if (!crop.img) return;
      const v = crop.view;
      const ratio = Number(zoom.value) / crop.scale;
      crop.x = v / 2 - (v / 2 - crop.x) * ratio;
      crop.y = v / 2 - (v / 2 - crop.y) * ratio;
      crop.scale = Number(zoom.value);
      clampCrop();
      applyCropTransform();
    });
  }
  img.onerror = () => {
    crop.img = null;
    showToast('Không thể đọc ảnh đã chọn.', true);
  };
  img.onload = () => {
    showOverlay(modal);
    requestAnimationFrame(() => {
      const v = viewport.clientWidth || viewport.getBoundingClientRect().width || 300;
      if (!img.naturalWidth || !img.naturalHeight) return;
      crop.img = img;
      crop.view = v;
      crop.cover = Math.max(v / img.naturalWidth, v / img.naturalHeight);
      crop.scale = 1;
      crop.x = (v - img.naturalWidth * crop.cover) / 2;
      crop.y = (v - img.naturalHeight * crop.cover) / 2;
      crop.drag = null;
      crop.pinch = null;
      crop.pointers.clear();
      zoom.value = '1';
      applyCropTransform();
    });
  };
  img.src = dataUri;
}

function confirmImageCrop() {
  const img = crop.img;
  if (!img || !crop.view || !img.naturalWidth || !img.naturalHeight) { closeImageCropModal(); return; }
  try {
    const v = crop.view;
    const out = 800;
    const canvas = document.createElement('canvas');
    canvas.width = out;
    canvas.height = out;
    const ctx = canvas.getContext('2d');
    const dispScale = crop.cover * crop.scale;
    const srcX = Math.max(0, Math.min(img.naturalWidth - 1, -crop.x / dispScale));
    const srcY = Math.max(0, Math.min(img.naturalHeight - 1, -crop.y / dispScale));
    const srcW = Math.max(1, Math.min(v / dispScale, img.naturalWidth - srcX, img.naturalHeight - srcY));
    ctx.drawImage(img, srcX, srcY, srcW, srcW, 0, 0, out, out);
    const dataUri = canvas.toDataURL('image/jpeg', 0.85);
    closeImageCropModal();
    document.getElementById('menu-form-image').value = dataUri;
    updateMenuImagePreview(dataUri);
  } catch (error) { reportError(error); }
}

function closeImageCropModal() {
  hideOverlay(document.getElementById('image-crop-modal'));
  const img = document.getElementById('crop-image');
  if (img) img.removeAttribute('src');
  crop.img = null;
}

function ensureMenuDialogs() {
  if (document.getElementById('delete-product-modal')) return;
  (document.getElementById('app-root') || document.body).insertAdjacentHTML('beforeend', `
    <div class="hidden absolute inset-0 bg-black/50 z-[70] flex flex-col justify-end" id="delete-product-modal" data-app-managed-modal><div class="bg-white rounded-t-3xl px-4 pb-4 pt-0 space-y-3 shadow-2xl"><div class="ft-sheet-grabber w-full flex justify-center pt-2.5 pb-1 cursor-grab active:cursor-grabbing shrink-0 touch-none"><div class="w-10 h-1 bg-neutral-300 rounded-full"></div></div><h3 class="text-sm font-bold text-neutral-900">Xóa món?</h3><p class="text-xs text-neutral-600"><strong id="delete-product-name"></strong> · Lịch sử được giữ.</p><div class="flex gap-2"><button class="flex-1 py-2.5 rounded-xl border border-neutral-200 text-xs font-semibold" onclick="closeDeleteProductModal()">Hủy</button><button class="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-xs font-bold" id="delete-product-confirm-button" onclick="confirmDeleteProduct()">Xóa món</button></div></div></div>
  `);
}

function ensureImagePickerButton() {
  const input = document.getElementById('menu-form-image');
  if (!input || document.getElementById('pick-menu-image')) return;
  const imageGroup = input.closest('.space-y-2');
  const imageRow = input.parentElement?.parentElement;
  const preview = document.getElementById('menu-form-image-preview')?.parentElement;
  if (!imageGroup || !imageRow || !preview) return;

  const inputWrapper = input.parentElement;
  input.type = 'hidden';
  imageGroup.prepend(input);
  inputWrapper.remove();
  document.getElementById('menu-form-file-input')?.closest('label')?.remove();
  imageGroup.querySelector('p')?.parentElement?.remove();

  const previewButton = document.createElement('button');
  previewButton.id = 'pick-menu-image-preview';
  previewButton.type = 'button';
  previewButton.className = `${preview.className} cursor-pointer active:scale-95 transition-transform`;
  previewButton.setAttribute('aria-label', 'Chọn ảnh từ thiết bị');
  previewButton.innerHTML = preview.innerHTML;
  preview.replaceWith(previewButton);
  previewButton.addEventListener('click', () => void pickProductImage());

  const button = document.createElement('button');
  button.id = 'pick-menu-image';
  button.type = 'button';
  button.className = 'flex-1 min-h-12 flex items-center justify-center gap-2 px-3 rounded-xl border border-neutral-200 bg-neutral-50 text-neutral-700 font-semibold text-xs active:scale-[.98] transition-transform';
  button.innerHTML = '<span class="material-symbols-outlined text-[18px]">photo_library</span><span>Chọn ảnh từ thiết bị</span>';
  button.addEventListener('click', () => void pickProductImage());
  imageRow.appendChild(button);
}
