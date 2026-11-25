import { localDate } from '../database/format';
import {
  createExpense,
  createOrder,
  deleteExpense,
  deleteOrder,
  deleteProduct,
  getDailyReport,
  getDashboardSummary,
  getExpenseById,
  getOrderById,
  getTransactionById,
  listProducts,
  listTransactions,
  loadOrderItems,
  readSetting,
  saveProduct,
  setProductActive,
  updateExpense,
  updateOrder,
  writeSetting,
} from './records';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import type { ExpenseCategory, PaymentMethod } from '../database/types';

type Payload = Record<string, unknown>;

const nativeMethods = new Set([
  'app.bootstrap',
  'dashboard.summary',
  'reports.summary',
  'reports.daily',
  'history.list',
  'history.detail',
  'products.save',
  'products.active',
  'products.delete',
  'orders.create',
  'orders.update',
  'orders.delete',
  'expenses.create',
  'expenses.update',
  'expenses.delete',
  'images.pick',
]);

export function isNativeBridgeMethod(method: string): boolean {
  return nativeMethods.has(method);
}

function objectValue(value: unknown): Payload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Dữ liệu yêu cầu không hợp lệ.');
  }
  return value as Payload;
}

function stringValue(value: unknown, label: string, maximum = 500): string {
  if (typeof value !== 'string' || value.length > maximum) {
    throw new Error(`${label} không hợp lệ.`);
  }
  return value;
}

