import { useEffect, useState, type PointerEvent } from 'react'
import { playOn, type Lineup } from '../game/lineup'
import { quizRound, rallyMisses, type QuizItem } from '../game/more'
import { MRT_CATS, mrtRound } from '../game/mrt'
import { CANNOT_PER_ROUND } from '../game/batch1'
import { golfStrokes, syncMisses } from '../game/batch2'
import { describeVsScore, isQuizGame, isTogether, VS_LENGTH_MS, type Player, type VsGame } from '../game/rules'
import { CATEGORIES } from '../quiz/questions'
import { VS_GAMES } from '../game/vsGames'
import type { DuelApi } from '../lib/useDuel'
import { CannotSay } from './CannotSay'
import { ChaptehRally } from './ChaptehRally'
import { ChopeMatch } from './ChopeMatch'
import { DrawGuess } from './DrawGuess'
import { GolfRound } from './GolfRound'
import { InSync } from './InSync'
import { KopiRush } from './KopiRush'
import { PourRace } from './PourRace'
import { QuizGame } from './QuizGame'
import { Rope } from './Rope'
import { SpsMatch } from './SpsMatch'

/** Each quiz round is dealt once per game (the overlay redraws every 100 ms). */
const rounds = new Map<string, QuizItem[]>()
function roundFor(game: VsGame, seed: number) {
  const key = `${game}:${seed}`
  if (!rounds.has(key)) rounds.set(key, game === 'mrt' ? mrtRound(seed) : quizRound(seed))
  return rounds.get(key)!
}

