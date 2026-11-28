import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import { agakCard, BAND, CLUE_MAX, DIAL_MAX } from '../game/batch1'
import type { Backend } from '../lib/backend'
import type { AgakRound, AgakStatus, Player } from '../game/rules'
import { weekLabel } from '../lib/format'
import { sfx } from '../lib/sound'

const CX = 110
const CY = 112
const R = 96
/** 0° is the left end of the spectrum, 180° the right. */
const at = (deg: number, r = R) => {
  const a = (Math.PI * deg) / DIAL_MAX
  return [CX - r * Math.cos(a), CY - r * Math.sin(a)] as const
}
function wedge(from: number, to: number) {
  const [x1, y1] = at(Math.max(0, from))
  const [x2, y2] = at(Math.min(DIAL_MAX, to))
  return `M ${CX} ${CY} L ${x1} ${y1} A ${R} ${R} 0 0 1 ${x2} ${y2} Z`
}
const VERDICT: Record<number, string> = { 4: 'Bullseye! 🎯', 3: 'So close!', 2: 'Agak agak lah.', 0: 'Way off!' }

/** The spectrum dial. Shows the scoring bands when `target` is known; drag it to move the needle. */
function Dial({ left, right, target, needle, onNeedle }: {
  left: string
  right: string
  target: number | null
  needle: number | null
  onNeedle?(deg: number): void
}) {
  const svg = useRef<SVGSVGElement>(null)
  const dragging = useRef(false)
  const move = (e: PointerEvent<SVGSVGElement>) => {
    if (!onNeedle || !svg.current) return
    const box = svg.current.getBoundingClientRect()
    const x = ((e.clientX - box.left) / box.width) * 220 - CX
    const y = CY - ((e.clientY - box.top) / box.height) * 124
    const deg = DIAL_MAX - (Math.atan2(Math.max(0, y), x) * DIAL_MAX) / Math.PI
    onNeedle(Math.round(Math.min(DIAL_MAX, Math.max(0, deg)) * 2) / 2)
  }
  const [nx, ny] = at(needle ?? 90, R - 6)
  return (
    <div className="agak-dial">
      <svg
        ref={svg}
        viewBox="0 0 220 124"
        className={onNeedle ? 'draggable' : ''}
        onPointerDown={(e) => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); move(e) }}
        onPointerMove={(e) => { if (dragging.current) move(e) }}
        onPointerUp={() => { dragging.current = false }}
        role="img"
        aria-label="Spectrum dial"
      >
        <path d={wedge(0, DIAL_MAX)} className="agak-face" />
        {target !== null && (
          <g data-testid="agak-target">
            <path d={wedge(target - BAND * 2.5, target + BAND * 2.5)} className="agak-band b2" />
            <path d={wedge(target - BAND * 1.5, target + BAND * 1.5)} className="agak-band b3" />
            <path d={wedge(target - BAND * 0.5, target + BAND * 0.5)} className="agak-band b4" />
          </g>
        )}
        {needle !== null && (
          <>
            <line x1={CX} y1={CY} x2={nx} y2={ny} className="agak-needle" />
            <circle cx={CX} cy={CY} r={7} className="agak-hub" />
          </>
        )}
      </svg>
      <div className="agak-ends"><span>← {left}</span><span>{right} →</span></div>
    </div>
  )
}

