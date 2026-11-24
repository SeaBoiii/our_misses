import { describe, expect, it } from 'vitest'
import { CATCH_MS, catcherY, catchOver, createCatch, PROVE_TARGETS, seeded, stepCatch, type CatchState } from './catch'

const W = 360
const H = 440
const DT = 16

/** A simulated player: finger speed (px/s), reaction time (ms), and whether they dodge busy things. */
function play(seed: number, speed: number, react: number, dodge: boolean, stay = false) {
  const s: CatchState = createCatch(W, H, seeded(seed))
  let x = W / 2
  let goal = x
  let think = 0
  while (!catchOver(s)) {
    if (!stay) {
      const line = catcherY(H)
      const good = s.items.filter((i) => i.kind !== 'busy' && i.y < line).sort((a, b) => b.y - a.y)
      think -= DT
      if (think <= 0) { think = react; goal = good.length ? good[0].x : x }
      if (dodge) {
        const danger = s.items.find((i) => i.kind === 'busy' && i.y > line - 70 && i.y < line && Math.abs(i.x - goal) < 60)
        if (danger) goal = danger.x < goal ? Math.min(W - 42, danger.x + 80) : Math.max(42, danger.x - 80)
      }
      const step = (speed * DT) / 1000
      x += Math.max(-step, Math.min(step, goal - x))
    }
    stepCatch(s, DT, x)
  }
  return s.score
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
const seeds = Array.from({ length: 41 }, (_, i) => i + 1)

describe('the Prove It catch game', () => {
  it('lasts 20 seconds and is replayable from a seed', () => {
    expect(play(7, 900, 200, true)).toBe(play(7, 900, 200, true))
    const s = createCatch(W, H, seeded(1))
    stepCatch(s, CATCH_MS + 5000, W / 2)
    expect(s.t).toBe(CATCH_MS)
  })

  it('cannot be proved by standing still', () => {
    expect(median(seeds.map((seed) => play(seed, 0, 0, false, true)))).toBeLessThan(PROVE_TARGETS[0])
  })

  it('makes a casual player land in the middle levels', () => {
    const scores = seeds.map((seed) => play(seed, 600, 320, false))
    expect(median(scores)).toBeGreaterThanOrEqual(PROVE_TARGETS[2])
    expect(median(scores)).toBeLessThan(PROVE_TARGETS[5])
  })

  it('keeps "every star" for a sharp player, and possible', () => {
    const sharp = seeds.map((seed) => play(seed, 1300, 110, true))
    const best = Math.max(...sharp)
    expect(best).toBeGreaterThanOrEqual(PROVE_TARGETS[6])
    expect(sharp.filter((s) => s >= PROVE_TARGETS[6]).length).toBeLessThan(seeds.length * 0.8)
  })
})
