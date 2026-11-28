import { useRef, useState, type PointerEvent } from 'react'
import { INKS, simplify, WIDTHS, type Stroke } from '../game/batch2'

const path = (p: number[]) => {
  if (p.length < 2) return ''
  let d = `M${p[0]} ${p[1]}`
  for (let i = 2; i < p.length; i += 2) d += `L${p[i]} ${p[i + 1]}`
  return p.length === 2 ? `${d}l0.1 0` : d // a dot still shows
}

/** Strokes drawn in a 1000 × 1000 square. */
export function StrokeView({ strokes, label, className = '' }: { strokes: readonly Stroke[]; label?: string; className?: string }) {
  return (
    <svg className={`sketch ${className}`} viewBox="0 0 1000 1000" role="img" aria-label={label ?? 'A doodle'}>
      <rect width="1000" height="1000" className="sketch-paper" />
      {strokes.map((s, i) => (
        <path key={i} d={path(s.p)} stroke={INKS[s.c] ?? INKS[0]} strokeWidth={WIDTHS[s.w] ?? WIDTHS[2]} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  )
}

/**
 * A drawing pad. Finished strokes go to `onStroke`; while a finger is down, `onInk` gets the
 * stroke so far (Draw & Guess streams it to the other phone).
 */
export function DrawPad({ strokes, onStroke, onInk, onUndo, onClear, disabled = false }: {
  strokes: readonly Stroke[]
  onStroke(s: Stroke): void
  onInk?(s: Stroke, id: number): void
  onUndo?(): void
  onClear?(): void
  disabled?: boolean
}) {
  const svg = useRef<SVGSVGElement>(null)
  const [c, setC] = useState(0)
  const [w, setW] = useState(2)
  const [live, setLive] = useState<Stroke | null>(null)
  const liveRef = useRef<Stroke | null>(null)
  const serial = useRef(0)

  const at = (e: PointerEvent<SVGSVGElement>) => {
    const box = svg.current!.getBoundingClientRect()
    const x = Math.round(Math.min(1000, Math.max(0, ((e.clientX - box.left) / box.width) * 1000)))
    const y = Math.round(Math.min(1000, Math.max(0, ((e.clientY - box.top) / box.height) * 1000)))
    return [x, y] as const
  }
  const down = (e: PointerEvent<SVGSVGElement>) => {
    if (disabled) return
    e.currentTarget.setPointerCapture(e.pointerId)
    serial.current++
    const s = { c, w, p: [...at(e)] }
    liveRef.current = s
    setLive(s)
    onInk?.(s, serial.current)
  }
  const move = (e: PointerEvent<SVGSVGElement>) => {
    const s = liveRef.current
    if (!s) return
    const [x, y] = at(e)
    if (Math.hypot(x - s.p[s.p.length - 2], y - s.p[s.p.length - 1]) < 4) return
    const next = { ...s, p: [...s.p, x, y] }
    liveRef.current = next
    setLive(next)
    onInk?.(next, serial.current)
  }
  const up = () => {
    const s = liveRef.current
    if (!s) return
    liveRef.current = null
    setLive(null)
    onStroke({ ...s, p: simplify(s.p) })
  }

  return (
    <div className="drawpad">
      <svg
        ref={svg}
        className={`sketch draw ${disabled ? 'off' : ''}`}
        viewBox="0 0 1000 1000"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        data-testid="drawpad"
        role="img"
        aria-label="Drawing pad"
      >
        <rect width="1000" height="1000" className="sketch-paper" />
        {[...strokes, ...(live ? [live] : [])].map((s, i) => (
          <path key={i} d={path(s.p)} stroke={INKS[s.c]} strokeWidth={WIDTHS[s.w]} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        ))}
      </svg>
      <div className="drawpad-tools">
        {INKS.map((ink, i) => (
          <button key={ink} className={`ink ${c === i ? 'on' : ''}`} style={{ background: ink }} onClick={() => setC(i)} aria-label={i === 5 ? 'Eraser (white)' : `Colour ${i + 1}`} />
        ))}
        <button className="ink-size" onClick={() => setW(w === 3 ? 1 : w + 1)} aria-label="Brush size">
          <i style={{ width: 4 + w * 4, height: 4 + w * 4 }} />
        </button>
        {onUndo && <button className="link" onClick={onUndo} disabled={disabled || strokes.length === 0}>undo</button>}
        {onClear && <button className="link" onClick={onClear} disabled={disabled || strokes.length === 0}>clear</button>}
      </div>
    </div>
  )
}
