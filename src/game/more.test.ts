import { describe, expect, it } from 'vitest'
import {
  flightMs, gradeKick, QUIZ_MAX, quizPoints, quizRound, rallyMisses, REASONS, THIS_OR_THAT, totById, totOfDay, totPoints,
} from './more'

describe('Why I miss you', () => {
  it('has the 10 reasons the database accepts', () => {
    expect(REASONS.map((r) => r.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })
})

describe('This or That', () => {
  it('gives both phones the same question each day, and stable ids', () => {
    expect(totOfDay('2026-11-28')).toEqual(totOfDay('2026-11-28'))
    const week = ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29'].map((d) => totOfDay(d).id)
    expect(new Set(week).size).toBeGreaterThan(4)
    expect(new Set(THIS_OR_THAT.map((q) => q.id)).size).toBe(THIS_OR_THAT.length)
    expect(THIS_OR_THAT.every((q) => q.id.length <= 40)).toBe(true)
    expect(totById('tot-1')).toMatchObject({ a: 'Chicken rice', b: 'Nasi lemak' })
  })

  it('scores like the database: right guess +2, same pick +1', () => {
    expect(totPoints(1, 0, 0)).toBe(2)
    expect(totPoints(0, 0, 0)).toBe(3)
    expect(totPoints(1, 1, 0)).toBe(0)
  })
})

describe('Kiasu Quiz', () => {
  it('deals the same 7 questions in the same order on both phones', () => {
    const a = quizRound(123)
    expect(a).toEqual(quizRound(123))
    expect(a).toHaveLength(7)
    expect(new Set(a.map((q) => q.id)).size).toBe(7)
    expect(quizRound(124).map((q) => q.id)).not.toEqual(a.map((q) => q.id))
    for (const q of a) expect(q.answers).toHaveLength(4)
  })

  it('keeps the right answer findable after shuffling', () => {
    for (const seed of [1, 2, 3]) for (const q of quizRound(seed)) expect(q.correct).toBeGreaterThanOrEqual(0)
  })

  it('scores 100 for right plus speed, and a perfect game matches the database cap', () => {
    expect(quizPoints(false, 9000)).toBe(0)
    expect(quizPoints(true, 0)).toBe(100)
    expect(quizPoints(true, 12_000)).toBe(220)
    expect(QUIZ_MAX).toBe(1540)
  })
})

describe('Chapteh', () => {
  it('grades kicks with Chapteh Kick’s windows', () => {
    expect([0, 60, -120, 200, 260].map(gradeKick)).toEqual(['perfect', 'perfect', 'good', 'ok', 'miss'])
  })
  it('speeds up as the rally grows, to a floor', () => {
    expect(flightMs(0)).toBe(1700)
    expect(flightMs(10)).toBeLessThan(flightMs(5))
    expect(flightMs(100)).toBe(850)
  })
  it('pays every 4 kicks, 6 a rally at most', () => {
    expect([3, 4, 21, 30, 99].map(rallyMisses)).toEqual([0, 1, 5, 6, 6])
  })
})
