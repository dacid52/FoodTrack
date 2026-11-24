// --- expenses.js ---
// Expenses and transaction details logic
function openExpenseModal(type) {
  state.expenseType = type === 'other' ? 'other' : 'import';
  setExpenseType(state.expenseType);
  const amountInput = document.getElementById('exp-amount-input');
  if (amountInput) { amountInput.value = ''; delete amountInput.dataset.raw; }
  ['exp-content-input', 'exp-note-input'].forEach((id) => { const input = document.getElementById(id); if (input) input.value = ''; });
  setExpensePayMethod('cash');
  updateExpenseButtonText();
  document.getElementById('expense-modal')?.classList.remove('hidden');
}

function closeExpenseModal() { document.getElementById('expense-modal')?.classList.add('hidden'); }

function setExpenseType(type) {
  state.expenseType = type === 'other' ? 'other' : 'import';
  const importButton = document.getElementById('exp-type-import');
  const otherButton = document.getElementById('exp-type-other');
  if (importButton) importButton.className = state.expenseType === 'import'
    ? 'flex-1 py-1.5 rounded-lg bg-white text-neutral-900 shadow-sm font-semibold text-center'
    : 'flex-1 py-1.5 rounded-lg hover:text-neutral-900 font-medium text-center';
  if (otherButton) otherButton.className = state.expenseType === 'other'
    ? 'flex-1 py-1.5 rounded-lg bg-white text-neutral-900 shadow-sm font-semibold text-center'
    : 'flex-1 py-1.5 rounded-lg hover:text-neutral-900 font-medium text-center';
}

function setExpensePayMethod(method) {
  state.expensePayMethod = method === 'transfer' || method === 'Chuyển khoản'
    ? 'transfer'
    : method === 'debt' || method === 'Ghi nợ' ? 'debt' : 'cash';
  ['cash', 'transfer', 'debt'].forEach((value) => {
    const button = document.getElementById(`exp-pay-${value}`);
    if (button) button.className = value === state.expensePayMethod
      ? 'py-1.5 rounded-lg text-xs font-bold bg-white text-neutral-900 shadow-sm text-center'
      : 'py-1.5 rounded-lg text-xs font-medium text-neutral-600 hover:text-neutral-900 text-center';
  });
}

function formatExpenseAmountInput() {
  const input = document.getElementById('exp-amount-input');
  if (!input) return;
  const digits = String(input.value || '').replace(/\D/g, '');
  input.dataset.raw = digits;
  input.value = digits ? Number(digits).toLocaleString('vi-VN') : '';
}

function expenseAmountValue() {
  const input = document.getElementById('exp-amount-input');
  return Number(input?.dataset.raw || String(input?.value || '').replace(/\D/g, '') || 0);
}

function addExpenseAmount(amount) {
  const input = document.getElementById('exp-amount-input');
  if (!input) return;
  const next = expenseAmountValue() + amount;
  input.dataset.raw = String(next);
  input.value = next ? next.toLocaleString('vi-VN') : '';
  updateExpenseButtonText();
}

const QUICK_AMOUNT_CAP = 9000000;

function quickAmountLabel(value) {
  if (value >= 1000000) {
    const tr = value / 1000000;
    const frac = tr - Math.floor(tr);
    if (frac === 0) return `+${tr}tr`;
    const digits = String(Math.round(frac * 1000)).padStart(3, '0').replace(/0+$/, '');
    return `+${Math.floor(tr)}tr${digits}`;
  }
  if (value >= 1000) {
    const k = value / 1000;
    return Number.isInteger(k) ? `+${k}k` : `+${Math.round(k * 100) / 100}k`;
  }
  return `+${value}`;
}

// Nấc tiền "đẹp" d×10^n với d thuộc tập cho trước, nhỏ nhất >= value
function niceAmountCeil(value, digits) {
  for (let n = 3; n <= 7; n += 1) {
    for (const d of digits) {
      const candidate = d * 10 ** n;
      if (candidate >= value && candidate <= QUICK_AMOUNT_CAP) return candidate;
    }
  }
  return QUICK_AMOUNT_CAP;
}

