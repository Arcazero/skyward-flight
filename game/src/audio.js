// audio.js — every sound in Skyward Flight, synthesised live with WebAudio.
// No audio files, no network: an engine drone, wind, a ring chime, a
// touchdown thud and a crash. Starts on the first user gesture.

export function createAudio() {
  let ctx = null;
  let engineOsc = null, engineOsc2 = null, engineGain = null;
  let windSource = null, windGain = null, windFilter = null;
  let muted = false;
  let started = false;

  function ensure() {
    if (started) return;
    started = true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      // Engine: two detuned saws through a low-pass, pitch follows throttle.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'square';
      engineOsc2.frequency.value = 28;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter);
      engineOsc2.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(ctx.destination);
      engineOsc.start();
      engineOsc2.start();
      // Wind: looped noise through a band-pass, loudness follows airspeed.
      const len = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      windSource = ctx.createBufferSource();
      windSource.buffer = buffer;
      windSource.loop = true;
      windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 900;
      windFilter.Q.value = 0.6;
      windGain = ctx.createGain();
      windGain.gain.value = 0;
      windSource.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(ctx.destination);
      windSource.start();
    } catch (e) {
      ctx = null; // audio is a garnish; the game plays without it
    }
  }

  function setEngine(throttle, speed, airborne) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const rpm = 42 + throttle * 88 + speed * 0.22;
    engineOsc.frequency.setTargetAtTime(rpm, t, 0.08);
    engineOsc2.frequency.setTargetAtTime(rpm * 0.5, t, 0.08);
    const level = airborne ? 0.045 + throttle * 0.05 : 0.02 + throttle * 0.05;
    engineGain.gain.setTargetAtTime(level, t, 0.1);
    windGain.gain.setTargetAtTime(Math.min(0.09, speed * 0.0011), t, 0.15);
    windFilter.frequency.setTargetAtTime(500 + speed * 9, t, 0.15);
  }

  function blip(freq, dur, type, vol, when = 0) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol || 0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  return {
    ensure,
    setEngine,
    toggleMute() {
      muted = !muted;
      if (ctx) {
        const t = ctx.currentTime;
        if (engineGain) engineGain.gain.setTargetAtTime(muted ? 0 : 0.05, t, 0.05);
        if (windGain) windGain.gain.setTargetAtTime(0, t, 0.05);
      }
      return muted;
    },
    isMuted() { return muted; },
    ring() { blip(880, 0.5, 'sine', 0.14); blip(1318, 0.6, 'sine', 0.1, 0.09); },
    touchdown() { blip(70, 0.35, 'sine', 0.22); },
    crash() {
      if (!ctx || muted) return;
      const t = ctx.currentTime;
      const noise = ctx.createBufferSource();
      const len = ctx.sampleRate * 0.5;
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      noise.buffer = buffer;
      const g = ctx.createGain();
      g.gain.value = 0.3;
      noise.connect(g); g.connect(ctx.destination);
      noise.start(t);
      blip(48, 0.7, 'sine', 0.25);
    },
    click() { blip(660, 0.08, 'square', 0.05); },
  };
}
