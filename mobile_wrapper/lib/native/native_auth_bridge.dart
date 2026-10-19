import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:local_auth/local_auth.dart';
import 'package:local_auth/error_codes.dart' as auth_error;

/// Native Authentication Bridge for ZeeBac
/// Handles BiometricPrompt (Android), LocalAuthentication (iOS), and Hardware Secure Storage.
class NativeAuthBridge {
  NativeAuthBridge._internal();
  static final NativeAuthBridge instance = NativeAuthBridge._internal();

  final LocalAuthentication _localAuth = LocalAuthentication();

  final FlutterSecureStorage _secureStorage = const FlutterSecureStorage(
    aOptions: AndroidOptions(
      encryptedSharedPreferences: true,
      resetOnError: true,
    ),
    iOptions: IOSOptions(
      accessibility: KeychainAccessibility.first_unlock,
    ),
  );

  InAppWebViewController? _webViewController;

  /// Attach the WebView controller and register JavaScript handlers
  void attachWebView(InAppWebViewController controller) {
    _webViewController = controller;

    // 1. Check device biometric & credential capabilities
    controller.addJavaScriptHandler(
      handlerName: 'checkDeviceAuthSupport',
      callback: (args) async {
        return await checkDeviceAuthSupport();
      },
    );

    // 2. Trigger native authentication prompt
    controller.addJavaScriptHandler(
      handlerName: 'authenticateDevice',
      callback: (args) async {
        final Map<String, dynamic> params = args.isNotEmpty && args[0] is Map
            ? Map<String, dynamic>.from(args[0] as Map)
            : <String, dynamic>{};

        final String reason = params['reason'] as String? ?? 'Authenticate to access ZeeBac';
        final bool biometricOnly = params['biometricOnly'] as bool? ?? false;
        final bool stickyAuth = params['stickyAuth'] as bool? ?? true;

        return await authenticateDevice(
          localizedReason: reason,
          biometricOnly: biometricOnly,
          stickyAuth: stickyAuth,
        );
      },
    );

    // 3. Securely store auth context (tokens) into Keystore / Keychain
    controller.addJavaScriptHandler(
      handlerName: 'setAuthContext',
      callback: (args) async {
        if (args.isEmpty || args[0] is! Map) return false;
        final Map<String, dynamic> context = Map<String, dynamic>.from(args[0] as Map);
        await saveAuthContext(context);
        return true;
      },
    );

    // 4. Retrieve stored auth context
    controller.addJavaScriptHandler(
      handlerName: 'getAuthContext',
      callback: (args) async {
        return await getAuthContext();
      },
    );

    // 5. Clear stored tokens on logout
    controller.addJavaScriptHandler(
      handlerName: 'clearAuthContext',
      callback: (args) async {
        await clearAuthContext();
        return true;
      },
    );
  }

  /// Detect whether device authentication is available and enrolled.
  /// Identifies hardware presence, enrolled biometrics (Fingerprint, Face ID),
  /// and device PIN/pattern/passcode availability.
  Future<Map<String, dynamic>> checkDeviceAuthSupport() async {
    try {
      final bool canCheckBiometrics = await _localAuth.canCheckBiometrics;
      final bool isDeviceSupported = await _localAuth.isDeviceSupported();
      final List<BiometricType> availableBiometrics =
          await _localAuth.getAvailableBiometrics();

      final List<String> enrolledTypes = [];
      for (final type in availableBiometrics) {
        if (type == BiometricType.fingerprint || type == BiometricType.strong) {
          enrolledTypes.add('fingerprint');
        } else if (type == BiometricType.face) {
          enrolledTypes.add('face');
        } else if (type == BiometricType.iris) {
          enrolledTypes.add('iris');
        }
      }

      return {
        'isNative': true,
        'canCheckBiometrics': canCheckBiometrics,
        'isDeviceSupported': isDeviceSupported,
        'enrolledBiometrics': enrolledTypes,
        'hasEnrolledBiometrics': enrolledTypes.isNotEmpty,
        'hasDeviceCredentialFallback': isDeviceSupported,
      };
    } catch (e) {
      debugPrint('[NativeAuthBridge] checkDeviceAuthSupport error: $e');
      return {
        'isNative': true,
        'canCheckBiometrics': false,
        'isDeviceSupported': false,
        'enrolledBiometrics': <String>[],
        'hasEnrolledBiometrics': false,
        'hasDeviceCredentialFallback': false,
        'error': e.toString(),
      };
    }
  }

