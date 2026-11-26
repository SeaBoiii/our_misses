import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { dailyOn, LINEUP_CYCLE, lineupFor, nextDay, playOn } from './lineup'

const migration = readFileSync(new URL('../../supabase/migrations/202611260001_more_ways_to_miss.sql', import.meta.url), 'utf8')
const block = migration.slice(migration.indexOf('-- lineup:start'), migration.indexOf('-- lineup:end'))

describe('the daily lineup', () => {
  it('matches the database’s cycle exactly', () => {
    const daily = /array\[('prove'[^\]]*)\]/.exec(block)![1].split(',').map((s) => s.trim().replace(/'/g, ''))
    const play = [...block.matchAll(/'(\[[^']*\])'::jsonb/g)].map((m) => JSON.parse(m[1]))
    expect(daily).toEqual(LINEUP_CYCLE.map((c) => c.daily))
    expect(play).toEqual(LINEUP_CYCLE.map((c) => c.play))
  })

  it('agrees with the SQL suite about real dates', () => {
    expect(lineupFor('2026-11-22')).toEqual({ day: '2026-11-22', daily: 'tot', play: ['tug', 'mrt', 'quiz'] })
    expect(lineupFor('2026-11-23')).toEqual({ day: '2026-11-23', daily: 'prove', play: ['tug', 'quiz', 'chapteh'] })
  })

  it('changes every day and gives every game a fair share', () => {
    let day = '2026-12-01'
    const seen: Record<string, number> = {}
    for (let i = 0; i < 30; i++) {
      const today = lineupFor(day)
      const tomorrow = lineupFor(nextDay(day))
      expect(tomorrow.daily).not.toBe(today.daily)
      expect([...tomorrow.play].sort()).not.toEqual([...today.play].sort())
      expect(new Set(today.play).size).toBe(3)
      for (const g of today.play) seen[g] = (seen[g] ?? 0) + 1
      day = nextDay(day)
    }
    expect(seen).toEqual({ tug: 18, pour: 18, quiz: 18, mrt: 18, chapteh: 18 })
  })

  it('shows everything while the lineup is unknown', () => {
    expect(dailyOn(null, 'prove') && dailyOn(null, 'tot')).toBe(true)
    expect(playOn(lineupFor('2026-11-22'), 'pour')).toBe(false)
    expect(playOn({ ...lineupFor('2026-11-22'), all: true }, 'pour')).toBe(true)
  })
})
