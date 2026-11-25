# HaFood (FoodTrack)

Ứng dụng quản lý bán hàng, chi phí và lợi nhuận cho quán ăn vặt xây dựng bằng **Expo / React Native**. Toàn bộ dữ liệu lưu trực tiếp bằng **SQLite** trên thiết bị và hoạt động hoàn toàn offline.

## Tính năng chính

- **Tổng quan:** theo dõi lợi nhuận ròng, doanh thu, tiền nhập hàng và chi phí khác theo `Hôm nay`, `Hôm qua`, `7 ngày`, `Tháng này` cùng các giao dịch gần đây.
- **Tạo đơn (POS):** chọn món nhanh, điều chỉnh số lượng trong giỏ hàng, chọn phương thức thanh toán (`Tiền mặt`, `Chuyển khoản`, `Ghi nợ`).
- **Thực đơn:** thêm, sửa, ẩn/hiện món, hỗ trợ chọn và cắt ảnh trực tiếp từ thư viện thiết bị.
- **Báo cáo tài chính:** xem lợi nhuận và biểu đồ Thu – Chi theo `Ngày`, `Tuần`, `Tháng`.
- **Lịch sử giao dịch:** lọc theo ngày / tháng / năm bằng bộ chọn lịch tùy chỉnh, tìm kiếm và xem/sửa/xóa chi tiết đơn hàng hoặc khoản chi.

## Kiến trúc

- **Native (Expo / React Native):** lưu trữ SQLite (`database/`), xử lý nghiệp vụ (`features/records.ts`), chọn/nén ảnh và cầu nối giao tiếp (`features/nativeBridge.ts`, `components/FoodTrackWebView.tsx`).
- **WebView UI offline:** nguồn giao diện nằm trong `webview/templates/`, `webview/modules/` và `webview/css/`, được biên dịch bằng Tailwind CSS và đóng gói kèm font nội bộ thành một file duy nhất `assets/foodtrack/index.html` (không phụ thuộc CDN).

## Cài đặt và chạy dự án

Yêu cầu Node.js >= 18.

```bash
npm install
npm run webview:build
npm run typecheck
npx expo start
```

Sau khi chỉnh sửa giao diện trong `webview/`, chạy lại `npm run webview:build` để cập nhật `assets/foodtrack/index.html`.

> Ứng dụng sử dụng các module native (`expo-sqlite`, `expo-image-picker`, `expo-image-manipulator`, `react-native-webview`) nên cần chạy trên development build (`npx expo run:android` / `npx expo run:ios`) hoặc bản build EAS thay vì Expo Go.

## Build phát hành (EAS)

Cấu hình các profile build nằm trong `eas.json`:

```bash
npx eas-cli build --profile development --platform android
npx eas-cli build --profile preview --platform android
npx eas-cli build --profile production --platform android
npx eas-cli build --profile production --platform ios
```

- `preview`: xuất file `.apk` Android để cài đặt trực tiếp.
- `production`: xuất `.aab` Android và bản build iOS.

## Tài liệu chi tiết

Xem thêm mô tả kiến trúc, schema SQLite và danh sách Native Bridge trong thư mục [`docs/`](docs/README.md).
