// --- main.js ---
// Navigation, lifecycle and exports
function updateHeader(tabId) {
  ['dashboard', 'sales', 'menu', 'stats', 'history'].forEach((id) => {
    const button = document.getElementById(`nav-btn-${id}`);
    if (!button) return;
    const active = id === tabId;
    button.classList.toggle('text-primary', active);
    button.classList.toggle('text-neutral-500', !active);
    const icon = button.querySelector('.nav-icon');
    if (icon) icon.style.fontVariationSettings = active ? "'FILL' 1, 'wght' 600" : "'FILL' 0, 'wght' 500";
    const label = button.querySelector('.nav-label');
    if (label) {
      label.classList.toggle('font-bold', active);
      label.classList.toggle('font-medium', !active);
    }
  });
  const centerLabel = document.getElementById('nav-label-sales');
  if (centerLabel) {
    centerLabel.classList.toggle('text-primary', tabId === 'sales');
    centerLabel.classList.toggle('text-neutral-600', tabId !== 'sales');
  }
  const fab = document.getElementById('nav-sales-fab');
  if (fab) {
    fab.classList.toggle('bg-primary', tabId === 'sales');
    fab.classList.toggle('bg-neutral-900', tabId !== 'sales');
  }
}

const NAV_TAB_ORDER = ['dashboard', 'menu', 'sales', 'stats', 'history'];

function switchTab(tabId) {
  const validTabs = ['dashboard', 'sales', 'menu', 'stats', 'history'];
  if (!validTabs.includes(tabId)) return;
  if (tabId !== 'sales') closeCartSheet();
  if (tabId !== 'history') closeHistoryDatePicker();
  const previousTab = state.currentTab;
  state.currentTab = tabId;
  const views = ['dashboard', 'sales', 'menu', 'stats', 'history'];
  views.forEach((id) => {
    const view = document.getElementById(`view-${id}`);
    if (view) {
      view.classList.toggle('hidden', id !== tabId);
      if (id === 'sales') view.classList.toggle('flex', id === tabId);
    }
  });
  updateHeader(tabId);
  if (previousTab !== tabId) {
    const activeIcon = tabId === 'sales'
      ? document.getElementById('nav-sales-fab')
      : document.querySelector(`#nav-btn-${tabId} .nav-icon`);
    triggerPop(activeIcon, 'ft-nav-pop');
  }
  if (tabId === 'dashboard') renderDashboard(previousTab !== tabId);
  if (tabId === 'sales') { renderSalesProducts(); renderCartUI(); }
  if (tabId === 'menu') renderMenuItems(previousTab !== tabId);
  if (tabId === 'stats') void refreshStats();
  if (tabId === 'history') void refreshHistory();
  const mainEl = document.querySelector('main');
  if (mainEl && previousTab !== tabId) {
    mainEl.scrollTop = 0;
    const forward = NAV_TAB_ORDER.indexOf(tabId) > NAV_TAB_ORDER.indexOf(previousTab);
    mainEl.classList.remove('ft-tab-in-right', 'ft-tab-in-left');
    void mainEl.offsetWidth;
    mainEl.classList.add(forward ? 'ft-tab-in-right' : 'ft-tab-in-left');
  }
}

function showHelpGuide() {
  showToast('Xem báo cáo trong Thống kê.');
}

async function refreshAll() {
  const data = await requestNative('app.bootstrap');
  console.log('[FT-REFRESH-ALL] transactions count:', data.transactions?.length, 'products count:', data.products?.length);
  state.products = data.products;
  state.transactions = data.transactions;
  state.dailyHistory = data.dailyHistory;
  state.summaries = data.summaries;
  state.previousSummaries.today = data.summaries.yesterday;
  renderDashboard();
  renderSalesProducts();
  renderCartUI();
  renderMenuItems();
  if (state.currentTab === 'stats') await refreshStats();
  if (state.currentTab === 'history') await refreshHistory();
}

