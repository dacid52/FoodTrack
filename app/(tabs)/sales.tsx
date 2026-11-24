import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Card, EmptyState, Field, Page, Segmented, common } from '../../components/ui';
import { createOrder } from '../../features/records';
import { formatVnd } from '../../database/format';
import type { PaymentMethod, Product } from '../../database/types';
import { useAppStore } from '../../store/useAppStore';
import { colors, spacing } from '../../theme/tokens';

export default function SalesScreen() {
  const products = useAppStore((state) => state.products);
  const refresh = useAppStore((state) => state.refresh);
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [cartOpen, setCartOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const filtered = products.filter((product) => product.active === 1 &&
    (product.name.toLowerCase().includes(query.trim().toLowerCase()) || String(product.price_vnd).includes(query.trim())));
  const count = Object.values(cart).reduce((sum, quantity) => sum + quantity, 0);
  const total = Object.entries(cart).reduce((sum, [id, quantity]) =>
    sum + (products.find((product) => product.id === id)?.price_vnd ?? 0) * quantity, 0);

  const updateQuantity = (product: Product, delta: number) => {
    setCart((current) => {
      const next = { ...current };
      const quantity = (next[product.id] ?? 0) + delta;
      if (quantity <= 0) delete next[product.id];
      else next[product.id] = quantity;
      return next;
    });
  };

  const confirm = async () => {
    const items = Object.entries(cart).map(([productId, quantity]) => ({ productId, quantity }));
    try {
      if (!items.length) throw new Error('Đơn hàng chưa có món.');
      setBusy(true);
      await createOrder(items, paymentMethod);
      setCart({});
      setCartOpen(false);
      await refresh();
      Alert.alert('Đã tạo đơn hàng', `Tổng thanh toán ${formatVnd(total)}.`);
    } catch (error) {
      Alert.alert('Không tạo được đơn hàng', error instanceof Error ? error.message : 'Lỗi không xác định.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page
      title="Bán hàng"
      footer={(
        <View style={styles.dock}>
          <Pressable onPress={() => setCartOpen(true)} style={styles.cartSummary}>
            <View style={styles.cartIcon}><Ionicons name="bag-outline" size={20} color="#FFFFFF" /><Text style={styles.cartBadge}>{count}</Text></View>
            <View>
              <Text style={styles.cartCount}>Chi tiết đơn ({count} món)</Text>
              <Text style={styles.cartTotal}>{formatVnd(total)}</Text>
            </View>
          </Pressable>
          <Button compact disabled={!count} label="Tạo đơn" onPress={() => setCartOpen(true)} />
        </View>
      )}>
      <Field label="Tìm món ăn nhanh" value={query} onChangeText={setQuery} placeholder="Tên món hoặc giá..." returnKeyType="search" />
      {filtered.length === 0 ? <EmptyState title={products.length ? 'Không tìm thấy món phù hợp' : 'Menu đang trống'} description={products.length ? 'Thử từ khóa khác hoặc mở bán món trong Menu.' : 'Thêm món trong tab Menu để bắt đầu tạo đơn.'} /> :
        <View style={styles.grid}>
          {filtered.map((product) => (
            <Pressable key={product.id} onPress={() => updateQuantity(product, 1)} style={styles.productCard}>
              {product.image_uri ? <Image source={{ uri: product.image_uri }} style={styles.productImage} /> : <View style={styles.productPlaceholder}><Ionicons name="fast-food-outline" size={30} color={colors.faint} /></View>}
              <Text numberOfLines={1} style={styles.productName}>{product.name}</Text>
              <Text numberOfLines={2} style={common.muted}>{product.description || 'Món ăn quán'}</Text>
              <View style={styles.productFooter}>
                <Text style={styles.productPrice}>{formatVnd(product.price_vnd)}</Text>
                <View style={styles.addButton}><Ionicons name="add" size={17} color="#FFFFFF" /></View>
              </View>
              {cart[product.id] ? <View style={styles.quantityBadge}><Text style={styles.quantityBadgeText}>{cart[product.id]}</Text></View> : null}
            </Pressable>
          ))}
        </View>}

      <Modal animationType="slide" transparent visible={cartOpen} onRequestClose={() => setCartOpen(false)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={common.row}>
              <Text style={styles.sheetTitle}>Chi tiết đơn hàng</Text>
              <Pressable onPress={() => setCartOpen(false)}><Text style={styles.close}>Đóng</Text></Pressable>
            </View>
            <ScrollView contentContainerStyle={{ gap: spacing.sm }}>
              {Object.entries(cart).length === 0 ? <EmptyState title="Chưa có món nào trong đơn" /> :
                Object.entries(cart).map(([id, quantity]) => {
                  const product = products.find((item) => item.id === id);
                  if (!product) return null;
                  return (
                    <Card key={id} style={styles.cartRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.productName}>{product.name}</Text>
                        <Text style={common.muted}>{formatVnd(product.price_vnd)} / món</Text>
                      </View>
                      <View style={styles.stepper}>
                        <Pressable onPress={() => updateQuantity(product, -1)} style={styles.stepButton}><Text style={styles.stepText}>−</Text></Pressable>
                        <Text style={styles.stepCount}>{quantity}</Text>
                        <Pressable onPress={() => updateQuantity(product, 1)} style={styles.stepButton}><Text style={styles.stepText}>＋</Text></Pressable>
                      </View>
                      <Text style={styles.productName}>{formatVnd(product.price_vnd * quantity)}</Text>
                    </Card>
                  );
                })}
            </ScrollView>
            <View style={styles.payRow}>
              <Text style={styles.productName}>Phương thức</Text>
              <Segmented
                options={[{ value: 'cash', label: 'Tiền mặt' }, { value: 'transfer', label: 'Chuyển khoản' }]}
                value={paymentMethod === 'debt' ? 'cash' : paymentMethod}
                onChange={setPaymentMethod}
              />
            </View>
            <View style={common.row}>
              <Text style={styles.sheetTitle}>Tổng thanh toán</Text>
              <Text style={styles.totalPrice}>{formatVnd(total)}</Text>
            </View>
            <View style={styles.actions}>
              <Button variant="secondary" label="Thu gọn" onPress={() => setCartOpen(false)} />
              <View style={{ flex: 1 }} />
              <Button label={busy ? 'Đang lưu…' : 'Xác nhận tạo đơn'} disabled={!count || busy} onPress={() => void confirm()} />
            </View>
          </View>
        </View>
      </Modal>
    </Page>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  productCard: { width: '48%', flexGrow: 1, flexBasis: 145, minWidth: 140, backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.border, padding: 9, gap: 5 },
  productImage: { width: '100%', height: 98, borderRadius: 6, backgroundColor: '#F3F4F6' },
  productPlaceholder: { width: '100%', height: 98, borderRadius: 6, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  productName: { color: colors.text, fontSize: 12, fontWeight: '700' },
  productFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 7, marginTop: 3 },
  productPrice: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  addButton: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 6, backgroundColor: colors.charcoal },
  quantityBadge: { position: 'absolute', top: 14, right: 14, minWidth: 22, height: 22, borderRadius: 11, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  quantityBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  dock: { minHeight: 65, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  cartSummary: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cartIcon: { width: 34, height: 34, borderRadius: 8, backgroundColor: colors.charcoal, alignItems: 'center', justifyContent: 'center' },
  cartBadge: { position: 'absolute', right: -5, top: -5, backgroundColor: colors.primary, color: '#FFFFFF', fontSize: 9, fontWeight: '700', overflow: 'hidden', borderRadius: 8, minWidth: 16, textAlign: 'center' },
  cartCount: { color: colors.text, fontSize: 11, fontWeight: '600' },
  cartTotal: { color: colors.text, fontSize: 14, fontWeight: '700', marginTop: 2 },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000066' },
  sheet: { maxHeight: '85%', backgroundColor: colors.surface, borderTopLeftRadius: 14, borderTopRightRadius: 14, padding: spacing.md, gap: spacing.md },
  sheetTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  close: { color: colors.muted, fontSize: 12, padding: 8, fontWeight: '600' },
  cartRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepButton: { width: 28, height: 28, backgroundColor: '#F3F4F6', borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  stepText: { color: colors.text, fontSize: 16, fontWeight: '700' },
  stepCount: { color: colors.text, width: 18, textAlign: 'center', fontWeight: '700' },
  payRow: { gap: spacing.sm },
  totalPrice: { color: colors.primary, fontSize: 17, fontWeight: '700' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.sm },
});
