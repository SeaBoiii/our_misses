// The daily lineup: each Singapore day has one daily game, three versus games and one
// together game, on a 40-day cycle (made once by a script, so it's fair: every daily game
// comes up 8 times, every versus game 15 and every together game 10; no daily or together
// game two days running, and two days in a row share at most one versus game).
// Mirrors our_misses_private.lineup in the newest migration that has the lineup markers
// (lineup.test.ts compares them).
import type { VsGame } from './rules'

export type DailyGame = 'prove' | 'tot' | 'hth' | 'agak' | 'doodle'
export interface Lineup {
  day: string
  daily: DailyGame
  play: VsGame[]
  /** Demo/testing only: every game is on. */
  all?: boolean
}
export interface Lineups { today: Lineup; tomorrow: Lineup }

export const LINEUP_CYCLE: { daily: DailyGame; play: VsGame[] }[] = [
  { daily: 'prove', play: ['pour', 'quiz', 'sps', 'draw'] },
  { daily: 'doodle', play: ['kopi', 'chope', 'tug', 'cannot'] },
  { daily: 'agak', play: ['golf', 'mrt', 'kopi', 'chapteh'] },
  { daily: 'tot', play: ['chope', 'golf', 'sps', 'sync'] },
  { daily: 'hth', play: ['quiz', 'tug', 'mrt', 'draw'] },
  { daily: 'agak', play: ['pour', 'mrt', 'chope', 'chapteh'] },
  { daily: 'hth', play: ['kopi', 'golf', 'quiz', 'sync'] },
  { daily: 'prove', play: ['tug', 'pour', 'sps', 'cannot'] },
  { daily: 'tot', play: ['sps', 'mrt', 'chope', 'chapteh'] },
  { daily: 'doodle', play: ['tug', 'pour', 'quiz', 'sync'] },
  { daily: 'prove', play: ['golf', 'kopi', 'mrt', 'draw'] },
  { daily: 'doodle', play: ['quiz', 'sps', 'golf', 'cannot'] },
  { daily: 'hth', play: ['pour', 'tug', 'kopi', 'draw'] },
  { daily: 'tot', play: ['chope', 'golf', 'pour', 'sync'] },
  { daily: 'agak', play: ['mrt', 'kopi', 'chope', 'cannot'] },
  { daily: 'prove', play: ['tug', 'sps', 'quiz', 'chapteh'] },
  { daily: 'agak', play: ['golf', 'sps', 'pour', 'draw'] },
  { daily: 'tot', play: ['quiz', 'mrt', 'kopi', 'chapteh'] },
  { daily: 'doodle', play: ['chope', 'tug', 'golf', 'sync'] },
  { daily: 'hth', play: ['sps', 'quiz', 'chope', 'cannot'] },
  { daily: 'agak', play: ['tug', 'kopi', 'mrt', 'sync'] },
  { daily: 'doodle', play: ['pour', 'quiz', 'kopi', 'cannot'] },
  { daily: 'hth', play: ['sps', 'golf', 'pour', 'draw'] },
  { daily: 'prove', play: ['chope', 'tug', 'mrt', 'chapteh'] },
  { daily: 'tot', play: ['quiz', 'golf', 'tug', 'draw'] },
  { daily: 'agak', play: ['pour', 'chope', 'kopi', 'cannot'] },
  { daily: 'doodle', play: ['mrt', 'sps', 'pour', 'chapteh'] },
  { daily: 'tot', play: ['kopi', 'quiz', 'chope', 'sync'] },
  { daily: 'prove', play: ['sps', 'golf', 'tug', 'draw'] },
  { daily: 'hth', play: ['mrt', 'tug', 'pour', 'sync'] },
  { daily: 'tot', play: ['sps', 'chope', 'golf', 'cannot'] },
  { daily: 'prove', play: ['mrt', 'kopi', 'quiz', 'chapteh'] },
  { daily: 'agak', play: ['kopi', 'sps', 'tug', 'sync'] },
  { daily: 'hth', play: ['chope', 'pour', 'mrt', 'draw'] },
  { daily: 'doodle', play: ['quiz', 'golf', 'chope', 'chapteh'] },
  { daily: 'hth', play: ['pour', 'kopi', 'tug', 'cannot'] },
  { daily: 'tot', play: ['sps', 'golf', 'quiz', 'chapteh'] },
  { daily: 'prove', play: ['mrt', 'quiz', 'chope', 'draw'] },
  { daily: 'doodle', play: ['sps', 'kopi', 'pour', 'sync'] },
  { daily: 'agak', play: ['golf', 'mrt', 'tug', 'cannot'] },
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
