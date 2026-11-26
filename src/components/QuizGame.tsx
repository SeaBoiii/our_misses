import { useEffect, useRef, useState } from 'react'
import { QUIZ_SECONDS, quizPoints, type QuizItem } from '../game/more'
import { sfx } from '../lib/sound'

/** A 7-question quiz (Kiasu Quiz or Next Stop), the same on both phones. Right and fast scores most. */
export function QuizGame({ round, cats, onProgress, exposeAnswers = false }: {
  round: QuizItem[]
  cats: Record<string, { name: string; color: string }>
  onProgress(score: number, done: boolean): void
  exposeAnswers?: boolean
}) {
  const [index, setIndex] = useState(0)
  const [chosen, setChosen] = useState<number | null>(null)
  const [score, setScore] = useState(0)
  const [, setTick] = useState(0)
  /** When the current question appeared; its 12 seconds count from here. */
  const [shownAt, setShownAt] = useState(() => performance.now())
  const scoreRef = useRef(0)
  const item = round[index]

  // Demo only: lets the browser tests answer correctly.
  useEffect(() => {
    if (exposeAnswers) (window as unknown as { __missuQuiz?: number[] }).__missuQuiz = round.map((q) => q.correct)
  }, [exposeAnswers, round])

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 100)
    return () => clearInterval(id)
  }, [])

  const left = Math.max(0, QUIZ_SECONDS * 1000 - (performance.now() - shownAt))

  const answer = (i: number | -1) => {
    if (chosen !== null) return
    const right = i === item.correct
    const points = quizPoints(right, left)
    setChosen(i)
    scoreRef.current += points
    setScore(scoreRef.current)
    if (right) sfx.pop(3)
    else sfx.oops()
    const last = index === round.length - 1
    onProgress(scoreRef.current, false)
    setTimeout(() => {
      if (last) { onProgress(scoreRef.current, true); return }
      setChosen(null)
      setShownAt(performance.now())
      setIndex(index + 1)
    }, 2200)
  }

  // Time's up on this question.
  useEffect(() => {
    if (chosen === null && left <= 0) answer(-1)
  })

  const cat = cats[item.cat]
  return (
    <div className="quiz" data-testid="quiz">
      <div className="quiz-head">
        <span className="quiz-cat" style={{ background: cat?.color }}>{cat?.name}</span>
        <span>Q{index + 1}/{round.length}</span>
        <span className="quiz-score" data-testid="quiz-score">{score} pts</span>
      </div>
      <div className="quiz-timer"><span style={{ width: `${(left / (QUIZ_SECONDS * 1000)) * 100}%` }} /></div>
      <p className="quiz-q">{item.q}</p>
      <div className="quiz-answers">
        {item.answers.map((a, i) => (
          <button
            key={i}
            type="button"
            className={`quiz-answer${chosen !== null && i === item.correct ? ' right' : ''}${chosen === i && i !== item.correct ? ' wrong' : ''}`}
            disabled={chosen !== null}
            onClick={() => answer(i)}
            data-testid={`answer-${i}`}
          >{a}</button>
        ))}
      </div>
      {chosen !== null && <p className="quiz-fact">💡 {item.fact}</p>}
    </div>
  )
}
