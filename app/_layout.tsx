import {
  BeVietnamPro_400Regular,
  BeVietnamPro_500Medium,
  BeVietnamPro_600SemiBold,
  BeVietnamPro_700Bold,
  useFonts,
} from '@expo-google-fonts/be-vietnam-pro';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import 'react-native-reanimated';

import { ErrorNotice } from '../components/ui';
import { useAppStore } from '../store/useAppStore';
import { colors } from '../theme/tokens';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    BeVietnamPro_400Regular,
    BeVietnamPro_500Medium,
    BeVietnamPro_600SemiBold,
    BeVietnamPro_700Bold,
  });
  const ready = useAppStore((state) => state.ready);
  const error = useAppStore((state) => state.error);
  const refresh = useAppStore((state) => state.refresh);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    let active = true;
    refresh().finally(() => {
      if (active) setStarted(true);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [refresh]);

  useEffect(() => {
    if (fontError) throw fontError;
  }, [fontError]);

  useEffect(() => {
    if (fontsLoaded && (ready || started)) void SplashScreen.hideAsync();
  }, [fontsLoaded, ready, started]);

  if (!fontsLoaded || (!ready && !started)) return null;
  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: colors.canvas, gap: 16 }}>
        <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700', fontFamily: 'BeVietnamPro_700Bold' }}>Không mở được dữ liệu HaFood</Text>
        {error ? <ErrorNotice message={error} /> : null}
        <ActivityIndicator color={colors.primary} />
        <Text onPress={() => refresh().catch(() => undefined)} style={{ color: colors.primary, textAlign: 'center', fontFamily: 'BeVietnamPro_600SemiBold' }}>Thử lại</Text>
      </View>
    );
  }

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }}>
        <Stack.Screen name="(tabs)" />
      </Stack>
    </>
  );
}
