import * as SecureStore from 'expo-secure-store';

import { createSnapshot, mergeSnapshots, persistConflicts, restoreSnapshot, validateSnapshot } from '../database/backup';
import { readSetting, writeSetting } from '../features/records';
import { clearGoogleSignInSession, getCurrentUserEmail, getCurrentUserProfile, getFreshDriveAccessToken } from './googleSignIn';
import type { BackupFile, BackupSnapshot, DriveConnection } from '../database/types';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const TOKEN_KEY = 'foodtrack.google.drive.connection';
const CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? 'foodtrack';

function requireClientId(): string {
  return CLIENT_ID;
}

async function saveConnection(connection: DriveConnection) {
  await SecureStore.setItemAsync(TOKEN_KEY, JSON.stringify(connection));
}

export async function getConnection(): Promise<DriveConnection | null> {
  const raw = await SecureStore.getItemAsync(TOKEN_KEY);
  if (!raw) return null;
  try {
    const connection: DriveConnection = JSON.parse(raw);
    if (!connection.accessToken || !connection.email || !Number.isFinite(connection.expiresAt)) {
      throw new Error('Thông tin đăng nhập Google không hợp lệ.');
    }
    return connection;
  } catch (error) {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    throw error instanceof Error ? error : new Error('Không thể đọc thông tin Google đã lưu.');
  }
}

export async function disconnectDrive() {
  const connection = await getConnection();
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await clearGoogleSignInSession();
  await writeSetting('last_sync_error', '');
  if (connection?.accessToken) {
    try {
      await fetch('https://oauth2.googleapis.com/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `token=${encodeURIComponent(connection.accessToken)}`,
      });
    } catch {}
  }
}

export async function storeGoogleTokens(accessToken: string, expiresIn: number, refreshToken?: string, clientId = requireClientId()) {
  let email = '';
  let name = '';
  let photo = '';
  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.ok) {
      const profile = await response.json() as { email?: string; name?: string; picture?: string };
      if (profile.email) email = profile.email;
      if (profile.name) name = profile.name;
      if (profile.picture) photo = profile.picture;
    }
  } catch {}

  if (!email || !name || !photo) {
    const profile = getCurrentUserProfile();
    if (profile) {
      if (!email && profile.email) email = profile.email;
      if (!name && profile.name) name = profile.name;
      if (!photo && profile.photo) photo = profile.photo;
    }
  }

  if (!email) {
    email = getCurrentUserEmail() ?? '';
  }

  if (!email) throw new Error('Tài khoản Google không trả về địa chỉ email.');
  await saveConnection({
    email,
    name: name || undefined,
    photo: photo || undefined,
    clientId,
    accessToken,
    refreshToken,
    expiresAt: Date.now() + expiresIn * 1000,
  });
  await writeSetting('last_sync_error', '');
}

async function getValidAccessToken(): Promise<string> {
  const connection = await getConnection();
  if (!connection) throw new Error('Hãy kết nối tài khoản Google Drive trước.');
  if (connection.expiresAt > Date.now() + 60_000) return connection.accessToken;
  if (!connection.refreshToken) {
    const accessToken = await getFreshDriveAccessToken();
    const updated = { ...connection, accessToken, expiresAt: Date.now() + 55 * 60 * 1000 };
    await saveConnection(updated);
    return accessToken;
  }
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: [
      `client_id=${encodeURIComponent(connection.clientId)}`,
      `grant_type=refresh_token`,
      `refresh_token=${encodeURIComponent(connection.refreshToken)}`,
    ].join('&'),
  });
  const payload = await response.json() as { access_token?: string; expires_in?: number; error_description?: string };
  if (!response.ok || !payload.access_token || !payload.expires_in) {
    throw new Error(payload.error_description || `Không làm mới được phiên Google (${response.status}).`);
  }
  const updated = { ...connection, accessToken: payload.access_token, expiresAt: Date.now() + payload.expires_in * 1000 };
  await saveConnection(updated);
  return updated.accessToken;
}

