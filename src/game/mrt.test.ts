import { describe, expect, it } from 'vitest'
import { INTERCHANGES, LINES, mrtRound, STATIONS, type LineCode } from './mrt'

describe('the MRT map', () => {
  it('lists every line in running order with no repeated station numbers', () => {
    for (const line of Object.keys(STATIONS) as LineCode[]) {
      const numbers = STATIONS[line].map(([n]) => n)
      expect([...numbers].sort((a, b) => a - b)).toEqual(numbers)
      expect(new Set(numbers).size).toBe(numbers.length)
    }
  })

  it('agrees with itself about interchanges', () => {
    for (const [station, lines] of Object.entries(INTERCHANGES)) {
      for (const l of lines) expect(STATIONS[l].some(([, s]) => s === station), `${station} on ${l}`).toBe(true)
    }
  })
})

describe('Next Stop rounds', () => {
  it('deal the same 7 questions on both phones', () => {
    expect(mrtRound(77)).toEqual(mrtRound(77))
    expect(mrtRound(77).map((q) => q.id)).not.toEqual(mrtRound(78).map((q) => q.id))
  })

  it('always have 4 different answers, one of them right', () => {
    for (let seed = 1; seed <= 200; seed++) {
      for (const q of mrtRound(seed)) {
        expect(new Set(q.answers).size, q.q).toBe(4)
        expect(q.correct, q.q).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('gets "next stop" right', () => {
    for (let seed = 1; seed <= 200; seed++) {
      for (const q of mrtRound(seed).filter((x) => x.id.startsWith('mrt-next-'))) {
        const [, line, from, dir] = /^mrt-next-(\w\w)-(.+)-([fb])$/.exec(q.id)! // station names can contain "-" (one-north)
        const list = STATIONS[line as LineCode].map(([, s]) => s)
        const i = list.indexOf(from)
        expect(q.answers[q.correct]).toBe(dir === 'f' ? list[i + 1] : list[i - 1])
      }
    }
  })

  it('never asks "which line" about a station on two lines', () => {
    for (let seed = 1; seed <= 200; seed++) {
      for (const q of mrtRound(seed).filter((x) => x.id.startsWith('mrt-line-'))) {
        const station = q.id.slice('mrt-line-'.length)
        const lines = (Object.keys(LINES) as LineCode[]).filter((l) => STATIONS[l].some(([, s]) => s === station))
        expect(lines).toHaveLength(1)
        expect(q.answers[q.correct]).toBe(`${LINES[lines[0]].name} Line`)
      }
    }
  })
})
