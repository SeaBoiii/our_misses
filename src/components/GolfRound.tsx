import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { ballSVG, cupSVG, holeSVG, moverSVG, S, trainSVG } from '../golf/art.js'
import * as G from '../golf/engine.js'
import { GOLF_HOLES, golfCourse, golfScore } from '../game/batch2'
import type { Duel } from '../game/rules'
import type { DuelApi } from '../lib/useDuel'
import { sfx } from '../lib/sound'

/** World units of pull-back for a full-power putt (from Marina Mini Golf). */
const DRAG_FULL = 24

/** Marina Mini Golf: the same 3 holes on both phones. Drag back from anywhere like a catapult, let go to putt. */
export function GolfRound({ duel, game, demo = false }: { duel: DuelApi; game: Duel; demo?: boolean }) {
  const course = useMemo(() => golfCourse(game.seed), [game.seed])
  const sRef = useRef<G.GolfState | null>(null)
  sRef.current ??= G.newGame({ course, holes: GOLF_HOLES })
  const [holeIdx, setHoleIdx] = useState(0)
  const [strokes, setStrokes] = useState(0)
  const [perHole, setPerHole] = useState<(number | null)[]>(() => course.map(() => null))
  const [banner, setBanner] = useState<{ name: string; line: string } | null>(null)
  const [theirs, setTheirs] = useState<{ hole: number; strokes: number; done: boolean } | null>(null)
  const svg = useRef<SVGSVGElement>(null)
  const ballG = useRef<SVGGElement>(null)
  const moversG = useRef<SVGGElement>(null)
  const sliderG = useRef<SVGGElement>(null)
  const aimG = useRef<SVGGElement>(null)
  const aimLine = useRef<SVGLineElement>(null)
  const aim = useRef({ angle: 0, power: 0, on: false })
  const drag = useRef<{ x: number; y: number } | null>(null)
  const api = useRef(duel)
  api.current = duel
  const perHoleRef = useRef(perHole)
  perHoleRef.current = perHole

  const h = course[holeIdx]
  const art = useMemo(() => holeSVG(h, `g${holeIdx}-`), [h, holeIdx])
  const slider = h.movers.find((m) => m.type === 'slider')

  const { listen } = duel
  useEffect(() => listen((s) => { if (s.type === 'golf') setTheirs(s) }), [listen])

  // Score as if time ran out now, so a timeout still reports something fair.
  useEffect(() => { api.current.setScore(golfScore(course.map(() => null), course)) }, [course])

  // The physics loop: fixed steps in the engine, drawn straight onto the SVG.
  useEffect(() => {
    const s = sRef.current!
    G.beginTurn(s)
    let last = performance.now()
    let raf = 0
    let finishing = false
    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const hole = G.holeOf(s)
      for (const e of G.tick(s, dt)) {
        if (e.type === 'water') { sfx.oops(); setStrokes(s.strokes) }
        else if (e.type === 'sink') sfx.win()
        else if (e.type === 'hit' || e.type === 'bump') sfx.tap()
      }
      // Draw: ball, movers, aim.
      const holed = s.phase === 'holed'
      ballG.current?.setAttribute('transform', `translate(${s.ball.x * S} ${s.ball.y * S}) scale(${holed ? 0.01 : 1})`)
      const shapes = G.moverShapes(hole, s.t)
      const bars = shapes.filter((m) => m.type === 'bar')
      if (moversG.current) {
        if (bars.length) moversG.current.innerHTML = bars.map(moverSVG).join('')
        else if (moversG.current.firstChild) moversG.current.innerHTML = '' // a hole without spokes
      }
      const sl = shapes.find((m) => m.type === 'slider')
      if (sl && sliderG.current) sliderG.current.setAttribute('transform', `translate(0 ${(sl.y0 ?? 0) * S})`)
      const a = aim.current
      if (aimG.current && aimLine.current) {
        const show = a.on && s.phase === 'aim'
        aimG.current.setAttribute('opacity', show ? '1' : '0')
        if (show) {
          const [x, y] = [s.ball.x * S, s.ball.y * S]
          const len = 40 + a.power * 230
          aimLine.current.setAttribute('x1', String(x))
          aimLine.current.setAttribute('y1', String(y))
          aimLine.current.setAttribute('x2', String(x + Math.cos(a.angle) * len))
          aimLine.current.setAttribute('y2', String(y + Math.sin(a.angle) * len))
          aimLine.current.setAttribute('stroke', a.power < 0.45 ? '#B6F2A0' : a.power < 0.75 ? '#FFD877' : '#FF8A8A')
        }
      }
      // A hole is done: score it, tell the other phone, then tee up the next.
      if ((s.phase === 'holed' || s.phase === 'capped') && !finishing) {
        finishing = true
        const idx = s.holeIdx
        const taken = s.phase === 'holed' ? s.strokes : G.capOf(hole)
        const next = perHoleRef.current.map((v, i) => (i === idx ? taken : v))
        perHoleRef.current = next
        setPerHole(next)
        api.current.setScore(golfScore(next, course))
        const last = idx === course.length - 1
        api.current.backend.signal({ type: 'golf', hole: idx + 1, strokes: taken, done: last })
        setBanner(G.scoreName(taken, hole.par, s.phase === 'capped'))
        setTimeout(() => {
          setBanner(null)
          if (G.endTurn(s) === 'over') { api.current.giveUp(); return }
          G.beginTurn(s)
          setHoleIdx(s.holeIdx)
          setStrokes(0)
          finishing = false
        }, 1_500)
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    // Tests and the demo can putt straight at the cup (the demo shows its answers anyway).
    if (demo) {
      (window as unknown as { __missuGolf?: unknown }).__missuGolf = {
        phase: () => s.phase,
        puttAtCup: (angleOffset = 0) => {
          const hole = G.holeOf(s)
          const [dx, dy] = [hole.cup[0] - s.ball.x, hole.cup[1] - s.ball.y]
          if (G.shoot(s, Math.atan2(dy, dx) + angleOffset, Math.min(1, (Math.sqrt(34 * Math.hypot(dx, dy)) * 1.12) / G.VMAX))) setStrokes(s.strokes)
        },
      }
    }
    return () => cancelAnimationFrame(raf)
  }, [course, demo])

  const world = (e: PointerEvent<SVGSVGElement>) => {
    const m = svg.current?.getScreenCTM()
    if (!m) return null
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse())
    return { x: p.x / S, y: p.y / S }
  }
  const down = (e: PointerEvent<SVGSVGElement>) => {
    if (sRef.current?.phase !== 'aim') return
    const p = world(e)
    if (!p) return
    e.currentTarget.setPointerCapture(e.pointerId)
    sfx.unlock()
    drag.current = p
  }
  const move = (e: PointerEvent<SVGSVGElement>) => {
    const start = drag.current
    const p = start && world(e)
    if (!start || !p) return
    const [vx, vy] = [start.x - p.x, start.y - p.y]
    const d = Math.hypot(vx, vy)
    if (d < 1.2) return
    aim.current = { angle: Math.atan2(vy, vx), power: Math.min(1, d / DRAG_FULL), on: true }
  }
  const up = () => {
    const s = sRef.current!
    const a = aim.current
    drag.current = null
    aim.current = { ...a, on: false }
    if (!a.on || a.power < 0.05) return
    if (G.shoot(s, a.angle, a.power)) {
      sfx.pop(1)
      setStrokes(s.strokes)
      duel.backend.signal({ type: 'golf', hole: s.holeIdx + 1, strokes: s.strokes, done: false })
    }
  }

  const total = perHole.reduce<number>((sum, v) => sum + (v ?? 0), 0)
  return (
    <div className="golf" data-testid="golf">
      <div className="golf-head">
        <span><b>Hole {holeIdx + 1}/{course.length}</b> · {h.name} · par {h.par}</span>
        <span data-testid="golf-strokes">{strokes} stroke{strokes === 1 ? '' : 's'} · total {total + strokes}</span>
      </div>
      <div className="golf-stage">
        <svg
          ref={svg}
          viewBox={`0 0 ${G.W * S} ${G.H * S}`}
          className="golf-board"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={() => { drag.current = null; aim.current = { ...aim.current, on: false } }}
          role="img"
          aria-label={`${h.name}, par ${h.par}`}
        >
          <g dangerouslySetInnerHTML={{ __html: art.under }} />
          <g ref={moversG} />
          {slider && <g ref={sliderG} dangerouslySetInnerHTML={{ __html: trainSVG(slider) }} />}
          <g dangerouslySetInnerHTML={{ __html: cupSVG(h, `g${holeIdx}-`) }} />
          <g ref={aimG} opacity="0">
            <line ref={aimLine} stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeDasharray="2 14" />
          </g>
          <g ref={ballG} dangerouslySetInnerHTML={{ __html: ballSVG(duel.me === 'Aleem' ? '#2f7de1' : '#e8508a') }} />
          <g dangerouslySetInnerHTML={{ __html: art.over }} />
        </svg>
        {banner && <p className="golf-banner" data-testid="golf-banner"><b>{banner.name}</b> {banner.line}</p>}
      </div>
      <p className="muted small">{h.blurb} Drag back from anywhere and let go to putt.</p>
      <p className="race-them" data-testid="golf-them">
        {duel.partner}: {theirs ? `hole ${theirs.hole}${theirs.done ? ' · finished!' : ` · ${theirs.strokes} stroke${theirs.strokes === 1 ? '' : 's'}`}` : 'teeing off…'}
      </p>
    </div>
  )
}
