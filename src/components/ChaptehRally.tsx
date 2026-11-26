import { useEffect, useState, type PointerEvent } from 'react'
import { ZONES, type Zone } from '../game/more'
import type { DuelApi } from '../lib/useDuel'

const GRADES = { perfect: 'Perfect!', good: 'Nice!', ok: 'Saved it!', miss: 'Dropped…' } as const

/**
 * Chapteh, together: the chapteh drops in from the top aimed at your left foot, knee or right
 * foot. Tap that zone as the ring closes to kick it back to the other phone.
 */
export function ChaptehRally({ duel, demo }: { duel: DuelApi; demo: boolean }) {
  const { rally, partner } = duel
  const incoming = rally.incoming
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!incoming) return
    const id = setInterval(() => setTick((n) => n + 1), 50)
    return () => clearInterval(id)
  }, [incoming])

  // Demo only: lets the browser tests kick on time.
  useEffect(() => {
    if (demo) (window as unknown as { __missuChapteh?: unknown }).__missuChapteh = incoming
  }, [demo, incoming])

  const progress = incoming ? Math.min(1, Math.max(0, 1 - (incoming.arriveAt - performance.now()) / incoming.ms)) : 0
  const press = (zone: Zone) => (e: PointerEvent<HTMLButtonElement>) => { e.preventDefault(); duel.kick(zone) }

  return (
    <div className="chapteh" data-testid="chapteh">
      <p className="chapteh-count"><b data-testid="kicks">{rally.kicks}</b> kick{rally.kicks === 1 ? '' : 's'} together</p>
      <div className="chapteh-sky">
        {incoming ? (
          <span
            className="shuttle"
            style={{ left: `${incoming.zone === 'L' ? 18 : incoming.zone === 'C' ? 50 : 82}%`, top: `${8 + progress * 72}%` }}
            aria-hidden="true"
          >🪶</span>
        ) : (
          <p className="chapteh-wait">
            {rally.myServe ? 'You serve. Tap any zone to kick it up.' : rally.kicks === 0 ? `${partner} is about to serve…` : `On ${partner}’s side…`}
          </p>
        )}
        {rally.grade && rally.grade !== 'miss' && !incoming && <p className="chapteh-grade" key={rally.kicks}>{GRADES[rally.grade]}</p>}
      </div>
      <div className="chapteh-zones">
        {(Object.keys(ZONES) as Zone[]).map((z) => (
          <button
            key={z}
            type="button"
            className={`zone${incoming?.zone === z ? ' target' : ''}`}
            onPointerDown={rally.myServe ? (e) => { e.preventDefault(); duel.serve() } : press(z)}
            onContextMenu={(e) => e.preventDefault()}
            data-testid={`zone-${z}`}
          >
            {incoming?.zone === z && <span className="ring" style={{ transform: `scale(${2.2 - progress * 1.2})` }} aria-hidden="true" />}
            <span className="zone-icon" aria-hidden="true">{ZONES[z].icon}</span>
            <span className="zone-label">{ZONES[z].label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
