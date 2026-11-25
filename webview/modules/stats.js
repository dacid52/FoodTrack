// --- stats.js ---
// Stats view logic:
// - Ngày: Biểu đồ thanh ngang vuông vức so sánh Thu vào (theo kênh nhận) vs Chi ra (từng khoản chi) — KHÔNG hiện danh sách đơn hàng
// - Tuần: Biểu đồ cột đôi vuông vức Thu (xanh) vs Chi (Nhập cam + Khác xám) theo thứ T2 -> CN
// - Tháng: Biểu đồ cột đôi vuông vức Thu vs Chi theo tuần (Tuần 1 -> Tuần 5)
let _statsChartPoints = [];
let _statsSelectedIdx = -1;

function updateStatsTabPill() {
  positionSlidingPill('stats-tab-pill', `stats-tab-${state.statsPeriod}`);
}

function setStatsPeriod(period) {
  const normalized = ['day', 'week', 'month'].includes(period) ? period : 'month';
  state.statsPeriod = normalized;
  state.statsMonthOffset = 0;
  ['day', 'week', 'month'].forEach((value) => {
    const button = document.getElementById(`stats-tab-${value}`);
    if (button) button.className = value === normalized
      ? 'flex-1 relative py-1.5 rounded-lg font-semibold text-neutral-900 text-center text-xs transition-colors'
      : 'flex-1 relative py-1.5 rounded-lg text-neutral-500 hover:text-neutral-900 text-center text-xs transition-colors';
  });
  updateStatsTabPill();
  void refreshStats();
}

function setStatsDayFilter() {
  // Giữ tương thích bind window nếu cần
}

