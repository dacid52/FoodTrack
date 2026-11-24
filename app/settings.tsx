import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { Button, Card, EmptyState, ErrorNotice, Page, common } from '../components/ui';
import { createSnapshot } from '../database/backup';
import { newId } from '../database';
import { listBackups, createDriveBackup, disconnectDrive, getConnection, restoreDriveBackup, storeGoogleTokens, synchronizeDrive } from '../sync/drive';
import { getBackgroundSyncStatus, setBackgroundSyncEnabled } from '../sync/background';
import { BackgroundTaskStatus } from 'expo-background-task';
import { readSetting, writeSetting } from '../features/records';
import { signInForDrive } from '../sync/googleSignIn';
import { useAppStore } from '../store/useAppStore';
import { colors, spacing } from '../theme/tokens';
import type { BackupFile, DriveConnection } from '../database/types';

const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
const selectedClientId = Platform.OS === 'ios' ? IOS_CLIENT_ID : Platform.OS === 'android' ? ANDROID_CLIENT_ID : WEB_CLIENT_ID;
const oauthConfigured = Boolean(selectedClientId || WEB_CLIENT_ID);

export default function SettingsScreen() {
  const router = useRouter();
  const refresh = useAppStore((state) => state.refresh);
  const [connection, setConnection] = useState<DriveConnection | null>(null);
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [autoSync, setAutoSync] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [backgroundStatus, setBackgroundStatus] = useState<string>('Chưa bật');
  const [localSize, setLocalSize] = useState(0);

  const loadSettings = async (loadRemote: boolean) => {
    try {
      const [account, enabled, syncedAt, auto, taskStatus, snapshot] = await Promise.all([
        getConnection(),
        readSetting('auto_sync'),
        readSetting('last_sync_at'),
        readSetting('last_sync_error'),
        getBackgroundSyncStatus(),
        createSnapshot((await getDeviceId())),
      ]);
      setConnection(account);
      setAutoSync(enabled === 'true');
      setLastSync(syncedAt);
      setError(auto || null);
      setBackgroundStatus(taskStatus === BackgroundTaskStatus.Available ? enabled === 'true' ? 'Theo lịch hệ điều hành' : 'Chưa bật' : 'Không khả dụng');
      setLocalSize(JSON.stringify(snapshot).length);
      if (loadRemote && account) setBackups(await listBackups());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Không thể đọc cài đặt đồng bộ.');
    }
  };

  useEffect(() => {
    void loadSettings(true);
  }, []);

  const connectGoogle = async (accessToken: string, expiresIn: number, refreshToken?: string) => {
    setBusy(true);
    setError(null);
    try {
      await storeGoogleTokens(accessToken, expiresIn, refreshToken, selectedClientId ?? 'foodtrack');
      await loadSettings(true);
      Alert.alert('Đã kết nối Google Drive');
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Không thể lưu phiên Google.');
    } finally {
      setBusy(false);
    }
  };

  const getDeviceId = async () => {
    let id = await readSetting('device_id');
    if (!id) {
      id = newId();
      await writeSetting('device_id', id);
    }
    return id;
  };

  const syncNow = async () => {
    try {
      setBusy(true);
      setError(null);
      const result = await synchronizeDrive(await getDeviceId());
      await refresh();
      await loadSettings(true);
      Alert.alert('Đồng bộ xong', result.conflicts
        ? `${result.conflicts} xung đột · giữ bản mới.`
        : 'Đã đồng bộ.');
    } catch (syncError) {
      const message = syncError instanceof Error ? syncError.message : 'Lỗi đồng bộ không xác định.';
      setError(message);
      await writeSetting('last_sync_error', message);
    } finally {
      setBusy(false);
    }
  };

  const makeBackup = async () => {
    try {
      setBusy(true);
      setError(null);
      await createDriveBackup(await getDeviceId());
      await loadSettings(true);
      Alert.alert('Đã sao lưu');
    } catch (backupError) {
      setError(backupError instanceof Error ? backupError.message : 'Không thể tạo bản sao lưu.');
    } finally {
      setBusy(false);
    }
  };

  const restore = (file: BackupFile) => {
    Alert.alert('Khôi phục?', `Thay dữ liệu trên máy bằng bản sao lưu ${new Date(file.modifiedTime).toLocaleString('vi-VN')}?`, [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Khôi phục', style: 'destructive', onPress: () => {
        setBusy(true);
        restoreDriveBackup(file.id).then(async () => {
          await refresh();
          await loadSettings(false);
          Alert.alert('Đã khôi phục');
        }).catch((restoreError: unknown) => setError(restoreError instanceof Error ? restoreError.message : 'Không thể khôi phục bản sao lưu.'))
          .finally(() => setBusy(false));
      } },
    ]);
  };

  const toggleAutoSync = async (enabled: boolean) => {
    if (enabled && !connection) {
      Alert.alert('Kết nối Google Drive trước.');
      return;
    }
    try {
      setBusy(true);
      await setBackgroundSyncEnabled(enabled);
      setAutoSync(enabled);
      setBackgroundStatus(enabled ? 'Theo lịch hệ điều hành' : 'Chưa bật');
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : 'Không thể cấu hình đồng bộ nền.');
    } finally {
      setBusy(false);
    }
  };

  const disconnect = () => {
    Alert.alert('Ngắt kết nối Google Drive?', 'Dữ liệu trên máy vẫn được giữ.', [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Ngắt kết nối', style: 'destructive', onPress: () => {
        setBusy(true);
        disconnectDrive().catch((disconnectError: unknown) => {
          setError(disconnectError instanceof Error ? disconnectError.message : 'Đã ngắt trên thiết bị nhưng không thu hồi được quyền Google.');
        }).finally(async () => {
          setConnection(null);
          setBackups([]);
          if (autoSync) {
            try {
              await setBackgroundSyncEnabled(false);
              setAutoSync(false);
            } catch (syncError) {
              setError(syncError instanceof Error ? syncError.message : 'Đã ngắt Google nhưng không tắt được tác vụ nền.');
            }
          }
          setBusy(false);
        });
      } },
    ]);
  };

  return (
    <Page title="Cài đặt" scroll right={<Pressable onPress={() => router.back()}><Text style={styles.back}>Quay lại</Text></Pressable>}>
      {error ? <ErrorNotice message={error} onDismiss={() => setError(null)} /> : null}
      <Card>
        <View style={common.row}>
          <View style={styles.driveIcon}><Text style={{ color: connection ? colors.success : colors.muted, fontSize: 22 }}>☁</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.accountTitle}>Google Drive</Text>
            <Text style={common.muted}>{connection?.email ?? 'Chưa kết nối'}</Text>
          </View>
          <View style={[styles.status, connection ? styles.connected : styles.offline]}>
            <Text style={[styles.statusText, { color: connection ? colors.success : colors.muted }]}>{connection ? 'Đã kết nối' : 'Offline'}</Text>
          </View>
        </View>
        <View style={styles.metaGrid}>
          <Info label="Đồng bộ gần nhất" value={lastSync ? new Date(lastSync).toLocaleString('vi-VN') : 'Chưa đồng bộ'} />
          <Info label="Dữ liệu trên máy" value={`${(localSize / 1024).toFixed(1)} KB · SQLite`} />
        </View>
        <View style={styles.autoRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.accountTitle}>Đồng bộ nền hằng ngày</Text>
            <Text style={common.muted}>{backgroundStatus}</Text>
          </View>
          <Switch value={autoSync} onValueChange={(value) => void toggleAutoSync(value)} disabled={busy} trackColor={{ true: colors.primary }} />
        </View>
        {connection ? (
          <Button variant="secondary" label="Ngắt kết nối" onPress={disconnect} disabled={busy} />
        ) : oauthConfigured ? (
          <GoogleSignInButton
            busy={busy}
            onConnect={connectGoogle}
            onError={setError}
          />
        ) : (
          <Button label="Đăng nhập bằng Google" onPress={() => undefined} disabled />
        )}
        {!oauthConfigured ? <Text style={styles.warning}>Thiếu OAuth client ID. Cấu hình trong .env.</Text> : null}
      </Card>

      <Card>
        <Text style={styles.sectionHeading}>Đồng bộ</Text>
        <Button label={busy ? 'Đang xử lý…' : 'Đồng bộ ngay'} onPress={() => void syncNow()} disabled={!connection || busy} />
        <Button variant="secondary" label="Sao lưu" onPress={() => void makeBackup()} disabled={!connection || busy} />
      </Card>

      <View style={{ gap: spacing.sm }}>
        <SectionHeading backups={backups.length} onRefresh={() => void loadSettings(true)} />
        {backups.length === 0 ? <EmptyState title={connection ? 'Chưa có bản sao lưu' : 'Chưa kết nối Drive'} /> :
          backups.map((backup) => (
            <Card key={backup.id} style={styles.backupRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.accountTitle}>{new Date(backup.modifiedTime).toLocaleString('vi-VN')}</Text>
                <Text numberOfLines={1} style={common.muted}>{backup.name}{backup.size ? ` · ${(Number(backup.size) / 1024).toFixed(1)} KB` : ''}</Text>
              </View>
              <Button compact variant="secondary" label="Khôi phục" onPress={() => restore(backup)} disabled={busy} />
            </Card>
          ))}
      </View>
    </Page>
  );
}

