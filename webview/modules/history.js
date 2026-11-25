// --- history.js ---
// History view logic + Custom Date / Month / Year Bottom Sheet Picker
let _histPickerViewYear = new Date().getFullYear();
let _histPickerViewMonth = new Date().getMonth() + 1;

function historyRange() {
  if (state.historyTimeMode === 'day') return { from: state.historyCustomDate, to: state.historyCustomDate };
  if (state.historyTimeMode === 'month') {
    const month = new Date(state.historySelectedYear, state.historySelectedMonth - 1, 1);
    return { from: localDate(month), to: localDate(new Date(month.getFullYear(), month.getMonth() + 1, 0)) };
  }
  return { from: `${state.historySelectedYear}-01-01`, to: `${state.historySelectedYear}-12-31` };
}

function updateHistTimePill() {
  const pill = document.getElementById('hist-time-pill');
  const btn = document.getElementById(`hist-time-${state.historyTimeMode}`);
  if (pill && btn) {
    pill.style.width = `${btn.offsetWidth}px`;
    pill.style.transform = `translateX(${btn.offsetLeft}px)`;
  }
}

function isHistoryAtCurrent() {
  const now = new Date();
  if (state.historyTimeMode === 'day') return state.historyCustomDate >= localDate(now);
  if (state.historyTimeMode === 'month') {
    return state.historySelectedYear > now.getFullYear()
      || (state.historySelectedYear === now.getFullYear() && state.historySelectedMonth >= now.getMonth() + 1);
  }
  return state.historySelectedYear >= now.getFullYear();
}

function formatHistoryPickerLabel() {
  if (state.historyTimeMode === 'day') {
    const iso = state.historyCustomDate || localDate();
    const todayIso = localDate();
    const dmy = iso.split('-').reverse().join('/');
    if (iso === todayIso) return `Hôm nay • ${dmy}`;
    if (iso === dateOffsetString(todayIso, -1)) return `Hôm qua • ${dmy}`;
    const wdNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    const wd = wdNames[new Date(`${iso}T12:00:00`).getDay()];
    return `${wd} • ${dmy}`;
  }
  if (state.historyTimeMode === 'month') {
    return `Tháng ${state.historySelectedMonth} • ${state.historySelectedYear}`;
  }
  return `Năm ${state.historySelectedYear}`;
}

function updateHistoryPeriodBar() {
  setText('hist-picker-label', formatHistoryPickerLabel());
  const atCurrent = isHistoryAtCurrent();
  const nextBtn = document.getElementById('hist-step-next');
  if (nextBtn) nextBtn.disabled = atCurrent;

  const jumpLabels = { day: 'Hôm nay', month: 'Tháng này', year: 'Năm nay' };
  setText('hist-today-label', jumpLabels[state.historyTimeMode] || 'Hôm nay');

  const jumpBtn = document.getElementById('hist-day-today');
  if (jumpBtn) {
    jumpBtn.className = atCurrent
      ? 'shrink-0 h-8 px-2.5 rounded-xl text-[11px] font-semibold bg-neutral-100 text-neutral-400 active:scale-95 transition-all flex items-center justify-center whitespace-nowrap'
      : 'shrink-0 h-8 px-2.5 rounded-xl text-[11px] font-bold bg-neutral-900 text-white shadow-sm active:scale-95 transition-all flex items-center justify-center whitespace-nowrap';
  }
}

function setHistoryTimeMode(mode) {
  const normalized = ['day', 'month', 'year'].includes(mode) ? mode : 'day';
  state.historyTimeMode = normalized;
  ['day', 'month', 'year'].forEach((value) => {
    const button = document.getElementById(`hist-time-${value}`);
    if (button) button.className = value === normalized
      ? 'flex-1 relative py-1 rounded-lg text-neutral-900 text-center text-[11px] font-bold whitespace-nowrap transition-colors'
      : 'flex-1 relative py-1 rounded-lg text-neutral-500 hover:text-neutral-900 text-center text-[11px] font-medium whitespace-nowrap transition-colors';
  });
  if (normalized === 'day' && !state.historyCustomDate) state.historyCustomDate = localDate();
  updateHistTimePill();
  updateHistoryPeriodBar();
  void refreshHistory();
}

