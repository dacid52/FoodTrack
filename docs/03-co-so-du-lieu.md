# 03 — Cơ sở dữ liệu (SQLite)

## 3.1. Tổng quan

- File DB: `foodtrack.db`, mở qua `getDatabase()` trong [database/index.ts](../database/index.ts).
- Singleton: biến `opening` cache promise — mọi caller dùng chung 1 connection.
- PRAGMA khi mở: `journal_mode=WAL`, `busy_timeout=5000`, `foreign_keys=ON`, `synchronous=NORMAL`.
- Migration theo `PRAGMA user_version`: schema ban đầu → v1, v2 (thêm `unit_cost_micros_vnd`), v3 (rebuild `orders`/`order_items`/`stock_movements` để `stock_movements.order_id` trỏ `orders_new` trước khi đổi tên — sửa FK cycle; sau đó `PRAGMA foreign_key_check`).

## 3.2. Sơ đồ quan hệ

```mermaid
erDiagram
    products ||--o| recipes : "product_id (UNIQUE)"
    ingredients ||--o{ recipe_ingredients : ingredient_id
    recipes ||--o{ recipe_ingredients : recipe_id
    orders ||--o{ order_items : order_id
    products ||--o{ order_items : "product_id (nullable)"
    expenses ||--o{ stock_movements : expense_id
    orders ||--o{ stock_movements : order_id
    ingredients ||--o{ stock_movements : ingredient_id
    app_settings ||--o{ } : "key/value"
```

## 3.3. Danh sách bảng

### products — món ăn bán

| Cột | Kiểu | Ghi chú |
|-----|------|---------|
| id | TEXT PK | `newId()` = base36 timestamp + 2 random |
| name | TEXT NOT NULL | tên món |
| description | TEXT | mặc định `''` |
| price_vnd | INTEGER NOT NULL CHECK >= 0 | giá bán, VNĐ nguyên |
| active | INTEGER 0/1 | đang bán? |
| image_uri | TEXT nullable | `data:image/jpeg;base64,...` (từ images.pick) hoặc `file://` |
| created_at / updated_at / deleted_at | TEXT ISO | soft delete |
| revision | INTEGER | tăng mỗi update |

Index: `products_active_name` partial `(active,name) WHERE deleted_at IS NULL`.

### ingredients — nguyên liệu (tồn kho)

`id, name, unit, quantity_micros, low_stock_micros, unit_cost_vnd, unit_cost_micros_vnd, timestamps, revision`.

- Số lượng lưu dạng **micros** (×1_000_000) — xem `utils/quantity.ts`.
- `unit_cost_vnd` = giá vốn VNĐ nguyên (denormalized từ micros/1e6); `unit_cost_micros_vnd` = giá vốn chính xác micros-VNĐ.

### recipes / recipe_ingredients — công thức

- `recipes`: `product_id UNIQUE REFERENCES products(id)`, `notes`.
- `recipe_ingredients`: `recipe_id`, `ingredient_id`, `quantity_micros > 0`, `UNIQUE(recipe_id, ingredient_id)`.

> **Lưu ý:** schema có ingredients/recipes/stock nhưng **WebView UI hiện không có màn hình quản lý nguyên liệu/công thức**. Chúng chỉ được ghi qua: (a) `createExpense`/`updateExpense` với `ingredientId + quantityMicros` (nhập kho — bridge chấp nhận nhưng WebView `expenses.js` hiện không gửi 2 field này), (b) code legacy native.

### orders / order_items — đơn bán

- `orders`: `order_number INTEGER UNIQUE` (MAX+1 trong transaction), `total_vnd >= 0`, `payment_method IN ('cash','transfer','debt')`, timestamps, revision.
- `order_items`: `order_id → orders`, `product_id → products` **nullable** (đơn cũ có thể mất product), `product_name` snapshot, `quantity > 0`, `unit_price_vnd`, `unit_cost_vnd` (hiện luôn ghi 0 — chưa tính giá vốn), timestamps, revision.
- Index: `orders_created_at` partial.

### expenses — chi phí

`id, category IN ('purchase','other'), amount_vnd > 0, title, note, payment_method, occurred_at, timestamps, revision`.

