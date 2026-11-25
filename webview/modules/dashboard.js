// --- dashboard.js ---
// Dashboard view logic
function summaryFor(period) {
  return state.summaries[period] || { revenue: 0, orders: 0, purchases: 0, other: 0, profit: 0 };
}

function setMetric(id, amount, kind, sizeCls) {
  const node = document.getElementById(id);
  if (!node) return;
  const parent = node.parentElement;
  const positive = kind === 'income';
  animateNumberText(node, amount, (val) => (val > 0 ? `${positive ? '+' : '−'}${formatMoney(val)}` : '0'));
  if (parent) {
    const colorClass = amount > 0
      ? (kind === 'income' ? 'text-emerald-300' : kind === 'other' ? 'text-slate-200' : 'text-orange-300')
      : 'text-neutral-100';
    parent.className = `${sizeCls || 'text-[13px] tracking-normal'} font-bold ${colorClass} mt-1 leading-tight whitespace-nowrap tabular-nums`;
  }
}

function updateHeroVisualState(summary) {
  const profit = Number(summary.profit) || 0;
  const dotEl = document.getElementById('dash-hero-dot');
  const valEl = document.getElementById('dash-profit-val');
  if (dotEl) {
    dotEl.className = profit > 0
      ? 'w-2 h-2 rounded-full bg-emerald-400 transition-colors duration-200'
      : profit < 0
        ? 'w-2 h-2 rounded-full bg-orange-400 transition-colors duration-200'
        : 'w-2 h-2 rounded-full bg-neutral-400 transition-colors duration-200';
  }
  if (valEl) {
    const sizeCls = heroMainProfitSizeClass(profit);
    const colorCls = profit > 0 ? 'text-emerald-300' : profit < 0 ? 'text-orange-300' : 'text-white';
    valEl.className = `${sizeCls} font-bold tracking-normal leading-none ${colorCls} tabular-nums transition-colors duration-200`;
  }

  const rev = Math.max(0, Number(summary.revenue) || 0);
  const goods = Math.max(0, Number(summary.purchases) || 0);
  const other = Math.max(0, Number(summary.other) || 0);
  const total = rev + goods + other;
  const setBar = (id, val) => {
    const bar = document.getElementById(id);
    if (!bar) return;
    bar.classList.toggle('hidden', val <= 0);
    bar.style.width = total > 0 && val > 0 ? `${(val / total) * 100}%` : '0%';
  };
  setBar('dash-bar-revenue', rev);
  setBar('dash-bar-goods', goods);
  setBar('dash-bar-other', other);
}

function renderDashboard(animateList) {
  const summary = summaryFor(state.currentDashboardFilter);
  const labels = { today: 'LỢI NHUẬN HÔM NAY', yesterday: 'LỢI NHUẬN HÔM QUA', '7days': 'LỢI NHUẬN 7 NGÀY QUA', month: 'LỢI NHUẬN THÁNG NÀY' };
  setText('dash-hero-period-label', labels[state.currentDashboardFilter]);
  setText('dash-order-count-badge', `${summary.orders} đơn`);
  updateHeroVisualState(summary);
  animateNumberText(
    document.getElementById('dash-profit-val'),
    summary.profit,
    (val) => `${val > 0 ? '+' : val < 0 ? '−' : ''}${formatMoney(Math.abs(val))}`
  );
  const subSizeCls = heroSubMetricSizeClass(Math.max(summary.revenue || 0, summary.purchases || 0, summary.other || 0));
  setMetric('dash-revenue-val', summary.revenue, 'income', subSizeCls);
  setMetric('dash-cost-goods', summary.purchases, 'expense', subSizeCls);
  setMetric('dash-cost-other', summary.other, 'other', subSizeCls);
  const dateNode = document.querySelector('#view-dashboard h2')?.parentElement?.querySelector('p');
  if (dateNode) dateNode.textContent = `Hôm nay • ${localDate().split('-').reverse().join('/')}`;
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
  updateDashFilterPill();
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
    row.className = 'bg-white p-2.5 rounded-2xl border border-neutral-200/80 shadow-sm flex items-center justify-between cursor-pointer hover:bg-neutral-50 active:scale-[0.98] transition-transform';
    row.innerHTML = `<div class="flex items-center gap-2.5"><div class="w-8 h-8 rounded-xl ${income ? 'bg-emerald-50 text-emerald-600' : 'bg-orange-50 text-orange-600'} flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-[16px]">${income ? 'arrow_downward' : 'arrow_upward'}</span></div><div><p class="text-xs font-bold text-neutral-900">${escapeHtml(transaction.title)}</p><p class="text-[10px] text-neutral-400 mt-0.5">${escapeHtml(transaction.time)} • ${escapeHtml(transaction.method)}</p></div></div><div class="text-right"><span class="text-xs font-bold ${income ? 'text-emerald-600' : 'text-orange-600'}">${income ? '+' : '−'}${formatMoney(Math.abs(transaction.amount))} đ</span><span class="block text-[9px] text-neutral-400">Chi tiết ›</span></div>`;
    row.addEventListener('click', () => void openTxDetailModal(transaction));
    list.appendChild(row);
  });
  if (animateList) applyListStagger(list);
}

function updateDashFilterPill() {
  const pill = document.getElementById('dash-filter-pill');
  const btn = document.getElementById(`dash-filter-${state.currentDashboardFilter}`);
  if (pill && btn) {
    pill.style.width = `${btn.offsetWidth}px`;
    pill.style.transform = `translateX(${btn.offsetLeft}px)`;
  }
}

async function setDashboardFilter(period) {
  state.currentDashboardFilter = period;
  ['today', 'yesterday', '7days', 'month'].forEach((key) => {
    const button = document.getElementById(`dash-filter-${key}`);
    if (button) button.className = key === period
      ? 'flex-1 relative py-1.5 rounded-lg font-semibold text-neutral-900 text-center transition-colors'
      : 'flex-1 relative py-1.5 rounded-lg text-neutral-500 hover:text-neutral-900 text-center transition-colors';
  });
  updateDashFilterPill();
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
