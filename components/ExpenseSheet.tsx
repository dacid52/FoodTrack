import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { createExpense } from '../features/records';
import { useAppStore } from '../store/useAppStore';
import { colors, spacing } from '../theme/tokens';
import type { ExpenseCategory, PaymentMethod } from '../database/types';
import { formatVnd, localDate } from '../database/format';
import { parseQuantity } from '../utils/quantity';
import { Button, Card, Field, Segmented, common } from './ui';

export function ExpenseSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const refresh = useAppStore((state) => state.refresh);
  const ingredients = useAppStore((state) => state.ingredients);
  const [category, setCategory] = useState<ExpenseCategory>('purchase');
  const [amount, setAmount] = useState('');
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [ingredientId, setIngredientId] = useState<string | undefined>();
  const [quantity, setQuantity] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    try {
      const amountVnd = Number(amount.trim());
      if (!/^\d+$/.test(amount.trim()) || !Number.isSafeInteger(amountVnd) || amountVnd <= 0) {
        throw new Error('Số tiền phải là số nguyên VNĐ lớn hơn 0.');
      }
      if (!title.trim()) throw new Error('Vui lòng nhập nội dung chi.');
      const quantityMicros = ingredientId ? parseQuantity(quantity) : undefined;
      if (ingredientId && (!quantityMicros || quantityMicros <= 0)) throw new Error('Nhập số lượng nguyên liệu lớn hơn 0.');
      setBusy(true);
      const date = localDate();
      await createExpense({
        category,
        amountVnd,
        title,
        note,
        paymentMethod,
        occurredAt: `${date}T${new Date().toTimeString().slice(0, 8)}`,
        ingredientId,
        quantityMicros,
      });
      await refresh();
      setAmount('');
      setTitle('');
      setNote('');
      setIngredientId(undefined);
      setQuantity('');
      onClose();
    } catch (error) {
      Alert.alert('Không lưu được khoản chi', error instanceof Error ? error.message : 'Lỗi không xác định.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={common.row}>
            <Text style={styles.title}>Ghi nhận chi phí</Text>
            <Pressable onPress={onClose}><Text style={styles.close}>Đóng</Text></Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.md }}>
            <Segmented
              options={[{ value: 'purchase', label: 'Tiền nhập hàng' }, { value: 'other', label: 'Chi phí khác' }]}
              value={category}
              onChange={(value) => { setCategory(value); if (value === 'other') setIngredientId(undefined); }}
            />
            <Card>
              <Field label="Số tiền chi (VNĐ)" keyboardType="number-pad" value={amount} onChangeText={setAmount} placeholder="Ví dụ: 120000" />
              <View style={styles.shortcuts}>
                {[50000, 100000, 200000, 500000, 1000000].map((value) => (
                  <Pressable key={value} onPress={() => setAmount(String((Number(amount) || 0) + value))} style={styles.shortcut}>
                    <Text style={styles.shortcutText}>+{value >= 1000000 ? '1tr' : `${value / 1000}k`}</Text>
                  </Pressable>
                ))}
              </View>
              {amount && /^\d+$/.test(amount) ? <Text style={common.muted}>{formatVnd(Number(amount))}</Text> : null}
            </Card>
            <Field label="Nội dung chi" value={title} onChangeText={setTitle} placeholder={category === 'purchase' ? 'Nhập nguyên liệu...' : 'Gas, điện nước, bao bì...'} />
            <View style={{ gap: spacing.xs }}>
              <Text style={styles.label}>Hình thức thanh toán</Text>
              <Segmented
                options={[
                  { value: 'cash', label: 'Tiền mặt' },
                  { value: 'transfer', label: 'Chuyển khoản' },
                  { value: 'debt', label: 'Ghi nợ' },
                ]}
                value={paymentMethod}
                onChange={setPaymentMethod}
              />
            </View>
            {category === 'purchase' && ingredients.length ? (
              <View style={{ gap: spacing.xs }}>
                <Text style={styles.label}>Nhập kho nguyên liệu (tùy chọn)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.xs }}>
                  <Pressable onPress={() => setIngredientId(undefined)} style={[styles.ingredientChip, !ingredientId && styles.chipSelected]}>
                    <Text style={[styles.chipText, !ingredientId && styles.chipTextSelected]}>Không gắn</Text>
                  </Pressable>
                  {ingredients.map((ingredient) => (
                    <Pressable key={ingredient.id} onPress={() => setIngredientId(ingredient.id)} style={[styles.ingredientChip, ingredientId === ingredient.id && styles.chipSelected]}>
                      <Text style={[styles.chipText, ingredientId === ingredient.id && styles.chipTextSelected]}>{ingredient.name}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
                {ingredientId ? <Field label={`Số lượng nhập (${ingredients.find((item) => item.id === ingredientId)?.unit ?? ''})`} keyboardType="decimal-pad" value={quantity} onChangeText={setQuantity} placeholder="Ví dụ: 2.5" /> : null}
              </View>
            ) : null}
            <Field label="Ghi chú (tùy chọn)" value={note} onChangeText={setNote} placeholder="Nguồn hàng, người nhận..." />
          </ScrollView>
          <Button label={busy ? 'Đang lưu…' : 'Lưu chi phí'} onPress={() => void save()} disabled={busy} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000066' },
  sheet: { maxHeight: '92%', backgroundColor: colors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: spacing.md, gap: spacing.md },
  title: { color: colors.text, fontSize: 16, fontWeight: '700' },
  close: { color: colors.muted, fontSize: 12, fontWeight: '600', padding: 8 },
  label: { color: colors.text, fontSize: 12, fontWeight: '600' },
  shortcuts: { flexDirection: 'row', gap: 5, justifyContent: 'space-between' },
  shortcut: { flex: 1, minHeight: 32, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 4, backgroundColor: colors.surface },
  shortcutText: { color: colors.text, fontSize: 10, fontWeight: '600' },
  ingredientChip: { paddingVertical: 7, paddingHorizontal: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 4 },
  chipSelected: { borderWidth: 2, borderColor: colors.primary },
  chipText: { color: colors.muted, fontSize: 11 },
  chipTextSelected: { color: colors.primary, fontWeight: '700' },
});