function formatShortDm(iso) {
  const parts = String(iso || '').split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}` : iso;
}

function formatCompactMoney(value, withSign) {
  const num = Number(value) || 0;
  const abs = Math.abs(num);
  const sign = withSign ? (num > 0 ? '+' : num < 0 ? '−' : '') : '';
  if (abs === 0) return '0';
  if (abs >= 1000000) {
    const m = abs / 1000000;
    return `${sign}${m >= 10 ? Math.round(m) : Number(m.toFixed(1))}tr`;
  }
  if (abs >= 1000) {
    return `${sign}${Math.round(abs / 1000)}k`;
  }
  return `${sign}${abs}`;
}

function computeNiceScaleMax(rawMax) {
  if (!rawMax || rawMax <= 0) return 100000;
  const steps = [50000, 100000, 200000, 300000, 400000, 500000, 800000, 1000000, 1500000, 2000000, 3000000, 5000000, 10000000, 20000000, 50000000];
  for (const s of steps) {
    if (rawMax <= s) return s;
  }
  const mag = Math.pow(10, Math.floor(Math.log10(rawMax)));
  return Math.ceil(rawMax / mag) * mag;
}

function statsRange() {
  const now = new Date();
  const offset = state.statsMonthOffset || 0;
  if (state.statsPeriod === 'day') {
    const d = dateOffsetString(localDate(now), offset);
    return { from: d, to: d };
  }
  if (state.statsPeriod === 'week') {
    const monday = new Date(now);
    const weekday = (monday.getDay() + 6) % 7;
    monday.setDate(monday.getDate() - weekday + offset * 7);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { from: localDate(monday), to: localDate(sunday) };
  }
  const month = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  return { from: localDate(month), to: localDate(end) };
}

function buildChartPoints(range, days) {
  const byDay = new Map((days || []).map((d) => [d.day, d]));
  const shortWeekdays = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  const fullWeekdays = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

  if (state.statsPeriod === 'month') {
    const start = new Date(`${range.from}T12:00:00`);
    const end = new Date(`${range.to}T12:00:00`);
    const totalDays = end.getDate();
    const m = String(start.getMonth() + 1).padStart(2, '0');
    const weeks = [];
    for (let startDay = 1, wIdx = 1; startDay <= totalDays; startDay += 7, wIdx += 1) {
      const endDay = Math.min(totalDays, startDay + 6);
      let revenue = 0, purchases = 0, other = 0;
      for (let d = startDay; d <= endDay; d += 1) {
        const iso = `${range.from.slice(0, 8)}${String(d).padStart(2, '0')}`;
        const row = byDay.get(iso);
        if (row) {
          revenue += Number(row.revenue) || 0;
          purchases += Number(row.purchases) || 0;
          other += Number(row.other) || 0;
        }
      }
      const sPad = String(startDay).padStart(2, '0');
      const ePad = String(endDay).padStart(2, '0');
      weeks.push({
        label: `Tuần ${wIdx}`,
        subLabel: `${sPad}–${ePad}`,
        fullLabel: `Tuần ${wIdx} (${sPad}/${m} – ${ePad}/${m})`,
        revenue,
        purchases,
        other,
        cost: purchases + other,
        profit: revenue - purchases - other,
      });
    }
    return weeks;
  }

  // Tuần: T2 -> CN
  const points = [];
  for (let i = 0; i < 7; i += 1) {
    const iso = dateOffsetString(range.from, i);
    const row = byDay.get(iso);
    const revenue = row ? Number(row.revenue) || 0 : 0;
    const purchases = row ? Number(row.purchases) || 0 : 0;
    const other = row ? Number(row.other) || 0 : 0;
    const dObj = new Date(`${iso}T12:00:00`);
    const wdShort = shortWeekdays[dObj.getDay()];
    const wdFull = fullWeekdays[dObj.getDay()];
    points.push({
      key: iso,
      label: wdShort,
      subLabel: formatShortDm(iso),
      fullLabel: `${iso === localDate() ? 'Hôm nay' : wdFull} • ${formatShortDm(iso)}`,
      revenue,
      purchases,
      other,
      cost: purchases + other,
      profit: revenue - purchases - other,
    });
  }
  return points;
}

function selectStatsChartBar(index) {
  const pt = _statsChartPoints[index];
  if (!pt) return;
  _statsSelectedIdx = index;
  setText('stats-detail-title', pt.fullLabel);
  const maxSub = Math.max(pt.revenue || 0, pt.purchases || 0, pt.other || 0);
  const subSize = maxSub >= 100000000 ? 'text-[9.5px] tracking-tight' : maxSub >= 10000000 ? 'text-[10px]' : 'text-[11px]';
  const setDetailVal = (id, amount, signPrefix, color) => {
    const el = document.getElementById(id);
    if (!el) return;
    const tone = amount > 0 ? color : 'text-neutral-400';
    el.className = `font-bold ${tone} ${subSize} whitespace-nowrap mt-0.5 transition-colors duration-200`;
    animateNumberText(el, amount, (v) => (v > 0 ? `${signPrefix}${formatMoney(v)}đ` : '0 đ'));
  };
  setDetailVal('stats-detail-rev', pt.revenue || 0, '+', 'text-emerald-700');
  setDetailVal('stats-detail-goods', pt.purchases || 0, '−', 'text-orange-600');
  setDetailVal('stats-detail-other', pt.other || 0, '−', 'text-slate-600');

  const drillBtn = document.getElementById('stats-detail-drill-btn');
  if (drillBtn) {
    const canDrill = state.statsPeriod === 'week' && Boolean(pt.key) && pt.key <= localDate();
    drillBtn.classList.toggle('hidden', !canDrill);
  }

  const profitEl = document.getElementById('stats-detail-profit');
  if (profitEl) {
    profitEl.className = pt.profit > 0
      ? 'text-xs font-extrabold shrink-0 tabular-nums text-emerald-600 transition-colors duration-200'
      : pt.profit < 0
        ? 'text-xs font-extrabold shrink-0 tabular-nums text-orange-600 transition-colors duration-200'
        : 'text-xs font-extrabold shrink-0 tabular-nums text-neutral-500 transition-colors duration-200';
    animateNumberText(profitEl, pt.profit || 0, (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${formatMoney(Math.abs(v))} đ`);
  }

  document.querySelectorAll('#stats-daily-list [data-bar-idx]').forEach((col) => {
    const active = Number(col.dataset.barIdx) === index;
    col.classList.toggle('bg-neutral-100/90', active);
    const label = col.querySelector('[data-bar-label]');
    if (label) {
      label.classList.toggle('text-neutral-900', active);
      label.classList.toggle('font-bold', active);
      label.classList.toggle('text-neutral-500', !active);
      label.classList.toggle('font-medium', !active);
    }
    const sub = col.querySelector('[data-bar-sub]');
    if (sub) {
      sub.classList.toggle('text-neutral-700', active);
      sub.classList.toggle('text-neutral-400', !active);
    }
    const pair = col.querySelector('[data-bar-pair]');
    if (pair) {
      pair.style.opacity = active ? '1' : '0.45';
    }
  });
}

