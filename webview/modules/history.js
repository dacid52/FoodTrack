// --- history.js ---
// History view logic
function historyRange() {
  const date = new Date(`${state.historyCustomDate}T12:00:00`);
  if (state.historyTimeMode === 'day') return { from: state.historyCustomDate, to: state.historyCustomDate };
  if (state.historyTimeMode === 'week') {
    const from = new Date();
    const weekday = (from.getDay() + 6) % 7;
    from.setDate(from.getDate() - weekday);
    const to = new Date(from);
    to.setDate(to.getDate() + 6);
    return { from: localDate(from), to: localDate(to) };
  }
  if (state.historyTimeMode === 'month') {
    const month = new Date(state.historySelectedYear, state.historySelectedMonth - 1, 1);
    return { from: localDate(month), to: localDate(new Date(month.getFullYear(), month.getMonth() + 1, 0)) };
  }
  return { from: `${state.historySelectedYear}-01-01`, to: `${state.historySelectedYear}-12-31` };
}

function setHistoryTimeMode(mode) {
  state.historyTimeMode = mode;
  ['day', 'week', 'month', 'year'].forEach((value) => {
    const button = document.getElementById(`hist-time-${value}`);
    const controls = document.getElementById(`hist-subctrl-${value}`);
    if (button) button.className = value === mode
      ? 'flex-1 py-1 rounded-lg bg-white text-neutral-900 shadow-sm transition-all text-center text-[11px] font-bold'
      : 'flex-1 py-1 rounded-lg hover:text-neutral-900 transition-all text-center text-[11px] font-medium';
    controls?.classList.toggle('hidden', value !== mode);
  });
  if (mode === 'day') {
    if (state.historyDaySub === 'today') state.historyCustomDate = localDate();
    else if (state.historyDaySub === 'yesterday') state.historyCustomDate = dateOffsetString(localDate(), -1);
  }
  updateHistoryDayControls();
  void refreshHistory();
}

function selectQuickDay(type) {
  state.historyDaySub = type === 'yesterday' ? 'yesterday' : 'today';
  state.historyCustomDate = dateOffsetString(localDate(), state.historyDaySub === 'today' ? 0 : -1);
  updateHistoryDayControls();
  void refreshHistory();
}

function updateHistoryDayControls() {
  const today = document.getElementById('hist-day-today');
  const yesterday = document.getElementById('hist-day-yesterday');
  if (today) today.className = state.historyDaySub === 'today' ? 'px-2 py-1 rounded-lg text-[11px] font-bold bg-neutral-900 text-white' : 'px-2 py-1 rounded-lg text-[11px] font-medium text-neutral-600 bg-neutral-100';
  if (yesterday) yesterday.className = state.historyDaySub === 'yesterday' ? 'px-2 py-1 rounded-lg text-[11px] font-bold bg-neutral-900 text-white' : 'px-2 py-1 rounded-lg text-[11px] font-medium text-neutral-600 bg-neutral-100';
  const dateInput = document.getElementById('hist-custom-date');
  if (dateInput) dateInput.value = state.historyCustomDate;
}

function onCustomDateChange(value) {
  if (!value) return;
  state.historyDaySub = 'custom';
  state.historyCustomDate = value;
  updateHistoryDayControls();
  void refreshHistory();
}

function onMonthSelectChange(value) {
  const [year, month] = value.split('-').map(Number);
  if (Number.isSafeInteger(year) && Number.isSafeInteger(month) && month >= 1 && month <= 12) {
    state.historySelectedYear = year;
    state.historySelectedMonth = month;
  }
  void refreshHistory();
}

function onYearSelectChange(value) {
  const year = Number(value);
  if (Number.isSafeInteger(year) && year > 0) {
    state.historySelectedYear = year;
    void refreshHistory();
  }
}

function populateYearOptions() {
  const yearSelect = document.getElementById('hist-year-select');
  if (!yearSelect) return;
  const current = new Date().getFullYear();
  let earliest = current;
  state.transactions.forEach((item) => {
    const year = Number(String(item.date || '').slice(0, 4));
    if (Number.isSafeInteger(year) && year > 0 && year < earliest) earliest = year;
  });
  // Luôn span tối thiểu 5 năm về trước để user chọn được năm cũ kể cả khi
  // dữ liệu hiện tại chỉ thuộc năm nay; mở rộng theo năm sớm nhất có data (cap 20 năm).
  earliest = Math.min(earliest, state.historySelectedYear, current - 5);
  earliest = Math.max(earliest, current - 20);
  yearSelect.replaceChildren();
  for (let year = current; year >= earliest; year -= 1) {
    const option = document.createElement('option');
    option.value = String(year);
    option.textContent = `Năm ${year}`;
    yearSelect.appendChild(option);
  }
  yearSelect.value = String(state.historySelectedYear);
}

function setHistoryFilter(filter) {
  state.historyFilter = filter;
  ['all', 'order', 'cost_import', 'cost_other'].forEach((value) => {
    const button = document.getElementById(`hist-filter-${value}`);
    if (button) button.className = value === filter
      ? 'flex-1 py-1.5 px-2 rounded-lg font-semibold bg-white text-neutral-900 shadow-sm shrink-0 transition-all text-center'
      : 'flex-1 py-1.5 px-2 rounded-lg hover:text-neutral-900 shrink-0 transition-all text-center';
  });
  renderHistoryView();
}

