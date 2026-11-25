// --- expenses.js ---
// Expenses and transaction details logic
function normalizeOccurredAt(raw) {
  if (typeof raw === 'string') {
    const cleaned = raw.trim().replace('T', ' ').slice(0, 19);
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(cleaned)) return cleaned;
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(cleaned)) return `${cleaned}:00`;
  }
  const now = new Date();
  return `${localDate(now)} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
}

function openExpenseModal(type) {
  state.editingExpense = null;
  state.expenseType = type === 'other' ? 'other' : 'import';
  setText('expense-modal-title', 'Ghi nhận chi phí');
  const amountInput = document.getElementById('exp-amount-input');
  if (amountInput) { amountInput.value = ''; delete amountInput.dataset.raw; }
  ['exp-content-input', 'exp-note-input'].forEach((id) => { const input = document.getElementById(id); if (input) input.value = ''; });
  updateExpenseButtonText();
  showOverlay(document.getElementById('expense-modal'));
  setExpenseType(state.expenseType);
  setExpensePayMethod('cash');
  requestAnimationFrame(() => {
    positionSlidingPill('exp-type-pill', `exp-type-${state.expenseType}`);
    positionSlidingPill('exp-pay-pill', `exp-pay-${state.expensePayMethod}`);
  });
}

function openEditExpenseModal(tx) {
  if (!tx || !isSameDayExpense(tx)) return;
  const exp = tx.detail && tx.detail.expense;
  state.editingExpense = {
    id: tx.id,
    occurredAt: normalizeOccurredAt((exp && exp.occurred_at) || tx.occurred_at),
  };
  state.expenseType = tx.type === 'cost_import' ? 'import' : 'other';
  setText('expense-modal-title', 'Chỉnh sửa chi phí');
  const amountInput = document.getElementById('exp-amount-input');
  if (amountInput) {
    amountInput.value = String(Math.abs(Number((exp && exp.amount_vnd) || tx.amount) || 0));
    formatExpenseAmountInput();
  }
  const contentInput = document.getElementById('exp-content-input');
  if (contentInput) contentInput.value = (exp && exp.title) || tx.title || '';
  const noteInput = document.getElementById('exp-note-input');
  if (noteInput) noteInput.value = (exp && exp.note != null) ? exp.note : (tx.desc || '');
  updateExpenseButtonText();
  showOverlay(document.getElementById('expense-modal'));
  setExpenseType(state.expenseType);
  setExpensePayMethod((exp && exp.payment_method) || tx.payment_method || tx.method || 'cash');
  requestAnimationFrame(() => {
    positionSlidingPill('exp-type-pill', `exp-type-${state.expenseType}`);
    positionSlidingPill('exp-pay-pill', `exp-pay-${state.expensePayMethod}`);
  });
}

function closeExpenseModal() {
  hideOverlay(document.getElementById('expense-modal'));
  state.editingExpense = null;
}

function setExpenseType(type) {
  state.expenseType = type === 'other' ? 'other' : 'import';
  const importButton = document.getElementById('exp-type-import');
  const otherButton = document.getElementById('exp-type-other');
  if (importButton) importButton.className = state.expenseType === 'import'
    ? 'flex-1 relative py-1.5 rounded-lg text-neutral-900 font-semibold transition-colors text-center'
    : 'flex-1 relative py-1.5 rounded-lg text-neutral-500 hover:text-neutral-900 font-medium transition-colors text-center';
  if (otherButton) otherButton.className = state.expenseType === 'other'
    ? 'flex-1 relative py-1.5 rounded-lg text-neutral-900 font-semibold transition-colors text-center'
    : 'flex-1 relative py-1.5 rounded-lg text-neutral-500 hover:text-neutral-900 font-medium transition-colors text-center';
  positionSlidingPill('exp-type-pill', `exp-type-${state.expenseType}`);
}

function setExpensePayMethod(method) {
  state.expensePayMethod = method === 'transfer' || method === 'Chuyển khoản'
    ? 'transfer'
    : method === 'debt' || method === 'Ghi nợ' ? 'debt' : 'cash';
  ['cash', 'transfer', 'debt'].forEach((value) => {
    const button = document.getElementById(`exp-pay-${value}`);
    if (button) button.className = value === state.expensePayMethod
      ? 'relative py-1.5 px-1 rounded-lg text-[11px] sm:text-xs font-bold text-neutral-900 whitespace-nowrap transition-colors text-center'
      : 'relative py-1.5 px-1 rounded-lg text-[11px] sm:text-xs font-medium text-neutral-600 hover:text-neutral-900 whitespace-nowrap transition-colors text-center';
  });
  positionSlidingPill('exp-pay-pill', `exp-pay-${state.expensePayMethod}`);
}

function formatExpenseAmountInput() {
  formatVndInput(document.getElementById('exp-amount-input'));
}

function expenseAmountValue() {
  return parseVndInput(document.getElementById('exp-amount-input'));
}

function updateExpenseButtonText() {
  const amount = expenseAmountValue();
  const baseLabel = state.editingExpense ? 'Lưu thay đổi' : 'Lưu chi phí';
  setText('btn-save-expense-text', amount > 0 ? `${baseLabel} (${formatMoney(amount)} đ)` : baseLabel);
}

async function saveExpenseRecord() {
  if (state.busy) return;
  const amount = expenseAmountValue();
  const title = document.getElementById('exp-content-input')?.value.trim() || '';
  const note = document.getElementById('exp-note-input')?.value.trim() || '';
  if (!Number.isSafeInteger(amount) || amount <= 0 || !title) {
    showToast('Nhập nội dung và số tiền hợp lệ.', true);
    return;
  }
  const editing = state.editingExpense;
  const occurredAt = editing ? editing.occurredAt : normalizeOccurredAt();
  setBusy(true);
  try {
    if (editing) {
      await runWrite('expenses.update', {
        id: editing.id,
        category: state.expenseType === 'import' ? 'purchase' : 'other',
        amountVnd: amount,
        title,
        note,
        paymentMethod: state.expensePayMethod,
        occurredAt,
      });
      closeExpenseModal();
      closeTxDetailModal();
      await refreshAll();
      showToast('Đã cập nhật khoản chi.');
    } else {
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
    }
  } catch (error) { reportError(error); }
  finally { setBusy(false); }
}

function isSameDayOrder(transaction) {
  return Boolean(transaction) && transaction.type === 'order' && transaction.date === localDate();
}

function isSameDayExpense(transaction) {
  return Boolean(transaction) && (transaction.type === 'cost_import' || transaction.type === 'cost_other') && transaction.date === localDate();
}

function isSameDayTransaction(transaction) {
  return isSameDayOrder(transaction) || isSameDayExpense(transaction);
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
    row.innerHTML = `<div class="min-w-0 flex-1"><p class="text-xs font-semibold text-neutral-800 truncate">${escapeHtml(item.product_name)}</p><p class="text-[10px] text-neutral-400 tabular-nums">${formatMoney(item.unit_price_vnd || 0)} đ / phần</p></div><div class="text-right shrink-0"><span class="inline-block text-[11px] font-extrabold text-neutral-900 bg-neutral-100 px-2 py-0.5 rounded-lg tabular-nums">x${item.quantity}</span><p class="text-[10px] text-neutral-400 mt-0.5 tabular-nums whitespace-nowrap">${formatMoney(lineTotal)} đ</p></div>`;
    container.appendChild(row);
  });
}

let _txDetailReqId = 0;

async function openTxDetailModal(transaction) {
  const reqId = ++_txDetailReqId;
  try {
    const detail = await requestNative('history.detail', { id: transaction.id });
    if (reqId !== _txDetailReqId) return;
    const tx = { ...transaction, ...detail, detail };
    state.currentTx = tx;
    const income = tx.amount > 0;
    const isOrder = tx.type === 'order';
    const isImport = tx.type === 'cost_import';
    const badgeEl = document.getElementById('tx-modal-type-badge');
    if (badgeEl) {
      badgeEl.textContent = income ? 'Đơn hàng thành công' : isImport ? 'Chi tiền nhập hàng' : 'Chi phí khác';
      badgeEl.className = income
        ? 'px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800'
        : isImport
          ? 'px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-orange-100 text-orange-800'
          : 'px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-neutral-200/80 text-neutral-700';
    }
    const amtEl = document.getElementById('tx-modal-amount');
    if (amtEl) {
      amtEl.textContent = `${income ? '+' : '−'}${formatMoney(Math.abs(tx.amount))} đ`;
      amtEl.className = `text-2xl font-extrabold mt-1.5 tabular-nums ${income ? 'text-emerald-600' : 'text-orange-600'}`;
    }
    setText('tx-modal-title', tx.title);
    setText('tx-modal-time', formatDateTimeVi(tx.occurred_at) || formatTime(tx.occurred_at));
    setText('tx-modal-method', tx.method);
    setText('tx-modal-id', tx.id);
    document.getElementById('tx-modal-desc-wrap')?.classList.toggle('hidden', isOrder);
    document.getElementById('tx-modal-items-wrap')?.classList.toggle('hidden', !isOrder);
    if (isOrder) {
      renderTxModalItems(detail.rawItems || []);
    } else {
      setText('tx-modal-desc', detail.items || '—');
    }
    const actions = document.getElementById('tx-modal-actions');
    const editable = isSameDayTransaction(tx);
    setText('tx-modal-delete-label', isOrder ? 'Xóa đơn' : 'Xóa chi phí');
    actions?.classList.toggle('hidden', !editable);
    actions?.classList.toggle('flex', editable);
    showOverlay(document.getElementById('tx-detail-modal'));
  } catch (error) {
    if (reqId === _txDetailReqId) reportError(error);
  }
}

function closeTxDetailModal() { hideOverlay(document.getElementById('tx-detail-modal')); }

// --- Sửa / xóa đơn hàng & khoản chi trong ngày ---
function promptDeleteOrder() {
  const tx = state.currentTx;
  if (!tx) return;
  if (!isSameDayTransaction(tx)) {
    showToast('Chỉ sửa/xóa được giao dịch trong ngày hôm nay.', 'info');
    return;
  }
  const isOrder = tx.type === 'order';
  setText('delete-order-confirm-title', isOrder ? 'Xóa đơn hàng này?' : 'Xóa khoản chi này?');
  setText('delete-order-confirm-btn-label', isOrder ? 'Xóa đơn' : 'Xóa chi phí');
  setText('delete-order-confirm-text', `${tx.title} sẽ bị xóa khỏi lịch sử và báo cáo.`);
  showOverlay(document.getElementById('delete-order-confirm-modal'));
}

function closeDeleteOrderModal() { hideOverlay(document.getElementById('delete-order-confirm-modal')); }

async function executeDeleteOrder() {
  const tx = state.currentTx;
  if (!tx || !isSameDayTransaction(tx) || state.busy) return;
  const isOrder = tx.type === 'order';
  setBusy(true);
  try {
    await runWrite(isOrder ? 'orders.delete' : 'expenses.delete', { id: tx.id });
    closeDeleteOrderModal();
    closeEditOrderModal();
    closeExpenseModal();
    closeTxDetailModal();
    await refreshAll();
    showToast(isOrder ? 'Đã xóa đơn hàng.' : 'Đã xóa khoản chi.');
  } catch (error) { reportError(error); }
  finally { setBusy(false); }
}

function openEditOrderModal() {
  const tx = state.currentTx;
  if (!tx) return;
  if (!isSameDayTransaction(tx)) {
    showToast('Chỉ sửa/xóa được giao dịch trong ngày hôm nay.', 'info');
    return;
  }
  if (tx.type !== 'order') {
    openEditExpenseModal(tx);
    return;
  }
  const rawItems = (tx.detail && tx.detail.rawItems) || [];
  state.editingOrder = {
    id: tx.id,
    title: tx.title,
    paymentMethod: tx.detail && tx.detail.order ? tx.detail.order.payment_method : 'cash',
    items: rawItems
      .filter((item) => item.product_id)
      .map((item) => {
        const catalogProduct = state.products.find((p) => p.id === item.product_id);
        return {
          productId: item.product_id,
          name: catalogProduct ? catalogProduct.name : item.product_name,
          price: catalogProduct ? (Number(catalogProduct.price_vnd) || 0) : (Number(item.unit_price_vnd) || 0),
          quantity: Number(item.quantity) || 1,
        };
      }),
  };
  const select = document.getElementById('edit-order-product-select');
  const addBtn = document.getElementById('edit-order-add-btn');
  if (select) {
    select.replaceChildren();
    const activeProducts = state.products.filter((product) => product.active);
    select.disabled = !activeProducts.length;
    if (addBtn) addBtn.disabled = !activeProducts.length;
    if (!activeProducts.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'Không có món đang bán';
      select.appendChild(option);
    } else {
      activeProducts.forEach((product) => {
        const option = document.createElement('option');
        option.value = product.id;
        option.textContent = `${product.name} — ${formatMoney(product.price_vnd)} đ`;
        select.appendChild(option);
      });
    }
  }
  setEditOrderPay(state.editingOrder.paymentMethod === 'transfer' ? 'transfer' : state.editingOrder.paymentMethod === 'debt' ? 'debt' : 'cash');
  setText('edit-order-subtitle', tx.title);
  renderEditOrderItems();
  showOverlay(document.getElementById('edit-order-modal'));
}

function closeEditOrderModal() {
  hideOverlay(document.getElementById('edit-order-modal'));
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
      ? 'py-1.5 px-1 rounded-lg bg-white text-neutral-900 shadow-sm whitespace-nowrap text-center'
      : 'py-1.5 px-1 rounded-lg hover:text-neutral-900 whitespace-nowrap text-center';
  });
}

async function saveEditOrder() {
  const order = state.editingOrder;
  if (!order || state.busy) return;
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
