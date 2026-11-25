import { assertVnd, getDatabase, newId } from '../database';
import { localDateTime } from '../database/format';
import type {
  Expense,
  ExpenseCategory,
  Ingredient,
  Order,
  OrderItem,
  PaymentMethod,
  Product,
  StockMovement,
} from '../database/types';

export async function listProducts(): Promise<Product[]> {
  const db = await getDatabase();
  return db.getAllAsync<Product>('SELECT * FROM products WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE');
}

export async function saveProduct(input: Pick<Product, 'name' | 'description' | 'price_vnd' | 'active' | 'image_uri'>, id?: string): Promise<Product> {
  const db = await getDatabase();
  const price = assertVnd(input.price_vnd);
  if (price === 0) throw new Error('Giá bán phải lớn hơn 0 VNĐ.');
  if (!input.name.trim()) throw new Error('Vui lòng nhập tên món.');
  const now = localDateTime();
  const name = input.name.trim();
  const description = (input.description || '').trim();
  const active = input.active ? 1 : 0;
  const imageUri = input.image_uri ?? null;
  if (id) {
    await db.runAsync(
      'UPDATE products SET name=?, description=?, price_vnd=?, active=?, image_uri=?, updated_at=?, revision=revision+1 WHERE id=? AND deleted_at IS NULL',
      name, description, price, active, imageUri, now, id,
    );
    const updated = await db.getFirstAsync<Product>('SELECT * FROM products WHERE id=?', id);
    if (!updated) throw new Error('Không tìm thấy món cần cập nhật trong cơ sở dữ liệu.');
    return updated;
  } else {
    const newProductId = newId();
    await db.runAsync(
      'INSERT INTO products (id,name,description,price_vnd,active,image_uri,created_at,updated_at,deleted_at,revision) VALUES (?,?,?,?,?,?,?,?,NULL,1)',
      newProductId, name, description, price, active, imageUri, now, now,
    );
    const created = await db.getFirstAsync<Product>('SELECT * FROM products WHERE id=?', newProductId);
    if (!created) throw new Error('Không thể thêm món vào cơ sở dữ liệu.');
    return created;
  }
}

export async function setProductActive(id: string, active: boolean) {
  const db = await getDatabase();
  await db.runAsync('UPDATE products SET active=?,updated_at=?,revision=revision+1 WHERE id=? AND deleted_at IS NULL', active ? 1 : 0, localDateTime(), id);
}

export async function deleteProduct(id: string) {
  const db = await getDatabase();
  const now = localDateTime();
  await db.runAsync('UPDATE products SET deleted_at=?,updated_at=?,revision=revision+1 WHERE id=? AND deleted_at IS NULL', now, now, id);
}

export async function listIngredients(): Promise<Ingredient[]> {
  const db = await getDatabase();
  return db.getAllAsync<Ingredient>('SELECT * FROM ingredients WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE');
}

export async function saveIngredient(input: Pick<Ingredient, 'name' | 'unit' | 'quantity_micros' | 'low_stock_micros' | 'unit_cost_micros_vnd'>, id?: string) {
  const db = await getDatabase();
  if (!input.name.trim() || !input.unit.trim()) throw new Error('Vui lòng nhập tên và đơn vị nguyên liệu.');
  for (const value of [input.quantity_micros, input.low_stock_micros, input.unit_cost_micros_vnd]) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('Số lượng và giá vốn phải là số nguyên không âm.');
  }
  const now = localDateTime();
  await db.withTransactionAsync(async () => {
    if (id) {
      await db.runAsync(
        'UPDATE ingredients SET name=?,unit=?,low_stock_micros=?,unit_cost_vnd=?,unit_cost_micros_vnd=?,updated_at=?,revision=revision+1 WHERE id=? AND deleted_at IS NULL',
        input.name.trim(), input.unit.trim(), input.low_stock_micros, Number(BigInt(input.unit_cost_micros_vnd) / 1_000_000n), input.unit_cost_micros_vnd, now, id,
      );
      return;
    }
    const newIngredientId = newId();
    await db.runAsync(
      'INSERT INTO ingredients (id,name,unit,quantity_micros,low_stock_micros,unit_cost_vnd,unit_cost_micros_vnd,created_at,updated_at,deleted_at,revision) VALUES (?,?,?,?,?,?,?,?,?,NULL,1)',
      newIngredientId, input.name.trim(), input.unit.trim(), 0, input.low_stock_micros, Number(BigInt(input.unit_cost_micros_vnd) / 1_000_000n), input.unit_cost_micros_vnd, now, now,
    );
    if (input.quantity_micros > 0) {
      await db.runAsync(
        'UPDATE ingredients SET quantity_micros=?,updated_at=?,revision=revision+1 WHERE id=?',
        input.quantity_micros, now, newIngredientId,
      );
      await insertMovement(db, {
        ingredient_id: newIngredientId,
        kind: 'adjustment',
        quantity_delta_micros: input.quantity_micros,
        unit_cost_micros_vnd: input.unit_cost_micros_vnd,
        expense_id: null,
        order_id: null,
        note: 'Tồn kho ban đầu',
      }, now);
    }
  });
}

