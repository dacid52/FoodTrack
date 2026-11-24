import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { Button, Card, EmptyState, Field, Page, SectionTitle, common } from '../../components/ui';
import { deleteProduct, saveProduct, setProductActive } from '../../features/records';
import { useAppStore } from '../../store/useAppStore';
import { colors, spacing } from '../../theme/tokens';
import type { Product } from '../../database/types';
import { formatVnd } from '../../database/format';

export default function MenuScreen() {
  const [query, setQuery] = useState('');
  const [productModal, setProductModal] = useState<Product | null | false>(false);
  const [saving, setSaving] = useState(false);
  const products = useAppStore((state) => state.products);
  const refresh = useAppStore((state) => state.refresh);

  const run = async (action: () => Promise<void>, success?: string) => {
    try {
      setSaving(true);
      await action();
      await refresh();
      if (success) Alert.alert('Đã lưu', success);
    } catch (error) {
      Alert.alert('Không thể lưu', error instanceof Error ? error.message : 'Lỗi không xác định.');
    } finally {
      setSaving(false);
    }
  };

  const filteredProducts = products.filter((item) => item.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <Page title="Thực đơn">
      <Field label="Tìm món ăn" value={query} onChangeText={setQuery} placeholder="Nhập từ khóa..." />
      <SectionTitle action={<Button compact label="＋ Thêm món" onPress={() => setProductModal(null)} />}>{`Menu quán · ${products.length} món`}</SectionTitle>
      {filteredProducts.length === 0 ? <EmptyState title="Chưa có món trong menu" description="Thêm món ăn để bắt đầu tạo đơn bán hàng." /> :
        <Card style={{ paddingVertical: 0, gap: 0 }}>
          {filteredProducts.map((product, index) => (
            <View key={product.id}>
              {index ? <View style={common.divider} /> : null}
              <View style={styles.productRow}>
                {product.image_uri ? <Image source={{ uri: product.image_uri }} style={styles.productImage} /> : <View style={styles.imagePlaceholder}><Ionicons name="restaurant-outline" size={20} color={colors.faint} /></View>}
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitle}>{product.name}</Text>
                  <Text style={styles.price}>{formatVnd(product.price_vnd)}</Text>
                </View>
                <Switch
                  accessibilityLabel={`${product.active ? 'Tạm ngưng' : 'Mở bán'} ${product.name}`}
                  value={product.active === 1}
                  onValueChange={(active) => void run(() => setProductActive(product.id, active))}
                  trackColor={{ true: colors.primary }}
                />
                <Pressable onPress={() => setProductModal(product)} style={styles.iconButton}><Ionicons name="create-outline" size={20} color={colors.muted} /></Pressable>
                <Pressable onPress={() => Alert.alert('Xóa món?', `Xóa "${product.name}" khỏi thực đơn?`, [
                  { text: 'Hủy', style: 'cancel' },
                  { text: 'Xóa', style: 'destructive', onPress: () => void run(() => deleteProduct(product.id)) },
                ])} style={styles.iconButton}><Ionicons name="trash-outline" size={19} color={colors.danger} /></Pressable>
              </View>
            </View>
          ))}
        </Card>}

      <ProductForm
        visible={productModal !== false}
        product={productModal || null}
        busy={saving}
        onClose={() => setProductModal(false)}
        onSave={(value) => void run(async () => { await saveProduct(value, productModal ? productModal.id : undefined); setProductModal(false); })}
      />
    </Page>
  );
}

function ProductForm({ visible, product, busy, onClose, onSave }: {
  visible: boolean;
  product: Product | null;
  busy: boolean;
  onClose: () => void;
  onSave: (value: Pick<Product, 'name' | 'description' | 'price_vnd' | 'active' | 'image_uri'>) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [active, setActive] = useState(true);

  const open = () => {
    setName(product?.name ?? '');
    setDescription(product?.description ?? '');
    setPrice(product ? String(product.price_vnd) : '');
    setImageUri(product?.image_uri ?? null);
    setActive(product ? product.active === 1 : true);
  };

  const chooseImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Cần quyền truy cập ảnh', 'Cho phép truy cập thư viện ảnh để chọn ảnh món.');
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.65, base64: true });
    if (picked.canceled || !picked.assets[0]) return;
    if (!picked.assets[0].base64) throw new Error('Không đọc được nội dung ảnh đã chọn.');
    setImageUri(`data:image/jpeg;base64,${picked.assets[0].base64}`);
  };

  return (
    <Modal animationType="slide" transparent visible={visible} onShow={open} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.formSheet}>
          <Text style={styles.formTitle}>{product ? 'Chỉnh sửa món' : 'Thêm món mới'}</Text>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: spacing.md }}>
            <Field label="Tên món ăn *" value={name} onChangeText={setName} placeholder="Tên món" />
            <Field label="Giá bán (VNĐ) *" value={price} onChangeText={setPrice} keyboardType="number-pad" placeholder="30000" />
            <Field label="Mô tả" value={description} onChangeText={setDescription} placeholder="Mô tả món ăn" />
            <View style={common.row}>
              {imageUri ? <Image source={{ uri: imageUri }} style={styles.preview} /> : <View style={styles.preview}><Ionicons name="image-outline" size={23} color={colors.faint} /></View>}
              <Button variant="secondary" label="Chọn ảnh từ máy" onPress={() => void chooseImage().catch((error: unknown) => Alert.alert('Không tải được ảnh', error instanceof Error ? error.message : 'Lỗi không xác định.'))} />
              {imageUri ? <Button compact variant="ghost" label="Xóa ảnh" onPress={() => setImageUri(null)} /> : null}
            </View>
            <View style={common.row}>
              <Text style={styles.formLabel}>Đang mở bán</Text>
              <Switch value={active} onValueChange={setActive} trackColor={{ true: colors.primary }} />
            </View>
          </ScrollView>
          <View style={styles.formActions}>
            <Button variant="secondary" label="Hủy" onPress={onClose} />
            <View style={{ flex: 1 }} />
            <Button label={busy ? 'Đang lưu…' : 'Lưu món'} disabled={busy} onPress={() => {
              const amount = Number(price.trim());
              if (!name.trim() || !/^\d+$/.test(price.trim()) || !Number.isSafeInteger(amount) || amount <= 0) {
                Alert.alert('Thông tin chưa hợp lệ', 'Nhập tên món và giá bán là số nguyên VNĐ lớn hơn 0.');
                return;
              }
              onSave({ name, description, price_vnd: amount, active: active ? 1 : 0, image_uri: imageUri });
            }} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  productRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 7 },
  productImage: { width: 42, height: 42, borderRadius: 8, backgroundColor: '#F3F4F6' },
  imagePlaceholder: { width: 42, height: 42, borderRadius: 8, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  itemTitle: { color: colors.text, fontSize: 13, fontWeight: '600' },
  price: { color: colors.primary, fontSize: 12, fontWeight: '700', marginTop: 3 },
  iconButton: { width: 30, height: 38, alignItems: 'center', justifyContent: 'center' },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000066' },
  formSheet: { maxHeight: '90%', backgroundColor: colors.surface, borderTopLeftRadius: 14, borderTopRightRadius: 14, padding: spacing.md, gap: spacing.md },
  formTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  formLabel: { color: colors.text, fontSize: 13, fontWeight: '600' },
  preview: { width: 48, height: 48, backgroundColor: '#F3F4F6', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  formActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