// Các nấc {1,2,5}×10^n lớn hơn minExclusive
function niceAmountsAbove(minExclusive, count) {
  const out = [];
  for (let n = 3; n <= 7 && out.length < count; n += 1) {
    for (const d of [1, 2, 5]) {
      const candidate = d * 10 ** n;
      if (candidate > minExclusive && candidate <= QUICK_AMOUNT_CAP) out.push(candidate);
      if (out.length >= count) break;
    }
  }
  return out;
}

function quickAmountValues() {
  const raw = expenseAmountValue();
  if (!raw) return [50000, 100000, 200000, 500000, 1000000];
  // Cơ sở: input×1000, chia 10 tới khi <= 20k → 5→5k, 15→15k, 90→9k, 95→9.5k, 200→20k
  let base = raw * 1000;
  while (base > 20000) base = Math.floor(base / 10);
  if (base % 1000 === 0) {
    // Base tròn nghìn: nấc đẹp tăng dần (vd 15 → 15k,30k,50k,100k,200k)
    const second = niceAmountCeil(base * 2, [1, 2, 3, 5]);
    return [base, second, ...niceAmountsAbove(second, 3)].slice(0, 5);
  }
  // Base lẻ (9.5k, 16.5k...): nhân dần ×10,×100,×200 rồi chạm cap (vd 9.5k→95k→950k→1.9tr→9tr)
  return [base, base * 10, base * 100, base * 200, Math.min(base * 1000, QUICK_AMOUNT_CAP)];
}

function renderQuickAmounts() {
  const container = document.getElementById('exp-quick-amounts');
  if (!container) return;
  const values = quickAmountValues();
  container.replaceChildren();
  values.forEach((value, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = index === values.length - 1
      ? 'py-1 text-[10px] font-bold bg-orange-50 text-primary rounded-lg border border-orange-200 hover:bg-orange-100 active:scale-95 truncate'
      : 'py-1 text-[10px] font-semibold bg-white rounded-lg border border-neutral-200 hover:border-primary active:scale-95 truncate';
    button.textContent = quickAmountLabel(value);
    button.onclick = () => addExpenseAmount(value);
    container.appendChild(button);
  });
}

function updateExpenseButtonText() {
  const amount = expenseAmountValue();
  setText('btn-save-expense-text', amount > 0 ? `Lưu chi phí (${formatMoney(amount)} đ)` : 'Lưu chi phí');
  renderQuickAmounts();
}

async function saveExpenseRecord() {
  const amount = expenseAmountValue();
  const title = document.getElementById('exp-content-input')?.value.trim() || '';
  const now = new Date();
  const occurredAt = `${localDate(now)} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:00`;
  const note = document.getElementById('exp-note-input')?.value.trim() || '';
  if (!Number.isSafeInteger(amount) || amount <= 0 || !title) {
    showToast('Nhập nội dung và số tiền hợp lệ.', true);
    return;
  }
  setBusy(true);
  try {
    await runWrite('expenses.create', {
      category: state.expenseType === 'import' ? 'purchase' : 'other',
      amountVnd: amount,
      title,
      note,
      paymentMethod: state.expensePayMethod,
      occurredAt,
    });
    closeExpenseModal();
    await refreshAll();
    showToast('Đã lưu chi phí.');
  } catch (error) { reportError(error); }
  finally { setBusy(false); }
}

function isSameDayOrder(transaction) {
  return Boolean(transaction) && transaction.type === 'order' && transaction.date === localDate();
}

function renderTxModalItems(items) {
  const container = document.getElementById('tx-modal-items');
  if (!container) return;
  container.replaceChildren();
  if (!items.length) {
    container.innerHTML = '<p class="py-3 text-center text-[11px] text-neutral-400">Không có món trong đơn.</p>';
    return;
  }
  items.forEach((item) => {
    const lineTotal = (Number(item.unit_price_vnd) || 0) * (Number(item.quantity) || 0);
    const row = document.createElement('div');
    row.className = 'flex items-center justify-between gap-2 py-2';
    row.innerHTML = `<div class="min-w-0"><p class="text-xs font-semibold text-neutral-800 truncate">${escapeHtml(item.product_name)}</p><p class="text-[10px] text-neutral-400">${formatMoney(item.unit_price_vnd || 0)} đ / phần</p></div><div class="text-right shrink-0"><span class="inline-block text-[11px] font-extrabold text-neutral-900 bg-neutral-100 px-2 py-0.5 rounded-lg">${item.quantity}</span><p class="text-[10px] text-neutral-400 mt-0.5">${formatMoney(lineTotal)} đ</p></div>`;
    container.appendChild(row);
  });
}

