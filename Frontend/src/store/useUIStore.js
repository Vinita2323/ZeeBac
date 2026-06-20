import { create } from 'zustand';

// ─── UI Store ───────────────────────────────────────────────────────────────
// Controls global UI elements: Alert Dialog (native modal) and Snackbar (top banner).
// Any component can trigger these from anywhere without prop-drilling.

const useUIStore = create((set) => ({
  // ── Alert Dialog (iOS/Android native-style modal) ──
  alertDialog: {
    isOpen: false,
    title: '',
    message: '',
    buttonText: 'Okay',
    onConfirm: null,
  },

  showAlert: (title, message, buttonText = 'Okay', onConfirm = null) => {
    set({
      alertDialog: {
        isOpen: true,
        title,
        message,
        buttonText,
        onConfirm,
      },
    });
  },

  hideAlert: () => {
    set({
      alertDialog: {
        isOpen: false,
        title: '',
        message: '',
        buttonText: 'Okay',
        onConfirm: null,
      },
    });
  },

  // ── Snackbar / Top Banner (non-intrusive) ──
  snackbar: {
    isOpen: false,
    message: '',
    type: 'success', // 'success' | 'error' | 'info'
  },

  showSnackbar: (message, type = 'success') => {
    set({
      snackbar: {
        isOpen: true,
        message,
        type,
      },
    });

    // Auto-dismiss after 3 seconds
    setTimeout(() => {
      set((state) => ({
        snackbar: { ...state.snackbar, isOpen: false },
      }));
    }, 3000);
  },

  hideSnackbar: () => {
    set({
      snackbar: {
        isOpen: false,
        message: '',
        type: 'success',
      },
    });
  },
}));

export default useUIStore;
