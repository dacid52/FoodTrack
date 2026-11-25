import * as SQLite from 'expo-sqlite';

let opening: Promise<SQLite.SQLiteDatabase> | undefined;

const initialSchema = `
  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    price_vnd INTEGER NOT NULL CHECK(price_vnd >= 0),
    active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
    image_uri TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    revision INTEGER NOT NULL DEFAULT 1
  );
  CREATE INDEX IF NOT EXISTS products_active_name ON products(active, name) WHERE deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS ingredients (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    unit TEXT NOT NULL,
    quantity_micros INTEGER NOT NULL DEFAULT 0,
    low_stock_micros INTEGER NOT NULL DEFAULT 0,
    unit_cost_vnd INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    revision INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS recipes (
    id TEXT PRIMARY KEY NOT NULL,
    product_id TEXT NOT NULL UNIQUE REFERENCES products(id),
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    revision INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS recipe_ingredients (
    id TEXT PRIMARY KEY NOT NULL,
    recipe_id TEXT NOT NULL REFERENCES recipes(id),
    ingredient_id TEXT NOT NULL REFERENCES ingredients(id),
    quantity_micros INTEGER NOT NULL CHECK(quantity_micros > 0),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    revision INTEGER NOT NULL DEFAULT 1,
    UNIQUE(recipe_id, ingredient_id)
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY NOT NULL,
    order_number INTEGER NOT NULL UNIQUE,
    total_vnd INTEGER NOT NULL CHECK(total_vnd >= 0),
    payment_method TEXT NOT NULL CHECK(payment_method IN ('cash', 'transfer', 'debt')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    revision INTEGER NOT NULL DEFAULT 1
  );
  CREATE INDEX IF NOT EXISTS orders_created_at ON orders(created_at DESC) WHERE deleted_at IS NULL;
  CREATE TABLE IF NOT EXISTS order_items (
    id TEXT PRIMARY KEY NOT NULL,
    order_id TEXT NOT NULL REFERENCES orders(id),
    product_id TEXT REFERENCES products(id),
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK(quantity > 0),
    unit_price_vnd INTEGER NOT NULL CHECK(unit_price_vnd >= 0),
    unit_cost_vnd INTEGER NOT NULL DEFAULT 0 CHECK(unit_cost_vnd >= 0),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    revision INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY NOT NULL,
    category TEXT NOT NULL CHECK(category IN ('purchase', 'other')),
    amount_vnd INTEGER NOT NULL CHECK(amount_vnd > 0),
    title TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    payment_method TEXT NOT NULL CHECK(payment_method IN ('cash', 'transfer', 'debt')),
    occurred_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    revision INTEGER NOT NULL DEFAULT 1
  );
  CREATE INDEX IF NOT EXISTS expenses_occurred_at ON expenses(occurred_at DESC) WHERE deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS stock_movements (
    id TEXT PRIMARY KEY NOT NULL,
    ingredient_id TEXT NOT NULL REFERENCES ingredients(id),
    kind TEXT NOT NULL CHECK(kind IN ('purchase', 'sale', 'adjustment')),
    quantity_delta_micros INTEGER NOT NULL,
    unit_cost_vnd INTEGER NOT NULL DEFAULT 0,
    expense_id TEXT REFERENCES expenses(id),
    order_id TEXT REFERENCES orders(id),
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    revision INTEGER NOT NULL DEFAULT 1
  );
  CREATE INDEX IF NOT EXISTS stock_movement_ingredient_time ON stock_movements(ingredient_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

`;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!opening) {
    opening = (async () => {
      const database = await SQLite.openDatabaseAsync('foodtrack.db');
      // WAL mode + busy timeout 5s để tránh SQLITE_BUSY khi có concurrent access
      // (xảy ra khi useAppStore.refresh() và app.bootstrap chạy gần nhau lúc startup)
      await database.execAsync(
        'PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON; PRAGMA synchronous = NORMAL;'
      );
      const version = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
      if (!version || version.user_version < 1) {
        await database.withTransactionAsync(async () => {
          await database.execAsync(initialSchema);
          await database.execAsync('PRAGMA user_version = 1');
        });
      }
      if (!version || version.user_version < 2) {
        await database.withTransactionAsync(async () => {
          await database.execAsync(`
            ALTER TABLE ingredients ADD COLUMN unit_cost_micros_vnd INTEGER NOT NULL DEFAULT 0;
            UPDATE ingredients SET unit_cost_micros_vnd = unit_cost_vnd * 1000000;
            ALTER TABLE stock_movements ADD COLUMN unit_cost_micros_vnd INTEGER NOT NULL DEFAULT 0;
            UPDATE stock_movements SET unit_cost_micros_vnd = unit_cost_vnd * 1000000;
            PRAGMA user_version = 2;
          `);
        });
      }
      if (!version || version.user_version < 3) {
        await database.execAsync('PRAGMA foreign_keys = OFF');
        try {
            await database.withTransactionAsync(async () => {
              await database.execAsync(`
                CREATE TABLE orders_new (
                  id TEXT PRIMARY KEY NOT NULL,
                  order_number INTEGER NOT NULL,
                  total_vnd INTEGER NOT NULL CHECK(total_vnd >= 0),
                  payment_method TEXT NOT NULL CHECK(payment_method IN ('cash', 'transfer', 'debt')),
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL,
                  deleted_at TEXT,
                  revision INTEGER NOT NULL DEFAULT 1
                );
                INSERT INTO orders_new SELECT * FROM orders;

                CREATE TABLE order_items_new (
                  id TEXT PRIMARY KEY NOT NULL,
                  order_id TEXT NOT NULL REFERENCES orders_new(id),
                  product_id TEXT REFERENCES products(id),
                  product_name TEXT NOT NULL,
                  quantity INTEGER NOT NULL CHECK(quantity > 0),
                  unit_price_vnd INTEGER NOT NULL CHECK(unit_price_vnd >= 0),
                  unit_cost_vnd INTEGER NOT NULL DEFAULT 0 CHECK(unit_cost_vnd >= 0),
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL,
                  deleted_at TEXT,
                  revision INTEGER NOT NULL DEFAULT 1
                );
                INSERT INTO order_items_new SELECT * FROM order_items;

                CREATE TABLE stock_movements_new (
                  id TEXT PRIMARY KEY NOT NULL,
                  ingredient_id TEXT NOT NULL REFERENCES ingredients(id),
                  kind TEXT NOT NULL CHECK(kind IN ('purchase', 'sale', 'adjustment')),
                  quantity_delta_micros INTEGER NOT NULL,
                  unit_cost_vnd INTEGER NOT NULL DEFAULT 0,
                  expense_id TEXT REFERENCES expenses(id),
                  order_id TEXT REFERENCES orders_new(id),
                  note TEXT NOT NULL DEFAULT '',
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL,
                  deleted_at TEXT,
                  revision INTEGER NOT NULL DEFAULT 1,
                  unit_cost_micros_vnd INTEGER NOT NULL DEFAULT 0
                );
                INSERT INTO stock_movements_new SELECT * FROM stock_movements;

                DROP TABLE stock_movements;
                DROP TABLE order_items;
                DROP TABLE orders;
                ALTER TABLE orders_new RENAME TO orders;
                ALTER TABLE order_items_new RENAME TO order_items;
                ALTER TABLE stock_movements_new RENAME TO stock_movements;

                CREATE INDEX orders_created_at ON orders(created_at DESC) WHERE deleted_at IS NULL;
                CREATE INDEX stock_movement_ingredient_time ON stock_movements(ingredient_id, created_at DESC);
                PRAGMA user_version = 3;
              `);
            });
        } finally {
            await database.execAsync('PRAGMA foreign_keys = ON');
        }
        const violation = await database.getFirstAsync('PRAGMA foreign_key_check');
        if (violation) throw new Error('Dữ liệu hiện có không vượt qua kiểm tra khóa ngoại sau migration.');
      }
      return database;
    })().catch((error: unknown) => {
      opening = undefined;
      throw error;
    });
  }
  return opening;
}

export async function rows<T>(table: string): Promise<T[]> {
  const database = await getDatabase();
  return database.getAllAsync<T>(`SELECT * FROM ${table} WHERE deleted_at IS NULL ORDER BY updated_at DESC`);
}

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export function metadata(now = new Date().toISOString()) {
  return { created_at: now, updated_at: now, deleted_at: null, revision: 1 };
}

export function assertVnd(amount: number): number {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new Error('Số tiền phải là số nguyên VNĐ hợp lệ.');
  }
  return amount;
}
