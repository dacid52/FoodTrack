# 04 — WebView, Native Bridge và luồng dữ liệu

## 4.1. Kiến trúc 2 chiều

```mermaid
sequenceDiagram
    participant W as WebView JS (modules/*.js)
    participant WV as react-native-webview
    participant N as FoodTrackWebView.tsx
    participant B as nativeBridge.ts
    participant R as records.ts / sync/*
    participant D as SQLite

    W->>W: requestNative(method, payload)
    W->>WV: ReactNativeWebView.postMessage(JSON {id,method,payload})
    WV->>N: onMessage → handleMessage(event)
    N->>N: validate: length ≤8MB, id /^ft-[a-z0-9-]{1,90}$/, method ≤80 chars, dedupe pendingRequests
    alt method = settings.openNative
        N->>W: respond success {opened:true}
        N->>N: router.push('/settings') sau 50ms
    else isBridgeWrite(method)
        N->>N: xếp vào writeQueue (tuần tự)
    end
    N->>B: handleNativeBridgeRequest(method, payload)
    B->>R: gọi hàm records/sync tương ứng
    R->>D: SQL
    B-->>N: data | throw Error(message tiếng Việt)
    N->>W: injectJavaScript("window.__foodTrackResolve({id,status,data|error}); true;")
    N->>N: setRepaintTick+1 (đổi backgroundColor #fbfbf9/#fbfbfa → ép native invalidate)
    W->>W: __foodTrackResolve → resolve/reject promise → render*.()
    W->>W: scheduleRepaint() → nudge scroll <main> 1px trong 2 frame
```

## 4.2. Phía WebView — `webview/modules/state.js`

Đây là "runtime" chung, load **đầu tiên** trong bundle:

- `state` (export `window.APP_STATE`): `currentTab`, `currentDashboardFilter`, `statsPeriod`, `products[]`, `transactions[]`, `summaries{}`, `cart{}`, `pending Map`, `writeQueue Promise`, `busy`...
- Helpers: `localDate()`, `escapeHtml()` (chống XSS khi render innerHTML), `formatMoney()` (vi-VN), `formatTime`, `formatDateTimeVi`, `setText`, `periodRange`, `dateOffsetString`.
- `requestNative(method, payload)`:
  - Reject ngay nếu `window.ReactNativeWebView.postMessage` chưa có (bridge chưa sẵn sàng).
  - id dạng `ft-<base36 time>-<counter>`.
  - Timeout: **60s cho method `drive.*`, 20s còn lại**.
  - Lưu `{resolve,reject,timer}` vào `state.pending`.
- `window.__foodTrackResolve(response)` — entry point native inject vào:
  - Tra `state.pending` theo id, clearTimeout, resolve/reject.
  - Gọi `scheduleRepaint()` (xem 4.4).
- `runWrite(method,payload)` — hàng đợi ghi phía web (serialize writes, mirror `writeQueue` native).
- `showToast(message,isError)`, `reportError(error)`, `setBusy(busy)`, `clearSampleContent()` (xóa placeholder mẫu có sẵn trong template), `ensureMenuDialogs`, `ensureImagePickerButton`...

## 4.3. Phía Native — `components/FoodTrackWebView.tsx`