function drillIntoSelectedStatsDay() {
  const pt = _statsChartPoints[_statsSelectedIdx];
  if (!pt || !pt.key) return;
  const todayDate = new Date(`${localDate()}T12:00:00`);
  const targetDate = new Date(`${pt.key}T12:00:00`);
  const diffDays = Math.round((targetDate - todayDate) / 86400000);
  if (diffDays > 0) return;
  state.statsPeriod = 'day';
  state.statsMonthOffset = diffDays;
  ['day', 'week', 'month'].forEach((value) => {
    const button = document.getElementById(`stats-tab-${value}`);
    if (button) button.className = value === 'day'
      ? 'flex-1 relative py-1.5 rounded-lg font-semibold text-neutral-900 text-center text-xs transition-colors'
      : 'flex-1 relative py-1.5 rounded-lg text-neutral-500 hover:text-neutral-900 text-center text-xs transition-colors';
  });
  updateStatsTabPill();
  void refreshStats();
}

// BIỂU ĐỒ CỘT ĐÔI VUÔNG VỨC (TUẦN & THÁNG) — NHÌN LÀ HIỂU NGAY THU vs CHI
function renderDualBarChart(points, defaultIdx) {
  const container = document.getElementById('stats-daily-list');
  if (!container) return;
  _statsChartPoints = points;
  container.replaceChildren();
  if (!points.length) {
    container.innerHTML = '<p class="py-6 text-center text-xs text-neutral-400">Chưa có dữ liệu biểu đồ.</p>';
    return;
  }

  const rawMax = Math.max(0, ...points.map((p) => Math.max(p.revenue, p.cost)));
  const scaleMax = computeNiceScaleMax(rawMax);
  const plotH = 128;
  const isMonth = state.statsPeriod === 'month';
  const barWClass = isMonth ? 'w-3.5' : 'w-2.5';

  const wrap = document.createElement('div');
  wrap.className = 'flex items-stretch gap-1.5';

  // Trục Y bên trái (Max / Mid / 0)
  const yAxis = document.createElement('div');
  yAxis.className = 'shrink-0 w-8 flex flex-col justify-between text-right pr-1 text-[9px] font-medium text-neutral-400 tabular-nums select-none';
  yAxis.style.height = `${plotH}px`;
  yAxis.style.marginTop = '4px';
  yAxis.innerHTML = `
    <span class="leading-none">${formatCompactMoney(scaleMax)}</span>
    <span class="leading-none">${formatCompactMoney(scaleMax / 2)}</span>
    <span class="leading-none">0</span>
  `;
  wrap.appendChild(yAxis);

  // Vùng lưới + cột vuông vức
  const plotWrap = document.createElement('div');
  plotWrap.className = 'flex-1 min-w-0 relative';

  const gridLines = document.createElement('div');
  gridLines.className = 'pointer-events-none absolute left-0 right-0 flex flex-col justify-between';
  gridLines.style.top = '4px';
  gridLines.style.height = `${plotH}px`;
  gridLines.innerHTML = `
    <div class="border-t border-dashed border-neutral-200/70 w-full"></div>
    <div class="border-t border-dashed border-neutral-200/70 w-full"></div>
    <div class="border-t border-neutral-300 w-full"></div>
  `;
  plotWrap.appendChild(gridLines);

  const grid = document.createElement('div');
  grid.className = 'grid gap-0.5 relative z-10';
  grid.style.gridTemplateColumns = `repeat(${points.length}, minmax(0, 1fr))`;

  points.forEach((pt, idx) => {
    const col = document.createElement('button');
    col.type = 'button';
    col.dataset.barIdx = String(idx);
    col.className = 'flex flex-col items-center pt-1 pb-1.5 px-0.5 transition-colors cursor-pointer';
    col.onclick = () => selectStatsChartBar(idx);

    const revH = pt.revenue > 0 ? Math.max(4, Math.round((pt.revenue / scaleMax) * (plotH - 2))) : 0;
    const costH = pt.cost > 0 ? Math.max(4, Math.round((pt.cost / scaleMax) * (plotH - 2))) : 0;

    let goodsPx = 0;
    let otherPx = 0;
    if (costH > 0) {
      if (pt.purchases > 0 && pt.other > 0) {
        goodsPx = Math.max(3, Math.round((pt.purchases / pt.cost) * costH));
        otherPx = Math.max(3, costH - goodsPx);
        const maxBarH = plotH - 2;
        if (goodsPx + otherPx > maxBarH) {
          if (goodsPx >= otherPx) goodsPx = Math.max(3, maxBarH - otherPx);
          else otherPx = Math.max(3, maxBarH - goodsPx);
        }
      } else if (pt.purchases > 0) {
        goodsPx = costH;
      } else {
        otherPx = costH;
      }
    }

    // Cột vuông sắc nét trồi mượt từ đường nền (Thu & Chi của cùng 1 ngày lên đều nhau, sóng nhẹ 24ms)
    const colDelay = idx * 24;
    const revBarHtml = revH > 0
      ? `<div class="${barWClass} bg-emerald-500 ft-bar-rise" style="height:${revH}px;--ft-bar-delay:${colDelay}ms"></div>`
      : `<div class="${barWClass} h-[2px] bg-neutral-200"></div>`;

    const costBarHtml = costH > 0
      ? `<div class="${barWClass} flex flex-col justify-end ft-bar-rise" style="height:${goodsPx + otherPx}px;--ft-bar-delay:${colDelay}ms">
           ${otherPx > 0 ? `<div class="w-full bg-slate-400${goodsPx > 0 ? ' border-b border-white' : ''}" style="height:${otherPx}px"></div>` : ''}
           ${goodsPx > 0 ? `<div class="w-full bg-orange-400" style="height:${goodsPx}px"></div>` : ''}
         </div>`
      : `<div class="${barWClass} h-[2px] bg-neutral-200"></div>`;

    col.innerHTML = `
      <div data-bar-pair class="w-full flex items-end justify-center gap-[2px] transition-opacity duration-200" style="height:${plotH}px">
        ${revBarHtml}
        ${costBarHtml}
      </div>
      <span data-bar-label class="mt-2 text-[10px] font-medium text-neutral-500 leading-none whitespace-nowrap">${escapeHtml(pt.label)}</span>
      <span data-bar-sub class="mt-0.5 text-[9px] text-neutral-400 leading-none tabular-nums whitespace-nowrap">${escapeHtml(pt.subLabel || '')}</span>
    `;
    grid.appendChild(col);
  });

  plotWrap.appendChild(grid);
  wrap.appendChild(plotWrap);
  container.appendChild(wrap);

  const targetIdx = defaultIdx >= 0 && defaultIdx < points.length ? defaultIdx : points.length - 1;
  selectStatsChartBar(targetIdx);
}

