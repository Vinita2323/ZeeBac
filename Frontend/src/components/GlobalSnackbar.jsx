import useUIStore from '../store/useUIStore';

// ─── Global Snackbar / Top Banner ───────────────────────────────────────────
// An iOS-style non-intrusive notification that slides from the top.
// Usage: useUIStore.getState().showSnackbar('Profile saved!', 'success')

export default function GlobalSnackbar() {
  const { snackbar, hideSnackbar } = useUIStore();

  const iconMap = {
    success: 'check_circle',
    error: 'error',
    info: 'info',
  };

  const colorMap = {
    success: { bg: 'bg-green-600', text: 'text-white' },
    error: { bg: 'bg-red-600', text: 'text-white' },
    info: { bg: 'bg-primary', text: 'text-white' },
  };

  const colors = colorMap[snackbar.type] || colorMap.info;

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-[9998] flex justify-center pointer-events-none transition-all duration-300 ease-out ${
        snackbar.isOpen ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'
      }`}
    >
      <div 
        className={`mt-[env(safe-area-inset-top,12px)] mx-4 mt-3 px-4 py-3 rounded-2xl shadow-lg flex items-center gap-3 max-w-[400px] w-full pointer-events-auto ${colors.bg}`}
        onClick={hideSnackbar}
      >
        <span className={`material-symbols-outlined text-[20px] ${colors.text}`}>
          {iconMap[snackbar.type] || 'info'}
        </span>
        <p className={`text-[14px] font-bold flex-1 ${colors.text}`}>
          {snackbar.message}
        </p>
        <button className={`${colors.text} opacity-70 hover:opacity-100 transition-opacity`}>
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>
    </div>
  );
}
