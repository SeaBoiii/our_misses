import { describe, expect, it } from 'vitest'
import { generateRace } from './generator'
import { isComplete, isSolved, pour } from './rules'

describe('Pour-off race puzzles', () => {
  it('build the same puzzle from the same seed on every phone', () => {
    const a = generateRace(123_456_789)
    const b = generateRace(123_456_789)
    expect(a.board).toEqual(b.board)
    expect(generateRace(42).board).not.toEqual(a.board)
  })

  it('are fair: six mixed colours, two spares, nothing pre-solved, no hidden layers', () => {
    for (const seed of [1, 7, 99, 2_000_000_000, 31_337]) {
      const p = generateRace(seed)
      expect(p.board).toHaveLength(8)
      expect(p.board.filter((b) => b.length === 0)).toHaveLength(2)
      expect(p.board.some(isComplete)).toBe(false)
      expect(p.initialHiddenCounts.every((n) => n === 0)).toBe(true)
    }
  })

  it('come with a verified solution', () => {
    for (const seed of [5, 50, 500, 5000]) {
      const p = generateRace(seed)
      let board = p.board
      for (const m of p.solution) board = pour(board, m.from, m.to)!
      expect(isSolved(board)).toBe(true)
    }
  })
})