async function openTxDetailModal(transaction) {
  try {
    const detail = await requestNative('history.detail', { id: transaction.id });
    state.currentTx = { ...transaction, detail };
    const income = transaction.amount > 0;
    const isOrder = transaction.type === 'order';
    setText('tx-modal-type-badge', income ? 'Đơn hàng thành công' : transaction.type === 'cost_import' ? 'Chi tiền nhập hàng' : 'Chi phí hoạt động');
    setText('tx-modal-amount', `${income ? '+' : '−'}${formatMoney(Math.abs(transaction.amount))} đ`);
    setText('tx-modal-title', transaction.title);
    setText('tx-modal-time', formatTime(transaction.occurred_at));
    setText('tx-modal-method', transaction.method);
    setText('tx-modal-id', transaction.id);
    document.getElementById('tx-modal-desc-wrap')?.classList.toggle('hidden', isOrder);
    document.getElementById('tx-modal-items-wrap')?.classList.toggle('hidden', !isOrder);
    if (isOrder) {
      renderTxModalItems(detail.rawItems || []);
    } else {
      setText('tx-modal-desc', detail.items || '—');
    }
    const actions = document.getElementById('tx-modal-actions');
    const editable = isSameDayOrder(transaction);
    actions?.classList.toggle('hidden', !editable);
    actions?.classList.toggle('flex', editable);
    document.getElementById('tx-detail-modal')?.classList.remove('hidden');
  } catch (error) { reportError(error); }
}

function closeTxDetailModal() { document.getElementById('tx-detail-modal')?.classList.add('hidden'); }

// --- Sửa / xóa đơn hàng trong ngày ---
function promptDeleteOrder() {
  if (!state.currentTx || !isSameDayOrder(state.currentTx)) return;
  setText('delete-order-confirm-text', `${state.currentTx.title} sẽ bị xóa khỏi lịch sử và báo cáo.`);
  document.getElementById('delete-order-confirm-modal')?.classList.remove('hidden');
}

function closeDeleteOrderModal() { document.getElementById('delete-order-confirm-modal')?.classList.add('hidden'); }

async function executeDeleteOrder() {
  const tx = state.currentTx;
  if (!tx || !isSameDayOrder(tx)) return;
  setBusy(true);
  try {
    await runWrite('orders.delete', { id: tx.id });
    closeDeleteOrderModal();
    closeEditOrderModal();
    closeTxDetailModal();
    await refreshAll();
    showToast('Đã xóa đơn hàng.');
  } catch (error) { reportError(error); }
  finally { setBusy(false); }
}

function openEditOrderModal() {
  const tx = state.currentTx;
  if (!tx || tx.type !== 'order') return;
  const rawItems = (tx.detail && tx.detail.rawItems) || [];
  state.editingOrder = {
    id: tx.id,
    title: tx.title,
    paymentMethod: tx.detail && tx.detail.order ? tx.detail.order.payment_method : 'cash',
    items: rawItems
      .filter((item) => item.product_id)
      .map((item) => ({
        productId: item.product_id,
        name: item.product_name,
        price: Number(item.unit_price_vnd) || 0,
        quantity: Number(item.quantity) || 1,
      })),
  };
  const select = document.getElementById('edit-order-product-select');
  if (select) {
    select.replaceChildren();
    state.products.filter((product) => product.active).forEach((product) => {
      const option = document.createElement('option');
      option.value = product.id;
      option.textContent = `${product.name} — ${formatMoney(product.price_vnd)} đ`;
      select.appendChild(option);
    });
  }
  setEditOrderPay(state.editingOrder.paymentMethod === 'transfer' ? 'transfer' : state.editingOrder.paymentMethod === 'debt' ? 'debt' : 'cash');
  setText('edit-order-subtitle', tx.title);
  renderEditOrderItems();
  document.getElementById('edit-order-modal')?.classList.remove('hidden');
}

