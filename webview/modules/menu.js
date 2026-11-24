// --- menu.js ---
// Menu view & management logic
function renderMenuItems() {
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
      : '<div class="w-11 h-11 rounded-xl bg-neutral-100 text-neutral-500 flex items-center justify-center"><span class="material-symbols-outlined">restaurant</span></div>';
    row.innerHTML = `<div class="flex items-center gap-2.5 min-w-0">${image}<div class="min-w-0"><p class="text-xs font-bold text-neutral-900">${escapeHtml(product.name)}</p><p class="text-xs font-extrabold text-primary mt-0.5">${formatMoney(product.price_vnd)} đ</p></div></div><div class="flex items-center gap-1.5"><label class="relative inline-flex items-center cursor-pointer mr-1"><input type="checkbox" ${product.active ? 'checked' : ''} class="sr-only peer"><div class="w-9 h-5 bg-neutral-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div></label><button class="p-1 rounded-lg text-neutral-400 hover:text-neutral-700" aria-label="Sửa món"><span class="material-symbols-outlined text-[18px]">edit</span></button><button class="p-1 rounded-lg text-neutral-400 hover:text-red-600" aria-label="Xóa món"><span class="material-symbols-outlined text-[18px]">delete</span></button></div>`;
    const controls = row.querySelectorAll('input,button');
    controls[0].addEventListener('change', () => void toggleProductStatus(product.id, controls[0].checked));
    controls[1].addEventListener('click', () => openEditMenuModal(product.id));
    controls[2].addEventListener('click', () => void deleteProduct(product.id));
    list.appendChild(row);
  });
}

function filterMenuItems() {
  state.menuSearchQuery = document.getElementById('menu-search-input')?.value.trim() || '';
  renderMenuItems();
}

function setMenuStatusFilter(filter) {
  state.menuStatusFilter = ['active', 'inactive'].includes(filter) ? filter : 'all';
  ['all', 'active', 'inactive'].forEach((value) => {
    const button = document.getElementById(`menu-filter-${value}`);
    if (button) button.className = value === state.menuStatusFilter
      ? 'px-3 py-1 rounded-lg bg-neutral-900 text-white font-semibold'
      : 'px-3 py-1 rounded-lg bg-white border border-neutral-200 text-neutral-600';
  });
  renderMenuItems();
}

async function toggleProductStatus(id, active) {
  const product = state.products.find((item) => item.id === id);
  if (!product) return;
  const previousActive = product.active;
  product.active = active;
  renderMenuItems();
  renderSalesProducts();
  try {
    await runWrite('products.active', { id, active });
  } catch (error) {
    try {
      await refreshAll();
    } catch (refreshError) {
      product.active = previousActive;
      renderMenuItems();
      renderSalesProducts();
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
  document.getElementById('delete-product-modal')?.classList.remove('hidden');
}

function closeDeleteProductModal() {
  state.pendingDeleteProductId = null;
  document.getElementById('delete-product-modal')?.classList.add('hidden');
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

function openEditMenuModal(id) {
  const product = state.products.find((item) => item.id === id);
  setText('menu-modal-title', product ? 'Chỉnh sửa món' : 'Thêm món mới');
  document.getElementById('menu-form-id').value = product?.id || '';
  document.getElementById('menu-form-name').value = product?.name || '';
  document.getElementById('menu-form-price').value = product?.price_vnd || '';
  document.getElementById('menu-form-image').value = product?.image_uri || '';
  document.getElementById('menu-form-active').checked = product ? product.active : true;
  updateMenuImagePreview(product?.image_uri || '');
  toggleFormStatusLabel();
  document.getElementById('menu-modal')?.classList.remove('hidden');
}

function closeMenuModal() { document.getElementById('menu-modal')?.classList.add('hidden'); }

function toggleFormStatusLabel() {
  const active = Boolean(document.getElementById('menu-form-active')?.checked);
  const label = document.getElementById('menu-form-status-text');
  if (!label) return;
  label.textContent = active ? 'Đang mở bán' : 'Tạm ngưng phục vụ';
  label.className = active ? 'text-xs font-semibold text-emerald-700' : 'text-xs font-semibold text-neutral-500';
}

async function saveMenuItem() {
  const id = document.getElementById('menu-form-id')?.value || null;
  const name = document.getElementById('menu-form-name')?.value.trim() || '';
  const price = Number(document.getElementById('menu-form-price')?.value || 0);
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
    document.getElementById('menu-form-image').value = result.imageUri;
    updateMenuImagePreview(result.imageUri);
  } catch (error) { reportError(error); }
}

function ensureMenuDialogs() {
  if (document.getElementById('delete-product-modal')) return;
  document.body.insertAdjacentHTML('beforeend', `
    <div class="hidden fixed inset-0 bg-black/50 z-[70] flex flex-col justify-end" id="delete-product-modal" data-app-managed-modal><div class="bg-white rounded-t-3xl p-4 space-y-3"><h3 class="text-sm font-bold text-neutral-900">Xóa món?</h3><p class="text-xs text-neutral-600"><strong id="delete-product-name"></strong> · Lịch sử được giữ.</p><div class="flex gap-2"><button class="flex-1 py-2.5 rounded-xl border border-neutral-200 text-xs font-semibold" onclick="closeDeleteProductModal()">Hủy</button><button class="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-xs font-bold" id="delete-product-confirm-button" onclick="confirmDeleteProduct()">Xóa món</button></div></div></div>
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
