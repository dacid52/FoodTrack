import * as Crypto from 'expo-crypto';

import { getDatabase, snapshotTables } from './index';
import type { BackupSnapshot, SyncEntity } from './types';

type SnapshotPayload = Omit<BackupSnapshot, 'checksum'>;

const rowColumns: Record<(typeof snapshotTables)[number], string[]> = {
  products: ['id', 'name', 'description', 'price_vnd', 'active', 'image_uri', 'created_at', 'updated_at', 'deleted_at', 'revision'],
  ingredients: ['id', 'name', 'unit', 'quantity_micros', 'low_stock_micros', 'unit_cost_vnd', 'unit_cost_micros_vnd', 'created_at', 'updated_at', 'deleted_at', 'revision'],
  recipes: ['id', 'product_id', 'notes', 'created_at', 'updated_at', 'deleted_at', 'revision'],
  recipe_ingredients: ['id', 'recipe_id', 'ingredient_id', 'quantity_micros', 'created_at', 'updated_at', 'deleted_at', 'revision'],
  orders: ['id', 'order_number', 'total_vnd', 'payment_method', 'created_at', 'updated_at', 'deleted_at', 'revision'],
  order_items: ['id', 'order_id', 'product_id', 'product_name', 'quantity', 'unit_price_vnd', 'unit_cost_vnd', 'created_at', 'updated_at', 'deleted_at', 'revision'],
  expenses: ['id', 'category', 'amount_vnd', 'title', 'note', 'payment_method', 'occurred_at', 'created_at', 'updated_at', 'deleted_at', 'revision'],
  stock_movements: ['id', 'ingredient_id', 'kind', 'quantity_delta_micros', 'unit_cost_vnd', 'unit_cost_micros_vnd', 'expense_id', 'order_id', 'note', 'created_at', 'updated_at', 'deleted_at', 'revision'],
};

function payloadString(payload: SnapshotPayload): string {
  return JSON.stringify(payload);
}

async function checksum(payload: SnapshotPayload): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, payloadString(payload));
}

