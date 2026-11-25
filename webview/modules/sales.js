// --- sales.js ---
// Sales view & cart logic
function renderSalesProducts(popProductId) {
  const grid = document.getElementById('sales-product-grid');
  if (!grid) return;
  grid.replaceChildren();
  const query = state.salesSearchQuery.toLowerCase();
  const products = state.products.filter((product) => product.active &&
    (product.name.toLowerCase().includes(query) || String(product.price_vnd).includes(query)));
  if (!products.length) {
    const emptyMessage = !state.products.length
      ? 'Menu đang trống.'
      : state.products.some((product) => product.active)
        ? 'Không tìm thấy món.'
        : 'Chưa có món đang bán.';
    grid.innerHTML = `<div class="col-span-full py-12 text-center text-neutral-400"><p class="text-xs">${emptyMessage}</p></div>`;
    return;
  }
  products.forEach((product) => {
    const card = document.createElement('div');
    card.className = 'bg-white rounded-2xl border border-neutral-200/80 p-2 flex flex-col justify-between shadow-sm relative overflow-hidden transition-transform duration-150 hover:border-neutral-300 cursor-pointer active:scale-[0.97] active:border-primary/50';
    const image = product.image_uri ? `<img src="${escapeHtml(product.image_uri)}" alt="${escapeHtml(product.name)}" class="w-full aspect-square rounded-xl object-cover">` : '<div class="w-full aspect-square rounded-xl bg-neutral-100 flex items-center justify-center text-neutral-400"><span class="material-symbols-outlined text-3xl">restaurant</span></div>';
    const quantity = state.cart[product.id] || 0;
    const popClass = popProductId && popProductId === product.id ? ' ft-pop' : '';
    const action = quantity > 0
      ? `<div class="flex items-center bg-neutral-100 rounded-lg p-0.5 border border-neutral-200 shrink-0"><button data-step="-1" class="w-6 h-6 rounded flex items-center justify-center bg-white text-neutral-700 font-bold active:scale-90 transition-transform" aria-label="Giảm ${escapeHtml(product.name)}">−</button><span class="min-w-[20px] px-0.5 text-center font-bold text-neutral-900 text-xs tabular-nums${popClass}">${quantity}</span><button data-step="1" class="w-6 h-6 rounded flex items-center justify-center bg-white text-neutral-700 font-bold active:scale-90 transition-transform" aria-label="Tăng ${escapeHtml(product.name)}">+</button></div>`
      : `<button class="w-7 h-7 rounded-lg bg-neutral-900 text-white hover:bg-primary active:scale-90 flex items-center justify-center transition-transform shadow-sm shrink-0" aria-label="Thêm ${escapeHtml(product.name)}"><span class="material-symbols-outlined text-[16px]">add</span></button>`;
    const priceCls = quantity > 0 ? 'text-[11px]' : 'text-xs';
    card.innerHTML = `<div><div class="w-full aspect-square rounded-xl bg-neutral-100 overflow-hidden relative">${image}${quantity ? `<span class="absolute top-1.5 right-1.5 bg-primary text-white text-[11px] px-2 py-0.5 rounded-full font-bold tabular-nums${popClass}">${quantity}</span>` : ''}</div><h4 class="text-xs font-bold text-neutral-900 mt-1.5 line-clamp-1">${escapeHtml(product.name)}</h4><p class="text-[10px] text-neutral-400 line-clamp-1 mt-0.5">${escapeHtml(product.description || '')}</p></div><div class="mt-2 pt-1.5 border-t border-neutral-100 flex items-center justify-between gap-1"><span class="${priceCls} font-extrabold text-primary whitespace-nowrap tabular-nums">${formatMoney(product.price_vnd)} đ</span>${action}</div>`;
    card.addEventListener('click', () => addToCart(product.id));
    card.querySelectorAll('[data-step]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        updateCartQuantity(product.id, Number(button.dataset.step));
      });
    });
    grid.appendChild(card);
  });
}

function filterSalesProducts() {
  const input = document.getElementById('sales-search-input');
  state.salesSearchQuery = (input?.value || '').trim();
  document.getElementById('sales-search-clear')?.classList.toggle('hidden', !state.salesSearchQuery);
  renderSalesProducts();
}