// Global window bindings for HTML onclick handlers
Object.assign(window, {
  addEditOrderItem,
  addToCart,
  changeStatsMonth,
  clearCart,
  clearSalesSearch,
  closeCartSheet,
  closeDeleteOrderModal,
  closeDeleteProductModal,
  closeEditOrderModal,
  closeExpenseModal,
  closeHistoryDatePicker,
  closeImageCropModal,
  closeMenuModal,
  closeTxDetailModal,
  confirmDeleteProduct,
  confirmImageCrop,
  confirmOrder,
  deleteProduct,
  drillIntoSelectedStatsDay,
  editOrderQty,
  executeDeleteOrder,
  filterHistoryList,
  filterMenuItems,
  filterSalesProducts,
  formatExpenseAmountInput,
  formatMenuPriceInput,
  jumpHistoryToCurrent,
  navHistoryPicker,
  onCustomDateChange,
  onMonthSelectChange,
  onYearSelectChange,
  openCartSheet,
  openEditMenuModal,
  openEditOrderModal,
  openExpenseModal,
  openHistoryDatePicker,
  pickHistoryDate,
  pickHistoryMonth,
  pickHistoryYear,
  pickProductImage,
  promptDeleteOrder,
  removeEditOrderItem,
  resetStatsOffset,
  saveEditOrder,
  saveExpenseRecord,
  saveMenuItem,
  selectQuickDay,
  setDashboardFilter,
  setEditOrderPay,
  setExpensePayMethod,
  setExpenseType,
  setHistoryFilter,
  setHistoryTimeMode,
  setMenuStatusFilter,
  setPaymentMethod,
  setStatsDayFilter,
  setStatsPeriod,
  showHelpGuide,
  stepHistoryPeriod,
  switchTab,
  toggleFormStatusLabel,
  toggleProductStatus,
  updateCartQuantity,
  updateExpenseButtonText,
  updateMenuImagePreview,
});

function setInitialDisplay() {
  clearSampleContent();
  ensureMenuDialogs();
  ensureImagePickerButton();
  initializeHistoryControls();
  switchTab('dashboard');
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      if (state.currentTab === 'dashboard') updateDashFilterPill();
      if (state.currentTab === 'stats') updateStatsTabPill();
      if (state.currentTab === 'history') { updateHistTimePill(); updateHistFilterPill(); }
    }).catch(() => {});
  }
  let attempts = 0;
  const boot = () => {
    refreshAll().catch((error) => {
      attempts += 1;
      if (attempts <= 8) {
        setTimeout(boot, 500);
      } else {
        reportError(error);
      }
    });
  };
  boot();
}

window.FoodTrack = { refresh: () => refreshAll().catch(reportError), switchTab };

// Tự cuộn ô đang nhập vào vùng nhìn thấy khi bàn phím mở trên tất cả modal & trang
document.addEventListener('focusin', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (!target.matches('input, textarea, select')) return;
  // Đánh dấu settled các modal đang mở để không chạy lại animation ftSheetUp khi viewport co theo bàn phím
  Object.keys(modalClosers).forEach((id) => {
    const el = document.getElementById(id);
    if (el && !el.classList.contains('hidden')) el.classList.add('ft-sheet-settled');
  });
  setTimeout(() => {
    try { target.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch {}
  }, 160);
});

