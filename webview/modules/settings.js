// --- settings.js ---
// Google Drive and Settings logic
async function connectGoogleDrive(force = false) {
  const btn = document.getElementById('btn-connect-drive');
  const icon = document.getElementById('btn-connect-drive-icon');
  const text = document.getElementById('btn-connect-drive-text');
  if (btn) btn.disabled = true;
  if (icon) {
    icon.textContent = 'progress_activity';
    icon.classList.add('animate-spin');
  }
  if (text) text.textContent = 'Đang kết nối Google...';
  try {
    const res = await requestNative('drive.connect', { force: Boolean(force) });
    if (res && res.connected) {
      showToast('Kết nối Google Drive thành công!');
      // Tự bật đồng bộ nền hằng ngày nếu OS hỗ trợ và chưa bật
      if (res.backgroundStatus === 'available' && !res.autoSync) {
        try {
          await runWrite('drive.autoSync.set', { enabled: true });
        } catch {}
      }
      await refreshDriveStatus(true);
    } else if (res && res.cancelled) {
      showToast('Đã hủy đăng nhập Google.');
    }
  } catch (error) {
    reportError(error);
    await refreshDriveStatus(false);
  } finally {
    if (btn) btn.disabled = false;
    if (icon) {
      icon.textContent = 'add_to_drive';
      icon.classList.remove('animate-spin');
    }
    if (text) text.textContent = 'Kết nối Google Drive';
  }
}

function updateDriveHeaderStatus(connected) {
  setText('header-drive-icon', connected ? 'cloud_done' : 'cloud_off');
  const headerDriveButton = document.getElementById('header-drive-btn');
  if (headerDriveButton) {
    headerDriveButton.title = connected ? 'Drive: Đã kết nối' : 'Drive: Chưa kết nối';
    headerDriveButton.classList.toggle('text-emerald-600', connected);
    headerDriveButton.classList.toggle('text-neutral-500', !connected);
  }
}

async function refreshDriveStatus(forceReloadBackups) {
  let drive;
  try {
    drive = await requestNative('drive.status');
    state.drive = drive;
  } catch (err) {
    reportError(err);
    drive = state.drive || { connected: false };
  }

  const connected = Boolean(drive && drive.connected);
  const disconnectedBox = document.getElementById('settings-drive-disconnected-box');
  const connectedBox = document.getElementById('settings-drive-connected-box');

  if (disconnectedBox && connectedBox) {
    disconnectedBox.classList.toggle('hidden', connected);
    connectedBox.classList.toggle('hidden', !connected);
  }

  // Header Drive status icon
  updateDriveHeaderStatus(connected);

  if (connected) {
    // User Profile & Avatar
    const avatarContainer = document.getElementById('settings-avatar-container');
    if (avatarContainer) {
      if (drive.photo) {
        avatarContainer.innerHTML = `<img src="${escapeHtml(drive.photo)}" class="w-full h-full object-cover rounded-2xl" alt="Avatar" onerror="this.onerror=null;this.parentElement.innerHTML='<span class=\\'material-symbols-outlined text-emerald-600 text-[24px]\\'>cloud_done</span>'">`;
      } else {
        const initial = (drive.name || drive.email || 'G').charAt(0).toUpperCase();
        avatarContainer.innerHTML = `<div class="w-full h-full rounded-2xl bg-emerald-600 text-white font-bold text-sm flex items-center justify-center">${escapeHtml(initial)}</div>`;
      }
    }

    setText('settings-user-name', drive.name || drive.email?.split('@')[0] || 'Tài khoản Google');
    setText('settings-user-email', drive.email || '');
    setText('settings-status-badge', 'Đã kết nối');
    setText('settings-last-sync-time', drive.lastSync ? formatDateTimeVi(drive.lastSync) : 'Chưa đồng bộ');

    // Sync status indicator
    const syncStatusIndicator = document.getElementById('settings-sync-status-indicator');
    if (syncStatusIndicator) {
      if (drive.lastError) {
        syncStatusIndicator.innerHTML = '<span class="w-2 h-2 rounded-full bg-red-500"></span><span class="text-red-600">Lỗi đồng bộ</span>';
      } else {
        syncStatusIndicator.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-500"></span><span class="text-emerald-700">Sẵn sàng</span>';
      }
    }

    // Sync error banner
    const errorBanner = document.getElementById('settings-sync-error-banner');
    if (errorBanner) {
      if (drive.lastError) {
        errorBanner.classList.remove('hidden');
        setText('settings-sync-error-text', drive.lastError);
      } else {
        errorBanner.classList.add('hidden');
      }
    }

    // Auto backup switch
    const checkbox = document.getElementById('settings-auto-backup');
    if (checkbox) checkbox.checked = Boolean(drive.autoSync);
    setText('settings-auto-backup-status', drive.autoSync
      ? (drive.backgroundStatus === 'available' ? 'Theo lịch hệ điều hành' : 'Không khả dụng')
      : 'Chưa bật');

    // Danh sách backup gọi Drive API (chậm) — tải riêng, không chặn trang
    renderBackupListLoading();
    await loadDriveBackups();
  }
  return drive;
}

