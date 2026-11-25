export type PaymentMethod = 'cash' | 'transfer' | 'debt';
export type ExpenseCategory = 'purchase' | 'other';
export type StockMovementKind = 'purchase' | 'sale' | 'adjustment';

export interface SyncEntity {
  id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  revision: number;
}

export interface Product extends SyncEntity {
  name: string;
  description: string;
  price_vnd: number;
  active: number;
  image_uri: string | null;
}

export interface Ingredient extends SyncEntity {
  name: string;
  unit: string;
  quantity_micros: number;
  low_stock_micros: number;
  unit_cost_vnd: number;
  unit_cost_micros_vnd: number;
}

export interface Recipe extends SyncEntity {
  product_id: string;
  notes: string;
}

export interface RecipeIngredient extends SyncEntity {
  recipe_id: string;
  ingredient_id: string;
  quantity_micros: number;
}

export interface Order extends SyncEntity {
  order_number: number;
  total_vnd: number;
  payment_method: PaymentMethod;
}

export interface OrderItem extends SyncEntity {
  order_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price_vnd: number;
  unit_cost_vnd: number;
}

export interface Expense extends SyncEntity {
  category: ExpenseCategory;
  amount_vnd: number;
  title: string;
  note: string;
  payment_method: PaymentMethod;
  occurred_at: string;
}

export interface StockMovement extends SyncEntity {
  ingredient_id: string;
  kind: StockMovementKind;
  quantity_delta_micros: number;
  unit_cost_vnd: number;
  unit_cost_micros_vnd: number;
  expense_id: string | null;
  order_id: string | null;
  note: string;
}