// Đồng bộ lại vị trí các thanh trượt pill khi kích thước WebView thay đổi
window.addEventListener('resize', () => {
  if (state.currentTab === 'dashboard') updateDashFilterPill();
  if (state.currentTab === 'stats') updateStatsTabPill();
  if (state.currentTab === 'history') { updateHistTimePill(); updateHistFilterPill(); }
  if (!document.getElementById('expense-modal')?.classList.contains('hidden')) {
    positionSlidingPill('exp-type-pill', `exp-type-${state.expenseType}`);
    positionSlidingPill('exp-pay-pill', `exp-pay-${state.expensePayMethod}`);
  }
  if (!document.getElementById('sales-cart-sheet')?.classList.contains('hidden')) {
    positionSlidingPill('sheet-pay-pill', `sheet-pay-${state.paymentMethod}`);
  }
  const activeEl = document.activeElement;
  if (activeEl instanceof HTMLElement && activeEl.matches('input, textarea, select')) {
    setTimeout(() => {
      try { activeEl.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch {}
    }, 60);
  }
});

const modalClosers = {
  'expense-modal': closeExpenseModal,
  'menu-modal': closeMenuModal,
  'tx-detail-modal': closeTxDetailModal,
  'edit-order-modal': closeEditOrderModal,
  'delete-order-confirm-modal': closeDeleteOrderModal,
  'delete-product-modal': closeDeleteProductModal,
  'sales-cart-sheet': closeCartSheet,
  'history-date-picker-modal': closeHistoryDatePicker,
  'image-crop-modal': closeImageCropModal,
};

// Thứ tự ưu tiên đóng modal từ lớp cao nhất xuống thấp nhất khi bấm Back / vuốt cạnh Android
const MODAL_BACK_ORDER = [
  'image-crop-modal',
  'delete-product-modal',
  'delete-order-confirm-modal',
  'expense-modal',
  'edit-order-modal',
  'history-date-picker-modal',
  'tx-detail-modal',
  'sales-cart-sheet',
  'menu-modal',
];

let _lastHardwareBackAt = 0;

window.__ftHandleHardwareBack = function () {
  // 1. Nếu có popup / bottom sheet đang mở -> đóng lớp trên cùng trước
  for (const id of MODAL_BACK_ORDER) {
    const el = document.getElementById(id);
    if (el && !el.classList.contains('hidden') && !el.classList.contains('ft-overlay-out')) {
      modalClosers[id]?.();
      _lastHardwareBackAt = 0;
      return;
    }
  }
  // 2. Nếu đang ở tab khác -> quay về Tổng quan
  if (state.currentTab !== 'dashboard') {
    switchTab('dashboard');
    _lastHardwareBackAt = 0;
    return;
  }
  // 3. Đang ở Tổng quan -> yêu cầu nhấn quay lại lần 2 trong 2 giây mới thoát app
  const now = Date.now();
  if (now - _lastHardwareBackAt < 2000) {
    _lastHardwareBackAt = 0;
    if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') {
      window.ReactNativeWebView.postMessage(JSON.stringify({ id: 'ft-exit', method: 'app.exit', payload: {} }));
    }
    return;
  }
  _lastHardwareBackAt = now;
  showToast('Nhấn quay lại lần nữa để thoát', 'info');
};

// Đồng bộ parallax nhẹ cho nền sáng & xếp chồng modal con
function syncModalDepth() {
  const openModals = Object.keys(modalClosers)
    .map((id) => document.getElementById(id))
    .filter((el) => el && !el.classList.contains('hidden') && !el.classList.contains('ft-overlay-out'));
  const hasOpen = openModals.length > 0;
  document.documentElement.classList.toggle('ft-modal-open', hasOpen);
  document.documentElement.style.setProperty('--ft-depth', hasOpen ? '1' : '0');
  if (!hasOpen) document.documentElement.classList.remove('ft-modal-dragging');
  Object.keys(modalClosers).forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const isReceded = openModals.length > 1 && openModals.includes(el) && openModals[openModals.length - 1] !== el;
    el.classList.toggle('ft-modal-receded', isReceded);
  });
}

(function observeModals() {
  const observer = new MutationObserver(() => syncModalDepth());
  const attach = () => {
    Object.keys(modalClosers).forEach((id) => {
      const el = document.getElementById(id);
      if (el && !el.dataset.ftObserved) {
        el.dataset.ftObserved = '1';
        observer.observe(el, { attributes: true, attributeFilter: ['class'] });
      }
    });
  };
  attach();
  const rootObserver = new MutationObserver(() => { attach(); syncModalDepth(); });
  const rootEl = document.getElementById('app-root') || document.body;
  if (rootEl) rootObserver.observe(rootEl, { childList: true });
})();

// Đóng modal/sheet khi bấm ra vùng tối bên ngoài (chỉ khi target là chính backdrop)
document.addEventListener('click', (event) => {
  const backdrop = event.target;
  if (!(backdrop instanceof HTMLElement)) return;
  const close = modalClosers[backdrop.id];
  if (close) close();
});

