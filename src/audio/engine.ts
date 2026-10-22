import type { MusicTrack } from '../db/settings';

/**
 * 1.2.0 — sound for IBRAHI8M EDU STUDIO, made entirely in the browser with the Web Audio API.
 *
 * The four background tracks and the interface sounds are ORIGINAL: they are generated here from
 * oscillators, filters and noise by the code below, so there is no audio file to download, nothing to
 * license and nothing that stops working offline. Nothing plays until the user presses «تشغيل»
 * (browsers also require that gesture); the choice to play is never remembered across launches.
 *
 * The engine is a single module-level object, so moving between pages never restarts the music.
 */

export type Transport = 'stopped' | 'playing' | 'paused';
export type Sfx = 'save' | 'prompt' | 'copy' | 'export' | 'alert' | 'error';

export const TRACKS: { id: MusicTrack; label: string; hint: string }[] = [
  { id: 'ambient', label: 'أجواء محيطية', hint: 'طبقات صوتية ناعمة بطيئة التغير' },
  { id: 'tech', label: 'إلكترونية هادئة', hint: 'نغمات متتابعة خفيفة بطابع تقني' },
  { id: 'focus', label: 'تركيز', hint: 'نغمات متباعدة فوق صوت قاعدي منخفض' },
  { id: 'space', label: 'فضاء رقمي', hint: 'صوت عميق بطيء مع لمعات عالية خافتة' },
];

interface State {
  transport: Transport;
  track: MusicTrack | null;
  supported: boolean;
}

type AC = AudioContext;
const AudioCtor: (new () => AC) | undefined =
  typeof window !== 'undefined' ? ((window as unknown as { AudioContext?: new () => AC; webkitAudioContext?: new () => AC }).AudioContext ?? (window as unknown as { webkitAudioContext?: new () => AC }).webkitAudioContext) : undefined;

let state: State = { transport: 'stopped', track: null, supported: !!AudioCtor };
const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};
export const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export const getState = () => state;

/** For automated tests and diagnostics: what the engine did (no audio data). */
export const log: { sfx: Sfx[]; starts: number } = { sfx: [], starts: 0 };
/** 1.5.0: measures what actually leaves the app (after every gain and the compressor), for tests and diagnosis. */
let meter: AnalyserNode | null = null;
export function outputLevel(): number {
  if (!meter) return 0;
  const buf = new Float32Array(meter.fftSize);
  meter.getFloatTimeDomainData(buf);
  let sum = 0;
  for (const x of buf) sum += x * x;
  return Math.sqrt(sum / buf.length);
}
export const masterGain = () => (master ? master.gain.value : 0);
if (typeof window !== 'undefined') (window as unknown as { ibrahi8mAudio?: unknown }).ibrahi8mAudio = { getState, log, outputLevel, masterGain };

let ctx: AC | null = null;
let master: GainNode | null = null; // music volume
let sfxBus: GainNode | null = null;
let reverb: ConvolverNode | null = null;
let musicVolume = 0.4;
let muted = false;
let voice: { stop: () => void } | null = null;

