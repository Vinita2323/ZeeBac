import { useEffect, useState } from 'react';
import { SupportAPI } from '../services/api';

// Admin-managed support contacts (Admin → Support Tickets → WhatsApp & Helpline Settings).
// Fetched once per page load and shared by every component that uses this hook.

const FALLBACK = {
  supportPhone: '+919111966732',
  riderSupportPhone: '+919111966732',
  supportWhatsapp: '+919111966732',
  supportEmail: 'support@zeebac.com',
};

let cached = null;
let inflight = null;

const load = () => {
  if (cached) return Promise.resolve(cached);
  if (!inflight) {
    inflight = SupportAPI.getConfig()
      .then((res) => {
        cached = { ...FALLBACK, ...(res?.success && res.data ? res.data : {}) };
        return cached;
      })
      .catch(() => FALLBACK)
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
};

/** Digits-and-plus form for tel: links, e.g. "+91 91119 66732" → "+919111966732" */
export const toTelHref = (phone) => `tel:${String(phone || '').replace(/[^\d+]/g, '')}`;

export default function useSupportConfig() {
  const [config, setConfig] = useState(cached || FALLBACK);

  useEffect(() => {
    let alive = true;
    load().then((c) => {
      if (alive) setConfig(c);
    });
    return () => {
      alive = false;
    };
  }, []);

  return config;
}
