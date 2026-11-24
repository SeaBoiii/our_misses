// The rules of the game. The database (supabase/migrations) is the referee in live play;
// these mirror it exactly for the demo and for the screen's countdowns. Change both together.

export type Player = 'Aleem' | 'Nurul'
export const PLAYERS: readonly Player[] = ['Aleem', 'Nurul']
export const partnerOf = (p: Player): Player => (p === 'Aleem' ? 'Nurul' : 'Aleem')

export interface MissEvent {
  id: number
  player: Player
  kind: 'miss' | 'same_brain' | 'prove_it' | 'duel'
  charge: number | null
  rally_length: number | null
  rally_bonus: number
  points: number
  ref_id: number | null
  created_at: string
}
export interface HeartState { hearts: number; next_at: string | null }
export interface Status { me: Player; now: string; week_start: string; hearts: Record<Player, HeartState> }
export interface SendResult { events: MissEvent[]; hearts: HeartState; now: string }
export interface WeekTotal {
  week_start: string
  aleem: number
  nurul: number
  aleem_misses: number
  nurul_misses: number
  same_brains: number
  longest_rally: number
  aleem_proven: number
  nurul_proven: number
  aleem_bluffs: number
  nurul_bluffs: number
  aleem_duels: number
  nurul_duels: number
}

/** One player's Prove It for a day. The partner's claim is hidden (only `finished`) until the reveal. */
export interface ProveEntry { finished: boolean; level?: number; target?: number; score?: number | null; passed?: boolean | null; started_at?: string }
export interface ProveDay { day: string; revealed: boolean; Aleem: ProveEntry | null; Nurul: ProveEntry | null }
export interface ProveStatus { now: string; day: string; today: ProveDay; last: ProveDay | null }
export interface ProveStart { level: number; target: number; started_at: string }
/** VS games. tug: 15 s of tapping. pour: a water sort race on one shared puzzle. */
export type VsGame = 'tug' | 'pour'
export interface Duel {
  id: number
  game: VsGame
  seed: number
  started_by: Player
  starts_at: string
  /** tug: taps. pour: 1,000,000 − solve time in ms, or the bottles completed if unsolved. */
  aleem_score: number | null
  nurul_score: number | null
  winner: Player | 'tie' | null
  points: number
  settled: boolean
  now: string
}
export const DUEL_COUNTDOWN_MS = 4_000
export const VS_LENGTH_MS: Record<VsGame, number> = { tug: 15_000, pour: 180_000 }
export const DUEL_POINTS = 5
export const SOLVED_BASE = 1_000_000
/** Mirrors the database: how a finished VS game is scored. */
export function vsScore(game: VsGame, value: number, solved: boolean, elapsedMs: number) {
  if (game === 'tug') return Math.min(300, Math.max(0, value))
  return solved ? SOLVED_BASE - Math.min(SOLVED_BASE - 1, Math.floor(elapsedMs)) : Math.min(20, Math.max(0, value))
}
/** "48 taps", "solved in 1:02.4", "3 bottles". */
export function describeVsScore(game: VsGame, score: number | null) {
  if (score === null) return 'no score'
  if (game === 'tug') return `${score} tap${score === 1 ? '' : 's'}`
  if (score >= SOLVED_BASE / 2) {
    const ms = SOLVED_BASE - score
    const m = Math.floor(ms / 60_000)
    const s = ((ms % 60_000) / 1000).toFixed(1)
    return `solved in ${m > 0 ? `${m}:${s.padStart(4, '0')}` : `${s}s`}`
  }
  return `${score} bottle${score === 1 ? '' : 's'}`
}

export const emptyWeek = (week_start: string): WeekTotal => ({
  week_start, aleem: 0, nurul: 0, aleem_misses: 0, nurul_misses: 0, same_brains: 0, longest_rally: 0,
  aleem_proven: 0, nurul_proven: 0, aleem_bluffs: 0, nurul_bluffs: 0, aleem_duels: 0, nurul_duels: 0,
})

export const HEART_CAP = 3
export const REFILL_MS = 30 * 60_000
export const RALLY_MS = 5 * 60_000
export const SAME_BRAIN_MS = 60_000
export const SAME_BRAIN_POINTS = 3
export const RALLY_BONUS_CAP = 5
export const WEEK_MS = 7 * 86_400_000
const SGT_OFFSET_MS = 8 * 3_600_000

export class NoHeartsError extends Error {
  readonly nextAt: string | null
  constructor(nextAt: string | null) {
    super('No hearts left')
    this.nextAt = nextAt
  }
}

