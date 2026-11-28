import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { DRAW_SECOND_HALF, DRAW_SWAP_MS, drawDeck, drawGuessMatches, type Stroke } from '../game/batch2'
import { partnerOf, VS_LENGTH_MS, type Duel, type Player } from '../game/rules'
import type { DuelApi } from '../lib/useDuel'
import { sfx } from '../lib/sound'
import { DrawPad, StrokeView } from './Sketch'

const SEND_EVERY_MS = 110

/**
 * Draw & Guess, together: one of you draws the word (the strokes stream to the other phone as
 * you draw), the other guesses. You swap halfway. Both phones walk the same deck.
 */
export function DrawGuess({ duel, game, demo }: { duel: DuelApi; game: Duel; demo: boolean }) {
  const { me, partner, backend } = duel
  const deck = useMemo(() => drawDeck(game.seed), [game.seed])
  const [index, setIndex] = useState<[number, number]>([0, DRAW_SECOND_HALF])
  const [got, setGot] = useState<number[]>([])
  const [mine, setMine] = useState<Record<number, Stroke[]>>({})
  const [ink, setInk] = useState<Record<number, Record<number, Stroke>>>({})
  const [guesses, setGuesses] = useState<{ card: number; who: 'me' | 'them'; text: string }[]>([])
  const [text, setText] = useState('')
  const [cheer, setCheer] = useState<{ card: number; text: string } | null>(null)
  const sent = useRef({ id: 0, n: 0, at: 0 })
  const raw = useRef<Stroke | null>(null)
  const api = useRef(duel)
  api.current = duel

  const start = Date.parse(game.starts_at)
  const t = duel.serverNow()
  const half = t - start < DRAW_SWAP_MS ? 0 : 1
  // Whoever sent the challenge draws first (the other one started the game by accepting).
  const inviter: Player = partnerOf(game.started_by)
  const drawing = (half === 0 ? inviter : game.started_by) === me
  const cardNo = index[half]
  const word = deck[cardNo % deck.length]
  const left = Math.max(0, start + VS_LENGTH_MS.draw - t)
  const justSwapped = half === 1 && t - start - DRAW_SWAP_MS < 2_500

  const advance = (n: number) => setIndex((ix) => {
    const h = n >= DRAW_SECOND_HALF ? 1 : 0
    if (ix[h] > n) return ix
    const next: [number, number] = [...ix]
    next[h] = n + 1
    return next
  })
  const win = (n: number, by: 'me' | 'them') => {
    setGot((g) => (g.includes(n) ? g : [...g, n]))
    advance(n)
    setCheer({ card: n, text: `${by === 'me' ? 'You got it' : `${partner} got it`}: ${deck[n % deck.length]} ✓` })
    sfx.pop(2)
  }
  const winRef = useRef(win)
  winRef.current = win

  useEffect(() => { api.current.setScore(got.length) }, [got.length])
  useEffect(() => { setText('') }, [half])
  const { listen } = duel
  useEffect(() => listen((s) => {
    if (s.type === 'draw_ink') {
      setInk((all) => {
        const card = { ...(all[s.card] ?? {}) }
        const prev = card[s.id]
        card[s.id] = { c: s.c, w: s.w, p: [...(prev?.p ?? []), ...s.p] }
        return { ...all, [s.card]: card }
      })
    }
    if (s.type === 'draw_clear') setInk((all) => ({ ...all, [s.card]: {} }))
    if (s.type === 'draw_guess') setGuesses((g) => [...g.slice(-30), { card: s.card, who: 'them', text: s.text }])
    if (s.type === 'draw_got') winRef.current(s.card, 'them')
    if (s.type === 'draw_pass') advance(s.card)
  }), [listen])

  // Drawing: stream the new points every ~110 ms, and the rest when the finger lifts.
  const onInk = (s: Stroke, id: number) => {
    raw.current = s
    if (sent.current.id !== id) sent.current = { id, n: 0, at: 0 }
    const now = performance.now()
    if (now - sent.current.at < SEND_EVERY_MS) return
    backend.signal({ type: 'draw_ink', card: cardNo, id, c: s.c, w: s.w, p: s.p.slice(sent.current.n) })
    sent.current = { id, n: s.p.length, at: now }
  }
  const onStroke = (s: Stroke) => {
    const last = raw.current
    if (last) backend.signal({ type: 'draw_ink', card: cardNo, id: sent.current.id, c: last.c, w: last.w, p: last.p.slice(sent.current.n), end: true })
    raw.current = null
    setMine((m) => ({ ...m, [cardNo]: [...(m[cardNo] ?? []), s] }))
  }
  const clear = () => {
    backend.signal({ type: 'draw_clear', card: cardNo })
    setMine((m) => ({ ...m, [cardNo]: [] }))
  }
  const pass = () => {
    backend.signal({ type: 'draw_pass', card: cardNo })
    advance(cardNo)
    sfx.tick()
  }
  const guess = (e: FormEvent) => {
    e.preventDefault()
    const said = text.trim()
    if (!said) return
    if (drawGuessMatches(said, word)) {
      backend.signal({ type: 'draw_got', card: cardNo })
      win(cardNo, 'me')
    } else {
      backend.signal({ type: 'draw_guess', card: cardNo, text: said })
      setGuesses((g) => [...g.slice(-30), { card: cardNo, who: 'me', text: said }])
      sfx.oops()
    }
    setText('')
  }

  const here = guesses.filter((g) => g.card === cardNo)
  const theirInk = Object.entries(ink[cardNo] ?? {}).sort(([a], [b]) => Number(a) - Number(b)).map(([, s]) => s)
  return (
    <div className="cannot draw-guess" data-testid="draw" data-word={demo && !drawing ? word : undefined}>
      <div className="race-head">
        <span className="duel-time">⏱ {Math.ceil(left / 1000)}s</span>
        <span className="cannot-words" data-testid="draw-words">{got.length} word{got.length === 1 ? '' : 's'} together</span>
      </div>
      {justSwapped && <p className="race-alert">🔄 Swap! {drawing ? 'Your turn to draw.' : `${partner} draws now.`}</p>}
      {cheer && cheer.card < cardNo && <p key={cheer.card} className="kopi-flash good">{cheer.text}</p>}

      {drawing ? (
        <>
          <p className="draw-word">Draw: <b data-testid="draw-word">{word}</b> <span className="muted small">(no letters!)</span></p>
          <DrawPad key={cardNo} strokes={mine[cardNo] ?? []} onStroke={onStroke} onInk={onInk} onClear={clear} />
          {here.length > 0 && <p className="muted small">{partner} guessed: {here.map((g) => g.text).join(', ')}</p>}
          <button className="link" onClick={pass} data-testid="draw-pass">skip this one</button>
        </>
      ) : (
        <>
          <p className="tot-step">What is {partner} drawing?</p>
          <StrokeView strokes={theirInk} label={`${partner}’s drawing`} />
          {here.some((g) => g.who === 'me') && <p className="muted small">Not it: {here.filter((g) => g.who === 'me').map((g) => g.text).join(', ')}</p>}
          <form className="cannot-form" onSubmit={guess}>
            <input className="field" value={text} maxLength={40} onChange={(e) => setText(e.target.value)} placeholder="Your guess…" aria-label="Guess" autoComplete="off" enterKeyHint="send" data-testid="draw-guess-input" />
            <button className="pill small-pill" type="submit" data-testid="draw-send">Guess</button>
          </form>
        </>
      )}
    </div>
  )
}