export async function setStock(id: string, deltaMicros: number, note: string) {
  if (!Number.isSafeInteger(deltaMicros) || deltaMicros === 0) throw new Error('Mức điều chỉnh tồn kho không hợp lệ.');
  const db = await getDatabase();
  const now = localDateTime();
  await db.withTransactionAsync(async () => {
    const ingredient = await db.getFirstAsync<Ingredient>('SELECT * FROM ingredients WHERE id=? AND deleted_at IS NULL', id);
    if (!ingredient) throw new Error('Không tìm thấy nguyên liệu.');
    const next = ingredient.quantity_micros + deltaMicros;
    if (!Number.isSafeInteger(next) || next < 0) throw new Error('Điều chỉnh này làm tồn kho bị âm.');
    await db.runAsync('UPDATE ingredients SET quantity_micros=?,updated_at=?,revision=revision+1 WHERE id=?', next, now, id);
    await insertMovement(db, {
      ingredient_id: id,
      kind: 'adjustment',
      quantity_delta_micros: deltaMicros,
      unit_cost_micros_vnd: ingredient.unit_cost_micros_vnd,
      expense_id: null,
      order_id: null,
      note: note.trim() || 'Điều chỉnh tồn kho',
    }, now);
  });
}

async function insertMovement(
  db: Awaited<ReturnType<typeof getDatabase>>,
  movement: Omit<StockMovement, 'id' | 'created_at' | 'updated_at' | 'deleted_at' | 'revision' | 'unit_cost_vnd'>,
  now: string,
) {
  await db.runAsync(
    'INSERT INTO stock_movements (id,ingredient_id,kind,quantity_delta_micros,unit_cost_vnd,unit_cost_micros_vnd,expense_id,order_id,note,created_at,updated_at,deleted_at,revision) VALUES (?,?,?,?,?,?,?,?,?,?,?,NULL,1)',
    newId(), movement.ingredient_id, movement.kind, movement.quantity_delta_micros,
    Number(BigInt(movement.unit_cost_micros_vnd) / 1_000_000n), movement.unit_cost_micros_vnd,
    movement.expense_id, movement.order_id, movement.note, now, now,
  );
}

