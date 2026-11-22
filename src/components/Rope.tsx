import { useEffect, useRef } from 'react'
import { ropePosition, type Player } from '../game/rules'

interface Props {
  aleem: number
  nurul: number
  me: Player
  here: readonly Player[]
  /** Changes every time someone pulls, so the rope can jolt even when the knot barely moves. */
  pull: { by: Player; n: number } | null
}

const Y = 64
const LEFT = 64
const RIGHT = 296
const MID = 180
const SWING = 110

function ropePath(x: number, sag: number) {
  return `M ${LEFT} ${Y} Q ${(LEFT + x) / 2} ${Y + sag} ${x} ${Y} Q ${(x + RIGHT) / 2} ${Y + sag} ${RIGHT} ${Y}`
}

export function Rope({ aleem, nurul, me, here, pull }: Props) {
  const target = MID + ropePosition(aleem, nurul) * SWING
  const sim = useRef({ x: target, v: 0, wobble: 0 })
  const rope = useRef<SVGPathElement>(null)
  const twist = useRef<SVGPathElement>(null)
  const knot = useRef<SVGGElement>(null)
  const lastPull = useRef(pull?.n ?? 0)

  useEffect(() => {
    const s = sim.current
    if (pull && pull.n !== lastPull.current) {
      lastPull.current = pull.n
      s.v += pull.by === 'Aleem' ? -5 : 5
      s.wobble = 9
    }
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let frame = 0
    const step = () => {
      if (still) Object.assign(s, { x: target, v: 0, wobble: 0 })
      else {
        s.v = (s.v + (target - s.x) * 0.05) * 0.88
        s.x += s.v
        s.wobble *= 0.95
      }
      const sag = 5 + s.wobble * Math.sin(performance.now() / 40)
      const d = ropePath(s.x, sag)
      rope.current?.setAttribute('d', d)
      twist.current?.setAttribute('d', d)
      knot.current?.setAttribute('transform', `translate(${s.x.toFixed(2)} ${Y}) rotate(${(s.v * 3).toFixed(2)})`)
      if (Math.abs(target - s.x) > 0.05 || Math.abs(s.v) > 0.02 || s.wobble > 0.05) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [target, pull])

  const avatar = (p: Player, x: number) => (
    <g data-avatar={p} className={`avatar avatar-${p.toLowerCase()}`} transform={`translate(${x} ${Y})`}>
      <circle r="25" className="avatar-face" />
      <text className="avatar-initial" dy="0.36em" textAnchor="middle">{p[0]}</text>
      {here.includes(p) && <circle className="here-dot" cx="18" cy="-18" r="6.5" />}
      {p === me && <text className="avatar-you" y="44" textAnchor="middle">you</text>}
    </g>
  )

  return (
    <svg className="rope" viewBox="0 0 360 120" role="img" aria-label={`Rope: Aleem ${aleem}, Nurul ${nurul}`}>
      <rect className="half half-aleem" x="4" y="14" width="176" height="100" rx="18" />
      <rect className="half half-nurul" x="180" y="14" width="176" height="100" rx="18" />
      <line className="midline" x1={MID} x2={MID} y1="22" y2="106" />
      <path className="flag" d={`M ${MID} 22 l 14 6 l -14 6 z`} />
      <path ref={rope} className="rope-body" d={ropePath(target, 5)} />
      <path ref={twist} className="rope-twist" d={ropePath(target, 5)} />
      <circle className="fist" cx={LEFT} cy={Y} r="7" />
      <circle className="fist" cx={RIGHT} cy={Y} r="7" />
      <g ref={knot} transform={`translate(${target} ${Y})`}>
        <path className="knot" d="M0 9 C -14 -1 -11 -13 -4.5 -13 C -1.8 -13 0 -11 0 -9 C 0 -11 1.8 -13 4.5 -13 C 11 -13 14 -1 0 9 Z" transform="scale(1.35) translate(0 2)" />
      </g>
      {avatar('Aleem', 30)}
      {avatar('Nurul', 330)}
    </svg>
  )
}