function clearSalesSearch() {
  const input = document.getElementById('sales-search-input');
  if (input) input.value = '';
  state.salesSearchQuery = '';
  document.getElementById('sales-search-clear')?.classList.add('hidden');
  renderSalesProducts();
}

let _lastCartCount = 0;

function addToCart(id) {
  const product = state.products.find((item) => item.id === id);
  if (!product || !product.active) return;
  state.cart[id] = (state.cart[id] || 0) + 1;
  renderCartUI(true);
  renderSalesProducts(id);
}

function updateCartQuantity(id, delta) {
  if (!state.cart[id]) return;
  state.cart[id] += delta;
  if (state.cart[id] <= 0) delete state.cart[id];
  renderCartUI(true);
  renderSalesProducts(id);
}

function pruneCart() {
  Object.keys(state.cart).forEach((id) => {
    const product = state.products.find((item) => item.id === id);
    if (!product || !product.active || !(state.cart[id] > 0)) {
      delete state.cart[id];
    }
  });
}

function cartTotals() {
  pruneCart();
  return Object.entries(state.cart).reduce((total, [id, quantity]) => {
    const product = state.products.find((item) => item.id === id);
    if (!product) return total;
    total.count += quantity;
    total.amount += product.price_vnd * quantity;
    return total;
  }, { count: 0, amount: 0 });
}

function updateOrderButtonsState() {
  const count = cartTotals().count;
  const canOrder = count > 0 && !state.busy;
  const dockBtn = document.getElementById('btn-dock-create-order');
  if (dockBtn) {
    dockBtn.disabled = !canOrder;
    if (canOrder) {
      dockBtn.className = 'shrink-0 min-w-[116px] sm:min-w-[136px] px-3.5 h-10 bg-primary hover:bg-orange-600 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-md active:scale-[0.98] transition-all whitespace-nowrap cursor-pointer';
      dockBtn.innerHTML = `<span>Tạo đơn (${count})</span><span class="material-symbols-outlined text-[16px]">arrow_forward</span>`;
    } else {
      dockBtn.className = 'shrink-0 min-w-[116px] sm:min-w-[136px] px-3.5 h-10 bg-neutral-200 text-neutral-400 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-none whitespace-nowrap cursor-not-allowed';
      dockBtn.innerHTML = `<span>${state.busy ? 'Đang xử lý…' : 'Tạo đơn'}</span><span class="material-symbols-outlined text-[16px]">arrow_forward</span>`;
    }
  }
  const sheetBtn = document.getElementById('btn-sheet-confirm');
  if (sheetBtn) {
    sheetBtn.disabled = !canOrder;
    if (canOrder) {
      sheetBtn.className = 'flex-1 h-10 bg-primary hover:bg-orange-600 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-md active:scale-[0.98] transition-all cursor-pointer';
      sheetBtn.innerHTML = `<span class="material-symbols-outlined text-[16px]">check</span><span>Tạo đơn (${count})</span>`;
    } else {
      sheetBtn.className = 'flex-1 h-10 bg-neutral-200 text-neutral-400 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-none cursor-not-allowed';
      sheetBtn.innerHTML = `<span class="material-symbols-outlined text-[16px]">check</span><span>${state.busy ? 'Đang xử lý…' : 'Tạo đơn'}</span>`;
    }
  }
}