export async function createExpense(input: {
  category: ExpenseCategory;
  amountVnd: number;
  title: string;
  note: string;
  paymentMethod: PaymentMethod;
  occurredAt: string;
  ingredientId?: string;
  quantityMicros?: number;
}) {
  assertVnd(input.amountVnd);
  if (input.amountVnd === 0 || !input.title.trim()) throw new Error('Nhập nội dung và số tiền chi hợp lệ.');
  const db = await getDatabase();
  const now = localDateTime();
  await db.withTransactionAsync(async () => {
    const expenseId = newId();
    await db.runAsync(
      'INSERT INTO expenses (id,category,amount_vnd,title,note,payment_method,occurred_at,created_at,updated_at,deleted_at,revision) VALUES (?,?,?,?,?,?,?,?,?,NULL,1)',
      expenseId, input.category, input.amountVnd, input.title.trim(), input.note.trim(), input.paymentMethod, input.occurredAt, now, now,
    );
    if (input.ingredientId && input.quantityMicros && input.quantityMicros > 0) {
      if (!Number.isSafeInteger(input.quantityMicros)) throw new Error('Số lượng nhập kho không hợp lệ.');
      const ingredient = await db.getFirstAsync<Ingredient>('SELECT * FROM ingredients WHERE id=? AND deleted_at IS NULL', input.ingredientId);
      if (!ingredient) throw new Error('Không tìm thấy nguyên liệu được nhập kho.');
      const oldValue = BigInt(ingredient.quantity_micros) * BigInt(ingredient.unit_cost_micros_vnd);
      const addedValue = BigInt(input.amountVnd) * 1_000_000_000_000n;
      const totalQuantity = ingredient.quantity_micros + input.quantityMicros;
      const unitCostMicros = Number((oldValue + addedValue) / BigInt(totalQuantity));
      if (!Number.isSafeInteger(unitCostMicros)) throw new Error('Giá vốn vượt giới hạn hỗ trợ.');
      await db.runAsync(
        'UPDATE ingredients SET quantity_micros=?,unit_cost_vnd=?,unit_cost_micros_vnd=?,updated_at=?,revision=revision+1 WHERE id=?',
        totalQuantity, Math.floor(unitCostMicros / 1_000_000), unitCostMicros, now, ingredient.id,
      );
      await insertMovement(db, {
        ingredient_id: ingredient.id,
        kind: 'purchase',
        quantity_delta_micros: input.quantityMicros,
        unit_cost_micros_vnd: unitCostMicros,
        expense_id: expenseId,
        order_id: null,
        note: input.title.trim(),
      }, now);
    }
  });
}

export async function createOrder(items: Array<{ productId: string; quantity: number }>, paymentMethod: PaymentMethod) {
  if (items.length === 0) throw new Error('Đơn hàng chưa có món.');
  if (items.some((item) => !Number.isSafeInteger(item.quantity) || item.quantity < 1)) throw new Error('Số lượng món không hợp lệ.');
  const db = await getDatabase();
  const now = localDateTime();
  let createdOrderId = '';
  await db.withTransactionAsync(async () => {
    const orderNumber = await db.getFirstAsync<{ next: number }>('SELECT COALESCE(MAX(order_number),0)+1 AS next FROM orders');
    let total = 0;
    const products: Array<{ product: Product; quantity: number }> = [];
    for (const item of items) {
      const product = await db.getFirstAsync<Product>('SELECT * FROM products WHERE id=? AND active=1 AND deleted_at IS NULL', item.productId);
      if (!product) throw new Error('Một món trong đơn đã ngừng bán hoặc không còn tồn tại.');
      total += product.price_vnd * item.quantity;
      if (!Number.isSafeInteger(total)) throw new Error('Tổng đơn vượt giới hạn số nguyên an toàn.');
      products.push({ product, quantity: item.quantity });
    }
    assertVnd(total);
    createdOrderId = newId();
    await db.runAsync(
      'INSERT INTO orders (id,order_number,total_vnd,payment_method,created_at,updated_at,deleted_at,revision) VALUES (?,?,?,?,?,?,NULL,1)',
      createdOrderId, orderNumber?.next ?? 1, total, paymentMethod, now, now,
    );
    for (const row of products) {
      await db.runAsync(
        'INSERT INTO order_items (id,order_id,product_id,product_name,quantity,unit_price_vnd,unit_cost_vnd,created_at,updated_at,deleted_at,revision) VALUES (?,?,?,?,?,?,?,?,?,NULL,1)',
        newId(), createdOrderId, row.product.id, row.product.name, row.quantity, row.product.price_vnd, 0, now, now,
      );
    }
  });
  return createdOrderId;
}

export async function listOrders(limit = 100): Promise<Array<Order & { item_count: number }>> {
  const db = await getDatabase();
  return db.getAllAsync<Order & { item_count: number }>(
    'SELECT o.*, COALESCE(SUM(i.quantity),0) AS item_count FROM orders o LEFT JOIN order_items i ON i.order_id=o.id AND i.deleted_at IS NULL WHERE o.deleted_at IS NULL GROUP BY o.id ORDER BY o.created_at DESC LIMIT ?',
    limit,
  );
}