// BIỂU ĐỒ ĐƠN GIẢN THEO NGÀY — CHỈ HIỆN THU VÀO & CHI RA (VUÔNG VỨC, NHÌN LÀ HIỂU)
function renderDaySimpleChart(summary) {
  const container = document.getElementById('stats-daily-list');
  if (!container) return;
  container.replaceChildren();

  const rev = Math.max(0, Number(summary.revenue) || 0);
  const goods = Math.max(0, Number(summary.purchases) || 0);
  const other = Math.max(0, Number(summary.other) || 0);
  const totalOut = goods + other;

  if (rev === 0 && totalOut === 0) {
    container.innerHTML = `
      <div class="py-7 text-center">
        <p class="text-xs font-semibold text-neutral-500">Chưa có thu chi trong ngày này</p>
      </div>
    `;
    return;
  }

  const scaleMax = computeNiceScaleMax(Math.max(rev, totalOut));
  const revPct = rev > 0 ? Math.max(3, (rev / scaleMax) * 100) : 0;
  const goodsPct = goods > 0 ? Math.max(2, (goods / scaleMax) * 100) : 0;
  const otherPct = other > 0 ? Math.max(2, (other / scaleMax) * 100) : 0;

  const costParts = [];
  if (goods > 0) costParts.push(`Nhập ${formatCompactMoney(goods)}`);
  if (other > 0) costParts.push(`Khác ${formatCompactMoney(other)}`);

  const totalOutPct = totalOut > 0 ? Math.max(3, (totalOut / scaleMax) * 100) : 0;
  const goodsSharePct = totalOut > 0 ? (goods / totalOut) * 100 : 0;
  const otherSharePct = totalOut > 0 ? (other / totalOut) * 100 : 0;

  container.innerHTML = `
    <div class="space-y-3.5 pt-1">
      <div>
        <div class="flex items-baseline justify-between gap-2 mb-1.5">
          <span class="text-xs font-bold text-neutral-800 shrink-0">Thu vào</span>
          <span class="text-xs font-extrabold tabular-nums whitespace-nowrap ${rev > 0 ? 'text-emerald-600' : 'text-neutral-400'}">${rev > 0 ? `+${formatMoney(rev)} đ` : '0 đ'}</span>
        </div>
        <div class="w-full h-5 bg-neutral-100 border-l-2 border-neutral-300 overflow-hidden">
          ${rev > 0 ? `<div class="h-full bg-emerald-500 ft-bar-slide" style="width:${revPct}%;--ft-bar-delay:0ms"></div>` : ''}
        </div>
      </div>

      <div>
        <div class="flex items-baseline justify-between gap-2 mb-1.5">
          <div class="flex items-baseline gap-1.5 min-w-0">
            <span class="text-xs font-bold text-neutral-800 shrink-0">Chi ra</span>
            ${costParts.length ? `<span class="text-[10px] text-neutral-400 font-medium truncate tabular-nums">(${costParts.join(' • ')})</span>` : ''}
          </div>
          <span class="text-xs font-extrabold tabular-nums whitespace-nowrap shrink-0 ${totalOut > 0 ? 'text-orange-600' : 'text-neutral-400'}">${totalOut > 0 ? `−${formatMoney(totalOut)} đ` : '0 đ'}</span>
        </div>
        <div class="w-full h-5 bg-neutral-100 border-l-2 border-neutral-300 overflow-hidden">
          ${totalOut > 0 ? `
          <div class="h-full flex ft-bar-slide" style="width:${totalOutPct}%;--ft-bar-delay:65ms">
            ${goods > 0 ? `<div class="h-full bg-orange-400${other > 0 ? ' border-r border-white' : ''}" style="width:${goodsSharePct}%"></div>` : ''}
            ${other > 0 ? `<div class="h-full bg-slate-400" style="width:${otherSharePct}%"></div>` : ''}
          </div>` : ''}
        </div>
      </div>
    </div>

    <div class="mt-3.5 pt-1.5 border-t border-neutral-200 flex items-center justify-between text-[9px] font-medium text-neutral-400 tabular-nums select-none">
      <span>0</span>
      <span>${formatCompactMoney(scaleMax / 2)}</span>
      <span>${formatCompactMoney(scaleMax)}</span>
    </div>
  `;
}