function closeEditOrderModal() {
  document.getElementById('edit-order-modal')?.classList.add('hidden');
  state.editingOrder = null;
}

function renderEditOrderItems() {
  const container = document.getElementById('edit-order-items');
  const order = state.editingOrder;
  if (!container || !order) return;
  container.replaceChildren();
  if (!order.items.length) {
    container.innerHTML = '<p class="py-4 text-center text-[11px] text-neutral-400 bg-neutral-50 rounded-xl border border-neutral-200/60">Đơn chưa có món — hãy thêm món bên dưới.</p>';
  }
  order.items.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'flex items-center gap-2 bg-neutral-50 rounded-xl p-2 border border-neutral-200/70';
    row.innerHTML = `<div class="min-w-0 flex-1"><p class="text-xs font-bold text-neutral-800 truncate">${escapeHtml(item.name)}</p><p class="text-[10px] text-neutral-400">${formatMoney(item.price)} đ / món</p></div><div class="flex items-center gap-1 shrink-0"><button onclick="editOrderQty(${index},-1)" class="w-7 h-7 rounded-lg bg-white border border-neutral-200 text-neutral-600 font-bold text-sm active:scale-90">−</button><span class="w-6 text-center text-xs font-extrabold text-neutral-900">${item.quantity}</span><button onclick="editOrderQty(${index},1)" class="w-7 h-7 rounded-lg bg-white border border-neutral-200 text-neutral-600 font-bold text-sm active:scale-90">+</button><button onclick="removeEditOrderItem(${index})" class="w-7 h-7 rounded-lg bg-red-50 border border-red-200 text-red-500 flex items-center justify-center active:scale-90"><span class="material-symbols-outlined text-[15px]">delete</span></button></div>`;
    container.appendChild(row);
  });
  const total = order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  setText('edit-order-total', `${formatMoney(total)} đ`);
}

function editOrderQty(index, delta) {
  const order = state.editingOrder;
  if (!order || !order.items[index]) return;
  order.items[index].quantity = Math.max(1, order.items[index].quantity + delta);
  renderEditOrderItems();
}

function removeEditOrderItem(index) {
  const order = state.editingOrder;
  if (!order || !order.items[index]) return;
  order.items.splice(index, 1);
  renderEditOrderItems();
}

function addEditOrderItem() {
  const order = state.editingOrder;
  const select = document.getElementById('edit-order-product-select');
  const product = state.products.find((item) => item.id === select?.value && item.active);
  if (!order || !product) return;
  const existing = order.items.find((item) => item.productId === product.id);
  if (existing) existing.quantity += 1;
  else order.items.push({ productId: product.id, name: product.name, price: product.price_vnd, quantity: 1 });
  renderEditOrderItems();
}

function setEditOrderPay(method) {
  const order = state.editingOrder;
  if (!order) return;
  order.paymentMethod = method === 'transfer' || method === 'debt' ? method : 'cash';
  ['cash', 'transfer', 'debt'].forEach((value) => {
    const button = document.getElementById(`edit-order-pay-${value}`);
    if (button) button.className = value === order.paymentMethod
      ? 'py-1.5 rounded-lg bg-white text-neutral-900 shadow-sm text-center'
      : 'py-1.5 rounded-lg hover:text-neutral-900 text-center';
  });
}

async function saveEditOrder() {
  const order = state.editingOrder;
  if (!order) return;
  if (!order.items.length) {
    showToast('Đơn phải có ít nhất 1 món.', true);
    return;
  }
  setBusy(true);
  try {
    await runWrite('orders.update', {
      id: order.id,
      paymentMethod: order.paymentMethod,
      items: order.items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
    });
    closeEditOrderModal();
    closeTxDetailModal();
    await refreshAll();
    showToast('Đã cập nhật đơn hàng.');
  } catch (error) { reportError(error); }
  finally { setBusy(false); }
}
