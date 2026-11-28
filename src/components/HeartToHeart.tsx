import { useCallback, useEffect, useState } from 'react'
import { HEART_DECKS } from '../content/hearts'
import { HTH_MAX, HTH_POINTS, hthById, hthOfDay } from '../game/batch1'
import type { Backend } from '../lib/backend'
import type { HthDay, HthEntry, HthStatus, Player } from '../game/rules'
import { weekLabel } from '../lib/format'
import { sfx } from '../lib/sound'

const promptOf = (id: string | undefined) => (id ? hthById(id)?.prompt : undefined) ?? 'Heart to Heart'

function Answers({ day, me, partner }: { day: HthDay; me: Player; partner: Player }) {
  const mine = day[me] as Required<HthEntry>
  const theirs = day[partner] as Required<HthEntry>
  return (
    <div className="hth-pair">
      <div className="hth-answer mine"><span className="prove-who">You</span><p>{mine.answer}</p></div>
      <div className="hth-answer theirs"><span className="prove-who">{partner}</span><p>{theirs.answer}</p></div>
    </div>
  )
}

/** Heart to Heart: one of our_hearts' questions a day, answered in writing. You see each other's once you both have. */
export function HeartToHeart({ backend, me, partner, refresh, onBack, onChange, toast, onToday = true }: {
  backend: Backend
  me: Player
  partner: Player
  refresh: number
  onBack(): void
  onChange(s: HthStatus): void
  toast(text: string, tone?: 'love' | 'warn'): void
  onToday?: boolean
}) {
  const [status, setStatus] = useState<HthStatus | null>(null)
  const [album, setAlbum] = useState<HthDay[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

  const show = useCallback((s: HthStatus) => { setStatus(s); onChange(s) }, [onChange])
  const load = useCallback(() => {
    backend.hthToday().then((s) => { if (s) show(s) }).catch(() => { /* try again on next refresh */ })
    backend.hthAlbum().then((a) => setAlbum(a ?? [])).catch(() => { /* optional */ })
  }, [backend, show])
  useEffect(() => { load() }, [load, refresh])

  const today = status?.today
  const myEntry = today?.[me] ?? null
  const theirEntry = today?.[partner] ?? null
  const q = status ? hthOfDay(status.day) : null

  const send = async () => {
    if (!q || !draft.trim()) return
    setBusy(true)
    sfx.unlock()
    try {
      show(await backend.hthAnswer(q.id, draft))
      backend.signal({ type: 'hth_answered' })
      setDraft('')
      sfx.pop(2)
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
    <section className="prove" aria-labelledby="hth-title">
      <div className="history-top">
        <button className="link back" onClick={onBack}>← back to the rope</button>
        <h2 id="hth-title">Heart to Heart 💬</h2>
      </div>

      {!status || !q ? <p className="loading">finding today’s question…</p> : !myEntry && !onToday ? (
        <div className="card stack" data-testid="not-today">
          <p className="prove-headline">Heart to Heart is resting today</p>
          <p className="muted small center-text">The games rotate every day. Your answers are kept below.</p>
        </div>
      ) : (
        <div className="card stack hth-card">
          <span className="game-chip hth-deck">{HEART_DECKS[q.deck]}</span>
          <p className="hth-q" data-testid="hth-question">{promptOf(myEntry?.question ?? q.id)}</p>
          {!myEntry ? (
            <>
              {q.followUp && <p className="muted small">If you want more: {q.followUp}</p>}
              <textarea
                className="field hth-input"
                value={draft}
                maxLength={HTH_MAX}
                rows={4}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Write it like you’d say it…"
                aria-label="Your answer"
                data-testid="hth-input"
              />
              <div className="hth-foot">
                <span className="muted small">{draft.length}/{HTH_MAX}</span>
                <button className="pill small-pill" onClick={() => void send()} disabled={busy || !draft.trim()} data-testid="hth-send">Share my answer</button>
              </div>
              <p className="muted small">{theirEntry ? `${partner} has already answered. ` : ''}You’ll see each other’s answers once you’ve both written one, and it’s +{HTH_POINTS} misses each.</p>
            </>
          ) : today!.revealed ? (
            <div data-testid="hth-reveal">
              <Answers day={today!} me={me} partner={partner} />
              <p className="center-text">+{HTH_POINTS} misses each 💞</p>
            </div>
          ) : (
            <div className="stack" data-testid="hth-waiting">
              <div className="hth-answer mine"><span className="prove-who">You</span><p>{myEntry.answer}</p></div>
              <p className="muted small">{partner} hasn’t answered yet. You’ll see theirs once they do.</p>
            </div>
          )}
        </div>
      )}

      {past.length > 0 && (
        <div className="card stack tot-album">
          <h3>Our answers</h3>
          <ul className="hth-album">
            {past.map((d) => (
              <li key={d.day}>
                <span className="tot-album-q">{promptOf(d[me]?.question)}</span>
                <time>{weekLabel(d.day)}</time>
                <Answers day={d} me={me} partner={partner} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
