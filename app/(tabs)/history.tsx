import { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { ExpenseSheet } from '../../components/ExpenseSheet';
import { Button, Card, EmptyState, Field, Page, Segmented, SectionTitle, common } from '../../components/ui';
import { formatVnd, localDate } from '../../database/format';
import { getDashboardSummary, listTransactions } from '../../features/records';
import type { ExpenseCategory, PaymentMethod } from '../../database/types';
import { colors, spacing } from '../../theme/tokens';

type Transaction = Awaited<ReturnType<typeof listTransactions>>[number];
type TimeMode = 'day' | 'week' | 'month' | 'year';
type TypeFilter = 'all' | 'order' | ExpenseCategory;

function rangeFor(mode: TimeMode, selectedDay: string, selectedMonth: string, selectedYear: number) {
  if (mode === 'day') return { from: selectedDay, to: selectedDay };
  if (mode === 'month') {
    const [year, month] = selectedMonth.split('-').map(Number);
    return { from: `${selectedMonth}-01`, to: `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}` };
  }
  if (mode === 'year') return { from: `${selectedYear}-01-01`, to: `${selectedYear}-12-31` };
  const day = new Date(`${selectedDay}T12:00:00`);
  const monday = new Date(day);
  monday.setDate(day.getDate() - ((day.getDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { from: localDate(monday), to: localDate(sunday) };
}

function shiftMonth(value: string, delta: number): string {
  const [year, month] = value.split('-').map(Number);
  const date = new Date(year, month - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export default function HistoryScreen() {
  const [mode, setMode] = useState<TimeMode>('day');
  const [selectedMonth, setSelectedMonth] = useState(localDate().slice(0, 7));
  const [selectedYear, setSelectedYear] = useState(Number(localDate().slice(0, 4)));
  const [dayOffset, setDayOffset] = useState(0);
  const selectedDay = useMemo(() => {
    const adjustedDay = new Date();
    adjustedDay.setDate(adjustedDay.getDate() + dayOffset);
    return localDate(adjustedDay);
  }, [dayOffset]);
  const [filter, setFilter] = useState<TypeFilter>('all');
  const [search, setSearch] = useState('');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState({ revenue: 0, purchases: 0, other: 0, profit: 0, orders: 0 });
  const [selected, setSelected] = useState<Transaction | null>(null);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const range = rangeFor(mode, selectedDay, selectedMonth, selectedYear);
  const reload = async (reset = true) => {
    const start = reset ? 0 : offset;
    const [rows, totals] = await Promise.all([
      listTransactions(100, start, range.from, range.to),
      getDashboardSummary(range.from, range.to),
    ]);
    setTransactions((current) => reset ? rows : [...current, ...rows]);
    setSummary(totals);
    setOffset(start + rows.length);
    setHasMore(rows.length === 100);
  };

  useEffect(() => {
    let active = true;
    const currentRange = rangeFor(mode, selectedDay, selectedMonth, selectedYear);
    Promise.all([listTransactions(100, 0, currentRange.from, currentRange.to), getDashboardSummary(currentRange.from, currentRange.to)])
      .then(([rows, totals]) => {
        if (active) {
          setTransactions(rows);
          setSummary(totals);
          setOffset(rows.length);
          setHasMore(rows.length === 100);
        }
      })
      .catch((error: unknown) => Alert.alert('Không thể tải lịch sử', error instanceof Error ? error.message : 'Lỗi không xác định.'));
    return () => { active = false; };
  }, [mode, selectedDay, selectedMonth, selectedYear]);

  const filtered = useMemo(() => transactions.filter((item) => {
    const time = item.occurred_at.slice(0, 10);
    if (time < range.from || time > range.to) return false;
    if (filter !== 'all' && item.type !== filter) return false;
    const term = search.trim().toLocaleLowerCase('vi');
    return !term || item.title.toLocaleLowerCase('vi').includes(term) ||
      item.note.toLocaleLowerCase('vi').includes(term) || item.id.toLocaleLowerCase().includes(term);
  }), [filter, range.from, range.to, search, transactions]);

  return (
    <Page title="Lịch sử giao dịch">
      <View style={common.row}>
        <Text style={common.muted}>Đang xem: {mode === 'day' ? selectedDay.split('-').reverse().join('/') : mode === 'week' ? `${range.from} – ${range.to}` : mode === 'month' ? selectedMonth : selectedYear}</Text>
        <Button compact label="＋ Ghi chi" onPress={() => setExpenseOpen(true)} />
      </View>
      <Card>
        <Segmented<TimeMode>
          options={[{ value: 'day', label: 'Ngày' }, { value: 'week', label: 'Tuần' }, { value: 'month', label: 'Tháng' }, { value: 'year', label: 'Năm' }]}
          value={mode}
          onChange={setMode}
        />
        {mode === 'day' ? (
          <View style={styles.periodNav}>
            <Button compact variant={dayOffset === 0 ? 'primary' : 'secondary'} label="Hôm nay" onPress={() => setDayOffset(0)} />
            <Button compact variant={dayOffset === -1 ? 'primary' : 'secondary'} label="Hôm qua" onPress={() => setDayOffset(-1)} />
            <View style={{ flex: 1 }} />
            <Button compact variant="ghost" label="‹" onPress={() => setDayOffset((value) => value - 1)} />
            <Button compact variant="ghost" label="›" onPress={() => setDayOffset((value) => Math.min(0, value + 1))} />
          </View>
        ) : null}
        {mode === 'month' ? (
          <View style={styles.periodNav}>
            <Button compact variant="ghost" label="‹" onPress={() => setSelectedMonth((value) => shiftMonth(value, -1))} />
            <Text style={styles.periodValue}>{selectedMonth}</Text>
            <Button compact variant="ghost" label="›" onPress={() => setSelectedMonth((value) => shiftMonth(value, 1))} />
          </View>
        ) : null}
        {mode === 'year' ? (
          <View style={styles.periodNav}>
            <Button compact variant="ghost" label="‹" onPress={() => setSelectedYear((value) => value - 1)} />
            <Text style={styles.periodValue}>{selectedYear}</Text>
            <Button compact variant="ghost" label="›" onPress={() => setSelectedYear((value) => Math.min(Number(localDate().slice(0, 4)), value + 1))} />
          </View>
        ) : null}
        <View style={styles.summary}>
          <SummaryMetric label="Tổng thu" value={summary.revenue} positive />
          <SummaryMetric label="Tổng chi" value={summary.purchases + summary.other} positive={false} />
          <SummaryMetric label="Lợi nhuận" value={summary.profit} positive={summary.profit >= 0} />
        </View>
      </Card>

      <Field label="Tìm giao dịch" value={search} onChangeText={setSearch} placeholder="Mã đơn, nội dung..." />
      <Segmented<TypeFilter>
        options={[
          { value: 'all', label: 'Tất cả' },
          { value: 'order', label: 'Đơn hàng' },
          { value: 'purchase', label: 'Nhập hàng' },
          { value: 'other', label: 'Chi khác' },
        ]}
        value={filter}
        onChange={setFilter}
      />
      <SectionTitle>{`${filtered.length} giao dịch`}</SectionTitle>
      {filtered.length === 0 ? <EmptyState title="Không có giao dịch trong kỳ này" description="Hãy đổi khoảng thời gian hoặc bộ lọc." /> :
        <Card style={{ paddingVertical: 0, gap: 0 }}>
          {filtered.map((item, index) => {
            const income = item.amount_vnd > 0;
            const typeLabel = item.type === 'order' ? 'Đơn hàng' : item.type === 'purchase' ? 'Nhập hàng' : 'Chi phí khác';
            return (
              <View key={item.id}>
                {index ? <View style={common.divider} /> : null}
                <Pressable onPress={() => setSelected(item)} style={styles.transaction}>
                  <View style={[styles.typeMark, { backgroundColor: income ? '#F0FDF4' : '#FFF7ED' }]}>
                    <Text style={{ color: income ? colors.success : colors.primary }}>{income ? '↓' : '↑'}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text numberOfLines={1} style={styles.title}>{item.title}</Text>
                    <Text numberOfLines={1} style={common.muted}>{typeLabel} · {item.occurred_at.slice(0, 16).replace('T', ' ')}</Text>
                    {item.note ? <Text numberOfLines={1} style={common.muted}>{item.note}</Text> : null}
                  </View>
                  <Text style={[styles.amount, { color: income ? colors.success : colors.primary }]}>{income ? '+' : '−'}{formatVnd(Math.abs(item.amount_vnd))}</Text>
                </Pressable>
              </View>
            );
          })}
        </Card>}
      {hasMore && transactions.length > 0 ? <Button variant="secondary" label="Tải thêm giao dịch" onPress={() => void reload(false).catch((error: unknown) => Alert.alert('Không thể tải thêm', error instanceof Error ? error.message : 'Lỗi không xác định.'))} /> : null}

      <ExpenseSheet visible={expenseOpen} onClose={() => {
        setExpenseOpen(false);
        void reload().catch((error: unknown) => Alert.alert('Không thể làm mới lịch sử', error instanceof Error ? error.message : 'Lỗi không xác định.'));
      }} />
      <Modal transparent animationType="slide" visible={Boolean(selected)} onRequestClose={() => setSelected(null)}>
        {selected ? (
          <View style={styles.overlay}>
            <View style={styles.sheet}>
              <View style={common.row}>
                <Text style={styles.sheetTitle}>Chi tiết giao dịch</Text>
                <Pressable onPress={() => setSelected(null)}><Text style={styles.close}>Đóng</Text></Pressable>
              </View>
              <Text style={[styles.detailAmount, { color: selected.amount_vnd > 0 ? colors.success : colors.primary }]}>
                {selected.amount_vnd > 0 ? '+' : '−'}{formatVnd(Math.abs(selected.amount_vnd))}
              </Text>
              <Text style={styles.title}>{selected.title}</Text>
              <Card>
                <DetailRow label="Mã giao dịch" value={selected.id} />
                <DetailRow label="Thời gian" value={selected.occurred_at.replace('T', ' ')} />
                <DetailRow label="Thanh toán" value={paymentLabel(selected.payment_method)} />
                <DetailRow label="Ghi chú" value={selected.note || '—'} />
              </Card>
              <Button label="Đóng" onPress={() => setSelected(null)} />
            </View>
          </View>
        ) : null}
      </Modal>
    </Page>
  );
}

function SummaryMetric({ label, value, positive }: { label: string; value: number; positive: boolean }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 3 }}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.metricValue, { color: positive ? colors.success : colors.primary }]}>{formatVnd(value)}</Text>
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return <View style={styles.detailRow}><Text style={common.muted}>{label}</Text><Text style={styles.detailText}>{value}</Text></View>;
}

function paymentLabel(method: PaymentMethod) {
  return method === 'cash' ? 'Tiền mặt' : method === 'transfer' ? 'Chuyển khoản' : 'Ghi nợ';
}

const styles = StyleSheet.create({
  periodNav: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, justifyContent: 'center' },
  periodValue: { color: colors.text, fontSize: 13, fontWeight: '700' },
  summary: { flexDirection: 'row', gap: spacing.xs, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: spacing.sm },
  metricLabel: { color: colors.muted, fontSize: 10, fontWeight: '500' },
  metricValue: { fontSize: 11, fontWeight: '700' },
  transaction: { minHeight: 65, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  typeMark: { width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.text, fontSize: 12, fontWeight: '700' },
  amount: { fontSize: 11, fontWeight: '700' },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000066' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 14, borderTopRightRadius: 14, padding: spacing.md, gap: spacing.md },
  sheetTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  close: { color: colors.muted, padding: 8, fontSize: 12 },
  detailAmount: { fontSize: 24, fontWeight: '700', textAlign: 'center' },
  detailRow: { minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  detailText: { color: colors.text, fontSize: 12, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
});
