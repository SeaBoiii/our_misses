// A pretend partner for trying the game without a database. Lives in this browser only.
import type { Backend } from './backend'
import {
  HEART_CAP, heartsAt, partnerOf, rallyFor, sameBrainPartner, spendHeart, WEEK_MS, weekKey, weekStartMs, weekTotalsFrom,
  type MissEvent, type Player, type SendResult, type WeekTotal,
} from '../game/rules'

interface DemoSave {
  events: MissEvent[]
  hearts: Record<Player, { stored: number; refilledAtMs: number }>
  nextId: number
  /** Made-up past seasons so the history board has something to show in the demo. */
  pastWeeks?: WeekTotal[]
}
const KEY = 'our_misses_demo_v1'
// Test switches: ?samebrain makes the pretend partner always miss you at the same moment;
// ?quiet keeps her from sending anything on her own.
const params = new URLSearchParams(location.search)
const QUIET = params.has('quiet')
const SAME_BRAIN_CHANCE = params.has('samebrain') ? 1 : QUIET ? 0 : 0.2
const REPLY_CHANCE = QUIET ? 0 : 0.7

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
  const roll = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1))
  return Array.from({ length: 5 }, (_, i) => {
    const aleem_misses = roll(8, 30)
    const nurul_misses = roll(8, 30)
    const same_brains = roll(0, 3)
    return {
      week_start: weekKey(thisWeek - (i + 1) * WEEK_MS),
      aleem: aleem_misses * 2 + roll(0, 12) + same_brains * 3,
      nurul: nurul_misses * 2 + roll(0, 12) + same_brains * 3,
      aleem_misses, nurul_misses, same_brains, longest_rally: roll(1, 9),
    }
  })
}

export function clearDemo() {
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
}

export function demoBackend(me: Player): Backend {
  const partner = partnerOf(me)
  const save = load()
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(save)) } catch { /* ignore */ } }
  let onEvent: ((e: MissEvent) => void) | null = null
  let onPresence: ((here: Player[]) => void) | null = null
  let partnerHere = true
  const timers = new Set<ReturnType<typeof setTimeout>>()
  const later = (ms: number, fn: () => void) => {
    const id = setTimeout(() => { timers.delete(id); fn() }, ms)
    timers.add(id)
  }

  function heartsOf(p: Player, t: number) {
    const h = save.hearts[p]
    const { hearts, nextAt } = heartsAt(h.stored, h.refilledAtMs, t)
    return { hearts, next_at: nextAt === null ? null : new Date(nextAt).toISOString() }
  }

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
      result.events.forEach((e) => onEvent?.(e))
    } catch { /* partner is out of hearts */ }
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
    async status() {
      const t = Date.now()
      return { me, now: new Date(t).toISOString(), week_start: weekKey(t), hearts: { Aleem: heartsOf('Aleem', t), Nurul: heartsOf('Nurul', t) } }
    },
    async weekEvents(sinceIso) {
      const since = Date.parse(sinceIso)
      return save.events.filter((e) => Date.parse(e.created_at) >= since)
    },
    async weeks() {
      const played = weekTotalsFrom(save.events)
      const pretend = (save.pastWeeks ?? []).filter((w) => !played.some((p) => p.week_start === w.week_start))
      return [...played, ...pretend].sort((a, b) => b.week_start.localeCompare(a.week_start))
    },
    async send(charge, seenId) {
      await new Promise((r) => setTimeout(r, 120))
      const result = apply(me, charge, seenId)
      // Usually she misses you back while the rally window is open.
      if (partnerHere && Math.random() < REPLY_CHANCE) later(3_000 + Math.random() * 25_000, () => partnerSends(1 + Math.floor(Math.random() * 3)))
      return result
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
    subscribe(eventHandler, presenceHandler) {
      onEvent = eventHandler
      onPresence = presenceHandler
      later(400, () => onPresence?.(partnerHere ? [me, partner] : [me]))
      wanderLoop()
      return () => {
        timers.forEach(clearTimeout)
        timers.clear()
        onEvent = null
        onPresence = null
      }
    },
  }
}