function renderCartUI(fromInteraction) {
  const totals = cartTotals();
  const prevCount = _lastCartCount;
  _lastCartCount = totals.count;
  const dockBadge = document.getElementById('dock-cart-badge');
  setText('dock-cart-badge', String(totals.count));
  setText('dock-cart-count-label', `Chi tiết đơn (${totals.count} món)`);
  setText('dock-cart-total-text', `${formatMoney(totals.amount)} đ`);
  const navBadge = document.getElementById('nav-cart-indicator');
  if (navBadge) {
    navBadge.textContent = String(totals.count);
    navBadge.classList.toggle('hidden', totals.count === 0);
  }
  if (fromInteraction && totals.count > 0 && totals.count !== prevCount) {
    triggerPop(dockBadge);
    triggerPop(navBadge);
  }
  const clearTab = document.getElementById('btn-quick-clear-cart');
  if (clearTab) {
    clearTab.classList.toggle('ft-clear-tab-visible', totals.count > 0);
  }
  updateOrderButtonsState();
  if (fromInteraction && prevCount === 0 && totals.count > 0) {
    triggerPop(document.getElementById('btn-dock-create-order'));
  }
  setText('sheet-cart-badge', `${totals.count} món`);
  setText('sheet-total-price', `${formatMoney(totals.amount)} đ`);
  const methodLabel = document.getElementById('dock-cart-method-label');
  if (methodLabel) methodLabel.textContent = state.paymentMethod === 'cash' ? '• Tiền mặt' : '• Chuyển khoản';
  const rows = document.getElementById('sheet-cart-items');
  if (!rows) return;
  rows.replaceChildren();
  const items = Object.entries(state.cart);
  if (!items.length) {
    rows.innerHTML = '<div class="py-6 text-center text-neutral-400 text-xs">Chưa có món nào trong đơn</div>';
    return;
  }
  items.forEach(([id, quantity]) => {
    const product = state.products.find((item) => item.id === id);
    if (!product) return;
    const row = document.createElement('div');
    row.className = 'flex items-center justify-between text-xs py-2';
    row.innerHTML = `<div class="min-w-0 flex-1 pr-2"><p class="font-bold text-neutral-800 line-clamp-1">${escapeHtml(product.name)}</p><span class="text-[11px] text-neutral-400 tabular-nums">${formatMoney(product.price_vnd)} đ</span></div><div class="flex items-center gap-2 shrink-0"><div class="flex items-center bg-neutral-100 rounded-lg p-0.5 border border-neutral-200"><button class="w-6 h-6 rounded flex items-center justify-center bg-white text-neutral-700 font-bold active:scale-90 transition-transform">−</button><span class="min-w-[20px] px-0.5 text-center font-bold text-neutral-900 text-xs tabular-nums">${quantity}</span><button class="w-6 h-6 rounded flex items-center justify-center bg-white text-neutral-700 font-bold active:scale-90 transition-transform">+</button></div><span class="font-extrabold text-neutral-900 min-w-[68px] text-right whitespace-nowrap tabular-nums">${formatMoney(product.price_vnd * quantity)} đ</span></div>`;
    const buttons = row.querySelectorAll('button');
    buttons[0].addEventListener('click', () => updateCartQuantity(id, -1));
    buttons[1].addEventListener('click', () => updateCartQuantity(id, 1));
    rows.appendChild(row);
  });
}

function openCartSheet() {
  showOverlay(document.getElementById('sales-cart-sheet'));
  requestAnimationFrame(() => positionSlidingPill('sheet-pay-pill', `sheet-pay-${state.paymentMethod}`));
}
function closeCartSheet() { hideOverlay(document.getElementById('sales-cart-sheet')); }

function clearCart() {
  state.cart = Object.create(null);
  renderCartUI();
  renderSalesProducts();
  closeCartSheet();
}

function setPaymentMethod(method) {
  state.paymentMethod = method === 'transfer' ? 'transfer' : 'cash';
  ['cash', 'transfer'].forEach((value) => {
    const button = document.getElementById(`sheet-pay-${value}`);
    if (button) button.className = value === state.paymentMethod
      ? 'relative px-2.5 py-1 text-xs font-semibold rounded-md text-neutral-900 transition-colors'
      : 'relative px-2.5 py-1 text-xs font-semibold rounded-md text-neutral-600 hover:text-neutral-900 transition-colors';
  });
  positionSlidingPill('sheet-pay-pill', `sheet-pay-${state.paymentMethod}`);
  renderCartUI();
}

async function confirmOrder() {
  if (state.busy) return;
  pruneCart();
  const items = Object.entries(state.cart).map(([productId, quantity]) => ({ productId, quantity }));
  if (!items.length || state.busy) return;
  setBusy(true);
  try {
    await runWrite('orders.create', { items, paymentMethod: state.paymentMethod });
    clearCart();
    closeCartSheet();
    await refreshAll();
    showToast('Bán hàng thành công!');
  } catch (error) { reportError(error); }
  finally { setBusy(false); }
}
