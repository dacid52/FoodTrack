import { Asset } from 'expo-asset';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, BackHandler, KeyboardAvoidingView, Platform, Pressable, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import WebView, { type WebViewMessageEvent } from 'react-native-webview';

import { handleNativeBridgeRequest, isBridgeWrite, isNativeBridgeMethod } from '../features/nativeBridge';
import { colors } from '../theme/tokens';

type BridgeRequest = {
  id: string;
  method: string;
  payload: unknown;
};

type BridgeResponse =
  | { id: string; status: 'success'; data: unknown }
  | { id: string; status: 'error'; error: { message: string } };

const MAX_MESSAGE_LENGTH = 8_000_000;

export function FoodTrackWebView() {
  const webView = useRef<WebView<{}>>(null);
  const writeQueue = useRef<Promise<void>>(Promise.resolve());
  const pendingRequests = useRef(new Set<string>());
  const [htmlUri, setHtmlUri] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  // Android WebView bug: DOM updates injected via evaluateJavascript do not
  // invalidate the native view, so the screen stays stale until the user
  // touches it. Bumping this tick changes a style prop by an imperceptible
  // amount, forcing the native WebView to redraw and pick up the new frame.
  const [repaintTick, setRepaintTick] = useState(0);

  useEffect(() => {
    let active = true;
    const asset = Asset.fromModule(require('../assets/foodtrack/index.html'));
    void asset.downloadAsync().then(() => {
      if (!asset.localUri) throw new Error('Không tìm thấy giao diện HaFood đã đóng gói.');
      if (active) {
        setLoadError(null);
        setHtmlUri(asset.localUri);
      }
    }).catch((error: unknown) => {
      if (active) setLoadError(error instanceof Error ? error.message : 'Không thể mở giao diện HaFood.');
    });
    return () => { active = false; };
  }, [retry]);

  const isInitialMount = useRef(true);

  useFocusEffect(useCallback(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    webView.current?.injectJavaScript('window.FoodTrack && window.FoodTrack.refresh(); true;');
  }, []));

  // Làm mới dữ liệu & câu chào/ngày hiện tại khi mở lại app từ nền (ví dụ qua ngày mới)
  useEffect(() => {
    let lastState = AppState.currentState;
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (lastState !== 'active' && nextState === 'active') {
        webView.current?.injectJavaScript('window.FoodTrack && window.FoodTrack.refresh(); true;');
      }
      lastState = nextState;
    });
    return () => subscription.remove();
  }, []);

  // Chặn nút Back / vuốt cạnh trên Android để đóng modal, lùi về Tổng quan, hoặc nhấn 2 lần mới thoát app
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!webView.current) return false;
      webView.current.injectJavaScript('window.__ftHandleHardwareBack && window.__ftHandleHardwareBack(); true;');
      setRepaintTick((tick) => tick + 1);
      return true;
    });
    return () => subscription.remove();
  }, []);

  const respond = useCallback((response: BridgeResponse) => {
    const serialized = JSON.stringify(response).replace(/[<\u2028\u2029]/g, (character) => {
      if (character === '<') return '\\u003c';
      return character === '\u2028' ? '\\u2028' : '\\u2029';
    });
    webView.current?.injectJavaScript(`window.__foodTrackResolve(${serialized}); true;`);
    setRepaintTick((tick) => tick + 1);
  }, []);

  const handleMessage = useCallback(async (event: WebViewMessageEvent) => {
    const message = event.nativeEvent.data;

    let request: BridgeRequest | undefined;
    try {
      if (message.length > MAX_MESSAGE_LENGTH) throw new Error('Yêu cầu vượt quá dung lượng cho phép.');
      const value: unknown = JSON.parse(message);
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Yêu cầu từ giao diện không hợp lệ.');
      }
      const candidate = value as Record<string, unknown>;
      if (candidate.method === 'app.exit') {
        BackHandler.exitApp();
        return;
      }
      if (typeof candidate.id !== 'string' || !/^ft-[a-z0-9-]{1,90}$/.test(candidate.id)) {
        throw new Error('Mã yêu cầu không hợp lệ.');
      }
      if (pendingRequests.current.has(candidate.id)) return;
      request = {
        id: candidate.id,
        method: typeof candidate.method === 'string' ? candidate.method : '',
        payload: candidate.payload,
      };
      if (!request.method || request.method.length > 80) {
        throw new Error('Tên yêu cầu không hợp lệ.');
      }
      if (JSON.stringify(candidate.payload ?? {}).length > MAX_MESSAGE_LENGTH) {
        throw new Error('Dữ liệu yêu cầu vượt quá dung lượng cho phép.');
      }
      pendingRequests.current.add(request.id);
    } catch (error) {
      if (request) {
        respond({
          id: request.id,
          status: 'error',
          error: { message: error instanceof Error ? error.message : 'Yêu cầu không hợp lệ.' },
        });
      }
      return;
    }

    const receiveTime = Date.now();
    const processRequest = async () => {
      const waitTime = Date.now() - receiveTime;
      const t0 = Date.now();
      try {
        if (!request || !isNativeBridgeMethod(request.method)) {
          throw new Error('Yêu cầu không nằm trong danh sách bridge được phép.');
        }
        const data = await handleNativeBridgeRequest(request.method, request.payload);
        const execTime = Date.now() - t0;
        respond({ id: request.id, status: 'success', data });
        console.log(`[FT-BRIDGE-TIMING] ${request.method} -> waitQueue: ${waitTime}ms, execute: ${execTime}ms`);
      } catch (error) {
        const execTime = Date.now() - t0;
        respond({
          id: request?.id ?? '',
          status: 'error',
          error: { message: error instanceof Error ? error.message : 'Không thể xử lý yêu cầu.' },
        });
        console.log(`[FT-BRIDGE-TIMING-ERROR] ${request?.method} -> ${error instanceof Error ? error.stack || error.message : String(error)}`);
      } finally {
        if (request) pendingRequests.current.delete(request.id);
      }
    };

    if (request && isBridgeWrite(request.method)) {
      const next = writeQueue.current.catch(() => undefined).then(processRequest);
      writeQueue.current = next;
      await next;
    } else {
      await processRequest();
    }
  }, [respond]);

  if (!htmlUri || loadError) {
    return (
      <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.canvas }}>
        {loadError ? (
          <>
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700', textAlign: 'center' }}>Không mở được giao diện HaFood</Text>
            <Text style={{ color: colors.faint, marginTop: 8, textAlign: 'center' }}>{loadError}</Text>
            <Pressable onPress={() => { setHtmlUri(null); setLoadError(null); setRetry((current) => current + 1); }} style={{ marginTop: 20, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12, backgroundColor: colors.primary }}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>Thử lại</Text>
            </Pressable>
          </>
        ) : <ActivityIndicator color={colors.primary} />}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fbfbf9' }} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <WebView<{}>
          ref={webView}
          source={{ uri: htmlUri }}
          style={{ flex: 1, backgroundColor: repaintTick % 2 === 0 ? '#fbfbf9' : '#fbfbfa' }}
          originWhitelist={['file://*', 'about:blank']}
          onShouldStartLoadWithRequest={(request) => request.url.startsWith('file://') || request.url === 'about:blank'}
          onMessage={(event) => { void handleMessage(event); }}
          onError={(event) => setLoadError(event.nativeEvent.description || 'Không thể tải giao diện HaFood.')}
          javaScriptEnabled
          domStorageEnabled
          cacheEnabled={false}
          allowFileAccess
          allowFileAccessFromFileURLs
          allowingReadAccessToURL={htmlUri}
          mixedContentMode="never"
          setSupportMultipleWindows={false}
          allowsBackForwardNavigationGestures={false}
          keyboardDisplayRequiresUserAction={false}
          hideKeyboardAccessoryView
          androidLayerType="hardware"
          overScrollMode="never"
          forceDarkOn={false}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
