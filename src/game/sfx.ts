// Tiny square-wave sound effects, synthesized so there are no audio files.

let ctx: AudioContext | null = null;
let muted = false;
try {
  muted = localStorage.getItem('smb3.muted') === '1';
} catch {}

function ac(): AudioContext | null {
  if (muted) return null;
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(notes: [freq: number, dur: number][], type: OscillatorType = 'square', vol = 0.06) {
  const a = ac();
  if (!a) return;
  let t = a.currentTime;
  for (const [f, d] of notes) {
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + d);
    t += d * 0.9;
  }
}

export const sfx = {
  jump: () => {
    const a = ac();
    if (!a) return;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(300, a.currentTime);
    o.frequency.exponentialRampToValueAtTime(700, a.currentTime + 0.15);
    g.gain.setValueAtTime(0.05, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.18);
    o.connect(g).connect(a.destination);
    o.start();
    o.stop(a.currentTime + 0.2);
  },
  bump: () => tone([[140, 0.06], [100, 0.08]], 'triangle', 0.12),
  coin: () => tone([[988, 0.06], [1319, 0.22]]),
  stomp: () => tone([[220, 0.05], [440, 0.08]]),
  hurt: () => tone([[400, 0.08], [300, 0.08], [200, 0.12]]),
  select: () => tone([[660, 0.05], [880, 0.07]]),
  pipe: () => tone([[200, 0.08], [150, 0.08], [200, 0.08], [150, 0.1]]),
  clear: () => tone([[523, 0.1], [659, 0.1], [784, 0.1], [1047, 0.3]]),
  secret: () => tone([[392, 0.08], [523, 0.08], [659, 0.08], [784, 0.08], [1047, 0.08], [1319, 0.25]]),
};

export function toggleMute(): boolean {
  muted = !muted;
  try {
    localStorage.setItem('smb3.muted', muted ? '1' : '0');
  } catch {}
  return muted;
}

export function isMuted() {
  return muted;
}
