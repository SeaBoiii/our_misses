import { useEffect, useRef, useState } from 'react'
import { CATCH_MS, CATCHER_W, catcherY, catchOver, createCatch, stepCatch } from '../game/catch'
import { sfx } from '../lib/sound'

const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'

/** The 20-second catch round. Drag (or use ←/→) to move the jar under falling thoughts. */
export function CatchGame({ target, onDone }: { target: number; onDone(score: number): void }) {
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const doneRef = useRef(onDone)
  useEffect(() => { doneRef.current = onDone })
  const [hud, setHud] = useState({ score: 0, left: CATCH_MS })

  useEffect(() => {
    const cv = canvas.current!
    const W = wrap.current!.clientWidth
    const H = Math.round(Math.min(460, Math.max(340, window.innerHeight - 250)))
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    cv.width = W * dpr
    cv.height = H * dpr
    cv.style.height = `${H}px`
    const ctx = cv.getContext('2d')!
    ctx.scale(dpr, dpr)
    const css = getComputedStyle(document.documentElement)
    const color = (name: string) => css.getPropertyValue(name).trim()
    const [paper, ink, heart, track] = ['--paper', '--line', '--heart', '--track'].map(color)

    const game = createCatch(W, H)
    const line = catcherY(H)
    let x = W / 2
    let aim = W / 2
    let last = performance.now()
    let frame = 0
    let finished = false
    let flash = 0
    let shownScore = -1
    let shownLeft = -1
    const keys = { left: false, right: false }
    const pops: { x: number; y: number; text: string; fill: string; age: number }[] = []
    const clamp = (v: number) => Math.max(CATCHER_W / 2, Math.min(W - CATCHER_W / 2, v))

    const point = (e: PointerEvent) => {
      e.preventDefault()
      aim = clamp(e.clientX - cv.getBoundingClientRect().left)
    }
    const key = (down: boolean) => (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') { keys.left = down; e.preventDefault() }
      if (e.key === 'ArrowRight') { keys.right = down; e.preventDefault() }
    }
    const keyDown = key(true)
    const keyUp = key(false)
    cv.addEventListener('pointerdown', point)
    cv.addEventListener('pointermove', point)
    window.addEventListener('keydown', keyDown)
    window.addEventListener('keyup', keyUp)

    const draw = () => {
      ctx.clearRect(0, 0, W, H)
      ctx.fillStyle = paper
      ctx.fillRect(0, 0, W, H)
      ctx.strokeStyle = track
      ctx.setLineDash([4, 6])
      ctx.beginPath()
      ctx.moveTo(0, line + 30)
      ctx.lineTo(W, line + 30)
      ctx.stroke()
      ctx.setLineDash([])

      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = `30px ${EMOJI_FONT}`
      for (const it of game.items) ctx.fillText(it.glyph, it.x, it.y)

      // The jar.
      const top = line - 4
      ctx.fillStyle = heart
      ctx.strokeStyle = ink
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.roundRect(x - CATCHER_W / 2, top, CATCHER_W, 30, [6, 6, 16, 16])
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 17px "Fredoka Variable", sans-serif'
      ctx.fillText('♥', x, top + 15)

      for (const p of pops) {
        ctx.globalAlpha = Math.max(0, 1 - p.age / 650)
        ctx.fillStyle = p.fill
        ctx.font = 'bold 22px "Fredoka Variable", sans-serif'
        ctx.fillText(p.text, p.x, p.y - p.age * 0.06)
      }
      ctx.globalAlpha = 1
      if (flash > 0) {
        ctx.fillStyle = `rgba(239, 59, 93, ${0.22 * flash})`
        ctx.fillRect(0, 0, W, H)
      }
    }

    const loop = (now: number) => {
      const dt = Math.min(50, now - last)
      last = now
      if (keys.left) aim = clamp(aim - 0.75 * dt)
      if (keys.right) aim = clamp(aim + 0.75 * dt)
      x += (aim - x) * Math.min(1, dt / 35)
      for (const ev of stepCatch(game, dt, x)) {
        if (ev.points > 0) {
          sfx.pop(ev.points)
          pops.push({ x: ev.x, y: ev.y - 10, text: `+${ev.points}`, fill: ev.points > 1 ? '#e0a100' : heart, age: 0 })
        } else {
          sfx.oops()
          flash = 1
          pops.push({ x: ev.x, y: ev.y - 10, text: `${ev.points}`, fill: ink, age: 0 })
        }
      }
      for (const p of pops) p.age += dt
      while (pops.length && pops[0].age > 650) pops.shift()
      flash = Math.max(0, flash - dt / 300)
      draw()
      const left = Math.ceil((CATCH_MS - game.t) / 1000)
      if (game.score !== shownScore || left !== shownLeft) {
        shownScore = game.score
        shownLeft = left
        setHud({ score: game.score, left: CATCH_MS - game.t })
      }
      if (catchOver(game) && !finished) {
        finished = true
        doneRef.current(game.score)
        return
      }
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(frame)
      cv.removeEventListener('pointerdown', point)
      cv.removeEventListener('pointermove', point)
      window.removeEventListener('keydown', keyDown)
      window.removeEventListener('keyup', keyUp)
    }
  }, [])

  const reached = hud.score >= target
  return (
    <div className="catch" ref={wrap}>
      <div className="catch-hud" data-testid="catch-hud">
        <span className="catch-time">⏱ {Math.ceil(hud.left / 1000)}s</span>
        <span className={`catch-score${reached ? ' reached' : ''}`}><b data-testid="catch-score">{hud.score}</b> / {target}{reached && ' ✓'}</span>
      </div>
      <div className="catch-bar"><span style={{ width: `${Math.min(100, (hud.score / target) * 100)}%` }} className={reached ? 'reached' : ''} /></div>
      <canvas ref={canvas} className="catch-canvas" aria-label="Catch game: drag to move the jar under the falling hearts and stars, away from emails and alarms." />
      <p className="catch-legend">❤️ +1 · 🌟 +3 · 📧⏰💼 −3</p>
    </div>
  )
}