export async function loadOrderItems(orderId: string): Promise<OrderItem[]> {
  const db = await getDatabase();
  return db.getAllAsync<OrderItem>('SELECT * FROM order_items WHERE order_id=? AND deleted_at IS NULL', orderId);
}

export async function getOrderById(id: string): Promise<Order | null> {
  const db = await getDatabase();
  return db.getFirstAsync<Order>('SELECT * FROM orders WHERE id=? AND deleted_at IS NULL', id);
}

export async function deleteOrder(id: string) {
  const db = await getDatabase();
  const now = localDateTime();
  await db.withTransactionAsync(async () => {
    const order = await db.getFirstAsync<Order>('SELECT * FROM orders WHERE id=? AND deleted_at IS NULL', id);
    if (!order) throw new Error('Không tìm thấy đơn hàng hoặc đơn đã bị xóa.');

    const movements = await db.getAllAsync<StockMovement>(
      'SELECT * FROM stock_movements WHERE order_id=? AND deleted_at IS NULL',
      id,
    );
    for (const mov of movements) {
      await db.runAsync(
        'UPDATE ingredients SET quantity_micros = quantity_micros - ?, updated_at = ?, revision = revision + 1 WHERE id = ?',
        mov.quantity_delta_micros, now, mov.ingredient_id,
      );
      await db.runAsync(
        'UPDATE stock_movements SET deleted_at = ?, updated_at = ?, revision = revision + 1 WHERE id = ?',
        now, now, mov.id,
      );
    }

    await db.runAsync(
      'UPDATE order_items SET deleted_at = ?, updated_at = ?, revision = revision + 1 WHERE order_id = ? AND deleted_at IS NULL',
      now, now, id,
    );

    await db.runAsync(
      'UPDATE orders SET deleted_at = ?, updated_at = ?, revision = revision + 1 WHERE id = ?',
      now, now, id,
    );
  });
}

export async function updateOrder(id: string, input: {
  paymentMethod: PaymentMethod;
  occurredAt?: string;
  items?: Array<{ productId: string; quantity: number }>;
}) {
  const db = await getDatabase();
  const now = localDateTime();
  await db.withTransactionAsync(async () => {
    const order = await db.getFirstAsync<Order>('SELECT * FROM orders WHERE id=? AND deleted_at IS NULL', id);
    if (!order) throw new Error('Không tìm thấy đơn hàng hoặc đơn đã bị xóa.');

    let newTotal = order.total_vnd;
    const orderTime = input.occurredAt?.trim() || order.created_at;

    if (input.items && input.items.length > 0) {
      if (input.items.some((item) => !Number.isSafeInteger(item.quantity) || item.quantity < 1)) {
        throw new Error('Số lượng món không hợp lệ.');
      }

      const oldMovements = await db.getAllAsync<StockMovement>(
        'SELECT * FROM stock_movements WHERE order_id=? AND deleted_at IS NULL',
        id,
      );
      for (const mov of oldMovements) {
        await db.runAsync(
          'UPDATE ingredients SET quantity_micros = quantity_micros - ?, updated_at = ?, revision = revision + 1 WHERE id = ?',
          mov.quantity_delta_micros, now, mov.ingredient_id,
        );
        await db.runAsync(
          'UPDATE stock_movements SET deleted_at = ?, updated_at = ?, revision = revision + 1 WHERE id = ?',
          now, now, mov.id,
        );
      }

      const existingItems = await loadOrderItems(id);
      const existingByProductId = new Map(
        existingItems
          .filter((item) => item.product_id)
          .map((item) => [item.product_id as string, item]),
      );

      await db.runAsync(
        'UPDATE order_items SET deleted_at = ?, updated_at = ?, revision = revision + 1 WHERE order_id = ? AND deleted_at IS NULL',
        now, now, id,
      );

      newTotal = 0;
      for (const row of input.items) {
        const product = await db.getFirstAsync<Product>('SELECT * FROM products WHERE id=? AND deleted_at IS NULL', row.productId);
        const fallbackExisting = !product ? existingByProductId.get(row.productId) : undefined;
        if (!product && !fallbackExisting) throw new Error('Món trong đơn không còn tồn tại.');
        const itemName = product ? product.name : fallbackExisting!.product_name;
        const unitPrice = product ? product.price_vnd : fallbackExisting!.unit_price_vnd;
        const subtotal = unitPrice * row.quantity;
        newTotal += subtotal;
        await db.runAsync(
          'INSERT INTO order_items (id,order_id,product_id,product_name,quantity,unit_price_vnd,unit_cost_vnd,created_at,updated_at,deleted_at,revision) VALUES (?,?,?,?,?,?,?,?,?,NULL,1)',
          newId(), id, row.productId, itemName, row.quantity, unitPrice, 0, now, now,
        );
      }
      assertVnd(newTotal);
    }

    await db.runAsync(
      'UPDATE orders SET total_vnd=?, payment_method=?, created_at=?, updated_at=?, revision=revision+1 WHERE id=?',
      newTotal, input.paymentMethod, orderTime, now, id,
    );
  });
}

