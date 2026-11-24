// Prove It's catch game: 20 seconds of falling thoughts. Hearts +1, gold stars +3, and the
// busy things that get in the way (emails, meetings, alarms) cost 3. Pure logic, no drawing,
// so the difficulty can be tested with simulated players (catch.test.ts).

export const PROVE_LEVELS = [
  { level: 1, name: 'a kaya toast crumb', icon: '🍞' },
  { level: 2, name: 'a kopi peng', icon: '🧋' },
  { level: 3, name: 'an end-to-end MRT ride', icon: '🚇' },
  { level: 4, name: 'Kallang River', icon: '🌊' },
  { level: 5, name: 'a red-eye flight', icon: '✈️' },
  { level: 6, name: 'the Moon', icon: '🌙' },
  { level: 7, name: 'every star', icon: '✨' },
] as const
/** Mirrors our_misses_private.prove_target in the database. */
export const PROVE_TARGETS = [6, 10, 14, 18, 24, 30, 37] as const
export const proveTarget = (level: number) => PROVE_TARGETS[level - 1]

export const CATCH_MS = 20_000
export const CATCHER_W = 72
const ITEM_R = 17
const LAST_SPAWN_MS = CATCH_MS - 1200
const BUSY = ['📧', '💼', '⏰', '📅', '📞']

export type ItemKind = 'heart' | 'gold' | 'busy'
export interface Item { id: number; kind: ItemKind; glyph: string; x: number; y: number; vy: number }
export interface CatchState {
  width: number
  height: number
  t: number
  score: number
  items: Item[]
  nextSpawn: number
  nextId: number
  rand: () => number
}
export interface CatchEvent { kind: ItemKind; points: number; x: number; y: number }

/** Small seeded generator so a simulation can be replayed. */
export function seeded(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const catcherY = (height: number) => height - 44

export function createCatch(width: number, height: number, rand: () => number = Math.random): CatchState {
  return { width, height, t: 0, score: 0, items: [], nextSpawn: 300, nextId: 1, rand }
}

const lerp = (a: number, b: number, f: number) => a + (b - a) * Math.min(1, Math.max(0, f))

/** Advance the game by dt ms with the catcher centred at catcherX. Returns what was caught. */
export function stepCatch(s: CatchState, dt: number, catcherX: number): CatchEvent[] {
  const events: CatchEvent[] = []
  const end = Math.min(CATCH_MS, s.t + dt)
  while (s.nextSpawn <= end && s.nextSpawn <= LAST_SPAWN_MS) {
    const f = s.nextSpawn / CATCH_MS
    const r = s.rand()
    const kind: ItemKind = r < 0.07 ? 'gold' : r < 0.34 ? 'busy' : 'heart'
    s.items.push({
      id: s.nextId++,
      kind,
      glyph: kind === 'heart' ? '❤️' : kind === 'gold' ? '🌟' : BUSY[Math.floor(s.rand() * BUSY.length)],
      x: ITEM_R + 6 + s.rand() * (s.width - 2 * (ITEM_R + 6)),
      y: -ITEM_R - (end - s.nextSpawn) * 0.2,
      vy: lerp(190, 330, f) * (0.85 + s.rand() * 0.3),
    })
    s.nextSpawn += lerp(500, 260, f)
  }
  s.t = end
  const top = catcherY(s.height) - 12
  const bottom = catcherY(s.height) + 18
  const reach = CATCHER_W / 2 + ITEM_R * 0.35
  s.items = s.items.filter((it) => {
    const before = it.y
    it.y += (it.vy * dt) / 1000
    if (before <= bottom && it.y >= top && Math.abs(it.x - catcherX) <= reach) {
      const points = it.kind === 'heart' ? 1 : it.kind === 'gold' ? 3 : -3
      s.score = Math.max(0, s.score + points)
      events.push({ kind: it.kind, points, x: it.x, y: Math.min(it.y, catcherY(s.height)) })
      return false
    }
    return it.y < s.height + ITEM_R
  })
  return events
}

export const catchOver = (s: CatchState) => s.t >= CATCH_MS
