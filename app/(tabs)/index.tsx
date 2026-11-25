import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { HeaderActions } from '../../components/HeaderActions';
import { ExpenseSheet } from '../../components/ExpenseSheet';
import { Button, Card, Page, SectionTitle, Segmented, common } from '../../components/ui';
import { formatVnd, localDate } from '../../database/format';
import { getDashboardSummary, listTransactions } from '../../features/records';
import { useAppStore } from '../../store/useAppStore';
import { colors, spacing } from '../../theme/tokens';

type Period = 'today' | 'yesterday' | '7days' | 'month';
type Transaction = Awaited<ReturnType<typeof listTransactions>>[number];

function subtractDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return localDate(date);
}

function periodRange(period: Period) {
  const today = localDate();
  if (period === 'yesterday') return { from: subtractDays(1), to: subtractDays(1) };
  if (period === '7days') return { from: subtractDays(6), to: today };
  if (period === 'month') return { from: `${today.slice(0, 7)}-01`, to: today };
  return { from: today, to: today };
}

function TransactionRow({ transaction, onPress }: { transaction: Transaction; onPress: () => void }) {
  const income = transaction.amount_vnd > 0;
  return (
    <Pressable onPress={onPress} style={styles.transaction}>
      <View style={[styles.transactionIcon, { backgroundColor: income ? '#F0FDF4' : '#FFF7ED' }]}>
        <Text style={{ color: income ? colors.success : colors.primary }}>{income ? '↓' : '↑'}</Text>
      </View>
      <View style={styles.transactionText}>
        <Text numberOfLines={1} style={styles.transactionTitle}>{transaction.title}</Text>
        <Text numberOfLines={1} style={common.muted}>{transaction.occurred_at.slice(11, 16)} · {transaction.payment_method}</Text>
      </View>
      <Text style={[styles.transactionAmount, { color: income ? colors.success : colors.primary }]}>
        {income ? '+' : '−'}{formatVnd(Math.abs(transaction.amount_vnd))}
      </Text>
    </Pressable>
  );
}

export default function DashboardScreen() {
  const router = useRouter();
  const [period, setPeriod] = useState<Period>('today');
  const [summary, setSummary] = useState({ revenue: 0, orders: 0, purchases: 0, other: 0, profit: 0 });
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const storeReady = useAppStore((state) => state.ready);

  useEffect(() => {
    let active = true;
    const range = periodRange(period);
    void Promise.resolve().then(async () => {
      if (active) setLoading(true);
      try {
        const [nextSummary, rows] = await Promise.all([getDashboardSummary(range.from, range.to), listTransactions(4)]);
        if (active) {
          setSummary(nextSummary);
          setTransactions(rows);
        }
      } catch (error: unknown) {
        if (active) setTransactions([]);
        console.error('Không thể tải tổng quan FoodTrack', error);
      } finally {
        if (active) setLoading(false);
      }
    });
    return () => { active = false; };
  }, [period, storeReady]);

  return (
    <Page title="Tổng quan" right={<HeaderActions />}>
      <Pressable style={styles.offlineBanner}>
        <Text style={styles.offlineDot}>●</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.offlineTitle}>Dữ liệu lưu trên thiết bị</Text>
          <Text style={common.muted}>Offline-first · Không cần đăng nhập</Text>
        </View>
        <Text style={styles.bannerLink}>Sao lưu</Text>
      </Pressable>

      <View style={common.row}>
        <View style={{ flex: 1 }}>
          <Text style={common.muted}>Hôm nay, {localDate().split('-').reverse().join('/')}</Text>
          <Text style={styles.shopName}>Quán Ăn Vặt HaFood</Text>
        </View>
        <Button label="Bán ngay" compact onPress={() => router.push('/(tabs)/sales')} />
      </View>

      <Segmented<Period>
        options={[
          { value: 'today', label: 'Hôm nay' },
          { value: 'yesterday', label: 'Hôm qua' },
          { value: '7days', label: '7 ngày' },
          { value: 'month', label: 'Tháng này' },
        ]}
        value={period}
        onChange={setPeriod}
      />

      <Card style={styles.profitCard}>
        <View style={common.row}>
          <Text style={styles.metricLabel}>LỢI NHUẬN {period === 'today' ? 'HÔM NAY' : period === 'yesterday' ? 'HÔM QUA' : period === '7days' ? '7 NGÀY QUA' : 'THÁNG NÀY'}</Text>
          <Text style={styles.orderBadge}>{summary.orders} đơn</Text>
        </View>
        <Text style={styles.profitValue}>{loading ? '—' : formatVnd(summary.profit)}</Text>
        <Text style={common.muted}>Lợi nhuận = Doanh thu − Nhập hàng − Chi phí khác</Text>
      </Card>

      <View style={styles.metrics}>
        <Metric label="DOANH THU" value={summary.revenue} color={colors.success} />
        <Metric label="NHẬP HÀNG" value={summary.purchases} color={colors.primary} />
        <Metric label="CHI KHÁC" value={summary.other} color={colors.muted} />
      </View>

      <View style={{ gap: spacing.sm }}>
        <SectionTitle>Thao tác nhanh</SectionTitle>
        <View style={styles.quickActions}>
          <QuickAction icon="▣" label="Tạo đơn" onPress={() => router.push('/(tabs)/sales')} />
          <QuickAction icon="▤" label="Thực đơn" onPress={() => router.push('/(tabs)/menu')} />
          <QuickAction icon="＋" label="Chi phí" onPress={() => setExpenseOpen(true)} />
          <QuickAction icon="◷" label="Lịch sử" onPress={() => router.push('/(tabs)/history')} />
        </View>
      </View>

      <View style={{ gap: spacing.sm }}>
        <SectionTitle action={<Text onPress={() => router.push('/(tabs)/history')} style={styles.link}>Xem tất cả ›</Text>}>Giao dịch gần đây</SectionTitle>
        <Card style={{ paddingVertical: 0, gap: 0 }}>
          {transactions.length === 0 ? <Text style={styles.emptyText}>Chưa có giao dịch. Tạo đơn hoặc ghi chi phí để bắt đầu.</Text> :
            transactions.map((transaction, index) => (
              <View key={transaction.id}>
                {index > 0 ? <View style={common.divider} /> : null}
                <TransactionRow transaction={transaction} onPress={() => router.push('/(tabs)/history')} />
              </View>
            ))}
        </Card>
      </View>

      {loading ? <Text style={common.muted}>Đang tính từ dữ liệu SQLite…</Text> : null}
      <ExpenseSheet visible={expenseOpen} onClose={() => {
        setExpenseOpen(false);
        void useAppStore.getState().refresh().catch((error: unknown) => console.error('Không thể làm mới dữ liệu sau khi ghi chi phí', error));
      }} />
    </Page>
  );
}

