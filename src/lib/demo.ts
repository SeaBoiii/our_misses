// A pretend partner for trying the game without a database. Lives in this browser only.
// Mirrors the database's rules (supabase/migrations) closely enough to play every mode.
import type { Backend, Change, Signal } from './backend'
import {
  agakScore, cannotDeck, cannotMisses, CANNOT_SWAP_MS, demoHints, HTH_POINTS, hthOfDay, spsState, SPS_THROWS, TARGET_MAX, TARGET_MIN,
} from '../game/batch1'
import {
  chopeMover, chopeReplay, chopeValue, CHOPE_STOOLS, DOODLE_POINTS, doodleOfDay, DRAW_SECOND_HALF, DRAW_SWAP_MS, drawDeck,
  golfCourse, golfScore, strokesFit, syncMisses, syncSong, type ChopeMoveRow, type Stroke,
} from '../game/batch2'
import * as C from '../chope/engine.js'
import * as G from '../golf/engine.js'
import { proveTarget } from '../game/catch'
import { AGAK_CARDS } from '../content/agak'
import { lineupFor, nextDay } from '../game/lineup'
import {
  flightMs, HANDS_DAILY_CAP, HANDS_SECONDS_PER_MISS, QUIZ_QUESTIONS, QUIZ_SECONDS, quizPoints, RALLY_DAILY_CAP, rallyMisses,
  randomZone, REASONS, TAG_WINDOW_MS, totOfDay, totPoints,
} from '../game/more'
import {
  dayKey, DUEL_COUNTDOWN_MS, DUEL_POINTS, emptyWeek, HEART_CAP, heartsAt, partnerOf, PLAYERS, rallyFor,
  sameBrainPartner, spendHeart, VS_LENGTH_MS, vsScore, WEEK_MS, weekKey, weekStartMs, weekTotalsFrom,
  type AgakRound, type DoodleDay, type DoodleEntry, type Duel, type HthDay, type HthEntry, type MissEvent, type Player, type ProveDay, type ProveEntry,
  type ReasonCount, type SendResult, type SpsThrow, type TotDay, type TotEntry, type VsGame, type WeekTotal,
} from '../game/rules'

interface TotRow { question: string; mine: number; guess: number; settled: boolean }
interface HthRow { question: string; answer: string }
interface AgakRow { psychic: Player; card: string; target: number; clue: string | null; needle: number | null; score: number | null }

interface ProveRow { level: number; started_at: number; finished_at: number | null; score: number | null; passed: boolean | null; settled: boolean }
interface DuelRow {
  id: number
  game: VsGame
  seed: number
  started_by: Player
  starts_at: number
  aleem_score: number | null
  nurul_score: number | null
  winner: Player | 'tie' | null
  points: number
  settled_at: number | null
}
interface DemoSave {
  events: MissEvent[]
  hearts: Record<Player, { stored: number; refilledAtMs: number }>
  nextId: number
  /** Made-up past seasons so the history board has something to show in the demo. */
  pastWeeks?: WeekTotal[]
  prove?: Record<string, Partial<Record<Player, ProveRow>>>
  duels?: DuelRow[]
  tot?: Record<string, Partial<Record<Player, TotRow>>>
  hth?: Record<string, Partial<Record<Player, HthRow>>>
  agak?: Record<string, AgakRow>
  sps?: Record<number, Record<Player, SpsThrow[]>>
  doodle?: Record<string, Partial<Record<Player, { prompt: string; strokes: Stroke[] }>>>
  chope?: Record<number, ChopeMoveRow[]>
}
const KEY = 'our_misses_demo_v1'
// Test switches: ?samebrain makes the pretend partner always miss you at the same moment;
// ?quiet keeps her from sending or playing anything on her own (she still answers VS games,
// This or That and Hold hands, but plays them slowly); ?duelme / ?pourme / ?quizme / ?chaptehme
// make her challenge you right away; ?handsme makes her ask to hold hands; ?fastbot makes her
// solve a Pour-off in 12 seconds. ?kopime / ?spsme / ?cannotme challenge you to the batch 1 games,
// and ?golfme / ?chopeme / ?drawme / ?syncme to the batch 2 ones.
const params = new URLSearchParams(location.search)
const QUIET = params.has('quiet')
// ?allgames turns the daily rotation off; ?lineupday=YYYY-MM-DD plays as if it were that day.
const ALL_GAMES = params.has('allgames')
const LINEUP_DAY = /^\d{4}-\d{2}-\d{2}$/.test(params.get('lineupday') ?? '') ? params.get('lineupday')! : null
const SAME_BRAIN_CHANCE = params.has('samebrain') ? 1 : QUIET ? 0 : 0.2
const REPLY_CHANCE = QUIET ? 0 : 0.7
const PROVE_GRACE_MS = 120_000
const roll = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1))

function load(): DemoSave {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const saved = JSON.parse(raw) as DemoSave
      saved.pastWeeks ??= pretendPastWeeks()
      return saved
    }
  } catch { /* storage blocked: start fresh */ }
  const t = Date.now()
  return { events: [], hearts: { Aleem: { stored: HEART_CAP, refilledAtMs: t }, Nurul: { stored: HEART_CAP, refilledAtMs: t } }, nextId: 1, pastWeeks: pretendPastWeeks() }
}

function pretendPastWeeks(): WeekTotal[] {
  const thisWeek = weekStartMs(Date.now())
  return Array.from({ length: 5 }, (_, i) => {
    const aleem_misses = roll(8, 30)
    const nurul_misses = roll(8, 30)
    const same_brains = roll(0, 3)
    const [aleem_proven, nurul_proven, aleem_duels, nurul_duels] = [roll(1, 5), roll(1, 5), roll(0, 2), roll(0, 2)]
    return {
      ...emptyWeek(weekKey(thisWeek - (i + 1) * WEEK_MS)),
      aleem: aleem_misses * 2 + roll(0, 12) + same_brains * 3 + aleem_proven * 4 + aleem_duels * 5,
      nurul: nurul_misses * 2 + roll(0, 12) + same_brains * 3 + nurul_proven * 4 + nurul_duels * 5,
      aleem_misses, nurul_misses, same_brains, longest_rally: roll(1, 9),
      aleem_proven, nurul_proven, aleem_bluffs: roll(0, 2), nurul_bluffs: roll(0, 2), aleem_duels, nurul_duels,
    }
  })
}

export function clearDemo() {
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
}

