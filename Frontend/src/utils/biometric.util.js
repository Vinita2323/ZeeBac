/**
 * WebAuthn Biometric Utility
 * Provides standard W3C WebAuthn platform authenticator verification
 * (Fingerprint / Face ID on Android & iOS, Windows Hello on PC, Touch ID on Mac).
 */

/**
 * Checks if the current browser and device support platform biometrics.
 * @returns {Promise<boolean>}
 */
export const isBiometricSupported = async () => {
  try {
    if (typeof window === 'undefined') return false;

    // WebAuthn requires a secure context (https: or localhost/127.0.0.1)
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (!window.isSecureContext && !isLocalhost) {
      console.warn('[Biometrics] WebAuthn requires a secure context (HTTPS or localhost).');
      return false;
    }

    if (
      !window.PublicKeyCredential ||
      typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== 'function'
    ) {
      return false;
    }

    const available = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    return Boolean(available);
  } catch (err) {
    console.warn('[Biometrics] Support check error:', err);
    return false;
  }
};

/**
 * Helper to check if a hostname is an IP address.
 * WebAuthn spec strictly forbids IP addresses as rp.id / rpId.
 */
const isIpHostname = (hostname) => {
  if (!hostname) return true;
  if (hostname === 'localhost') return false;
  // IPv4 check
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname)) return true;
  // IPv6 check
  if (hostname.includes(':')) return true;
  return false;
};

/**
 * Registers / Enrolls device biometric credential for the user.
 * @param {object} user - Current user object
 * @returns {Promise<{ success: boolean, credentialId?: string, error?: string }>}
 */
export const registerBiometricCredential = async (user) => {
  try {
    const supported = await isBiometricSupported();
    if (!supported) {
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      if (!window.isSecureContext && !isLocalhost) {
        return {
          success: false,
          error: 'Biometrics requires HTTPS. Please access the app over HTTPS to use Fingerprint/Face ID.'
        };
      }
      return { 
        success: false, 
        error: 'Biometric hardware (Fingerprint / Face ID) is not set up or supported on this device.' 
      };
    }

    const challenge = new Uint8Array(32);
    window.crypto.getRandomValues(challenge);

    const userIdStr = user?._id || user?.id || `zeebac_${Date.now()}`;
    const encoder = new TextEncoder();
    const userIdBuffer = encoder.encode(userIdStr);

    const hostname = window.location.hostname;
    const isIp = isIpHostname(hostname);

    const rp = {
      name: 'Zeebac Cashback',
    };
    // WebAuthn: Only specify rp.id if it's a valid domain (not an IP address)
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
        { alg: -7, type: 'public-key' },   // ES256 (P-256)
        { alg: -257, type: 'public-key' }, // RS256
        { alg: -8, type: 'public-key' },   // Ed25519
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'preferred', // 'preferred' allows fingerprint, Face ID, or system lock
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
    return { success: false, error: err.message || 'Failed to register biometrics on this device.' };
  }
};

/**
 * Prompts native device biometric validation (Fingerprint / Face ID).
 * @param {string|null} [credentialId]
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export const verifyBiometricCredential = async (credentialId = null) => {
  try {
    const supported = await isBiometricSupported();
    if (!supported) {
      return { success: false, error: 'Biometrics unavailable on this device.' };
    }

    const challenge = new Uint8Array(32);
    window.crypto.getRandomValues(challenge);

    const allowCredentials = [];
    if (credentialId) {
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
        // fallback to empty allowCredentials for discoverable credentials
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

    // WebAuthn: Only pass rpId if hostname is a valid domain (not an IP address)
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