async function driveFetch(path: string, init?: RequestInit): Promise<Response> {
  let token = await getValidAccessToken();
  let response = await fetch(path, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${token}` },
  });
  if (response.status === 401) {
    // Token expired — try to silently refresh once
    let refreshed = false;
    try {
      token = await getFreshDriveAccessToken();
      const connection = await getConnection();
      if (connection) {
        await saveConnection({ ...connection, accessToken: token, expiresAt: Date.now() + 55 * 60 * 1000 });
      }
      response = await fetch(path, {
        ...init,
        headers: { ...init?.headers, Authorization: `Bearer ${token}` },
      });
      refreshed = true;
    } catch {
      refreshed = false;
    }
    // If refresh failed or still 401, clear the stored connection so UI shows "Chưa kết nối"
    if (!refreshed || response.status === 401) {
      try { await SecureStore.deleteItemAsync(TOKEN_KEY); } catch {}
      throw new Error('Phiên Google Drive đã hết hạn. Vui lòng bấm "Kết nối Google Drive" để đăng nhập lại.');
    }
  }
  if (!response.ok) {
    const body = await response.text();
    console.log('[driveFetch] Error response:', response.status, body);
    let detail = body;
    try {
      const parsed = JSON.parse(body) as { error?: { message?: string } };
      if (parsed.error?.message) {
        detail = parsed.error.message;
      }
    } catch {}
    if (response.status === 401) {
      detail = 'Mã xác thực Google đã hết hạn hoặc chưa được cấp quyền Drive. Vui lòng bấm Cấp lại quyền.';
    } else if (response.status === 403 && (detail.includes('Drive API has not been used') || detail.includes('API has not been used'))) {
      detail = 'Google Drive API chưa được bật trong dự án Google Cloud Console. Vui lòng bật Drive API.';
    } else if (response.status === 403) {
      detail = `Không có quyền truy cập Google Drive. ${detail}`;
    }
    throw new Error(`Google Drive lỗi ${response.status}: ${detail}`);
  }
  return response;
}

async function listFiles(kind: 'backup' | 'sync'): Promise<BackupFile[]> {
  const query = encodeURIComponent(`'appDataFolder' in parents and name contains 'foodtrack-${kind}-'`);
  const fields = encodeURIComponent('nextPageToken,files(id,name,modifiedTime,size,appProperties)');
  let pageToken: string | undefined;
  const files: BackupFile[] = [];
  do {
    const tokenQuery = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '';
    const result = await driveFetch(
      `${API}/files?spaces=appDataFolder&q=${query}&orderBy=modifiedTime%20desc&pageSize=100&fields=${fields}${tokenQuery}`,
    );
    const payload = await result.json() as { files?: BackupFile[]; nextPageToken?: string };
    files.push(...(payload.files ?? []));
    pageToken = payload.nextPageToken;
  } while (pageToken);
  return files;
}

async function downloadSnapshot(fileId: string): Promise<BackupSnapshot> {
  const response = await driveFetch(`${API}/files/${encodeURIComponent(fileId)}?alt=media`);
  return validateSnapshot(await response.json());
}

async function uploadSnapshot(snapshot: BackupSnapshot, kind: 'backup' | 'sync'): Promise<BackupFile> {
  const boundary = `foodtrack_${Date.now().toString(36)}`;
  const devicePart = snapshot.deviceId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 18);
  const suffix = `${snapshot.generatedAt.replace(/[:.]/g, '-')}-${devicePart}`;
  const name = `foodtrack-${kind}-${suffix}.json`;
  const metadata = JSON.stringify({
    name,
    parents: ['appDataFolder'],
    mimeType: 'application/json',
    appProperties: { kind, deviceId: snapshot.deviceId, schemaVersion: String(snapshot.schemaVersion) },
  });
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    metadata,
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(snapshot),
    `--${boundary}--`,
    '',
  ].join('\r\n');
  const response = await driveFetch(`${UPLOAD}/files?uploadType=multipart&fields=id,name,modifiedTime,size`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  return response.json() as Promise<BackupFile>;
}

export async function listBackups(): Promise<BackupFile[]> {
  const files = await listFiles('backup');
  return files.sort((left, right) => right.modifiedTime.localeCompare(left.modifiedTime));
}

export async function createDriveBackup(deviceId: string): Promise<BackupFile> {
  return uploadSnapshot(await createSnapshot(deviceId), 'backup');
}

export async function restoreDriveBackup(fileId: string): Promise<void> {
  const snapshot = await downloadSnapshot(fileId);
  await restoreSnapshot(snapshot);
}

export async function synchronizeDrive(deviceId: string): Promise<{ file: BackupFile; conflicts: number }> {
  let merged = await createSnapshot(deviceId);
  const files = await listFiles('sync');
  const latestByDevice = new Map<string, BackupFile>();
  for (const file of files) {
    const remoteDeviceId = file.appProperties?.deviceId;
    if (!remoteDeviceId || remoteDeviceId === deviceId) continue;
    const previous = latestByDevice.get(remoteDeviceId);
    if (!previous || file.modifiedTime > previous.modifiedTime) {
      latestByDevice.set(remoteDeviceId, file);
    }
  }
  let conflictCount = 0;
  for (const file of latestByDevice.values()) {
    const remote = await downloadSnapshot(file.id);
    const result = await mergeSnapshots(merged, remote);
    merged = result.snapshot;
    conflictCount += result.conflicts.length;
    await persistConflicts(result.conflicts);
  }
  await restoreSnapshot(merged);
  const uploaded = await uploadSnapshot(await createSnapshot(deviceId), 'sync');
  await writeSetting('last_sync_at', new Date().toISOString());
  await writeSetting('last_sync_error', '');
  return { file: uploaded, conflicts: conflictCount };
}

export function getOAuthClientId(): string {
  return requireClientId();
}

export async function oauthRefreshConfiguration() {
  const connection = await getConnection();
  return connection?.refreshToken;
}
