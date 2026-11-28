import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { dailyOn, LINEUP_CYCLE, lineupFor, nextDay, playOn } from './lineup'

const migration = readFileSync(new URL('../../supabase/migrations/202611270001_batch1_games.sql', import.meta.url), 'utf8')
const block = migration.slice(migration.indexOf('-- lineup:start'), migration.indexOf('-- lineup:end'))
const TOGETHER = ['chapteh', 'cannot']

describe('the daily lineup', () => {
  it('matches the database’s cycle exactly', () => {
    const daily = /'daily', \(array\[([^\]]*)\]/.exec(block)![1].split(',').map((s) => s.trim().replace(/'/g, ''))
    const play = [...block.matchAll(/'(\[[^']*\])'::jsonb/g)].map((m) => JSON.parse(m[1]))
    expect(block).toContain('% 28')
    expect(daily).toEqual(LINEUP_CYCLE.map((c) => c.daily))
    expect(play).toEqual(LINEUP_CYCLE.map((c) => c.play))
  })

  it('agrees with the SQL suite about real dates', () => {
    expect(lineupFor('2026-11-22')).toEqual({ day: '2026-11-22', daily: 'agak', play: ['quiz', 'tug', 'pour', 'cannot'] })
    expect(lineupFor('2026-11-23')).toEqual({ day: '2026-11-23', daily: 'prove', play: ['sps', 'quiz', 'pour', 'chapteh'] })
  })

  it('changes every day and gives every game a fair share', () => {
    let day = '2026-12-01'
    const seen: Record<string, number> = {}
    for (let i = 0; i < 56; i++) {
      const today = lineupFor(day)
      const tomorrow = lineupFor(nextDay(day))
      expect(tomorrow.daily).not.toBe(today.daily)
      expect(tomorrow.play.slice(0, 3).sort()).not.toEqual(today.play.slice(0, 3).sort())
      expect(new Set(today.play).size).toBe(4)
      expect(today.play.filter((g) => TOGETHER.includes(g))).toEqual([today.play[3]])
      for (const g of [today.daily, ...today.play]) seen[g] = (seen[g] ?? 0) + 1
      day = nextDay(day)
    }
    // Two whole cycles.
    expect(seen).toEqual({ prove: 14, tot: 14, hth: 14, agak: 14, tug: 28, pour: 28, quiz: 28, mrt: 28, kopi: 28, sps: 28, chapteh: 28, cannot: 28 })
  })

  it('shows everything while the lineup is unknown', () => {
    expect(dailyOn(null, 'prove') && dailyOn(null, 'hth')).toBe(true)
    expect(playOn(lineupFor('2026-11-22'), 'mrt')).toBe(false)
    expect(playOn({ ...lineupFor('2026-11-22'), all: true }, 'mrt')).toBe(true)
  })
})
