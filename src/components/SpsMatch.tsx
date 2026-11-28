import { useCallback, useEffect, useRef, useState } from 'react'
import { SPS_FIRST_TO, SPS_ICON, SPS_THROWS } from '../game/batch1'
import type { Duel, SpsState, SpsThrow } from '../game/rules'
import type { DuelApi } from '../lib/useDuel'
import { sfx } from '../lib/sound'

const START: SpsState = { rounds: [], waiting: false, next: 1, mine: 0, theirs: 0, over: false }
const NAME: Record<SpsThrow, string> = { scissors: 'Scissors', paper: 'Paper', stone: 'Stone' }

/** Scissors-Paper-Stone, best of 5. The database holds every throw until you've both thrown. */
export function SpsMatch({ duel, game }: { duel: DuelApi; game: Duel }) {
  const { backend, partner } = duel
  const [state, setState] = useState<SpsState>(START)
  const [busy, setBusy] = useState(false)
  const [theyThrew, setTheyThrew] = useState(0)
  const seen = useRef(0)
  const finished = useRef(false)
  // The duel API is rebuilt every render; read it through a ref so callbacks stay put.
  const api = useRef(duel)
  api.current = duel

  const show = useCallback((s: SpsState) => {
    setState((prev) => (s.rounds.length < prev.rounds.length ? prev : s))
    api.current.setScore(s.mine)
    if (s.rounds.length > seen.current) {
      seen.current = s.rounds.length
      const last = s.rounds[s.rounds.length - 1]
      if (last.winner === 'me') sfx.pop(2)
      else if (last.winner === 'them') sfx.oops()
      else sfx.tick()
    }
    if (s.over && !finished.current) {
      finished.current = true
      setTimeout(() => api.current.giveUp(), 1_400) // let the last reveal land
    }
  }, [])

  const refresh = useCallback(() => {
    backend.spsGet(game.id).then(show).catch(() => { /* the next nudge or poll retries */ })
  }, [backend, game.id, show])

  const { listen } = duel
  useEffect(() => listen((s) => {
    if (s.type !== 'sps_thrown') return
    setTheyThrew(s.round)
    refresh()
  }), [listen, refresh])
  // A missed nudge shouldn't stall the match.
  useEffect(() => {
    if (!state.waiting) return
    const id = setInterval(refresh, 2_000)
    return () => clearInterval(id)
  }, [state.waiting, refresh])

  const play = async (hand: SpsThrow) => {
    if (busy || state.waiting || state.over) return
    setBusy(true)
    sfx.tap()
    try {
      const s = await backend.spsThrow(game.id, state.next, hand)
      backend.signal({ type: 'sps_thrown', round: state.next })
      show(s)
    } catch {
      refresh() // out of step with the database: catch up
    } finally {
      setBusy(false)
    }
  }

  const last = state.rounds[state.rounds.length - 1]
  return (
    <div className="sps" data-testid="sps">
      <div className="duel-scores">
        <span className="a">You <b data-testid="sps-mine">{state.mine}</b></span>
        <span className="muted small">first to {SPS_FIRST_TO}</span>
        <span className="n"><b data-testid="sps-theirs">{state.theirs}</b> {partner}</span>
      </div>
      {last ? (
        <div key={last.round} className={`sps-reveal ${last.winner}`} data-testid="sps-last">
          <span className="sps-hand">{SPS_ICON[last.mine]}</span>
          <span className="sps-vs">vs</span>
          <span className="sps-hand">{SPS_ICON[last.theirs]}</span>
          <p>{last.winner === 'tie' ? 'Same! Go again.' : last.winner === 'me' ? `${NAME[last.mine]} wins! 🎉` : `${partner}’s ${NAME[last.theirs].toLowerCase()} wins`}</p>
        </div>
      ) : <p className="sps-reveal muted">Pick one. {partner} won’t see it until you’ve both thrown.</p>}
      {state.over ? <p className="loading">Match over!</p> : state.waiting ? (
        <p className="loading" data-testid="sps-waiting">Locked in. Waiting for {partner}’s throw…</p>
      ) : (
        <>
          <p className="sps-round">Round {state.next}{theyThrew >= state.next ? ` · ${partner} has thrown!` : ''}</p>
          <div className="sps-throws">
            {SPS_THROWS.map((hand) => (
              <button key={hand} className="sps-throw" onClick={() => void play(hand)} disabled={busy} data-testid={`sps-${hand}`}>
                <span aria-hidden="true">{SPS_ICON[hand]}</span>
                <small>{NAME[hand]}</small>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
