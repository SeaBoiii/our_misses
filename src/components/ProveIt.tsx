import { useCallback, useEffect, useState } from 'react'
import type { Backend } from '../lib/backend'
import { PROVE_LEVELS, proveTarget } from '../game/catch'
import { dayKey, type Player, type ProveDay, type ProveEntry, type ProveStatus } from '../game/rules'
import { sfx } from '../lib/sound'
import { CatchGame } from './CatchGame'

type Phase = { kind: 'view' } | { kind: 'countdown'; n: number; target: number } | { kind: 'playing'; target: number } | { kind: 'saving' }

const levelOf = (n?: number) => PROVE_LEVELS[(n ?? 1) - 1]

function dayName(day: string, today: string) {
  const yesterday = dayKey(Date.parse(`${today}T12:00:00+08:00`) - 86_400_000)
  if (day === yesterday) return 'Yesterday'
  return new Date(`${day}T12:00:00+08:00`).toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' })
}

function Card({ who, entry, mine }: { who: string; entry: ProveEntry | null; mine: boolean }) {
  if (!entry) {
    return (
      <div className="prove-card waiting">
        <span className="prove-who">{who}</span>
        <span className="prove-claim">hasn’t played yet</span>
      </div>
    )
  }
  if (entry.level === undefined) {
    return (
      <div className="prove-card hidden">
        <span className="prove-who">{who}</span>
        <span className="prove-claim">played ✓</span>
        <span className="prove-score">claim hidden until you play</span>
      </div>
    )
  }
  const level = levelOf(entry.level)
  const state = !entry.finished ? 'pending' : entry.passed ? 'passed' : 'bluff'
  return (
    <div className={`prove-card ${state}`} data-testid={mine ? 'prove-mine' : 'prove-theirs'}>
      <span className="prove-who">{who}</span>
      <span className="prove-claim">{level.icon} {level.name}</span>
      <span className="prove-score">{entry.finished ? `caught ${entry.score} of ${entry.target}` : 'round in progress…'}</span>
      {entry.finished && <span className="stamp">{entry.passed ? 'PROVEN ✓' : 'BLUFF DETECTED 🤥'}</span>}
    </div>
  )
}

function Pair({ day, me, partner }: { day: ProveDay; me: Player; partner: Player }) {
  return (
    <div className="prove-pair">
      <Card who="You" entry={day[me]} mine />
      <Card who={partner} entry={day[partner]} mine={false} />
    </div>
  )
}

/** Prove It: claim how much you missed them today, then catch enough to prove it. */
export function ProveIt({ backend, me, partner, refresh, onBack, onChange, toast }: {
  backend: Backend
  me: Player
  partner: Player
  /** Bumped by the game screen when the partner plays or results arrive. */
  refresh: number
  onBack(): void
  onChange(s: ProveStatus): void
  toast(text: string, tone?: 'love' | 'warn'): void
}) {
  const [status, setStatus] = useState<ProveStatus | null>(null)
  const [pick, setPick] = useState<number | null>(null)
  const [phase, setPhase] = useState<Phase>({ kind: 'view' })
  const [error, setError] = useState<string | null>(null)

  const show = useCallback((s: ProveStatus) => { setStatus(s); onChange(s) }, [onChange])
  const load = useCallback(() => {
    backend.proveToday().then(show).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not load today'))
  }, [backend, show])
  useEffect(() => { if (phase.kind === 'view') load() }, [load, refresh, phase.kind])

  useEffect(() => {
    if (phase.kind !== 'countdown') return
    const id = setTimeout(() => {
      if (phase.n > 1) { sfx.tick(); setPhase({ ...phase, n: phase.n - 1 }) }
      else { sfx.go(); setPhase({ kind: 'playing', target: phase.target }) }
    }, 700)
    return () => clearTimeout(id)
  }, [phase])

  const lockIn = async () => {
    if (pick === null) return
    sfx.unlock()
    try {
      const started = await backend.proveStart(pick)
      sfx.tick()
      setPhase({ kind: 'countdown', n: 3, target: started.target })
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not start', 'warn')
      load()
    }
  }

  const finish = async (score: number) => {
    setPhase({ kind: 'saving' })
    try {
      const s = await backend.proveFinish(score)
      show(s)
      backend.signal({ type: 'prove_played' })
      if (s.today[me]?.passed) sfx.win()
      else sfx.lose()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save your round', 'warn')
    }
    setPhase({ kind: 'view' })
  }

  if (phase.kind === 'countdown' || phase.kind === 'playing' || phase.kind === 'saving') {
    const level = levelOf(pick ?? 1)
    return (
      <section className="prove" aria-label="Prove It round">
        <div className="prove-top"><h2>Prove it: {level.icon} {level.name}</h2></div>
        {phase.kind === 'countdown' && <div className="countdown" aria-live="assertive" data-testid="countdown">{phase.n}</div>}
        {phase.kind === 'playing' && <CatchGame target={phase.target} onDone={(score) => void finish(score)} />}
        {phase.kind === 'saving' && <p className="loading center-text">counting what you caught…</p>}
      </section>
    )
  }

  const today = status?.today
  const mine = today?.[me] ?? null
  const theirs = today?.[partner] ?? null

  return (
    <section className="prove" aria-labelledby="prove-title">
      <div className="history-top">
        <button className="link back" onClick={onBack}>← back to the rope</button>
        <h2 id="prove-title">Prove It 🔍</h2>
      </div>

      {!status ? <p className="loading">{error ?? 'opening today’s round…'}</p> : !mine ? (
        <div className="card stack">
          <p className="prove-ask">How much did you miss {partner} today?</p>
          <p className="muted small">Then prove it: catch enough in 20 seconds. Bigger claims need bigger catches. One try a day, and walking away counts as a bluff.</p>
          <div className="ladder" role="radiogroup" aria-label="How much">
            {PROVE_LEVELS.map((l) => (
              <button
                key={l.level}
                role="radio"
                aria-checked={pick === l.level}
                className={`rung${pick === l.level ? ' picked' : ''}`}
                onClick={() => setPick(l.level)}
              >
                <span className="rung-icon">{l.icon}</span>
                <span className="rung-name">{l.name}</span>
                <span className="rung-need">catch {proveTarget(l.level)} · +{l.level}</span>
              </button>
            ))}
          </div>
          <button className="pill" disabled={pick === null} onClick={() => void lockIn()}>
            {pick === null ? 'Pick one' : `Lock in ${levelOf(pick).name} and play`}
          </button>
          {theirs && <p className="muted small center-text">{partner} has already played today. Their claim stays hidden until you do.</p>}
        </div>
      ) : (
        <div className="card stack">
          {today!.revealed ? <p className="prove-headline">The results are in!</p> : <p className="prove-headline">Your round is in.</p>}
          <Pair day={today!} me={me} partner={partner} />
          {!today!.revealed && (
            <p className="muted small center-text">
              {mine.finished && mine.passed
                ? `Your +${mine.level} lands on the rope when ${partner} plays, or at midnight.`
                : mine.finished
                  ? `No points this time, and ${partner} will see the stamp when the results come in.`
                  : 'You left mid-round. It counts as a bluff after two minutes.'}
            </p>
          )}
        </div>
      )}

      {status?.last && !(today?.revealed) && (
        <div className="card stack prove-last">
          <h3>{dayName(status.last.day, status.day)}</h3>
          <Pair day={status.last} me={me} partner={partner} />
        </div>
      )}
    </section>
  )
}