function renderBackupListLoading() {
  const backupList = document.getElementById('settings-backup-list');
  if (backupList) {
    backupList.innerHTML = '<div class="py-6 text-center text-neutral-400"><span class="material-symbols-outlined text-3xl text-neutral-300 mb-1 animate-spin">progress_activity</span><p class="text-xs font-semibold text-neutral-500">Đang tải bản sao lưu...</p></div>';
  }
}

async function loadDriveBackups() {
  const backupList = document.getElementById('settings-backup-list');
  const backupCount = document.getElementById('settings-backup-count');
  let backups = [];
  let error = null;
  try {
    const res = await requestNative('drive.backups.list');
    backups = res?.backups || [];
    error = res?.error || null;
  } catch (err) {
    error = err instanceof Error ? err.message : 'Không tải được danh sách sao lưu.';
  }
  if (state.drive) state.drive.backups = backups;
  const latest = backups.slice(0, 1);
  if (backupCount) backupCount.textContent = String(latest.length);
  if (!backupList) return;
  backupList.replaceChildren();
  if (error) {
    backupList.innerHTML = `
      <div class="py-6 text-center text-neutral-400 bg-neutral-50 rounded-xl p-3 border border-neutral-100">
        <span class="material-symbols-outlined text-3xl text-red-300 mb-1">error</span>
        <p class="text-xs font-semibold text-neutral-600">${escapeHtml(error)}</p>
      </div>
    `;
    return;
  }
  if (!latest.length) {
    backupList.innerHTML = `
      <div class="py-6 text-center text-neutral-400 bg-neutral-50 rounded-xl p-3 border border-neutral-100">
        <span class="material-symbols-outlined text-3xl text-neutral-300 mb-1">cloud_off</span>
        <p class="text-xs font-semibold text-neutral-600">Chưa có bản sao lưu nào trên Drive.</p>
        <p class="text-[10px] text-neutral-400 mt-0.5">Bấm "Đồng bộ & Sao lưu ngay" ở trên để sao lưu.</p>
      </div>
    `;
    return;
  }
  latest.forEach((backup) => {
    const sizeKb = backup.size ? (Number(backup.size) / 1024).toFixed(1) : '—';
    const row = document.createElement('div');
    row.className = 'flex items-center justify-between gap-2.5 p-2.5 rounded-xl border border-neutral-100 bg-neutral-50/60 hover:bg-neutral-100/80 transition-all';
    row.innerHTML = `
      <div class="w-8 h-8 rounded-lg bg-orange-100/70 text-primary flex items-center justify-center shrink-0">
        <span class="material-symbols-outlined text-[18px]">cloud_download</span>
      </div>
      <div class="min-w-0 flex-1">
        <p class="text-xs font-bold text-neutral-800">${escapeHtml(formatDateTimeVi(backup.modifiedTime))}</p>
        <div class="flex items-center gap-2 text-[10px] text-neutral-400 font-mono mt-0.5 truncate">
          <span>${sizeKb} KB</span>
          <span>•</span>
          <span class="truncate">${escapeHtml(backup.name)}</span>
        </div>
      </div>
      <button class="px-2.5 py-1 rounded-lg bg-white border border-neutral-200 text-xs font-bold text-primary shadow-xs hover:bg-orange-50 active:scale-95 transition-all shrink-0">
        Khôi phục
      </button>
    `;
    row.querySelector('button').addEventListener('click', () => {
      promptRestoreBackup(backup);
    });
    backupList.appendChild(row);
  });
}

async function toggleAutoBackup() {
  const checkbox = document.getElementById('settings-auto-backup');
  const enabled = Boolean(checkbox?.checked);
  try {
    const result = await runWrite('drive.autoSync.set', { enabled });
    if (result.enabled !== enabled) throw new Error('Không cập nhật được cấu hình đồng bộ nền.');
    await refreshDriveStatus(false);
    showToast(enabled ? 'Đã bật tự động đồng bộ nền.' : 'Đã tắt tự động đồng bộ.');
  } catch (error) {
    if (checkbox) checkbox.checked = !enabled;
    reportError(error);
  }
}

let syncProgressTimer = null;

function setSyncProgress(percent, text) {
  const bar = document.getElementById('sync-progress-bar');
  const label = document.getElementById('sync-progress-text');
  if (bar) bar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
  if (label && text) label.textContent = text;
}

function animateSyncProgress(targetPercent) {
  if (syncProgressTimer) clearInterval(syncProgressTimer);
  syncProgressTimer = setInterval(() => {
    const bar = document.getElementById('sync-progress-bar');
    if (!bar) { clearInterval(syncProgressTimer); syncProgressTimer = null; return; }
    const current = parseFloat(bar.style.width) || 0;
    if (current >= targetPercent - 2) { clearInterval(syncProgressTimer); syncProgressTimer = null; return; }
    bar.style.width = `${Math.min(targetPercent - 2, current + 3 + Math.random() * 6)}%`;
  }, 220);
}

