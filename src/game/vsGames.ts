import type { VsGame } from './rules'

export const VS_GAMES: Record<VsGame, { icon: string; name: string; blurb: string; together?: boolean }> = {
  tug: { icon: '🪢', name: 'Tug of war', blurb: '15 seconds. Tap as fast as you can.' },
  pour: { icon: '🧪', name: 'Pour-off', blurb: 'The water sort game, same puzzle on both phones. First to sort every colour wins.' },
  quiz: { icon: '🧠', name: 'Kiasu Quiz', blurb: '7 Singapore questions, the same on both phones. Right and fast scores most.' },
  mrt: { icon: '🚇', name: 'Next Stop', blurb: 'MRT quiz: next stations, lines and interchanges. 7 questions, right and fast scores most.' },
  chapteh: { icon: '🪶', name: 'Chapteh', blurb: 'Together: kick it back and forth between your phones. Every 4 kicks is a miss each.', together: true },
}
