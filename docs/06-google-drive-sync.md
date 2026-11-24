# 06 — Google Authentication, Drive, Backup & Sync

## 6.1. Tổng quan

- Mục đích: sao lưu toàn bộ DB (8 bảng nghiệp vụ) lên **Google Drive `appDataFolder`** (thư mục ẩn riêng của app — không hiện trong Drive người dùng), đồng bộ đa thiết bị, khôi phục.
- Auth: `@react-native-google-signin/google-signin` v17, scope duy nhất `https://www.googleapis.com/auth/drive.appdata`.
- Token lưu trong **SecureStore** key `foodtrack.google.drive.connection` (JSON `DriveConnection`).
- Mọi Drive call qua `driveFetch()` với auto-refresh token.

## 6.2. Cấu hình OAuth

Env vars (file `.env`, Expo public — nhúng vào bundle):

| Biến | Dùng cho |
|---|---|
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | iOS/web fallback; cũng truyền vào `storeGoogleTokens` khi connect từ WebView |
| `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` | Android (ưu tiên trong `sync/drive.ts` CLIENT_ID) |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | iOS (`iosClientId` trong GoogleSignin.configure) |

`app.json` plugin `@react-native-google-signin/google-signin` khai `iosUrlScheme: com.googleusercontent.apps.948498720341-...` (reversed client ID iOS).

`sync/googleSignIn.ts`:
- `GoogleSignin.configure({ iosClientId, scopes: DRIVE_SCOPES, offlineAccess: false })` — **cố ý không set `webClientId`** (comment trong code: gây `DEVELOPER_ERROR` trên Android release; Android dùng OAuth client từ google-services.json).
- `offlineAccess: false` → **không có refresh_token** từ sign-in (`refreshToken: ''` trả về, expiresIn giả định 3600s).

## 6.3. Luồng đăng nhập — `signInForDrive(force)`

1. `configureGoogleSignIn()` (lazy, 1 lần).
2. `hasPlayServices({showPlayServicesUpdateDialog:true})`.
3. `signOut()` trước — để account picker luôn hiện.
4. `signIn()` với timeout 60s → `type==='cancelled'` trả `null`.
5. Kiểm tra `scopes` đã grant; nếu thiếu drive → `addScopes({scopes: DRIVE_SCOPES})` timeout 30s.
6. `clearCachedAccessToken` → `getTokens()` timeout 30s → trả `{accessToken, refreshToken:'', expiresIn:3600}`.
7. Lỗi `getTokens` có message hướng dẫn: OAuth consent screen đang Testing → cần Publish App hoặc thêm Test users.

Sau đó `drive.connect` handler gọi `storeGoogleTokens(accessToken, expiresIn, refreshToken?, clientId)`:
- Gọi `https://www.googleapis.com/oauth2/v2/userinfo` lấy `email/name/picture`; fallback `GoogleSignin.getCurrentUser()` / `getCurrentUserEmail()`.
- Bắt buộc có email → `saveConnection()` ghi SecureStore + xóa `last_sync_error`.

## 6.4. Token lifecycle — `getValidAccessToken()` + `driveFetch()`

- `expiresAt > now+60s` → dùng luôn.
- Hết hạn + **không có refreshToken** (trường hợp phổ biến do `offlineAccess:false`) → `getFreshDriveAccessToken()`: `signInSilently()` → clear cached token → `getTokens()` (timeout 20s) → lưu connection mới `expiresAt = now + 55min`.
- Có refreshToken → POST `oauth2.googleapis.com/token` grant_type=refresh_token.
- `driveFetch(path, init)`: gắn `Authorization: Bearer`, nếu **401** → thử refresh 1 lần; vẫn 401 → **xóa SecureStore connection** + throw "Phiên Google Drive đã hết hạn...". Map lỗi thân thiện: 403 Drive API chưa bật / thiếu quyền.

## 6.5. File naming & layout trên Drive

- Upload: `POST https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`, multipart/related: phần 1 metadata JSON `{name, parents:['appDataFolder'], mimeType:'application/json', appProperties:{kind, deviceId, schemaVersion}}`, phần 2 snapshot JSON.
- Tên file: `foodtrack-{kind}-{generatedAt}-{deviceId}.json` với `:`/`.` → `-`, deviceId sanitize + cắt 18 ký tự.
- `kind ∈ 'backup' | 'sync'` → 2 "kênh" file riêng.
- List: `GET /drive/v3/files?spaces=appDataFolder&q='appDataFolder' in parents and name contains 'foodtrack-{kind}-'&orderBy=modifiedTime desc&pageSize=100` phân trang `nextPageToken`.
- Download: `GET /drive/v3/files/{id}?alt=media` → `validateSnapshot()` (checksum + schema) trước khi dùng.

