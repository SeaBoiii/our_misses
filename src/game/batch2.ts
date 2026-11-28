// Rules for Doodle Day, Marina Mini Golf, Chope Wars, Draw & Guess and In Sync. The database
// (supabase/migrations/202611280001_batch2_games.sql) is the referee in live play; these
// mirror it for the demo and the screens. Change both together.
import * as C from '../chope/engine.js'
import { DOODLE_PROMPTS } from '../content/doodle'
import { DRAW_WORDS } from '../content/draw'
import * as G from '../golf/engine.js'
import { createRng, hashSeed, shuffle } from '../pour/rng'
import type { Player } from './rules'

const dayNumber = (day: string) => Math.round(Date.parse(`${day}T00:00:00Z`) / 86_400_000)
const walk = <T,>(list: readonly T[], day: string) => list[((dayNumber(day) % list.length) + list.length) % list.length]

// ---- Strokes (Doodle Day and Draw & Guess) -------------------------------------------------
/** One stroke: colour 0-5, width 1-3, points as x, y pairs from 0 to 1000. */
export interface Stroke { c: number; w: number; p: number[] }
export const INKS = ['#2a1a1f', '#ef3b5d', '#2f7de1', '#23a26d', '#f2b134', '#ffffff'] as const
export const WIDTHS = [0, 7, 14, 30] as const
export const STROKES_MAX = 400
export const STROKES_MAX_BYTES = 60_000
/** Drop points closer than `gap` to the last one kept (the last point always stays). */
export function simplify(p: number[], gap = 6): number[] {
  if (p.length <= 4) return p
  const out = [p[0], p[1]]
  for (let i = 2; i < p.length - 2; i += 2) {
    if (Math.hypot(p[i] - out[out.length - 2], p[i + 1] - out[out.length - 1]) >= gap) out.push(p[i], p[i + 1])
  }
  out.push(p[p.length - 2], p[p.length - 1])
  return out
}
export const strokesFit = (s: Stroke[]) => s.length >= 1 && s.length <= STROKES_MAX && JSON.stringify(s).length <= STROKES_MAX_BYTES

// ---- Doodle Day --------------------------------------------------------------------------
export const DOODLE_SECONDS = 30
export const DOODLE_POINTS = 2
const DOODLE_ORDER = shuffle(DOODLE_PROMPTS, createRng('missu:doodle'))
/** The day's prompt: a fixed shuffle walked one a day. */
export const doodleOfDay = (day: string) => walk(DOODLE_ORDER, day)
export const doodleById = (id: string) => DOODLE_PROMPTS.find((d) => d.id === id)

// ---- Marina Mini Golf --------------------------------------------------------------------
export const GOLF_HOLES = 3
/** Golf reports 40 minus your strokes, so (like every other VS game) more is better. */
export const GOLF_BASE = 40
/** Three different holes, in course order, from the duel's seed. */
export function golfCourse(seed: number): G.Hole[] {
  const picks = shuffle(G.HOLES.map((_, i) => i), createRng(hashSeed(`missu:golf:${seed}`))).slice(0, GOLF_HOLES)
  return picks.sort((a, b) => a - b).map((i) => G.HOLES[i])
}
/** Strokes per hole so far (null = not finished): unfinished holes count as picked up. */
export function golfScore(perHole: (number | null)[], course: G.Hole[]) {
  const strokes = course.reduce((sum, h, i) => sum + (perHole[i] ?? G.capOf(h)), 0)
  return Math.max(0, GOLF_BASE - strokes)
}
export const golfStrokes = (score: number) => GOLF_BASE - score

// ---- Chope Wars --------------------------------------------------------------------------
/** A 3 × 3 food court: 24 stools, 12 moves each, a couple of minutes. */
export const CHOPE_SIZE = 'small' as const
export const CHOPE_STOOLS = 24
export const CHOPE_TURN_MS = 20_000
export interface ChopeMoveRow { n: number; player: Player; kind: 'place' | 'swap'; stool: number }
/** Whoever sent the challenge moves first; the one who accepted started the duel. */
export const chopeFirst = (startedBy: Player): Player => (startedBy === 'Aleem' ? 'Nurul' : 'Aleem')
export const chopeMover = (n: number, startedBy: Player): Player => (n % 2 === 1 ? chopeFirst(startedBy) : startedBy)
/** The board after these moves. Seat 0 is the first mover. Bad moves (never from the database) are skipped. */
export function chopeReplay(seed: number, moves: readonly ChopeMoveRow[], startedBy: Player) {
  const first = chopeFirst(startedBy)
  const names = first === 'Aleem' ? ['Aleem', 'Nurul'] : ['Nurul', 'Aleem']
  const s = C.newGame({ names, size: CHOPE_SIZE, rand: createRng(hashSeed(`missu:chope:${seed}`)) })
  for (const m of [...moves].sort((a, b) => a.n - b.n)) {
    try { C.apply(s, { type: m.kind, stool: m.stool }) } catch { /* out of step: ignore */ }
  }
  return { s, seatOf: (p: Player) => (p === first ? 0 : 1) as 0 | 1 }
}
/** What a phone reports: points × 10 + tables (the engine's tie-break). */
export const chopeValue = (s: C.ChopeState, seat: 0 | 1) => s.players[seat].score * 10 + s.players[seat].tables

// ---- Draw & Guess ------------------------------------------------------------------------
export const DRAW_SWAP_MS = 45_000
export const DRAW_SECOND_HALF = 100
export const drawDeck = (seed: number) => shuffle(DRAW_WORDS, createRng(hashSeed(`missu:draw:${seed}`)))
const squash = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '')
export const drawGuessMatches = (guess: string, word: string) => {
  const [g, w] = [squash(guess), squash(word)]
  return g.length > 0 && (g === w || g === `${w}s` || `${g}s` === w)
}

// ---- In Sync -----------------------------------------------------------------------------
export const SYNC_NOTES = 24
export const SYNC_WINDOW_MS = 130
export const SYNC_FIRST_MS = 2_000
export const SYNC_LAST_BY_MS = 21_000
/** The same rhythm on both phones: note times in ms after the start. */
export function syncSong(seed: number): number[] {
  const rand = createRng(hashSeed(`missu:sync:${seed}`))
  const gaps = [500, 500, 750, 750, 1000]
  for (;;) {
    const notes = [SYNC_FIRST_MS]
    while (notes.length < SYNC_NOTES) notes.push(notes[notes.length - 1] + gaps[Math.floor(rand() * gaps.length)])
    if (notes[notes.length - 1] <= SYNC_LAST_BY_MS) return notes
  }
}
/** Which note (if any) a tap at `ms` hits, given the notes already hit. */
export function syncJudge(notes: readonly number[], hit: ReadonlySet<number>, ms: number): number | null {
  let best: number | null = null
  for (let i = 0; i < notes.length; i++) {
    if (hit.has(i) || Math.abs(notes[i] - ms) > SYNC_WINDOW_MS) continue
    if (best === null || Math.abs(notes[i] - ms) < Math.abs(notes[best] - ms)) best = i
  }
  return best
}
/** Beats you both hit → misses each: every 4 is one, up to 6 a round. */
export const syncMisses = (both: number) => Math.min(6, Math.floor(both / 4))