let _statsRefreshReqId = 0;

async function refreshStats() {
  const reqId = ++_statsRefreshReqId;
  if (!['day', 'week', 'month'].includes(state.statsPeriod)) state.statsPeriod = 'month';
  updateStatsTabPill();
  const range = statsRange();
  const offset = state.statsMonthOffset || 0;
  const fromDate = new Date(`${range.from}T12:00:00`);
  const isDay = state.statsPeriod === 'day';

  const nextBtn = document.getElementById('stats-next-btn');
  if (nextBtn) nextBtn.disabled = offset >= 0;

  let periodPillText = '';
  let periodSubText = '';
  let heroTitle = '';
  let chartTitle = '';
  let chartSub = '';
  if (isDay) {
    const dayWeekdays = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
    const dayPrefix = offset === 0 ? 'Hôm nay' : offset === -1 ? 'Hôm qua' : dayWeekdays[fromDate.getDay()];
    periodPillText = offset === 0 ? 'Hôm nay' : offset === -1 ? 'Hôm qua' : formatShortDm(range.from);
    periodSubText = `${dayPrefix} • ${range.from.split('-').reverse().join('/')}`;
    heroTitle = offset === 0 ? 'LỢI NHUẬN HÔM NAY' : `LỢI NHUẬN ${formatShortDm(range.from)}`;
    chartTitle = 'Biểu đồ';
    chartSub = `${dayPrefix} • ${formatShortDm(range.from)}`;
  } else if (state.statsPeriod === 'week') {
    periodPillText = offset === 0 ? 'Tuần này' : `${formatShortDm(range.from)}–${formatShortDm(range.to)}`;
    periodSubText = `Tuần ${formatShortDm(range.from)} – ${formatShortDm(range.to)}`;
    heroTitle = offset === 0 ? 'LỢI NHUẬN TUẦN NÀY' : `LỢI NHUẬN TUẦN ${formatShortDm(range.from)}`;
    chartTitle = 'Biểu đồ';
    chartSub = `${formatShortDm(range.from)} – ${formatShortDm(range.to)}`;
  } else {
    const m = fromDate.getMonth() + 1;
    const y = fromDate.getFullYear();
    periodPillText = `T${m}/${y}`;
    periodSubText = `Tháng ${m} • ${y}`;
    heroTitle = offset === 0 ? 'LỢI NHUẬN THÁNG NÀY' : `LỢI NHUẬN THÁNG ${m}/${y}`;
    chartTitle = 'Biểu đồ';
    chartSub = y === new Date().getFullYear() ? `Tháng ${m}` : `Tháng ${m}/${y}`;
  }

  setText('stats-current-month', periodPillText);
  setText('stats-filter-period-label', periodSubText);
  setText('stats-hero-label', heroTitle);
  setText('stats-chart-title', chartTitle);
  setText('stats-chart-subtitle', chartSub);

  document.getElementById('stats-chart-detail')?.classList.toggle('hidden', isDay);

  try {
    const summaryPromise = requestNative('reports.summary', range);
    const detailPromise = isDay
      ? Promise.resolve([])
      : requestNative('reports.daily', { from: range.from, to: range.to, limit: 35 });
    const [summary, detailData] = await Promise.all([summaryPromise, detailPromise]);
    if (reqId !== _statsRefreshReqId) return;

    const profit = Number(summary.profit) || 0;
    const dotEl = document.getElementById('stats-hero-dot');
    const netEl = document.getElementById('stats-net-revenue');
    if (dotEl) {
      dotEl.className = profit > 0
        ? 'w-2 h-2 rounded-full bg-emerald-400 transition-colors duration-200'
        : profit < 0
          ? 'w-2 h-2 rounded-full bg-orange-400 transition-colors duration-200'
          : 'w-2 h-2 rounded-full bg-neutral-400 transition-colors duration-200';
    }
    if (netEl) {
      const sizeCls = heroMainProfitSizeClass(profit);
      const colorCls = profit > 0 ? 'text-emerald-300' : profit < 0 ? 'text-orange-300' : 'text-white';
      netEl.className = `${sizeCls} font-bold tracking-normal leading-none ${colorCls} tabular-nums transition-colors duration-200`;
    }
    const rev = Math.max(0, Number(summary.revenue) || 0);
    const goods = Math.max(0, Number(summary.purchases) || 0);
    const other = Math.max(0, Number(summary.other) || 0);
    const totalFlow = rev + goods + other;
    const setBar = (id, val) => {
      const bar = document.getElementById(id);
      if (!bar) return;
      bar.classList.toggle('hidden', val <= 0);
      bar.style.width = totalFlow > 0 && val > 0 ? `${(val / totalFlow) * 100}%` : '0%';
    };
    setBar('stats-bar-revenue', rev);
    setBar('stats-bar-goods', goods);
    setBar('stats-bar-other', other);

    animateNumberText(
      netEl,
      summary.profit,
      (val) => `${val > 0 ? '+' : val < 0 ? '−' : ''}${formatMoney(Math.abs(val))}`
    );
    setText('stats-total-orders', `${summary.orders} đơn`);
    const subSizeCls = heroSubMetricSizeClass(Math.max(rev, goods, other));
    const setStatsMetric = (id, amount, kind) => {
      const node = document.getElementById(id);
      if (!node) return;
      const positive = kind === 'income';
      animateNumberText(node, amount, (val) => (val > 0 ? `${positive ? '+' : '−'}${formatMoney(val)}` : '0'));
      const parent = node.parentElement;
      if (parent) {
        const colorCls = amount > 0 ? (kind === 'income' ? 'text-emerald-300' : kind === 'other' ? 'text-slate-200' : 'text-orange-300') : 'text-neutral-100';
        parent.className = `${subSizeCls} font-bold ${colorCls} mt-1 leading-tight whitespace-nowrap tabular-nums`;
      }
    };
    setStatsMetric('stats-total-revenue', summary.revenue, 'income');
    setStatsMetric('stats-cost-goods', summary.purchases, 'expense');
    setStatsMetric('stats-cost-other', summary.other, 'other');

    if (isDay) {
      renderDaySimpleChart(summary);
    } else {
      const points = buildChartPoints(range, detailData);
      let defaultIdx = points.length - 1;
      if (state.statsPeriod === 'week') {
        const todayIso = localDate();
        const todayIdx = points.findIndex((p) => p.key === todayIso);
        if (todayIdx >= 0) defaultIdx = todayIdx;
      } else if (state.statsPeriod === 'month') {
        let foundData = false;
        for (let i = points.length - 1; i >= 0; i -= 1) {
          if (points[i].revenue > 0 || points[i].cost > 0) { defaultIdx = i; foundData = true; break; }
        }
        if (!foundData && offset === 0) {
          defaultIdx = Math.min(points.length - 1, Math.floor((new Date().getDate() - 1) / 7));
        }
      }
      renderDualBarChart(points, defaultIdx);
    }
  } catch (error) {
    if (reqId === _statsRefreshReqId) reportError(error);
  }
}

function changeStatsMonth(delta) {
  const next = (state.statsMonthOffset || 0) + delta;
  if (next > 0) return;
  state.statsMonthOffset = next;
  void refreshStats();
}

function resetStatsOffset() {
  if (!state.statsMonthOffset) return;
  state.statsMonthOffset = 0;
  void refreshStats();
}
