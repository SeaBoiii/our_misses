import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as C from '../chope/engine.js'
import { CHOPE_TURN_MS, chopeMover, chopeReplay, chopeValue, type ChopeMoveRow } from '../game/batch2'
import { partnerOf, type Duel, type Player } from '../game/rules'
import type { DuelApi } from '../lib/useDuel'
import { sfx } from '../lib/sound'

const CELL = 100
const PAD = 34
const TABLE_ICON = { normal: '', fan: '🌀', famous: '⭐' } as const

/** Chope Wars, turn by turn: tap an empty stool to chope it. Fill all 4 round a table to claim it. */
export function ChopeMatch({ duel, game }: { duel: DuelApi; game: Duel }) {
  const { me, partner, backend } = duel
  const [moves, setMoves] = useState<ChopeMoveRow[]>([])
  const [auntie, setAuntie] = useState(false)
  const [busy, setBusy] = useState(false)
  const [turnAt, setTurnAt] = useState(() => Date.now())
  const [now, setNow] = useState(() => Date.now())
  const api = useRef(duel)
  api.current = duel

  const { s, seatOf } = useMemo(() => chopeReplay(game.seed, moves, game.started_by), [game.seed, game.started_by, moves])
  const geo = C.geo(s)
  const mySeat = seatOf(me)
  const myTurn = s.phase === 'play' && chopeMover(moves.length + 1, game.started_by) === me
  const playerOfSeat = (seat: number): Player => (seat === mySeat ? me : partner)
  const colorOf = (seat: number | null) => (seat === null ? undefined : playerOfSeat(seat) === 'Aleem' ? 'var(--aleem)' : 'var(--nurul)')
  const turnLeft = Math.max(0, turnAt + CHOPE_TURN_MS - now)

  const show = useCallback((next: ChopeMoveRow[]) => {
    setMoves((prev) => (next.length > prev.length ? next : prev))
  }, [])
  // Each move starts the next player's turn clock.
  useEffect(() => { setTurnAt(Date.now()) }, [moves.length])
  const refresh = useCallback(() => {
    backend.chopeGet(game.id).then(show).catch(() => { /* the next nudge or poll retries */ })
  }, [backend, game.id, show])

  useEffect(() => { refresh() }, [refresh])
  const { listen } = duel
  useEffect(() => listen((sig) => { if (sig.type === 'chope_moved') { sfx.tick(); refresh() } }), [listen, refresh])
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [])
  // While it's their turn, check in now and then in case a nudge went missing.
  useEffect(() => {
    if (myTurn || s.phase !== 'play') return
    const id = setInterval(refresh, 2_000)
    return () => clearInterval(id)
  }, [myTurn, s.phase, refresh])
  // Keep the score current (a timeout reports it), and finish when the last stool is choped.
  useEffect(() => {
    api.current.setScore(chopeValue(s, mySeat))
    if (s.phase === 'over') {
      const id = setTimeout(() => api.current.giveUp(), 2_000)
      return () => clearTimeout(id)
    }
  }, [s, mySeat])

  const play = useCallback(async (kind: 'place' | 'swap', stool: number) => {
    if (busy) return
    setBusy(true)
    const n = moves.length + 1
    try {
      const next = await backend.chopeMove(game.id, n, kind, stool)
      backend.signal({ type: 'chope_moved', n })
      setAuntie(false)
      sfx.pop(kind === 'swap' ? 2 : 1)
      show(next)
    } catch {
      refresh() // out of step with the database: catch up
    } finally {
      setBusy(false)
    }
  }, [backend, busy, game.id, moves.length, refresh, show])

  // Out of time on your turn: the engine picks a move for you.
  useEffect(() => {
    if (!myTurn || busy || turnLeft > 0) return
    const m = C.cpuMove(s, 'easy')
    if (m) void play(m.type, m.stool)
  }, [myTurn, busy, turnLeft, s, play])

  const tap = (stool: number) => {
    if (!myTurn || busy) return
    if (auntie) { if (C.canSwap(s, stool)) void play('swap', stool); else sfx.denied(); return }
    if (C.canPlace(s, stool)) void play('place', stool)
  }

  const at = (st: C.Stool) => (st.kind === 'h'
    ? [PAD + (st.c + 0.5) * CELL, PAD + st.r * CELL]
    : [PAD + st.c * CELL, PAD + (st.r + 0.5) * CELL])
  const size = PAD * 2 + s.n * CELL
  const [mine, theirs] = [s.players[mySeat], s.players[1 - mySeat]]
  const outcome = s.phase === 'over' ? (s.winner === -1 ? 'A draw!' : s.winner === mySeat ? 'You win the food court!' : `${partner} wins the food court!`) : null
  return (
    <div className="chope" data-testid="chope">
      <div className="duel-scores">
        <span className={me === 'Aleem' ? 'a' : 'n'}>You <b data-testid="chope-mine">{mine.score}</b></span>
        <span className="muted small">{mine.tables} vs {theirs.tables} tables</span>
        <span className={partner === 'Aleem' ? 'a' : 'n'}><b>{theirs.score}</b> {partner}</span>
      </div>
      <p className="chope-turn" data-testid="chope-turn">
        {outcome ?? (myTurn
          ? <>Your turn{auntie ? ': tap one of their packets to swap it' : ''} · <span className={turnLeft < 6_000 ? 'hurry' : ''}>{Math.ceil(turnLeft / 1000)}s</span></>
          : `${partner}’s turn…`)}
      </p>
      <svg viewBox={`0 0 ${size} ${size}`} className="chope-board" role="img" aria-label="The food court">
        {geo.tables.map((t) => {
          const tt = s.tables[t.id]
          const [x, y] = [PAD + t.c * CELL + 16, PAD + t.r * CELL + 16]
          return (
            <g key={t.id}>
              <rect x={x} y={y} width={CELL - 32} height={CELL - 32} rx="14" className={`chope-table ${tt.type}`} style={tt.owner !== null ? { fill: colorOf(tt.owner) } : undefined} />
              <text x={x + (CELL - 32) / 2} y={y + (CELL - 32) / 2 + 6} textAnchor="middle" className="chope-label">
                {tt.owner !== null ? `+${tt.value}` : TABLE_ICON[tt.type] || ''}
              </text>
            </g>
          )
        })}
        {geo.stools.map((st) => {
          const [x, y] = at(st)
          const owner = s.stools[st.id]
          const can = myTurn && !busy && (auntie ? C.canSwap(s, st.id) : C.canPlace(s, st.id))
          const last = s.last?.stool === st.id
          return (
            <g key={st.id} onClick={() => tap(st.id)} className={`chope-stool ${can ? 'can' : ''}`} data-testid={`stool-${st.id}`} data-free={owner === null ? 'yes' : 'no'}>
              <circle cx={x} cy={y} r="22" className="chope-hit" />
              <circle cx={x} cy={y} r="15" className={`chope-seat ${last ? 'last' : ''}`} style={owner !== null ? { fill: colorOf(owner) } : undefined} />
              {owner !== null && <text x={x} y={y + 5} textAnchor="middle" className="chope-pack">🧻</text>}
            </g>
          )
        })}
      </svg>
      <div className="chope-tools">
        {mine.auntie > 0 && s.phase === 'play' && (
          <button className={`pill small-pill ${auntie ? '' : 'ghost'}`} disabled={!myTurn} onClick={() => setAuntie(!auntie)} data-testid="chope-auntie">
            🧹 {auntie ? 'Never mind' : 'Call the cleaner auntie (once)'}
          </button>
        )}
        <p className="muted small">🌀 under the fan = 2 pts · ⭐ beside the famous stall = 3 · a 2–2 tie goes to whoever choped last. {partnerOf(game.started_by) === me ? 'You' : partner} went first.</p>
      </div>
    </div>
  )
}
