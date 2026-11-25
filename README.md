# FoodTrack

FoodTrack là ứng dụng Expo/React Native. Giao diện Google Stitch được đóng gói thành HTML/CSS/JavaScript offline và hiển thị bằng một WebView; React Native xử lý điều hướng, SQLite, nghiệp vụ và chọn ảnh. SQLite là nguồn dữ liệu chính trên thiết bị. Dữ liệu món ăn, kho, công thức, đơn hàng, chi phí, báo cáo và lịch sử lưu hoàn toàn offline trên máy — không đồng bộ cloud.

## Chạy ứng dụng cục bộ (Windows)

```powershell
cd D:\FTrack\FoodTrack
$env:npm_config_cache = 'D:\FTrack\.npm-cache'
npm.cmd install
npm.cmd run webview:build
npm.cmd run typecheck
npx.cmd expo start
```

Hãy cài thư viện và lưu cache trên ổ `D:`. Để tạo bản phát triển Android/iOS, cần có bộ công cụ native tương ứng hoặc tài khoản EAS; Expo Go không tích hợp tất cả các module native mà ứng dụng sử dụng.

Giao diện gốc nằm trong `D:\FTrack\UX-UI`. Sau khi chỉnh sửa HTML hoặc CSS, chạy `npm.cmd run webview:build` để biên dịch Tailwind và tạo `assets\foodtrack\index.html` có font nhúng, không cần CDN. JavaScript giao diện riêng của ứng dụng nằm trong `webview\app.js`; yêu cầu nghiệp vụ đi qua bridge được giới hạn trong `features\nativeBridge.ts`, không truy cập SQLite trực tiếp từ WebView.

## Build bằng EAS

Các cấu hình build EAS nằm trong `eas.json`. Trước lần build đầu tiên, hãy đăng nhập EAS và liên kết ứng dụng với một dự án EAS bằng `eas init` (lệnh này ghi project ID vào `app.json`). Sau đó chạy:

```powershell
npx.cmd eas-cli build --profile development --platform android
npx.cmd eas-cli build --profile preview --platform android
npx.cmd eas-cli build --profile production --platform android
npx.cmd eas-cli build --profile production --platform ios
```

Profile `preview` tạo APK Android có thể cài đặt; profile `production` tạo AAB Android và bản build iOS. Nếu mã định danh gói mẫu `com.foodtrack.app` đã được ứng dụng khác sử dụng, hãy đổi mã này trước khi phát hành. Ký và phân phối ứng dụng iOS cần thông tin xác thực Apple Developer.

## Mô hình dữ liệu

Các migration SQLite hiện dùng `PRAGMA user_version` (phiên bản schema 3). Giá trị tiền được lưu bằng số nguyên VNĐ; định lượng nguyên liệu và đơn giá vốn được lưu bằng số nguyên theo đơn vị phần triệu để bảo toàn độ chính xác. Bản ghi món ăn, nguyên liệu, công thức, dòng công thức, đơn hàng, chi tiết đơn, chi phí và biến động kho có ID ổn định, mốc thời gian, revision và dấu xóa. Các thay đổi liên quan nhiều bản ghi đối với đơn hàng, kho, chi phí và khôi phục đều dùng transaction SQLite.

Ứng dụng không tạo sẵn dữ liệu nghiệp vụ. Các giá trị ví dụ trong HTML Stitch chỉ là tài liệu tham khảo giao diện.

## Kiểm tra và cấu hình bên ngoài

`npm run typecheck` kiểm tra TypeScript. Build ứng dụng Android/iOS trên thiết bị cần cấu hình ký ứng dụng, EAS và thiết bị thật; các phần này không thể được xác nhận chỉ bằng kiểm tra TypeScript cục bộ.
