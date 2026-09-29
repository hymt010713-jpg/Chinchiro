/**
 * 効果音（Web Audio で合成する試作音）。
 * 本番では同じ名前のまま収録素材に差し替える想定。
 */
import type { Hand, HandKey } from '@chinchiro/rules';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let muted = false;

export function setMuted(v: boolean) {
  muted = v;
}
export function isMuted() {
  return muted;
}

/** ユーザー操作の中で呼ぶ。以降の音が鳴らせるようになる */
export function unlockAudio() {
  now();
}

function now(): number {
  if (!ctx) {
    ctx = new AudioContext();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    master = ctx.createGain();
    master.gain.value = 0.85;
    master.connect(comp);
    comp.connect(ctx.destination);
    const n = ctx.sampleRate * 2;
    noise = ctx.createBuffer(1, n, ctx.sampleRate);
    const ch = noise.getChannelData(0);
    for (let i = 0; i < n; i++) ch[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx.currentTime + 0.02;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

function env(g: GainNode, t: number, a: number, peak: number, d: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

interface ToneOpts {
  type?: OscillatorType;
  a?: number;
  d?: number;
  g?: number;
  glide?: number;
  vib?: number;
}
function tone(t: number, f: number, { type = 'sine', a = 0.003, d = 0.3, g = 0.3, glide, vib = 0 }: ToneOpts = {}) {
  const c = ctx!;
  const os = c.createOscillator();
  os.type = type;
  os.frequency.setValueAtTime(f, t);
  if (glide) os.frequency.exponentialRampToValueAtTime(glide, t + a + d);
  if (vib) {
    const l = c.createOscillator();
    const lg = c.createGain();
    l.frequency.value = 6.5;
    lg.gain.value = vib;
    l.connect(lg);
    lg.connect(os.frequency);
    l.start(t);
    l.stop(t + a + d + 0.1);
  }
  const gn = c.createGain();
  env(gn, t, a, g, d);
  os.connect(gn);
  gn.connect(master!);
  os.start(t);
  os.stop(t + a + d + 0.1);
}

interface BurstOpts {
  f?: number;
  q?: number;
  d?: number;
  g?: number;
  type?: BiquadFilterType;
  f2?: number;
  a?: number;
}
function burst(t: number, { f = 2000, q = 1, d = 0.05, g = 0.3, type = 'bandpass', f2, a = 0.002 }: BurstOpts = {}) {
  const c = ctx!;
  const s = c.createBufferSource();
  s.buffer = noise;
  const fl = c.createBiquadFilter();
  fl.type = type;
  fl.frequency.setValueAtTime(f, t);
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + a + d);
  fl.Q.value = q;
  const gn = c.createGain();
  env(gn, t, a, g, d);
  s.connect(fl);
  fl.connect(gn);
  gn.connect(master!);
  s.start(t, Math.random() * 1.5);
  s.stop(t + a + d + 0.1);
}

const bell = (t: number, f: number, d = 1, g = 0.12) =>
  [1, 2.76, 5.4, 8.93].forEach((r, i) => {
    // 可聴域を超える倍音は鳴らさない
    if (f * r < 18000) tone(t, f * r, { d: d / (i * 0.8 + 1), g: g / (i + 1.3) });
  });
const chin = (t: number, g = 1) => {
  bell(t, rnd(2300, 3100), 0.55, 0.07 * g);
  burst(t, { f: 4200, q: 2, d: 0.025, g: 0.28 * g });
};
const clack = (t: number, g = 1) => {
  burst(t, { f: rnd(1500, 2400), q: 4, d: 0.035, g: 0.35 * g });
  tone(t, rnd(700, 1000), { type: 'triangle', d: 0.035, g: 0.08 * g });
};
const hyoshigi = (t: number, f = 1250) => {
  burst(t, { f: 2600, q: 9, d: 0.05, g: 0.55 });
  tone(t, f, { d: 0.14, g: 0.3 });
  tone(t, f * 2.3, { d: 0.06, g: 0.08 });
};
const taiko = (t: number, g = 1) => {
  tone(t, 130, { glide: 52, d: 0.55, g: 0.9 * g });
  burst(t, { type: 'lowpass', f: 260, d: 0.12, g: 0.6 * g });
};
const gong = (t: number, f = 98, d = 3) =>
  [1, 1.48, 2.05, 2.9, 4.1].forEach((r, i) => tone(t, f * r, { a: 0.01, d: d / (i * 0.5 + 1), g: 0.22 / (i + 1) }));
const koto = (t: number, f: number, g = 0.2) => {
  tone(t, f, { type: 'triangle', d: 0.7, g });
  tone(t, f * 2, { d: 0.25, g: g * 0.35 });
  burst(t, { f: f * 3, q: 6, d: 0.015, g: g * 0.5 });
};
/** 都節音階 */
const MIYAKO = [293.66, 311.13, 392, 440, 466.16, 587.33, 622.25, 784, 880, 932.33, 1174.66];
const coin = (t: number) => {
  tone(t, rnd(3000, 3400), { d: 0.16, g: 0.1 });
  tone(t + 0.025, rnd(4000, 4400), { d: 0.28, g: 0.07 });
  burst(t, { type: 'highpass', f: 6000, d: 0.03, g: 0.15 });
};

const SOUNDS = {
  shake() {
    const t = now();
    for (let i = 0; i < 16; i++) {
      burst(t + i * 0.05 + rnd(0, 0.02), { type: 'lowpass', f: rnd(700, 1100), d: 0.04, g: rnd(0.25, 0.45) });
    }
  },
  throwLand() {
    const t = now();
    burst(t, { f: 500, f2: 1800, q: 0.8, d: 0.18, g: 0.12 });
    for (let i = 0; i < 5; i++) {
      const s = t + 0.2 + i * 0.075 + rnd(0, 0.04);
      chin(s, 1);
      clack(s + rnd(0.1, 0.16), 0.5);
      chin(s + rnd(0.2, 0.3), 0.45);
    }
  },
  me() {
    hyoshigi(now());
  },
  shigoro() {
    const t = now();
    hyoshigi(t, 1200);
    hyoshigi(t + 0.2, 1400);
    bell(t + 0.4, 1900, 0.8, 0.08);
  },
  arashi() {
    const t = now();
    [0, 0.16, 0.28, 0.38, 0.46, 0.52].forEach((d, i) => taiko(t + d, 0.5 + i * 0.1));
    burst(t + 0.2, { f: 300, f2: 1400, q: 1.2, a: 0.4, d: 0.9, g: 0.22 });
  },
  pinzoro() {
    const t = now();
    gong(t, 110, 3);
    MIYAKO.slice(0, 8).forEach((f, i) => koto(t + 0.15 + i * 0.08, f));
  },
  yonzoro() {
    const t = now();
    [0, 0.3, 0.52, 0.62].forEach((d) => taiko(t + d));
    gong(t + 0.62, 98, 3);
    MIYAKO.slice(3).forEach((f, i) => koto(t + 0.7 + i * 0.07, f, 0.16));
  },
  junShintaki() {
    const t = now();
    burst(t, { type: 'lowpass', f: 7000, f2: 500, a: 0.05, d: 1.6, g: 0.3 });
    [...MIYAKO]
      .reverse()
      .concat(MIYAKO.slice(0, 4).reverse().map((f) => f / 2))
      .forEach((f, i) => koto(t + 0.05 + i * 0.055, f, 0.15));
    taiko(t + 0.9);
  },
  kiwami() {
    const t = now();
    for (let i = 0; i < 14; i++) taiko(t + i * 0.07 * (1 - i * 0.03), 0.35 + i * 0.05);
    gong(t + 0.95, 82, 4);
    gong(t + 0.95, 123, 3.5);
    MIYAKO.forEach((f, i) => koto(t + 1 + i * 0.06, f, 0.14));
    for (let i = 0; i < 14; i++) bell(t + 1.2 + rnd(0, 1.4), rnd(2500, 4500), 0.5, 0.04);
  },
  hifumi() {
    const t = now();
    tone(t, 440, { glide: 170, a: 0.05, d: 0.9, g: 0.28, vib: 14 });
    tone(t + 0.05, 660, { glide: 250, a: 0.05, d: 0.8, g: 0.08, vib: 10 });
    tone(t + 0.9, 90, { glide: 60, d: 0.35, g: 0.5 });
  },
  gyakuShintaki() {
    const t = now();
    MIYAKO.slice(0, 6)
      .reverse()
      .forEach((f, i) => koto(t + i * 0.11, f * 0.5 * Math.pow(0.985, i), 0.18));
    tone(t + 0.6, 400, { glide: 120, a: 0.05, d: 1.2, g: 0.26, vib: 16 });
    gong(t + 0.7, 55, 2.5);
  },
  shonben() {
    const t = now();
    burst(t, { f: 400, f2: 2600, q: 0.8, d: 0.25, g: 0.14 });
    [0.35, 0.5, 0.62, 0.8, 0.9].forEach((d) => {
      burst(t + d, { type: 'lowpass', f: 420, d: 0.07, g: 0.5 });
      tone(t + d, rnd(160, 220), { d: 0.08, g: 0.2 });
    });
    tone(t + 1.1, 700, { glide: 350, d: 0.25, g: 0.2 });
  },
  coin() {
    coin(now());
  },
  coins() {
    const t = now();
    for (let i = 0; i < 6; i++) coin(t + i * 0.07);
  },
  bigCoins() {
    const t = now();
    for (let i = 0; i < 22; i++) coin(t + i * 0.045 + rnd(0, 0.03));
  },
  lose() {
    const t = now();
    tone(t, 330, { glide: 250, d: 0.2, g: 0.12, type: 'triangle' });
  },
  turn() {
    const t = now();
    bell(t, 1760, 0.9, 0.12);
    bell(t + 0.16, 2200, 0.9, 0.1);
  },
  tick() {
    tone(now(), 1600, { type: 'square', d: 0.02, g: 0.05 });
  },
  tap() {
    const t = now();
    burst(t, { f: 1200, q: 5, d: 0.03, g: 0.3 });
    tone(t, 620, { type: 'triangle', d: 0.05, g: 0.1 });
  },
  fanfare() {
    const t = now();
    taiko(t);
    [587.33, 784, 880, 1174.66, 880, 1174.66].forEach((f, i) => {
      tone(t + 0.2 + i * 0.13, f, { type: 'square', d: 0.18, g: 0.05 });
      koto(t + 0.2 + i * 0.13, f, 0.12);
    });
    gong(t + 1, 110, 2.5);
  },
};

export type SoundName = keyof typeof SOUNDS;

export function play(name: SoundName) {
  if (muted) return;
  try {
    SOUNDS[name]();
  } catch {
    // 音が出せない環境では黙って続ける
  }
}

const STINGER: Record<HandKey, SoundName> = {
  gopin: 'kiwami',
  gozoro: 'kiwami',
  yonpin: 'kiwami',
  yonzoro: 'yonzoro',
  pinzoro: 'pinzoro',
  junShintaki: 'junShintaki',
  arashi: 'arashi',
  shigoro: 'shigoro',
  me: 'me',
  hifumi: 'hifumi',
  gyakuShintaki: 'gyakuShintaki',
  shonben: 'shonben',
};

export function playHand(h: Hand) {
  play(STINGER[h.key]);
}
