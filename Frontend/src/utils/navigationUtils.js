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
