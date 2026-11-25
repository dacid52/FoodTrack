# 05 — Chức năng theo màn hình

Toàn bộ 5 view nằm trong `assets/foodtrack/index.html` (build từ `webview/templates/`). Điều hướng bằng `switchTab(tabId)` trong `webview/modules/main.js` — toggle class `hidden`/`flex` trên `section#view-*`, cập nhật `#header-title` và style nút nav. `switchTab` hợp lệ: `dashboard, sales, menu, stats, history`.

`refreshAll()` (main.js) gọi `app.bootstrap` → đổ `state.products/transactions/dailyHistory/summaries` → gọi render của **tất cả** view (kể cả view đang ẩn).

## 5.1. VIEW 1 — Tổng quan (`dashboard.html` + `dashboard.js`)

- `renderDashboard()` — hiển thị lời chào + ngày, lợi nhuận là chỉ số nổi bật, doanh thu, chi nhập hàng, chi khác, số đơn, tăng trưởng so với kỳ trước, danh sách giao dịch gần đây (`state.transactions`).
- `setDashboardFilter(period)` — period ∈ `today | yesterday | 7days | month`:
  - Fetch song song `dashboard.summary {period}` + `reports.summary {from,to}` của kỳ liền trước (để tính % tăng trưởng).
  - Cập nhật `state.summaries[period]`, `state.previousSummaries[period]` rồi `renderDashboard()`.
  - **Workaround repaint:** sau 60ms tự `button.click()` lên nút vừa bấm với flag `filterAutoTap` → lần click này skip fetch, chỉ re-render (xem [04 §4.4](04-webview-bridge.md)).
- Nút "Bán hàng" trên header card → `switchTab('sales')`.

## 5.2. VIEW 2 — Bán hàng / POS (`sales.html` + `sales.js`)

- `renderSalesProducts()` — grid món từ `state.products` (chỉ `active`, trừ khi search); mỗi card: ảnh (`image_uri` data URI), tên, giá `formatMoney`.
- `filterSalesProducts()` / `clearSalesSearch()` — lọc theo `state.salesSearchQuery`.
- Giỏ hàng `state.cart` (object productId → {product, quantity}):
  - `addToCart(id)`, `updateCartQuantity(id, delta)` (delta ±1, xóa item khi về 0).
  - `cartTotals()` → tổng tiền + tổng món; `renderCartUI()` cập nhật dock cart, badge `#dock-cart-badge`, sheet giỏ `#sales-cart-sheet`.
- `setPaymentMethod(method)` — `cash | transfer | debt`.
- `confirmOrder()` → `runWrite('orders.create', {items:[{productId,quantity}], paymentMethod})` → `refreshAll()` (hoặc cập nhật cục bộ) + toast.
- `updateOrderButtonsState()` — disable nút xác nhận khi giỏ rỗng/`state.busy`.

## 5.3. VIEW 3 — Menu (`menu.html` + `menu.js`)

- `renderMenuItems()` — list món với ảnh, giá, trạng thái; đếm `#menu-total-count`, `#menu-active-count`, `#menu-inactive-count`.
- `filterMenuItems()` + `setMenuStatusFilter('all|active|inactive')` + `state.menuSearchQuery`.
- `toggleProductStatus(id, active)` → `products.active` (write) → cập nhật state.
- `deleteProduct(id)` → mở `#delete-product-modal` → `confirmDeleteProduct()` → `products.delete` (soft delete phía DB).
- `openEditMenuModal(id)` — form thêm/sửa: tên, giá, mô tả, toggle trạng thái (`toggleFormStatusLabel`).
- `saveMenuItem()` → `products.save` `{id?, name, description, price_vnd, active, image_uri}` → toast + re-render.
- **Ảnh món:** `pickProductImage()` → `requestNative('images.pick')` → nhận `data:image/jpeg;base64` → preview `#menu-image-preview` (`updateMenuImagePreview`). `ensureImagePickerButton()` inject nút "Chọn ảnh" vào DOM; `ensureMenuDialogs()` đảm bảo modal tồn tại. Phần "chọn nhanh ảnh mẫu" (6 ảnh Unsplash trong `modals.html`) **bị xóa khi native picker khả dụng** — app offline nên thực tế dùng `images.pick`.

