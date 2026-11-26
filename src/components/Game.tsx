import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { Backend, Change, Signal } from '../lib/backend'
import { PROVE_LEVELS } from '../game/catch'
import { dailyOn, playOn, previousDay, type Lineup, type Lineups } from '../game/lineup'
import { HANDS_DAILY_CAP, reasonOf, REASONS, TAG_WINDOW_MS, totOfDay } from '../game/more'
import { VS_GAMES } from '../game/vsGames'
import {
  dayKey, history as buildHistory, liveHearts, NoHeartsError, partnerOf, rallyState, seasons, totals, WEEK_MS, weekKey,
  weekStartMs, weekTotalsFrom, emptyWeek,
  type MissEvent, type Player, type ProveStatus, type ReasonCount, type Status, type TotStatus, type WeekTotal,
} from '../game/rules'
import { ago, countdown, weekLabel } from '../lib/format'
import { isMuted, setMuted, sfx } from '../lib/sound'
import { useDuel } from '../lib/useDuel'
import { useHands } from '../lib/useHands'
import { DuelOverlay } from './Duel'
import { History } from './History'
import { HoldHands } from './HoldHands'
import { InstallCard } from './Install'
import { MissButton } from './MissButton'
import { ProveIt } from './ProveIt'
import { Rope } from './Rope'
import { ThisOrThat } from './ThisOrThat'

type View = 'rope' | 'history' | 'prove' | 'tot'
const VIEWS = ['history', 'prove', 'tot'] as const
const viewFromHash = (): View => (VIEWS as readonly string[]).includes(location.hash.slice(1)) ? (location.hash.slice(1) as View) : 'rope'

interface Toast { id: number; text: string; tone?: 'love' | 'warn' }
interface Flight { id: number; from: DOMRect; to: DOMRect; size: number; tone: 'out' | 'in' }

const byId = (a: MissEvent, b: MissEvent) => a.id - b.id
const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong')
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

function leadLine(a: number, n: number, me: Player) {
  if (a + n === 0) return 'Fresh season. Who blinks first?'
  if (a === n) return 'Dead even. Suspicious.'
  const leader: Player = a > n ? 'Aleem' : 'Nurul'
  const who = leader === me ? 'You are' : `${leader} is`
  const gap = Math.abs(a - n)
  if (gap <= 3) return `${who} barely ahead`
  if (gap <= 12) return `${who} pulling ahead`
  return `${who} down bad 😩`
}