| Thành phần | Vai trò |
|---|---|
| `Asset.fromModule(require('../assets/foodtrack/index.html'))` | Resolve asset → `localUri` (file://). `retry` state cho nút "Thử lại". |
| `handleMessage(event)` | Parse JSON (giới hạn `MAX_MESSAGE_LENGTH = 8_000_000`), validate `id` regex, dedupe `pendingRequests` Set, dispatch |
| `settings.openNative` | Method đặc biệt **không qua bridge**: respond `{opened:true}` rồi `router.push('/settings')` |
| `isBridgeWrite(method)` | products.*/orders.*/expenses.*/inventory.*/drive.{connect,sync,backup.create,backup.restore,disconnect,autoSync.set} → xếp `writeQueue` tuần tự, tránh race ghi DB |
| `respond(response)` | Escape `<`, U+2028/2029 → `\u003c`... rồi `injectJavaScript('window.__foodTrackResolve(...)')`; **`setRepaintTick+1`** |
| `repaintTick` | `style.backgroundColor` luân phiên `#fbfbf9`/`#fbfbfa` — workaround bug Android WebView không invalidate sau `evaluateJavascript` |
| `useFocusEffect` | Lần focus thứ 2 trở đi inject `window.FoodTrack.refresh()` |
| WebView props | `originWhitelist=['file://*','about:blank']`, `onShouldStartLoadWithRequest` chỉ cho file://, `javaScriptEnabled`, `domStorageEnabled` (localStorage cho onboarding flag), `cacheEnabled={false}`, `allowFileAccess*`, `mixedContentMode='never'`, `androidLayerType='hardware'`, `overScrollMode='never'` |

## 4.4. Workaround repaint (bug Android WebView đã biết)

**Triệu chứng:** sau bridge response, DOM đã update nhưng màn hình "đứng" tới khi user chạm — xảy ra với mọi thao tác async (filter dashboard, CRUD...).

**Nguyên nhân:** Android WebView không gọi `invalidate()` sau DOM mutation qua `evaluateJavascript`/`injectJavaScript` (issue đã biết của react-native-webview).

**3 lớp fix hiện có:**

1. `repaintTick` trong `FoodTrackWebView.tsx` — đổi `backgroundColor` imperceptible mỗi response → native invalidate. *(fix chính, cover mọi method)*
2. `scheduleRepaint()` trong `state.js` — **Web Animations API**: `document.body.animate([{opacity:0.998},{opacity:1}], {duration:120})` chạy trong `requestAnimationFrame` sau mỗi bridge response. Animation đang chạy bắt buộc compositor xuất frame vsync → frame mới chứa DOM mới nhất. Kèm scroll nudge ±1px trên `<main>`/window khi scrollable (chỉ là trigger phụ — không đủ khi trang không overflow). Dedupe bằng `repaintQueued`.
3. `setDashboardFilter` trong `dashboard.js` — auto `button.click()` lần 2 với flag `filterAutoTap` (skip fetch, chỉ re-render) cho nút filter dashboard.

Đã thử và **bỏ** (gây lag hoặc không hiệu quả): `androidLayerType="software"`, rải `forceRepaint()` khắp render functions, AppState listener, repaint injection mỗi respond, transform nudge trên `documentElement`, scroll nudge đơn thuần (thất bại khi trang không scroll được — `scrollTop` không đổi nên không frame nào được tạo). Nếu thêm fix mới, giữ nguyên tắc: **1 chỗ duy nhất, chi phí O(1)**.

## 4.5. `features/nativeBridge.ts` — allowlist & validation

`nativeMethods` (Set, dòng 34–58) — 23 method; `settings.openNative` xử lý riêng trong component, không qua set này:

| Method | Loại | Handler → hàm |
|---|---|---|
| `app.bootstrap` | read | `bootstrap()` — 13 `safeCall` song song: products, transactions(100), 4 summaries (today/yesterday/7days/month), prev-period summaries, dailyHistory(5 ngày), drive connection/lastSync/autoSync/backgroundStatus |
| `dashboard.summary` | read | `getDashboardSummary(from,to)` theo `period`: today/yesterday/7days/month/year (`rangeFor`) |
| `reports.summary` | read | `getDashboardSummary(from,to)` tự do |
| `reports.daily` | read | `getDailyReport(from,to,limit≤?)` |
| `history.list` | read | `listTransactions(min(limit,200), offset, from?, to?)` + `mapTransaction` |
| `history.detail` | read | `getTransactionById` → kèm `rawItems` nếu order, `expense` nếu expense |
| `products.save` | **write** | `saveProduct` — validate `image_uri` chỉ `data:image/` hoặc `file://`, ≤8M chars |
| `products.active` | write | `setProductActive` |
| `products.delete` | write | `deleteProduct` (soft) |
| `orders.create` | write | `createOrder(items[{productId,quantity≥1}], paymentMethod)` |
| `orders.update` | write | `updateOrder` — paymentMethod bắt buộc, occurredAt optional (`≤19` chars), items optional |
| `orders.delete` | write | `deleteOrder` |
| `expenses.create` | write | `createExpense` — category purchase/other, `occurredAt` **regex `YYYY-MM-DD HH:mm:ss`**, optional ingredientId/quantityMicros |
| `expenses.update` | write | `updateExpense` |
| `expenses.delete` | write | `deleteExpense` |
| `drive.status` | read | connection + lastSync/lastError/autoSync/backgroundStatus + `listBackups()` (lỗi list → `lastError`, không throw) |
| `drive.connect` | **write** | `signInForDrive(force)` → `storeGoogleTokens` → trả trạng thái giống drive.status |
| `drive.sync` | write | `synchronizeDrive(deviceId)` |
| `drive.backup.create` | write | `createDriveBackup(deviceId)` |
| `drive.backup.restore` | write | `restoreDriveBackup(fileId)` — validate snapshot rồi replace toàn bộ DB |
| `drive.disconnect` | write | `disconnectDrive` (xóa SecureStore + revoke token + signOut) |
| `drive.autoSync.set` | write | `setBackgroundSyncEnabled(enabled)` + `writeSetting('auto_sync')` |
| `images.pick` | read | `ImagePicker.launchImageLibraryAsync` → `ImageManipulator` resize width 800, JPEG q0.75 base64 → `data:image/jpeg;base64,...` |

Validation helpers: `objectValue`, `stringValue(v,label,max=500)`, `integerValue(v,label,min=0)`, `paymentMethod` enum, `safeCall` (bootstrap không chết vì 1 query lỗi).

`mapTransaction(row)` — chuẩn hóa row UNION thành shape WebView: `type` ('order'|'purchase'|'other'→'cost_import'/'cost_other'), `date`, `time` ("HH:mm - Hôm nay/Hôm qua/dd/mm/yyyy"), `method` tiếng Việt, `amount`, `desc=note`.

## 4.6. Timeout & hàng đợi

| Tầng | Cơ chế |
|---|---|
| Web | `state.pending` + setTimeout 20s/60s; `runWrite` serialize phía web |
| Native | `writeQueue` ref serialize write methods; `pendingRequests` dedupe id; log `[FT-BRIDGE-TIMING]` waitQueue/execute ms |

## 4.7. CSP & bảo mật WebView

`webview/templates/base.html` inject CSP:

```
default-src 'none'; img-src data: file: content: https:;
font-src data:; script-src 'unsafe-inline'; style-src 'unsafe-inline';
connect-src 'none'
```

→ WebView **không gọi mạng** (`connect-src 'none'`), mọi font/ảnh là data URI, script inline duy nhất là bundle đã build. `originWhitelist` + `onShouldStartLoadWithRequest` chặn navigation ra ngoài `file://`.
