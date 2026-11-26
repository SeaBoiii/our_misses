// Tiny synthesized sounds (no audio files) and phone buzzes.
let ctx: AudioContext | null = null
let muted = (() => { try { return localStorage.getItem('our_misses_muted') === '1' } catch { return false } })()

export const isMuted = () => muted
export function setMuted(value: boolean) {
  muted = value
  try { localStorage.setItem('our_misses_muted', value ? '1' : '0') } catch { /* ignore */ }
}

function audio() {
  if (muted) return null
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch { return null }
}

function tone(freq: number, start: number, length: number, type: OscillatorType = 'sine', gain = 0.12, slideTo?: number) {
  const a = audio()
  if (!a) return
  const t = a.currentTime + start
  const osc = a.createOscillator()
  const vol = a.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + length)
  vol.gain.setValueAtTime(0.0001, t)
  vol.gain.exponentialRampToValueAtTime(gain, t + 0.015)
  vol.gain.exponentialRampToValueAtTime(0.0001, t + length)
  osc.connect(vol).connect(a.destination)
  osc.start(t)
  osc.stop(t + length + 0.02)
}

export function buzz(pattern: number | number[]) {
  if (muted) return
  try { navigator.vibrate?.(pattern) } catch { /* unsupported */ }
}

export const sfx = {
  charge(level: number) { tone(330 * 2 ** (level / 3), 0, 0.12, 'triangle', 0.08); buzz(12) },
  send(level: number) { tone(420, 0, 0.22 + level * 0.04, 'sine', 0.12, 900 + level * 160); buzz(25) },
  burst() { tone(180, 0, 0.3, 'sawtooth', 0.06, 60); tone(900, 0.02, 0.18, 'square', 0.03, 300); buzz([30, 30, 60]) },
  receive() { tone(784, 0, 0.18, 'sine', 0.1); tone(1046, 0.12, 0.28, 'sine', 0.1); buzz([20, 40, 20]) },
  sameBrain() { [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.09, 0.4, 'triangle', 0.09)); buzz([40, 30, 40, 30, 80]) },
  denied() { tone(220, 0, 0.16, 'square', 0.04, 160); buzz(60) },
  pop(points: number) { tone(points > 1 ? 1175 : 880, 0, 0.09, 'triangle', 0.07, points > 1 ? 1760 : 1100) },
  oops() { tone(140, 0, 0.22, 'sawtooth', 0.05, 90); buzz(50) },
  tick() { tone(660, 0, 0.08, 'square', 0.04) },
  go() { tone(990, 0, 0.25, 'triangle', 0.08, 1320) },
  win() { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, i * 0.08, 0.35, 'triangle', 0.08)); buzz([30, 40, 60]) },
  lose() { [392, 370, 349, 262].forEach((f, i) => tone(f, i * 0.22, 0.3, 'sawtooth', 0.04)); buzz(120) },
  tap() { tone(520 + Math.random() * 80, 0, 0.04, 'square', 0.025) },
  heartbeat() { tone(72, 0, 0.13, 'sine', 0.3, 55); tone(64, 0.2, 0.16, 'sine', 0.24, 50) },
  unlock() { audio() },
}