function showSyncProgress(show) {
  document.getElementById('sync-progress-wrap')?.classList.toggle('hidden', !show);
  if (show) setSyncProgress(0, 'Đang chuẩn bị...');
}

async function triggerManualSync() {
  const btn = document.getElementById('btn-trigger-sync');
  const icon = document.getElementById('btn-sync-icon');
  const text = document.getElementById('btn-sync-text');
  if (btn) btn.disabled = true;
  if (icon) {
    icon.textContent = 'sync';
    icon.classList.add('animate-spin');
  }
  if (text) text.textContent = 'Đang đồng bộ...';
  showSyncProgress(true);
  try {
    // Giai đoạn 1: tạo bản sao lưu snapshot (khôi phục được)
    setSyncProgress(5, 'Đang tạo bản sao lưu...');
    animateSyncProgress(45);
    await runWrite('drive.backup.create', {});

    // Giai đoạn 2: đồng bộ 2 chiều với các thiết bị khác
    setSyncProgress(50, 'Đang đồng bộ hai chiều...');
    animateSyncProgress(95);
    const result = await runWrite('drive.sync', {});

    setSyncProgress(100, 'Hoàn tất!');
    await refreshAll();
    await refreshDriveStatus(true);
    showToast(result.conflicts ? `Đồng bộ xong · ${result.conflicts} xung đột đã xử lý.` : 'Đồng bộ & sao lưu thành công!');
  } catch (error) {
    reportError(error);
    await refreshDriveStatus(true).catch(() => undefined);
  } finally {
    if (syncProgressTimer) { clearInterval(syncProgressTimer); syncProgressTimer = null; }
    setTimeout(() => { showSyncProgress(false); window.__foodTrackRepaint?.(); }, 1200);
    if (btn) btn.disabled = false;
    if (icon) {
      icon.textContent = 'sync';
      icon.classList.remove('animate-spin');
    }
    if (text) text.textContent = 'Đồng bộ & Sao lưu ngay';
  }
}

function promptRestoreBackup(backup) {
  if (!backup) return;
  state.restoreFile = backup;
  setText('restore-modal-filename', backup.name || '-');
  setText('restore-modal-time', formatDateTimeVi(backup.modifiedTime) || '-');
  const sizeKb = backup.size ? (Number(backup.size) / 1024).toFixed(1) : '—';
  setText('restore-modal-size', `${sizeKb} KB`);
  document.getElementById('restore-confirm-modal')?.classList.remove('hidden');
}

function promptRestoreData() {
  const backup = state.restoreFile || state.drive?.backups?.[0];
  if (!backup) {
    showToast('Chưa có bản sao lưu nào để khôi phục.');
    return;
  }
  promptRestoreBackup(backup);
}

function closeRestoreModal() {
  document.getElementById('restore-confirm-modal')?.classList.add('hidden');
}

async function executeRestoreData() {
  if (!state.restoreFile) return;
  const btn = document.getElementById('restore-modal-confirm-btn');
  const cancelBtn = document.getElementById('restore-modal-cancel-btn');
  const icon = document.getElementById('restore-modal-icon');
  const text = document.getElementById('restore-modal-btn-text');
  if (btn) btn.disabled = true;
  if (cancelBtn) cancelBtn.disabled = true;
  if (icon) {
    icon.textContent = 'progress_activity';
    icon.classList.add('animate-spin');
  }
  if (text) text.textContent = 'Đang khôi phục...';
  try {
    await runWrite('drive.backup.restore', { fileId: state.restoreFile.id });
    closeRestoreModal();
    await refreshAll();
    await refreshDriveStatus(true);
    showToast('Khôi phục dữ liệu từ bản sao lưu thành công!');
  } catch (error) {
    reportError(error);
  } finally {
    if (btn) btn.disabled = false;
    if (cancelBtn) cancelBtn.disabled = false;
    if (icon) {
      icon.textContent = 'history';
      icon.classList.remove('animate-spin');
    }
    if (text) text.textContent = 'Khôi phục ngay';
  }
}

function promptDisconnectDrive() {
  if (!state.drive?.connected) {
    void connectGoogleDrive();
    return;
  }
  document.getElementById('disconnect-confirm-modal')?.classList.remove('hidden');
}

function closeDisconnectModal() {
  document.getElementById('disconnect-confirm-modal')?.classList.add('hidden');
}

async function executeDisconnectDrive() {
  setBusy(true);
  try {
    await runWrite('drive.disconnect', {});
    closeDisconnectModal();
    await refreshDriveStatus(true);
    showToast('Đã ngắt kết nối Google Drive.');
  } catch (error) {
    reportError(error);
    await refreshDriveStatus(true).catch(() => undefined);
  } finally {
    setBusy(false);
  }
}
