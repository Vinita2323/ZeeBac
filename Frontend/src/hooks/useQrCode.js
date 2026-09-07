import { useState, useEffect, useRef, useCallback } from 'react';
import QRCode from 'qrcode';

// Fetches a signed, short-lived QR token from the backend and renders it
// locally as a data-URI image. The old approach embedded a plaintext,
// non-expiring `zeebac://.../{zeebacId}` string and rendered it via a public
// third-party image API (api.qrserver.com) — fine for a public identifier,
// but wrong once the payload is a live, scannable credential: sending it to
// a third party would leak it, and it never expired. Local rendering +
// auto-refresh shortly before expiry closes both gaps.
//
// `fetchToken` must resolve to `{ data: { token, expiresIn } }` (matches
// VendorAPI.getQrToken / UserAPI.getQrToken). `enabled` lets a caller defer
// fetching until the QR is actually about to be shown (e.g. a modal opening)
// instead of on every page mount.
export default function useQrCode(fetchToken, enabled = true) {
  const [qrImageUrl, setQrImageUrl] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const timerRef = useRef(null);
  const fetchTokenRef = useRef(fetchToken);
  fetchTokenRef.current = fetchToken;

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchTokenRef.current();
      const { token, expiresIn } = res.data;
      const dataUrl = await QRCode.toDataURL(token, {
        width: 320,
        margin: 1,
        color: { dark: '#4a0093', light: '#ffffff' },
      });
      setQrImageUrl(dataUrl);
      clearTimeout(timerRef.current);
      const refreshInMs = Math.max(expiresIn - 30, expiresIn / 2) * 1000;
      timerRef.current = setTimeout(refresh, refreshInMs);
    } catch (err) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    refresh();
    return () => clearTimeout(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, refresh]);

  return { qrImageUrl, isLoading, error, refresh };
}
