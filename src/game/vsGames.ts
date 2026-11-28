import type { VsGame } from './rules'

export const VS_GAMES: Record<VsGame, { icon: string; name: string; blurb: string; together?: boolean }> = {
  tug: { icon: '🪢', name: 'Tug of war', blurb: '15 seconds. Tap as fast as you can.' },
  pour: { icon: '🧪', name: 'Pour-off', blurb: 'The water sort game, same puzzle on both phones. First to sort every colour wins.' },
  quiz: { icon: '🧠', name: 'Kiasu Quiz', blurb: '7 Singapore questions, the same on both phones. Right and fast scores most.' },
  mrt: { icon: '🚇', name: 'Next Stop', blurb: 'MRT quiz: next stations, lines and interchanges. 7 questions, right and fast scores most.' },
  kopi: { icon: '☕', name: 'Kopi Rush', blurb: 'One minute behind the kopitiam counter, same orders on both phones. Most drinks right wins.' },
  sps: { icon: '✊', name: 'Scissors-Paper-Stone', blurb: 'Best of 5. Each throw is locked in before either of you sees the other’s.' },
  golf: { icon: '⛳', name: 'Marina Mini Golf', blurb: 'The same 3 holes on both phones. Fewest strokes wins.' },
  chope: { icon: '🧻', name: 'Chope Wars', blurb: 'Take turns choping hawker stools with tissue packets. Fill a table to claim it; most points wins.' },
  chapteh: { icon: '🪶', name: 'Chapteh', blurb: 'Together: kick it back and forth between your phones. Every 4 kicks is a miss each.', together: true },
  cannot: { icon: '🙊', name: 'Cannot Say!', blurb: 'Together: describe the word without the banned ones, then swap. Every word you get is a miss each.', together: true },
  draw: { icon: '🎨', name: 'Draw & Guess', blurb: 'Together: one draws, the other guesses, live. Swap halfway. Every word you get is a miss each.', together: true },
  sync: { icon: '🥁', name: 'In Sync', blurb: 'Together: tap the same rhythm. Every 4 beats you both hit is a miss each.', together: true },
}