function stepHistoryPeriod(delta) {
  const now = new Date();
  if (state.historyTimeMode === 'day') {
    const next = dateOffsetString(state.historyCustomDate || localDate(now), delta);
    if (next > localDate(now)) return;
    state.historyCustomDate = next;
    state.historyDaySub = next === localDate(now) ? 'today' : 'custom';
  } else if (state.historyTimeMode === 'month') {
    const d = new Date(state.historySelectedYear, state.historySelectedMonth - 1 + delta, 1);
    const curStart = new Date(now.getFullYear(), now.getMonth(), 1);
    if (d > curStart) return;
    state.historySelectedYear = d.getFullYear();
    state.historySelectedMonth = d.getMonth() + 1;
  } else {
    const nextY = state.historySelectedYear + delta;
    if (nextY > now.getFullYear() || nextY < 2000) return;
    state.historySelectedYear = nextY;
  }
  updateHistoryPeriodBar();
  void refreshHistory();
}

function jumpHistoryToCurrent(inPicker) {
  const now = new Date();
  if (state.historyTimeMode === 'day') {
    state.historyCustomDate = localDate(now);
    state.historyDaySub = 'today';
    _histPickerViewYear = now.getFullYear();
    _histPickerViewMonth = now.getMonth() + 1;
  } else if (state.historyTimeMode === 'month') {
    state.historySelectedYear = now.getFullYear();
    state.historySelectedMonth = now.getMonth() + 1;
    _histPickerViewYear = now.getFullYear();
  } else {
    state.historySelectedYear = now.getFullYear();
  }
  if (inPicker) renderHistoryPickerModal(null, true);
  updateHistoryPeriodBar();
  void refreshHistory();
}

// Giữ tương thích nếu có chỗ gọi cũ
function selectQuickDay() { jumpHistoryToCurrent(false); }
function onCustomDateChange(value) {
  if (!value) return;
  state.historyCustomDate = value;
  updateHistoryPeriodBar();
  void refreshHistory();
}
function onMonthSelectChange() {}
function onYearSelectChange() {}

// ================= CUSTOM BOTTOM SHEET PICKER =================
function openHistoryDatePicker() {
  const now = new Date();
  if (state.historyTimeMode === 'day') {
    const base = new Date(`${state.historyCustomDate || localDate(now)}T12:00:00`);
    _histPickerViewYear = base.getFullYear();
    _histPickerViewMonth = base.getMonth() + 1;
  } else {
    _histPickerViewYear = state.historySelectedYear || now.getFullYear();
    _histPickerViewMonth = state.historySelectedMonth || (now.getMonth() + 1);
  }
  renderHistoryPickerModal();
  const modal = document.getElementById('history-date-picker-modal');
  if (modal) {
    delete modal.dataset.ftClosing;
    modal.classList.remove('ft-overlay-out', 'ft-sheet-settled', 'hidden');
    resetSheetDragStyles(modal, true);
  }
}

function closeHistoryDatePicker() {
  hideOverlay(document.getElementById('history-date-picker-modal'));
}

function navHistoryPicker(delta) {
  const now = new Date();
  if (state.historyTimeMode === 'day') {
    const d = new Date(_histPickerViewYear, _histPickerViewMonth - 1 + delta, 1);
    const curMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    if (d > curMonth) return;
    _histPickerViewYear = d.getFullYear();
    _histPickerViewMonth = d.getMonth() + 1;
  } else if (state.historyTimeMode === 'month') {
    const nextY = _histPickerViewYear + delta;
    if (nextY > now.getFullYear() || nextY < 2000) return;
    _histPickerViewYear = nextY;
  }
  renderHistoryPickerModal(delta > 0 ? 'right' : 'left');
}

function pickHistoryDate(iso) {
  if (!iso || iso > localDate()) return;
  state.historyCustomDate = iso;
  state.historyDaySub = iso === localDate() ? 'today' : 'custom';
  renderHistoryPickerModal(null, true);
  updateHistoryPeriodBar();
  void refreshHistory();
}

