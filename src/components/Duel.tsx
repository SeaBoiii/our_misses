import { useEffect, useState, type PointerEvent } from 'react'
import { describeVsScore, VS_LENGTH_MS, type Player, type VsGame } from '../game/rules'
import { VS_GAMES } from '../game/vsGames'
import type { DuelApi } from '../lib/useDuel'
import { PourRace } from './PourRace'
import { Rope } from './Rope'

const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function DuelOverlay({ duel, demo }: { duel: DuelApi; demo: boolean }) {
  const { phase, mine, theirs, theirsSolved, me, partner } = duel
  const [, setTick] = useState(0)
  useEffect(() => {
    if (phase.kind === 'idle') return
    const id = setInterval(() => setTick((n) => n + 1), 100)
    return () => clearInterval(id)
  }, [phase.kind])
  if (phase.kind === 'idle') return null
  const t = duel.serverNow()
  const value = (p: Player) => (p === me ? mine : theirs)
  const onTap = (e: PointerEvent<HTMLButtonElement>) => { e.preventDefault(); duel.tap() }

  let body
  if (phase.kind === 'picking') {
    body = (
      <div className="duel-card">
        <p className="duel-title">⚔️ VS {partner}</p>
        {(Object.keys(VS_GAMES) as VsGame[]).map((g) => (
          <button key={g} className="vs-game" onClick={() => duel.invite(g)} data-testid={`vs-${g}`}>
            <span className="vs-icon" aria-hidden="true">{VS_GAMES[g].icon}</span>
            <span className="vs-text"><b>{VS_GAMES[g].name}</b><small>{VS_GAMES[g].blurb}</small></span>
          </button>
        ))}
        <p className="muted small">The first win of the day is worth +5 misses.</p>
        <button className="link" onClick={duel.close}>not now</button>
      </div>
    )
  } else if (phase.kind === 'inviting') {
    body = (
      <div className="duel-card">
        <p className="duel-title">{VS_GAMES[phase.game].icon} Challenge sent</p>
        <p>Waiting for {partner} to accept {VS_GAMES[phase.game].name}… {Math.max(0, Math.ceil((phase.until - t) / 1000))}</p>
        <button className="link" onClick={duel.cancel}>never mind</button>
      </div>
    )
  } else if (phase.kind === 'invited') {
    body = (
      <div className="duel-card">
        <p className="duel-title">⚔️ {partner} challenges you!</p>
        <p><b>{VS_GAMES[phase.game].icon} {VS_GAMES[phase.game].name}.</b> {VS_GAMES[phase.game].blurb} The first win of the day is worth +5 misses.</p>
        <div className="pick">
          <button className="pill" onClick={() => void duel.accept()}>I’m in</button>
          <button className="pill ghost" onClick={duel.decline}>Not now</button>
        </div>
        <p className="muted small">{Math.max(0, Math.ceil((phase.until - t) / 1000))}s to answer</p>
      </div>
    )
  } else {
    const d = phase.duel
    const start = Date.parse(d.starts_at)
    const counting = phase.kind === 'live' && t < start
    const left = Math.max(0, start + VS_LENGTH_MS[d.game] - t)
    const result = phase.kind === 'done'
      ? d.winner === 'tie' ? 'A tie! Nobody gets the 5.'
        : `${d.winner === me ? 'You win' : `${d.winner} wins`}! ${d.points > 0 ? `+${d.points} misses` : '(today’s +5 was already claimed)'}`
      : null
    const scoreOf = (p: Player) => (p === 'Aleem' ? d.aleem_score : d.nurul_score)

    if (d.game === 'tug') {
      body = (
        <div className="duel-card wide">
          <div className="duel-scores">
            <span className="a">Aleem <b data-testid="duel-Aleem">{phase.kind === 'done' ? scoreOf('Aleem') : value('Aleem')}</b></span>
            <span className="n"><b data-testid="duel-Nurul">{phase.kind === 'done' ? scoreOf('Nurul') : value('Nurul')}</b> Nurul</span>
          </div>
          <Rope aleem={value('Aleem') / 2} nurul={value('Nurul') / 2} me={me} here={[]} pull={null} />
          {counting && <div className="countdown" data-testid="duel-countdown">{Math.ceil((start - t) / 1000)}</div>}
          {phase.kind === 'live' && !counting && (
            <>
              <p className="duel-time">{(left / 1000).toFixed(1)}s</p>
              <button className="tap-button" onPointerDown={onTap} onContextMenu={(e) => e.preventDefault()} data-testid="tap">TAP!</button>
            </>
          )}
          {phase.kind === 'reporting' && <p className="loading">counting taps…</p>}
          {result && (
            <>
              <p className="duel-result" data-testid="duel-result">{result}</p>
              <button className="pill" onClick={duel.close}>Back to the rope</button>
            </>
          )}
        </div>
      )
    } else {
      body = (
        <div className="duel-card wide race">
          <div className="race-head">
            <span className="duel-time">{counting ? 'Pour-off' : `⏱ ${clock(left)}`}</span>
            <span className="race-them" data-testid="race-them">
              {partner}: {theirsSolved ? 'solved! 🏁' : `${value(partner)} / 6`}
            </span>
          </div>
          {counting && (
            <>
              <div className="countdown" data-testid="duel-countdown">{Math.ceil((start - t) / 1000)}</div>
              <p className="muted">Same puzzle on both phones. Tap a bottle, then tap where to pour. First to sort every colour wins.</p>
            </>
          )}
          {phase.kind === 'live' && !counting && (
            <>
              {theirsSolved && (
                <p className="race-alert" data-testid="race-alert">🏁 {partner} solved it first!</p>
              )}
              <PourRace seed={d.seed} onProgress={duel.pourProgress} exposeSolution={demo} />
            </>
          )}
          {phase.kind === 'reporting' && (
            <p className="loading" data-testid="race-waiting">
              {duel.iSolved ? `Solved! Checking with ${partner}’s phone…` : theirsSolved ? `${partner} solved it first. Counting your bottles…` : 'counting bottles…'}
            </p>
          )}
          {result && (
            <>
              <p className="duel-result" data-testid="duel-result">{result}</p>
              <ul className="race-scores">
                {(['Aleem', 'Nurul'] as const).map((p) => (
                  <li key={p}><b>{p === me ? 'You' : p}</b> {describeVsScore('pour', scoreOf(p))}</li>
                ))}
              </ul>
              <button className="pill" onClick={duel.close}>Back to the rope</button>
            </>
          )}
        </div>
      )
    }
  }
  return <div className="duel" role="dialog" aria-label="VS">{body}</div>
}
