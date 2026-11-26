// The daily lineup: each Singapore day has one daily game and three of the five play games,
// on a 10-day cycle. Mirrors our_misses_private.lineup in
// supabase/migrations/202611260001_more_ways_to_miss.sql (lineup.test.ts compares them).
import type { VsGame } from './rules'

export type DailyGame = 'prove' | 'tot'
export interface Lineup {
  day: string
  daily: DailyGame
  play: VsGame[]
  /** Demo/testing only: every game is on. */
  all?: boolean
}
export interface Lineups { today: Lineup; tomorrow: Lineup }

export const LINEUP_CYCLE: { daily: DailyGame; play: VsGame[] }[] = [
  { daily: 'prove', play: ['tug', 'quiz', 'chapteh'] },
  { daily: 'tot', play: ['pour', 'mrt', 'chapteh'] },
  { daily: 'prove', play: ['tug', 'pour', 'quiz'] },
  { daily: 'tot', play: ['mrt', 'chapteh', 'tug'] },
  { daily: 'prove', play: ['pour', 'quiz', 'mrt'] },
  { daily: 'tot', play: ['tug', 'chapteh', 'pour'] },
  { daily: 'prove', play: ['quiz', 'mrt', 'chapteh'] },
  { daily: 'tot', play: ['tug', 'pour', 'mrt'] },
  { daily: 'prove', play: ['quiz', 'chapteh', 'pour'] },
  { daily: 'tot', play: ['tug', 'mrt', 'quiz'] },
]

const dayNumber = (day: string) => Math.round(Date.parse(`${day}T00:00:00Z`) / 86_400_000)
export const nextDay = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
export const previousDay = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)

/** The lineup for a Singapore date (YYYY-MM-DD). */
export function lineupFor(day: string): Lineup {
  const c = LINEUP_CYCLE[((dayNumber(day) % 10) + 10) % 10]
  return { day, daily: c.daily, play: [...c.play] }
}

/** With no lineup yet (or a failed fetch), show everything and let the database decide. */
export const dailyOn = (l: Lineup | null | undefined, g: DailyGame) => !l || Boolean(l.all) || l.daily === g
export const playOn = (l: Lineup | null | undefined, g: VsGame) => !l || Boolean(l.all) || l.play.includes(g)