export async function getExpenseById(id: string): Promise<Expense | null> {
  const db = await getDatabase();
  return db.getFirstAsync<Expense>('SELECT * FROM expenses WHERE id=? AND deleted_at IS NULL', id);
}

export async function deleteExpense(id: string) {
  const db = await getDatabase();
  const now = localDateTime();
  await db.withTransactionAsync(async () => {
    const expense = await db.getFirstAsync<Expense>('SELECT * FROM expenses WHERE id=? AND deleted_at IS NULL', id);
    if (!expense) throw new Error('Không tìm thấy khoản chi hoặc đã bị xóa.');

    const movements = await db.getAllAsync<StockMovement>(
      'SELECT * FROM stock_movements WHERE expense_id=? AND deleted_at IS NULL',
      id,
    );
    for (const mov of movements) {
      await db.runAsync(
        'UPDATE ingredients SET quantity_micros = quantity_micros - ?, updated_at = ?, revision = revision + 1 WHERE id = ?',
        mov.quantity_delta_micros, now, mov.ingredient_id,
      );
      await db.runAsync(
        'UPDATE stock_movements SET deleted_at = ?, updated_at = ?, revision = revision + 1 WHERE id = ?',
        now, now, mov.id,
      );
    }

    await db.runAsync(
      'UPDATE expenses SET deleted_at = ?, updated_at = ?, revision = revision + 1 WHERE id = ?',
      now, now, id,
    );
  });
}

