/**
 * Biometric & Device Authentication Utility
 *
 * Supports:
 * 1. Native Mobile Wrapper (Flutter local_auth via Native Bridge):
 *    Directly authenticates using phone-level enrolled biometrics (Fingerprint / Face ID)
 *    and device credentials (PIN/Pattern/Password fallback) WITHOUT requiring users to
 *    manually register or create a credential inside ZeeBac.
 *
 * 2. Standard Web Browser (W3C WebAuthn platform authenticator fallback):
 *    Maintained for browser users on supported platforms.
 */

import {
  hasNativeShell,
  getNativeDeviceAuthSupport,
  authenticateNativeDevice,
} from '../services/nativeBridge';

/**
 * Checks biometric and device authentication support.
 * In a native Flutter container, directly checks device hardware & enrollment via local_auth.
 * In a browser, checks W3C WebAuthn platform authenticator availability.
 *
 * @returns {Promise<{
 *   supported: boolean,
 *   isNative?: boolean,
 *   enrolledBiometrics?: string[],
 *   hasDeviceCredentialFallback?: boolean,
 *   reason: string|null,
 *   detail?: string
 * }>}
 */
export const getBiometricSupportStatus = async () => {
  try {
    // 1. Check Native Flutter Wrapper first
    if (hasNativeShell()) {
      const nativeStatus = await getNativeDeviceAuthSupport();
      if (nativeStatus.isNative) {
        if (nativeStatus.isDeviceSupported && (nativeStatus.hasEnrolledBiometrics || nativeStatus.hasDeviceCredentialFallback)) {
          return {
            supported: true,
            isNative: true,
            enrolledBiometrics: nativeStatus.enrolledBiometrics,
            hasDeviceCredentialFallback: nativeStatus.hasDeviceCredentialFallback,
            reason: null,
          };
        }
        if (nativeStatus.isDeviceSupported && !nativeStatus.hasEnrolledBiometrics) {
          return {
            supported: false,
            isNative: true,
            reason: 'not_enrolled',
            detail: 'No biometric or device screen lock enrolled on this device.',
          };
        }
        return {
          supported: false,
          isNative: true,
          reason: 'no_hardware',
          detail: 'Biometric hardware is not available on this device.',
        };
      }
    }

    // 2. Web Browser Fallback (WebAuthn)
    if (typeof window === 'undefined') return { supported: false, reason: 'no_window' };

    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (!window.isSecureContext && !isLocalhost) {
      return { supported: false, reason: 'insecure_context' };
    }

    if (!window.PublicKeyCredential) {
      return { supported: false, reason: 'no_webauthn_api' };
    }
    if (typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') {
      return { supported: false, reason: 'no_platform_check_api' };
    }

    const available = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    if (!available) {
      return { supported: false, reason: 'no_platform_authenticator' };
    }

    return { supported: true, isNative: false, reason: null };
  } catch (err) {
    return { supported: false, reason: 'exception', detail: err?.message };
  }
};

/**
 * Checks if the current environment supports device biometrics.
 * @returns {Promise<boolean>}
 */
export const isBiometricSupported = async () => (await getBiometricSupportStatus()).supported;

/**
 * Translates an unsupported status reason code into user-friendly copy.
 */
export const describeBiometricUnsupportedReason = (reason, detail) => {
  switch (reason) {
    case 'not_enrolled':
      return 'No fingerprint, Face ID, or screen lock is registered on your phone. Please set one up in phone Settings, or use your Security PIN.';
    case 'no_hardware':
      return 'Biometric sensor is not available on this device. You can use your Security PIN instead.';
    case 'insecure_context':
      return 'Biometrics requires a secure HTTPS connection. Please reopen Zeebac at https://zeebac.com.';
    case 'no_webauthn_api':
    case 'no_platform_check_api':
      return "This browser doesn't support biometric login. Open zeebac.com directly in Chrome or Safari, or use the mobile app.";
    case 'no_platform_authenticator':
      return "Your phone's biometric hardware is not accessible from this browser. Use your Security PIN, or open in the official ZeeBac App.";
    case 'exception':
      return `Biometric check failed${detail ? `: ${detail}` : ''}. Secured with your Security PIN instead.`;
    default:
      return 'Biometric hardware (Fingerprint / Face ID) is not set up or supported on this device.';
  }
};

/**
 * Helper to check if a hostname is an IP address.
 */
const isIpHostname = (hostname) => {
  if (!hostname) return true;
  if (hostname === 'localhost') return false;
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname)) return true;
  if (hostname.includes(':')) return true;
  return false;
};

/**
 * Enables device biometric credential for the user.
 * Note: Under the native Flutter shell, users do NOT need to register a separate ZeeBac fingerprint.
 * Their existing phone credentials are used directly!
 *
 * @param {object} user - Current user object
 * @returns {Promise<{ success: boolean, credentialId?: string, error?: string }>}
 */