function pickHistoryMonth(year, month) {
  const now = new Date();
  if (year > now.getFullYear() || (year === now.getFullYear() && month > now.getMonth() + 1)) return;
  state.historySelectedYear = year;
  state.historySelectedMonth = month;
  renderHistoryPickerModal(null, true);
  updateHistoryPeriodBar();
  void refreshHistory();
}

function pickHistoryYear(year) {
  const now = new Date();
  if (year > now.getFullYear()) return;
  state.historySelectedYear = year;
  renderHistoryPickerModal(null, true);
  updateHistoryPeriodBar();
  void refreshHistory();
}

function buildDayActivityMap() {
  const map = new Map();
  const source = [...(state.transactions || []), ...(state.historyTransactions || [])];
  const seenIds = new Set();
  source.forEach((tx) => {
    if (!tx || !tx.date || seenIds.has(tx.id)) return;
    seenIds.add(tx.id);
    const cur = map.get(tx.date) || 0;
    map.set(tx.date, cur + (Number(tx.amount) || 0));
  });
  return map;
}

function renderHistoryPickerModal(slideDir, animateSelection) {
  const body = document.getElementById('hist-picker-body');
  const nav = document.getElementById('hist-picker-modal-nav');
  const nextBtn = document.getElementById('hist-picker-modal-next');
  const yearBadge = document.getElementById('hist-picker-modal-year');
  const jumpBtn = document.getElementById('hist-picker-modal-jump');
  if (!body) return;

  const now = new Date();
  const todayIso = localDate(now);
  const mode = state.historyTimeMode;
  const animCls = slideDir === 'right' ? 'ft-cal-in-right' : slideDir === 'left' ? 'ft-cal-in-left' : '';
  const pickPopCls = animateSelection ? ' ft-cal-pick-pop' : '';

  setText('hist-picker-modal-jump', mode === 'day' ? 'Hôm nay' : mode === 'month' ? 'Tháng này' : 'Năm nay');
  if (jumpBtn) {
    const atCur = isHistoryAtCurrent();
    jumpBtn.className = atCur
      ? 'h-8 px-2.5 rounded-full text-[11px] font-semibold bg-neutral-100 text-neutral-400 active:scale-95 transition-all'
      : 'h-8 px-2.5 rounded-full text-[11px] font-bold bg-orange-50 text-primary border border-orange-200/70 active:scale-95 transition-all';
  }

  if (mode === 'day') {
    nav?.classList.remove('hidden');
    nav?.classList.add('flex');
    setText('hist-picker-modal-title', `Tháng ${_histPickerViewMonth}`);
    if (yearBadge) {
      yearBadge.textContent = String(_histPickerViewYear);
      yearBadge.classList.remove('hidden');
    }
    if (nextBtn) {
      nextBtn.disabled = _histPickerViewYear > now.getFullYear()
        || (_histPickerViewYear === now.getFullYear() && _histPickerViewMonth >= now.getMonth() + 1);
    }

    const firstDay = new Date(_histPickerViewYear, _histPickerViewMonth - 1, 1);
    const daysInMonth = new Date(_histPickerViewYear, _histPickerViewMonth, 0).getDate();
    const prevMonthDays = new Date(_histPickerViewYear, _histPickerViewMonth - 1, 0).getDate();
    const startOffset = (firstDay.getDay() + 6) % 7; // T2 = 0 .. CN = 6
    const totalCells = 42; // Cố định luôn 6 hàng (42 ô) để cửa sổ lịch không bao giờ dịch lên xuống khi lật tháng
    const activity = buildDayActivityMap();

    const weekdaysHtml = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']
      .map((w, i) => `<div class="text-center text-[10px] font-bold py-1 ${i >= 5 ? 'text-orange-400/90' : 'text-neutral-400'}">${w}</div>`)
      .join('');

    let cellsHtml = '';
    // Các ngày mờ của tháng trước để lấp đều hàng đầu
    for (let i = startOffset - 1; i >= 0; i -= 1) {
      const prevD = prevMonthDays - i;
      cellsHtml += `<div class="flex items-center justify-center h-11"><span class="text-xs font-medium text-neutral-200 tabular-nums select-none">${prevD}</span></div>`;
    }

    const yStr = String(_histPickerViewYear);
    const mStr = String(_histPickerViewMonth).padStart(2, '0');
    for (let d = 1; d <= daysInMonth; d += 1) {
      const iso = `${yStr}-${mStr}-${String(d).padStart(2, '0')}`;
      const isSelected = iso === state.historyCustomDate;
      const isToday = iso === todayIso;
      const isFuture = iso > todayIso;
      const hasTx = activity.has(iso);
      const dayNet = activity.get(iso) || 0;
      const dotColor = isSelected
        ? (dayNet >= 0 ? 'bg-emerald-300' : 'bg-orange-300')
        : (dayNet >= 0 ? 'bg-emerald-500' : 'bg-orange-400');

      const circleCls = isFuture
        ? 'w-10 h-10 rounded-full flex flex-col items-center justify-center text-xs font-medium text-neutral-300 pointer-events-none tabular-nums'
        : isSelected
          ? `w-10 h-10 rounded-full flex flex-col items-center justify-center text-[13px] font-bold bg-gradient-to-br from-[#32343a] to-[#1a1b1e] text-white shadow-md active:scale-95 transition-all tabular-nums${pickPopCls}`
          : isToday
            ? 'w-10 h-10 rounded-full flex flex-col items-center justify-center text-[13px] font-bold text-primary bg-orange-50/70 ring-1 ring-primary/45 hover:bg-orange-100/60 active:scale-95 transition-all tabular-nums'
            : 'w-10 h-10 rounded-full flex flex-col items-center justify-center text-[13px] font-semibold text-neutral-700 hover:bg-neutral-100 active:scale-95 transition-all tabular-nums';

      cellsHtml += `
        <div class="flex items-center justify-center h-11">
          <button type="button" class="${circleCls}" ${isFuture ? 'disabled' : `onclick="pickHistoryDate('${iso}')"`}>
            <span class="leading-none">${d}</span>
            <span class="w-1 h-1 rounded-full mt-1 ${hasTx && !isFuture ? dotColor : 'opacity-0'}"></span>
          </button>
        </div>
      `;
    }

    // Các ngày mờ của tháng sau để lấp đều hàng cuối
    const trailing = totalCells - (startOffset + daysInMonth);
    for (let nextD = 1; nextD <= trailing; nextD += 1) {
      cellsHtml += `<div class="flex items-center justify-center h-11"><span class="text-xs font-medium text-neutral-200 tabular-nums select-none">${nextD}</span></div>`;
    }

    body.innerHTML = `
      <div class="grid grid-cols-7 bg-neutral-50/90 rounded-xl px-1 py-1 mb-1.5 border border-neutral-100">${weekdaysHtml}</div>
      <div class="grid grid-cols-7 px-1 ${animCls}">${cellsHtml}</div>
      <div class="flex items-center justify-center gap-5 mt-3 pt-2.5 border-t border-neutral-100 text-[10px] text-neutral-400 font-medium">
        <span class="flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>Ngày có lãi</span>
        <span class="flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-orange-400"></span>Ngày chi nhiều</span>
      </div>
    `;
    return;
  }

  if (mode === 'month') {
    nav?.classList.remove('hidden');
    nav?.classList.add('flex');
    setText('hist-picker-modal-title', `Năm ${_histPickerViewYear}`);
    yearBadge?.classList.add('hidden');
    if (nextBtn) nextBtn.disabled = _histPickerViewYear >= now.getFullYear();

    const activeMonths = new Set(
      [...(state.transactions || []), ...(state.historyTransactions || [])]
        .filter((t) => t && t.date && t.date.startsWith(`${_histPickerViewYear}-`))
        .map((t) => Number(t.date.slice(5, 7)))
    );

    let html = `<div class="grid grid-cols-3 gap-2 pt-1 ${animCls}">`;
    for (let m = 1; m <= 12; m += 1) {
      const isSelected = _histPickerViewYear === state.historySelectedYear && m === state.historySelectedMonth;
      const isCurMonth = _histPickerViewYear === now.getFullYear() && m === now.getMonth() + 1;
      const isFuture = _histPickerViewYear > now.getFullYear() || (_histPickerViewYear === now.getFullYear() && m > now.getMonth() + 1);
      const hasData = activeMonths.has(m);
      const cls = isFuture
        ? 'h-12 rounded-2xl flex flex-col items-center justify-center text-xs font-medium text-neutral-300 bg-neutral-50/60 pointer-events-none tabular-nums'
        : isSelected
          ? `h-12 rounded-2xl flex flex-col items-center justify-center text-xs font-bold bg-gradient-to-br from-[#32343a] to-[#1a1b1e] text-white shadow-md active:scale-95 transition-all tabular-nums${pickPopCls}`
          : isCurMonth
            ? 'h-12 rounded-2xl flex flex-col items-center justify-center text-xs font-bold bg-orange-50/70 text-primary ring-1 ring-primary/40 hover:bg-orange-100/60 active:scale-95 transition-all tabular-nums'
            : 'h-12 rounded-2xl flex flex-col items-center justify-center text-xs font-semibold bg-neutral-50 text-neutral-700 hover:bg-neutral-100 border border-neutral-200/60 active:scale-95 transition-all tabular-nums';
      html += `
        <button type="button" class="${cls}" ${isFuture ? 'disabled' : `onclick="pickHistoryMonth(${_histPickerViewYear}, ${m})"`}>
          <span class="leading-none">Tháng ${m}</span>
          <span class="w-1 h-1 rounded-full mt-1.5 ${hasData && !isFuture ? (isSelected ? 'bg-emerald-300' : 'bg-emerald-500') : 'opacity-0'}"></span>
        </button>
      `;
    }
    html += '</div>';
    body.innerHTML = html;
    return;
  }

  // Năm
  nav?.classList.add('hidden');
  setText('hist-picker-modal-title', 'Chọn năm');
  yearBadge?.classList.add('hidden');
  const curY = now.getFullYear();
  let earliest = curY - 8;
  (state.transactions || []).forEach((item) => {
    const y = Number(String(item.date || '').slice(0, 4));
    if (Number.isSafeInteger(y) && y > 2000 && y < earliest) earliest = y;
  });
  let html = '<div class="grid grid-cols-3 gap-2 pt-1">';
  for (let y = curY; y >= earliest; y -= 1) {
    const isSelected = y === state.historySelectedYear;
    const isCur = y === curY;
    const cls = isSelected
      ? `h-12 rounded-2xl text-xs font-bold bg-gradient-to-br from-[#32343a] to-[#1a1b1e] text-white shadow-md active:scale-95 transition-all tabular-nums${pickPopCls}`
      : isCur
        ? 'h-12 rounded-2xl text-xs font-bold bg-orange-50/70 text-primary ring-1 ring-primary/40 hover:bg-orange-100/60 active:scale-95 transition-all tabular-nums'
        : 'h-12 rounded-2xl text-xs font-semibold bg-neutral-50 text-neutral-700 hover:bg-neutral-100 border border-neutral-200/60 active:scale-95 transition-all tabular-nums';
    html += `<button type="button" class="${cls}" onclick="pickHistoryYear(${y})">${y}</button>`;
  }
  html += '</div>';
  body.innerHTML = html;
}

