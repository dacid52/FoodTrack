import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { HeaderActions } from '../../components/HeaderActions';
import { Button, Card, EmptyState, Page, Segmented, SectionTitle, common } from '../../components/ui';
import { dateLabel, formatVnd, localDate } from '../../database/format';
import { getDailyReport, getDashboardSummary } from '../../features/records';
import { colors, spacing } from '../../theme/tokens';

type ReportMode = 'day' | 'month' | 'year';
type DailyRow = Awaited<ReturnType<typeof getDailyReport>>[number];

function currentMonth() {
  return localDate().slice(0, 7);
}

function monthRange(month: string) {
  const [year, value] = month.split('-').map(Number);
  return { from: `${month}-01`, to: `${year}-${String(value).padStart(2, '0')}-${String(new Date(year, value, 0).getDate()).padStart(2, '0')}` };
}

function shiftMonth(month: string, delta: number) {
  const [year, value] = month.split('-').map(Number);
  const result = new Date(year, value - 1 + delta, 1);
  return `${result.getFullYear()}-${String(result.getMonth() + 1).padStart(2, '0')}`;
}

export default function StatsScreen() {
  const [mode, setMode] = useState<ReportMode>('month');
  const [month, setMonth] = useState(currentMonth());
  const [year, setYear] = useState(Number(localDate().slice(0, 4)));
  const [summary, setSummary] = useState({ revenue: 0, orders: 0, purchases: 0, other: 0, profit: 0 });
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const today = localDate();
    const range = mode === 'day' ? { from: today, to: today } :
      mode === 'month' ? monthRange(month) : { from: `${year}-01-01`, to: `${year}-12-31` };
    setLoading(true);
    Promise.all([getDashboardSummary(range.from, range.to), getDailyReport(range.from, range.to, mode === 'year' ? 366 : 31)])
      .then(([totals, days]) => {
        if (active) {
          setSummary(totals);
          setDaily(days);
        }
      })
      .catch((error: unknown) => Alert.alert('Không thể tải báo cáo', error instanceof Error ? error.message : 'Lỗi không xác định.'))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [mode, month, year]);

  const periodLabel = mode === 'day' ? `Hôm nay (${dateLabel(localDate())})` : mode === 'month' ? `Tháng ${month.slice(5, 7)}/${month.slice(0, 4)}` : `Năm ${year}`;

  return (
    <Page title="Thống kê" right={<HeaderActions />}>
      <View>
        <Text style={styles.heading}>Báo cáo tài chính</Text>
        <Text style={common.muted}>Kỳ thống kê: {periodLabel}</Text>
      </View>
      <Segmented<ReportMode>
        options={[{ value: 'day', label: 'Ngày' }, { value: 'month', label: 'Tháng' }, { value: 'year', label: 'Năm' }]}
        value={mode}
        onChange={setMode}
      />
      {mode === 'month' ? (
        <PeriodPicker label={periodLabel} onPrevious={() => setMonth((value) => shiftMonth(value, -1))} onNext={() => setMonth((value) => {
          const next = shiftMonth(value, 1);
          return next > currentMonth() ? value : next;
        })} />
      ) : null}
      {mode === 'year' ? (
        <PeriodPicker label={String(year)} onPrevious={() => setYear((value) => value - 1)} onNext={() => setYear((value) => Math.min(Number(localDate().slice(0, 4)), value + 1))} />
      ) : null}

      <Card style={styles.summaryCard}>
        <Text style={styles.metricLabel}>LỢI NHUẬN RÒNG</Text>
        <Text style={[styles.profitValue, { color: summary.profit >= 0 ? colors.success : colors.danger }]}>{loading ? '—' : formatVnd(summary.profit)}</Text>
        <Text style={common.muted}>Doanh thu − Nhập hàng − Chi phí khác</Text>
        <View style={styles.metrics}>
          <Metric label="Số đơn" value={`${summary.orders} đơn`} />
          <Metric label="Doanh thu" value={formatVnd(summary.revenue)} />
          <Metric label="Nhập hàng" value={formatVnd(summary.purchases)} />
          <Metric label="Chi khác" value={formatVnd(summary.other)} />
        </View>
      </Card>

      <SectionTitle>{`${mode === 'day' ? 'Phân tích theo ngày' : 'Chi tiết theo ngày'} · ${daily.length} ngày`}</SectionTitle>
      {daily.length === 0 ? <EmptyState title="Chưa có dữ liệu trong kỳ" description="Số liệu được tính trực tiếp từ đơn hàng và chi phí SQLite." /> :
        <Card style={{ paddingVertical: 0, gap: 0 }}>
          {daily.map((day, index) => {
            const profit = day.revenue - day.purchases - day.other;
            return (
              <View key={day.day}>
                {index ? <View style={common.divider} /> : null}
                <View style={styles.dayRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dayTitle}>{dateLabel(day.day)}</Text>
                    <Text style={common.muted}>{day.orders} đơn · Thu {formatVnd(day.revenue)}</Text>
                    <Text style={common.muted}>Nhập {formatVnd(day.purchases)} · Chi khác {formatVnd(day.other)}</Text>
                  </View>
                  <Text style={[styles.dayProfit, { color: profit >= 0 ? colors.success : colors.danger }]}>{profit >= 0 ? '+' : '−'}{formatVnd(Math.abs(profit))}</Text>
                </View>
              </View>
            );
          })}
        </Card>}
    </Page>
  );
}

function PeriodPicker({ label, onPrevious, onNext }: { label: string; onPrevious: () => void; onNext: () => void }) {
  return (
    <Card style={styles.picker}>
      <Pressable onPress={onPrevious} accessibilityLabel="Kỳ trước"><Text style={styles.arrow}>‹</Text></Pressable>
      <Text style={styles.pickerLabel}>{label}</Text>
      <Pressable onPress={onNext} accessibilityLabel="Kỳ tiếp theo"><Text style={styles.arrow}>›</Text></Pressable>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <View style={{ flex: 1, gap: 4 }}><Text style={styles.metricLabel}>{label}</Text><Text adjustsFontSizeToFit numberOfLines={1} style={styles.metricValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  heading: { color: colors.text, fontSize: 16, fontWeight: '700' },
  picker: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.xs },
  pickerLabel: { color: colors.text, fontSize: 13, fontWeight: '700' },
  arrow: { color: colors.muted, fontSize: 25, paddingHorizontal: spacing.sm },
  summaryCard: { padding: spacing.md },
  metricLabel: { color: colors.muted, fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  profitValue: { fontSize: 28, fontWeight: '700', letterSpacing: -0.5 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: spacing.md },
  metricValue: { color: colors.text, fontSize: 12, fontWeight: '700' },
  dayRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  dayTitle: { color: colors.text, fontSize: 12, fontWeight: '700', marginBottom: 3 },
  dayProfit: { fontSize: 12, fontWeight: '700' },
});
