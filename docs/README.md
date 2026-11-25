# FoodTrack — Bộ tài liệu dự án

Bộ tài liệu mô tả toàn bộ dự án **HaFood** (FoodTrack): ứng dụng mobile quản lý bán hàng, chi phí và lợi nhuận cho quán ăn vặt, xây dựng bằng **Expo / React Native** với giao diện chính chạy trong **Android WebView offline** và lớp dữ liệu **SQLite** trên thiết bị. Dữ liệu lưu hoàn toàn offline, không đồng bộ cloud.

Tài liệu được viết dựa trên source code thực tế tại thời điểm lập (thư mục gốc: `D:\FTrack\FoodTrack`).

## Mục lục

| # | File | Nội dung |
|---|------|----------|
| 1 | [01-tong-quan.md](01-tong-quan.md) | Tổng quan sản phẩm, kiến trúc hệ thống, sơ đồ luồng dữ liệu |
| 2 | [02-cau-truc-thu-muc.md](02-cau-truc-thu-muc.md) | Cấu trúc thư mục, vai trò từng file/thư mục |
| 3 | [03-co-so-du-lieu.md](03-co-so-du-lieu.md) | SQLite schema, các bảng, quan hệ, migration, tầng truy cập dữ liệu |
| 4 | [04-webview-bridge.md](04-webview-bridge.md) | Cơ chế WebView offline, Native Bridge, luồng request/response, danh sách bridge method |
| 5 | [05-chuc-nang.md](05-chuc-nang.md) | Toàn bộ chức năng theo từng màn hình (Dashboard, Sales, Menu, Stats, History) |
| 6 | [07-phat-trien-build.md](07-phat-trien-build.md) | Môi trường, chạy dev, lint/typecheck, build APK/AAB/iOS, quy trình sửa WebView + rebuild |
| 7 | [08-debug-bao-mat.md](08-debug-bao-mat.md) | Debug/log, xử lý lỗi, quyền truy cập, bảo mật, các vấn đề đã biết |
| 8 | [09-han-che.md](09-han-che.md) | Trạng thái hoàn thiện từng chức năng, hạn chế hiện tại, code legacy/dead code |

## Đọc nhanh

- App **chỉ có 1 màn hình native** hiển thị `FoodTrackWebView` (`app/(tabs)/_layout.tsx`). Toàn bộ UI nghiệp vụ nằm trong file HTML offline `assets/foodtrack/index.html`, được build từ `webview/templates/` + `webview/modules/` + `webview/css/`.
- Mọi thao tác dữ liệu đi qua **Native Bridge**: WebView → `window.ReactNativeWebView.postMessage` → `components/FoodTrackWebView.tsx` → `features/nativeBridge.ts` → `features/records.ts` → SQLite.
- Tài liệu cũ `DOCS.md` ở thư mục gốc **đã lỗi thời** (mô tả cấu trúc `webview/app.js` đơn file và các bảng ingredients/recipes như tính năng chính) — bộ tài liệu trong `docs/` này là nguồn tham khảo chính xác hiện tại.
