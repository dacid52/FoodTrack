# 02 — Cấu trúc thư mục và vai trò từng file

Gốc dự án: `D:\FTrack\FoodTrack`

```
FoodTrack/
├── app/                        # Expo Router routes (React Native screens)
│   ├── _layout.tsx             # Root Stack: fonts, splash, gate DB
│   ├── modal.tsx               # Template leftover (không dùng trong luồng chính)
│   ├── +html.tsx               # Expo web static HTML (không dùng)
│   ├── +not-found.tsx          # 404 screen
│   └── (tabs)/
│       ├── _layout.tsx         # ← CHỈ render <FoodTrackWebView/> (không có Tabs navigator)
│       ├── index.tsx           # LEGACY native dashboard (không hiển thị)
│       ├── sales.tsx           # LEGACY native sales
│       ├── menu.tsx            # LEGACY native menu
│       ├── history.tsx         # LEGACY native history
│       ├── stats.tsx           # LEGACY native stats
│       └── two.tsx             # Template leftover
├── assets/
│   ├── foodtrack/index.html    # ★ FILE WEBVIEW ĐÃ BUILD (generated — KHÔNG sửa tay)
│   └── images/                 # icon, splash, adaptive icons
├── components/
│   ├── FoodTrackWebView.tsx    # ★ WebView host: load index.html, handleMessage, injectJavaScript
│   ├── FoodTrackWebView.tsx.bak# Bản backup cũ
│   ├── ui.tsx                  # UI primitives cho native screens (Card, Button, Page...)
│   ├── ExpenseSheet.tsx        # LEGACY: bottom sheet ghi chi phí native
│   ├── LocalPhotoPicker.tsx    # LEGACY: picker ảnh từ media-library
│   ├── HeaderActions.tsx       # LEGACY: nút header native
│   ├── Themed.tsx / StyledText.tsx / ExternalLink.tsx / EditScreenInfo.tsx
│   ├── useColorScheme*.ts*     # Hooks màu sắc (template)
├── database/
│   ├── index.ts                # ★ getDatabase(), schema SQL, migration user_version 1→3
│   ├── types.ts                # Kiểu dữ liệu: Product, Order, Expense, Ingredient...
│   └── format.ts               # formatVnd, localDateTime, localDate, dateLabel
├── features/
│   ├── nativeBridge.ts         # ★ allowlist 23 method, validate payload, dispatch, isBridgeWrite
│   └── records.ts              # ★ Toàn bộ CRUD + query nghiệp vụ (553 dòng)
├── store/
│   └── useAppStore.ts          # zustand store: ready/loading/error + snapshot dữ liệu cho gate
├── theme/
│   ├── tokens.ts               # colors, spacing... dùng chung native
│   └── (có thể Colors ở constants/)
├── utils/
│   └── quantity.ts             # parseQuantity/formatQuantity, SCALE=1_000_000 (micros)
├── constants/
│   └── Colors.ts               # Màu template Expo
├── webview/                    # ★ NGUỒN UI WebView (sửa ở đây)
│   ├── templates/              # 12 file HTML partial, ghép theo thứ tự trong build script
│   │   ├── base.html           # <!DOCTYPE>, CSP meta, <head>, font-face placeholder, mở <body>/container
│   │   ├── header.html         # App header
│   │   ├── dashboard.html      # view-dashboard (VIEW 1)
│   │   ├── sales.html          # view-sales (VIEW 2, POS)
│   │   ├── menu.html           # view-menu (VIEW 3)
│   │   ├── stats.html          # view-stats (VIEW 4)
│   │   ├── history.html        # view-history (VIEW 5)
│   │   ├── footer.html         # <nav> bottom tabs + IPHONE HOME INDICATOR
│   │   ├── modals.html         # Tất cả modal (expense, menu, cart, delete, tx detail, image-crop)
│   │   └── toast.html          # #toast-container + đóng container + </body></html>
│   ├── modules/                # 9 file JS, concat theo thứ tự vào 1 IIFE
│   │   ├── state.js            # state object, escapeHtml/formatMoney, requestNative, __foodTrackResolve,
│   │   │                       #   scheduleRepaint, runWrite queue, toast, helpers
│   │   ├── dashboard.js        # renderDashboard, setDashboardFilter (+ auto-tap repaint workaround)
│   │   ├── sales.js            # POS: renderSalesProducts, cart, confirmOrder
│   │   ├── menu.js             # renderMenuItems, openEditMenuModal, saveMenuItem, delete, ảnh
│   │   ├── expenses.js         # openExpenseModal, saveExpenseRecord
│   │   ├── stats.js            # refreshStats, setStatsPeriod, changeStatsMonth
│   │   ├── history.js          # refreshHistory, filter, tx detail modal
│   │   └── main.js             # switchTab, updateHeader, refreshAll, window bindings, boot
│   ├── css/custom.css          # CSS bổ sung (toast animation, hide-scrollbar...)
│   ├── generated.css           # Tailwind build sẵn (minified, committed)
│   ├── input.css               # Tailwind input
│   ├── app.js                  # ★ LEGACY: bundle JS cũ đơn file — KHÔNG còn được build script dùng
│   └── app.js.backup           # Backup cũ hơn nữa
├── scripts/
│   └── build-webview.js        # ★ Build assets/foodtrack/index.html từ templates+modules+css+fonts
├── UX-UI/ (ở D:\FTrack\UX-UI, NGOÀI repo)  # Frontend gốc: code.html, DESIGN.md, screen.png
├── android/                    # Native project đã generate (debug.keystore có sẵn)
├── app.json / eas.json / package.json / tsconfig.json / eslint.config.js / tailwind.config.js
├── AGENTS.md                   # Quy tắc cho AI agent (Expo docs, lệnh chuẩn)
├── CODE-QUALITY.md / DOCS.md   # Tài liệu cũ (DOCS.md lỗi thời)
└── README.md                   # README gốc
```

## Quy ước quan trọng

1. **Sửa UI → sửa `webview/templates` + `webview/modules` + `webview/css`, rồi `node scripts/build-webview.js`.** Không sửa `assets/foodtrack/index.html` tay.
2. **`webview/app.js` và `app.js.backup` là code chết** — build script không đọc chúng. Chúng còn chứa class Tailwind cũ nên `tailwind.config.js` (content trỏ tới `./webview/app.js`) vẫn "vô tình đúng"; nếu thêm class mới chỉ có trong modules/templates, cần cập nhật content globs trước khi regenerate `generated.css`.
3. **Native screens trong `app/(tabs)/` và components `ui.tsx/ExpenseSheet/LocalPhotoPicker/HeaderActions` là legacy** — chỉ `FoodTrackWebView` + `store/useAppStore` (gate) còn được dùng thực tế.
4. Mọi text UI nghiệp vụ là **tiếng Việt hardcode** trong templates/JS — không có i18n.
