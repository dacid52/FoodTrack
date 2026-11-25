import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme/tokens';

export function HeaderActions() {
  const router = useRouter();
  return (
    <View style={styles.row}>
      <Pressable accessibilityLabel="Lịch sử giao dịch" onPress={() => router.push('/(tabs)/history')} style={styles.action}>
        <Text style={styles.icon}>◷</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  action: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  icon: { color: colors.muted, fontSize: 21 },
});
