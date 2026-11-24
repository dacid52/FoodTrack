// --- state.js ---
// Global application state and utilities
const state = {
  currentTab: 'dashboard',
  currentDashboardFilter: 'today',
  statsPeriod: 'month',
  statsMonthOffset: 0,
  products: [],
  transactions: [],
  dailyHistory: [],
  summaries: {},
  previousSummaries: {},
  cart: Object.create(null),
  paymentMethod: 'cash',
  expenseType: 'import',
  expensePayMethod: 'cash',
  menuSearchQuery: '',
  menuStatusFilter: 'all',
  salesSearchQuery: '',
  historyTimeMode: 'day',
  historyDaySub: 'today',
  historyCustomDate: localDate(),
  historySelectedMonth: new Date().getMonth() + 1,
  historySelectedYear: new Date().getFullYear(),
  historyFilter: 'all',
  historySearchQuery: '',
  drive: null,
  restoreFile: null,
  currentTx: null,
  editingOrder: null,
  pendingDeleteProductId: null,
  pending: new Map(),
  nextRequestId: 0,
  writeQueue: Promise.resolve(),
  busy: false,
};
window.APP_STATE = state;

function localDate(date) {
  const value = date || new Date();
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function formatMoney(value) {
  return Math.trunc(Number(value) || 0).toLocaleString('vi-VN');
}

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
}



function formatTime(value) {
  return String(value || '').slice(0, 16).replace('T', ' ');
}

function formatDateTimeVi(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return String(dateStr);
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${hours}:${minutes} - ${day}/${month}/${year}`;
}

function requestNative(method, payload) {
  if (!window.ReactNativeWebView || typeof window.ReactNativeWebView.postMessage !== 'function') {
    return Promise.reject(new Error('Bridge native chưa sẵn sàng.'));
  }
  const id = `ft-${Date.now().toString(36)}-${(++state.nextRequestId).toString(36)}`;
  const message = { id, method, payload: payload || {} };
  const promise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      state.pending.delete(id);
      reject(new Error('Yêu cầu xử lý quá thời gian. Thử lại khi thiết bị sẵn sàng.'));
    }, method.startsWith('drive.') ? 60000 : 20000);
    state.pending.set(id, { resolve, reject, timer });
  });
  window.ReactNativeWebView.postMessage(JSON.stringify(message));
  return promise;
}

// Android WebView does not produce a new compositor frame for DOM mutations
// delivered via injectJavaScript/evaluateJavascript — the screen stays stale
// until a real touch. An opacity-only animation can run entirely on the
// compositor and never forces the renderer to commit pending DOM changes, so
// we animate a LAYOUT property (height) on an invisible offscreen probe:
// layout animations must run on the main thread every vsync, which makes
// Chromium produce real frames containing the latest DOM.
let repaintQueued = false;
let repaintProbe = null;

function getRepaintProbe() {
  if (!repaintProbe || !repaintProbe.isConnected) {
    repaintProbe = document.createElement('div');
    repaintProbe.setAttribute('aria-hidden', 'true');
    repaintProbe.style.cssText = 'position:fixed;top:-100px;left:-100px;width:1px;height:1px;pointer-events:none;opacity:0;';
    (document.body || document.documentElement).appendChild(repaintProbe);
  }
  return repaintProbe;
}

function forceRepaintFrame() {
  try {
    window.dispatchEvent(new Event('resize'));
    void document.documentElement.offsetHeight;
    getRepaintProbe().animate(
      [{ height: '1px' }, { height: '3px' }, { height: '1px' }],
      { duration: 180, easing: 'linear' }
    );
  } catch {}
}

function scheduleRepaint() {
  if (repaintQueued) return;
  repaintQueued = true;
  let count = 0;
  const step = () => {
    forceRepaintFrame();
    count += 1;
    if (count < 3) {
      setTimeout(() => requestAnimationFrame(step), 140);
    } else {
      repaintQueued = false;
    }
  };
  requestAnimationFrame(step);
}
window.__foodTrackRepaint = scheduleRepaint;

window.__foodTrackResolve = function (response) {
  if (!response || typeof response.id !== 'string') return;
  const request = state.pending.get(response.id);
  if (!request) return;
  clearTimeout(request.timer);
  state.pending.delete(response.id);
  console.log('[FT-BRIDGE-RESOLVE]', response.id, response.status, 'data keys:', response.status === 'success' && response.data ? Object.keys(response.data) : 'none');
  if (response.status === 'success') request.resolve(response.data);
  else request.reject(new Error(response.error && response.error.message || 'Yêu cầu không thành công.'));
  scheduleRepaint();
};

function runWrite(method, payload) {
  state.writeQueue = state.writeQueue.catch(() => undefined).then(() => requestNative(method, payload));
  return state.writeQueue;
}

function showToast(message, isError) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  container.innerHTML = `<div class="toast-animate ${isError ? 'bg-red-700' : 'bg-neutral-900/95'} text-white px-3.5 py-2 rounded-2xl shadow-xl flex items-center gap-2 text-xs font-semibold border border-white/10"><span class="material-symbols-outlined text-[18px]">${isError ? 'error' : 'check_circle'}</span><span>${escapeHtml(message)}</span></div>`;
  clearTimeout(container._toastTimer);
  container._toastTimer = setTimeout(() => { container.innerHTML = ''; window.__foodTrackRepaint?.(); }, 2600);
}

function reportError(error) {
  showToast(error instanceof Error ? error.message : 'Đã xảy ra lỗi không xác định.', true);
}

function setBusy(busy) {
  state.busy = busy;
  if (typeof updateOrderButtonsState === 'function') updateOrderButtonsState();
  const syncButton = document.getElementById('btn-trigger-sync');
  if (syncButton) syncButton.disabled = busy;
  const deleteButton = document.getElementById('delete-product-confirm-button');
  if (deleteButton) deleteButton.disabled = busy;
}

function clearSampleContent() {
  ['dash-transaction-list', 'sales-product-grid', 'menu-items-list', 'stats-daily-list', 'history-items-list']
    .forEach((id) => { const node = document.getElementById(id); if (node) node.replaceChildren(); });
  ['dash-profit-val', 'dash-revenue-val', 'dash-cost-goods', 'dash-cost-other',
    'stats-net-revenue', 'stats-total-orders', 'stats-total-revenue', 'stats-cost-goods',
    'stats-cost-other', 'hist-sum-revenue', 'hist-sum-cost', 'hist-sum-profit']
    .forEach((id) => { const node = document.getElementById(id); if (node) node.textContent = '—'; });
  const autoBackup = document.getElementById('settings-auto-backup');
  if (autoBackup) autoBackup.checked = false;
  const menuCount = document.getElementById('menu-total-count');
  if (menuCount) menuCount.textContent = '0 món';
  ['menu-active-count', 'menu-inactive-count', 'dock-cart-badge', 'nav-cart-indicator']
    .forEach((id) => { const node = document.getElementById(id); if (node) node.textContent = '0'; });
  const email = document.getElementById('settings-user-email');
  if (email) email.textContent = 'Chưa kết nối';
}

function periodRange(mode) {
  const today = new Date();
  let from = new Date(today);
  let to = new Date(today);
  if (mode === 'yesterday') {
    from.setDate(from.getDate() - 1);
    to = new Date(from);
  }
  else if (mode === '7days') from.setDate(from.getDate() - 6);
  else if (mode === 'month') from = new Date(today.getFullYear(), today.getMonth(), 1);
  else if (mode === 'year') from = new Date(today.getFullYear(), 0, 1);
  return { from: localDate(from), to: localDate(to) };
}

function dateOffsetString(value, days) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localDate(date);
}
