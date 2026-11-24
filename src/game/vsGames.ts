import type { VsGame } from './rules'

export const VS_GAMES: Record<VsGame, { icon: string; name: string; blurb: string }> = {
  tug: { icon: '🪢', name: 'Tug of war', blurb: '15 seconds. Tap as fast as you can.' },
  pour: { icon: '🧪', name: 'Pour-off', blurb: 'The water sort game, same puzzle on both phones. First to sort every colour wins.' },
}
