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
export const speakVoice = (text, delayMs = 250, preferredLang = 'en-IN') => {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    console.warn('SpeechSynthesis not supported on this device.');
    return;
  }

  setTimeout(() => {
    try {
      window.speechSynthesis.cancel(); // Stop any pending speech

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.98; // Crisp and natural pace
      utterance.pitch = 1.0;

      // Select voice based on preferredLang ('en-IN', 'en', 'hi-IN')
      const voices = window.speechSynthesis.getVoices();
      let selectedVoice = null;

      if (preferredLang.startsWith('en')) {
        selectedVoice =
          voices.find(
            (v) =>
              v.lang === 'en-IN' ||
              v.lang === 'en_IN' ||
              (v.lang.startsWith('en') && v.name.toLowerCase().includes('india'))
          ) || voices.find((v) => v.lang.startsWith('en'));
        utterance.lang = selectedVoice?.lang || 'en-IN';
      } else {
        selectedVoice = voices.find(
          (v) => v.lang.startsWith('hi') || v.name.toLowerCase().includes('hindi')
        );
        utterance.lang = selectedVoice?.lang || 'hi-IN';
      }

      if (selectedVoice) {
        utterance.voice = selectedVoice;
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

// Driver incoming delivery request alarm chime & announcement (Zomato/Swiggy style)
export const playDeliveryOrderAlarm = ({ storeName = '', payout = 0 } = {}) => {
  try {
    const ctx = getAudioContext();
    if (ctx) {
      const now = ctx.currentTime;
      // Play 3 energetic alert pulses: beep-boop, beep-boop, beep-boop
      [0, 0.22, 0.44].forEach((offset) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(880, now + offset); // A5
        osc.frequency.exponentialRampToValueAtTime(1318.51, now + offset + 0.12); // E6
        gain.gain.setValueAtTime(0.35, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.01, now + offset + 0.18);

        osc.start(now + offset);
        osc.stop(now + offset + 0.18);
      });
    }

    // Vibrate mobile device if supported
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([300, 150, 300, 150, 400]);
    }

    // English voice announcement for driver order alert
    const voiceText = storeName
      ? `New delivery order received from ${storeName}! Payout rupees ${payout || 50}.`
      : `New delivery order request received! Payout rupees ${payout || 50}.`;
    speakVoice(voiceText, 700, 'en-IN');
  } catch (err) {
    console.warn('Delivery alarm audio error:', err);
  }
};

// Rider incoming order continuous alarm sound & vibration
let riderAlarmInterval = null;

export const startRiderOrderContinuousAlarm = ({ storeName = '', payout = 0 } = {}) => {
  stopRiderOrderContinuousAlarm();
  playDeliveryOrderAlarm({ storeName, payout });

  riderAlarmInterval = setInterval(() => {
    try {
      const ctx = getAudioContext();
      if (ctx) {
        if (ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }
        const now = ctx.currentTime;
        [0, 0.22, 0.44].forEach((offset) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(880, now + offset);
          osc.frequency.exponentialRampToValueAtTime(1318.51, now + offset + 0.12);
          gain.gain.setValueAtTime(0.35, now + offset);
          gain.gain.exponentialRampToValueAtTime(0.01, now + offset + 0.18);
          osc.start(now + offset);
          osc.stop(now + offset + 0.18);
        });
      }
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate([250, 150, 250]);
      }
    } catch (_) {}
  }, 2600);
};

export const stopRiderOrderContinuousAlarm = () => {
  if (riderAlarmInterval) {
    clearInterval(riderAlarmInterval);
    riderAlarmInterval = null;
  }
};

// Store incoming order soundbox alarm chime & English announcement
let storeBellInterval = null;

export const playStoreNewOrderBell = () => {
  try {
    const ctx = getAudioContext();
    if (ctx) {
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      const now = ctx.currentTime;
      // High-volume piercing acoustic restaurant order bell (Zomato/Swiggy Merchant Bell)
      // Rapid dual chime sequence (880Hz, 1174Hz, 1568Hz)
      const burstNotes = [
        { time: 0, freq: 880, dur: 0.22, vol: 0.85 },
        { time: 0.12, freq: 1174.66, dur: 0.25, vol: 0.9 },
        { time: 0.28, freq: 1568, dur: 0.35, vol: 0.95 },
        { time: 0.65, freq: 880, dur: 0.22, vol: 0.85 },
        { time: 0.77, freq: 1174.66, dur: 0.25, vol: 0.9 },
        { time: 0.93, freq: 1568, dur: 0.45, vol: 1.0 },
      ];

      burstNotes.forEach(({ time, freq, dur, vol }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + time);

        // Harmonic overtone for realistic bell resonance
        const overtone = ctx.createOscillator();
        const otGain = ctx.createGain();
        overtone.connect(otGain);
        otGain.connect(ctx.destination);
        overtone.type = 'triangle';
        overtone.frequency.setValueAtTime(freq * 1.5, now + time);

        gain.gain.setValueAtTime(vol, now + time);
        gain.gain.exponentialRampToValueAtTime(0.001, now + time + dur);
        otGain.gain.setValueAtTime(vol * 0.35, now + time);
        otGain.gain.exponentialRampToValueAtTime(0.001, now + time + dur);

        osc.start(now + time);
        osc.stop(now + time + dur);
        overtone.start(now + time);
        overtone.stop(now + time + dur);
      });
    }

    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([350, 150, 350, 150, 500]);
    }
  } catch (err) {
    console.warn('Store order bell error:', err);
  }
};

export const startStoreOrderContinuousBell = ({ orderId = '', amount = 0, customerName = '' } = {}) => {
  stopStoreOrderContinuousBell();
  playStoreNewOrderBell();

  const shortId = String(orderId).slice(-4);
  const numAmt = Math.round(Number(amount) || 0);
  const voiceText = numAmt > 0
    ? `New order received! Amount rupees ${numAmt}!`
    : `New order received! Order number ${shortId}!`;
  speakVoice(voiceText, 800, 'en-IN');

  storeBellInterval = setInterval(() => {
    playStoreNewOrderBell();
  }, 2800);
};

export const stopStoreOrderContinuousBell = () => {
  if (storeBellInterval) {
    clearInterval(storeBellInterval);
    storeBellInterval = null;
  }
};

export const playStoreNewOrderAlarm = ({ orderId = '', amount = 0, customerName = '' } = {}) => {
  startStoreOrderContinuousBell({ orderId, amount, customerName });
};

// Store alert when a delivery rider declines the order
export const playRiderDeclinedTone = ({ riderName = '', reason = '' } = {}) => {
  try {
    playNotificationChime('incoming');
    const text = riderName
      ? `Delivery rider ${riderName} declined the order. Reason: ${reason || 'Not available'}.`
      : `Delivery rider declined the order. Searching next rider.`;
    speakVoice(text, 500, 'en-IN');
  } catch (err) {
    console.warn('Rider declined tone error:', err);
  }
};

// Formats order timestamp cleanly: "4:21 PM (2m ago)"
export const formatOrderTime = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';

  const timeStr = d.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const diffMs = Date.now() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return `${timeStr} (Just now)`;
  if (diffMins < 60) return `${timeStr} (${diffMins}m ago)`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${timeStr} (${diffHours}h ago)`;
  return `${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} ${timeStr}`;
};
