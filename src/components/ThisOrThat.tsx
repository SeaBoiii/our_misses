import { useCallback, useEffect, useState } from 'react'
import type { Backend } from '../lib/backend'
import { totById, totOfDay, totPoints } from '../game/more'
import type { Player, TotDay, TotEntry, TotStatus } from '../game/rules'
import { weekLabel } from '../lib/format'
import { sfx } from '../lib/sound'

const pickName = (question: string | undefined, choice: number | undefined) => {
  const q = question ? totById(question) : undefined
  return q && choice !== undefined ? (choice === 0 ? q.a : q.b) : '…'
}

function Reveal({ day, me, partner }: { day: TotDay; me: Player; partner: Player }) {
  const mine = day[me] as Required<TotEntry>
  const theirs = day[partner] as Required<TotEntry>
  const q = totById(mine.question)
  const iKnew = mine.guess === theirs.mine
  const theyKnew = theirs.guess === mine.mine
  const same = mine.mine === theirs.mine
  return (
    <div className="tot-reveal" data-testid="tot-reveal">
      <p className="tot-q">{q ? `${q.a} or ${q.b}?` : 'This or That'}</p>
      <div className="prove-pair">
        <div className={`prove-card ${iKnew ? 'passed' : ''}`}>
          <span className="prove-who">You picked</span>
          <span className="prove-claim">{pickName(mine.question, mine.mine)}</span>
          <span className="prove-score">guessed {partner}: {pickName(mine.question, mine.guess)} {iKnew ? '✓' : '✗'}</span>
        </div>
        <div className={`prove-card ${theyKnew ? 'passed' : ''}`}>
          <span className="prove-who">{partner} picked</span>
          <span className="prove-claim">{pickName(theirs.question, theirs.mine)}</span>
          <span className="prove-score">guessed you: {pickName(theirs.question, theirs.guess)} {theyKnew ? '✓' : '✗'}</span>
        </div>
      </div>
      <p className="center-text">
        {same ? 'Same pick! Same brain. ' : ''}
        You +{totPoints(mine.mine, mine.guess, theirs.mine)} · {partner} +{totPoints(theirs.mine, theirs.guess, mine.mine)} misses
      </p>
    </div>
  )
}

/** This or That: pick yours, guess theirs. Revealed once you have both answered. */
export function ThisOrThat({ backend, me, partner, refresh, onBack, onChange, toast, onToday = true }: {
  backend: Backend
  me: Player
  partner: Player
  refresh: number
  onBack(): void
  onChange(s: TotStatus): void
  toast(text: string, tone?: 'love' | 'warn'): void
  /** Is This or That in today's lineup? If not, only the album is shown. */
  onToday?: boolean
}) {
  const [status, setStatus] = useState<TotStatus | null>(null)
  const [album, setAlbum] = useState<TotDay[]>([])
  const [mine, setMine] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  const show = useCallback((s: TotStatus) => { setStatus(s); onChange(s) }, [onChange])
  const load = useCallback(() => {
    backend.totToday().then((s) => { if (s) show(s) }).catch(() => { /* try again on next refresh */ })
    backend.totAlbum().then((a) => setAlbum(a ?? [])).catch(() => { /* optional */ })
  }, [backend, show])
  useEffect(() => { load() }, [load, refresh])

  const today = status?.today
  const myEntry = today?.[me] ?? null
  const theirEntry = today?.[partner] ?? null
  const q = status ? totOfDay(status.day) : null

  const guess = async (g: number) => {
    if (!q || mine === null) return
    setBusy(true)
    sfx.unlock()
    try {
      const s = await backend.totAnswer(q.id, mine, g)
      show(s)
      backend.signal({ type: 'tot_answered' })
      sfx.pop(1)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save that', 'warn')
      load()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="prove" aria-labelledby="tot-title">
      <div className="history-top">
        <button className="link back" onClick={onBack}>← back to the rope</button>
        <h2 id="tot-title">This or That 🤔</h2>
      </div>

      {!status || !q ? <p className="loading">finding today’s question…</p> : !myEntry && !onToday ? (
        <div className="card stack" data-testid="not-today">
          <p className="prove-headline">This or That is resting today</p>
          <p className="muted small center-text">The games rotate every day. Your answers are kept below.</p>
        </div>
      ) : !myEntry ? (
        <div className="card stack tot-card">
          <p className="tot-step">{mine === null ? 'Today’s question. You?' : `And ${partner}? Guess their pick.`}</p>
          <p className="tot-q">{q.a} <span>or</span> {q.b}?</p>
          <div className="tot-options">
            {[q.a, q.b].map((label, i) => (
              <button
                key={label}
                className={`tot-option${mine !== null && mine === i ? ' chosen' : ''}`}
                disabled={busy}
                onClick={() => (mine === null ? setMine(i) : void guess(i))}
                data-testid={`tot-${i}`}
              >{label}</button>
            ))}
          </div>
          {mine !== null && <button className="link" onClick={() => setMine(null)}>change my pick</button>}
          <p className="muted small">A right guess is +2 misses, and picking the same thing is +1 each. You’ll see both once you’ve each answered.</p>
          {theirEntry && <p className="muted small center-text">{partner} has already answered.</p>}
        </div>
      ) : today!.revealed ? (
        <div className="card stack"><Reveal day={today!} me={me} partner={partner} /></div>
      ) : (
        <div className="card stack" data-testid="tot-waiting">
          <p className="tot-q">{q.a} or {q.b}?</p>
          <p>You picked <b>{pickName(myEntry.question, myEntry.mine)}</b> and guessed {partner} would pick <b>{pickName(myEntry.question, myEntry.guess)}</b>.</p>
          <p className="muted small">{partner} hasn’t answered yet. You’ll both see the results once they do.</p>
        </div>
      )}

      {album.filter((d) => d.day !== status?.day).length > 0 && (
        <div className="card stack tot-album">
          <h3>Our answers</h3>
          <ul>
            {album.filter((d) => d.day !== status?.day).map((d) => {
              const a = d[me] as Required<TotEntry>
              const b = d[partner] as Required<TotEntry>
              const question = totById(a.question)
              return (
                <li key={d.day}>
                  <span className="tot-album-q">{question ? `${question.a} or ${question.b}` : a.question}</span>
                  <span>You: {pickName(a.question, a.mine)}{a.guess === b.mine ? ' ✓' : ''} · {partner}: {pickName(b.question, b.mine)}{b.guess === a.mine ? ' ✓' : ''}</span>
                  <time>{weekLabel(d.day)}</time>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </section>
  )
}