function ensure(): AC | null {
  if (!AudioCtor) return null;
  if (!ctx) {
    ctx = new AudioCtor();
    // 1.5.0: the compressor only catches peaks now. Before, it sat at -18 dB / 4:1 and flattened the
    // volume slider: 25 % → 100 % changed the measured output by about 8 dB only.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -6;
    comp.knee.value = 6;
    comp.ratio.value = 3;
    comp.connect(ctx.destination);
    meter = ctx.createAnalyser();
    meter.fftSize = 2048;
    comp.connect(meter);
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(comp);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.5;
    sfxBus.connect(comp);
    reverb = ctx.createConvolver();
    reverb.buffer = impulse(ctx, 3.2);
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    reverb.connect(wet).connect(master);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** A generated room echo (decaying noise), so no impulse file is needed. */
function impulse(c: AC, seconds: number): AudioBuffer {
  const len = Math.floor(c.sampleRate * seconds);
  const b = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
  }
  return b;
}

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

function rampMaster(to: number, seconds: number) {
  if (!ctx || !master) return;
  const g = master.gain;
  g.cancelScheduledValues(ctx.currentTime);
  g.setValueAtTime(g.value, ctx.currentTime);
  g.linearRampToValueAtTime(to, ctx.currentTime + seconds);
}
/**
 * 1.5.0: a perceptual curve (gain ∝ volume²): equal slider steps sound like equal loudness steps,
 * 0 is silent and 100 % is clearly louder than before (it was capped at gain 0.6, linear).
 */
const MAX_GAIN = 2.4;
export const gainFor = (volume: number, isMuted: boolean) => (isMuted || volume <= 0 ? 0 : Math.min(1, volume) ** 2 * MAX_GAIN);
const target = () => gainFor(musicVolume, muted);

/** One soft note: oscillator(s) → envelope → (dry + reverb). */
function note(c: AC, out: AudioNode, f: number, at: number, dur: number, opts: { type?: OscillatorType; gain?: number; attack?: number; release?: number; detune?: number; cutoff?: number } = {}) {
  const { type = 'sine', gain = 0.12, attack = 0.02, release = 0.6, detune = 0, cutoff = 4000 } = opts;
  const env = c.createGain();
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(gain, at + attack);
  env.gain.setTargetAtTime(0, at + Math.max(attack, dur - release), release / 3);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = cutoff;
  const oscs = [0, detune].filter((d, i) => i === 0 || d).map((d) => {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.detune.value = d;
    o.connect(lp);
    o.start(at);
    o.stop(at + dur + release * 2);
    return o;
  });
  lp.connect(env);
  env.connect(out);
  if (reverb) env.connect(reverb);
  return oscs;
}

/** Runs `step` every `every` seconds, scheduling slightly ahead of time (smooth even when the tab is busy). */
function sequencer(c: AC, every: number, step: (at: number, i: number) => void) {
  let next = c.currentTime + 0.15;
  let i = 0;
  const tick = () => {
    while (next < c.currentTime + 0.6) {
      step(next, i++);
      next += every;
    }
  };
  tick();
  const id = window.setInterval(tick, 150);
  return () => window.clearInterval(id);
}

function startTrack(c: AC, out: AudioNode, track: MusicTrack): { stop: () => void } {
  const stops: (() => void)[] = [];
  const live: OscillatorNode[] = [];
  const keep = (o: OscillatorNode[]) => live.push(...o);
  if (track === 'ambient') {
    // Dmaj9 – Bm9 – Gmaj7 – Aadd9, 8 s each, slow pads
    const chords = [
      [50, 57, 62, 66, 69, 76],
      [47, 54, 61, 62, 66, 73],
      [43, 50, 59, 62, 66, 71],
      [45, 52, 59, 61, 64, 71],
    ];
    stops.push(
      sequencer(c, 8, (at, i) => {
        for (const m of chords[i % 4]) keep(note(c, out, hz(m), at, 9, { type: 'triangle', gain: 0.035, attack: 2.8, release: 3, detune: 7, cutoff: 1100 }));
      }),
    );
  } else if (track === 'tech') {
    // A minor pentatonic arpeggio at 84 bpm over a soft sub bass; no drums
    const prog = [57, 53, 48, 55];
    const pent = [0, 3, 5, 7, 10, 12, 15];
    const beat = 60 / 84 / 2;
    stops.push(
      sequencer(c, beat, (at, i) => {
        const root = prog[Math.floor(i / 16) % 4];
        if (i % 16 === 0) keep(note(c, out, hz(root - 24), at, beat * 16, { type: 'sine', gain: 0.08, attack: 0.4, release: 1.2, cutoff: 400 }));
        const pat = [0, 2, 4, 2, 5, 4, 2, 1];
        keep(note(c, out, hz(root + 12 + pent[pat[i % 8]]), at, beat * 0.9, { type: 'triangle', gain: i % 4 === 0 ? 0.06 : 0.04, attack: 0.01, release: 0.35, cutoff: 1800 }));
      }),
    );
  } else if (track === 'focus') {
    // low drone + sparse bell tones (C major pentatonic)
    keep(note(c, out, hz(36), c.currentTime + 0.1, 36000, { type: 'sine', gain: 0.05, attack: 4, release: 2, cutoff: 300 }));
    keep(note(c, out, hz(43), c.currentTime + 0.1, 36000, { type: 'sine', gain: 0.03, attack: 6, release: 2, cutoff: 300 }));
    const bells = [72, 74, 76, 79, 81, 84];
    stops.push(
      sequencer(c, 2.6, (at, i) => {
        if (i % 3 === 2) return; // breathing space
        const m = bells[(i * 7 + Math.floor(i / 5)) % bells.length];
        keep(note(c, out, hz(m), at, 2.4, { type: 'sine', gain: 0.045, attack: 0.01, release: 1.8 }));
        keep(note(c, out, hz(m) * 2.01, at, 1.2, { type: 'sine', gain: 0.012, attack: 0.01, release: 0.9 }));
      }),
    );
  } else {
    // space: deep drone with a slowly sweeping filter, and faint high glints
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 220;
    lp.Q.value = 6;
    const lfo = c.createOscillator();
    const lfoGain = c.createGain();
    lfo.frequency.value = 0.03;
    lfoGain.gain.value = 160;
    lfo.connect(lfoGain).connect(lp.frequency);
    lfo.start();
    live.push(lfo);
    const g = c.createGain();
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(0.06, c.currentTime + 6);
    for (const [f, d] of [
      [hz(33), 0],
      [hz(33), 9],
      [hz(40), -6],
    ]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = d;
      o.connect(lp);
      o.start();
      live.push(o);
    }
    lp.connect(g);
    g.connect(out);
    if (reverb) g.connect(reverb);
    const glints = [88, 91, 93, 95, 98];
    stops.push(
      sequencer(c, 3.4, (at, i) => {
        if (i % 2) return;
        keep(note(c, out, hz(glints[(i * 3) % glints.length]), at, 1.5, { type: 'sine', gain: 0.018, attack: 0.6, release: 1.4 }));
      }),
    );
  }
  return {
    stop: () => {
      stops.forEach((s) => s());
      const t = c.currentTime + 1.6;
      for (const o of live) {
        try {
          o.stop(t);
        } catch {
          /* already stopped */
        }
      }
    },
  };
}

/** Starts (or switches to) a track. Must be called from a user gesture the first time. */
export function play(track: MusicTrack, volume: number) {
  const c = ensure();
  if (!c || !master) return;
  musicVolume = volume;
  if (voice && state.track !== track) {
    const old = voice;
    rampMaster(0, 1.2);
    window.setTimeout(() => old.stop(), 1300);
    voice = null;
  }
  if (!voice) {
    window.setTimeout(
      () => {
        if (!ctx || !master) return;
        voice = startTrack(ctx, master, track);
        log.starts++;
        rampMaster(target(), 2.5);
      },
      state.transport === 'playing' ? 1300 : 0,
    );
  } else rampMaster(target(), 1.5);
  set({ transport: 'playing', track });
}

/** Fades out and holds; «استئناف» continues the same track without restarting the page. */
export function pause() {
  if (state.transport !== 'playing') return;
  rampMaster(0, 0.6);
  set({ transport: 'paused' });
}

export function resume() {
  if (state.transport !== 'paused') return;
  ensure();
  rampMaster(target(), 1.2);
  set({ transport: 'playing' });
}

export function stop() {
  rampMaster(0, 0.8);
  const v = voice;
  voice = null;
  window.setTimeout(() => v?.stop(), 900);
  set({ transport: 'stopped', track: null });
}

export function setMusicVolume(v: number) {
  musicVolume = Math.max(0, Math.min(1, v));
  if (state.transport === 'playing') rampMaster(target(), 0.08); // follows the slider while it is dragged
}

export function setMuted(m: boolean) {
  muted = m;
  if (state.transport === 'playing') rampMaster(target(), 0.15);
}

/** Short interface sounds. Played only when the user enabled them and nothing is muted. */
export function sfx(kind: Sfx, enabled: boolean, volume: number, isMuted: boolean) {
  if (!enabled || isMuted) return;
  const c = ensure();
  if (!c || !sfxBus) return;
  log.sfx.push(kind);
  sfxBus.gain.setValueAtTime(Math.min(1, Math.max(0, volume)) ** 2 * 1.2, c.currentTime); // same perceptual curve as the music
  const t = c.currentTime + 0.01;
  const seq: Record<Sfx, [number, number, OscillatorType][]> = {
    save: [
      [76, 0, 'sine'],
      [83, 0.11, 'sine'],
    ],
    prompt: [
      [72, 0, 'triangle'],
      [76, 0.09, 'triangle'],
      [79, 0.18, 'triangle'],
      [84, 0.27, 'sine'],
    ],
    copy: [[91, 0, 'sine']],
    export: [
      [72, 0, 'sine'],
      [79, 0.1, 'sine'],
      [84, 0.2, 'sine'],
    ],
    alert: [
      [78, 0, 'sine'],
      [78, 0.22, 'sine'],
    ],
    error: [
      [64, 0, 'triangle'],
      [59, 0.16, 'triangle'],
    ],
  };
  for (const [m, d, type] of seq[kind]) {
    const env = c.createGain();
    env.gain.setValueAtTime(0, t + d);
    env.gain.linearRampToValueAtTime(kind === 'copy' ? 0.08 : 0.14, t + d + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, t + d + (kind === 'copy' ? 0.08 : 0.35));
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = hz(m);
    o.connect(env).connect(sfxBus);
    o.start(t + d);
    o.stop(t + d + 0.4);
  }
}
