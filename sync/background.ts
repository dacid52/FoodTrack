import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { newId } from '../database';
import { readSetting, writeSetting } from '../features/records';
import { getConnection, synchronizeDrive } from './drive';

const TASK_NAME = 'FOODTRACK_DAILY_DRIVE_SYNC';

TaskManager.defineTask(TASK_NAME, async () => {
  try {
    if (await readSetting('auto_sync') !== 'true') return BackgroundTask.BackgroundTaskResult.Success;
    if (!await getConnection()) return BackgroundTask.BackgroundTaskResult.Failed;
    let deviceId = await readSetting('device_id');
    if (!deviceId) {
      deviceId = newId();
      await writeSetting('device_id', deviceId);
    }
    await synchronizeDrive(deviceId);
    await writeSetting('last_sync_error', '');
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Lỗi đồng bộ nền không xác định.';
    console.error('FoodTrack background Drive sync failed', error);
    await writeSetting('last_sync_error', message);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function setBackgroundSyncEnabled(enabled: boolean): Promise<void> {
  const status = await BackgroundTask.getStatusAsync();
  if (enabled && status !== BackgroundTask.BackgroundTaskStatus.Available) {
    throw new Error('Tác vụ nền không khả dụng trên thiết bị này.');
  }
  const registered = await TaskManager.isTaskRegisteredAsync(TASK_NAME);
  if (enabled && !registered) {
    await BackgroundTask.registerTaskAsync(TASK_NAME, { minimumInterval: 24 * 60 });
    try {
      await writeSetting('auto_sync', 'true');
    } catch (error) {
      await BackgroundTask.unregisterTaskAsync(TASK_NAME);
      throw error;
    }
  } else if (enabled) {
    await writeSetting('auto_sync', 'true');
  } else {
    await writeSetting('auto_sync', 'false');
    if (!registered) return;
    await BackgroundTask.unregisterTaskAsync(TASK_NAME);
  }
}

export async function getBackgroundSyncStatus(): Promise<BackgroundTask.BackgroundTaskStatus> {
  return BackgroundTask.getStatusAsync();
}
