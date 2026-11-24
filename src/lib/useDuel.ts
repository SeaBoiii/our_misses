import { useCallback, useEffect, useRef, useState } from 'react'
import type { Backend, Signal } from './backend'
import { partnerOf, VS_LENGTH_MS, type Duel, type VsGame } from '../game/rules'
import { sfx } from './sound'

const INVITE_MS = 20_000

export type DuelPhase =
  | { kind: 'idle' }
  | { kind: 'picking' }
  | { kind: 'inviting'; game: VsGame; until: number }
  | { kind: 'invited'; game: VsGame; until: number }
  | { kind: 'live'; duel: Duel }
  | { kind: 'reporting'; duel: Duel }
  | { kind: 'done'; duel: Duel }

/**
 * VS games, start to finish: pick → invite → accept → 4 s countdown → play → report → result.
 * Tug reports taps after 15 s. Pour-off reports the moment you solve it (the database times
 * it), or the bottles you completed when the 3 minutes run out or you give up.
 */
export function useDuel({ backend, offset, toast }: { backend: Backend; offset: number; toast(text: string, tone?: 'love' | 'warn'): void }) {
  const me = backend.me
  const partner = partnerOf(me)
  const [phase, setPhase] = useState<DuelPhase>({ kind: 'idle' })
  const [mine, setMine] = useState(0)
  const [theirs, setTheirs] = useState(0)
  const [theirsSolved, setTheirsSolved] = useState(false)
  const [iSolved, setISolved] = useState(false)
  const phaseRef = useRef(phase)
  const mineRef = useRef(0)
  const solvedRef = useRef(false)
  const sentRef = useRef(-1)
  const offsetRef = useRef(offset)
  useEffect(() => { phaseRef.current = phase }, [phase])
  useEffect(() => { offsetRef.current = offset }, [offset])
  const serverNow = () => Date.now() + offsetRef.current

  const go = useCallback((p: DuelPhase) => { phaseRef.current = p; setPhase(p) }, [])
  const begin = useCallback((duel: Duel) => {
    mineRef.current = 0
    solvedRef.current = false
    sentRef.current = -1
    setMine(0)
    setTheirs(0)
    setTheirsSolved(false)
    setISolved(false)
    go({ kind: 'live', duel })
  }, [go])

  const settleWith = useCallback((duel: Duel) => {
    if (phaseRef.current.kind !== 'reporting') return
    go({ kind: 'done', duel })
    if (duel.winner === me) sfx.win()
    else if (duel.winner !== 'tie') sfx.lose()
  }, [go, me])

  const pick = () => { sfx.unlock(); go({ kind: 'picking' }) }
  const invite = (game: VsGame) => {
    sfx.unlock()
    go({ kind: 'inviting', game, until: serverNow() + INVITE_MS })
    backend.signal({ type: 'duel_invite', game })
  }
  const cancel = () => { backend.signal({ type: 'duel_cancel' }); go({ kind: 'idle' }) }
  const decline = () => { backend.signal({ type: 'duel_decline' }); go({ kind: 'idle' }) }
  const close = () => go({ kind: 'idle' })
  const accept = async () => {
    const p = phaseRef.current
    if (p.kind !== 'invited') return
    sfx.unlock()
    try {
      const duel = await backend.duelStart(p.game)
      backend.signal({ type: 'duel_start', duel })
      begin(duel)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not start', 'warn')
      go({ kind: 'idle' })
    }
  }

  const playing = () => {
    const p = phaseRef.current
    if (p.kind !== 'live') return null
    const start = Date.parse(p.duel.starts_at)
    const t = serverNow()
    return t >= start && t < start + VS_LENGTH_MS[p.duel.game] ? p.duel : null
  }
  /** Tug: one tap. */
  const tap = () => {
    if (playing()?.game !== 'tug') return
    mineRef.current++
    setMine(mineRef.current)
    sfx.tap()
  }
  /** Pour-off: the board changed. Solving reports straight away. */
  const pourProgress = (bottles: number, solved: boolean) => {
    const duel = playing()
    if (duel?.game !== 'pour') return
    mineRef.current = bottles
    setMine(bottles)
    if (solved) {
      solvedRef.current = true
      setISolved(true)
      backend.signal({ type: 'duel_progress', value: bottles, solved: true })
      sfx.win()
      go({ kind: 'reporting', duel })
    }
  }
  /** Pour-off: stop now and report the bottles completed. */
  const giveUp = () => {
    const p = phaseRef.current
    if (p.kind === 'live') go({ kind: 'reporting', duel: p.duel })
  }

  const onSignal = useCallback((s: Signal) => {
    const p = phaseRef.current
    if (s.type === 'duel_invite' && p.kind === 'idle') { sfx.receive(); go({ kind: 'invited', game: s.game, until: Date.now() + offsetRef.current + INVITE_MS }) }
    if (s.type === 'duel_decline' && p.kind === 'inviting') { toast(`${partner} said not now`, 'warn'); go({ kind: 'idle' }) }
    if (s.type === 'duel_cancel' && p.kind === 'invited') go({ kind: 'idle' })
    if (s.type === 'duel_start' && (p.kind === 'inviting' || p.kind === 'idle')) begin(s.duel)
    if (s.type === 'duel_progress' && (p.kind === 'live' || p.kind === 'reporting')) {
      setTheirs((n) => (p.duel.game === 'tug' ? Math.max(n, s.value) : s.value))
      if (s.solved) {
        setTheirsSolved(true)
        // First to sort every colour ends the race. A moment's grace covers a near-tie
        // (solving in it still reports a time; the database compares the two).
        if (p.kind === 'live' && !solvedRef.current) {
          sfx.lose()
          setTimeout(() => {
            const now = phaseRef.current
            if (now.kind === 'live' && now.duel.id === p.duel.id && !solvedRef.current) go({ kind: 'reporting', duel: now.duel })
          }, 2500)
        }
      }
    }
    if (s.type === 'duel_done' && p.kind === 'reporting' && s.id === p.duel.id) {
      backend.duelGet(s.id).then((d) => { if (d.settled) settleWith(d) }).catch(() => { /* polling covers it */ })
    }
  }, [backend, begin, go, partner, settleWith, toast])

  // Invite timeouts, sharing progress during play, and the final whistle.
  useEffect(() => {
    if (phase.kind !== 'inviting' && phase.kind !== 'invited' && phase.kind !== 'live') return
    const id = setInterval(() => {
      const p = phaseRef.current
      const t = serverNow()
      if ((p.kind === 'inviting' || p.kind === 'invited') && t > p.until) {
        if (p.kind === 'inviting') toast(`No answer from ${partner}`, 'warn')
        go({ kind: 'idle' })
      }
      if (p.kind === 'live') {
        const start = Date.parse(p.duel.starts_at)
        if (t >= start && mineRef.current !== sentRef.current) {
          sentRef.current = mineRef.current
          backend.signal({ type: 'duel_progress', value: mineRef.current })
        }
        if (t >= start + VS_LENGTH_MS[p.duel.game]) go({ kind: 'reporting', duel: p.duel })
      }
    }, 150)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase.kind])

  // Report, then wait for the database to settle the game.
  useEffect(() => {
    if (phase.kind !== 'reporting') return
    const duel = phase.duel
    let stop = false
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
    void (async () => {
      backend.signal({ type: 'duel_progress', value: mineRef.current, solved: solvedRef.current })
      let d: Duel | null = null
      for (let i = 0; i < 20 && !stop && !d; i++) {
        try {
          d = await backend.duelFinish(duel.id, mineRef.current, solvedRef.current)
        } catch (e) {
          // Phones' clocks can disagree by a moment; anything else ends the game.
          if (!(e instanceof Error && /not over/.test(e.message))) {
            toast(e instanceof Error ? e.message : 'The game failed', 'warn')
            go({ kind: 'idle' })
            return
          }
          await sleep(800)
        }
      }
      if (!d || stop) return
      backend.signal({ type: 'duel_done', id: duel.id })
      // A Pour-off can wait on the other player for up to its full 3 minutes.
      for (let i = 0; i < 200 && !stop; i++) {
        if (d.settled) { settleWith(d); return }
        await sleep(1500)
        try { d = await backend.duelGet(duel.id) } catch { /* try again */ }
      }
    })()
    return () => { stop = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase.kind])

  return {
    phase, mine, theirs, theirsSolved, iSolved, me, partner,
    pick, invite, cancel, accept, decline, close, tap, pourProgress, giveUp, onSignal, serverNow,
  }
}

export type DuelApi = ReturnType<typeof useDuel>
