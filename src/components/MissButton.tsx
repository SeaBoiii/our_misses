import { forwardRef, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { CHARGE_STEPS_MS, chargeFor } from '../game/rules'
import { sfx } from '../lib/sound'

interface Props {
  hearts: number
  busy: boolean
  partner: string
  onHoldStart(): void
  onSend(charge: 1 | 2 | 3, burst: boolean): void
  onDenied(): void
}

const R = 92
const CIRC = 2 * Math.PI * R
const FULL = CHARGE_STEPS_MS[2]
const WOBBLE_AFTER = 2250

const LABELS = ['', '♥ +1', '♥♥ +2', '♥♥♥ MAX +3 · let go!']

export const MissButton = forwardRef<HTMLButtonElement, Props>(function MissButton(props, ref) {
  const { hearts, busy, partner } = props
  const latest = useRef(props)
  useEffect(() => { latest.current = props })
  const start = useRef<number | null>(null)
  const frame = useRef(0)
  const ring = useRef<SVGCircleElement>(null)
  const [level, setLevel] = useState(0)
  const [shaking, setShaking] = useState(false)

  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  const setRing = (fraction: number) => {
    if (ring.current) ring.current.style.strokeDashoffset = String(CIRC * (1 - fraction))
  }

  const stop = () => {
    start.current = null
    cancelAnimationFrame(frame.current)
    setLevel(0)
    setShaking(false)
    setRing(0)
  }

  const finish = (forcedBurst = false) => {
    if (start.current === null) return
    const held = performance.now() - start.current
    stop()
    const charge = chargeFor(held)
    const burst = forcedBurst || charge === 'burst'
    latest.current.onSend(burst ? 1 : (charge as 1 | 2 | 3), burst)
  }

  const begin = () => {
    if (start.current !== null) return
    const p = latest.current
    if (p.hearts < 1) { p.onDenied(); return }
    if (p.busy) return
    start.current = performance.now()
    setLevel(1)
    p.onHoldStart()
    sfx.charge(0)
    let shown = 1
    const tick = () => {
      if (start.current === null) return
      const held = performance.now() - start.current
      const charge = chargeFor(held)
      if (charge === 'burst') { finish(true); return }
      if (charge !== shown) { shown = charge; setLevel(charge); sfx.charge(charge) }
      setShaking(held > WOBBLE_AFTER)
      setRing(Math.min(1, held / FULL))
      frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
  }

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* synthetic pointer */ }
    begin()
  }
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); begin() }
  }
  const onKeyUp = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); finish() }
  }

  const empty = hearts < 1
  const hint = empty
    ? 'out of hearts · miss them quietly for a bit'
    : level > 0 ? LABELS[level] : `tap, or hold for a bigger heart`

  return (
    <div className="miss">
      <button
        ref={ref}
        type="button"
        className={`miss-button level-${level}${shaking ? ' shaking' : ''}${empty ? ' empty' : ''}${busy ? ' busy' : ''}`}
        aria-label={empty ? 'Out of hearts' : `Send ${partner} a miss. Hold longer for a bigger heart.`}
        aria-disabled={empty || busy}
        onPointerDown={onPointerDown}
        onPointerUp={() => finish()}
        onPointerCancel={stop}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onBlur={stop}
        onContextMenu={(e) => e.preventDefault()}
      >
        <svg viewBox="0 0 200 200" aria-hidden="true">
          <circle className="ring-track" cx="100" cy="100" r={R} />
          <circle ref={ring} className="ring-fill" cx="100" cy="100" r={R} strokeDasharray={CIRC} strokeDashoffset={CIRC} transform="rotate(-90 100 100)" />
          {CHARGE_STEPS_MS.slice(0, 2).map((ms) => {
            const a = (ms / FULL) * 2 * Math.PI - Math.PI / 2
            return <circle key={ms} className="ring-step" cx={100 + R * Math.cos(a)} cy={100 + R * Math.sin(a)} r="5" />
          })}
          <g className="big-heart">
            <path d="M100 150 C 48 112 56 62 82 62 C 92 62 98 69 100 76 C 102 69 108 62 118 62 C 144 62 152 112 100 150 Z" />
          </g>
        </svg>
        <span className="miss-word">{empty ? 'wait…' : level === 0 ? 'miss' : '♥'.repeat(level)}</span>
      </button>
      <p className="miss-hint" aria-live="polite">{hint}</p>
    </div>
  )
})