/** Agak Agak: today's Psychic clues a hidden spot on the spectrum; the other sets the needle. You score together. */
export function AgakAgak({ backend, me, partner, refresh, onBack, onChange, toast, onToday = true }: {
  backend: Backend
  me: Player
  partner: Player
  refresh: number
  onBack(): void
  onChange(s: AgakStatus): void
  toast(text: string, tone?: 'love' | 'warn'): void
  onToday?: boolean
}) {
  const [status, setStatus] = useState<AgakStatus | null>(null)
  const [clue, setClue] = useState('')
  const [needle, setNeedle] = useState(90)
  const [busy, setBusy] = useState(false)

  const show = useCallback((s: AgakStatus) => { setStatus(s); onChange(s) }, [onChange])
  const load = useCallback(() => {
    backend.agakToday().then((s) => { if (s) show(s) }).catch(() => { /* try again on next refresh */ })
  }, [backend, show])
  useEffect(() => { load() }, [load, refresh])

  const act = async (fn: () => Promise<AgakStatus>, done: () => void) => {
    setBusy(true)
    sfx.unlock()
    try {
      show(await fn())
      backend.signal({ type: 'agak_moved' })
      done()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save that', 'warn')
      load()
    } finally {
      setBusy(false)
    }
  }

  const round: AgakRound | null = status?.today ?? null
  const psychic = round?.psychic === me
  const [left, right] = round ? agakCard(round.card) : ['', '']
  const target = round?.target === null || round?.target === undefined ? null : Number(round.target)
  const placed = round?.needle === null || round?.needle === undefined ? null : Number(round.needle)

  let body
  if (!status) body = <p className="loading">spinning the dial…</p>
  else if (!round) {
    body = (
      <div className="card stack" data-testid="not-today">
        <p className="prove-headline">Agak Agak is resting today</p>
        <p className="muted small center-text">The games rotate every day. It’ll be back soon.</p>
      </div>
    )
  } else if (placed !== null) {
    body = (
      <div className="card stack agak-card" data-testid="agak-reveal">
        <p className="agak-clue">“{round.clue}”</p>
        <Dial left={left} right={right} target={target} needle={placed} />
        <p className="prove-headline">{VERDICT[round.score ?? 0]}</p>
        <p className="center-text">{(round.score ?? 0) > 0 ? `+${round.score} misses each` : 'No misses this time. Agak agak better next time!'}</p>
      </div>
    )
  } else if (psychic && !round.clue) {
    body = (
      <div className="card stack agak-card">
        <p className="tot-step">You’re today’s Psychic 🔮</p>
        <p className="muted small">Only you can see where the target is. Give {partner} one clue that sits about there on this spectrum.</p>
        <Dial left={left} right={right} target={target} needle={null} />
        <input className="field" value={clue} maxLength={CLUE_MAX} onChange={(e) => setClue(e.target.value)} placeholder="One clue…" aria-label="Your clue" data-testid="agak-clue" />
        <button className="pill" disabled={busy || !clue.trim()} onClick={() => void act(() => backend.agakClue(clue), () => setClue(''))} data-testid="agak-send">Send my clue</button>
      </div>
    )
  } else if (psychic) {
    body = (
      <div className="card stack agak-card" data-testid="agak-waiting">
        <p className="agak-clue">“{round.clue}”</p>
        <Dial left={left} right={right} target={target} needle={null} />
        <p className="muted small center-text">Clue sent. Waiting for {partner} to set the needle…</p>
      </div>
    )
  } else if (!round.clue) {
    body = (
      <div className="card stack agak-card" data-testid="agak-waiting">
        <Dial left={left} right={right} target={null} needle={null} />
        <p className="muted small center-text">{partner} is today’s Psychic. Waiting for their clue…</p>
      </div>
    )
  } else {
    body = (
      <div className="card stack agak-card">
        <p className="tot-step">{partner}’s clue</p>
        <p className="agak-clue" data-testid="agak-their-clue">“{round.clue}”</p>
        <Dial left={left} right={right} target={null} needle={needle} onNeedle={setNeedle} />
        <input type="range" min={0} max={DIAL_MAX} step={0.5} value={needle} onChange={(e) => setNeedle(Number(e.target.value))} aria-label="Needle" data-testid="agak-needle" />
        <button className="pill" disabled={busy} onClick={() => void act(() => backend.agakGuess(needle), () => sfx.pop(2))} data-testid="agak-lock">Lock it in</button>
        <p className="muted small">Closer is better, and you both get the points: up to +4 misses each.</p>
      </div>
    )
  }

  return (
    <section className="prove" aria-labelledby="agak-title">
      <div className="history-top">
        <button className="link back" onClick={onBack}>← back to the rope</button>
        <h2 id="agak-title">Agak Agak 🎯</h2>
      </div>
      {body}
      {!onToday && round && placed === null && <p className="muted small center-text">Agak Agak isn’t in today’s lineup, but today’s round is still open.</p>}
      {status?.last && (
        <p className="muted small center-text">
          Last time ({weekLabel(status.last.day)}): “{status.last.clue}” · {VERDICT[status.last.score ?? 0]}
        </p>
      )}
    </section>
  )
}