const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function DuelOverlay({ duel, demo, lineup = null }: { duel: DuelApi; demo: boolean; lineup?: Lineup | null }) {
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
        <p className="duel-title">🎮 Play with {partner}</p>
        <p className="muted small">Today’s games. A new set every day.</p>
        {([['Versus', false], ['Together', true]] as const).filter(([, together]) =>
          (Object.keys(VS_GAMES) as VsGame[]).some((g) => Boolean(VS_GAMES[g].together) === together && playOn(lineup, g))).map(([heading, together]) => (
          <div key={heading} className="vs-group">
            <p className="vs-heading">{heading}</p>
            {(Object.keys(VS_GAMES) as VsGame[]).filter((g) => Boolean(VS_GAMES[g].together) === together && playOn(lineup, g)).map((g) => (
              <button key={g} className="vs-game" onClick={() => duel.invite(g)} data-testid={`vs-${g}`}>
                <span className="vs-icon" aria-hidden="true">{VS_GAMES[g].icon}</span>
                <span className="vs-text"><b>{VS_GAMES[g].name}</b><small>{VS_GAMES[g].blurb}</small></span>
              </button>
            ))}
          </div>
        ))}
        <p className="muted small">The first versus win of the day is worth +5 misses.</p>
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
        <p className="duel-title">{VS_GAMES[phase.game].together ? `🎮 ${partner} wants to play!` : `⚔️ ${partner} challenges you!`}</p>
        <p><b>{VS_GAMES[phase.game].icon} {VS_GAMES[phase.game].name}.</b> {VS_GAMES[phase.game].blurb}{VS_GAMES[phase.game].together ? '' : ' The first win of the day is worth +5 misses.'}</p>
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
    const scoreOf = (p: Player) => (p === 'Aleem' ? d.aleem_score : d.nurul_score)
    const together = Math.min(d.aleem_score ?? 0, d.nurul_score ?? 0)
    const result = phase.kind !== 'done' ? null
      : d.game === 'chapteh'
        ? `You kept it up ${together} time${together === 1 ? '' : 's'} together!${rallyMisses(together) > 0 ? ` +${rallyMisses(together)} misses each` : ''}`
        : d.game === 'cannot' || d.game === 'draw'
          ? `You got ${together} word${together === 1 ? '' : 's'} together!${together > 0 ? ` +${Math.min(together, CANNOT_PER_ROUND)} misses each` : ''}`
          : d.game === 'sync'
            ? `You hit ${together} beat${together === 1 ? '' : 's'} together!${syncMisses(together) > 0 ? ` +${syncMisses(together)} misses each` : ''}`
          : d.winner === 'tie' ? 'A tie! Nobody gets the 5.'
          : `${d.winner === me ? 'You win' : `${d.winner} wins`}! ${d.points > 0 ? `+${d.points} misses` : '(today’s +5 was already claimed)'}`
    const resultBlock = result && (
      <>
        <p className="duel-result" data-testid="duel-result">{result}</p>
        {d.game !== 'tug' && !isTogether(d.game) && (
          <ul className="race-scores">
            {(['Aleem', 'Nurul'] as const).map((p) => (
              <li key={p}><b>{p === me ? 'You' : p}</b> {describeVsScore(d.game, scoreOf(p))}</li>
            ))}
          </ul>
        )}
        <button className="pill" onClick={duel.close}>Back to the rope</button>
      </>
    )

    if (isQuizGame(d.game) || d.game === 'chapteh') {
      const quiz = isQuizGame(d.game)
      body = (
        <div className="duel-card wide race">
          <div className="race-head">
            <span className="duel-time">{VS_GAMES[d.game].icon} {VS_GAMES[d.game].name}</span>
            {quiz && <span className="race-them" data-testid="race-them">{partner}: {value(partner)} pts</span>}
          </div>
          {counting && (
            <>
              <div className="countdown" data-testid="duel-countdown">{Math.ceil((start - t) / 1000)}</div>
              <p className="muted">{quiz
                ? 'Same 7 questions on both phones, 12 seconds each. Right and fast scores most.'
                : `Kick it back to ${partner} on the beat: tap the glowing zone as the ring closes.`}</p>
            </>
          )}
          {phase.kind === 'live' && !counting && (quiz
            ? <QuizGame
                round={roundFor(d.game, d.seed)}
                cats={d.game === 'mrt' ? MRT_CATS : CATEGORIES}
                onProgress={duel.quizProgress}
                exposeAnswers={demo}
              />
            : <ChaptehRally duel={duel} demo={demo} />)}
          {phase.kind === 'reporting' && (
            <p className="loading" data-testid="race-waiting">
              {quiz ? `You scored ${mine}. Waiting for ${partner}…` : `${duel.rally.kicks} kicks! Checking with ${partner}’s phone…`}
            </p>
          )}
          {resultBlock}
        </div>
      )
      return <div className="duel" role="dialog" aria-label="VS">{body}</div>
    }

    if (d.game === 'kopi' || d.game === 'sps' || d.game === 'cannot' || d.game === 'golf' || d.game === 'chope' || d.game === 'draw' || d.game === 'sync') {
      const theyGoFirst = duel.me === d.started_by
      const intro = {
        kopi: 'Same orders on both phones. Tap in what each customer asks for, then serve. Most drinks right in a minute wins.',
        sps: `Best of 5 against ${partner}. Your throw stays hidden until you’ve both thrown.`,
        cannot: `${theyGoFirst ? partner : 'You'} describe${theyGoFirst ? 's' : ''} first, then you swap at 45 seconds. Type clues, never the banned words.`,
        golf: 'The same 3 holes on both phones, 3 minutes. Drag back from anywhere like a catapult and let go to putt. Fewest strokes wins.',
        chope: `Take turns putting a tissue packet on a stool. Fill all 4 round a table to claim it. ${theyGoFirst ? partner : 'You'} go${theyGoFirst ? 'es' : ''} first.`,
        draw: `${theyGoFirst ? partner : 'You'} draw${theyGoFirst ? 's' : ''} first, then you swap at 45 seconds. No letters allowed!`,
        sync: 'The same rhythm on both phones. Tap as each note reaches the line.',
      }[d.game]
      body = (
        <div className="duel-card wide race">
          <div className="race-head">
            <span className="duel-time">{VS_GAMES[d.game].icon} {VS_GAMES[d.game].name}{d.game === 'kopi' && !counting && phase.kind === 'live' ? ` · ${clock(left)}` : ''}</span>
            {d.game === 'kopi' && <span className="race-them" data-testid="race-them">{partner}: {value(partner)} served</span>}
          </div>
          {counting && (
            <>
              <div className="countdown" data-testid="duel-countdown">{Math.ceil((start - t) / 1000)}</div>
              <p className="muted">{intro}</p>
            </>
          )}
          {phase.kind === 'live' && !counting && (
            d.game === 'kopi' ? <KopiRush seed={d.seed} onServe={duel.setScore} exposeAnswers={demo} />
              : d.game === 'sps' ? <SpsMatch duel={duel} game={d} />
                : d.game === 'golf' ? <GolfRound duel={duel} game={d} demo={demo} />
                  : d.game === 'chope' ? <ChopeMatch duel={duel} game={d} />
                    : d.game === 'draw' ? <DrawGuess duel={duel} game={d} demo={demo} />
                      : d.game === 'sync' ? <InSync duel={duel} game={d} demo={demo} />
                        : <CannotSay duel={duel} game={d} demo={demo} />
          )}
          {phase.kind === 'reporting' && (
            <p className="loading" data-testid="race-waiting">
              {d.game === 'kopi' ? `Shift over! You served ${mine}. Waiting for ${partner}…`
                : d.game === 'sps' ? `Checking the throws with ${partner}’s phone…`
                  : d.game === 'golf' ? `Round over: ${golfStrokes(mine)} strokes. Waiting for ${partner}…`
                    : d.game === 'chope' ? `Food court full! Checking with ${partner}’s phone…`
                      : d.game === 'sync' ? `${mine} beats together! Checking with ${partner}’s phone…`
                        : `${mine} word${mine === 1 ? '' : 's'}! Checking with ${partner}’s phone…`}
            </p>
          )}
          {resultBlock}
        </div>
      )
      return <div className="duel" role="dialog" aria-label="VS">{body}</div>
    }

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
