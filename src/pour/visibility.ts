import { createRng, shuffle } from './rng';
import { topRun } from './rules';
import type { Board } from './types';

/** Concealed layers form a bottom prefix; the entire exposed top group is visible. */
export function createHiddenCounts(board: Board, level: number, seed: string): number[] {
  const counts = board.map(() => 0);
  const challenge = level >= 16 && (level <= 150 ? level % 4 === 0 : [3, 6].includes((level - 151) % 8));
  if (!challenge) return counts;
  const eligible = board.map((bottle, index) => ({ index, hidden: bottle.length - topRun(bottle) }))
    .filter(({ hidden }) => hidden > 0);
  const colors = new Set(board.flat()).size;
  const count = level < 36 ? 2 : Math.ceil(colors / (level < 76 ? 3 : 2));
  for (const { index, hidden } of shuffle(eligible, createRng(`${seed}:hidden:v2`)).slice(0, count)) {
    counts[index] = hidden;
  }
  return counts;
}

/** Reveal newly exposed groups without concealing any layers the player has seen. */
export function revealHiddenCounts(board: Board, hiddenCounts: readonly number[]): number[] {
  return board.map((bottle, index) => Math.min(hiddenCounts[index] ?? 0, bottle.length - topRun(bottle)));
}