  /// Execute native device authentication via local_auth
  /// Displays the OS-level system prompt.
  /// If biometricOnly = false, uses phone PIN/pattern/passcode as fallback.
  Future<Map<String, dynamic>> authenticateDevice({
    required String localizedReason,
    bool biometricOnly = false,
    bool stickyAuth = true,
  }) async {
    try {
      final bool isSupported = await _localAuth.isDeviceSupported();
      if (!isSupported) {
        return {
          'success': false,
          'authenticated': false,
          'code': 'NOT_SUPPORTED',
          'error': 'Device does not support authentication.',
        };
      }

      final bool didAuthenticate = await _localAuth.authenticate(
        localizedReason: localizedReason,
        options: AuthenticationOptions(
          biometricOnly: biometricOnly,
          stickyAuth: stickyAuth,
          useErrorDialogs: true,
          sensitiveTransaction: true,
        ),
      );

      return {
        'success': didAuthenticate,
        'authenticated': didAuthenticate,
        'code': didAuthenticate ? 'SUCCESS' : 'CANCELLED_OR_FAILED',
        'error': didAuthenticate ? null : 'Authentication not completed.',
      };
    } on PlatformException catch (e) {
      debugPrint('[NativeAuthBridge] PlatformException code: ${e.code}, msg: ${e.message}');
      String errorCode = 'UNKNOWN';
      String errorMessage = e.message ?? 'Authentication error';

      switch (e.code) {
        case auth_error.notAvailable:
          errorCode = 'NOT_AVAILABLE';
          errorMessage = 'Biometric authentication is not available on this device.';
          break;
        case auth_error.notEnrolled:
          errorCode = 'NOT_ENROLLED';
          errorMessage = 'No biometrics or screen lock enrolled. Please configure in device settings.';
          break;
        case auth_error.lockedOut:
          errorCode = 'LOCKED_OUT';
          errorMessage = 'Too many failed attempts. Biometrics temporarily locked.';
          break;
        case auth_error.permanentlyLockedOut:
          errorCode = 'PERMANENTLY_LOCKED_OUT';
          errorMessage = 'Biometrics permanently locked. Use your device credentials or PIN.';
          break;
        case auth_error.passcodeNotSet:
          errorCode = 'PASSCODE_NOT_SET';
          errorMessage = 'Device passcode is not set.';
          break;
        default:
          errorCode = e.code;
      }

      return {
        'success': false,
        'authenticated': false,
        'code': errorCode,
        'error': errorMessage,
      };
    } catch (e) {
      debugPrint('[NativeAuthBridge] Generic error: $e');
      return {
        'success': false,
        'authenticated': false,
        'code': 'EXCEPTION',
        'error': e.toString(),
      };
    }
  }

  /// Store tokens securely into hardware-backed Keystore/Keychain.
  /// NEVER store raw PINs or biometrics!
  Future<void> saveAuthContext(Map<String, dynamic> context) async {
    final String raw = jsonEncode(context);
    await _secureStorage.write(key: 'zeebac_auth_context', value: raw);
    if (context['role'] != null) {
      await _secureStorage.write(
        key: 'zeebac_${context['role']}_token',
        value: context['accessToken'] as String? ?? '',
      );
    }
  }

  /// Read stored auth context
  Future<Map<String, dynamic>?> getAuthContext() async {
    final String? raw = await _secureStorage.read(key: 'zeebac_auth_context');
    if (raw == null || raw.isEmpty) return null;
    try {
      return Map<String, dynamic>.from(jsonDecode(raw) as Map);
    } catch (_) {
      return null;
    }
  }

  /// Clear secure storage on logout
  Future<void> clearAuthContext() async {
    await _secureStorage.deleteAll();
  }

  /// Notify web app of native event (e.g. lifecycle changes, deep links)
  void notifyWeb(String eventName, [Map<String, dynamic>? data]) {
    if (_webViewController == null) return;
    final String payload = jsonEncode(data ?? {});
    _webViewController!.evaluateJavascript(
      source: "window.dispatchEvent(new CustomEvent('$eventName', { detail: $payload }));",
    );
  }
}