/** Hold length → heart size. Past 2.8 s the heart bursts and goes as a 1. */
export const CHARGE_STEPS_MS = [800, 1600, 2800] as const
export function chargeFor(heldMs: number): 1 | 2 | 3 | 'burst' {
  if (heldMs < CHARGE_STEPS_MS[0]) return 1
  if (heldMs < CHARGE_STEPS_MS[1]) return 2
  if (heldMs < CHARGE_STEPS_MS[2]) return 3
  return 'burst'
}

export function heartsAt(stored: number, refilledAtMs: number, t: number) {
  const regained = Math.max(0, Math.floor((t - refilledAtMs) / REFILL_MS))
  const hearts = Math.min(HEART_CAP, stored + regained)
  const nextAt = stored + regained >= HEART_CAP ? null : refilledAtMs + REFILL_MS * (regained + 1)
  return { hearts, nextAt, regained }
}

/** Spend one heart; keeps partial refill progress like the database does. */
export function spendHeart(stored: number, refilledAtMs: number, t: number) {
  const { hearts, nextAt, regained } = heartsAt(stored, refilledAtMs, t)
  if (hearts < 1) throw new NoHeartsError(nextAt === null ? null : new Date(nextAt).toISOString())
  return {
    stored: hearts - 1,
    refilledAtMs: hearts === HEART_CAP ? t : refilledAtMs + REFILL_MS * regained,
  }
}

export function rallyFor(lastMiss: MissEvent | undefined, me: Player, t: number) {
  if (lastMiss && lastMiss.rally_length !== null && Date.parse(lastMiss.created_at) > t - RALLY_MS) {
    if (lastMiss.player !== me) {
      const rally_length = lastMiss.rally_length + 1
      return { rally_length, rally_bonus: Math.min(RALLY_BONUS_CAP, rally_length - 1) }
    }
    return { rally_length: lastMiss.rally_length, rally_bonus: 0 }
  }
  return { rally_length: 1, rally_bonus: 0 }
}

/** The partner's unseen, unpaired miss from the last 60 s, if any. */
export function sameBrainPartner(events: readonly MissEvent[], me: Player, t: number, seenId: number) {
  const paired = new Set(events.filter((e) => e.kind === 'same_brain').map((e) => e.ref_id))
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]
    if (e.kind !== 'miss' || e.player === me) continue
    if (Date.parse(e.created_at) <= t - SAME_BRAIN_MS) break
    if (e.id > seenId && !paired.has(e.id)) return e
  }
  return undefined
}

/** Monday 00:00 in Singapore for the season containing t (Singapore has no DST). */
export function weekStartMs(t: number) {
  const wall = new Date(t + SGT_OFFSET_MS)
  const mondayIndex = (wall.getUTCDay() + 6) % 7
  const midnight = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate())
  return midnight - mondayIndex * 86_400_000 - SGT_OFFSET_MS
}
/** The Singapore calendar day of t, YYYY-MM-DD. */
export function dayKey(t: number) {
  return new Date(t + SGT_OFFSET_MS).toISOString().slice(0, 10)
}
export function weekKey(t: number) {
  return new Date(weekStartMs(t) + SGT_OFFSET_MS).toISOString().slice(0, 10)
}

export function totals(events: readonly MissEvent[], fromMs = -Infinity, toMs = Infinity) {
  const sum = { Aleem: 0, Nurul: 0 } as Record<Player, number>
  for (const e of events) {
    const t = Date.parse(e.created_at)
    if (t >= fromMs && t < toMs) sum[e.player] += e.points
  }
  return sum
}

/** Knot position from -1 (all the way to Aleem, left) to 1 (Nurul, right). */
export function ropePosition(aleem: number, nurul: number) {
  return Math.tanh((nurul - aleem) / 14)
}

export type RallyState =
  | { kind: 'answer'; endsAt: number; bonus: number; length: number }
  | { kind: 'waiting'; endsAt: number; length: number }

export function rallyState(events: readonly MissEvent[], me: Player, t: number): RallyState | null {
  const last = [...events].reverse().find((e) => e.kind === 'miss')
  if (!last || last.rally_length === null) return null
  const endsAt = Date.parse(last.created_at) + RALLY_MS
  if (endsAt <= t) return null
  if (last.player !== me) {
    return { kind: 'answer', endsAt, length: last.rally_length, bonus: Math.min(RALLY_BONUS_CAP, last.rally_length) }
  }
  return { kind: 'waiting', endsAt, length: last.rally_length }
}

