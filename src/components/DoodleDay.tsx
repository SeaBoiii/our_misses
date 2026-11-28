import { useCallback, useEffect, useState } from 'react'
import { DOODLE_POINTS, DOODLE_SECONDS, doodleById, doodleOfDay, strokesFit, type Stroke } from '../game/batch2'
import type { Backend } from '../lib/backend'
import type { DoodleDay as Day, DoodleEntry, DoodleStatus, Player } from '../game/rules'
import { weekLabel } from '../lib/format'
import { sfx } from '../lib/sound'
import { DrawPad, StrokeView } from './Sketch'

const promptOf = (id: string | undefined) => (id ? doodleById(id)?.prompt : undefined) ?? 'Doodle Day'

function Pair({ day, me, partner }: { day: Day; me: Player; partner: Player }) {
  const mine = day[me] as Required<DoodleEntry>
  const theirs = day[partner] as Required<DoodleEntry>
  return (
    <div className="doodle-pair">
      <figure><StrokeView strokes={mine.strokes} label="Your doodle" /><figcaption>You</figcaption></figure>
      <figure><StrokeView strokes={theirs.strokes} label={`${partner}’s doodle`} /><figcaption>{partner}</figcaption></figure>
    </div>
  )
}

/** Doodle Day: 30 seconds to draw today's prompt. You see each other's once you've both drawn. */
export function DoodleDay({ backend, me, partner, refresh, onBack, onChange, toast, onToday = true }: {
  backend: Backend
  me: Player
  partner: Player
  refresh: number
  onBack(): void
  onChange(s: DoodleStatus): void
  toast(text: string, tone?: 'love' | 'warn'): void
  onToday?: boolean
}) {
  const [status, setStatus] = useState<DoodleStatus | null>(null)
  const [album, setAlbum] = useState<Day[]>([])
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [endsAt, setEndsAt] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)

  const show = useCallback((s: DoodleStatus) => { setStatus(s); onChange(s) }, [onChange])
  const load = useCallback(() => {
    backend.doodleToday().then((s) => { if (s) show(s) }).catch(() => { /* try again on next refresh */ })
    backend.doodleAlbum().then((a) => setAlbum(a ?? [])).catch(() => { /* optional */ })
  }, [backend, show])
  useEffect(() => { load() }, [load, refresh])
  useEffect(() => {
    if (endsAt === null) return
    const id = setInterval(() => setNow(Date.now()), 200)
    return () => clearInterval(id)
  }, [endsAt])

  const today = status?.today
  const myEntry = today?.[me] ?? null
  const theirEntry = today?.[partner] ?? null
  const prompt = status ? doodleOfDay(status.day) : null
  const left = endsAt === null ? DOODLE_SECONDS * 1000 : Math.max(0, endsAt - now)
  const drawing = endsAt !== null && left > 0
  const timeUp = endsAt !== null && left === 0

  const start = () => { sfx.unlock(); sfx.go(); setStrokes([]); setNow(Date.now()); setEndsAt(Date.now() + DOODLE_SECONDS * 1000) }
  const send = async () => {
    if (!prompt || !strokesFit(strokes)) return
    setBusy(true)
    try {
      show(await backend.doodleSubmit(prompt.id, strokes))
      backend.signal({ type: 'doodle_drawn' })
      sfx.pop(2)
      setEndsAt(null)
      load()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save that', 'warn')
      load()
    } finally {
      setBusy(false)
    }
  }

  const past = album.filter((d) => d.day !== status?.day)
  return (
    <section className="prove" aria-labelledby="doodle-title">
      <div className="history-top">
        <button className="link back" onClick={onBack}>← back to the rope</button>
        <h2 id="doodle-title">Doodle Day ✏️</h2>
      </div>

      {!status || !prompt ? <p className="loading">sharpening pencils…</p> : !myEntry && !onToday ? (
        <div className="card stack" data-testid="not-today">
          <p className="prove-headline">Doodle Day is resting today</p>
          <p className="muted small center-text">The games rotate every day. Your doodles are kept below.</p>
        </div>
      ) : (
        <div className="card stack doodle-card">
          <p className="hth-q" data-testid="doodle-prompt">{promptOf(myEntry?.prompt ?? prompt.id)}</p>
          {!myEntry ? (
            endsAt === null ? (
              <>
                <p className="muted small">You get {DOODLE_SECONDS} seconds. No erasing your way to a masterpiece. {theirEntry ? `${partner} has already drawn theirs.` : ''}</p>
                <button className="pill" onClick={start} data-testid="doodle-start">Start drawing</button>
                <p className="muted small">You’ll see each other’s once you’ve both drawn, and it’s +{DOODLE_POINTS} misses each.</p>
              </>
            ) : (
              <>
                <div className="doodle-head">
                  <span className={`duel-time ${left < 5_000 ? 'hurry' : ''}`} data-testid="doodle-timer">{drawing ? `⏱ ${Math.ceil(left / 1000)}s` : 'Time!'}</span>
                  {timeUp && strokes.length === 0 && <button className="link" onClick={start}>that was empty, go again</button>}
                </div>
                <DrawPad
                  strokes={strokes}
                  disabled={!drawing}
                  onStroke={(s) => setStrokes((all) => [...all, s])}
                  onUndo={() => setStrokes((all) => all.slice(0, -1))}
                />
                <button className="pill" onClick={() => void send()} disabled={busy || strokes.length === 0} data-testid="doodle-send">
                  {drawing ? 'Done, send it' : 'Send it'}
                </button>
              </>
            )
          ) : today!.revealed ? (
            <div data-testid="doodle-reveal">
              <Pair day={today!} me={me} partner={partner} />
              <p className="center-text">+{DOODLE_POINTS} misses each 💞</p>
            </div>
          ) : (
            <div className="stack" data-testid="doodle-waiting">
              <StrokeView strokes={myEntry.strokes ?? []} label="Your doodle" className="small-sketch" />
              <p className="muted small">{partner} hasn’t drawn yet. You’ll see theirs once they do.</p>
            </div>
          )}
        </div>
      )}

      {past.length > 0 && (
        <div className="card stack tot-album">
          <h3>Our doodles</h3>
          <ul className="hth-album">
            {past.map((d) => (
              <li key={d.day}>
                <span className="tot-album-q">{promptOf(d[me]?.prompt)}</span>
                <time>{weekLabel(d.day)}</time>
                <Pair day={d} me={me} partner={partner} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
