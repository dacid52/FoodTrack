import { GoogleSignin } from '@react-native-google-signin/google-signin';

const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.appdata'];

let configured = false;

function configureGoogleSignIn() {
  if (configured) return;
  GoogleSignin.configure({
    // webClientId removed — causes DEVELOPER_ERROR on Android release builds
    // The Android OAuth client (registered via google-services.json) is used instead
    iosClientId: IOS_CLIENT_ID,
    scopes: DRIVE_SCOPES,
    offlineAccess: false,
  });
  configured = true;
}

/** Race a promise against a timeout. Rejects with timeoutError if timeout fires first. */
function withTimeout<T>(promise: Promise<T>, ms: number, timeoutError: Error): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(timeoutError), ms)),
  ]);
}

export function getCurrentUserEmail(): string | null {
  try { return GoogleSignin.getCurrentUser()?.user?.email ?? null; } catch { return null; }
}

export function getCurrentUserProfile(): { email?: string; name?: string; photo?: string } | null {
  try {
    const user = GoogleSignin.getCurrentUser();
    if (!user) return null;
    return { email: user.user?.email, name: user.user?.name ?? undefined, photo: user.user?.photo ?? undefined };
  } catch { return null; }
}

export async function signInForDrive(
  _forceNewSession = true,
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number } | null> {
  try {
    console.log('[GoogleSignIn] configure');
    configureGoogleSignIn();
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

    // Sign out first so account picker always appears
    try { await GoogleSignin.signOut(); } catch {}

    console.log('[GoogleSignIn] signIn()');
    const signInResult = await withTimeout(
      GoogleSignin.signIn(),
      60_000,
      new Error('Hết thời gian chờ đăng nhập Google (60s). Vui lòng thử lại.'),
    );

    if (signInResult.type === 'cancelled') return null;
    if (signInResult.type !== 'success') throw new Error('Đăng nhập Google không thành công.');

    const grantedScopes: string[] = signInResult.data?.scopes ?? [];
    console.log('[GoogleSignIn] granted scopes:', grantedScopes);

    // Request Drive scope if not yet in granted list
    const hasDrive = grantedScopes.some(s => s.includes('drive'));
    if (!hasDrive) {
      console.log('[GoogleSignIn] addScopes for drive');
      await withTimeout(
        GoogleSignin.addScopes({ scopes: DRIVE_SCOPES }),
        30_000,
        new Error('Hết thời gian chờ cấp quyền Drive (30s). Vui lòng thử lại.'),
      );
    }

    // Clear cached token so Play Services fetches a fresh one with Drive scope
    try {
      const cached = await GoogleSignin.getTokens();
      if (cached?.accessToken) await GoogleSignin.clearCachedAccessToken(cached.accessToken);
    } catch {}

    console.log('[GoogleSignIn] getTokens()');
    const { accessToken } = await withTimeout(
      GoogleSignin.getTokens(),
      30_000,
      new Error(
        'Không lấy được mã truy cập Google Drive (30s timeout).\n' +
        'Nguyên nhân thường gặp:\n' +
        '• OAuth consent screen đang ở chế độ Testing — cần publish hoặc thêm email vào Test users.\n' +
        '• Truy cập: console.cloud.google.com → APIs & Services → OAuth consent screen → PUBLISH APP',
      ),
    );

    if (!accessToken) throw new Error('Google không trả về access token.');
    console.log('[GoogleSignIn] access token OK, length:', accessToken.length);
    return { accessToken, refreshToken: '', expiresIn: 3600 };
  } catch (err) {
    console.error('[GoogleSignIn] ERROR:', err);
    throw err;
  }
}

export async function getFreshDriveAccessToken(): Promise<string> {
  configureGoogleSignIn();
  if (!GoogleSignin.hasPreviousSignIn()) {
    throw new Error('Phiên Google đã hết hạn. Hãy kết nối lại Google Drive.');
  }
  try { await GoogleSignin.signInSilently(); } catch {}
  try {
    const cached = await GoogleSignin.getTokens();
    if (cached?.accessToken) await GoogleSignin.clearCachedAccessToken(cached.accessToken);
  } catch {}
  const { accessToken } = await withTimeout(
    GoogleSignin.getTokens(),
    20_000,
    new Error('Không làm mới được token Google Drive. Hãy kết nối lại.'),
  );
  if (!accessToken) throw new Error('Google không trả về access token.');
  return accessToken;
}

export async function clearGoogleSignInSession() {
  configureGoogleSignIn();
  if (GoogleSignin.hasPreviousSignIn()) await GoogleSignin.signOut();
}
