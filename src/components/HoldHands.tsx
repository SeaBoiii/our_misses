import type { PointerEvent } from 'react'
import { HANDS_DAILY_CAP, HANDS_SECONDS_PER_MISS } from '../game/more'
import type { HandsApi } from '../lib/useHands'

const mmss = (ms: number) => {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Both thumbs on the screen at once, and the phones beat together. */
export function HoldHands({ hands, partner }: { hands: HandsApi; partner: string }) {
  if (!hands.open) return null
  const press = (e: PointerEvent<HTMLButtonElement>) => {
    e.preventDefault()
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* synthetic */ }
    hands.down()
  }
  const status = hands.together ? `Holding hands with ${partner}`
    : hands.meDown ? `Waiting for ${partner}’s thumb…`
      : hands.partnerDown ? `${partner} is holding on. Put your thumb down!`
        : hands.partnerOpen ? `${partner} is here. Hold your thumb on the heart.`
          : `Waiting for ${partner} to open Hold hands…`

  return (
    <div className="duel hands" role="dialog" aria-label="Hold hands">
      <div className="duel-card wide hands-card">
        <p className="duel-title">🤝 Hold hands</p>
        <p className="hands-status" data-testid="hands-status">{status}</p>
        <button
          type="button"
          className={`hands-pad${hands.together ? ' together' : ''}${hands.meDown ? ' down' : ''}`}
          onPointerDown={press}
          onPointerUp={hands.up}
          onPointerCancel={hands.up}
          onContextMenu={(e) => e.preventDefault()}
          aria-label="Hold your thumb here"
          data-testid="hands-pad"
        >
          <span className="hands-heart" aria-hidden="true">♥</span>
          <span className="hands-dots" aria-hidden="true">
            <i className={hands.meDown ? 'on' : ''} />
            <i className={hands.partnerDown ? 'on' : ''} />
          </span>
        </button>
        <p className="hands-time" data-testid="hands-time">together {mmss(hands.heldMs)}</p>
        <p className="muted small">
          Every {HANDS_SECONDS_PER_MISS} seconds together is a miss each, up to {HANDS_DAILY_CAP} a day
          {hands.earned ? ` (${hands.earned.today}/${hands.earned.cap} today)` : ''}.
        </p>
        <button className="pill ghost" onClick={hands.close}>Let go</button>
      </div>
    </div>
  )
}
