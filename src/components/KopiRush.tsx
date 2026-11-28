import { useMemo, useState } from 'react'
import { blankCup, diff, GLOSSARY, ING_ICON, ING_LABEL, INGREDIENTS, kopiOrders, matches, MAX_COUNT, type Cup, type Ingredient } from '../game/kopi'
import { sfx } from '../lib/sound'

const AUNTIES = ['🧑‍🔧', '👩‍🎓', '👵', '🪖', '👨‍💼', '👴', '🤰', '🧑‍🍳']

/** Kopi Rush: build each order from its kopitiam lingo, then serve. One minute, same orders on both phones. */
export function KopiRush({ seed, onServe, exposeAnswers = false }: { seed: number; onServe(drinks: number): void; exposeAnswers?: boolean }) {
  const orders = useMemo(() => kopiOrders(seed), [seed])
  const [index, setIndex] = useState(0)
  const [cup, setCup] = useState<Cup>(blankCup)
  const [served, setServed] = useState(0)
  const [flash, setFlash] = useState<{ good: boolean; text: string; n: number } | null>(null)
  const [help, setHelp] = useState(false)
  const order = orders[index % orders.length]
  const empty = INGREDIENTS.every((k) => !cup[k])

  const add = (k: Ingredient) => {
    if (cup[k] >= MAX_COUNT[k]) { sfx.denied(); return }
    sfx.tap()
    setCup({ ...cup, [k]: cup[k] + 1 })
  }
  const serve = () => {
    if (empty) return
    if (matches(order, cup)) {
      const n = served + 1
      setServed(n)
      onServe(n)
      sfx.pop(2)
      setFlash({ good: true, text: 'Shiok! ✓', n: index })
    } else {
      sfx.oops()
      setFlash({ good: false, text: diff(order, cup)[0] ?? 'Not what I ordered leh.', n: index })
    }
    setCup(blankCup())
    setIndex(index + 1)
  }

  return (
    <div className="kopi" data-testid="kopi">
      <div className="kopi-order" data-testid="kopi-order" data-recipe={exposeAnswers ? JSON.stringify(order.recipe) : undefined}>
        <span className="kopi-who" aria-hidden="true">{AUNTIES[index % AUNTIES.length]}</span>
        <span className="kopi-bubble">“{order.text}”</span>
      </div>
      {flash && <p key={flash.n} className={`kopi-flash ${flash.good ? 'good' : 'bad'}`} data-testid="kopi-flash">{flash.text}</p>}
      <div className="kopi-cup" aria-label="In the cup">
        {empty ? <span className="muted small">The cup is empty</span> : INGREDIENTS.filter((k) => cup[k] > 0).map((k) => (
          <span key={k} className="game-chip">{ING_ICON[k]} {ING_LABEL[k]}{cup[k] > 1 ? ` ×${cup[k]}` : ''}</span>
        ))}
      </div>
      <div className="kopi-grid">
        {INGREDIENTS.map((k) => (
          <button key={k} className="kopi-ing" onClick={() => add(k)} data-testid={`kopi-${k}`}>
            <span aria-hidden="true">{ING_ICON[k]}</span>
            <small>{ING_LABEL[k]}</small>
            {cup[k] > 0 && <b className="kopi-count">{cup[k]}</b>}
          </button>
        ))}
      </div>
      <div className="pick">
        <button className="pill ghost small-pill" onClick={() => setCup(blankCup())} disabled={empty}>Bin it</button>
        <button className="pill small-pill" onClick={serve} disabled={empty} data-testid="kopi-serve">Serve ☕</button>
      </div>
      <p className="kopi-tally" data-testid="kopi-served">{served} served</p>
      <button className="link" onClick={() => setHelp(!help)}>{help ? 'hide the lingo' : 'what does it all mean?'}</button>
      {help && (
        <dl className="kopi-glossary">
          {GLOSSARY.map(([word, meaning]) => <div key={word}><dt>{word}</dt><dd>{meaning}</dd></div>)}
          <div><dt>Sugar</dt><dd>2 unless they say otherwise</dd></div>
        </dl>
      )}
    </div>
  )
}
