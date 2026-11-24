import { create } from 'zustand';

import { getDashboardSummary, listExpenses, listIngredients, listOrders, listProducts } from '../features/records';
import { localDate } from '../database/format';
import type { Expense, Ingredient, Order, Product } from '../database/types';

interface DashboardSummary {
  revenue: number;
  orders: number;
  purchases: number;
  other: number;
  profit: number;
}

interface AppState {
  ready: boolean;
  loading: boolean;
  error: string | null;
  products: Product[];
  ingredients: Ingredient[];
  orders: Array<Order & { item_count: number }>;
  expenses: Expense[];
  summary: DashboardSummary;
  refresh: () => Promise<void>;
  clearError: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  ready: false,
  loading: true,
  error: null,
  products: [],
  ingredients: [],
  orders: [],
  expenses: [],
  summary: { revenue: 0, orders: 0, purchases: 0, other: 0, profit: 0 },
  clearError: () => set({ error: null }),
  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const today = localDate();
      const [products, ingredients, orders, expenses, summary] = await Promise.all([
        listProducts(),
        listIngredients(),
        listOrders(),
        listExpenses(),
        getDashboardSummary(today, today),
      ]);
      set({ products, ingredients, orders, expenses, summary, loading: false, ready: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Không thể đọc dữ liệu trên thiết bị.';
      set({ loading: false, error: message });
      throw error;
    }
  },
}));
