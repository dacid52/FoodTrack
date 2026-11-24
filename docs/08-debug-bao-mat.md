# 08 — Debug, xử lý lỗi, quyền truy cập và bảo mật

## 8.1. Công cụ debug sẵn có

| Công cụ | Cách dùng | Log/điểm quan sát |
|---|---|---|
| Metro console | `npx expo start` | Log native: `[FT-BOOTSTRAP-SAFE]`, `[FT-SQL-TIMING]`, `[FT-BRIDGE-TIMING]`, `[FT-BRIDGE-TIMING-ERROR]`, `[FT-BRIDGE-RESOLVE]` (web), `[GoogleSignIn]`, `[driveFetch]` |
| Chrome DevTools → `chrome://inspect` | WebView debuggable trong dev build | Console WebView: `[FT-REFRESH-ALL]`, `[FT-BRIDGE-RESOLVE]`; DOM inspect trực tiếp |
| React Native DevTools | Flipper/Expo dev menu | Xem native state |
| `npx expo-doctor` | Chẩn đoán dependency/config | Theo AGENTS.md |
| `npx tsc --noEmit`, `npx expo lint` | Typecheck + lint | Bắt buộc trước khi xong task |

Log timing hữu ích nhất khi app "lag": `[FT-BRIDGE-TIMING] <method> -> waitQueue: Xms, execute: Yms` — phân biệt chờ hàng đợi write vs thời gian SQL.

## 8.2. Lỗi thường gặp & cách xử lý

### WebView trắng / không load
- `loadError` state trong `FoodTrackWebView.tsx` hiện màn hình "Không mở được giao diện FoodTrack" + nút **Thử lại** (tăng `retry` → `Asset.downloadAsync` lại).
- Kiểm tra `assets/foodtrack/index.html` tồn tại và mới nhất (`node scripts/build-webview.js`).
- WebView props chặn mọi URL ngoài `file://` — nếu thấy trắng, check `onShouldStartLoadWithRequest`.

### Dashboard trống / "giao dịch gần đây" rỗng khi khởi động
- `app.bootstrap` bọc mọi query trong `safeCall` → 1 query lỗi không làm chết bootstrap; nếu **tất cả** rỗng → DB lỗi. Xem log `[FT-BOOTSTRAP-SAFE] ... warning` và `useAppStore.error` (màn hình "Không mở được dữ liệu FoodTrack" + nút Thử lại ở `_layout.tsx`).
- Web side retry boot 8 lần × 500ms (`main.js` `setInitialDisplay`).
- Race `useAppStore.refresh()` vs bootstrap đã được giảm bằng `busy_timeout=5000` + WAL.

### Dữ liệu cập nhật nhưng màn hình "đứng" (phải chạm mới thấy)
- Bug Android WebView invalidate — xem [04 §4.4](04-webview-bridge.md). Hiện có 3 lớp workaround; **không thêm `forceRepaint` rải rác** (đã gây lag). Nếu tái phát, kiểm tra `repaintTick` còn trong `respond()` không.

### Google Sign-In / Drive lỗi
- `DEVELOPER_ERROR`: thường do OAuth consent screen còn **Testing** — publish app hoặc thêm email vào Test users (message lỗi trong `googleSignIn.ts` đã hướng dẫn).
- `getTokens` timeout 30s: Play Services không trả token — kiểm tra SHA-1 của keystore đăng ký trong Google Cloud, package name `com.foodtrack.app`.
- Drive API lỗi 403 "API has not been used": **bật Drive API** trong Google Cloud Console.
- 401 liên tục: token hết hạn + `signInSilently` fail → connection bị xóa, UI về "Chưa kết nối" → user phải connect lại.
- Android release: code cố ý **không** set `webClientId` (gây DEVELOPER_ERROR) — đừng thêm lại.

### SQLite errors
- `SQLITE_BUSY`: đã có `busy_timeout=5000`; write methods đã serialize qua `writeQueue` (cả 2 phía). Nếu vẫn lỗi, check concurrent `restoreSnapshot` (xóa+insert lớn trong 1 transaction).
- `foreign_key_check` fail sau migration v3 → throw lỗi rõ ràng; DB về trạng thái trước migration.

