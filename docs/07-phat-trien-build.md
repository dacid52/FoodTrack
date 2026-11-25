# 07 — Phát triển, cài đặt môi trường và build

## 7.1. Yêu cầu môi trường

- **Node.js** (đã dùng `node scripts/build-webview.js`; `npx`/`bunx` đều được — repo không có `bun.lock` nên dùng `npx`).
- **Android Studio** + SDK cho build Android local; **Xcode** cho iOS (macOS).
- Tài khoản **EAS** (Expo Application Services) cho build cloud — `eas.json` đã config, `extra.eas.projectId` có sẵn trong `app.json`.

## 7.2. Cài đặt & chạy dev

```bash
npm install          # hoặc bun install / npm ci (có package-lock.json)
npx expo start       # Metro bundler, quét QR bằng Expo Go / dev build
```

Script có sẵn trong `package.json`:

| Lệnh | Tác dụng |
|---|---|
| `npm start` | `expo start` |
| `npm run android` | `expo run:android` — build dev client native rồi chạy |
| `npm run ios` | `expo run:ios` |
| `npm run web` | `expo start --web` (UI web không phải mục tiêu chính) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | `expo lint` |

> AGENTS.md quy định: dùng `npx expo install <pkg>` thay cho npm add; đọc docs Expo versioned trước khi dùng API mới. Chạy `lint` + `typecheck` trước khi kết thúc task.

## 7.3. Build native

### Local (cần Android Studio / Xcode)

```bash
npx expo run:android   # debug build, cài lên máy ảo/device
```

Thư mục `android/` **đã được generate sẵn** trong repo (kèm `debug.keystore`, `foodtrack.keystore`, `proguard-rules.pro`). Theo AGENTS.md, `android/` là generated — không sửa tay; cấu hình qua `app.json` + config plugins. Nếu xóa `android/` có thể tái tạo bằng `npx expo prebuild`.

### EAS cloud

`eas.json` profiles:

| Profile | Android | iOS | Dùng cho |
|---|---|---|---|
| `development` | developmentClient, internal | — | dev build cài tay |
| `preview` | **apk**, internal | — | QA/test APK |
| `production` | **app-bundle (AAB)**, autoIncrement | production | Google Play |

```bash
npx eas-cli@latest build --profile preview --platform android   # APK
npx eas-cli@latest build --profile production --platform android # AAB
npx eas-cli@latest build --profile production --platform ios     # iOS (cần Apple creds)
npx eas-cli@latest submit --platform android                     # upload Play
```

App config: name `FoodTrack`, slug `foodtrack`, version `1.0.0`, package/bundleId `com.foodtrack.app`, scheme `foodtrack`, portrait, hermes. Android permissions khai trong `app.json`: `RECORD_AUDIO`, `READ/WRITE_EXTERNAL_STORAGE`, `READ_MEDIA_IMAGES`, `READ_MEDIA_VISUAL_USER_SELECTED`.

## 7.4. Quy trình sửa WebView UI (QUAN TRỌNG)

WebView là **offline single-file**: không fetch runtime, không module loader. Mọi sửa UI phải qua build script.

### Cấu trúc nguồn

```
webview/
├── templates/     10 partial HTML, ghép theo đúng thứ tự bên dưới
├── modules/       9 file JS (concat vào 1 IIFE <script> trước </body>)
├── css/custom.css CSS bổ sung (style block riêng)
├── generated.css  Tailwind đã build (minified, commit sẵn)
└── input.css      @tailwind directives
```

Thứ tự template trong `scripts/build-webview.js` (dòng 42–55) — **sai thứ tự = vỡ layout**:

`base → header → dashboard → sales → menu → stats → history → footer(nav+home indicator) → modals → toast`

Build script còn:
- Inject `<main class="flex-1 overflow-y-auto hide-scrollbar relative">` trước VIEW 1 và `</main>` sau `</section>` của history (trước footer).
- Inject 3 `<style>`: font-faces (Be Vietnam Pro 400–900 + Material Symbols, **base64 nhúng từ node_modules**), `generated.css`, `custom.css`.
- Append `<script>(function(){ ...modules... })();</script></body></html>`.
- Ghi `assets/foodtrack/index.html`.

### Các bước sửa UI

```bash
# 1. Sửa webview/templates/*.html và/hoặc webview/modules/*.js, webview/css/custom.css
# 2. Rebuild:
node scripts/build-webview.js
# 3. Reload app (dev: r trong Metro / reload; release: rebuild)
npx tsc --noEmit   # nếu đụng file .ts/.tsx
```

Quy tắc bất biến:

- **Giữ nguyên mọi `id`, `class`, `onclick`** mà JS modules và CSS đang dùng — template chỉ là "mảnh HTML", logic nằm ở modules.
- Thêm module JS mới → thêm vào mảng `jsModules` trong build script **đúng vị trí** (state.js phải đầu, main.js cuối vì chứa boot + window bindings).
- Thêm template mới → thêm vào `templateFiles` đúng vị trí; cẩn thận thẻ đóng `</div>` — build script **không validate DOM**, lệch 1 thẻ là navbar/modal vỡ (đã từng xảy ra).
- `onclick="fn()"` trong HTML yêu cầu `fn` được export ra `window` trong `main.js` (`Object.assign(window, {...})`).

### Regenerate `generated.css` (Tailwind)

```bash
npx tailwindcss -c tailwind.config.js -i webview/input.css -o webview/generated.css --minify
```

⚠️ **Cạm bẫy đã biết:** `tailwind.config.js` `content` hiện chỉ trỏ `../UX-UI/code.html` và `./webview/app.js` (file legacy không còn được build dùng). Các class **chỉ xuất hiện trong `webview/templates/` hoặc `webview/modules/`** có thể thiếu trong CSS sau khi regenerate. Trước khi regen, cập nhật `content` thành ví dụ `["./webview/templates/**/*.html", "./webview/modules/**/*.js", "../UX-UI/code.html"]` và kiểm tra lại UI. `hide-scrollbar`, `toast-animate` nằm trong `custom.css` (không phụ thuộc Tailwind).

### File KHÔNG được sửa tay

- `assets/foodtrack/index.html` — generated.
- `webview/app.js`, `webview/app.js.backup` — legacy, không được build script đọc.
- `android/`, `ios/` — generated native.

## 7.5. Font & assets trong WebView

- Be Vietnam Pro (400/500/600/700/800/900) nhúng base64 từ `node_modules/@expo-google-fonts/be-vietnam-pro` bởi build script → `@font-face`.
- Material Symbols Outlined từ `@fontsource-variable/material-symbols-outlined` → woff2 base64.
- Ảnh món: `data:image/jpeg;base64` lưu trong DB (`products.image_uri`) — không tốn storage ngoài.

## 7.6. Cập nhật phiên bản

- `version` trong `app.json` + `eas.json` `appVersionSource: remote` + `autoIncrement` (production) — versionCode tự tăng trên EAS.
- WebView bundle nằm trong app assets → **mọi thay đổi webview đều cần build lại app**, không OTA riêng (trừ khi dùng `expo-updates` — hiện chưa cấu hình).
