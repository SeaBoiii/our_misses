import { describe, expect, it } from 'vitest'
import {
  chargeFor, dayKey, emptyWeek, history, weekTotalsFrom, heartsAt, liveHearts, NoHeartsError, rallyFor, rallyState, ropePosition, sameBrainPartner,
  seasons, spendHeart, totals, weekKey, weekStartMs, type MissEvent, type Player,
} from './rules'

const MIN = 60_000
const T0 = Date.parse('2026-11-22T15:50:00Z') // Sunday 23:50 in Singapore
let nextId = 1
const wk = (week_start: string, aleem: number, nurul: number) => ({ ...emptyWeek(week_start), aleem, nurul })
const miss = (player: Player, t: number, charge = 1, rally_length = 1, rally_bonus = 0): MissEvent => ({
  id: nextId++, player, kind: 'miss', charge, rally_length, rally_bonus, points: charge + rally_bonus, ref_id: null, created_at: new Date(t).toISOString(),
})

describe('charging', () => {
  it('turns hold time into heart size and bursts past 2.8 s', () => {
    expect([0, 799, 800, 1599, 1600, 2799, 2800].map(chargeFor)).toEqual([1, 1, 2, 2, 3, 3, 'burst'])
  })
})

describe('hearts (same numbers as the SQL suite)', () => {
  it('refills one every 30 minutes up to 3, keeping partial progress', () => {
    let h = { stored: 3, refilledAtMs: T0 - 60 * MIN }
    h = spendHeart(h.stored, h.refilledAtMs, T0)
    expect(h).toEqual({ stored: 2, refilledAtMs: T0 })
    h = spendHeart(h.stored, h.refilledAtMs, T0 + 4 * MIN)
    h = spendHeart(h.stored, h.refilledAtMs, T0 + 5 * MIN)
    expect(heartsAt(h.stored, h.refilledAtMs, T0 + 10 * MIN)).toMatchObject({ hearts: 0, nextAt: T0 + 30 * MIN })
    expect(() => spendHeart(h.stored, h.refilledAtMs, T0 + 10 * MIN)).toThrow(NoHeartsError)
    expect(heartsAt(h.stored, h.refilledAtMs, T0 + 31 * MIN).hearts).toBe(1)
    h = spendHeart(h.stored, h.refilledAtMs, T0 + 31 * MIN)
    expect(heartsAt(h.stored, h.refilledAtMs, T0 + 31 * MIN)).toMatchObject({ hearts: 0, nextAt: T0 + 60 * MIN })
    expect(heartsAt(h.stored, h.refilledAtMs, T0 + 200 * MIN)).toMatchObject({ hearts: 3, nextAt: null })
  })

  it('counts refills that happened since the last snapshot', () => {
    const snap = { hearts: 1, next_at: new Date(T0).toISOString() }
    expect(liveHearts(snap, T0 - 1)).toEqual({ hearts: 1, nextAt: T0 })
    expect(liveHearts(snap, T0 + 31 * MIN)).toEqual({ hearts: 3, nextAt: null })
    expect(liveHearts(snap, T0 + 5 * MIN)).toEqual({ hearts: 2, nextAt: T0 + 30 * MIN })
  })
})

describe('rallies', () => {
  it('rewards each answer within 5 minutes with one more point, capped at +5', () => {
    const a1 = miss('Aleem', T0)
    expect(rallyFor(a1, 'Nurul', T0 + 2 * MIN)).toEqual({ rally_length: 2, rally_bonus: 1 })
    expect(rallyFor(a1, 'Aleem', T0 + 2 * MIN)).toEqual({ rally_length: 1, rally_bonus: 0 })
    expect(rallyFor(a1, 'Nurul', T0 + 6 * MIN)).toEqual({ rally_length: 1, rally_bonus: 0 })
    expect(rallyFor(miss('Aleem', T0, 1, 9), 'Nurul', T0 + MIN)).toEqual({ rally_length: 10, rally_bonus: 5 })
    expect(rallyFor(undefined, 'Nurul', T0)).toEqual({ rally_length: 1, rally_bonus: 0 })
  })

  it('tells the screen whose turn it is', () => {
    const events = [miss('Nurul', T0, 1, 3)]
    expect(rallyState(events, 'Aleem', T0 + MIN)).toEqual({ kind: 'answer', endsAt: T0 + 5 * MIN, length: 3, bonus: 3 })
    expect(rallyState(events, 'Nurul', T0 + MIN)).toEqual({ kind: 'waiting', endsAt: T0 + 5 * MIN, length: 3 })
    expect(rallyState(events, 'Aleem', T0 + 5 * MIN)).toBeNull()
  })
})

describe('Same Brain', () => {
  it('pairs an unseen partner miss from the last 60 s, once', () => {
    const n = miss('Nurul', T0)
    expect(sameBrainPartner([n], 'Aleem', T0 + 20_000, 0)).toBe(n)
    expect(sameBrainPartner([n], 'Aleem', T0 + 20_000, n.id)).toBeUndefined()
    expect(sameBrainPartner([n], 'Aleem', T0 + 61_000, 0)).toBeUndefined()
    expect(sameBrainPartner([n], 'Nurul', T0 + 20_000, 0)).toBeUndefined()
    const paired: MissEvent = { ...miss('Nurul', T0), kind: 'same_brain', charge: null, rally_length: null, points: 3, ref_id: n.id }
    expect(sameBrainPartner([n, paired], 'Aleem', T0 + 20_000, 0)).toBeUndefined()
  })
})