export async function updateExpense(id: string, input: {
  category: ExpenseCategory;
  amountVnd: number;
  title: string;
  note: string;
  paymentMethod: PaymentMethod;
  occurredAt: string;
  ingredientId?: string;
  quantityMicros?: number;
}) {
  assertVnd(input.amountVnd);
  if (input.amountVnd === 0 || !input.title.trim()) throw new Error('Nhập nội dung và số tiền chi hợp lệ.');
  const db = await getDatabase();
  const now = localDateTime();
  await db.withTransactionAsync(async () => {
    const expense = await db.getFirstAsync<Expense>('SELECT * FROM expenses WHERE id=? AND deleted_at IS NULL', id);
    if (!expense) throw new Error('Không tìm thấy khoản chi hoặc đã bị xóa.');

    const oldMovements = await db.getAllAsync<StockMovement>(
      'SELECT * FROM stock_movements WHERE expense_id=? AND deleted_at IS NULL',
      id,
    );
    for (const mov of oldMovements) {
      await db.runAsync(
        'UPDATE ingredients SET quantity_micros = quantity_micros - ?, updated_at = ?, revision = revision + 1 WHERE id = ?',
        mov.quantity_delta_micros, now, mov.ingredient_id,
      );
      await db.runAsync(
        'UPDATE stock_movements SET deleted_at = ?, updated_at = ?, revision = revision + 1 WHERE id = ?',
        now, now, mov.id,
      );
    }

    if (input.category === 'purchase' && input.ingredientId && input.quantityMicros && input.quantityMicros > 0) {
      if (!Number.isSafeInteger(input.quantityMicros)) throw new Error('Số lượng nhập kho không hợp lệ.');
      const ingredient = await db.getFirstAsync<Ingredient>('SELECT * FROM ingredients WHERE id=? AND deleted_at IS NULL', input.ingredientId);
      if (!ingredient) throw new Error('Không tìm thấy nguyên liệu được nhập kho.');
      const oldValue = BigInt(ingredient.quantity_micros) * BigInt(ingredient.unit_cost_micros_vnd);
      const addedValue = BigInt(input.amountVnd) * 1_000_000_000_000n;
      const totalQuantity = ingredient.quantity_micros + input.quantityMicros;
      const unitCostMicros = Number((oldValue + addedValue) / BigInt(totalQuantity));
      if (!Number.isSafeInteger(unitCostMicros)) throw new Error('Giá vốn vượt giới hạn hỗ trợ.');
      await db.runAsync(
        'UPDATE ingredients SET quantity_micros=?,unit_cost_vnd=?,unit_cost_micros_vnd=?,updated_at=?,revision=revision+1 WHERE id=?',
        totalQuantity, Math.floor(unitCostMicros / 1_000_000), unitCostMicros, now, ingredient.id,
      );
      await insertMovement(db, {
        ingredient_id: ingredient.id,
        kind: 'purchase',
        quantity_delta_micros: input.quantityMicros,
        unit_cost_micros_vnd: unitCostMicros,
        expense_id: id,
        order_id: null,
        note: input.title.trim(),
      }, now);
    }

    await db.runAsync(
      'UPDATE expenses SET category=?,amount_vnd=?,title=?,note=?,payment_method=?,occurred_at=?,updated_at=?,revision=revision+1 WHERE id=?',
      input.category, input.amountVnd, input.title.trim(), input.note.trim(), input.paymentMethod, input.occurredAt, now, id,
    );
  });
}

export async function listExpenses(limit = 100): Promise<Expense[]> {
  const db = await getDatabase();
  return db.getAllAsync<Expense>('SELECT * FROM expenses WHERE deleted_at IS NULL ORDER BY occurred_at DESC LIMIT ?', limit);
}

