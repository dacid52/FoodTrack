// --- stats.js ---
// Stats view logic
function setStatsPeriod(period) {
  state.statsPeriod = period;
  ['day', 'month', 'year'].forEach((value) => {
    const button = document.getElementById(`stats-tab-${value}`);
    if (button) button.className = value === period
      ? 'flex-1 py-1 rounded-lg bg-white text-neutral-900 shadow-sm transition-all text-center text-[11px] font-bold'
      : 'flex-1 py-1 rounded-lg hover:text-neutral-900 transition-all text-center text-[11px]';
  });
  document.getElementById('stats-period-picker-bar')?.classList.toggle('hidden', period !== 'month');
  state.statsMonthOffset = 0;
  void refreshStats();
}

function statsRange() {
  const now = new Date();
  if (state.statsPeriod === 'day') return { from: localDate(), to: localDate() };
  if (state.statsPeriod === 'year') return { from: `${now.getFullYear()}-01-01`, to: localDate() };
  const month = new Date(now.getFullYear(), now.getMonth() + state.statsMonthOffset, 1);
  const end = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  return { from: localDate(month), to: localDate(end) };
}

async function refreshStats() {
  const range = statsRange();
  const monthDate = new Date(`${range.from}T12:00:00`);
  const label = state.statsPeriod === 'day'
    ? `Kỳ thống kê: Hôm nay (${localDate().split('-').reverse().join('/')})`
    : state.statsPeriod === 'year' ? `Kỳ thống kê: Năm ${monthDate.getFullYear()}`
      : `Kỳ thống kê: Tháng ${monthDate.getMonth() + 1}, ${monthDate.getFullYear()}`;
  setText('stats-filter-period-label', label);
  setText('stats-current-month', `Tháng ${monthDate.getMonth() + 1}, ${monthDate.getFullYear()}`);
  setText('stats-hero-label', state.statsPeriod === 'day' ? 'LỢI NHUẬN HÔM NAY' : state.statsPeriod === 'year' ? `LỢI NHUẬN NĂM ${monthDate.getFullYear()}` : 'LỢI NHUẬN THÁNG NÀY');
  const today = localDate();
  const weekFrom = dateOffsetString(today, -6);
  try {
    const [summary, days] = await Promise.all([
      requestNative('reports.summary', range),
      requestNative('reports.daily', { from: weekFrom, to: today, limit: 7 }),
    ]);
    setText('stats-net-revenue', `${summary.profit >= 0 ? '+' : '−'}${formatMoney(Math.abs(summary.profit))}`);
    setText('stats-total-orders', `${summary.orders} đơn`);
    setText('stats-total-revenue', `${formatMoney(summary.revenue)} đ`);
    setText('stats-cost-goods', formatMoney(summary.purchases));
    setText('stats-cost-other', formatMoney(summary.other));
    const list = document.getElementById('stats-daily-list');
    if (!list) return;
    list.replaceChildren();
    // Luôn hiển thị đúng 7 ngày gần nhất, kể cả ngày không phát sinh giao dịch
    const byDay = new Map((days || []).map((day) => [day.day, day]));
    const weekdayNames = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
    const last7 = [];
    for (let i = 0; i <= 6; i += 1) {
      const dayStr = dateOffsetString(today, -i);
      const found = byDay.get(dayStr);
      last7.push({
        day: dayStr,
        revenue: found ? found.revenue : 0,
        orders: found ? found.orders : 0,
        purchases: found ? found.purchases : 0,
        other: found ? found.other : 0,
      });
    }
    last7.forEach((day) => {
      const row = document.createElement('div');
      row.className = 'bg-white p-2.5 rounded-2xl border border-neutral-200/80 shadow-sm flex items-center justify-between text-xs';
      const profit = day.revenue - day.purchases - day.other;
      const weekday = weekdayNames[new Date(`${day.day}T12:00:00`).getDay()];
      const dateLabelVi = `${day.day.split('-').reverse().join('/')}`;
      row.innerHTML = `<div><span class="font-bold text-neutral-800">${weekday}, ${escapeHtml(dateLabelVi)}</span><div class="text-[10px] text-neutral-400 mt-0.5">${day.orders} đơn • Thu: ${formatMoney(day.revenue)} đ</div></div><div class="text-right"><span class="font-extrabold ${profit >= 0 ? 'text-emerald-600' : 'text-red-600'}">${profit >= 0 ? '+' : '−'}${formatMoney(Math.abs(profit))} đ</span><span class="block text-[9px] text-neutral-400">Lợi nhuận ròng</span></div>`;
      list.appendChild(row);
    });
  } catch (error) { reportError(error); }
}

function changeStatsMonth(delta) {
  state.statsMonthOffset += delta;
  void refreshStats();
}