- **`occurred_at` bắt buộc format `YYYY-MM-DD HH:mm:ss`** (có dấu cách, không phải `T`) — enforce bằng regex trong `nativeBridge.ts` cho `expenses.create/update`. Trong khi `localDateTime()` của `database/format.ts` sinh format `YYYY-MM-DDTHH:mm:ss` (có `T`) — đây là **điểm không nhất quán đã biết**: expense tạo qua bridge dùng format space; các timestamp hệ thống (`created_at`...) dùng `T`. Query so sánh chuỗi vẫn đúng vì cùng độ dài.

### stock_movements — sổ kho

`ingredient_id → ingredients`, `kind IN ('purchase','sale','adjustment')`, `quantity_delta_micros` (có dấu), `unit_cost_vnd`, `unit_cost_micros_vnd`, `expense_id → expenses` nullable, `order_id → orders` nullable, `note`.

### app_settings — key/value

Các key đang dùng: `device_id`.

## 3.4. Soft delete & revision

- **Mọi entity nghiệp vụ dùng soft delete** (`deleted_at`). `records.ts` gần như không `DELETE` vật lý.
- **`revision`** tăng mỗi UPDATE.
- Query mặc định luôn `WHERE deleted_at IS NULL`.

## 3.5. Tầng truy cập dữ liệu — `features/records.ts`

| Nhóm | Hàm | Mô tả |
|------|-----|-------|
| Products | `listProducts()` | active+inactive, sort name NOCASE |
| | `saveProduct(input, id?)` | validate tên/giá>0; upsert; trả Product |
| | `setProductActive(id, active)` | toggle bán/ngừng |
| | `deleteProduct(id)` | soft delete |
| Ingredients | `listIngredients()`, `saveIngredient()`, `setStock()` | quản lý tồn kho + ghi stock_movement 'adjustment' |
| Expenses | `createExpense()` | transaction; nếu có ingredientId+quantityMicros → nhập kho, tính lại giá vốn bình quân gia quyền (weighted avg), ghi movement 'purchase' |
| | `updateExpense()` | rollback movement cũ rồi áp movement mới |
| | `deleteExpense()` | rollback movement liên quan |
| | `getExpenseById`, `listExpenses` | |
| Orders | `createOrder(items, paymentMethod)` | transaction: `order_number=MAX+1`, tính total từ giá hiện tại, chèn order_items; **không** trừ kho (stock chưa nối với order trong UI hiện tại) |
| | `updateOrder(id,{paymentMethod,occurredAt?,items?})` | nếu có items → xóa order_items cũ + movements cũ, tạo lại |
| | `deleteOrder(id)` | rollback stock_movements theo order_id, soft delete items+order |
| | `listOrders(limit=100)`, `loadOrderItems`, `getOrderById` | |
| Reports | `getDashboardSummary(from,to)` | `{revenue, orders, purchases, other, profit}` — profit = revenue − purchases − other; so sánh chuỗi ngày, `to` inclusive qua `nextDay(to)` |
| | `getDailyReport(from,to,limit=31)` | group theo ngày, trả revenue/orders/purchases/other |
| | `listTransactions(limit,offset,from?,to?)` | UNION orders (+total) và expenses (−amount), sort occurred_at DESC; khi không có from/to dùng 2 subquery LIMIT riêng rồi merge |
| | `getTransactionById(id)` | tra cả 2 bảng theo id |
| Settings | `readSetting(key)`, `writeSetting(key,value)` | upsert app_settings |

## 3.6. Định dạng thời gian & số lượng

- `localDateTime()` → `YYYY-MM-DDTHH:mm:ss` (giờ local, **không timezone**).
- `localDate()` → `YYYY-MM-DD`.
- `formatVnd(n)` → "1.234.567 đ" (vi-VN).
- Số lượng nguyên liệu: **micros** = giá trị × 1_000_000 (`utils/quantity.ts`, `SCALE`). Lưu cả `quantity_micros` và `unit_cost_micros_vnd`; cột `_vnd` (integer) là bản denormalize `Math.floor(micros/1e6)` phục vụ hiển thị.
- Tiền luôn `INTEGER` VNĐ — `assertVnd()` chặn số âm/không safe-integer.
