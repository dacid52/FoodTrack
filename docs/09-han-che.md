# 09 — Trạng thái hoàn thiện & hạn chế hiện tại

Đánh giá dựa trên source code thực tế. Ký hiệu: ✅ hoàn chỉnh · 🟡 hoạt động nhưng có hạn chế · 🔴 legacy/chưa dùng · ⚪ chưa triển khai.

## 9.1. Theo chức năng

| Chức năng | Trạng thái | Ghi chú |
|---|---|---|
| Dashboard (4 kỳ lọc + tăng trưởng) | ✅ | Workaround repaint auto-tap; data qua `dashboard.summary`/`reports.summary` |
| POS bán hàng (cart, 3 payment method) | ✅ | `orders.create`; không kiểm tra tồn kho |
| Quản lý món (CRUD, ảnh, bật/tắt) | ✅ | Ảnh = data URI JPEG ≤800px trong DB |
| Chi phí (import/other) | ✅ | `expenses.*`; **không** gửi `ingredientId/quantityMicros` từ WebView → nhập kho nguyên liệu không dùng được qua UI |
| Thống kê ngày/tháng/năm | ✅ | `reports.summary` + `reports.daily` |
| Lịch sử + lọc + chi tiết | ✅ | UNION orders/expenses; phân trang limit 200 |
| Onboarding first-launch | ⚪ | Đã gỡ cùng auth/Drive — app mở thẳng vào dashboard |
| Quản lý nguyên liệu / công thức / tồn kho | ⚪ | Schema + `records.ts` đầy đủ (ingredients, recipes, recipe_ingredients, stock_movements, setStock, weighted-avg cost) nhưng **không có UI nào gọi tới** qua bridge (không có method `ingredients.*`/`recipes.*`/`inventory.*` trong allowlist — `isBridgeWrite` có prefix `inventory.` nhưng không method nào match) |
| Sửa/xóa đơn hàng & chi phí | ⚪ | Bridge hỗ trợ `orders.update/delete`, `expenses.update/delete` nhưng **WebView không có UI gọi** — chỉ tạo mới được |
| Trừ kho khi bán (stock_movement 'sale') | ⚪ | `createOrder` không ghi movement; `order_items.unit_cost_vnd` luôn = 0 → lợi nhuận **chưa trừ giá vốn**, chỉ = revenue − chi phí |
| Đa ngôn ngữ | ⚪ | Toàn bộ text tiếng Việt hardcode |

## 9.2. Code legacy / dead code cần biết trước khi sửa

| Đường dẫn | Trạng thái | Ghi chú |
|---|---|---|
| `app/(tabs)/index.tsx, sales.tsx, menu.tsx, history.tsx, stats.tsx, two.tsx` | 🔴 | Route tồn tại nhưng `(tabs)/_layout.tsx` render `<FoodTrackWebView/>` cho mọi route → **không bao giờ hiển thị**. Vẫn compile/typecheck. |
| `app/modal.tsx`, `app/+html.tsx` | 🔴 | Template leftover |
| `components/ui.tsx`, `ExpenseSheet.tsx`, `LocalPhotoPicker.tsx`, `HeaderActions.tsx`, `Themed.tsx`, `StyledText.tsx`, `ExternalLink.tsx`, `EditScreenInfo.tsx`, `useColorScheme*.ts*` | 🔴 | Toàn bộ phục vụ native screens legacy — không còn được route nào dùng |
| `webview/app.js`, `webview/app.js.backup` | 🔴 | Bundle JS cũ đơn file — build script **không đọc**; chỉ còn vai trò "nuôi" class Tailwind trong `tailwind.config.js` content |
| `components/FoodTrackWebView.tsx.bak` | 🔴 | Backup thủ công |
| `store/useAppStore.ts` | 🟡 | Phần lớn field (products/orders/expenses/summary) chỉ phục vụ gate `ready/error` ở `_layout.tsx`; **không** phải source of truth cho UI (UI đọc qua bridge/bootstrap) |
| `utils/quantity.ts` | 🔴 | parse/format micros — chỉ legacy native screens dùng; WebView format số nguyên |
| `constants/Colors.ts`, `theme/tokens.ts` | 🟡 | tokens.ts dùng bởi FoodTrackWebView; Colors.ts template |
| `database/format.ts`, `utils/` | ✅ | formatVnd/localDateTime dùng thật |
| Bảng `ingredients/recipes/recipe_ingredients/stock_movements` | 🟡 | Ít dữ liệu thật — không có UI quản lý |

## 9.3. Hạn chế kỹ thuật đã biết

1. **Bug repaint Android WebView** — DOM update qua `injectJavaScript` không invalidate; đang có 3 lớp workaround (xem [04 §4.4](04-webview-bridge.md)). Chưa fix tận gốc; phụ thuộc phiên bản WebView của OS.
2. **`occurred_at` 2 format**: bridge bắt `YYYY-MM-DD HH:mm:ss` (space) cho expenses, còn `localDateTime()` hệ thống dùng `T`. So sánh chuỗi vẫn đúng nhưng dễ nhầm khi query thủ công.
3. **`tailwind.config.js` content globs lỗi thời** — trỏ `webview/app.js` legacy; regenerate `generated.css` có thể thiếu class mới (xem [07 §7.4](07-phat-trien-build.md)).
4. **`package.json` không có script `webview:build`** — phải nhớ `node scripts/build-webview.js` thủ công.
5. **`orders.update` sửa được `created_at`** — không audit; báo cáo theo thời gian có thể bị ảnh hưởng.
6. **`listTransactions` không phân trang thật** khi không có from/to (UNION 2 subquery `LIMIT limit+offset` rồi merge — offset hoạt động nhưng mỗi phía fetch dư); có from/to thì đúng SQL LIMIT/OFFSET.
7. **Không mã hóa DB** — dữ liệu bán hàng nằm plaintext SQLite; chấp nhận được cho quy mô quán ăn.
8. **`expo-media-library` + quyền storage thừa** — chỉ `images.pick` (image-picker) được dùng; `LocalPhotoPicker` legacy.
9. **`RECORD_AUDIO` permission thừa** trong app.json.
10. **EAS projectId/owner** gắn tài khoản `hyne04` — build EAS cần quyền account đó.
11. **Build webview phụ thuộc node_modules fonts** — `npm install` lại vẫn OK vì fonts là dependency chính thức; xóa node_modules trước build sẽ fail.
12. **`localStorage` WebView** — `domStorageEnabled` vẫn bật nhưng không còn flag onboarding nào dùng; có thể cân nhắc tắt.

## 9.4. Gợi ý hướng phát triển (nếu mở rộng)

- Đưa nguyên liệu/công thức/tồn kho lên UI: thêm method `ingredients.*`/`recipes.*` vào allowlist + module webview mới + migration UI.
- Tính giá vốn đơn hàng: ghi `stock_movements` kind='sale' trong `createOrder` (đã có sẵn `insertMovement` + `unit_cost_micros_vnd` trên ingredients) → `profit` mới phản ánh giá vốn.
- Thống nhất format datetime (chọn 1 chuẩn, migration dữ liệu cũ).
- Cập nhật `tailwind.config.js` content + thêm npm script `webview:build`.
- Dọn dead code native screens khi chắc chắn không cần fallback.