export async function createSnapshot(deviceId: string): Promise<BackupSnapshot> {
  const db = await getDatabase();
  const tables = {} as BackupSnapshot['tables'];
  for (const table of snapshotTables) {
    tables[table] = await db.getAllAsync(`SELECT * FROM ${table}`) as never;
  }
  const payload: SnapshotPayload = {
    format: 'foodtrack-backup',
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    deviceId,
    tables,
  };
  return { ...payload, checksum: await checksum(payload) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const textFields: Record<(typeof snapshotTables)[number], string[]> = {
  products: ['name', 'description'],
  ingredients: ['name', 'unit'],
  recipes: ['product_id', 'notes'],
  recipe_ingredients: ['recipe_id', 'ingredient_id'],
  orders: ['payment_method'],
  order_items: ['order_id', 'product_name'],
  expenses: ['category', 'title', 'note', 'payment_method', 'occurred_at'],
  stock_movements: ['ingredient_id', 'kind', 'note'],
};

const integerFields: Record<(typeof snapshotTables)[number], string[]> = {
  products: ['price_vnd', 'active'],
  ingredients: ['quantity_micros', 'low_stock_micros', 'unit_cost_vnd', 'unit_cost_micros_vnd'],
  recipes: [],
  recipe_ingredients: ['quantity_micros'],
  orders: ['order_number', 'total_vnd'],
  order_items: ['quantity', 'unit_price_vnd', 'unit_cost_vnd'],
  expenses: ['amount_vnd'],
  stock_movements: ['quantity_delta_micros', 'unit_cost_vnd', 'unit_cost_micros_vnd'],
};

const nonNegativeFields: Record<(typeof snapshotTables)[number], string[]> = {
  products: ['price_vnd'],
  ingredients: ['quantity_micros', 'low_stock_micros', 'unit_cost_vnd', 'unit_cost_micros_vnd'],
  recipes: [],
  recipe_ingredients: [],
  orders: ['total_vnd', 'order_number'],
  order_items: ['quantity', 'unit_price_vnd', 'unit_cost_vnd'],
  expenses: ['amount_vnd'],
  stock_movements: ['unit_cost_vnd', 'unit_cost_micros_vnd'],
};

function validRanges(table: (typeof snapshotTables)[number], row: Record<string, unknown>): boolean {
  if (!nonNegativeFields[table].every((field) => typeof row[field] === 'number' && row[field] >= 0)) return false;
  if (table === 'recipe_ingredients') return Number(row.quantity_micros) > 0;
  if (table === 'order_items') return Number(row.quantity) > 0;
  if (table === 'expenses') return Number(row.amount_vnd) > 0;
  if (table === 'orders') return Number(row.order_number) > 0;
  return true;
}

function assertSnapshotRelations(tables: Record<string, unknown[]>) {
  const rows = Object.fromEntries(snapshotTables.map((table) => [
    table,
    tables[table] as Array<Record<string, unknown>>,
  ])) as Record<(typeof snapshotTables)[number], Array<Record<string, unknown>>>;
  const ids = (table: (typeof snapshotTables)[number]) => new Set(rows[table].map((row) => row.id));
  const productIds = ids('products');
  const ingredientIds = ids('ingredients');
  const recipeIds = ids('recipes');
  const orderIds = ids('orders');
  const expenseIds = ids('expenses');
  const requireReference = (table: string, field: string, values: Array<Record<string, unknown>>, allowed: Set<unknown>) => {
    if (values.some((row) => row[field] !== null && !allowed.has(row[field]))) {
      throw new Error(`Bản sao lưu có tham chiếu không hợp lệ trong bảng ${table}.`);
    }
  };

  requireReference('recipes', 'product_id', rows.recipes, productIds);
  requireReference('recipe_ingredients', 'recipe_id', rows.recipe_ingredients, recipeIds);
  requireReference('recipe_ingredients', 'ingredient_id', rows.recipe_ingredients, ingredientIds);
  requireReference('order_items', 'order_id', rows.order_items, orderIds);
  requireReference('order_items', 'product_id', rows.order_items, productIds);
  requireReference('stock_movements', 'ingredient_id', rows.stock_movements, ingredientIds);
  requireReference('stock_movements', 'expense_id', rows.stock_movements, expenseIds);
  requireReference('stock_movements', 'order_id', rows.stock_movements, orderIds);

  const unique = (values: unknown[]) => new Set(values).size === values.length;
  if (!unique(rows.recipes.map((row) => row.product_id)) ||
    !unique(rows.recipe_ingredients.map((row) => JSON.stringify([row.recipe_id, row.ingredient_id])))) {
    throw new Error('Bản sao lưu vi phạm ràng buộc duy nhất của dữ liệu.');
  }
}

export async function validateSnapshot(value: unknown): Promise<BackupSnapshot> {
  if (!isRecord(value) || value.format !== 'foodtrack-backup' || value.schemaVersion !== 2 ||
    typeof value.generatedAt !== 'string' || typeof value.deviceId !== 'string' ||
    typeof value.checksum !== 'string' || !isRecord(value.tables)) {
    throw new Error('Bản sao lưu không đúng định dạng FoodTrack hoặc không tương thích.');
  }
  const tables: Record<string, unknown[]> = {};
  for (const table of snapshotTables) {
    const tableRows = value.tables[table];
    if (!Array.isArray(tableRows) || !tableRows.every((row) => isRecord(row) &&
      typeof row.id === 'string' && typeof row.created_at === 'string' &&
      typeof row.updated_at === 'string' && Number.isSafeInteger(row.revision) &&
      Number(row.revision) > 0 &&
      (row.deleted_at === null || typeof row.deleted_at === 'string') &&
      textFields[table].every((field) => typeof row[field] === 'string') &&
      integerFields[table].every((field) => Number.isSafeInteger(row[field])) &&
      validRanges(table, row) &&
      (table !== 'products' || (row.active === 0 || row.active === 1)) &&
      (table !== 'products' || row.image_uri === null || typeof row.image_uri === 'string') &&
      (table !== 'order_items' || row.product_id === null || typeof row.product_id === 'string') &&
      (table !== 'stock_movements' || (row.expense_id === null || typeof row.expense_id === 'string') &&
        (row.order_id === null || typeof row.order_id === 'string')) &&
      (table !== 'orders' || ['cash', 'transfer', 'debt'].includes(String(row.payment_method))) &&
      (table !== 'expenses' || (['purchase', 'other'].includes(String(row.category)) &&
        ['cash', 'transfer', 'debt'].includes(String(row.payment_method)))) &&
      (table !== 'stock_movements' || ['purchase', 'sale', 'adjustment'].includes(String(row.kind))))) {
      throw new Error(`Dữ liệu bảng ${table} bị thiếu hoặc không hợp lệ.`);
    }
    if (new Set(tableRows.map((row) => (row as Record<string, unknown>).id)).size !== tableRows.length) {
      throw new Error(`Bản sao lưu có ID trùng lặp trong bảng ${table}.`);
    }
    tables[table] = tableRows;
  }
  assertSnapshotRelations(tables);
  const payload: SnapshotPayload = {
    format: 'foodtrack-backup',
    schemaVersion: 2,
    generatedAt: value.generatedAt,
    deviceId: value.deviceId,
    tables: tables as BackupSnapshot['tables'],
  };
  if (await checksum(payload) !== value.checksum) {
    throw new Error('Kiểm tra toàn vẹn bản sao lưu thất bại (checksum không khớp).');
  }
  return { ...payload, checksum: value.checksum };
}

export async function restoreSnapshot(snapshot: BackupSnapshot): Promise<void> {
  const validated = await validateSnapshot(snapshot);
  const db = await getDatabase();
  const deleteOrder = [...snapshotTables].reverse();
  await db.withTransactionAsync(async () => {
    for (const table of deleteOrder) await db.runAsync(`DELETE FROM ${table}`);
    for (const table of snapshotTables) {
      const columns = rowColumns[table];
      for (const row of validated.tables[table] as unknown as Array<Record<string, unknown>>) {
        const values = columns.map((column) => row[column] ?? null);
        const placeholders = columns.map(() => '?').join(',');
        await db.runAsync(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${placeholders})`, ...values as (string | number | null)[]);
      }
    }
  });
}

function compareRows(left: SyncEntity, right: SyncEntity): number {
  if (left.revision !== right.revision) return left.revision - right.revision;
  if (left.updated_at !== right.updated_at) return left.updated_at.localeCompare(right.updated_at);
  if (Boolean(left.deleted_at) !== Boolean(right.deleted_at)) return left.deleted_at ? 1 : -1;
  return JSON.stringify(left).localeCompare(JSON.stringify(right));
}

export async function mergeSnapshots(local: BackupSnapshot, remote: BackupSnapshot): Promise<{
  snapshot: BackupSnapshot;
  conflicts: Array<{ table: string; id: string; winner: SyncEntity; loser: SyncEntity }>;
}> {
  const tables = {} as BackupSnapshot['tables'];
  const conflicts: Array<{ table: string; id: string; winner: SyncEntity; loser: SyncEntity }> = [];
  for (const table of snapshotTables) {
    const localRows = local.tables[table] as SyncEntity[];
    const remoteRows = remote.tables[table] as SyncEntity[];
    const byId = new Map(localRows.map((row) => [row.id, row]));
    for (const remoteRow of remoteRows) {
      const localRow = byId.get(remoteRow.id);
      if (!localRow) {
        byId.set(remoteRow.id, remoteRow);
      } else if (JSON.stringify(localRow) !== JSON.stringify(remoteRow)) {
        const localWins = compareRows(localRow, remoteRow) >= 0;
        const winner = localWins ? localRow : remoteRow;
        const loser = localWins ? remoteRow : localRow;
        byId.set(remoteRow.id, winner);
        conflicts.push({ table, id: remoteRow.id, winner, loser });
      }
    }
    tables[table] = [...byId.values()] as never;
  }
  const payload: SnapshotPayload = {
    format: 'foodtrack-backup',
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    deviceId: local.deviceId,
    tables,
  };
  return { snapshot: { ...payload, checksum: await checksum(payload) }, conflicts };
}

export async function persistConflicts(conflicts: Array<{ table: string; id: string; winner: SyncEntity; loser: SyncEntity }>) {
  if (conflicts.length === 0) return;
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    for (const conflict of conflicts) {
      await db.runAsync(
        'INSERT INTO sync_conflicts (id,table_name,record_id,winning_revision,losing_revision,detected_at,resolution) VALUES (?,?,?,?,?,?,?)',
        `${conflict.table}:${conflict.id}:${Date.now()}:${Math.random()}`,
        conflict.table,
        conflict.id,
        conflict.winner.revision,
        conflict.loser.revision,
        new Date().toISOString(),
        'revision-updatedAt-deletion-tie-break',
      );
    }
  });
}