function filterHistoryList() {
  state.historySearchQuery = document.getElementById('history-search-input')?.value.toLowerCase().trim() || '';
  renderHistoryView();
}

async function refreshHistory() {
  const range = historyRange();
  try {
    state.transactions = await requestNative('history.list', { ...range, limit: 200 });
    populateYearOptions();
    renderHistoryView();
  } catch (error) { reportError(error); }
}

function renderHistoryView() {
  const listNode = document.getElementById('history-items-list');
  if (!listNode) return;
  const range = historyRange();
  const filteredByDate = state.transactions.filter((item) => item.date >= range.from && item.date <= range.to);
  const revenue = filteredByDate.filter((item) => item.amount > 0).reduce((sum, item) => sum + item.amount, 0);
  const cost = -filteredByDate.filter((item) => item.amount < 0).reduce((sum, item) => sum + item.amount, 0);
  const profit = revenue - cost;
  setText('hist-sum-revenue', `+${formatMoney(revenue)} đ`);
  setText('hist-sum-cost', `−${formatMoney(cost)} đ`);
  setText('hist-sum-profit', `${profit >= 0 ? '+' : '−'}${formatMoney(Math.abs(profit))} đ`);
  const summary = document.getElementById('history-period-summary');
  if (summary) summary.textContent = `Đang xem: ${range.from.split('-').reverse().join('/')} – ${range.to.split('-').reverse().join('/')}`;
  let transactions = filteredByDate;
  if (state.historyFilter !== 'all') transactions = transactions.filter((item) => item.type === state.historyFilter);
  if (state.historySearchQuery) {
    const query = state.historySearchQuery;
    transactions = transactions.filter((item) => `${item.title} ${item.id} ${item.desc}`.toLowerCase().includes(query));
  }
  listNode.replaceChildren();
  transactions.forEach((transaction) => {
    const order = transaction.type === 'order';
    const purchase = transaction.type === 'cost_import';
    const row = document.createElement('div');
    row.className = 'bg-white p-3 rounded-2xl border border-neutral-200/80 shadow-sm flex items-start justify-between cursor-pointer hover:bg-neutral-50 active:scale-[0.99] transition-all';
    row.innerHTML = `<div class="flex items-start gap-3 flex-1 min-w-0 pr-2"><div class="w-9 h-9 rounded-xl ${order ? 'bg-emerald-50 text-emerald-600' : purchase ? 'bg-orange-50 text-orange-600' : 'bg-neutral-100 text-neutral-700'} flex items-center justify-center shrink-0 mt-0.5"><span class="material-symbols-outlined text-[18px]">${order ? 'point_of_sale' : purchase ? 'inventory_2' : 'receipt_long'}</span></div><div class="min-w-0 flex-1"><div class="flex items-center gap-1.5 flex-wrap"><span class="text-xs font-bold text-neutral-900">${escapeHtml(transaction.title)}</span><span class="text-[9px] px-1.5 py-0.5 rounded font-bold ${order ? 'bg-emerald-50 text-emerald-700' : purchase ? 'bg-orange-50 text-orange-700' : 'bg-neutral-100 text-neutral-700'}">${order ? 'Đơn hàng' : purchase ? 'Tiền nhập hàng' : 'Chi phí khác'}</span></div><p class="text-[11px] text-neutral-500 line-clamp-1 mt-0.5">${escapeHtml(transaction.desc || 'Chi tiết giao dịch')}</p><div class="flex items-center gap-2 text-[10px] text-neutral-400 mt-1"><span>${escapeHtml(transaction.time)}</span><span>•</span><span class="px-1.5 py-0.2 rounded bg-neutral-100 text-neutral-600 font-medium">${escapeHtml(transaction.method)}</span></div></div></div><div class="text-right shrink-0"><span class="text-xs font-extrabold ${transaction.amount > 0 ? 'text-emerald-600' : 'text-orange-600'}">${transaction.amount > 0 ? '+' : '−'}${formatMoney(Math.abs(transaction.amount))} đ</span><span class="block text-[9px] text-neutral-400 mt-1">Chi tiết ›</span></div>`;
    row.addEventListener('click', () => void openTxDetailModal(transaction));
    listNode.appendChild(row);
  });
  if (!transactions.length) listNode.innerHTML = '<div class="py-10 text-center text-neutral-400 bg-white rounded-2xl border border-neutral-200/60 p-4"><span class="material-symbols-outlined text-4xl text-neutral-300 mb-1">search_off</span><p class="text-xs font-semibold text-neutral-600">Không có giao dịch.</p></div>';
}

function initializeHistoryControls() {
  const dateInput = document.getElementById('hist-custom-date');
  if (dateInput) dateInput.value = state.historyCustomDate;
  updateHistoryDayControls();

  const monthSelect = document.getElementById('hist-month-select');
  if (monthSelect) {
    monthSelect.replaceChildren();
    const current = new Date();
    for (let offset = 0; offset < 12; offset += 1) {
      const month = new Date(current.getFullYear(), current.getMonth() - offset, 1);
      const option = document.createElement('option');
      option.value = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
      option.textContent = `Tháng ${String(month.getMonth() + 1).padStart(2, '0')}/${month.getFullYear()}`;
      monthSelect.appendChild(option);
    }
    monthSelect.value = `${state.historySelectedYear}-${String(state.historySelectedMonth).padStart(2, '0')}`;
  }

  populateYearOptions();
}