## 8.3. Quyền truy cập (permissions)

`app.json` Android permissions:

| Permission | Lý do |
|---|---|
| `READ_MEDIA_IMAGES`, `READ_MEDIA_VISUAL_USER_SELECTED` | `expo-image-picker` chọn ảnh món |
| `READ/WRITE_EXTERNAL_STORAGE` | legacy cho image picker/media-library |
| `RECORD_AUDIO` | khai sẵn (template thừa — app không ghi âm; có thể cân nhắc gỡ) |

iOS: `infoPlist` qua plugins — `photosPermission` tiếng Việt cho image-picker & media-library; `iosUrlScheme` cho Google Sign-In.

## 8.4. Bảo mật — những điểm cần biết

**Đã làm tốt:**

- CSP nghiêm ngặt trong WebView: `default-src 'none'`, `connect-src 'none'` → UI không thể gọi mạng hay load script ngoài; mọi font/ảnh là data URI.
- `originWhitelist` + `onShouldStartLoadWithRequest` chỉ cho `file://`/`about:blank`.
- Bridge allowlist: chỉ 23 method trong `nativeMethods` + `settings.openNative` xử lý riêng; method lạ → throw. Payload validate kiểu/độ dài (`stringValue`, `integerValue`, enum, regex `occurredAt`, `image_uri` chỉ `data:image/` hoặc `file://`).
- Request id regex + dedupe + giới hạn message 8MB.
- Token Google trong **SecureStore** (Keychain/Keystore), không AsyncStorage.
- Escape HTML (`escapeHtml`) trước khi inject vào innerHTML; `image_uri` whitelist scheme.
- Snapshot backup có **checksum SHA256** + validate schema/quan hệ trước restore → chống file backup giả mạo/hỏng.
- Secret không hardcode: client ID qua env `EXPO_PUBLIC_*` (lưu ý: public env **vẫn nằm trong bundle** — chỉ là OAuth client ID, vốn public-by-design).

**Rủi ro / hạn chế cần lưu ý:**

- `script-src 'unsafe-inline'` + toàn bộ JS inline trong 1 file HTML → nếu attacker sửa được `assets/foodtrack/index.html` trong APK là chiếm được WebView; nhưng file nằm trong app bundle signed nên rủi ro thấp.
- `allowFileAccess` + `allowingReadAccessToURL` mở rộng — WebView đọc được file local; ảnh `file://` được chấp nhận làm `image_uri`.
- `localStorage` trong WebView (`domStorageEnabled`) lưu `foodtrack_onboarded` — không nhạy cảm.
- **Không mã hóa DB** — dữ liệu bán hàng nằm plaintext SQLite; backup trên Drive `appDataFolder` cũng plaintext JSON (ai có quyền appDataFolder của account đó đọc được — thực tế chỉ app đó).
- `sync_conflicts` ghi nhận nhưng **không có UI hiển thị/xử lý** — conflict thua mất dữ liệu bản ghi đó (last-writer-wins).
- `orders.update` cho phép sửa `created_at` (qua `occurredAt`) — ảnh hưởng báo cáo lịch sử; không audit log.
- `.env` chứa client ID — đã được `.gitignore` loại trừ (`.env`, `.env*.local`), không commit.
- `RECORD_AUDIO` permission thừa nên gỡ để giảm attack surface.

## 8.5. Khi báo lỗi cho maintainer, nên kèm

1. `npx expo start` console log (đặc biệt `[FT-BRIDGE-TIMING-ERROR]`).
2. `chrome://inspect` console của WebView.
3. Method bridge gây lỗi + payload (che dữ liệu nhạy cảm).
4. `PRAGMA user_version` và `SELECT COUNT(*)` các bảng nếu nghi DB.
5. Loại build (dev/preview/production) và thiết bị/Android version — bug repaint WebView phụ thuộc OS WebView version.
