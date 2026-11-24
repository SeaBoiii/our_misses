import { useEffect, useMemo, useState } from 'react'
import { generateRace } from '../pour/generator'
import { bottleLabel } from '../pour/liquids'
import { isComplete, isSolved, pour } from '../pour/rules'
import type { Board } from '../pour/types'
import { Bottle } from '../pour/Bottle'
import { sfx } from '../lib/sound'

/**
 * The Pour-off board: Nurul's water sort game, one shared puzzle per race. Tap a bottle,
 * then tap where to pour. Only the top colour moves, onto an empty bottle or the same colour.
 */
export function PourRace({ seed, onProgress, exposeSolution = false }: {
  seed: number
  onProgress(bottles: number, solved: boolean): void
  exposeSolution?: boolean
}) {
  const puzzle = useMemo(() => generateRace(seed), [seed])
  const [board, setBoard] = useState<Board>(puzzle.board)
  const [undo, setUndo] = useState<Board[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [wrong, setWrong] = useState<number | null>(null)
  const colours = useMemo(() => new Set(puzzle.board.flat()).size, [puzzle])
  const done = board.filter(isComplete).length
  const solved = isSolved(board)

  // Demo only: lets the browser tests play the verified solution.
  useEffect(() => {
    if (!exposeSolution) return
    ;(window as unknown as { __missuPour?: unknown }).__missuPour = puzzle.solution
  }, [exposeSolution, puzzle])

  useEffect(() => {
    if (wrong === null) return
    const id = setTimeout(() => setWrong(null), 350)
    return () => clearTimeout(id)
  }, [wrong])

  const tapBottle = (i: number) => {
    if (solved) return
    if (selected === null) {
      if (board[i].length && !isComplete(board[i])) { setSelected(i); sfx.tick() }
      return
    }
    if (selected === i) { setSelected(null); return }
    const next = pour(board, selected, i)
    if (!next) {
      setWrong(i)
      sfx.denied()
      setSelected(board[i].length && !isComplete(board[i]) ? i : null)
      return
    }
    setUndo((u) => [...u, board])
    setBoard(next)
    setSelected(null)
    const nowDone = next.filter(isComplete).length
    if (nowDone > done) sfx.pop(3)
    else sfx.pop(1)
    onProgress(nowDone, isSolved(next))
  }

  const back = () => {
    const prev = undo[undo.length - 1]
    if (!prev || solved) return
    setUndo((u) => u.slice(0, -1))
    setBoard(prev)
    setSelected(null)
    onProgress(prev.filter(isComplete).length, false)
  }

  return (
    <div className="pour">
      <div className="pour-board" data-testid="pour-board">
        {board.map((bottle, i) => (
          <button
            key={i}
            type="button"
            className={`pour-bottle${selected === i ? ' selected' : ''}${wrong === i ? ' invalid' : ''}`}
            data-testid={`bottle-${i}`}
            aria-label={bottleLabel(bottle, i)}
            aria-pressed={selected === i}
            onClick={() => tapBottle(i)}
          >
            <Bottle layers={bottle} complete={isComplete(bottle)} idPrefix={`race${seed}b${i}`} />
          </button>
        ))}
      </div>
      <div className="pour-tools">
        <button type="button" className="pill ghost small-pill" onClick={back} disabled={!undo.length || solved}>↶ Undo</button>
        <span data-testid="pour-done">{done} / {colours} bottles</span>
      </div>
    </div>
  )
}