## 5.4. VIEW 4 — Thống kê (`stats.html` + `stats.js`)

- `setStatsPeriod('day|month|year')` + `changeStatsMonth(delta)` — điều hướng kỳ (`state.statsMonthOffset`).
- `statsRange()` → `{from,to}`; `refreshStats()` fetch song song:
  - `reports.summary {from,to}` → card lợi nhuận nổi bật, net revenue, tổng đơn, doanh thu, chi nhập/khác.
  - `reports.daily {from,to,limit}` với `limit=366` cho kỳ năm, `31` cho ngày/tháng → danh sách lợi nhuận ròng theo ngày (`#stats-daily-list`, format `dd/mm/yyyy • N đơn • Thu: ...`).
- Nhãn kỳ: `#stats-filter-period-label` ("Kỳ thống kê: Tháng 10, 2025"...), picker `#stats-period-picker-bar`.

## 5.5. VIEW 5 — Lịch sử (`history.html` + `history.js`)

- Bộ lọc thời gian `state.historyTimeMode`: `day | week | month | year | custom` + `historyDaySub` (today/yesterday/date) + `historyCustomDate` + `historySelectedMonth/Year`.
- `historyRange()` → `{from,to}`; `refreshHistory()` → `history.list {...range, limit:200}` → `state.historyTransactions` → `renderHistoryView()`.
- `setHistoryFilter` + `filterHistoryList()` + `state.historySearchQuery` — lọc theo loại (đơn/chi) và text.
- `openTxDetailModal(transaction)` (trong `expenses.js`) → `history.detail {id}` → hiển thị chi tiết: đơn hàng kèm `rawItems` (tên món × số lượng), chi phí kèm `expense`.
- `initializeHistoryControls()` — khởi tạo select ngày/tháng/năm trong template.
- Nút "Nhập/Xuất" (`openExpenseModal('import')`) trên header → modal chi phí.

## 5.6. Chi phí (`expenses.js` + `modals.html` — modal dùng chung)

- `openExpenseModal(type)` — `type ∈ 'import' | 'other'` → `state.expenseType`; map DB: `import→purchase`, `other→other`.
- Form: số tiền (nút quick-add `addExpenseAmount`), nội dung, ghi chú, ngày+giờ, `setExpensePayMethod`.
- `saveExpenseRecord()` → `expenses.create` `{category, amountVnd, title, note, paymentMethod, occurredAt: "YYYY-MM-DD HH:mm:ss"}` → toast + refresh.
- **Không có UI sửa/xóa chi phí hay đơn hàng trong WebView** — bridge vẫn hỗ trợ `expenses.update/delete`, `orders.update/delete` nhưng không module nào gọi (xem [09](09-han-che.md)).

## 5.7. Modal chỉnh ảnh (`image-crop-modal` trong `modals.html` + `menu.js`)

- `pickProductImage()` → `requestNative('images.pick')` → nhận `data:image/jpeg;base64` → mở `#image-crop-modal` thay vì gán thẳng.
- Crop: kéo 1 ngón để di chuyển, **chụm 2 ngón tay để zoom** (1x–4x) neo theo điểm giữa 2 ngón, slider `#crop-zoom` tinh chỉnh; giới hạn pan không lộ khoảng trống.
- `confirmImageCrop()` → canvas xuất ảnh vuông 800×800 JPEG → preview `#menu-image-preview`; `closeImageCropModal()` hủy.

## 5.8. Toast & helper UI

- `showToast(message, isError)` — inject vào `#toast-container`, tự xóa sau 2600ms; animation `toast-animate` trong `webview/css/custom.css`.
- Mọi lỗi bridge → `reportError` → toast đỏ.
- `setBusy(true/false)` — disable nút trong khi write.

## 5.9. Bảng method → module (tra nhanh)

| Module | Bridge methods dùng |
|---|---|
| main.js | `app.bootstrap` (refreshAll) |
| dashboard.js | `dashboard.summary`, `reports.summary` |
| sales.js | `orders.create` |
| menu.js | `products.save`, `products.active`, `products.delete`, `images.pick` |
| expenses.js | `expenses.create`, `history.detail` |
| stats.js | `reports.summary`, `reports.daily` |
| history.js | `history.list` |