export function Game({ backend, onLeave }: { backend: Backend; onLeave(): void }) {
  const me = backend.me
  const partner = partnerOf(me)
  const [status, setStatus] = useState<Status | null>(null)
  const [events, setEvents] = useState<MissEvent[]>([])
  const [weeks, setWeeks] = useState<WeekTotal[]>([])
  const [here, setHere] = useState<Player[]>([])
  const [offset, setOffset] = useState(0)
  const [clock, setClock] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [flights, setFlights] = useState<Flight[]>([])
  const [sameBrain, setSameBrain] = useState(0)
  const [pull, setPull] = useState<{ by: Player; n: number } | null>(null)
  const [muted, setMutedState] = useState(isMuted)
  const [menu, setMenu] = useState(false)
  const [prove, setProve] = useState<ProveStatus | null>(null)
  const [proveRefresh, setProveRefresh] = useState(0)
  const [tot, setTot] = useState<TotStatus | null>(null)
  const [totRefresh, setTotRefresh] = useState(0)
  const [reasons, setReasons] = useState<ReasonCount[]>([])
  /** Today's rotation (null until loaded, or if it can't be: then everything shows and the database decides). */
  const [lineups, setLineups] = useState<Lineups | null>(null)
  const lineupDay = useRef('')
  /** Why I miss you: the miss you just sent, while it can still be tagged. */
  const [tagFor, setTagFor] = useState<{ id: number; until: number } | null>(null)
  const lastResultsToast = useRef(0)

  const known = useRef(new Set<number>())
  const week = useRef('')
  const eventsRef = useRef(events)
  const seenAtHold = useRef(0)
  const lastBurst = useRef(0)
  const serial = useRef(0)
  const button = useRef<HTMLButtonElement>(null)
  useEffect(() => { eventsRef.current = events }, [events])

  const now = clock + offset

  const toast = useCallback((text: string, tone?: Toast['tone']) => {
    const id = ++serial.current
    setToasts((t) => [...t.slice(-2), { id, text, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800)
  }, [])

  const fly = useCallback((from: Element | null, to: Element | null, size: number, tone: Flight['tone']) => {
    if (!from || !to || reducedMotion()) return
    const id = ++serial.current
    setFlights((f) => [...f, { id, from: from.getBoundingClientRect(), to: to.getBoundingClientRect(), size, tone }])
  }, [])

  const avatarEl = (p: Player) => document.querySelector(`[data-avatar="${p}"]`)

  const celebrate = useCallback(() => {
    if (Date.now() - lastBurst.current < 4000) return
    lastBurst.current = Date.now()
    setSameBrain(Date.now())
    sfx.sameBrain()
  }, [])

  const load = useCallback(async () => {
    try {
      const s = await backend.status()
      const serverNow = Date.parse(s.now)
      const [ev, wk, pv, tt, lu] = await Promise.all([
        backend.weekEvents(new Date(weekStartMs(serverNow)).toISOString()),
        backend.weeks(),
        backend.proveToday().catch(() => null),
        backend.totToday().catch(() => null),
        backend.lineup().catch(() => null),
      ])
      if (tt) setTot(tt)
      setLineups(lu ?? null)
      lineupDay.current = dayKey(serverNow)
      known.current = new Set(ev.map((e) => e.id))
      week.current = weekKey(serverNow)
      setOffset(serverNow - Date.now())
      setStatus(s)
      setEvents([...ev].sort(byId))
      setWeeks(wk)
      if (pv) setProve(pv)
      setLoadError(null)
    } catch (e) {
      setLoadError(errorText(e))
    }
  }, [backend])

  const refreshStatus = useCallback(() => {
    backend.status().then(setStatus).catch(() => { /* next tick will retry */ })
  }, [backend])

  const receive = useCallback((e: MissEvent, change: Change = 'insert') => {
    if (change === 'update') {
      // Why I miss you: a reason added to a miss already on screen.
      setEvents((prev) => prev.map((x) => (x.id === e.id ? { ...x, ...e } : x)))
      const why = reasonOf(e.reason)
      if (why && e.player !== me) toast(`💭 ${partner}: ${why.icon} ${why.label}`, 'love')
      return
    }
    if (known.current.has(e.id)) return
    known.current.add(e.id)
    if (weekKey(Date.parse(e.created_at)) !== week.current) { void load(); return }
    setEvents((prev) => [...prev, e].sort(byId))
    if (e.kind === 'same_brain') { celebrate(); return }
    if (e.kind === 'prove_it') {
      // Both players' points land together at the reveal: one toast for the pair.
      if (Date.now() - lastResultsToast.current > 5000) { lastResultsToast.current = Date.now(); toast('🔍 Prove It results are in!', 'love') }
      setProveRefresh((n) => n + 1)
      return
    }
    if (e.kind === 'tot') { setTotRefresh((n) => n + 1); return }
    if (e.kind !== 'miss') return
    if (e.player === me) return
    fly(avatarEl(partner), avatarEl(me), e.charge ?? 1, 'in')
    sfx.receive()
    const rally = e.rally_bonus > 0 ? ` · rally ×${e.rally_length}` : ''
    toast(`${partner} misses you ${'♥'.repeat(e.charge ?? 1)}${rally}`, 'love')
    setPull((p) => ({ by: partner, n: (p?.n ?? 0) + 1 }))
    refreshStatus()
  }, [celebrate, fly, load, me, partner, refreshStatus, toast])

  const receiveRef = useRef(receive)
  useEffect(() => { receiveRef.current = receive }, [receive])

  const duel = useDuel({ backend, offset, toast })
  const hands = useHands({ backend, toast })
  const signal = useCallback((s: Signal) => {
    if (s.type === 'prove_played') {
      toast(`🔍 ${partner} just played Prove It`, 'love')
      setProveRefresh((n) => n + 1)
      return
    }
    if (s.type === 'tot_answered') {
      toast(`🤔 ${partner} answered This or That`, 'love')
      setTotRefresh((n) => n + 1)
      return
    }
    if (s.type === 'hands') { hands.onSignal(s); return }
    duel.onSignal(s)
  }, [duel, hands, partner, toast])
  const signalRef = useRef(signal)
  useEffect(() => { signalRef.current = signal }, [signal])

  useEffect(() => { void load() }, [load])
  useEffect(() => backend.subscribe((e, change) => receiveRef.current(e, change), setHere, (s) => signalRef.current(s)), [backend])
  useEffect(() => {
    if (proveRefresh === 0) return
    backend.proveToday().then(setProve).catch(() => { /* keep the last one */ })
  }, [backend, proveRefresh])
  useEffect(() => {
    if (totRefresh === 0) return
    backend.totToday().then(setTot).catch(() => { /* keep the last one */ })
  }, [backend, totRefresh])
  useEffect(() => {
    if (!tagFor) return
    const id = setTimeout(() => setTagFor(null), Math.max(0, tagFor.until - Date.now()))
    return () => clearTimeout(id)
  }, [tagFor])
  useEffect(() => {
    const id = setInterval(() => setClock(Date.now()), 1000)
    const wake = () => { if (document.visibilityState === 'visible') void load() }
    document.addEventListener('visibilitychange', wake)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', wake) }
  }, [load])
  useEffect(() => {
    if (week.current && weekKey(now) !== week.current) void load()
    // A new day brings a new lineup (and settles yesterday's Prove It / This or That).
    else if (lineupDay.current && dayKey(now) !== lineupDay.current) void load()
  }, [now, load])
  useEffect(() => {
    if (!sameBrain) return
    const id = setTimeout(() => setSameBrain(0), 3600)
    return () => clearTimeout(id)
  }, [sameBrain])

  // History and Prove It live at #history and #prove so a phone's back gesture returns to the rope.
  const [view, setView] = useState<View>(viewFromHash)
  const pushedView = useRef(false)
  useEffect(() => {
    const sync = () => setView(viewFromHash())
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])
  const open = (v: Exclude<View, 'rope'>) => {
    pushedView.current = true
    location.hash = v
  }
  const openHistory = () => {
    open('history')
    backend.weeks().then(setWeeks).catch(() => { /* keep what we have */ })
    backend.reasons().then((r) => setReasons(r ?? [])).catch(() => { /* optional */ })
  }
  useEffect(() => {
    if (view === 'history') backend.reasons().then((r) => setReasons(r ?? [])).catch(() => { /* optional */ })
  }, [view, backend])

  const tagMiss = async (reason: number) => {
    if (!tagFor) return
    const id = tagFor.id
    setTagFor(null)
    try {
      const tagged = await backend.tag(id, reason)
      setEvents((prev) => prev.map((x) => (x.id === id ? { ...x, reason: tagged.reason } : x)))
      const why = reasonOf(reason)
      toast(`${why?.icon} ${partner} will see: ${why?.label}`, 'love')
    } catch (e) {
      toast(errorText(e), 'warn')
    }
  }
  const closeView = () => {
    if (pushedView.current) { pushedView.current = false; window.history.back() }
    else { window.history.replaceState(null, '', location.pathname + location.search); setView('rope') }
  }
  useEffect(() => { window.scrollTo(0, 0) }, [view])

  const weekStart = weekStartMs(now)
  const thisWeek = weekKey(now)
  const score = useMemo(() => totals(events, weekStart, weekStart + WEEK_MS), [events, weekStart])
  const season = useMemo(() => seasons(weeks, thisWeek), [weeks, thisWeek])
  const board = useMemo(() => {
    const live = weekTotalsFrom(events).find((w) => w.week_start === thisWeek)
      ?? emptyWeek(thisWeek)
    return buildHistory(weeks, thisWeek, live)
  }, [events, weeks, thisWeek])
  const rally = rallyState(events, me, now)
  const mine = status ? liveHearts(status.hearts[me], now) : { hearts: 0, nextAt: null }
  const theirs = status ? liveHearts(status.hearts[partner], now) : { hearts: 0, nextAt: null }
  const sameBrains = events.filter((e) => e.kind === 'same_brain' && e.player === me).length

  const onHoldStart = () => {
    seenAtHold.current = Math.max(0, ...eventsRef.current.filter((e) => e.player === partner && e.kind === 'miss').map((e) => e.id))
    backend.noteHoldStart?.()
  }

  const onSend = async (charge: 1 | 2 | 3, burst: boolean) => {
    setBusy(true)
    fly(button.current, avatarEl(partner), charge, 'out')
    if (burst) sfx.burst()
    else sfx.send(charge)
    try {
      const r = await backend.send(charge, seenAtHold.current)
      setOffset(Date.parse(r.now) - Date.now())
      setStatus((s) => (s ? { ...s, hearts: { ...s.hearts, [me]: r.hearts } } : s))
      const fresh = r.events.filter((e) => !known.current.has(e.id))
      fresh.forEach((e) => known.current.add(e.id))
      setEvents((prev) => [...prev, ...fresh].sort(byId))
      setPull((p) => ({ by: me, n: (p?.n ?? 0) + 1 }))
      const miss = r.events.find((e) => e.kind === 'miss')
      if (miss) setTagFor({ id: miss.id, until: Date.now() + 20_000 })
      if (burst) toast('Missed them too much 💥 +1', 'warn')
      else if (miss && miss.rally_bonus > 0) toast(`Rally ×${miss.rally_length}! +${miss.rally_bonus} bonus`, 'love')
      if (r.events.some((e) => e.kind === 'same_brain')) celebrate()
    } catch (e) {
      sfx.denied()
      if (e instanceof NoHeartsError) toast('Out of hearts. One comes back every 30 minutes.', 'warn')
      else toast(errorText(e), 'warn')
      refreshStatus()
    } finally {
      setBusy(false)
    }
  }

  if (!status) {
    return (
      <main className="screen center">
        {loadError ? (
          <div className="card stack">
            <p>Couldn't reach the rope: {loadError}</p>
            <button className="pill" onClick={() => void load()}>Try again</button>
            <button className="link" onClick={onLeave}>Sign out</button>
          </div>
        ) : <p className="loading">pulling the rope taut…</p>}
      </main>
    )
  }

  const seasonEnds = weekStart + WEEK_MS
  const feed = [...events].reverse().filter((e) => e.kind !== 'same_brain' || e.player === me).slice(0, 6)
  const partnerHere = here.includes(partner)
  const myProve = prove?.today[me] ?? null
  const theirProve = prove?.today[partner] ?? null
  const proveLine = !prove ? '…'
    : !myProve ? `How much did you miss ${partner}?`
      : !myProve.finished ? 'round in progress'
        : prove.today.revealed ? `you ${myProve.passed ? '✓' : '🤥'} · ${partner} ${theirProve?.passed ? '✓' : '🤥'}`
          : `${myProve.passed ? 'proven ✓' : 'bluff 🤥'} · waiting for ${partner}`
  const todaysDuel = events.find((e) => e.kind === 'duel' && dayKey(Date.parse(e.created_at)) === dayKey(now))
  const today: Lineup | null = lineups?.today ?? null
  const playToday = (Object.keys(VS_GAMES) as (keyof typeof VS_GAMES)[]).filter((g) => playOn(today, g))
  const duelLine = !partnerHere ? `${partner} needs to be here`
    : todaysDuel ? `today’s +5 went to ${todaysDuel.player === me ? 'you' : partner}`
      : 'first versus win today +5'
  const tomorrow = lineups?.tomorrow
  const teaser = tomorrow && !tomorrow.all
    ? `Tomorrow: ${tomorrow.daily === 'prove' ? '🔍 Prove It' : '🤔 This or That'} · ${tomorrow.play.map((g) => VS_GAMES[g].icon).join(' ')}`
    : null
  // On a This or That day, yesterday's Prove It results are revealed: keep a way to see them.
  const yesterdayProve = !dailyOn(today, 'prove') && prove?.last?.revealed && prove.last.day === previousDay(dayKey(now))
  const myTot = tot?.today[me] ?? null
  const totLine = !tot ? '…'
    : !myTot ? `${totOfDay(tot.day).a} or ${totOfDay(tot.day).b}?`
      : tot.today.revealed ? 'results are in' : `waiting for ${partner}`
  const handsToday = events.filter((e) => e.kind === 'hands' && e.player === me && dayKey(Date.parse(e.created_at)) === dayKey(now))
    .reduce((sum, e) => sum + e.points, 0)
  const handsLine = partnerHere ? `${partner} is here · ${handsToday}/${HANDS_DAILY_CAP} today` : `best when ${partner} is on too`
  const canTag = tagFor && now - (events.find((e) => e.id === tagFor.id) ? Date.parse(events.find((e) => e.id === tagFor.id)!.created_at) : now) < TAG_WINDOW_MS
  const winnerLine = season.lastWeek && (season.lastWeek.winner === 'tie'
    ? `Last week was a tie, ${season.lastWeek.aleem}–${season.lastWeek.nurul}. Same brain.`
    : `Last week 🏆 ${season.lastWeek.winner === me ? 'you' : season.lastWeek.winner} missed more, ${Math.max(season.lastWeek.aleem, season.lastWeek.nurul)}–${Math.min(season.lastWeek.aleem, season.lastWeek.nurul)}`)

  return (
    <main className="screen">
      <header className="top">
        <h1 className="wordmark">miss<span>u</span></h1>
        <div className="top-actions">
          {backend.kind === 'demo' && <span className="demo-tag">demo</span>}
          {view === 'rope' && <button className="icon" aria-label="History" onClick={openHistory}>🏆</button>}
          <button className="icon" aria-label="Menu" aria-expanded={menu} onClick={() => setMenu(true)}>⋯</button>
        </div>
      </header>

      {menu && (
        <div className="sheet-backdrop" onClick={() => setMenu(false)}>
          <div className="sheet card" role="dialog" aria-label="Menu" onClick={(e) => e.stopPropagation()}>
            <p className="sheet-who">You’re signed in as <b>{me}</b>{backend.kind === 'demo' && ' (demo)'}.</p>
            <button className="sheet-row" onClick={() => { setMuted(!muted); setMutedState(!muted) }}>{muted ? '🔇 Sound is off' : '🔊 Sound is on'}</button>
            <InstallCard context="menu" dismissible={false} />
            <button className="sheet-row danger" onClick={() => { setMenu(false); onLeave() }}>{backend.kind === 'demo' ? '🔁 Switch player' : '🚪 Sign out of this phone'}</button>
            <button className="link" onClick={() => setMenu(false)}>close</button>
          </div>
        </div>
      )}

      {view === 'history' ? <History data={board} me={me} reasons={reasons} onBack={closeView} />
        : view === 'prove' ? <ProveIt backend={backend} me={me} partner={partner} refresh={proveRefresh} onBack={closeView} onChange={setProve} toast={toast} onToday={dailyOn(today, 'prove')} />
          : view === 'tot' ? <ThisOrThat backend={backend} me={me} partner={partner} refresh={totRefresh} onBack={closeView} onChange={setTot} toast={toast} onToday={dailyOn(today, 'tot')} />
            : <>
      {winnerLine && <button className="banner" onClick={openHistory}>{winnerLine} <span aria-hidden="true">›</span></button>}

      <section className="card board" aria-label="This week's tug of war">
        <div className="board-head">
          <span>misses this week · {weekLabel(weekKey(now))}</span>
          <span>ends in {countdown(seasonEnds - now)}</span>
        </div>
        <div className="scores">
          {(['Aleem', 'Nurul'] as const).map((p) => (
            <div key={p} className={`score score-${p.toLowerCase()}`}>
              <span className="score-name">{p}{season.trophies[p] > 0 && <small> 🏆{season.trophies[p]}</small>}</span>
              <span className="score-points" data-testid={`score-${p}`}>{score[p]}</span>
            </div>
          ))}
        </div>
        <Rope aleem={score.Aleem} nurul={score.Nurul} me={me} here={here} pull={pull} />
        <p className="lead">{leadLine(score.Aleem, score.Nurul, me)}</p>
        <p className="counter" data-testid="counter">
          <span className="counter-total">💞 <b>{(board.allTime.Aleem + board.allTime.Nurul).toLocaleString('en-SG')}</b> misses between you, all time</span>
          <span className="counter-split">Aleem {board.allTime.Aleem.toLocaleString('en-SG')} · Nurul {board.allTime.Nurul.toLocaleString('en-SG')}</span>
        </p>
      </section>

      <div className="status-row">
        <span className={`presence ${here.includes(partner) ? 'on' : ''}`}>
          {here.includes(partner) ? `${partner} is here right now` : `${partner} is away`}
        </span>
        <span className="their-hearts" aria-label={`${partner} has ${theirs.hearts} hearts`}>
          {partner}: {'♥'.repeat(theirs.hearts)}{'♡'.repeat(3 - theirs.hearts)}
        </span>
      </div>

      {rally && (
        <p className={`rally rally-${rally.kind}`} data-testid="rally">
          {rally.kind === 'answer'
            ? <>🏓 Miss {partner} back within <b>{countdown(rally.endsAt - now)}</b> for <b>+{rally.bonus}</b></>
            : rally.length > 1
              ? <>🏓 Rally ×{rally.length} · waiting for {partner} ({countdown(rally.endsAt - now)})</>
              : <>🏓 Ball's in {partner}'s court · {countdown(rally.endsAt - now)}</>}
        </p>
      )}

      <MissButton
        ref={button}
        hearts={mine.hearts}
        busy={busy}
        partner={partner}
        onHoldStart={onHoldStart}
        onSend={(c, b) => void onSend(c, b)}
        onDenied={() => { sfx.denied(); toast('Out of hearts. One comes back every 30 minutes.', 'warn') }}
      />

      <div className="hearts" aria-label={`You have ${mine.hearts} of 3 hearts`} data-testid="hearts">
        {[0, 1, 2].map((i) => <span key={i} className={i < mine.hearts ? 'heart full' : 'heart'}>{i < mine.hearts ? '♥' : '♡'}</span>)}
        {mine.nextAt && <small>next in {countdown(mine.nextAt - now)}</small>}
      </div>

      {canTag && (
        <div className="why" role="group" aria-label="Why do you miss them?" data-testid="why">
          <p className="why-title">Why? <small>{partner} will see it</small></p>
          <div className="why-chips">
            {REASONS.map((r) => (
              <button key={r.id} className="why-chip" onClick={() => void tagMiss(r.id)} aria-label={r.label} title={r.label} data-testid={`why-${r.id}`}>
                <span aria-hidden="true">{r.icon}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <section className="card today" aria-label="Today">
        <h2>Today <small>new games every day</small></h2>
        <div className="today-grid">
          {dailyOn(today, 'prove') && (
            <button className="today-btn" onClick={() => open('prove')} data-testid="open-prove">
              <span className="today-icon" aria-hidden="true">🔍</span>
              <span className="today-name">Prove It</span>
              <small>{proveLine}</small>
            </button>
          )}
          {dailyOn(today, 'tot') && (
            <button className="today-btn" onClick={() => open('tot')} data-testid="open-tot">
              <span className="today-icon" aria-hidden="true">🤔</span>
              <span className="today-name">This or That</span>
              <small>{totLine}</small>
            </button>
          )}
          <button className="today-btn" onClick={hands.openScreen} data-testid="open-hands">
            <span className="today-icon" aria-hidden="true">🤝</span>
            <span className="today-name">Hold hands</span>
            <small>{handsLine}</small>
          </button>
          <button className="today-btn wide" onClick={duel.pick} disabled={!partnerHere || duel.phase.kind !== 'idle'} data-testid="open-duel">
            <span className="today-name">🎮 Play</span>
            <span className="today-games" data-testid="today-games">
              {playToday.map((g) => <span key={g} className="game-chip">{VS_GAMES[g].icon} {VS_GAMES[g].name}</span>)}
            </span>
            <small>{duelLine}</small>
          </button>
        </div>
        {yesterdayProve && <button className="link" onClick={() => open('prove')} data-testid="yesterday-prove">🔍 Yesterday’s Prove It results →</button>}
        {teaser && <p className="teaser" data-testid="teaser">{teaser}</p>}
      </section>

      <InstallCard context="game" />

      <section className="card feed" aria-label="This week">
        <h2>This week {sameBrains > 0 && <small>🧠 {sameBrains} Same Brain{sameBrains > 1 ? 's' : ''}</small>}</h2>
        {feed.length === 0 ? <p className="muted">No misses yet this week. Go on, you know you do.</p> : (
          <ul>
            {feed.map((e) => (
              <li key={e.id} className={e.kind === 'miss' ? (e.player === me ? 'mine' : 'theirs') : 'same'}>
                {e.kind === 'same_brain' ? <span>🧠 Same Brain · +3 each</span>
                  : e.kind === 'prove_it' ? <span>🔍 {e.player === me ? 'You' : e.player} proved {PROVE_LEVELS[e.points - 1]?.name} <em>+{e.points}</em></span>
                    : e.kind === 'duel' ? <span>⚔️ {e.player === me ? 'You' : e.player} won VS <em>+{e.points}</em></span>
                      : e.kind === 'hands' ? <span>🤝 {e.player === me ? 'You' : e.player} held hands <em>+{e.points}</em></span>
                        : e.kind === 'tot' ? <span>🤔 {e.player === me ? 'You' : e.player} This or That <em>+{e.points}</em></span>
                          : e.kind === 'rally' ? <span>🪶 {e.player === me ? 'You' : e.player} chapteh rally <em>+{e.points}</em></span>
                            : <span>{e.player === me ? 'You' : e.player} {'♥'.repeat(e.charge ?? 1)}{e.rally_bonus > 0 && <em> +{e.rally_bonus} rally</em>}{reasonOf(e.reason) && <em className="feed-why"> · {reasonOf(e.reason)!.icon} {reasonOf(e.reason)!.label}</em>}</span>}
                <time>{ago(now - Date.parse(e.created_at))}</time>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="foot">
        <p>Hold to charge (up to 3), then tap why. Answer a miss within 5 min for a rally bonus. Send at the same moment for a Same Brain. Hearts refill every 30 min. Prove It and This or That once a day; the first versus win each day is +5; hold hands for up to 5 a day. Seasons end Sunday midnight.</p>
        {backend.refillHearts && <button className="link" onClick={() => { backend.refillHearts!(); refreshStatus() }}>refill my hearts (demo)</button>}
      </footer>
      </>}

      <DuelOverlay duel={duel} demo={backend.kind === 'demo'} lineup={today} />
      <HoldHands hands={hands} partner={partner} />

      {hands.asked && !hands.open && duel.phase.kind === 'idle' && (
        <div className="nudge card" role="alert" data-testid="hands-nudge">
          <p>🤝 <b>{partner}</b> wants to hold hands</p>
          <div className="pick">
            <button className="pill" onClick={hands.openScreen}>Hold hands</button>
            <button className="pill ghost" onClick={hands.dismiss}>Not now</button>
          </div>
        </div>
      )}

      <div className="toasts" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={`toast ${t.tone ?? ''}`}>{t.text}</div>)}
      </div>

      <div className="flights" aria-hidden="true">
        {flights.map((f) => <FlyingHeart key={f.id} flight={f} done={() => setFlights((all) => all.filter((x) => x.id !== f.id))} />)}
      </div>

      {sameBrain > 0 && (
        <div className="same-brain" role="alert" onClick={() => setSameBrain(0)}>
          <div className="same-card">
            <p className="same-title">SAME BRAIN 🧠</p>
            <p>You were missing each other at the very same moment.</p>
            <p className="same-points">+3 each</p>
          </div>
          {Array.from({ length: 14 }, (_, i) => <span key={i} className="confetti" style={{ '--i': i } as CSSProperties}>♥</span>)}
        </div>
      )}
    </main>
  )
}

function FlyingHeart({ flight, done }: { flight: Flight; done(): void }) {
  const el = useRef<HTMLSpanElement>(null)
  const doneRef = useRef(done)
  useEffect(() => {
    const node = el.current
    if (!node) return
    const cx = (r: DOMRect) => r.left + r.width / 2
    const cy = (r: DOMRect) => r.top + r.height / 2
    const x0 = cx(flight.from), y0 = cy(flight.from), x1 = cx(flight.to), y1 = cy(flight.to)
    const lift = Math.min(140, Math.abs(y1 - y0) * 0.4 + 60)
    const s = 0.7 + flight.size * 0.35
    const anim = node.animate([
      { transform: `translate(${x0}px, ${y0}px) translate(-50%, -50%) scale(${s * 0.6})`, opacity: 0.2 },
      { transform: `translate(${(x0 + x1) / 2}px, ${Math.min(y0, y1) - lift}px) translate(-50%, -50%) scale(${s * 1.3})`, opacity: 1, offset: 0.5 },
      { transform: `translate(${x1}px, ${y1}px) translate(-50%, -50%) scale(${s * 0.5})`, opacity: 0 },
    ], { duration: 950, easing: 'cubic-bezier(.3,.7,.4,1)' })
    anim.onfinish = () => doneRef.current()
    return () => anim.cancel()
  }, [flight])
  return <span ref={el} className={`flying ${flight.tone}`}>♥</span>
}
