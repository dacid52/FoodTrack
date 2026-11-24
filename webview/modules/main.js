// --- main.js ---
// Navigation, lifecycle and exports
function updateHeader(tabId) {
  ['dashboard', 'sales', 'menu', 'stats', 'history'].forEach((id) => {
    const button = document.getElementById(`nav-btn-${id}`);
    if (!button) return;
    const active = id === tabId;
    button.classList.toggle('text-primary', active);
    button.classList.toggle('text-neutral-400', !active);
    const label = button.querySelector('span:last-child');
    if (label) {
      label.classList.toggle('font-bold', active);
      label.classList.toggle('font-medium', !active);
    }
  });
}

function switchTab(tabId) {
  const validTabs = ['dashboard', 'sales', 'menu', 'stats', 'history', 'settings'];
  if (!validTabs.includes(tabId)) return;
  state.currentTab = tabId;
  const views = ['dashboard', 'sales', 'menu', 'stats', 'history', 'settings'];
  views.forEach((id) => {
    const view = document.getElementById(`view-${id}`);
    if (view) {
      view.classList.toggle('hidden', id !== tabId);
      if (id === 'sales') view.classList.toggle('flex', id === tabId);
    }
  });
  updateHeader(tabId);
  if (tabId === 'dashboard') renderDashboard();
  if (tabId === 'sales') { renderSalesProducts(); renderCartUI(); }
  if (tabId === 'menu') renderMenuItems();
  if (tabId === 'stats') void refreshStats();
  if (tabId === 'history') void refreshHistory();
  if (tabId === 'settings') void refreshDriveStatus().catch(reportError);
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
  state.drive = data.drive;
  updateDriveHeaderStatus(Boolean(state.drive && state.drive.connected));
  renderDashboard();
  renderSalesProducts();
  renderCartUI();
  renderMenuItems();
  if (state.currentTab === 'stats') await refreshStats();
  if (state.currentTab === 'history') await refreshHistory();
  if (state.currentTab === 'settings') await refreshDriveStatus();
  checkFirstLaunch();
}

// Global window bindings for HTML onclick handlers
Object.assign(window, {
  addEditOrderItem,
  addExpenseAmount,
  addToCart,
  changeStatsMonth,
  clearCart,
  clearSalesSearch,
  closeCartSheet,
  closeDeleteOrderModal,
  closeDeleteProductModal,
  closeDisconnectModal,
  closeEditOrderModal,
  closeExpenseModal,
  closeMenuModal,
  closeRestoreModal,
  closeTxDetailModal,
  confirmDeleteProduct,
  confirmOrder,
  connectGoogleDrive,
  deleteProduct,
  editOrderQty,
  executeDeleteOrder,
  executeDisconnectDrive,
  executeRestoreData,
  filterHistoryList,
  filterMenuItems,
  filterSalesProducts,
  formatExpenseAmountInput,
  handleGoogleSignIn,
  handleSkipLogin,
  onCustomDateChange,
  onMonthSelectChange,
  onYearSelectChange,
  openAuthScreen,
  openCartSheet,
  openEditMenuModal,
  openEditOrderModal,
  openExpenseModal,
  promptDeleteOrder,
  promptDisconnectDrive,
  promptRestoreBackup,
  promptRestoreData,
  refreshDriveStatus,
  removeEditOrderItem,
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
  setStatsPeriod,
  showHelpGuide,
  switchTab,
  toggleAutoBackup,
  toggleFormStatusLabel,
  toggleProductStatus,
  triggerManualSync,
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

// Đóng modal/sheet khi bấm ra vùng tối bên ngoài (chỉ khi target là chính backdrop)
document.addEventListener('click', (event) => {
  const backdrop = event.target;
  if (!(backdrop instanceof HTMLElement)) return;
  const closers = {
    'expense-modal': closeExpenseModal,
    'menu-modal': closeMenuModal,
    'tx-detail-modal': closeTxDetailModal,
    'edit-order-modal': closeEditOrderModal,
    'delete-order-confirm-modal': closeDeleteOrderModal,
    'delete-product-modal': closeDeleteProductModal,
    'restore-confirm-modal': closeRestoreModal,
    'disconnect-confirm-modal': closeDisconnectModal,
    'sales-cart-sheet': closeCartSheet,
  };
  const close = closers[backdrop.id];
  if (close) close();
});
setTimeout(() => {
  setInitialDisplay();
}, 100);
window.addEventListener('focus', () => {
  if (window.FoodTrack) void window.FoodTrack.refresh();
});