// Kéo lên (đàn hồi nhẹ) / giữ kéo xuống để đóng mượt mà cho tất cả bottom sheet & modal
(function initInteractiveSheets() {
  let drag = null;

  function findOverlay(target) {
    let node = target instanceof HTMLElement ? target : null;
    while (node && node !== document.body) {
      if (node.id && modalClosers[node.id]) return node;
      node = node.parentElement;
    }
    return null;
  }

  function findScrollable(target, stopAt) {
    let node = target instanceof HTMLElement ? target : null;
    while (node && node !== stopAt) {
      const style = window.getComputedStyle(node);
      if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && node.scrollHeight > node.clientHeight + 1) {
        return node;
      }
      node = node.parentElement;
    }
    return null;
  }

  function isInteractiveControl(target) {
    return Boolean(target instanceof HTMLElement && target.closest('#crop-viewport, input, textarea, select, option'));
  }

  function startDrag(clientX, clientY, target, isMouse) {
    const overlay = findOverlay(target);
    if (!overlay || overlay.classList.contains('hidden') || overlay.dataset.ftClosing) return;
    const panel = overlay.firstElementChild;
    if (!(panel instanceof HTMLElement) || !panel.contains(target)) return;

    const onGrabber = Boolean(target instanceof HTMLElement && target.closest('.ft-sheet-grabber'));
    if (isMouse && !onGrabber) return;
    if (!onGrabber && isInteractiveControl(target)) return;

    const scrollable = onGrabber ? null : findScrollable(target, panel);
    // Nếu đang ở giữa danh sách đã cuộn xuống thì nhường thao tác cuộn tự nhiên
    if (scrollable && scrollable.scrollTop > 1) return;

    const headerEl = panel.children[1];
    const onHeader = Boolean(
      headerEl instanceof HTMLElement
      && headerEl.contains(target)
      && !(target instanceof HTMLElement && target.closest('button, a'))
    );
    const baseAlpha = overlay.id === 'image-crop-modal' ? 0.42 : 0.28;

    drag = {
      overlay,
      panel,
      closer: modalClosers[overlay.id],
      startX: clientX,
      startY: clientY,
      lastY: clientY,
      lastTime: performance.now(),
      velocity: 0,
      dy: 0,
      fromHandle: onGrabber || onHeader,
      onGrabber,
      scrollable,
      baseAlpha,
      locked: false,
      aborted: false,
    };
  }

  function moveDrag(clientX, clientY, event) {
    if (!drag || drag.aborted) return;
    const dx = clientX - drag.startX;
    const dy = clientY - drag.startY;

    if (!drag.locked) {
      if (Math.hypot(dx, dy) < 6) return;
      if (Math.abs(dx) > Math.abs(dy) * 1.15) {
        drag.aborted = true;
        return;
      }
      if (!drag.fromHandle) {
        if (drag.scrollable && drag.scrollable.scrollTop > 1) {
          drag.aborted = true;
          return;
        }
        // Vuốt lên bên trong nội dung cuộn được -> nhường cuộn tự nhiên
        if (dy < 0 && drag.scrollable) {
          drag.aborted = true;
          return;
        }
      }
      drag.locked = true;
      drag.overlay.classList.add('ft-sheet-settled', 'ft-sheet-dragging');
      document.documentElement.classList.add('ft-modal-dragging');
      drag.panel.style.transition = 'none';
      drag.overlay.style.transition = 'none';
      // Nếu đang mở bàn phím khi kéo đóng, ẩn bàn phím gọn gàng
      if (dy > 0 && document.activeElement instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
        document.activeElement.blur();
      }
    }

    if (event.cancelable) event.preventDefault();

    const now = performance.now();
    const dt = now - drag.lastTime;
    if (dt > 0) {
      const instantV = (clientY - drag.lastY) / dt;
      drag.velocity = drag.velocity * 0.4 + instantV * 0.6;
    }
    drag.lastY = clientY;
    drag.lastTime = now;
    drag.dy = dy;

    if (dy >= 0) {
      drag.panel.style.transform = `translateY(${dy}px)`;
      const h = Math.max(180, drag.panel.offsetHeight || 360);
      const progress = Math.min(1, dy / h);
      drag.overlay.style.setProperty('background-color', `rgba(0, 0, 0, ${(drag.baseAlpha * (1 - progress)).toFixed(3)})`, 'important');
    } else {
      // Kéo lên: đàn hồi mượt (rubber-band), giới hạn tối đa ~24px
      const stretch = -Math.min(24, Math.pow(Math.abs(dy), 0.72) * 1.35);
      drag.panel.style.transform = `translateY(${stretch.toFixed(1)}px)`;
      drag.overlay.style.setProperty('background-color', `rgba(0, 0, 0, ${drag.baseAlpha})`, 'important');
    }
  }

  function finishDrag(cancelled) {
    if (!drag) return;
    const current = drag;
    drag = null;

    if (!current.locked) {
      // Chạm nhẹ trực tiếp vào thanh Grabber mà không kéo -> đóng nhanh
      if (!cancelled && current.onGrabber && !current.aborted) {
        current.closer();
      }
      return;
    }

    document.documentElement.classList.remove('ft-modal-dragging');
    const panelHeight = Math.max(180, current.panel.offsetHeight || 320);
    const threshold = Math.min(120, panelHeight * 0.28);
    const shouldDismiss = !cancelled && (current.dy > threshold || (current.dy > 36 && current.velocity > 0.45));

    if (shouldDismiss) {
      current.overlay.dataset.ftClosing = '1';
      current.panel.style.transition = 'transform 0.2s cubic-bezier(0.22, 1, 0.36, 1)';
      current.panel.style.transform = 'translateY(100%)';
      current.overlay.style.transition = 'background-color 0.18s ease-out';
      current.overlay.style.setProperty('background-color', 'rgba(0, 0, 0, 0)', 'important');
      if (current.overlay._ftHideTimer) clearTimeout(current.overlay._ftHideTimer);
      current.overlay._ftHideTimer = setTimeout(() => {
        current.overlay._ftHideTimer = null;
        current.overlay.dataset.ftDraggedOut = '1';
        current.closer();
        window.__foodTrackRepaint?.();
      }, 200);
    } else {
      current.panel.style.transition = 'transform 0.26s cubic-bezier(0.22, 1, 0.36, 1)';
      current.panel.style.transform = 'translateY(0px)';
      current.overlay.style.transition = 'background-color 0.22s ease-out';
      current.overlay.style.setProperty('background-color', `rgba(0, 0, 0, ${current.baseAlpha})`, 'important');
      setTimeout(() => {
        if (!current.overlay.dataset.ftClosing) {
          resetSheetDragStyles(current.overlay);
        }
      }, 270);
    }
  }

  document.addEventListener('touchstart', (event) => {
    if (event.touches.length !== 1) {
      if (drag && !drag.locked) drag = null;
      return;
    }
    const touch = event.touches[0];
    startDrag(touch.clientX, touch.clientY, event.target, false);
  }, { passive: true });

  document.addEventListener('touchmove', (event) => {
    if (!drag || event.touches.length !== 1) return;
    const touch = event.touches[0];
    moveDrag(touch.clientX, touch.clientY, event);
  }, { passive: false });

  document.addEventListener('touchend', () => finishDrag(false), { passive: true });
  document.addEventListener('touchcancel', () => finishDrag(true), { passive: true });

  // Hỗ trợ kéo thanh Grabber bằng chuột khi test trên trình duyệt
  document.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    startDrag(event.clientX, event.clientY, event.target, true);
  });
  document.addEventListener('mousemove', (event) => {
    if (!drag) return;
    moveDrag(event.clientX, event.clientY, event);
  });
  document.addEventListener('mouseup', () => finishDrag(false));
})();
setTimeout(() => {
  setInitialDisplay();
}, 100);
window.addEventListener('focus', () => {
  if (window.FoodTrack) void window.FoodTrack.refresh();
});
