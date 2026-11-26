// A pretend partner for trying the game without a database. Lives in this browser only.
// Mirrors the database's rules (supabase/migrations) closely enough to play every mode.
import type { Backend, Change, Signal } from './backend'
import { proveTarget } from '../game/catch'
import { lineupFor, nextDay } from '../game/lineup'
import {
  flightMs, HANDS_DAILY_CAP, HANDS_SECONDS_PER_MISS, QUIZ_QUESTIONS, QUIZ_SECONDS, quizPoints, RALLY_DAILY_CAP, rallyMisses,
  randomZone, REASONS, TAG_WINDOW_MS, totOfDay, totPoints,
} from '../game/more'
import {
  dayKey, DUEL_COUNTDOWN_MS, DUEL_POINTS, emptyWeek, HEART_CAP, heartsAt, partnerOf, PLAYERS, rallyFor,
  sameBrainPartner, spendHeart, VS_LENGTH_MS, vsScore, WEEK_MS, weekKey, weekStartMs, weekTotalsFrom,
  type Duel, type MissEvent, type Player, type ProveDay, type ProveEntry, type ReasonCount, type SendResult, type TotDay,
  type TotEntry, type VsGame, type WeekTotal,
} from '../game/rules'

interface TotRow { question: string; mine: number; guess: number; settled: boolean }

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
}
const KEY = 'our_misses_demo_v1'
// Test switches: ?samebrain makes the pretend partner always miss you at the same moment;
// ?quiet keeps her from sending or playing anything on her own (she still answers VS games,
// This or That and Hold hands, but plays them slowly); ?duelme / ?pourme / ?quizme / ?chaptehme
// make her challenge you right away; ?handsme makes her ask to hold hands; ?fastbot makes her
// solve a Pour-off in 12 seconds.
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
  const prove = save.prove
  const duels = save.duels
  const tot = save.tot
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

  function record(player: Player, kind: 'prove_it' | 'duel' | 'hands' | 'tot' | 'rally', points: number, t: number) {
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
    const a = d.aleem_score ?? 0
    const n = d.nurul_score ?? 0
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
  const onToday = (game: string) => ALL_GAMES || (game === 'prove' || game === 'tot' ? lineupFor(lineupDay()).daily === game : lineupFor(lineupDay()).play.includes(game as VsGame))

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