// ================= FILTER & LIST RENDERING =================
function updateHistFilterPill() {
  const pill = document.getElementById('hist-filter-pill');
  const btn = document.getElementById(`hist-filter-${state.historyFilter}`);
  if (pill && btn) {
    pill.style.width = `${btn.offsetWidth}px`;
    pill.style.transform = `translateX(${btn.offsetLeft}px)`;
  }
}

function setHistoryFilter(filter) {
  state.historyFilter = filter;
  ['all', 'order', 'cost_import', 'cost_other'].forEach((value) => {
    const button = document.getElementById(`hist-filter-${value}`);
    if (button) button.className = value === filter
      ? 'flex-1 relative py-1.5 px-2 rounded-lg font-semibold text-neutral-900 shrink-0 text-center transition-colors'
      : 'flex-1 relative py-1.5 px-2 rounded-lg text-neutral-500 hover:text-neutral-900 shrink-0 text-center transition-colors';
  });
  updateHistFilterPill();
  renderHistoryView();
}

function filterHistoryList() {
  state.historySearchQuery = document.getElementById('history-search-input')?.value.toLowerCase().trim() || '';
  renderHistoryView();
}

async function refreshHistory() {
  const range = historyRange();
  updateHistTimePill();
  updateHistFilterPill();
  updateHistoryPeriodBar();
  try {
    state.historyTransactions = await requestNative('history.list', { ...range, limit: 200 });
    renderHistoryView();
  } catch (error) { reportError(error); }
}

