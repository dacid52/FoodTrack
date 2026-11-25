import { ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radii, spacing } from '../theme/tokens';

export function Page({ title, children, right, scroll = true, footer }: {
  title: string;
  children: ReactNode;
  right?: ReactNode;
  scroll?: boolean;
  footer?: ReactNode;
}) {
  const { width } = useWindowDimensions();
  const body = (
    <View style={[styles.content, { maxWidth: width >= 1024 ? 1120 : 760, paddingHorizontal: width >= 640 ? spacing.lg : spacing.md }]}>
      {children}
    </View>
  );
  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
        <View style={styles.headerActions}>{right}</View>
      </View>
      {scroll ? (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scrollContent}>
          {body}
        </ScrollView>
      ) : body}
      {footer}
    </SafeAreaView>
  );
}

export function SectionTitle({ children, action }: { children: string; action?: ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{children}</Text>
      {action}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Button({ label, onPress, variant = 'primary', disabled = false, compact = false }: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        variant === 'primary' && styles.buttonPrimary,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'ghost' && styles.buttonGhost,
        variant === 'danger' && styles.buttonDanger,
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.buttonPressed,
      ]}>
      <Text style={[
        styles.buttonText,
        variant === 'primary' && styles.buttonPrimaryText,
        variant === 'danger' && styles.buttonPrimaryText,
        (variant === 'ghost' || variant === 'secondary') && styles.buttonSecondaryText,
      ]}>{label}</Text>
    </Pressable>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        {...props}
        placeholderTextColor={colors.faint}
        style={[styles.field, props.multiline && styles.fieldMultiline, props.style]}
      />
    </View>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((option) => (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: option.value === value }}
          key={option.value}
          onPress={() => onChange(option.value)}
          style={[styles.segment, option.value === value && styles.segmentSelected]}>
          <Text style={[styles.segmentText, option.value === value && styles.segmentTextSelected]}>{option.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {description ? <Text style={styles.muted}>{description}</Text> : null}
    </View>
  );
}

export function ErrorNotice({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <Pressable onPress={onDismiss} style={styles.errorNotice}>
      <Text style={styles.errorText}>{message}</Text>
      {onDismiss ? <Text style={styles.errorDismiss}>Đóng</Text> : null}
    </Pressable>
  );
}

export const common = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  muted: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  strong: { color: colors.text, fontSize: 14, fontWeight: '700' },
  positive: { color: colors.success },
  negative: { color: colors.danger },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
});

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.canvas },
  header: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    backgroundColor: colors.canvas,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerTitle: { flex: 1, color: colors.text, fontSize: 18, fontWeight: '700', letterSpacing: -0.3 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  scrollContent: { flexGrow: 1, alignItems: 'center', paddingBottom: spacing.lg },
  content: { width: '100%', gap: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.lg },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  sectionTitle: { color: colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.card, padding: spacing.md, gap: spacing.sm },
  button: { minHeight: 42, borderRadius: radii.control, paddingHorizontal: spacing.md, alignItems: 'center', justifyContent: 'center' },
  buttonCompact: { minHeight: 34, paddingHorizontal: spacing.sm },
  buttonPrimary: { backgroundColor: colors.primary },
  buttonSecondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  buttonGhost: { backgroundColor: 'transparent' },
  buttonDanger: { backgroundColor: colors.danger },
  buttonDisabled: { opacity: 0.45 },
  buttonPressed: { opacity: 0.8 },
  buttonText: { color: colors.text, fontSize: 13, fontWeight: '600', textAlign: 'center' },
  buttonPrimaryText: { color: '#FFFFFF' },
  buttonSecondaryText: { color: colors.muted },
  fieldWrap: { gap: spacing.xs },
  fieldLabel: { color: colors.text, fontSize: 12, fontWeight: '600' },
  field: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.control,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    fontSize: 14,
  },
  fieldMultiline: { minHeight: 84, textAlignVertical: 'top' },
  segmented: { flexDirection: 'row', padding: 3, backgroundColor: '#F3F4F6', borderRadius: radii.card, gap: 3 },
  segment: { flex: 1, minHeight: 36, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, borderRadius: 5 },
  segmentSelected: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  segmentText: { color: colors.muted, fontSize: 12, fontWeight: '500' },
  segmentTextSelected: { color: colors.text, fontWeight: '700' },
  empty: { alignItems: 'center', paddingVertical: spacing.lg, gap: spacing.xs },
  emptyTitle: { color: colors.text, fontSize: 14, fontWeight: '600' },
  muted: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  errorNotice: { padding: spacing.sm, backgroundColor: '#FEF2F2', borderColor: '#FECACA', borderWidth: 1, borderRadius: radii.control, gap: 4 },
  errorText: { color: colors.danger, fontSize: 12 },
  errorDismiss: { color: colors.danger, fontSize: 11, fontWeight: '700', textAlign: 'right' },
});
