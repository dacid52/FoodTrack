// --- dashboard.js ---
// Dashboard view logic
function summaryFor(period) {
  return state.summaries[period] || { revenue: 0, orders: 0, purchases: 0, other: 0, profit: 0 };
}

function setMetric(id, amount, kind) {
  const node = document.getElementById(id);
  if (!node) return;
  const parent = node.parentElement;
  const positive = kind === 'income';
  node.textContent = amount > 0 ? `${positive ? '+' : '−'}${formatMoney(amount)}` : '0';
  if (parent) {
    parent.classList.remove('text-neutral-900', 'text-emerald-600', 'text-orange-600');
    parent.classList.add(amount > 0 ? (positive ? 'text-emerald-600' : 'text-orange-600') : 'text-neutral-900');
  }
}

function renderDashboard() {
  const summary = summaryFor(state.currentDashboardFilter);
  const labels = { today: 'LỢI NHUẬN HÔM NAY', yesterday: 'LỢI NHUẬN HÔM QUA', '7days': 'LỢI NHUẬN 7 NGÀY QUA', month: 'LỢI NHUẬN THÁNG NÀY' };
  setText('dash-hero-period-label', labels[state.currentDashboardFilter]);
  setText('dash-order-count-badge', `${summary.orders} đơn`);
  setText('dash-profit-val', `${summary.profit >= 0 ? '+' : '−'}${formatMoney(Math.abs(summary.profit))}`);
  setMetric('dash-revenue-val', summary.revenue, 'income');
  setMetric('dash-cost-goods', summary.purchases, 'expense');
  setMetric('dash-cost-other', summary.other, 'expense');
  const dateNode = document.querySelector('#view-dashboard h2')?.parentElement?.querySelector('p');
  if (dateNode) dateNode.textContent = `Hôm nay, ${localDate().split('-').reverse().join('/')}`;
  const hour = new Date().getHours();
  const greeting = hour >= 5 && hour < 11
    ? 'Mở hàng đắt khách!'
    : hour >= 11 && hour < 14
      ? 'Trưa nay nhiều đơn!'
      : hour >= 14 && hour < 18
        ? 'Chiều nay đắt hàng!'
        : hour >= 18 && hour < 22
          ? 'Tối nay nổ đơn nhé!'
          : 'Khuya nay chốt đơn!';
  setText('dash-greeting', greeting);
  const list = document.getElementById('dash-transaction-list');
  if (!list) return;
  list.replaceChildren();
  if (!state.transactions.length) {
    list.innerHTML = '<p class="py-4 text-center text-xs text-neutral-400">Chưa có giao dịch.</p>';
    return;
  }
  state.transactions.slice(0, 4).forEach((transaction) => {
    const income = transaction.amount > 0;
    const row = document.createElement('div');
    row.className = 'bg-white p-2.5 rounded-2xl border border-neutral-200/80 shadow-sm flex items-center justify-between cursor-pointer hover:bg-neutral-50 active:scale-98 transition-all';
    row.innerHTML = `<div class="flex items-center gap-2.5"><div class="w-8 h-8 rounded-xl ${income ? 'bg-emerald-50 text-emerald-600' : 'bg-orange-50 text-orange-600'} flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-[16px]">${income ? 'arrow_downward' : 'arrow_upward'}</span></div><div><p class="text-xs font-bold text-neutral-900">${escapeHtml(transaction.title)}</p><p class="text-[10px] text-neutral-400 mt-0.5">${escapeHtml(transaction.time)} • ${escapeHtml(transaction.method)}</p></div></div><div class="text-right"><span class="text-xs font-bold ${income ? 'text-emerald-600' : 'text-orange-600'}">${income ? '+' : '−'}${formatMoney(Math.abs(transaction.amount))} đ</span><span class="block text-[9px] text-neutral-400">Chi tiết ›</span></div>`;
    row.addEventListener('click', () => void openTxDetailModal(transaction));
    list.appendChild(row);
  });
}

async function setDashboardFilter(period) {
  state.currentDashboardFilter = period;
  ['today', 'yesterday', '7days', 'month'].forEach((key) => {
    const button = document.getElementById(`dash-filter-${key}`);
    if (button) button.className = key === period
      ? 'flex-1 py-1.5 rounded-lg font-semibold bg-white text-neutral-900 shadow-sm transition-all text-center'
      : 'flex-1 py-1.5 rounded-lg hover:text-neutral-900 transition-all text-center';
  });
  try {
    const range = periodRange(period);
    const previousTo = dateOffsetString(range.from, -1);
    const dayCount = Math.round((Date.parse(`${range.to}T00:00:00Z`) - Date.parse(`${range.from}T00:00:00Z`)) / 86400000) + 1;
    const previousFrom = dateOffsetString(previousTo, 1 - dayCount);
    const [summary, previous] = await Promise.all([
      requestNative('dashboard.summary', { period }),
      requestNative('reports.summary', { from: previousFrom, to: previousTo }),
    ]);
    state.summaries[period] = summary;
    state.previousSummaries[period] = previous;
    renderDashboard();
  } catch (error) { reportError(error); }
}