function nextDay(isoDate: string): string {
  const d = new Date(`${isoDate.slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() + 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export async function getDashboardSummary(from: string, to: string) {
  const db = await getDatabase();
  const toExclusive = nextDay(to);
  const sales = await db.getFirstAsync<{ revenue: number; orders: number }>(
    'SELECT COALESCE(SUM(total_vnd),0) AS revenue, COUNT(*) AS orders FROM orders WHERE deleted_at IS NULL AND created_at >= ? AND created_at < ?',
    from, toExclusive,
  );
  const costs = await db.getFirstAsync<{ purchases: number; other: number }>(
    "SELECT COALESCE(SUM(CASE WHEN category='purchase' THEN amount_vnd ELSE 0 END),0) AS purchases, COALESCE(SUM(CASE WHEN category='other' THEN amount_vnd ELSE 0 END),0) AS other FROM expenses WHERE deleted_at IS NULL AND occurred_at >= ? AND occurred_at < ?",
    from, toExclusive,
  );
  return {
    revenue: sales?.revenue ?? 0,
    orders: sales?.orders ?? 0,
    purchases: costs?.purchases ?? 0,
    other: costs?.other ?? 0,
    profit: (sales?.revenue ?? 0) - (costs?.purchases ?? 0) - (costs?.other ?? 0),
  };
}

export async function readSetting(key: string): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key=?', key);
  return row?.value ?? null;
}

export async function writeSetting(key: string, value: string) {
  const db = await getDatabase();
  await db.runAsync(
    'INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at',
    key, value, localDateTime(),
  );
}

export async function listTransactions(limit = 100, offset = 0, from?: string, to?: string): Promise<Array<{
  id: string;
  type: 'order' | ExpenseCategory;
  title: string;
  amount_vnd: number;
  payment_method: PaymentMethod;
  occurred_at: string;
  note: string;
}>> {
  const db = await getDatabase();
  if (from && to) {
    const toExclusive = nextDay(to);
    return db.getAllAsync(
      `SELECT * FROM (
        SELECT id,'order' AS type,'Đơn hàng #' || printf('%03d',daily_no) AS title,total_vnd AS amount_vnd,payment_method,created_at AS occurred_at,'' AS note
        FROM (
          SELECT *,ROW_NUMBER() OVER (PARTITION BY substr(created_at,1,10) ORDER BY created_at, order_number) AS daily_no
          FROM orders WHERE deleted_at IS NULL AND created_at >= ? AND created_at < ?
        )
        UNION ALL
        SELECT id,category,title,-amount_vnd AS amount_vnd,payment_method,occurred_at,note
        FROM expenses WHERE deleted_at IS NULL AND occurred_at >= ? AND occurred_at < ?
      ) ORDER BY replace(occurred_at, 'T', ' ') DESC LIMIT ? OFFSET ?`,
      from, toExclusive, from, toExclusive, limit, offset,
    );
  }
  return db.getAllAsync(
    `SELECT * FROM (
      SELECT id,'order' AS type,'Đơn hàng #' || printf('%03d',daily_no) AS title,total_vnd AS amount_vnd,payment_method,created_at AS occurred_at,'' AS note
      FROM (
        SELECT *,ROW_NUMBER() OVER (PARTITION BY substr(created_at,1,10) ORDER BY created_at, order_number) AS daily_no
        FROM orders WHERE deleted_at IS NULL
      )
      UNION ALL
      SELECT id,category,title,-amount_vnd AS amount_vnd,payment_method,occurred_at,note
      FROM expenses WHERE deleted_at IS NULL
    ) ORDER BY replace(occurred_at, 'T', ' ') DESC LIMIT ? OFFSET ?`,
    limit, offset,
  );
}

export async function getTransactionById(id: string) {
  const db = await getDatabase();
  return db.getFirstAsync<{
    id: string;
    type: 'order' | ExpenseCategory;
    title: string;
    amount_vnd: number;
    payment_method: PaymentMethod;
    occurred_at: string;
    note: string;
  }>(
    `SELECT id,type,title,amount_vnd,payment_method,occurred_at,note FROM (
      SELECT id,'order' AS type,'Đơn hàng #' || printf('%03d',daily_no) AS title,total_vnd AS amount_vnd,payment_method,created_at AS occurred_at,'' AS note
      FROM (
        SELECT *,ROW_NUMBER() OVER (PARTITION BY substr(created_at,1,10) ORDER BY created_at, order_number) AS daily_no
        FROM orders WHERE deleted_at IS NULL
      )
      UNION ALL
      SELECT id,category AS type,title,-amount_vnd AS amount_vnd,payment_method,occurred_at,note
      FROM expenses WHERE deleted_at IS NULL
    ) WHERE id=? LIMIT 1`,
    id,
  );
}

export async function getDailyReport(from: string, to: string, limit = 31) {
  const db = await getDatabase();
  const toExclusive = nextDay(to);
  return db.getAllAsync<{
    day: string;
    revenue: number;
    orders: number;
    purchases: number;
    other: number;
  }>(
    `SELECT day, SUM(revenue) AS revenue, SUM(orders) AS orders, SUM(purchases) AS purchases, SUM(other) AS other
     FROM (
       SELECT substr(created_at,1,10) AS day,total_vnd AS revenue,1 AS orders,0 AS purchases,0 AS other
       FROM orders WHERE deleted_at IS NULL AND created_at >= ? AND created_at < ?
       UNION ALL
       SELECT substr(occurred_at,1,10) AS day,0 AS revenue,0 AS orders,
         CASE WHEN category='purchase' THEN amount_vnd ELSE 0 END AS purchases,
         CASE WHEN category='other' THEN amount_vnd ELSE 0 END AS other
       FROM expenses WHERE deleted_at IS NULL AND occurred_at >= ? AND occurred_at < ?
     )
     GROUP BY day ORDER BY day DESC LIMIT ?`,
    from, toExclusive, from, toExclusive, limit,
  );
}