export interface Seasons {
  trophies: Record<Player, number>
  lastWeek: { week_start: string; aleem: number; nurul: number; winner: Player | 'tie' } | null
}
export function seasons(weeks: readonly WeekTotal[], currentWeek: string): Seasons {
  const trophies = { Aleem: 0, Nurul: 0 } as Record<Player, number>
  let lastWeek: Seasons['lastWeek'] = null
  const sorted = [...weeks].sort((a, b) => b.week_start.localeCompare(a.week_start))
  for (const w of sorted) {
    if (w.week_start >= currentWeek) continue
    const winner: Player | 'tie' = w.aleem === w.nurul ? 'tie' : w.aleem > w.nurul ? 'Aleem' : 'Nurul'
    if (winner !== 'tie') trophies[winner]++
    lastWeek ??= { ...w, winner }
  }
  return { trophies, lastWeek }
}

/** Hearts as of now, from a server snapshot that may be a few minutes old. */
export function liveHearts(h: HeartState, now: number) {
  let hearts = h.hearts
  let next = h.next_at === null ? null : Date.parse(h.next_at)
  while (next !== null && now >= next && hearts < HEART_CAP) {
    hearts++
    next = hearts >= HEART_CAP ? null : next + REFILL_MS
  }
  return { hearts, nextAt: next }
}

/** The same per-week numbers the database's our_misses_weeks() returns, from raw events. */
export function weekTotalsFrom(events: readonly MissEvent[]): WeekTotal[] {
  const byWeek = new Map<string, WeekTotal>()
  for (const e of events) {
    const k = weekKey(Date.parse(e.created_at))
    const w = byWeek.get(k) ?? emptyWeek(k)
    if (e.player === 'Aleem') w.aleem += e.points
    else w.nurul += e.points
    if (e.kind === 'miss') {
      if (e.player === 'Aleem') w.aleem_misses++
      else w.nurul_misses++
      w.longest_rally = Math.max(w.longest_rally, e.rally_length ?? 0)
    } else if (e.kind === 'same_brain') {
      if (e.player === 'Aleem') w.same_brains++ // one of the pair's two rows
    } else if (e.kind === 'prove_it') {
      if (e.player === 'Aleem') w.aleem_proven++
      else w.nurul_proven++
    } else if (e.player === 'Aleem') w.aleem_duels++
    else w.nurul_duels++
    byWeek.set(k, w)
  }
  return [...byWeek.values()].sort((a, b) => b.week_start.localeCompare(a.week_start))
}

export interface HistoryRow extends WeekTotal { winner: Player | 'tie'; current: boolean }
export interface History {
  rows: HistoryRow[]
  trophies: Record<Player, number>
  allTime: Record<Player, number>
  streak: { player: Player; weeks: number } | null
}

/** The history board: every season newest first, with the live week swapped in from events. */
export function history(weeks: readonly WeekTotal[], currentWeek: string, liveWeek?: WeekTotal): History {
  const merged = weeks.filter((w) => w.week_start !== currentWeek)
  const stored = weeks.find((w) => w.week_start === currentWeek)
  // Bluffs aren't in the ledger, so the live week keeps the database's count of them.
  if (liveWeek) merged.push({ ...liveWeek, aleem_bluffs: stored?.aleem_bluffs ?? 0, nurul_bluffs: stored?.nurul_bluffs ?? 0 })
  else if (stored) merged.push(stored)
  merged.sort((a, b) => b.week_start.localeCompare(a.week_start))
  const rows: HistoryRow[] = merged.map((w) => ({
    ...w,
    winner: w.aleem === w.nurul ? 'tie' : w.aleem > w.nurul ? 'Aleem' : 'Nurul',
    current: w.week_start === currentWeek,
  }))
  const trophies = { Aleem: 0, Nurul: 0 } as Record<Player, number>
  const allTime = { Aleem: 0, Nurul: 0 } as Record<Player, number>
  let streak = null as History['streak']
  let streakOpen = true
  for (const r of rows) {
    allTime.Aleem += r.aleem
    allTime.Nurul += r.nurul
    if (r.current) continue
    if (r.winner !== 'tie') trophies[r.winner]++
    if (!streakOpen) continue
    if (r.winner === 'tie' || (streak && streak.player !== r.winner)) streakOpen = false
    else streak = { player: r.winner, weeks: (streak?.weeks ?? 0) + 1 }
  }
  return { rows, trophies, allTime, streak }
}