describe('seasons', () => {
  it('days and weeks follow Singapore time', () => {
    expect(dayKey(T0)).toBe('2026-11-22')
    expect(dayKey(T0 + 10 * MIN)).toBe('2026-11-23')
    expect(weekKey(T0)).toBe('2026-11-16')
    expect(weekKey(T0 + 10 * MIN)).toBe('2026-11-23')
    expect(weekStartMs(T0 + 10 * MIN)).toBe(T0 + 10 * MIN)
  })

  it('total the week and count trophies for finished weeks only', () => {
    const events = [miss('Aleem', T0, 3), miss('Nurul', T0 + 20 * MIN, 2)]
    expect(totals(events, weekStartMs(T0 + 20 * MIN))).toEqual({ Aleem: 0, Nurul: 2 })
    const s = seasons([
      wk('2026-11-23', 50, 0),
      wk('2026-11-16', 7, 9),
      wk('2026-11-09', 4, 4),
      wk('2026-11-02', 8, 1),
    ], '2026-11-23')
    expect(s.trophies).toEqual({ Aleem: 1, Nurul: 1 })
    expect(s.lastWeek).toEqual({ ...wk('2026-11-16', 7, 9), winner: 'Nurul' })
  })

  it('pull the knot toward whoever misses more', () => {
    expect(ropePosition(0, 0)).toBe(0)
    expect(ropePosition(10, 0)).toBeLessThan(0)
    expect(ropePosition(0, 10)).toBeGreaterThan(0)
    expect(Math.abs(ropePosition(0, 500))).toBeLessThanOrEqual(1)
  })
})

describe('history board', () => {
  it('rebuilds each week from the ledger like the database does', () => {
    const events: MissEvent[] = [
      miss('Aleem', T0, 3),
      miss('Nurul', T0 + 2 * 60_000, 2, 2, 1),
      miss('Aleem', T0 + 20 * 60_000, 1),
      miss('Nurul', T0 + 20.5 * 60_000, 1, 2, 1),
    ]
    const pair = (p: Player, ref: number): MissEvent => ({ ...miss(p, T0 + 20.5 * 60_000), kind: 'same_brain', charge: null, rally_length: null, points: 3, ref_id: ref })
    events.push(pair('Nurul', events[3].id), pair('Aleem', events[2].id))
    const bonus = (kind: 'prove_it' | 'duel', p: Player, points: number): MissEvent => ({ ...miss(p, T0 + 30 * 60_000), kind, charge: null, rally_length: null, points })
    events.push(bonus('prove_it', 'Aleem', 4), bonus('duel', 'Nurul', 5))
    expect(weekTotalsFrom(events)).toEqual([
      { ...emptyWeek('2026-11-23'), aleem: 1 + 3 + 4, nurul: 2 + 3 + 5, aleem_misses: 1, nurul_misses: 1, same_brains: 1, longest_rally: 2, aleem_proven: 1, nurul_duels: 1 },
      { ...emptyWeek('2026-11-16'), aleem: 3, nurul: 3, aleem_misses: 1, nurul_misses: 1, same_brains: 0, longest_rally: 2 },
    ])
  })

  it('swaps in the live week, counts trophies and the current winning streak', () => {
    const weeks = [wk('2026-11-23', 1, 0), wk('2026-11-16', 3, 9), wk('2026-11-09', 2, 5), wk('2026-11-02', 8, 1), wk('2026-10-26', 4, 4)]
    const h = history(weeks, '2026-11-23', wk('2026-11-23', 10, 12))
    expect(h.rows.map((r) => [r.week_start, r.winner, r.current])).toEqual([
      ['2026-11-23', 'Nurul', true],
      ['2026-11-16', 'Nurul', false],
      ['2026-11-09', 'Nurul', false],
      ['2026-11-02', 'Aleem', false],
      ['2026-10-26', 'tie', false],
    ])
    expect(h.rows[0].aleem).toBe(10)
    const withBluffs = history([{ ...wk('2026-11-23', 1, 0), nurul_bluffs: 2 }], '2026-11-23', wk('2026-11-23', 4, 4))
    expect([withBluffs.rows[0].aleem, withBluffs.rows[0].nurul_bluffs]).toEqual([4, 2])
    expect(h.trophies).toEqual({ Aleem: 1, Nurul: 2 })
    expect(h.streak).toEqual({ player: 'Nurul', weeks: 2 })
    expect(h.allTime).toEqual({ Aleem: 10 + 3 + 2 + 8 + 4, Nurul: 12 + 9 + 5 + 1 + 4 })
    expect(history([wk('2026-11-16', 2, 2)], '2026-11-23').streak).toBeNull()
    expect(history([], '2026-11-23').rows).toEqual([])
  })
})
