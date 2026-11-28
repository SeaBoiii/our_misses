import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { dailyOn, LINEUP_CYCLE, lineupFor, nextDay, playOn } from './lineup'

// The lineup the database runs is the one in the newest migration that defines it.
const dir = new URL('../../supabase/migrations/', import.meta.url)
const migration = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort().reverse()
  .map((f) => readFileSync(new URL(f, dir), 'utf8')).find((sql) => sql.includes('-- lineup:start'))!
const block = migration.slice(migration.indexOf('-- lineup:start'), migration.indexOf('-- lineup:end'))
const TOGETHER = ['chapteh', 'cannot', 'draw', 'sync']

describe('the daily lineup', () => {
  it('matches the database’s cycle exactly', () => {
    const daily = /'daily', \(array\[([^\]]*)\]/.exec(block)![1].split(',').map((s) => s.trim().replace(/'/g, ''))
    const play = [...block.matchAll(/'(\[[^']*\])'::jsonb/g)].map((m) => JSON.parse(m[1]))
    expect(block).toContain(`% ${LINEUP_CYCLE.length})`)
    expect(daily).toEqual(LINEUP_CYCLE.map((c) => c.daily))
    expect(play).toEqual(LINEUP_CYCLE.map((c) => c.play))
  })

  it('agrees with the SQL suite about real dates', () => {
    expect(lineupFor('2026-11-22')).toEqual({ day: '2026-11-22', daily: 'hth', play: ['sps', 'quiz', 'chope', 'cannot'] })
    expect(lineupFor('2026-11-23')).toEqual({ day: '2026-11-23', daily: 'agak', play: ['tug', 'kopi', 'mrt', 'sync'] })
  })

  it('changes every day and gives every game a fair share', () => {
    let day = '2026-12-01'
    const seen: Record<string, number> = {}
    for (let i = 0; i < 80; i++) {
      const today = lineupFor(day)
      const tomorrow = lineupFor(nextDay(day))
      expect(tomorrow.daily).not.toBe(today.daily)
      expect(tomorrow.play[3]).not.toBe(today.play[3])
      expect(tomorrow.play.slice(0, 3).filter((g) => today.play.includes(g)).length).toBeLessThanOrEqual(1)
      expect(new Set(today.play).size).toBe(4)
      expect(today.play.filter((g) => TOGETHER.includes(g))).toEqual([today.play[3]])
      for (const g of [today.daily, ...today.play]) seen[g] = (seen[g] ?? 0) + 1
      day = nextDay(day)
    }
    // Two whole cycles.
    expect(seen).toEqual({
      prove: 16, tot: 16, hth: 16, agak: 16, doodle: 16,
      tug: 30, pour: 30, quiz: 30, mrt: 30, kopi: 30, sps: 30, golf: 30, chope: 30,
      chapteh: 20, cannot: 20, draw: 20, sync: 20,
    })
  })

  it('shows everything while the lineup is unknown', () => {
    expect(dailyOn(null, 'prove') && dailyOn(null, 'doodle')).toBe(true)
    expect(playOn(lineupFor('2026-11-22'), 'mrt')).toBe(false)
    expect(playOn({ ...lineupFor('2026-11-22'), all: true }, 'mrt')).toBe(true)
  })
})