function Metric({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Card style={styles.metricCard}>
      <Text numberOfLines={1} style={styles.metricTitle}>{label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.metricValue, { color }]}>{formatVnd(value)}</Text>
    </Card>
  );
}

function QuickAction({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.quickAction}>
      <Text style={styles.quickIcon}>{icon}</Text>
      <Text style={styles.quickLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  offlineBanner: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.border, borderRadius: 8, minHeight: 58, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  offlineDot: { color: colors.success, fontSize: 12 },
  offlineTitle: { color: colors.text, fontSize: 12, fontWeight: '700' },
  bannerLink: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  shopName: { color: colors.text, fontSize: 15, fontWeight: '700' },
  profitCard: { borderColor: '#D1D5DB', padding: spacing.md },
  metricLabel: { color: colors.muted, fontSize: 10, fontWeight: '700', letterSpacing: 0.6 },
  orderBadge: { color: colors.muted, fontSize: 11, fontWeight: '600' },
  profitValue: { color: colors.text, fontSize: 29, fontWeight: '700', letterSpacing: -1 },
  metrics: { flexDirection: 'row', gap: spacing.sm },
  metricCard: { flex: 1, padding: 10, gap: 5 },
  metricTitle: { color: colors.muted, fontSize: 9, fontWeight: '700', letterSpacing: 0.2 },
  metricValue: { color: colors.text, fontSize: 12, fontWeight: '700' },
  quickActions: { flexDirection: 'row', gap: spacing.sm },
  quickAction: { flex: 1, minHeight: 74, alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
  quickIcon: { color: colors.primary, fontSize: 20, fontWeight: '700' },
  quickLabel: { color: colors.text, fontSize: 10, fontWeight: '600' },
  transaction: { flexDirection: 'row', alignItems: 'center', minHeight: 58, gap: 10 },
  transactionIcon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  transactionText: { flex: 1, gap: 2 },
  transactionTitle: { color: colors.text, fontSize: 12, fontWeight: '600' },
  transactionAmount: { fontSize: 12, fontWeight: '700' },
  emptyText: { color: colors.muted, fontSize: 12, lineHeight: 18, paddingVertical: spacing.md },
  link: { color: colors.primary, fontSize: 12, fontWeight: '600' },
});
