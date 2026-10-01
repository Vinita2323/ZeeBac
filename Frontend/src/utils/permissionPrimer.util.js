import { useEffect } from 'react';
import { create } from 'zustand';

// Several permission primers can become eligible to show at the same moment
// (e.g. notification + location both decide to prompt right after login).
// This gate ensures only one explainer card is ever on screen at a time.
//
// Priority matters: React fires a CHILD component's effects before its
// PARENT's on mount, so a page-level primer (e.g. Home's location card)
// would otherwise win the race against App's data-consent card just by
// running first. Lower `priority` number = higher precedence and can
// preempt a lower-precedence holder that already grabbed the gate.
export const usePrimerGate = create((set, get) => ({
  activeKey: null,
  activePriority: Infinity,
  acquire: (key, priority = 0) => {
    const { activeKey, activePriority } = get();
    if (activeKey === null || activeKey === key || priority < activePriority) {
      set({ activeKey: key, activePriority: priority });
      return true;
    }
    return false;
  },
  release: (key) => {
    if (get().activeKey === key) set({ activeKey: null, activePriority: Infinity });
  },
}));

export const PRIMER_PRIORITY = {
  data_consent: 0,
  notifications: 1,
  location: 2,
  camera: 3,
};

/**
 * Claims the shared primer gate for `key` whenever `eligible` is true, and
 * returns whether this key currently holds it (i.e. whether to render the
 * card). Automatically retries as the gate frees up or priorities shift —
 * callers still own calling `release(key)` once the user actually responds.
 */
export function usePrimerSlot(key, priority, eligible) {
  const gateActiveKey = usePrimerGate((s) => s.activeKey);

  useEffect(() => {
    if (eligible) usePrimerGate.getState().acquire(key, priority);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gateActiveKey, eligible, key, priority]);

  return gateActiveKey === key;
}

// Tracks which permission "explainer" cards have already been shown on this
// device, so we ask once with context instead of nagging on every visit.
const PREFIX = 'zeebac_permission_primer_';

export const hasSeenPrimer = (key) => {
  try {
    return localStorage.getItem(`${PREFIX}${key}`) === '1';
  } catch {
    return false;
  }
};

export const markPrimerSeen = (key) => {
  try {
    localStorage.setItem(`${PREFIX}${key}`, '1');
  } catch {
    // Ignore storage errors (private browsing, quota, etc.)
  }
};
