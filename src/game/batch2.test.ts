import { describe, expect, it } from 'vitest'
import * as C from '../chope/engine.js'
import { DOODLE_PROMPTS } from '../content/doodle'
import { DRAW_WORDS } from '../content/draw'
import * as G from '../golf/engine.js'
import { createRng } from '../pour/rng'
import {
  CHOPE_STOOLS, chopeFirst, chopeMover, chopeReplay, chopeValue, doodleOfDay, drawDeck, drawGuessMatches,
  golfCourse, golfScore, golfStrokes, simplify, strokesFit, syncJudge, syncMisses, syncSong, SYNC_LAST_BY_MS, type ChopeMoveRow,
} from './batch2'
import { nextDay } from './lineup'

describe('Doodle Day', () => {
  it('has 60 prompts and a different one every day for 60 days', () => {
    expect(new Set(DOODLE_PROMPTS.map((p) => p.id)).size).toBe(60)
    expect(DOODLE_PROMPTS.every((p) => p.prompt.length <= 40 && p.id.length <= 40)).toBe(true)
    let day = '2026-11-29'
    const seen = new Set<string>()
    for (let i = 0; i < 60; i++) { seen.add(doodleOfDay(day).id); day = nextDay(day) }
    expect(seen.size).toBe(60)
  })
  it('keeps strokes small', () => {
    const wiggle = Array.from({ length: 400 }, (_, i) => [i, 500 + (i % 2)]).flat()
    expect(simplify(wiggle).length).toBeLessThan(wiggle.length / 4)
    expect(simplify([0, 0, 1, 1])).toEqual([0, 0, 1, 1])
    expect(strokesFit([{ c: 0, w: 2, p: [1, 2, 3, 4] }])).toBe(true)
    expect(strokesFit([])).toBe(false)
    expect(strokesFit([{ c: 0, w: 1, p: Array(30_000).fill(500) }])).toBe(false)
  })
})

describe('Marina Mini Golf', () => {
  it('deals the same 3 different holes on both phones', () => {
    const a = golfCourse(123)
    expect(a.map((h) => h.id)).toEqual(golfCourse(123).map((h) => h.id))
    expect(new Set(a.map((h) => h.id)).size).toBe(3)
    expect(a.map((h) => G.HOLES.indexOf(h))).toEqual([...a.map((h) => G.HOLES.indexOf(h))].sort((x, y) => x - y))
    const variety = new Set(Array.from({ length: 30 }, (_, i) => golfCourse(i).map((h) => h.id).join()))
    expect(variety.size).toBeGreaterThan(10)
  })
  it('scores 40 minus strokes, unfinished holes counted as picked up', () => {
    const course = golfCourse(7)
    const caps = course.map((h) => G.capOf(h))
    expect(golfScore([2, 3, 2], course)).toBe(33)
    expect(golfScore([2, null, null], course)).toBe(40 - 2 - caps[1] - caps[2])
    expect(golfStrokes(golfScore([1, 1, 1], course))).toBe(3)
  })
  it('runs the real physics: a simple putter sinks some holes and every hole ends', () => {
    // Aim at the cup with power sized to stop there (rolling friction 17 units/s²); if a shot
    // barely moves the ball (blocked), try a random direction next.
    const rand = createRng(42)
    const strokes = G.HOLES.map((h) => {
      const s = G.newGame({ course: [h], holes: 1 })
      G.beginTurn(s)
      let stuck = false
      for (let guard = 0; guard < 40 && s.phase === 'aim'; guard++) {
        const [dx, dy] = [h.cup[0] - s.ball.x, h.cup[1] - s.ball.y]
        const from = { ...s.ball }
        const angle = stuck ? rand() * Math.PI * 2 : Math.atan2(dy, dx)
        G.shoot(s, angle, Math.min(1, (Math.sqrt(34 * Math.hypot(dx, dy)) * 1.12) / G.VMAX))
        for (let i = 0; i < 60 * 16 && (s.phase as string) === 'roll'; i++) G.tick(s, 1 / 60)
        stuck = Math.hypot(s.ball.x - from.x, s.ball.y - from.y) < 8
      }
      expect(['holed', 'capped']).toContain(s.phase)
      return s.phase === 'holed' ? s.strokes : G.capOf(h)
    })
    expect(strokes.filter((n, i) => n < G.capOf(G.HOLES[i])).length).toBeGreaterThanOrEqual(4)
  })
})

describe('Chope Wars', () => {
  it('lets whoever sent the challenge move first, then alternates', () => {
    expect(chopeFirst('Aleem')).toBe('Nurul')
    expect([1, 2, 3].map((n) => chopeMover(n, 'Aleem'))).toEqual(['Nurul', 'Aleem', 'Nurul'])
  })
  it('lays out the same board from a seed and replays a whole game the same way', () => {
    const { s: a } = chopeReplay(99, [], 'Aleem')
    const { s: b } = chopeReplay(99, [], 'Aleem')
    expect(C.geo(a).stools).toHaveLength(CHOPE_STOOLS)
    expect(a.tables.map((t) => t.type)).toEqual(b.tables.map((t) => t.type))
    // Play it out with the engine's own CPU, then replay the log.
    const live = chopeReplay(99, [], 'Aleem').s
    const log: ChopeMoveRow[] = []
    while (live.phase === 'play') {
      const m = C.cpuMove(live, 'hard')!
      log.push({ n: log.length + 1, player: chopeMover(log.length + 1, 'Aleem'), kind: m.type, stool: m.stool })
      C.apply(live, m)
    }
    const { s, seatOf } = chopeReplay(99, log, 'Aleem')
    expect(s.phase).toBe('over')
    expect(s.players.map((p) => p.score)).toEqual(live.players.map((p) => p.score))
    expect(chopeValue(s, seatOf('Nurul'))).toBe(live.players[0].score * 10 + live.players[0].tables)
    expect(log.filter((m) => m.kind === 'place')).toHaveLength(CHOPE_STOOLS)
  })
})

describe('Draw & Guess', () => {
  it('has plenty of words, one deck for both phones, and loose guessing', () => {
    expect(new Set(DRAW_WORDS).size).toBe(DRAW_WORDS.length)
    expect(DRAW_WORDS.length).toBeGreaterThanOrEqual(140)
    expect(drawDeck(5)).toEqual(drawDeck(5))
    expect(drawGuessMatches('ice  KACHANG!', 'Ice kachang')).toBe(true)
    expect(drawGuessMatches('cats', 'Cat')).toBe(true)
    expect(drawGuessMatches('ice', 'Ice kachang')).toBe(false)
  })
})

describe('In Sync', () => {
  it('plays the same 24-note rhythm on both phones, done by 21 seconds', () => {
    const song = syncSong(77)
    expect(song).toEqual(syncSong(77))
    expect(song).toHaveLength(24)
    expect(song[song.length - 1]).toBeLessThanOrEqual(SYNC_LAST_BY_MS)
    expect(song.slice(1).every((t, i) => t - song[i] >= 500)).toBe(true)
  })
  it('judges a tap against the nearest note not yet hit', () => {
    const notes = [2000, 2500, 3000]
    expect(syncJudge(notes, new Set(), 2060)).toBe(0)
    expect(syncJudge(notes, new Set([0]), 2060)).toBe(null)
    expect(syncJudge(notes, new Set(), 2250)).toBe(null)
    expect(syncJudge(notes, new Set(), 2390)).toBe(1)
    expect([3, 4, 9, 24, 30].map(syncMisses)).toEqual([0, 1, 2, 6, 6])
  })
})
