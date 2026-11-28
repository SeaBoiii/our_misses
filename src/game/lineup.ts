// The daily lineup: each Singapore day has one daily game, three versus games and one
// together game, on a 28-day cycle (made once by a script, so it's fair: every daily game
// comes up 7 times, every play game 14 times, and no day repeats the day before).
// Mirrors our_misses_private.lineup in supabase/migrations/202611270001_batch1_games.sql
// (lineup.test.ts compares them).
import type { VsGame } from './rules'

export type DailyGame = 'prove' | 'tot' | 'hth' | 'agak'
export interface Lineup {
  day: string
  daily: DailyGame
  play: VsGame[]
  /** Demo/testing only: every game is on. */
  all?: boolean
}
export interface Lineups { today: Lineup; tomorrow: Lineup }

export const LINEUP_CYCLE: { daily: DailyGame; play: VsGame[] }[] = [
  { daily: 'tot', play: ['quiz', 'kopi', 'tug', 'chapteh'] },
  { daily: 'hth', play: ['mrt', 'pour', 'sps', 'cannot'] },
  { daily: 'prove', play: ['kopi', 'mrt', 'sps', 'chapteh'] },
  { daily: 'agak', play: ['quiz', 'tug', 'pour', 'cannot'] },
  { daily: 'prove', play: ['sps', 'quiz', 'pour', 'chapteh'] },
  { daily: 'hth', play: ['tug', 'mrt', 'kopi', 'cannot'] },
  { daily: 'agak', play: ['pour', 'quiz', 'mrt', 'chapteh'] },
  { daily: 'tot', play: ['sps', 'kopi', 'tug', 'cannot'] },
  { daily: 'hth', play: ['quiz', 'tug', 'mrt', 'chapteh'] },
  { daily: 'prove', play: ['kopi', 'pour', 'sps', 'cannot'] },
  { daily: 'agak', play: ['tug', 'kopi', 'pour', 'chapteh'] },
  { daily: 'tot', play: ['quiz', 'mrt', 'sps', 'cannot'] },
  { daily: 'prove', play: ['mrt', 'tug', 'sps', 'chapteh'] },
  { daily: 'tot', play: ['pour', 'kopi', 'quiz', 'cannot'] },
  { daily: 'agak', play: ['tug', 'sps', 'pour', 'chapteh'] },
  { daily: 'hth', play: ['kopi', 'mrt', 'quiz', 'cannot'] },
  { daily: 'tot', play: ['mrt', 'pour', 'kopi', 'chapteh'] },
  { daily: 'agak', play: ['sps', 'tug', 'quiz', 'cannot'] },
  { daily: 'prove', play: ['tug', 'mrt', 'pour', 'chapteh'] },
  { daily: 'hth', play: ['kopi', 'quiz', 'sps', 'cannot'] },
  { daily: 'prove', play: ['kopi', 'sps', 'mrt', 'chapteh'] },
  { daily: 'tot', play: ['pour', 'quiz', 'tug', 'cannot'] },
  { daily: 'hth', play: ['pour', 'tug', 'kopi', 'chapteh'] },
  { daily: 'agak', play: ['mrt', 'sps', 'quiz', 'cannot'] },
  { daily: 'tot', play: ['pour', 'mrt', 'quiz', 'chapteh'] },
  { daily: 'prove', play: ['sps', 'kopi', 'tug', 'cannot'] },
  { daily: 'agak', play: ['sps', 'tug', 'mrt', 'chapteh'] },
  { daily: 'hth', play: ['quiz', 'kopi', 'pour', 'cannot'] },
]

const dayNumber = (day: string) => Math.round(Date.parse(`${day}T00:00:00Z`) / 86_400_000)
export const nextDay = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
export const previousDay = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)

/** The lineup for a Singapore date (YYYY-MM-DD). */
export function lineupFor(day: string): Lineup {
  const n = LINEUP_CYCLE.length
  const c = LINEUP_CYCLE[((dayNumber(day) % n) + n) % n]
  return { day, daily: c.daily, play: [...c.play] }
}

/** With no lineup yet (or a failed fetch), show everything and let the database decide. */
export const dailyOn = (l: Lineup | null | undefined, g: DailyGame) => !l || Boolean(l.all) || l.daily === g
export const playOn = (l: Lineup | null | undefined, g: VsGame) => !l || Boolean(l.all) || l.play.includes(g)