export const registerBiometricCredential = async (user) => {
  try {
    const status = await getBiometricSupportStatus();
    if (!status.supported) {
      return { success: false, error: describeBiometricUnsupportedReason(status.reason, status.detail) };
    }

    // In Native Shell: Authenticate once to verify enrollment, no registration ceremony required!
    if (status.isNative) {
      const auth = await authenticateNativeDevice({
        reason: 'Verify biometric security to enable quick access',
        biometricOnly: false,
      });
      if (auth.success) {
        return { success: true, credentialId: 'native_device_enrolled' };
      }
      return { success: false, error: auth.error || 'Device authentication was cancelled.' };
    }

    // Browser WebAuthn Registration Fallback
    const challenge = new Uint8Array(32);
    window.crypto.getRandomValues(challenge);

    const userIdStr = user?._id || user?.id || `zeebac_${Date.now()}`;
    const encoder = new TextEncoder();
    const userIdBuffer = encoder.encode(userIdStr);

    const hostname = window.location.hostname;
    const isIp = isIpHostname(hostname);

    const rp = { name: 'Zeebac Cashback' };
    if (!isIp && hostname) {
      rp.id = hostname;
    }

    const publicKeyCredentialCreationOptions = {
      challenge,
      rp,
      user: {
        id: userIdBuffer,
        name: user?.phone || user?.email || 'Zeebac Member',
        displayName: user?.name || user?.storeName || 'Zeebac User',
      },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' },
        { alg: -257, type: 'public-key' },
        { alg: -8, type: 'public-key' },
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'preferred',
        residentKey: 'discouraged',
      },
      timeout: 60000,
      attestation: 'none',
    };

    const credential = await navigator.credentials.create({
      publicKey: publicKeyCredentialCreationOptions,
    });

    if (credential) {
      const rawId = credential.rawId ? btoa(String.fromCharCode(...new Uint8Array(credential.rawId))) : credential.id;
      return { success: true, credentialId: rawId };
    }

    return { success: false, error: 'Could not create biometric credential' };
  } catch (err) {
    console.error('[Biometrics] Registration error:', err);
    if (err.name === 'NotAllowedError') {
      return { success: false, error: 'Biometric scan was cancelled or timed out.' };
    }
    if (err.name === 'InvalidStateError') {
      return { success: false, error: 'This device is already registered for biometrics.' };
    }
    if (err.name === 'SecurityError') {
      return { success: false, error: 'Security constraint: Please access via a valid domain with HTTPS.' };
    }
    return { success: false, error: err.message || 'Failed to enable biometrics on this device.' };
  }
};

/**
 * Prompts native device biometric validation (Fingerprint / Face ID / Phone PIN fallback).
 *
 * @param {string|null} [credentialId]
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export const verifyBiometricCredential = async (credentialId = null) => {
  try {
    const status = await getBiometricSupportStatus();
    if (!status.supported) {
      return { success: false, error: describeBiometricUnsupportedReason(status.reason, status.detail) };
    }

    // 1. Native Flutter Wrapper Path (uses phone biometrics / device PIN directly)
    if (status.isNative) {
      const auth = await authenticateNativeDevice({
        reason: 'Authenticate to access ZeeBac',
        biometricOnly: false, // Allows device PIN/pattern/passcode fallback
        stickyAuth: true,
      });

      if (auth.success) {
        return { success: true };
      }
      return {
        success: false,
        error: auth.error || (auth.code === 'CANCELLED' ? 'Authentication cancelled' : 'Authentication failed. Please try again or use your PIN.'),
      };
    }

    // 2. Browser WebAuthn Verification Fallback
    const challenge = new Uint8Array(32);
    window.crypto.getRandomValues(challenge);

    const allowCredentials = [];
    if (credentialId && credentialId !== 'native_device_enrolled') {
      try {
        const binStr = atob(credentialId);
        const len = binStr.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binStr.charCodeAt(i);
        }
        allowCredentials.push({
          id: bytes.buffer,
          type: 'public-key',
        });
      } catch {
        // Fallback to empty allowCredentials for discoverable credentials
      }
    }

    const hostname = window.location.hostname;
    const isIp = isIpHostname(hostname);

    const publicKeyCredentialRequestOptions = {
      challenge,
      timeout: 60000,
      userVerification: 'preferred',
      ...(allowCredentials.length > 0 ? { allowCredentials } : {}),
    };

    if (!isIp && hostname) {
      publicKeyCredentialRequestOptions.rpId = hostname;
    }

    const assertion = await navigator.credentials.get({
      publicKey: publicKeyCredentialRequestOptions,
    });

    if (assertion) {
      return { success: true };
    }
    return { success: false, error: 'Biometric verification failed.' };
  } catch (err) {
    console.error('[Biometrics] Verification error:', err);
    if (err.name === 'NotAllowedError') {
      return { success: false, error: 'Biometric verification cancelled or timed out.' };
    }
    return { success: false, error: err.message || 'Biometric authentication error.' };
  }
};