function integerValue(value: unknown, label: string, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${label} phải là số nguyên hợp lệ.`);
  }
  return value;
}

function dateOffset(date: string, offset: number): string {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + offset);
  return localDate(value);
}

function paymentMethod(value: unknown): PaymentMethod {
  if (value !== 'cash' && value !== 'transfer' && value !== 'debt') {
    throw new Error('Phương thức thanh toán không hợp lệ.');
  }
  return value;
}

function mapTransaction(row: Awaited<ReturnType<typeof listTransactions>>[number]) {
  const date = row.occurred_at.slice(0, 10);
  const today = localDate();
  const yesterday = dateOffset(today, -1);
  const dayLabel = date === today ? 'Hôm nay' : date === yesterday ? 'Hôm qua' : date.split('-').reverse().join('/');
  return {
    ...row,
    type: row.type === 'purchase' ? 'cost_import' : row.type === 'other' ? 'cost_other' : row.type,
    date,
    time: `${row.occurred_at.slice(11, 16)} - ${dayLabel}`,
    method: row.payment_method === 'cash' ? 'Tiền mặt' : row.payment_method === 'transfer' ? 'Chuyển khoản' : 'Ghi nợ',
    amount: row.amount_vnd,
    desc: row.note,
  };
}

function rangeFor(period: string) {
  const today = localDate();
  if (period === 'yesterday') return { from: dateOffset(today, -1), to: dateOffset(today, -1) };
  if (period === '7days') return { from: dateOffset(today, -6), to: today };
  if (period === 'month') return { from: `${today.slice(0, 7)}-01`, to: today };
  if (period === 'year') return { from: `${today.slice(0, 4)}-01-01`, to: today };
  return { from: today, to: today };
}

function defaultSummary() {
  return {
    revenue: 0,
    orders: 0,
    purchases: 0,
    other: 0,
    profit: 0,
  };
}

async function safeCall<T>(fn: () => Promise<T>, fallback: T, label: string): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.warn(`[FT-BOOTSTRAP-SAFE] ${label} warning:`, err);
    return fallback;
  }
}

async function bootstrap() {
  const today = localDate();
  const monthFrom = `${today.slice(0, 7)}-01`;
  const [
    products,
    transactions,
    todaySummary,
    yesterdaySummary,
    weekSummary,
    monthSummary,
    dailyHistory,
    prevYesterdaySummary,
    prevWeekSummary,
  ] = await Promise.all([
    safeCall(() => listProducts(), [], 'listProducts'),
    safeCall(() => listTransactions(100, 0), [], 'listTransactions'),
    safeCall(() => getDashboardSummary(today, today), defaultSummary(), 'todaySummary'),
    safeCall(() => getDashboardSummary(dateOffset(today, -1), dateOffset(today, -1)), defaultSummary(), 'yesterdaySummary'),
    safeCall(() => getDashboardSummary(dateOffset(today, -6), today), defaultSummary(), 'weekSummary'),
    safeCall(() => getDashboardSummary(monthFrom, today), defaultSummary(), 'monthSummary'),
    safeCall(() => getDailyReport(dateOffset(today, -4), today, 5), [], 'dailyHistory'),
    safeCall(() => getDashboardSummary(dateOffset(today, -2), dateOffset(today, -2)), defaultSummary(), 'prevYesterdaySummary'),
    safeCall(() => getDashboardSummary(dateOffset(today, -13), dateOffset(today, -7)), defaultSummary(), 'prevWeekSummary'),
  ]);
  return {
    date: today,
    products: products.map((product) => ({ ...product, active: product.active === 1 })),
    transactions: transactions.map(mapTransaction),
    dailyHistory,
    summaries: {
      today: todaySummary,
      yesterday: yesterdaySummary,
      '7days': weekSummary,
      month: monthSummary,
    },
    previousSummaries: {
      today: yesterdaySummary,
      yesterday: prevYesterdaySummary,
      '7days': prevWeekSummary,
    },
  };
}

export async function handleNativeBridgeRequest(method: string, rawPayload: unknown): Promise<unknown> {
  const payload = objectValue(rawPayload ?? {});
  switch (method) {
    case 'app.bootstrap': {
      const tSql = Date.now();
      try {
        const res = await bootstrap();
        console.log(`[FT-SQL-TIMING] app.bootstrap took ${Date.now() - tSql}ms`);
        return res;
      } catch (err) {
        console.error('[FT-BOOTSTRAP-FALLBACK]', err);
        const today = localDate();
        return {
          date: today,
          products: [],
          transactions: [],
          dailyHistory: [],
          summaries: {
            today: defaultSummary(),
            yesterday: defaultSummary(),
            '7days': defaultSummary(),
            month: defaultSummary(),
          },
          previousSummaries: {
            today: defaultSummary(),
            yesterday: defaultSummary(),
            '7days': defaultSummary(),
          },
        };
      }
    }
    case 'dashboard.summary': {
      const period = stringValue(payload.period, 'Khoảng thời gian', 20);
      const { from, to } = rangeFor(period);
      const tSql = Date.now();
      const res = await getDashboardSummary(from, to);
      console.log(`[FT-SQL-TIMING] dashboard.summary took ${Date.now() - tSql}ms`);
      return res;
    }
    case 'reports.summary': {
      const from = String(payload.from || '').trim().slice(0, 10) || localDate();
      const to = String(payload.to || '').trim().slice(0, 10) || localDate();
      const tSql = Date.now();
      const res = await getDashboardSummary(from, to);
      console.log(`[FT-SQL-TIMING] reports.summary took ${Date.now() - tSql}ms`);
      return res;
    }
    case 'reports.daily': {
      const from = stringValue(payload.from, 'Ngày bắt đầu', 10);
      const to = stringValue(payload.to, 'Ngày kết thúc', 10);
      const tSql = Date.now();
      const res = await getDailyReport(from, to, integerValue(payload.limit ?? 31, 'Giới hạn', 1));
      console.log(`[FT-SQL-TIMING] reports.daily took ${Date.now() - tSql}ms`);
      return res;
    }
    case 'history.list': {
      const limit = integerValue(payload.limit ?? 100, 'Số bản ghi', 1);
      const offset = integerValue(payload.offset ?? 0, 'Vị trí');
      const from = payload.from === undefined ? undefined : stringValue(payload.from, 'Ngày bắt đầu', 10);
      const to = payload.to === undefined ? undefined : stringValue(payload.to, 'Ngày kết thúc', 10);
      const tSql = Date.now();
      const res = (await listTransactions(Math.min(limit, 200), offset, from, to)).map(mapTransaction);
      console.log(`[FT-SQL-TIMING] history.list took ${Date.now() - tSql}ms`);
      return res;
    }
    case 'history.detail': {
      const id = stringValue(payload.id, 'Mã giao dịch', 80);
      const transaction = await getTransactionById(id);
      if (!transaction) throw new Error('Không tìm thấy thông tin giao dịch.');
      const mapped = mapTransaction(transaction);
      if (transaction.type === 'order') {
        const items = await loadOrderItems(id);
        const order = await getOrderById(id);
        return {
          ...mapped,
          order,
          items: items.map((item) => `${item.product_name} x${item.quantity}`).join(', '),
          rawItems: items,
        };
      }
      const expense = await getExpenseById(id);
      return {
        ...mapped,
        expense,
        items: transaction.note || '',
        rawItems: [],
      };
    }
    case 'products.save': {
      const image = payload.image_uri == null ? null : stringValue(payload.image_uri, 'Ảnh món', 8_000_000);
      if (image && !image.startsWith('data:image/') && !image.startsWith('file://')) {
        throw new Error('Chỉ hỗ trợ ảnh nằm trên thiết bị.');
      }
      const rawId = payload.id;
      const targetId = typeof rawId === 'string' && rawId.trim().length > 0 ? stringValue(rawId.trim(), 'Mã món', 80) : undefined;
      const saved = await saveProduct({
        name: stringValue(payload.name, 'Tên món'),
        description: stringValue(payload.description ?? '', 'Mô tả món'),
        price_vnd: integerValue(payload.price_vnd, 'Giá bán'),
        active: payload.active === true ? 1 : 0,
        image_uri: image,
      }, targetId);
      return {
        saved: true,
        product: {
          ...saved,
          active: saved.active === 1,
        },
      };
    }
    case 'products.active':
      await setProductActive(stringValue(payload.id, 'Mã món', 80), payload.active === true);
      return { updated: true };
    case 'products.delete':
      await deleteProduct(stringValue(payload.id, 'Mã món', 80));
      return { deleted: true };
    case 'orders.create': {
      if (!Array.isArray(payload.items)) throw new Error('Danh sách món trong đơn không hợp lệ.');
      const items = payload.items.map((row) => {
        const item = objectValue(row);
        return {
          productId: stringValue(item.productId, 'Mã món', 80),
          quantity: integerValue(item.quantity, 'Số lượng', 1),
        };
      });
      return { id: await createOrder(items, paymentMethod(payload.paymentMethod)) };
    }
    case 'orders.update': {
      const id = stringValue(payload.id, 'Mã đơn hàng', 80);
      const pMethod = paymentMethod(payload.paymentMethod);
      const occurredAt = payload.occurredAt ? stringValue(payload.occurredAt, 'Thời gian giao dịch', 19) : undefined;
      let items: Array<{ productId: string; quantity: number }> | undefined;
      if (Array.isArray(payload.items)) {
        items = payload.items.map((row) => {
          const item = objectValue(row);
          return {
            productId: stringValue(item.productId, 'Mã món', 80),
            quantity: integerValue(item.quantity, 'Số lượng', 1),
          };
        });
      }
      await updateOrder(id, { paymentMethod: pMethod, occurredAt, items });
      return { updated: true };
    }
    case 'orders.delete': {
      const id = stringValue(payload.id, 'Mã đơn hàng', 80);
      await deleteOrder(id);
      return { deleted: true };
    }
    case 'expenses.create': {
      const category: ExpenseCategory = payload.category === 'purchase' ? 'purchase' : payload.category === 'other' ? 'other' : (() => { throw new Error('Loại chi phí không hợp lệ.'); })();
      const occurredAt = stringValue(payload.occurredAt, 'Thời gian chi', 19);
      if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(occurredAt)) {
        throw new Error('Thời gian chi không hợp lệ.');
      }
      await createExpense({
        category,
        amountVnd: integerValue(payload.amountVnd, 'Số tiền'),
        title: stringValue(payload.title, 'Nội dung chi'),
        note: stringValue(payload.note ?? '', 'Ghi chú'),
        paymentMethod: paymentMethod(payload.paymentMethod),
        occurredAt,
        ingredientId: payload.ingredientId === undefined ? undefined : stringValue(payload.ingredientId, 'Nguyên liệu', 80),
        quantityMicros: payload.quantityMicros === undefined ? undefined : integerValue(payload.quantityMicros, 'Số lượng nhập', 1),
      });
      return { saved: true };
    }
    case 'expenses.update': {
      const id = stringValue(payload.id, 'Mã khoản chi', 80);
      const category: ExpenseCategory = payload.category === 'purchase' ? 'purchase' : payload.category === 'other' ? 'other' : (() => { throw new Error('Loại chi phí không hợp lệ.'); })();
      const occurredAt = stringValue(payload.occurredAt, 'Thời gian chi', 19);
      if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(occurredAt)) {
        throw new Error('Thời gian chi không hợp lệ.');
      }
      await updateExpense(id, {
        category,
        amountVnd: integerValue(payload.amountVnd, 'Số tiền'),
        title: stringValue(payload.title, 'Nội dung chi'),
        note: stringValue(payload.note ?? '', 'Ghi chú'),
        paymentMethod: paymentMethod(payload.paymentMethod),
        occurredAt,
        ingredientId: payload.ingredientId === undefined ? undefined : stringValue(payload.ingredientId, 'Nguyên liệu', 80),
        quantityMicros: payload.quantityMicros === undefined ? undefined : integerValue(payload.quantityMicros, 'Số lượng nhập', 1),
      });
      return { updated: true };
    }
    case 'expenses.delete': {
      const id = stringValue(payload.id, 'Mã khoản chi', 80);
      await deleteExpense(id);
      return { deleted: true };
    }
    case 'images.pick': {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        throw new Error('Vui lòng cấp quyền truy cập thư viện ảnh để chọn hình món.');
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.85,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return { canceled: true };
      }

      const asset = result.assets[0];
      const actions: ImageManipulator.Action[] = [];
      const w = asset.width || 0;
      const h = asset.height || 0;
      if (w > 0 && h > 0) {
        const minSide = Math.min(w, h);
        const maxSide = Math.max(w, h);
        if (minSide > 900) {
          if (w <= h) actions.push({ resize: { width: Math.max(900, Math.round((w / h) * 1800)) } });
          else actions.push({ resize: { height: Math.max(900, Math.round((h / w) * 1800)) } });
        } else if (maxSide > 1800) {
          actions.push(w >= h ? { resize: { width: 1800 } } : { resize: { height: 1800 } });
        }
      } else {
        actions.push({ resize: { width: 1000 } });
      }
      const manip = await ImageManipulator.manipulateAsync(
        asset.uri,
        actions,
        { compress: 0.78, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );

      if (!manip.base64) {
        throw new Error('Không thể đọc nội dung ảnh đã chọn.');
      }
      return { imageUri: `data:image/jpeg;base64,${manip.base64}` };
    }
    default:
      throw new Error('Yêu cầu không nằm trong danh sách bridge được phép.');
  }
}

export function isBridgeWrite(method: string): boolean {
  return method.startsWith('products.')
    || method.startsWith('orders.')
    || method.startsWith('expenses.')
    || method.startsWith('inventory.')
;
}