## 6.6. Backup / Restore / Sync

| Hàm | Hành vi |
|---|---|
| `createDriveBackup(deviceId)` | `createSnapshot` → upload kind='backup'. Snapshot = toàn bộ 8 bảng (kể cả soft-deleted) + checksum SHA256 |
| `listBackups()` | list kind='backup' sort modifiedTime desc |
| `restoreDriveBackup(fileId)` | download → `validateSnapshot` → `restoreSnapshot`: transaction DELETE toàn bộ 8 bảng rồi INSERT lại. **Thay thế hoàn toàn dữ liệu máy** |
| `synchronizeDrive(deviceId)` | Xem dưới |
| `disconnectDrive()` | Xóa SecureStore, `clearGoogleSignInSession` (signOut), xóa `last_sync_error`, revoke token qua `oauth2.googleapis.com/revoke` (best-effort) |

### `synchronizeDrive(deviceId)` — merge đa thiết bị

```mermaid
flowchart LR
    A[createSnapshot local] --> B[listFiles 'sync']
    B --> C[Chọn file mới nhất<br/>mỗi remote deviceId<br/>(appProperties.deviceId ≠ local)]
    C --> D[downloadSnapshot từng file<br/>→ validateSnapshot]
    D --> E[mergeSnapshots: theo id,<br/>compareRows: revision →<br/>updated_at → deleted_at → JSON]
    E --> F[persistConflicts → sync_conflicts]
    F --> G[restoreSnapshot merged → DB local]
    G --> H[uploadSnapshot kind='sync'<br/>+ last_sync_at]
```

- Bỏ qua file của chính device (`remoteDeviceId === deviceId`) và file thiếu `appProperties.deviceId`.
- Mỗi conflict ghi `sync_conflicts` với `resolution='revision-updatedAt-deletion-tie-break'` — **last-writer-wins theo revision**, không có UI resolve thủ công.
- Trả `{file, conflicts}` → WebView toast.

## 6.7. Đồng bộ nền — `sync/background.ts`

- Task `FOODTRACK_DAILY_DRIVE_SYNC` định nghĩa qua `TaskManager.defineTask`:
  - Guard: `app_settings.auto_sync === 'true'` và `getConnection()` tồn tại.
  - `device_id` chưa có → `newId()` + `writeSetting`.
  - `synchronizeDrive(deviceId)`; lỗi → `writeSetting('last_sync_error', msg)` + `BackgroundTaskResult.Failed`.
- `setBackgroundSyncEnabled(enabled)`:
  - Bật: check `BackgroundTask.getStatusAsync() === Available` (không thì throw "Tác vụ nền không khả dụng"), `registerTaskAsync(TASK_NAME, {minimumInterval: 24*60})` (1440 phút = 24h — đơn vị của expo-background-task là phút), rồi `auto_sync='true'`; nếu `writeSetting` fail → unregister bù.
  - Tắt: `auto_sync='false'` + `unregisterTaskAsync` nếu registered.
- **Được import side-effect ở `app/_layout.tsx`** (`import '../sync/background'`) để task đăng ký sớm.
- Lưu ý: `minimumInterval` là **gợi ý tối thiểu** — OS quyết định thời điểm chạy thực tế; trên nhiều máy có thể thưa hơn 24h.

## 6.8. `app/settings.tsx` — màn hình native dự phòng

Được mở từ WebView qua bridge method đặc biệt `settings.openNative` (không qua `nativeBridge.ts`, xử lý trực tiếp trong `FoodTrackWebView.tsx` → `router.push('/settings')`).

Chức năng trùng lặp với view-settings trong WebView nhưng dùng RN UI: connect (GoogleSignInButton → `signInForDrive` → `storeGoogleTokens` với clientId theo `Platform.OS`), sync now, backup, list backups + restore (Alert confirm), toggle auto-sync Switch, disconnect (Alert + tắt auto-sync nếu đang bật), hiển thị `localSize` KB của snapshot.

## 6.9. app_settings keys liên quan sync

| Key | Ý nghĩa |
|---|---|
| `device_id` | ID thiết bị sinh bởi `newId()`, dùng phân biệt snapshot trên Drive và merge |
| `auto_sync` | `'true'/'false'` — cờ cho background task + UI |
| `last_sync_at` | ISO thời điểm sync gần nhất |
| `last_sync_error` | message lỗi gần nhất ('' = không lỗi) |