function renderHistoryView() {
  const listNode = document.getElementById('history-items-list');
  if (!listNode) return;
  updateHistFilterPill();
  updateHistTimePill();
  updateHistoryPeriodBar();

  const range = historyRange();
  const filteredByDate = state.historyTransactions.filter((item) => item.date >= range.from && item.date <= range.to);
  const revenue = filteredByDate.filter((item) => item.amount > 0).reduce((sum, item) => sum + item.amount, 0);
  const cost = -filteredByDate.filter((item) => item.amount < 0).reduce((sum, item) => sum + item.amount, 0);
  const profit = revenue - cost;

  const revEl = document.getElementById('hist-sum-revenue');
  if (revEl) {
    revEl.className = `font-semibold text-[12px] tabular-nums whitespace-nowrap block mt-0.5 transition-colors duration-200 ${revenue > 0 ? 'text-emerald-600/85' : 'text-neutral-400'}`;
    animateNumberText(revEl, revenue, (val) => (val > 0 ? `+${formatMoney(val)} đ` : '0 đ'));
  }
  const costEl = document.getElementById('hist-sum-cost');
  if (costEl) {
    costEl.className = `font-semibold text-[12px] tabular-nums whitespace-nowrap block mt-0.5 transition-colors duration-200 ${cost > 0 ? 'text-orange-600/85' : 'text-neutral-400'}`;
    animateNumberText(costEl, cost, (val) => (val > 0 ? `−${formatMoney(val)} đ` : '0 đ'));
  }
  const profitEl = document.getElementById('hist-sum-profit');
  if (profitEl) {
    profitEl.className = `font-extrabold text-[18px] leading-tight tabular-nums whitespace-nowrap block mt-0.5 transition-colors duration-200 ${profit > 0 ? 'text-emerald-600' : profit < 0 ? 'text-orange-600' : 'text-neutral-800'}`;
    animateNumberText(profitEl, profit, (val) => (val === 0 ? '0 đ' : `${val > 0 ? '+' : '−'}${formatMoney(Math.abs(val))} đ`));
  }

  const summary = document.getElementById('history-period-summary');
  if (summary) {
    if (range.from === range.to) {
      const wdNames = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
      const dObj = new Date(`${range.from}T12:00:00`);
      const prefix = range.from === localDate() ? 'Hôm nay' : range.from === dateOffsetString(localDate(), -1) ? 'Hôm qua' : wdNames[dObj.getDay()];
      summary.textContent = `${prefix} • ${range.from.split('-').reverse().join('/')}`;
    } else if (state.historyTimeMode === 'month') {
      summary.textContent = `Tháng ${state.historySelectedMonth} • ${state.historySelectedYear}`;
    } else {
      summary.textContent = `Năm ${state.historySelectedYear}`;
    }
  }

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
  if (transactions.length) applyListStagger(listNode);
  if (!transactions.length) listNode.innerHTML = '<div class="ft-stagger-item py-10 text-center text-neutral-400 bg-white rounded-2xl border border-neutral-200/60 p-4"><span class="material-symbols-outlined text-4xl text-neutral-300 mb-1">search_off</span><p class="text-xs font-semibold text-neutral-600">Không có giao dịch.</p></div>';
}

function initializeHistoryControls() {
  updateHistoryPeriodBar();
}
