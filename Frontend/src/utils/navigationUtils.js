import { useEffect, useRef } from 'react';

/**
 * Safe navigation back utility.
 * Checks whether browser history exists in the current session.
 * If yes, calls navigate(-1).
 * Otherwise, falls back to the specified fallback route (e.g. '/home') so the app never exits or goes to blank page.
 */
export const safeNavigateBack = (navigate, fallback = '/home') => {
  if (window.history.length > 1 && window.history.state && typeof window.history.state.idx === 'number' && window.history.state.idx > 0) {
    navigate(-1);
  } else {
    navigate(fallback);
  }
};

/**
 * Makes an in-page "subview" swap (e.g. Wallet's Recharge screen, Profile's
 * Edit Profile screen) respond to the browser/hardware back button one step
 * at a time instead of letting that press fall through to the real previous
 * route (which skips the subview and jumps straight past the screen that
 * opened it).
 *
 * Call with the current subview key (or null/undefined when showing the
 * base screen) and the setter that closes it. Pair every on-screen "back"
 * button inside the subview with `window.history.back()` (not the setter
 * directly) so the UI state and browser history never drift apart.
 */
export const useBackableSubview = (subView, setSubView) => {
  const isOpenRef = useRef(false);

  useEffect(() => {
    if (subView) {
      isOpenRef.current = true;
      window.history.pushState({ __subview: subView }, '');
    } else {
      isOpenRef.current = false;
    }
  }, [subView]);

  useEffect(() => {
    const handlePopState = () => {
      if (isOpenRef.current) {
        isOpenRef.current = false;
        setSubView(null);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [setSubView]);
};
