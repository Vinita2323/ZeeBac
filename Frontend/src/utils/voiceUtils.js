// ─── Voice & Audio Notification Utility ─────────────────────────────────────
// Uses Web Audio API for chime alerts + Web Speech API for voice announcements

let audioCtx = null;

const getAudioContext = () => {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
};

// Play a pleasant chime tone like payment soundboxes
export const playNotificationChime = (type = 'incoming') => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'success') {
      // Pleasant rising chord for success
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.1); // E5
      osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.2); // G5
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.45);
      osc.start(now);
      osc.stop(now + 0.45);
    } else {
      // Alert chime for incoming request / OTP
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.exponentialRampToValueAtTime(880.0, now + 0.12); // A5
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
      osc.start(now);
      osc.stop(now + 0.4);
    }
  } catch (err) {
    console.warn('Audio chime error:', err);
  }
};

// Speaks Hindi/Indian English voice announcement
export const speakVoice = (text, delayMs = 250) => {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    console.warn('SpeechSynthesis not supported on this device.');
    return;
  }

  setTimeout(() => {
    try {
      window.speechSynthesis.cancel(); // Stop any pending speech

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.95; // Crisp and natural pace
      utterance.pitch = 1.0;

      // Select Indian Hindi or English voice if available
      const voices = window.speechSynthesis.getVoices();
      const preferredVoice = voices.find(
        (v) =>
          v.lang.startsWith('hi') ||
          v.lang === 'en-IN' ||
          v.name.toLowerCase().includes('india') ||
          v.name.toLowerCase().includes('hindi')
      );
      if (preferredVoice) {
        utterance.voice = preferredVoice;
        utterance.lang = preferredVoice.lang;
      } else {
        utterance.lang = 'hi-IN';
      }

      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn('Failed to speak voice note:', err);
    }
  }, delayMs);
};

// Vendor receives cash request voice note: "{amount} ka cashback request received"
export const playVendorCashRequestVoice = (amount) => {
  playNotificationChime('incoming');
  const numericAmount = Math.round(Number(amount) || 0);
  speakVoice(`${numericAmount} ka cashback request received`);
};

// Customer receives cashback voice note: "{cashback} cashback credited"
export const playCustomerCashbackCreditedVoice = (cashbackAmount) => {
  playNotificationChime('success');
  const numericAmount = Math.round(Number(cashbackAmount) || 0);
  speakVoice(`${numericAmount} rupaye cashback credited`);
};
