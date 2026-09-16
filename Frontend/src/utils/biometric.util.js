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
    if (
      typeof window === 'undefined' ||
      !window.PublicKeyCredential ||
      typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== 'function'
    ) {
      return false;
    }
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch (err) {
    console.warn('[Biometrics] Support check error:', err);
    return false;
  }
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
      return { success: false, error: 'Biometric authentication is not supported or enabled on this device.' };
    }

    const challenge = new Uint8Array(32);
    window.crypto.getRandomValues(challenge);

    const userIdStr = user?._id || user?.id || 'zeebac-user';
    const encoder = new TextEncoder();
    const userIdBuffer = encoder.encode(userIdStr);

    const publicKeyCredentialCreationOptions = {
      challenge,
      rp: {
        name: 'Zeebac Cashback',
        id: window.location.hostname === 'localhost' ? 'localhost' : window.location.hostname,
      },
      user: {
        id: userIdBuffer,
        name: user?.phone || user?.email || 'Customer',
        displayName: user?.name || 'Zeebac Customer',
      },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' },  // ES256
        { alg: -257, type: 'public-key' }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
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
      return { success: false, error: 'Biometric prompt was cancelled or timed out.' };
    }
    return { success: false, error: err.message || 'Failed to register biometrics.' };
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
        // fallback to empty allowCredentials for discoverable
      }
    }

    const publicKeyCredentialRequestOptions = {
      challenge,
      timeout: 60000,
      rpId: window.location.hostname === 'localhost' ? 'localhost' : window.location.hostname,
      userVerification: 'required',
      ...(allowCredentials.length > 0 ? { allowCredentials } : {}),
    };

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
      return { success: false, error: 'Biometric verification cancelled or failed.' };
    }
    return { success: false, error: err.message || 'Biometric authentication error.' };
  }
};
