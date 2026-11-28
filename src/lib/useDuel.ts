import { useCallback, useEffect, useRef, useState } from 'react'
import type { Backend, Signal } from './backend'
import { flightMs, gradeKick, KICK_WINDOWS, randomZone, type KickGrade, type Zone } from '../game/more'
import { partnerOf, VS_LENGTH_MS, type Duel, type VsGame } from '../game/rules'
import { sfx } from './sound'

/** Chapteh: how many kicks so far, and the chapteh coming at you (if it's your turn). */
export interface Rally {
  kicks: number
  incoming: { zone: Zone; ms: number; arriveAt: number } | null
  myServe: boolean
  grade: KickGrade | null
}
const NO_RALLY: Rally = { kicks: 0, incoming: null, myServe: false, grade: null }

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
  const [rally, setRallyState] = useState<Rally>(NO_RALLY)
  const rallyRef = useRef<Rally>(NO_RALLY)
  const setRally = useCallback((r: Rally) => { rallyRef.current = r; setRallyState(r) }, [])
  /** Game screens (Scissors-Paper-Stone, Cannot Say!) listen for their own signals. */
  const listeners = useRef(new Set<(s: Signal) => void>())
  const listen = useCallback((fn: (s: Signal) => void) => {
    listeners.current.add(fn)
    return () => { listeners.current.delete(fn) }
  }, [])
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
    // Chapteh: whoever sent the challenge serves (the other one started the game by accepting).
    setRally({ ...NO_RALLY, myServe: duel.game === 'chapteh' && duel.started_by !== me })
    go({ kind: 'live', duel })
  }, [go, me, setRally])

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
  /** Kopi Rush drinks, Scissors-Paper-Stone wins, Cannot Say! words: the score so far. */
  const setScore = (value: number) => {
    if (phaseRef.current.kind !== 'live') return
    mineRef.current = value
    setMine(value)
  }
  /** Pour-off: stop now and report the bottles completed. (Also ends a finished match early.) */
  const giveUp = () => {
    const p = phaseRef.current
    if (p.kind === 'live') go({ kind: 'reporting', duel: p.duel })
  }
  /** Kiasu Quiz: points so far; reports once all 7 questions are answered. */
  const quizProgress = (score: number, done: boolean) => {
    const duel = playing()
    if (!duel || (duel.game !== 'quiz' && duel.game !== 'mrt')) return
    mineRef.current = score
    setMine(score)
    if (done) go({ kind: 'reporting', duel })
  }

  // ---- Chapteh: one rally kicked between the two phones ------------------------------
  const dropRally = (kicks: number, tell: boolean) => {
    const p = phaseRef.current
    if (p.kind !== 'live' || p.duel.game !== 'chapteh') return
    mineRef.current = kicks
    setMine(kicks)
    setRally({ ...rallyRef.current, kicks, incoming: null, grade: 'miss' })
    if (tell) { backend.signal({ type: 'chapteh_drop', kicks }); sfx.lose() }
    go({ kind: 'reporting', duel: p.duel })
  }
  /** Serve the first kick (whoever sent the challenge). */
  const serve = () => {
    const r = rallyRef.current
    if (playing()?.game !== 'chapteh' || !r.myServe || r.kicks > 0) return
    backend.signal({ type: 'chapteh_kick', kicks: 1, zone: randomZone(), ms: flightMs(1) })
    setRally({ kicks: 1, incoming: null, myServe: false, grade: null })
    sfx.pop(1)
  }
  /** Kick the incoming chapteh with a zone (left foot, knee, right foot). */
  const kick = (zone: Zone) => {
    const r = rallyRef.current
    if (playing()?.game !== 'chapteh' || !r.incoming) return
    const grade = gradeKick(performance.now() - r.incoming.arriveAt)
    if (zone !== r.incoming.zone || grade === 'miss') { dropRally(r.kicks, true); return }
    const kicks = r.kicks + 1
    backend.signal({ type: 'chapteh_kick', kicks, zone: randomZone(), ms: flightMs(kicks) })
    setRally({ kicks, incoming: null, myServe: false, grade })
    sfx.pop(grade === 'perfect' ? 3 : 1)
  }

  const onSignal = useCallback((s: Signal) => {
    listeners.current.forEach((fn) => fn(s))
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
    if (s.type === 'chapteh_kick' && p.kind === 'live' && p.duel.game === 'chapteh') {
      setRally({ kicks: s.kicks, incoming: { zone: s.zone, ms: s.ms, arriveAt: performance.now() + s.ms }, myServe: false, grade: null })
    }
    if (s.type === 'chapteh_drop' && p.kind === 'live' && p.duel.game === 'chapteh') dropRally(s.kicks, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        // Chapteh: let it fall past your feet and the rally is over.
        const r = rallyRef.current
        if (p.duel.game === 'chapteh' && r.incoming && performance.now() > r.incoming.arriveAt + KICK_WINDOWS.ok + 80) {
          dropRally(r.kicks, true)
          return
        }
        if (p.duel.game !== 'chapteh' && t >= start && mineRef.current !== sentRef.current) {
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
    phase, mine, theirs, theirsSolved, iSolved, rally, me, partner, quizProgress, serve, kick,
    pick, invite, cancel, accept, decline, close, tap, pourProgress, giveUp, onSignal, serverNow,
    setScore, listen, backend,
  }
}

export type DuelApi = ReturnType<typeof useDuel>
