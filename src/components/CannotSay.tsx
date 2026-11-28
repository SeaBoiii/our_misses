import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { bannedIn, CANNOT_CLUE_MAX, CANNOT_SWAP_MS, cannotDeck, guessMatches } from '../game/batch1'
import { CANNOT_CATS } from '../content/cannot'
import { partnerOf, VS_LENGTH_MS, type Duel, type Player } from '../game/rules'
import type { DuelApi } from '../lib/useDuel'
import { sfx } from '../lib/sound'

interface Line { card: number; who: 'me' | 'them'; kind: 'clue' | 'guess'; text: string }
/** The second describer's cards start here, so the two halves never deal the same card. */
const SECOND_HALF = 100

/**
 * Cannot Say!, together: one of you describes in typed clues (never the banned words), the
 * other guesses. You swap halfway. Both phones walk the same deck and count the same words.
 */
export function CannotSay({ duel, game, demo }: { duel: DuelApi; game: Duel; demo: boolean }) {
  const { me, partner, backend } = duel
  const deck = useMemo(() => cannotDeck(game.seed), [game.seed])
  const [index, setIndex] = useState<[number, number]>([0, SECOND_HALF])
  const [got, setGot] = useState<number[]>([])
  const [lines, setLines] = useState<Line[]>([])
  const [text, setText] = useState('')
  const [warn, setWarn] = useState<string | null>(null)
  const [cheer, setCheer] = useState<{ card: number; text: string } | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const api = useRef(duel)
  api.current = duel

  const start = Date.parse(game.starts_at)
  const t = duel.serverNow()
  const half = t - start < CANNOT_SWAP_MS ? 0 : 1
  // Whoever sent the challenge describes first (the other one started the game by accepting).
  const inviter: Player = partnerOf(game.started_by)
  const describer = half === 0 ? inviter : game.started_by
  const describing = describer === me
  const cardNo = index[half]
  const card = deck[cardNo % deck.length]
  const left = Math.max(0, start + VS_LENGTH_MS.cannot - t)
  const swapIn = start + CANNOT_SWAP_MS - t
  const justSwapped = half === 1 && t - start - CANNOT_SWAP_MS < 2_500

  const advance = (n: number) => setIndex((ix) => {
    const h = n >= SECOND_HALF ? 1 : 0
    if (ix[h] > n) return ix
    const next: [number, number] = [...ix]
    next[h] = n + 1
    return next
  })
  const win = (n: number, by: 'me' | 'them') => {
    setGot((g) => (g.includes(n) ? g : [...g, n]))
    advance(n)
    setCheer({ card: n, text: `${by === 'me' ? 'You got it' : `${partner} got it`}: ${deck[n % deck.length].word} ✓` })
    sfx.pop(2)
  }

  useEffect(() => { api.current.setScore(got.length) }, [got.length])
  useEffect(() => { setText(''); setWarn(null) }, [half])
  const winRef = useRef(win)
  winRef.current = win
  const { listen } = duel
  useEffect(() => listen((s) => {
    if (s.type === 'cannot_clue' || s.type === 'cannot_guess') {
      setLines((l) => [...l.slice(-30), { card: s.card, who: 'them', kind: s.type === 'cannot_clue' ? 'clue' : 'guess', text: s.text }])
      if (s.type === 'cannot_clue') sfx.tick()
    }
    if (s.type === 'cannot_got') winRef.current(s.card, 'them')
    if (s.type === 'cannot_pass') advance(s.card)
  }), [listen])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const said = text.trim()
    if (!said) return
    if (describing) {
      const hits = bannedIn(said, card)
      if (hits.length > 0) { setWarn(`🙊 Cannot say “${hits[0]}”!`); sfx.denied(); return }
      backend.signal({ type: 'cannot_clue', card: cardNo, text: said })
      setLines((l) => [...l.slice(-30), { card: cardNo, who: 'me', kind: 'clue', text: said }])
    } else if (guessMatches(said, card)) {
      backend.signal({ type: 'cannot_got', card: cardNo })
      win(cardNo, 'me')
    } else {
      backend.signal({ type: 'cannot_guess', card: cardNo, text: said })
      setLines((l) => [...l.slice(-30), { card: cardNo, who: 'me', kind: 'guess', text: said }])
      sfx.oops()
    }
    setText('')
    setWarn(null)
    input.current?.focus()
  }
  const pass = () => {
    backend.signal({ type: 'cannot_pass', card: cardNo })
    advance(cardNo)
    sfx.tick()
  }

  const here = lines.filter((l) => l.card === cardNo)
  const clues = here.filter((l) => l.kind === 'clue')
  const guesses = here.filter((l) => l.kind === 'guess')
  return (
    <div className="cannot" data-testid="cannot" data-word={demo && !describing ? card.word : undefined}>
      <div className="race-head">
        <span className="duel-time">⏱ {Math.ceil(left / 1000)}s</span>
        <span className="cannot-words" data-testid="cannot-words">{got.length} word{got.length === 1 ? '' : 's'} together</span>
      </div>
      {justSwapped && <p className="race-alert">🔄 Swap! {describing ? 'Your turn to describe.' : `${partner} describes now.`}</p>}
      {cheer && cheer.card < cardNo && <p key={cheer.card} className="kopi-flash good">{cheer.text}</p>}

      {describing ? (
        <div className="cannot-card" style={{ borderColor: CANNOT_CATS[card.cat].color }}>
          <span className="quiz-cat" style={{ background: CANNOT_CATS[card.cat].color }}>{CANNOT_CATS[card.cat].name}</span>
          <p className="cannot-word" data-testid="cannot-word">{card.word}</p>
          <p className="cannot-banned"><b>Cannot say:</b> {card.banned.map((w) => <s key={w}>{w}</s>)}</p>
        </div>
      ) : (
        <div className="cannot-card guessing">
          <p className="tot-step">Guess what {partner} is describing</p>
          {clues.length === 0 ? <p className="muted small">Waiting for {partner}’s first clue…</p> : (
            <ul className="cannot-clues" data-testid="cannot-clues">
              {clues.map((l, i) => <li key={i}>“{l.text}”</li>)}
            </ul>
          )}
        </div>
      )}

      {describing && guesses.length > 0 && (
        <p className="muted small">{partner} guessed: {guesses.map((g) => g.text).join(', ')}</p>
      )}
      {describing && clues.length > 0 && (
        <p className="muted small">Your clues: {clues.map((g) => `“${g.text}”`).join(' ')}</p>
      )}
      {!describing && guesses.some((g) => g.who === 'me') && (
        <p className="muted small">Not it: {guesses.filter((g) => g.who === 'me').map((g) => g.text).join(', ')}</p>
      )}

      <form className="cannot-form" onSubmit={submit}>
        <input
          ref={input}
          className="field"
          value={text}
          maxLength={CANNOT_CLUE_MAX}
          onChange={(e) => { setText(e.target.value); setWarn(null) }}
          placeholder={describing ? 'Type a clue…' : 'Your guess…'}
          aria-label={describing ? 'Clue' : 'Guess'}
          autoComplete="off"
          enterKeyHint="send"
          data-testid={describing ? 'cannot-clue-input' : 'cannot-guess-input'}
        />
        <button className="pill small-pill" type="submit" data-testid="cannot-send">{describing ? 'Send' : 'Guess'}</button>
      </form>
      {warn && <p className="cannot-warn" data-testid="cannot-warn">{warn}</p>}
      {describing && <button className="link" onClick={pass} data-testid="cannot-pass">skip this one</button>}
      {half === 0 && swapIn < 10_000 && <p className="muted small">Swapping in {Math.ceil(swapIn / 1000)}s</p>}
    </div>
  )
}
