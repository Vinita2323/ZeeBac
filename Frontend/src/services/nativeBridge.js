/**
 * Native Bridge for ZeeBac (WebView <-> Flutter Native Shell)
 *
 * Provides a validated bridge between the React frontend and the Flutter mobile wrapper.
 * Interacts with `flutter_inappwebview` handlers exposed by Flutter:
 *   - checkDeviceAuthSupport(): detects platform biometric/device auth availability & enrolled types
 *   - authenticateDevice(options): invokes native BiometricPrompt (Android) or LocalAuthentication (iOS)
 *   - setAuthContext(payload): persists sensitive session tokens securely into FlutterSecureStorage (Keychain/EncryptedSharedPreferences)
 *   - clearAuthContext(): clears native secure storage on logout
 *   - getAuthContext(): retrieves stored session context
 *
 * Degrades seamlessly when running in a standard mobile/desktop browser without a native shell.
 */

export function hasNativeShell() {
  if (typeof window === 'undefined') return false;
  return Boolean(
    window.flutter_inappwebview?.callHandler ||
      window.ReactNativeWebView?.postMessage ||
      window.NativeBridge
  );
}

/**
 * Invoke a native handler via Flutter InAppWebView JavaScript Handler.
 * Returns null if no native shell is present.
 */
export async function callNative(handler, payload = {}) {
  if (typeof window === 'undefined' || !handler) return null;

  // 1) Flutter InAppWebView (primary maintained container)
  try {
    if (typeof window.flutter_inappwebview?.callHandler === 'function') {
      return await window.flutter_inappwebview.callHandler(handler, payload);
    }
  } catch (err) {
    console.warn(`[NativeBridge] Error calling handler "${handler}":`, err);
  }

  // 2) Plain Android JavascriptInterface fallback
  try {
    const fn = window.NativeBridge?.[handler];
    if (typeof fn === 'function') {
      const res = fn.call(window.NativeBridge, JSON.stringify(payload));
      return typeof res === 'string' ? JSON.parse(res) : res;
    }
  } catch (err) {
    console.warn(`[NativeBridge] Fallback Android bridge error:`, err);
  }

  return null;
}

/**
 * Query native device biometric & credential capabilities.
 * @returns {Promise<{
 *   isNative: boolean,
 *   canCheckBiometrics: boolean,
 *   isDeviceSupported: boolean,
 *   enrolledBiometrics: string[], // e.g. ['fingerprint', 'face']
 *   hasEnrolledBiometrics: boolean,
 *   hasDeviceCredentialFallback: boolean
 * }>}
 */
export async function getNativeDeviceAuthSupport() {
  if (!hasNativeShell()) {
    return {
      isNative: false,
      canCheckBiometrics: false,
      isDeviceSupported: false,
      enrolledBiometrics: [],
      hasEnrolledBiometrics: false,
      hasDeviceCredentialFallback: false,
    };
  }

  const result = await callNative('checkDeviceAuthSupport');
  if (result && typeof result === 'object') {
    return {
      isNative: true,
      canCheckBiometrics: Boolean(result.canCheckBiometrics),
      isDeviceSupported: Boolean(result.isDeviceSupported),
      enrolledBiometrics: Array.isArray(result.enrolledBiometrics) ? result.enrolledBiometrics : [],
      hasEnrolledBiometrics: Boolean(result.hasEnrolledBiometrics),
      hasDeviceCredentialFallback: Boolean(result.hasDeviceCredentialFallback),
    };
  }

  return {
    isNative: true,
    canCheckBiometrics: false,
    isDeviceSupported: false,
    enrolledBiometrics: [],
    hasEnrolledBiometrics: false,
    hasDeviceCredentialFallback: false,
  };
}

/**
 * Trigger native device authentication (Fingerprint / Face ID / Device Passcode).
 * React NEVER declares success without native verification; the result is returned by the native OS prompt.
 *
 * @param {object} options
 * @param {string} [options.reason] Prompt message (e.g. "Authenticate to unlock ZeeBac")
 * @param {boolean} [options.biometricOnly] If false, allows device PIN/pattern/password fallback
 * @param {boolean} [options.stickyAuth] Retries prompt upon temporary failure
 * @returns {Promise<{
 *   success: boolean,
 *   authenticated: boolean,
 *   code?: string, // 'SUCCESS' | 'CANCELLED' | 'FAILED' | 'NOT_ENROLLED' | 'NOT_AVAILABLE'
 *   error?: string
 * }>}
 */
export async function authenticateNativeDevice({
  reason = 'Authenticate to access ZeeBac',
  biometricOnly = false,
  stickyAuth = true,
} = {}) {
  if (!hasNativeShell()) {
    return {
      success: false,
      authenticated: false,
      code: 'NO_NATIVE_SHELL',
      error: 'Native shell not detected',
    };
  }

  try {
    const res = await callNative('authenticateDevice', {
      reason,
      biometricOnly,
      stickyAuth,
    });

    if (res && typeof res === 'object') {
      return {
        success: Boolean(res.authenticated || res.success),
        authenticated: Boolean(res.authenticated || res.success),
        code: res.code || (res.authenticated ? 'SUCCESS' : 'FAILED'),
        error: res.error,
      };
    }

    return {
      success: false,
      authenticated: false,
      code: 'FAILED',
      error: 'Authentication failed',
    };
  } catch (err) {
    return {
      success: false,
      authenticated: false,
      code: 'EXCEPTION',
      error: err?.message || 'Authentication error occurred',
    };
  }
}

/**
 * Synchronize authentication context with native secure storage.
 * Stores tokens into Android Keystore / iOS Keychain. Never passes raw PINs or biometrics!
 */
export async function syncNativeAuthContext({ role, accessToken, refreshToken, userId }) {
  if (!hasNativeShell()) return;
  await callNative('setAuthContext', {
    role,
    accessToken,
    refreshToken,
    userId,
    timestamp: Date.now(),
  });
}

/**
 * Clear native secure tokens upon logout.
 */
export async function clearNativeAuthContext() {
  if (!hasNativeShell()) return;
  await callNative('clearAuthContext');
}