export function demoBackend(me: Player): Backend {
  const partner = partnerOf(me)
  const save = load()
  save.prove ??= {}
  save.duels ??= []
  save.tot ??= {}
  save.hth ??= {}
  save.agak ??= {}
  save.sps ??= {}
  save.doodle ??= {}
  save.chope ??= {}
  const prove = save.prove
  const duels = save.duels
  const tot = save.tot
  const hth = save.hth
  const agak = save.agak
  const sps = save.sps
  const doodle = save.doodle
  const chope = save.chope
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(save)) } catch { /* ignore */ } }
  let onEvent: ((e: MissEvent, change: Change) => void) | null = null
  let onPresence: ((here: Player[]) => void) | null = null
  let onSignal: ((s: Signal) => void) | null = null
  let partnerHere = true
  const timers = new Set<ReturnType<typeof setTimeout>>()
  const later = (ms: number, fn: () => void) => {
    const id = setTimeout(() => { timers.delete(id); fn() }, ms)
    timers.add(id)
  }
  const pause = (ms = 120) => new Promise((r) => setTimeout(r, ms))

  function heartsOf(p: Player, t: number) {
    const h = save.hearts[p]
    const { hearts, nextAt } = heartsAt(h.stored, h.refilledAtMs, t)
    return { hearts, next_at: nextAt === null ? null : new Date(nextAt).toISOString() }
  }

  function record(player: Player, kind: 'prove_it' | 'duel' | 'hands' | 'tot' | 'rally' | 'hth' | 'agak' | 'cannot' | 'doodle' | 'draw' | 'sync', points: number, t: number) {
    const e: MissEvent = { id: save.nextId++, player, kind, charge: null, rally_length: null, rally_bonus: 0, points, ref_id: null, created_at: new Date(t).toISOString(), reason: null }
    save.events.push(e)
    later(0, () => onEvent?.(e, 'insert'))
  }
  const todayPoints = (p: Player, kind: MissEvent['kind'], t: number) => save.events
    .filter((e) => e.player === p && e.kind === kind && dayKey(Date.parse(e.created_at)) === dayKey(t))
    .reduce((sum, e) => sum + e.points, 0)

  function apply(player: Player, charge: number, seenId: number): SendResult {
    const t = Date.now()
    const h = save.hearts[player]
    save.hearts[player] = spendHeart(h.stored, h.refilledAtMs, t)
    const lastMiss = [...save.events].reverse().find((e) => e.kind === 'miss')
    const rally = rallyFor(lastMiss, player, t)
    const at = new Date(t).toISOString()
    const miss: MissEvent = { id: save.nextId++, player, kind: 'miss', charge, ...rally, points: charge + rally.rally_bonus, ref_id: null, created_at: at }
    const created = [miss]
    const pairWith = sameBrainPartner(save.events, player, t, seenId)
    save.events.push(miss)
    if (pairWith) {
      for (const [p, ref] of [[player, miss.id], [pairWith.player, pairWith.id]] as const) {
        const bonus: MissEvent = { id: save.nextId++, player: p, kind: 'same_brain', charge: null, rally_length: null, rally_bonus: 0, points: 3, ref_id: ref, created_at: at }
        save.events.push(bonus)
        created.push(bonus)
      }
    }
    persist()
    return { events: created, hearts: heartsOf(player, t), now: at }
  }

  function partnerSends(charge: number) {
    try {
      const seen = Math.max(0, ...save.events.filter((e) => e.player === me).map((e) => e.id))
      const result = apply(partner, charge, seen)
      result.events.forEach((e) => onEvent?.(e, 'insert'))
      // She usually says why, a moment later.
      const miss = result.events[0]
      if (!QUIET && Math.random() < 0.6) {
        later(2_000 + Math.random() * 3_000, () => {
          miss.reason = REASONS[Math.floor(Math.random() * REASONS.length)].id
          persist()
          onEvent?.({ ...miss }, 'update')
        })
      }
    } catch { /* partner is out of hearts */ }
  }

  // ---- settling, as our_misses_private.settle does ----------------------------------
  function settleDuel(d: DuelRow, t: number) {
    if (d.settled_at !== null) return
    const throws = sps[d.id] ?? { Aleem: [], Nurul: [] }
    // Scissors-Paper-Stone is scored from the throws, never from what a phone says.
    const a = d.game === 'sps' ? spsState(throws.Aleem, throws.Nurul).mine : d.aleem_score ?? 0
    const n = d.game === 'sps' ? spsState(throws.Nurul, throws.Aleem).mine : d.nurul_score ?? 0
    if (d.game === 'cannot' || d.game === 'draw' || d.game === 'sync') {
      // Together: words (or every 4 beats) both phones agree on, 6 a game and 12 a day.
      const together = Math.min(a, n)
      const kind = d.game
      Object.assign(d, { aleem_score: a, nurul_score: n, winner: 'tie', points: 0, settled_at: t })
      for (const p of PLAYERS) {
        const earned = kind === 'sync'
          ? Math.max(0, Math.min(syncMisses(together), 12 - todayPoints(p, 'sync', t)))
          : cannotMisses(together, todayPoints(p, kind, t))
        if (earned > 0) record(p, kind, earned, t)
      }
      return
    }
    if (d.game === 'chapteh') {
      // Together: nobody wins; the rally counts as far as both phones agree.
      const rally = Math.min(a, n)
      Object.assign(d, { aleem_score: a, nurul_score: n, winner: 'tie', points: 0, settled_at: t })
      for (const p of PLAYERS) {
        const earned = Math.max(0, Math.min(rallyMisses(rally), RALLY_DAILY_CAP - todayPoints(p, 'rally', t)))
        if (earned > 0) record(p, 'rally', earned, t)
      }
      return
    }
    const winner: Player | 'tie' = a === n ? 'tie' : a > n ? 'Aleem' : 'Nurul'
    const paid = duels.some((x) => x.points > 0 && dayKey(x.starts_at) === dayKey(d.starts_at))
    Object.assign(d, { aleem_score: a, nurul_score: n, winner, points: winner !== 'tie' && !paid ? DUEL_POINTS : 0, settled_at: t })
    if (d.points > 0) record(winner as Player, 'duel', DUEL_POINTS, t)
  }

  function settle(t = Date.now()) {
    const today = dayKey(t)
    for (const [day, rows] of Object.entries(prove)) {
      for (const p of PLAYERS) {
        const r = rows[p]
        if (r && r.finished_at === null && r.started_at < t - PROVE_GRACE_MS) Object.assign(r, { score: 0, passed: false, finished_at: r.started_at + PROVE_GRACE_MS })
      }
      const done = PLAYERS.filter((p) => rows[p] && rows[p]!.finished_at !== null && !rows[p]!.settled)
      if (done.length > 0 && (day < today || done.length === 2)) {
        for (const p of done) {
          const r = rows[p]!
          if (r.passed) record(p, 'prove_it', r.level, r.finished_at!)
          r.settled = true
        }
      }
    }
    for (const d of duels) if (d.settled_at === null && d.starts_at < t - VS_LENGTH_MS[d.game] - 60_000) settleDuel(d, t)
    persist()
  }

  function proveDay(day: string | undefined): ProveDay | null {
    if (!day) return null
    const rows = prove[day] ?? {}
    const revealed = PLAYERS.some((p) => rows[p]?.settled)
    const entry = (p: Player): ProveEntry | null => {
      const r = rows[p]
      if (!r) return null
      if (p !== me && !revealed) return { finished: r.finished_at !== null }
      return { finished: r.finished_at !== null, level: r.level, target: proveTarget(r.level), score: r.score, passed: r.passed, started_at: new Date(r.started_at).toISOString() }
    }
    return { day, revealed, Aleem: entry('Aleem'), Nurul: entry('Nurul') }
  }

  function proveStatus() {
    const t = Date.now()
    settle(t)
    const today = dayKey(t)
    const last = Object.keys(prove).filter((d) => d < today).sort().pop()
    return { now: new Date(t).toISOString(), day: today, today: proveDay(today)!, last: proveDay(last) }
  }

  function partnerProves() {
    // She plays her round a few seconds after you, sometimes over-claiming.
    const today = dayKey(Date.now())
    if (QUIET || !partnerHere || prove[today]?.[partner]) return
    later(3_000 + Math.random() * 4_000, () => {
      const t = Date.now()
      const level = roll(2, 6)
      const score = Math.max(0, proveTarget(level) + roll(-7, 5))
      prove[today] = { ...prove[today], [partner]: { level, started_at: t - 24_000, finished_at: t, score, passed: score >= proveTarget(level), settled: false } }
      settle(t)
      onSignal?.({ type: 'prove_played' })
    })
  }

  // ---- VS games -------------------------------------------------------------------
  const duelJson = (d: DuelRow): Duel => ({
    id: d.id, game: d.game, seed: d.seed, started_by: d.started_by, starts_at: new Date(d.starts_at).toISOString(),
    aleem_score: d.aleem_score, nurul_score: d.nurul_score, winner: d.winner, points: d.points,
    settled: d.settled_at !== null, now: new Date().toISOString(),
  })
  const scoreKey = (p: Player): 'aleem_score' | 'nurul_score' => (p === 'Aleem' ? 'aleem_score' : 'nurul_score')

  const lineupDay = () => LINEUP_DAY ?? dayKey(Date.now())
  const onToday = (game: string) => ALL_GAMES || (['prove', 'tot', 'hth', 'agak', 'doodle'].includes(game) ? lineupFor(lineupDay()).daily === game : lineupFor(lineupDay()).play.includes(game as VsGame))

  function startDuel(by: Player, game: VsGame) {
    const t = Date.now()
    if (!onToday(game)) throw new Error('that game is not on today')
    settle(t)
    if (duels.some((d) => d.settled_at === null)) throw new Error('a duel is already on')
    const d: DuelRow = {
      id: duels.length + 1, game, seed: Math.floor(Math.random() * 2_000_000_000), started_by: by,
      starts_at: t + DUEL_COUNTDOWN_MS, aleem_score: null, nurul_score: null, winner: null, points: 0, settled_at: null,
    }
    duels.push(d)
    persist()
    return d
  }

  function report(d: DuelRow, who: Player, value: number, solved: boolean, t: number) {
    if (d.settled_at !== null || d[scoreKey(who)] !== null) return
    d[scoreKey(who)] = vsScore(d.game, value, solved, t - d.starts_at)
    if (d.aleem_score !== null && d.nurul_score !== null) settleDuel(d, t)
    persist()
  }

  const botBottles = new Map<number, () => number>()
  function partnerPlays(d: DuelRow) {
    const end = d.starts_at + VS_LENGTH_MS[d.game]
    if (d.game === 'quiz' || d.game === 'mrt') {
      // She answers each question in a few seconds, getting most of them right.
      let score = 0
      let q = 0
      const answer = () => {
        if (d.settled_at !== null) return
        const took = QUIET ? 2_000 + Math.random() * 1_000 : 3_000 + Math.random() * 6_000
        later(took, () => {
          score += quizPoints(Math.random() < (QUIET ? 0.3 : 0.65), QUIZ_SECONDS * 1000 - took)
          q++
          onSignal?.({ type: 'duel_progress', value: score })
          if (q < QUIZ_QUESTIONS) { later(2_200, answer); return }
          report(d, partner, score, false, Date.now())
          onSignal?.({ type: 'duel_done', id: d.id })
        })
      }
      later(Math.max(0, d.starts_at - Date.now()), answer)
      return
    }
    if (d.game === 'chapteh') {
      // If she challenged you, she serves; otherwise she waits for your serve (see signal()).
      if (d.started_by === me) {
        later(Math.max(0, d.starts_at - Date.now()) + 600, () => onSignal?.({ type: 'chapteh_kick', kicks: 1, zone: randomZone(), ms: flightMs(1) }))
      }
      return
    }
    if (d.game === 'kopi') {
      // She serves a drink every few seconds and gets most of them right.
      let drinks = 0
      const serve = () => {
        if (d.settled_at !== null) return
        if (Date.now() >= end) {
          later(600 + Math.random() * 600, () => { report(d, partner, drinks, false, Date.now()); onSignal?.({ type: 'duel_done', id: d.id }) })
          return
        }
        if (Math.random() < (QUIET ? 0.5 : 0.85)) { drinks++; onSignal?.({ type: 'duel_progress', value: drinks }) }
        later(QUIET ? 8_000 + Math.random() * 2_000 : 3_500 + Math.random() * 2_500, serve)
      }
      later(Math.max(0, d.starts_at - Date.now()) + 3_000, serve)
      return
    }
    if (d.game === 'sps') return // she throws when you do (see spsThrow)
    if (d.game === 'golf') { golfBot(d); return }
    if (d.game === 'chope') { later(Math.max(0, d.starts_at - Date.now()) + 300, () => chopeBotMove(d)); return }
    if (d.game === 'draw') { drawBot(d); return }
    if (d.game === 'sync') { syncBot(d); return }
    if (d.game === 'cannot') { cannotBot(d); return }
    if (d.game === 'tug') {
      const rate = QUIET ? 3 : 5.5 + Math.random() * 3
      const tapsAt = (t: number) => Math.max(0, Math.floor((rate * Math.min(VS_LENGTH_MS.tug, t - d.starts_at)) / 1000))
      const tick = () => {
        const t = Date.now()
        if (t < end) {
          if (t >= d.starts_at) onSignal?.({ type: 'duel_progress', value: tapsAt(t) })
          later(200, tick)
          return
        }
        later(500 + Math.random() * 800, () => {
          report(d, partner, tapsAt(end), false, Date.now())
          onSignal?.({ type: 'duel_done', id: d.id })
        })
      }
      tick()
      return
    }
    // Pour-off: she completes a bottle every so often and usually solves in 1-2 minutes.
    const solveAt = d.starts_at + (params.has('fastbot') ? 12_000 : QUIET ? 170_000 : 55_000 + Math.random() * 60_000)
    let bottles = 0
    botBottles.set(d.id, () => bottles)
    const tick = () => {
      const t = Date.now()
      if (d.settled_at !== null || d[scoreKey(partner)] !== null) return
      if (t >= solveAt && t < end) {
        report(d, partner, 6, true, t)
        onSignal?.({ type: 'duel_progress', value: 6, solved: true })
        onSignal?.({ type: 'duel_done', id: d.id })
        return
      }
      if (t >= end) {
        later(800, () => { report(d, partner, bottles, false, Date.now()); onSignal?.({ type: 'duel_done', id: d.id }) })
        return
      }
      const share = Math.max(0, (t - d.starts_at) / (solveAt - d.starts_at))
      const next = Math.min(5, Math.floor(share * 6))
      if (next !== bottles) { bottles = next; onSignal?.({ type: 'duel_progress', value: bottles }) }
      later(1000, tick)
    }
    tick()
  }

  // ---- Cannot Say!: she guesses your clues, and gives her own when it's her turn ----------
  interface CannotBot { got: Set<number>; index: [number, number]; clues: Map<number, number> }
  const cannotBots = new Map<number, CannotBot>()
  const halfOf = (card: number) => (card >= 100 ? 1 : 0)
  function cannotBot(d: DuelRow) {
    const deck = cannotDeck(d.seed)
    const st: CannotBot = { got: new Set(), index: [0, 100], clues: new Map() }
    cannotBots.set(d.id, st)
    const end = d.starts_at + VS_LENGTH_MS.cannot
    // Whoever sent the challenge describes first: that's her when you accepted it.
    const herHalf = d.started_by === me ? 0 : 1
    const describe = () => {
      const t = Date.now()
      const from = d.starts_at + herHalf * CANNOT_SWAP_MS
      if (d.settled_at !== null || t >= Math.min(end, from + CANNOT_SWAP_MS)) return
      if (t < from) { later(from - t + 1_200, describe); return }
      const card = st.index[herHalf]
      const given = st.clues.get(card) ?? 0
      const hints = demoHints(deck[card])
      if (given < hints.length) {
        st.clues.set(card, given + 1)
        onSignal?.({ type: 'cannot_clue', card, text: hints[given] })
      } else {
        st.index[herHalf] = card + 1
        onSignal?.({ type: 'cannot_pass', card })
      }
      later(QUIET ? 7_000 : 4_000 + Math.random() * 2_000, describe)
    }
    describe()
    later(Math.max(0, end - Date.now()) + 900, () => {
      report(d, partner, st.got.size, false, Date.now())
      onSignal?.({ type: 'duel_done', id: d.id })
    })
  }
  function cannotHeard(s: Signal) {
    const d = duels.find((x) => x.settled_at === null && x.game === 'cannot')
    const st = d && cannotBots.get(d.id)
    if (!d || !st || !('card' in s)) return
    const h = halfOf(s.card)
    if (s.type === 'cannot_got' || s.type === 'cannot_pass') {
      if (s.type === 'cannot_got') st.got.add(s.card)
      st.index[h] = Math.max(st.index[h], s.card + 1)
      return
    }
    if (s.type !== 'cannot_clue') return
    // Your clue: she has a think, then gets it or has a go.
    const n = (st.clues.get(s.card) ?? 0) + 1
    st.clues.set(s.card, n)
    later(1_500 + Math.random() * 1_500, () => {
      if (d.settled_at !== null || st.index[h] !== s.card || (st.clues.get(s.card) ?? 0) !== n) return
      const deck = cannotDeck(d.seed)
      if (Math.random() < (QUIET ? 0.3 : 0.4 + 0.2 * n)) {
        st.got.add(s.card)
        st.index[h] = s.card + 1
        onSignal?.({ type: 'cannot_got', card: s.card })
      } else {
        onSignal?.({ type: 'cannot_guess', card: s.card, text: deck[(s.card + 37) % deck.length].word })
      }
    })
  }

  // ---- Marina Mini Golf: she plays about par, a few seconds a stroke ------------------------
  function golfBot(d: DuelRow) {
    const course = golfCourse(d.seed)
    const strokes = course.map((h) => Math.max(1, Math.min(G.capOf(h), h.par + (QUIET ? roll(1, 4) : roll(-1, 2)))))
    let at = Math.max(0, d.starts_at - Date.now()) + 1_500
    strokes.forEach((n, i) => {
      at += n * (QUIET ? 1_500 : 3_500)
      later(at, () => { if (d.settled_at === null) onSignal?.({ type: 'golf', hole: i + 1, strokes: n, done: i === course.length - 1 }) })
    })
    later(at + 400, () => { report(d, partner, golfScore(strokes, course), false, Date.now()); onSignal?.({ type: 'duel_done', id: d.id }) })
  }

  // ---- Chope Wars: she moves with the engine's own CPU when it's her turn ------------------
  function chopeDone(d: DuelRow) {
    const { s: board, seatOf } = chopeReplay(d.seed, chope[d.id] ?? [], d.started_by)
    if (board.phase !== 'over') return
    later(700, () => { report(d, partner, chopeValue(board, seatOf(partner)), false, Date.now()); onSignal?.({ type: 'duel_done', id: d.id }) })
  }
  function chopeBotMove(d: DuelRow) {
    const moves = chope[d.id] ?? []
    const n = moves.length + 1
    if (d.settled_at !== null || chopeMover(n, d.started_by) !== partner) return
    if (chopeReplay(d.seed, moves, d.started_by).s.phase !== 'play') return
    later(QUIET ? 1_200 : 900 + Math.random() * 1_400, () => {
      const now = chope[d.id] ?? []
      if (now.length !== moves.length || d.settled_at !== null) return
      const m = C.cpuMove(chopeReplay(d.seed, now, d.started_by).s, QUIET ? 'easy' : 'hard')
      if (!m) return
      chope[d.id] = [...now, { n, player: partner, kind: m.type, stool: m.stool }]
      persist()
      onSignal?.({ type: 'chope_moved', n })
      chopeDone(d)
    })
  }

  // ---- Draw & Guess: she scribbles when it's her turn and guesses yours -------------------
  interface DrawBot { got: Set<number>; index: [number, number]; strokes: Map<number, number> }
  const drawBots = new Map<number, DrawBot>()
  const scribble = () => {
    let [x, y] = [200 + Math.random() * 600, 200 + Math.random() * 600]
    const p = [Math.round(x), Math.round(y)]
    for (let i = 0; i < 10; i++) {
      x = Math.min(980, Math.max(20, x + (Math.random() - 0.5) * 180))
      y = Math.min(980, Math.max(20, y + (Math.random() - 0.5) * 180))
      p.push(Math.round(x), Math.round(y))
    }
    return p
  }
  function drawBot(d: DuelRow) {
    const st: DrawBot = { got: new Set(), index: [0, DRAW_SECOND_HALF], strokes: new Map() }
    drawBots.set(d.id, st)
    const end = d.starts_at + VS_LENGTH_MS.draw
    const herHalf = d.started_by === me ? 0 : 1
    const sketch = () => {
      const t = Date.now()
      const from = d.starts_at + herHalf * DRAW_SWAP_MS
      if (d.settled_at !== null || t >= Math.min(end, from + DRAW_SWAP_MS)) return
      if (t < from) { later(from - t + 1_000, sketch); return }
      const card = st.index[herHalf]
      const n = st.strokes.get(card) ?? 0
      if (n < 4) {
        st.strokes.set(card, n + 1)
        onSignal?.({ type: 'draw_ink', card, id: n + 1, c: n % 4, w: 2, p: scribble(), end: true })
      } else {
        st.index[herHalf] = card + 1
        onSignal?.({ type: 'draw_pass', card })
      }
      later(QUIET ? 4_000 : 2_500, sketch)
    }
    sketch()
    later(Math.max(0, end - Date.now()) + 900, () => {
      report(d, partner, st.got.size, false, Date.now())
      onSignal?.({ type: 'duel_done', id: d.id })
    })
  }
  function drawHeard(sig: Signal) {
    const d = duels.find((x) => x.settled_at === null && x.game === 'draw')
    const st = d && drawBots.get(d.id)
    if (!d || !st || !('card' in sig)) return
    const h = sig.card >= DRAW_SECOND_HALF ? 1 : 0
    if (sig.type === 'draw_got' || sig.type === 'draw_pass') {
      if (sig.type === 'draw_got') st.got.add(sig.card)
      st.index[h] = Math.max(st.index[h], sig.card + 1)
      return
    }
    if (sig.type !== 'draw_ink' || !sig.end) return
    // You finished a stroke: she has a think, then gets it or has a go.
    const n = (st.strokes.get(sig.card) ?? 0) + 1
    st.strokes.set(sig.card, n)
    const card = sig.card
    later(1_500, () => {
      if (d.settled_at !== null || st.index[h] !== card || st.strokes.get(card) !== n) return
      const deck = drawDeck(d.seed)
      if (Math.random() < (QUIET ? 0.25 : 0.2 + 0.15 * n)) {
        st.got.add(card)
        st.index[h] = card + 1
        onSignal?.({ type: 'draw_got', card })
      } else onSignal?.({ type: 'draw_guess', card, text: deck[(card + 37) % deck.length] })
    })
  }

  // ---- In Sync: she hits most of the beats ----------------------------------------------
  const syncBots = new Map<number, { hers: Set<number>; yours: Set<number> }>()
  function syncBot(d: DuelRow) {
    const st = { hers: new Set<number>(), yours: new Set<number>() }
    syncBots.set(d.id, st)
    syncSong(d.seed).forEach((ms, i) => {
      if (Math.random() > (QUIET ? 0.75 : 0.85)) return
      later(Math.max(0, d.starts_at + ms + (Math.random() - 0.5) * 120 - Date.now()), () => {
        if (d.settled_at !== null) return
        st.hers.add(i)
        onSignal?.({ type: 'sync_hit', beat: i })
      })
    })
    later(Math.max(0, d.starts_at + VS_LENGTH_MS.sync - Date.now()) + 900, () => {
      report(d, partner, [...st.hers].filter((i) => st.yours.has(i)).length, false, Date.now())
      onSignal?.({ type: 'duel_done', id: d.id })
    })
  }

  // ---- Doodle Day: she draws you a heart -------------------------------------------------
  const PRETEND_DOODLE: Stroke[] = [{
    c: 1, w: 3,
    p: Array.from({ length: 40 }, (_, i) => {
      const a = (i / 39) * Math.PI * 2
      return [Math.round(500 + 22 * 16 * Math.sin(a) ** 3), Math.round(470 - 22 * (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)))]
    }).flat(),
  }]
  function doodleDay(day: string): DoodleDay {
    const rows = doodle[day] ?? {}
    const revealed = Boolean(rows.Aleem && rows.Nurul)
    const entry = (p: Player): DoodleEntry | null => {
      const r = rows[p]
      if (!r) return null
      if (p !== me && !revealed) return { drawn: true }
      return { prompt: r.prompt, strokes: r.strokes }
    }
    return { day, revealed, Aleem: entry('Aleem'), Nurul: entry('Nurul') }
  }
  const doodleStatus = () => {
    const t = Date.now()
    return { now: new Date(t).toISOString(), day: dayKey(t), today: doodleDay(dayKey(t)) }
  }

  // ---- Scissors-Paper-Stone ---------------------------------------------------------
  function spsOf(d: DuelRow) {
    sps[d.id] ??= { Aleem: [], Nurul: [] }
    return sps[d.id]
  }

  // ---- Heart to Heart ---------------------------------------------------------------
  const PRETEND_ANSWERS = [
    'Honestly? You, every single time.',
    'The night we shared one umbrella and both still got soaked.',
    'Probably the way you laugh at your own jokes before the punchline.',
    'Supper at the hawker centre after a long, long day.',
    'Less planning, more wandering. With you, obviously.',
  ]
  function hthDay(day: string): HthDay {
    const rows = hth[day] ?? {}
    const revealed = Boolean(rows.Aleem && rows.Nurul)
    const entry = (p: Player): HthEntry | null => {
      const r = rows[p]
      if (!r) return null
      if (p !== me && !revealed) return { answered: true }
      return { question: r.question, answer: r.answer }
    }
    return { day, revealed, Aleem: entry('Aleem'), Nurul: entry('Nurul') }
  }
  const hthStatus = () => {
    const t = Date.now()
    return { now: new Date(t).toISOString(), day: dayKey(t), today: hthDay(dayKey(t)) }
  }
  function settleHth(day: string, t: number) {
    if (!hth[day]?.Aleem || !hth[day]?.Nurul) return
    for (const p of PLAYERS) record(p, 'hth', HTH_POINTS, t)
  }

  // ---- Agak Agak --------------------------------------------------------------------
  const agakJson = (day: string, r: AgakRow | undefined): AgakRound | null => r ? {
    day, psychic: r.psychic, card: r.card, clue: r.clue, needle: r.needle, score: r.score,
    target: r.psychic === me || r.needle !== null ? r.target : null,
  } : null
  function agakScoreIt(day: string, needle: number) {
    const r = agak[day]
    r.needle = Math.round(needle * 100) / 100
    r.score = agakScore(r.target, r.needle)
    if (r.score > 0) for (const p of PLAYERS) record(p, 'agak', r.score, Date.now())
    persist()
  }
  function pretendClue(target: number) {
    const where = target < 45 ? 'Way over on the left' : target < 80 ? 'Left of the middle' : target <= 100 ? 'Smack in the middle' : target < 135 ? 'Right of the middle' : 'Way over on the right'
    return `${where} (pretend clue)`
  }
  function agakStatus() {
    const t = Date.now()
    const day = dayKey(t)
    if (!agak[day] && onToday('agak')) {
      const lastPsychic = Object.keys(agak).filter((x) => x < day).sort().map((x) => agak[x].psychic).pop()
      const psychic: Player = lastPsychic === 'Aleem' ? 'Nurul' : 'Aleem'
      agak[day] = {
        psychic, card: `agak-${1 + Math.floor(Math.random() * AGAK_CARDS.length)}`,
        target: Math.round((TARGET_MIN + Math.random() * (TARGET_MAX - TARGET_MIN)) * 100) / 100,
        clue: null, needle: null, score: null,
      }
      persist()
      if (psychic === partner) {
        later(QUIET ? 3_000 : 1_500, () => { agak[day].clue = pretendClue(agak[day].target); persist(); onSignal?.({ type: 'agak_moved' }) })
      }
    }
    const lastDay = Object.keys(agak).filter((x) => x < day && agak[x].needle !== null).sort().pop()
    return { now: new Date(t).toISOString(), day, today: agakJson(day, agak[day]), last: lastDay ? agakJson(lastDay, agak[lastDay]) : null }
  }

  // ---- This or That ----------------------------------------------------------------
  function totDay(day: string): TotDay {
    const rows = tot[day] ?? {}
    const revealed = Boolean(rows.Aleem && rows.Nurul)
    const entry = (p: Player): TotEntry | null => {
      const r = rows[p]
      if (!r) return null
      if (p !== me && !revealed) return { answered: true }
      return { question: r.question, mine: r.mine, guess: r.guess }
    }
    return { day, revealed, Aleem: entry('Aleem'), Nurul: entry('Nurul') }
  }
  function settleTot(day: string, t: number) {
    const a = tot[day]?.Aleem
    const n = tot[day]?.Nurul
    if (!a || !n || a.settled) return
    const pa = totPoints(a.mine, a.guess, n.mine)
    const pn = totPoints(n.mine, n.guess, a.mine)
    if (pa > 0) record('Aleem', 'tot', pa, t)
    if (pn > 0) record('Nurul', 'tot', pn, t)
    a.settled = n.settled = true
    persist()
  }
  const totStatus = () => {
    const t = Date.now()
    return { now: new Date(t).toISOString(), day: dayKey(t), today: totDay(dayKey(t)) }
  }

  // ---- Chapteh and Hold hands: she answers your phone's signals ------------------------
  let handsOpen = false
  function partnerKicksBack(kicks: number, ms: number) {
    const d = duels.find((x) => x.settled_at === null && x.game === 'chapteh')
    if (!d) return
    const keeps = Math.random() < (QUIET ? 0.8 : Math.max(0.55, 0.96 - kicks * 0.012))
    later(ms + 120, () => {
      if (d.settled_at !== null) return
      if (keeps) {
        onSignal?.({ type: 'chapteh_kick', kicks: kicks + 1, zone: randomZone(), ms: flightMs(kicks + 1) })
        return
      }
      onSignal?.({ type: 'chapteh_drop', kicks })
      report(d, partner, kicks, false, Date.now())
      later(400, () => onSignal?.({ type: 'duel_done', id: d.id }))
    })
  }

  function wanderLoop() {
    // The pretend partner drifts in and out, and sometimes misses you first.
    later(20_000 + Math.random() * 40_000, () => {
      if (Math.random() < 0.25) {
        partnerHere = !partnerHere
        onPresence?.(partnerHere ? [me, partner] : [me])
      }
      if (!QUIET && partnerHere && document.visibilityState === 'visible' && Math.random() < 0.5) partnerSends(1 + Math.floor(Math.random() * 3))
      wanderLoop()
    })
  }

  return {
    kind: 'demo',
    me,
    async lineup() {
      const day = lineupDay()
      return { today: { ...lineupFor(day), all: ALL_GAMES }, tomorrow: { ...lineupFor(nextDay(day)), all: ALL_GAMES } }
    },
    async status() {
      const t = Date.now()
      settle(t)
      return { me, now: new Date(t).toISOString(), week_start: weekKey(t), hearts: { Aleem: heartsOf('Aleem', t), Nurul: heartsOf('Nurul', t) } }
    },
    async weekEvents(sinceIso) {
      const since = Date.parse(sinceIso)
      return save.events.filter((e) => Date.parse(e.created_at) >= since)
    },
    async weeks() {
      const played = weekTotalsFrom(save.events)
      for (const [day, rows] of Object.entries(prove)) {
        const k = weekKey(Date.parse(`${day}T12:00:00+08:00`))
        let w = played.find((x) => x.week_start === k)
        if (!w) played.push((w = emptyWeek(k)))
        for (const p of PLAYERS) if (rows[p]?.settled && !rows[p]!.passed) w[p === 'Aleem' ? 'aleem_bluffs' : 'nurul_bluffs']++
      }
      const pretend = (save.pastWeeks ?? []).filter((w) => !played.some((p) => p.week_start === w.week_start))
      return [...played, ...pretend].sort((a, b) => b.week_start.localeCompare(a.week_start))
    },
    async send(charge, seenId) {
      await pause()
      const result = apply(me, charge, seenId)
      // Usually she misses you back while the rally window is open.
      if (partnerHere && Math.random() < REPLY_CHANCE) later(3_000 + Math.random() * 25_000, () => partnerSends(1 + Math.floor(Math.random() * 3)))
      return result
    },
    async tag(id, reason) {
      await pause(60)
      const e = save.events.find((x) => x.id === id)
      if (!e || e.player !== me || e.kind !== 'miss' || e.reason || Date.now() - Date.parse(e.created_at) > TAG_WINDOW_MS) {
        throw new Error('that miss can no longer be tagged')
      }
      e.reason = reason
      persist()
      return { ...e }
    },
    async reasons() {
      const counts = new Map<string, ReasonCount>()
      for (const e of save.events) {
        if (!e.reason) continue
        const k = `${e.player}:${e.reason}`
        const c = counts.get(k) ?? { player: e.player, reason: e.reason, n: 0 }
        c.n++
        counts.set(k, c)
      }
      return [...counts.values()].sort((a, b) => b.n - a.n || a.reason - b.reason)
    },
    async hands(seconds) {
      await pause(60)
      const t = Date.now()
      const earn = (p: Player) => {
        const today = todayPoints(p, 'hands', t)
        const earned = Math.max(0, Math.min(Math.floor(seconds / HANDS_SECONDS_PER_MISS), HANDS_DAILY_CAP - today))
        if (earned > 0) record(p, 'hands', earned, t)
        return { earned, today: today + earned, cap: HANDS_DAILY_CAP }
      }
      earn(partner) // her phone reports the same time held together
      const mine = earn(me)
      persist()
      return mine
    },
    async totToday() {
      await pause(60)
      return totStatus()
    },
    async totAnswer(question, mine, guess) {
      await pause()
      const t = Date.now()
      const day = dayKey(t)
      if (!onToday('tot')) throw new Error('This or That is not on today')
      if (tot[day]?.[me]) throw new Error('already answered today')
      tot[day] = { ...tot[day], [me]: { question, mine, guess, settled: false } }
      persist()
      if (!tot[day]?.[partner]) {
        // She answers a moment after you.
        later(1_500, () => {
          if (tot[day]?.[partner]) return
          tot[day] = { ...tot[day], [partner]: { question: totOfDay(day).id, mine: roll(0, 1), guess: roll(0, 1), settled: false } }
          settleTot(day, Date.now())
          onSignal?.({ type: 'tot_answered' })
        })
      } else settleTot(day, t)
      return totStatus()
    },
    async totAlbum() {
      await pause(60)
      return Object.keys(tot).filter((d) => tot[d]?.Aleem && tot[d]?.Nurul).sort().reverse().map(totDay)
    },
    async hthToday() {
      await pause(60)
      return hthStatus()
    },
    async hthAnswer(question, answer) {
      await pause()
      const t = Date.now()
      const day = dayKey(t)
      const text = answer.trim()
      if (text.length < 1 || text.length > 600) throw new Error('write 1 to 600 characters')
      if (!onToday('hth')) throw new Error('Heart to Heart is not on today')
      if (hth[day]?.[me]) throw new Error('already answered today')
      hth[day] = { ...hth[day], [me]: { question, answer: text } }
      persist()
      if (!hth[day]?.[partner]) {
        later(QUIET ? 4_000 : 2_000, () => {
          if (hth[day]?.[partner]) return
          hth[day] = { ...hth[day], [partner]: { question: hthOfDay(day).id, answer: PRETEND_ANSWERS[Math.floor(Math.random() * PRETEND_ANSWERS.length)] } }
          settleHth(day, Date.now())
          persist()
          onSignal?.({ type: 'hth_answered' })
        })
      } else settleHth(day, t)
      return hthStatus()
    },
    async hthAlbum() {
      await pause(60)
      return Object.keys(hth).filter((d) => hth[d]?.Aleem && hth[d]?.Nurul).sort().reverse().map(hthDay)
    },
    async agakToday() {
      await pause(60)
      return agakStatus()
    },
    async agakClue(clue) {
      await pause()
      const day = dayKey(Date.now())
      const r = agak[day]
      const text = clue.trim()
      if (text.length < 1 || text.length > 80) throw new Error('a clue is 1 to 80 characters')
      if (!r || r.psychic !== me || r.clue !== null) throw new Error('only today’s Psychic can give one clue')
      r.clue = text
      persist()
      // She sets the needle after a think, usually close.
      later(QUIET ? 5_000 : 2_500, () => {
        if (agak[day].needle !== null) return
        const spread = QUIET ? 40 : 24
        agakScoreIt(day, Math.min(180, Math.max(0, r.target + (Math.random() - 0.5) * spread)))
        onSignal?.({ type: 'agak_moved' })
      })
      return agakStatus()
    },
    async agakGuess(needle) {
      await pause()
      const day = dayKey(Date.now())
      const r = agak[day]
      if (!(needle >= 0 && needle <= 180)) throw new Error('the needle goes from 0 to 180')
      if (!r || r.psychic === me || r.clue === null || r.needle !== null) throw new Error('nothing to guess yet')
      agakScoreIt(day, needle)
      return agakStatus()
    },
    async spsThrow(id, round, hand) {
      await pause(80)
      const t = Date.now()
      const d = duels.find((x) => x.id === id && x.game === 'sps')
      if (!d || d.settled_at !== null || t < d.starts_at || t > d.starts_at + VS_LENGTH_MS.sps) throw new Error('no game to throw in')
      const st = spsOf(d)
      const now = spsState(st[me], st[partner])
      if (now.over || round !== now.next) throw new Error('not that round')
      if (st[partner].length < round - 1) throw new Error('wait for the other throw')
      st[me].push(hand)
      persist()
      if (st[partner].length < round) {
        later(QUIET ? 2_500 : 600 + Math.random() * 1_000, () => {
          if (d.settled_at !== null || st[partner].length >= round) return
          st[partner].push(SPS_THROWS[Math.floor(Math.random() * 3)])
          persist()
          onSignal?.({ type: 'sps_thrown', round })
          if (spsState(st[partner], st[me]).over) later(300, () => { report(d, partner, 0, false, Date.now()); onSignal?.({ type: 'duel_done', id: d.id }) })
        })
      }
      return spsState(st[me], st[partner])
    },
    async doodleToday() {
      await pause(60)
      return doodleStatus()
    },
    async doodleSubmit(prompt, strokes) {
      await pause()
      const t = Date.now()
      const day = dayKey(t)
      if (!strokesFit(strokes)) throw new Error('draw something (but not too much)')
      if (!onToday('doodle')) throw new Error('Doodle Day is not on today')
      if (doodle[day]?.[me]) throw new Error('already drew today')
      doodle[day] = { ...doodle[day], [me]: { prompt, strokes } }
      persist()
      const settle = (at: number) => { if (doodle[day]?.Aleem && doodle[day]?.Nurul) for (const p of PLAYERS) record(p, 'doodle', DOODLE_POINTS, at) }
      if (!doodle[day]?.[partner]) {
        later(QUIET ? 4_000 : 2_000, () => {
          if (doodle[day]?.[partner]) return
          doodle[day] = { ...doodle[day], [partner]: { prompt: doodleOfDay(day).id, strokes: PRETEND_DOODLE } }
          settle(Date.now())
          persist()
          onSignal?.({ type: 'doodle_drawn' })
        })
      } else settle(t)
      return doodleStatus()
    },
    async doodleAlbum() {
      await pause(60)
      return Object.keys(doodle).filter((d) => doodle[d]?.Aleem && doodle[d]?.Nurul).sort().reverse().map(doodleDay)
    },
    async chopeMove(id, n, kind, stool) {
      await pause(80)
      const t = Date.now()
      const d = duels.find((x) => x.id === id && x.game === 'chope')
      if (!d || d.settled_at !== null || t < d.starts_at || t > d.starts_at + VS_LENGTH_MS.chope) throw new Error('no game to move in')
      const moves = chope[d.id] ?? []
      if (n !== moves.length + 1 || chopeMover(n, d.started_by) !== me) throw new Error('not your turn')
      if (moves.filter((m) => m.kind === 'place').length >= CHOPE_STOOLS) throw new Error('the game is over')
      const owner = [...moves].reverse().find((m) => m.stool === stool)?.player
      if (kind === 'place' && owner) throw new Error('that stool is choped')
      if (kind === 'swap' && (!owner || owner === me || moves.some((m) => m.player === me && m.kind === 'swap'))) throw new Error('the auntie can’t swap that')
      chope[d.id] = [...moves, { n, player: me, kind, stool }]
      persist()
      chopeBotMove(d)
      chopeDone(d)
      return [...chope[d.id]]
    },
    async chopeGet(id) {
      await pause(60)
      return [...(chope[id] ?? [])]
    },
    async spsGet(id) {
      await pause(60)
      const d = duels.find((x) => x.id === id && x.game === 'sps')
      if (!d) throw new Error('no such game')
      const st = spsOf(d)
      return spsState(st[me], st[partner])
    },
    async proveToday() {
      await pause(60)
      return proveStatus()
    },
    async proveStart(level) {
      await pause()
      const t = Date.now()
      settle(t)
      const today = dayKey(t)
      if (!onToday('prove')) throw new Error('Prove It is not on today')
      if (prove[today]?.[me]) throw new Error('already proved it today')
      prove[today] = { ...prove[today], [me]: { level, started_at: t, finished_at: null, score: null, passed: null, settled: false } }
      persist()
      return { level, target: proveTarget(level), started_at: new Date(t).toISOString() }
    },
    async proveFinish(score) {
      await pause()
      const t = Date.now()
      const mine = Object.values(prove).map((rows) => rows[me]).find((r) => r && r.finished_at === null)
      if (!mine || t > mine.started_at + PROVE_GRACE_MS) throw new Error('no game in progress')
      if (t < mine.started_at + 18_000) throw new Error('the game is not over yet')
      Object.assign(mine, { score, finished_at: t, passed: score >= proveTarget(mine.level) })
      persist()
      partnerProves()
      return proveStatus()
    },
    async duelStart(game) {
      await pause()
      return duelJson(startDuel(me, game))
    },
    async duelFinish(id, value, solved = false) {
      await pause()
      const t = Date.now()
      settle(t)
      const d = duels.find((x) => x.id === id)
      if (!d) throw new Error('no such duel')
      if (d.settled_at === null) {
        if (d.game === 'tug' && t < d.starts_at + VS_LENGTH_MS.tug - 1000) throw new Error('the duel is not over yet')
        if ((d.game === 'pour' || d.game === 'chapteh') && t < d.starts_at) throw new Error('the race is not over yet')
        if ((d.game === 'quiz' || d.game === 'mrt') && t < d.starts_at + 7_000) throw new Error('the quiz is not over yet')
        if (d.game === 'pour' && solved && t < d.starts_at + 8_000) throw new Error('too fast to be true')
        if (d.game === 'kopi' && t < d.starts_at + 55_000) throw new Error('the shift is not over yet')
        if (d.game === 'golf' && t < d.starts_at + 6_000) throw new Error('the round is not over yet')
        if (d.game === 'draw' && t < d.starts_at + 85_000) throw new Error('the round is not over yet')
        if (d.game === 'sync' && t < d.starts_at + 24_000) throw new Error('the song is not over yet')
        if (d.game === 'chope' && t < d.starts_at + VS_LENGTH_MS.chope && (chope[d.id] ?? []).filter((m) => m.kind === 'place').length < CHOPE_STOOLS) {
          throw new Error('the game is not over yet')
        }
        if (d.game === 'cannot' && t < d.starts_at + 85_000) throw new Error('the round is not over yet')
        if (d.game === 'sps' && t < d.starts_at + VS_LENGTH_MS.sps) {
          const st = spsOf(d)
          if (!spsState(st[me], st[partner]).over) throw new Error('the match is not over yet')
        }
        report(d, me, value, solved, t)
      }
      return duelJson(d)
    },
    async duelGet(id) {
      await pause(60)
      settle()
      const d = duels.find((x) => x.id === id)
      if (!d) throw new Error('no such duel')
      return duelJson(d)
    },
    signal(s) {
      if (s.type === 'duel_invite' && partnerHere) {
        // She grabs the rope after a moment.
        later(1_200, () => {
          try {
            const d = startDuel(partner, s.game)
            onSignal?.({ type: 'duel_start', duel: duelJson(d) })
            partnerPlays(d)
          } catch { /* a duel is already on */ }
        })
      }
      if (s.type === 'duel_start') {
        const d = duels.find((x) => x.id === s.duel.id)
        if (d) partnerPlays(d)
      }
      if (s.type === 'duel_progress' && s.solved) {
        // You sorted every colour first: she stops and reports what she had.
        const d = duels.find((x) => x.settled_at === null && x.game === 'pour')
        if (d) later(1_500, () => { report(d, partner, botBottles.get(d.id)?.() ?? 0, false, Date.now()); onSignal?.({ type: 'duel_done', id: d.id }) })
      }
      if (s.type === 'chapteh_kick') partnerKicksBack(s.kicks, s.ms)
      if (s.type === 'cannot_clue' || s.type === 'cannot_got' || s.type === 'cannot_pass') cannotHeard(s)
      if (s.type === 'draw_ink' || s.type === 'draw_got' || s.type === 'draw_pass') drawHeard(s)
      if (s.type === 'sync_hit') {
        const d = duels.find((x) => x.settled_at === null && x.game === 'sync')
        if (d) syncBots.get(d.id)?.yours.add(s.beat)
      }
      if (s.type === 'chapteh_drop') {
        const d = duels.find((x) => x.settled_at === null && x.game === 'chapteh')
        if (d) later(500, () => { report(d, partner, s.kicks, false, Date.now()); onSignal?.({ type: 'duel_done', id: d.id }) })
      }
      if (s.type === 'hands' && partnerHere) {
        if (s.state === 'open' && !handsOpen) { handsOpen = true; later(1_200, () => onSignal?.({ type: 'hands', state: 'open' })) }
        if (s.state === 'down') later(450, () => onSignal?.({ type: 'hands', state: 'down' }))
        if (s.state === 'up') later(250, () => onSignal?.({ type: 'hands', state: 'up' }))
        if (s.state === 'close') handsOpen = false
      }
    },
    noteHoldStart() {
      // Now and then she was thinking of you at the very same moment.
      if (partnerHere && Math.random() < SAME_BRAIN_CHANCE) later(250 + Math.random() * 500, () => partnerSends(2))
    },
    refillHearts() {
      const t = Date.now()
      save.hearts[me] = { stored: HEART_CAP, refilledAtMs: t }
      persist()
    },
    subscribe(eventHandler, presenceHandler, signalHandler) {
      onEvent = eventHandler
      onPresence = presenceHandler
      onSignal = signalHandler
      later(400, () => onPresence?.(partnerHere ? [me, partner] : [me]))
      if (params.has('duelme')) later(2_500, () => onSignal?.({ type: 'duel_invite', game: 'tug' }))
      if (params.has('pourme')) later(2_500, () => onSignal?.({ type: 'duel_invite', game: 'pour' }))
      if (params.has('quizme')) later(2_500, () => onSignal?.({ type: 'duel_invite', game: 'quiz' }))
      if (params.has('mrtme')) later(2_500, () => onSignal?.({ type: 'duel_invite', game: 'mrt' }))
      if (params.has('chaptehme')) later(2_500, () => onSignal?.({ type: 'duel_invite', game: 'chapteh' }))
      if (params.has('kopime')) later(2_500, () => onSignal?.({ type: 'duel_invite', game: 'kopi' }))
      if (params.has('spsme')) later(2_500, () => onSignal?.({ type: 'duel_invite', game: 'sps' }))
      if (params.has('cannotme')) later(2_500, () => onSignal?.({ type: 'duel_invite', game: 'cannot' }))
      for (const game of ['golf', 'chope', 'draw', 'sync'] as const) {
        if (params.has(game + 'me')) later(2_500, () => onSignal?.({ type: 'duel_invite', game }))
      }
      if (params.has('handsme')) later(2_500, () => { handsOpen = true; onSignal?.({ type: 'hands', state: 'open' }) })
      wanderLoop()
      return () => {
        timers.forEach(clearTimeout)
        timers.clear()
        onEvent = null
        onPresence = null
        onSignal = null
      }
    },
  }
}