function GoogleSignInButton({
  busy,
  onConnect,
  onError,
}: {
  busy: boolean;
  onConnect: (accessToken: string, expiresIn: number) => Promise<void>;
  onError: (message: string) => void;
}) {
  const connect = async () => {
    try {
      const result = await signInForDrive();
      if (result) await onConnect(result.accessToken, result.expiresIn);
    } catch (authError) {
      onError(authError instanceof Error ? authError.message : 'Không thể mở đăng nhập Google.');
    }
  };

  return (
    <Button
      label={busy ? 'Đang kết nối…' : 'Đăng nhập bằng Google'}
      onPress={() => void connect()}
      disabled={busy}
    />
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <View style={{ flex: 1, gap: 4 }}><Text style={common.muted}>{label}</Text><Text style={styles.infoValue}>{value}</Text></View>;
}

function SectionHeading({ backups, onRefresh }: { backups: number; onRefresh: () => void }) {
  return (
    <View style={common.row}>
      <Text style={styles.sectionHeading}>Bản sao lưu ({backups})</Text>
      <Pressable onPress={onRefresh}><Text style={styles.back}>Làm mới</Text></Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  back: { color: colors.primary, fontSize: 12, fontWeight: '700', padding: 8 },
  driveIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#F3F4F6' },
  accountTitle: { color: colors.text, fontSize: 12, fontWeight: '700' },
  status: { borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  connected: { borderColor: '#BBF7D0', backgroundColor: '#F0FDF4' },
  offline: { borderColor: colors.border, backgroundColor: '#FFFFFF' },
  statusText: { fontSize: 10, fontWeight: '700' },
  metaGrid: { flexDirection: 'row', gap: spacing.sm, backgroundColor: colors.canvas, padding: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: 6 },
  infoValue: { color: colors.text, fontSize: 11, fontWeight: '700' },
  autoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: spacing.sm },
  warning: { color: colors.primaryPressed, fontSize: 11, lineHeight: 16 },
  sectionHeading: { color: colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  backupRow: { flexDirection: 'row', alignItems: 'center' },
});
