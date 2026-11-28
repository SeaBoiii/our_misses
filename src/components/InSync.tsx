import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { syncJudge, syncMisses, syncSong, SYNC_WINDOW_MS } from '../game/batch2'
import type { Duel } from '../game/rules'
import type { DuelApi } from '../lib/useDuel'
import { sfx } from '../lib/sound'

/** Pixels a note falls per millisecond, and where the line is. */
const SPEED = 0.24
const LANE = 300
const LINE = 250

/** In Sync, together: the same rhythm falls on both phones; tap as each note hits the line. */
export function InSync({ duel, game, demo = false }: { duel: DuelApi; game: Duel; demo?: boolean }) {
  const notes = useMemo(() => syncSong(game.seed), [game.seed])
  const start = Date.parse(game.starts_at)
  // The demo (and its tests) can see the rhythm, to tap it on time.
  useEffect(() => {
    if (demo) (window as unknown as { __missuSync?: unknown }).__missuSync = { notes, at: () => api.current.serverNow() - start }
  }, [demo, notes, start])
  const [mine, setMine] = useState<Set<number>>(() => new Set())
  const [theirs, setTheirs] = useState<Set<number>>(() => new Set())
  const [t, setT] = useState(0)
  const [flash, setFlash] = useState<{ ok: boolean; n: number } | null>(null)
  const mineRef = useRef(mine)
  mineRef.current = mine
  const api = useRef(duel)
  api.current = duel

  const both = [...mine].filter((i) => theirs.has(i)).length
  useEffect(() => { api.current.setScore(both) }, [both])
  const { listen } = duel
  useEffect(() => listen((s) => {
    if (s.type === 'sync_hit') setTheirs((h) => (h.has(s.beat) ? h : new Set(h).add(s.beat)))
  }), [listen])

  // The clock, and a soft tick as each note crosses the line.
  useEffect(() => {
    let raf = 0
    let last = -Infinity
    const frame = () => {
      const now = api.current.serverNow() - start
      if (notes.some((n) => n > last && n <= now)) sfx.tick()
      last = now
      setT(now)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [notes, start])

  const tap = (e: PointerEvent<HTMLButtonElement>) => {
    e.preventDefault()
    const ms = api.current.serverNow() - start
    const hit = syncJudge(notes, mineRef.current, ms)
    if (hit === null) { setFlash({ ok: false, n: ms }); return }
    const next = new Set(mineRef.current).add(hit)
    mineRef.current = next
    setMine(next)
    api.current.backend.signal({ type: 'sync_hit', beat: hit })
    setFlash({ ok: true, n: ms })
    sfx.pop(theirs.has(hit) ? 2 : 1)
  }

  const done = t > notes[notes.length - 1] + SYNC_WINDOW_MS
  return (
    <div className="sync" data-testid="sync">
      <div className="race-head">
        <span className="duel-time">🥁 {both} beat{both === 1 ? '' : 's'} together</span>
        <span className="muted small">+{syncMisses(both)} so far</span>
      </div>
      <div className="sync-lane" style={{ height: LANE }}>
        <div className="sync-line" style={{ top: LINE }} />
        {notes.map((n, i) => {
          const y = LINE - (n - t) * SPEED
          if (y < -30 || y > LANE + 30) return null
          const [m, th] = [mine.has(i), theirs.has(i)]
          const missed = !m && t - n > SYNC_WINDOW_MS
          return (
            <span key={i} className={`sync-note ${m ? 'mine' : ''} ${th ? 'theirs' : ''} ${missed ? 'missed' : ''}`} style={{ top: y }}>
              {m && th ? '❤️' : ''}
            </span>
          )
        })}
        {flash && <span key={flash.n} className={`sync-flash ${flash.ok ? 'ok' : 'off'}`}>{flash.ok ? 'on beat!' : 'off'}</span>}
      </div>
      <p className="muted small">Pink is you, the ring is {duel.partner}. Both on one note makes a ❤️; every 4 hearts is a miss each.</p>
      <button className="tap-button sync-pad" onPointerDown={tap} onContextMenu={(e) => e.preventDefault()} disabled={done} data-testid="sync-tap">
        {done ? 'That’s the song!' : 'TAP'}
      </button>
    </div>
  )
}
