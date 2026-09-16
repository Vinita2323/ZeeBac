// Web Audio API Ringtone & Dial Tone Generator (Zero external MP3 asset dependencies)

let audioCtx = null;
let ringInterval = null;
let currentOscillators = [];

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export function stopRingtone() {
  if (ringInterval) {
    clearInterval(ringInterval);
    ringInterval = null;
  }
  currentOscillators.forEach((osc) => {
    try {
      osc.stop();
      osc.disconnect();
    } catch (_) {}
  });
  currentOscillators = [];
}

/**
 * Play outgoing ringback tone (dial tone: "ring... ring...")
 */
export function playOutgoingRing() {
  stopRingtone();
  const ctx = getAudioContext();
  if (!ctx) return;

  const playBurst = () => {
    try {
      const now = ctx.currentTime;
      // Dual frequencies 440Hz + 480Hz standard ringback
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.frequency.value = 440;
      osc2.frequency.value = 480;

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.08, now + 0.05);
      gain.gain.setValueAtTime(0.08, now + 1.2);
      gain.gain.linearRampToValueAtTime(0, now + 1.3);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 1.35);
      osc2.stop(now + 1.35);

      currentOscillators = [osc1, osc2];
    } catch (_) {}
  };

  playBurst();
  ringInterval = setInterval(playBurst, 3500);
}

/**
 * Play pleasant incoming ringtone (melodic marimba chime)
 */
export function playIncomingRing() {
  stopRingtone();
  const ctx = getAudioContext();
  if (!ctx) return;

  const playMelody = () => {
    try {
      const notes = [659.25, 783.99, 987.77, 1318.51]; // E5, G5, B5, E6
      const start = ctx.currentTime;

      notes.forEach((freq, idx) => {
        const noteTime = start + idx * 0.18;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, noteTime);

        gain.gain.setValueAtTime(0, noteTime);
        gain.gain.linearRampToValueAtTime(0.12, noteTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.45);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(noteTime);
        osc.stop(noteTime + 0.5);
        currentOscillators.push(osc);
      });
    } catch (_) {}
  };

  playMelody();
  ringInterval = setInterval(playMelody, 2200);
}

/**
 * Play short call ended tone
 */
export function playEndCallTone() {
  stopRingtone();
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.25);

    gain.gain.setValueAtTime(0.1, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.3);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.3);
  } catch (_) {}
}
