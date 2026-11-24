import type { Board, Bottle, Move } from './types';

export const CAPACITY = 4;

export function cloneBoard(board: readonly (readonly number[])[]): Board {
  return board.map((bottle) => [...bottle]);
}

export function isMonochrome(bottle: readonly number[]): boolean {
  return bottle.length > 0 && bottle.every((color) => color === bottle[0]);
}

export function isComplete(bottle: readonly number[]): boolean {
  return bottle.length === CAPACITY && isMonochrome(bottle);
}

export function isSolved(board: readonly (readonly number[])[]): boolean {
  return board.every((bottle) => bottle.length === 0 || isComplete(bottle));
}

export function topRun(bottle: readonly number[]): number {
  const color = bottle[bottle.length - 1];
  let units = 0;
  for (let i = bottle.length - 1; i >= 0 && bottle[i] === color; i -= 1) units += 1;
  return units;
}

export function pourAmount(board: Board, from: number, to: number): number {
  if (from === to || !Number.isInteger(from) || !Number.isInteger(to)) return 0;
  const source = board[from];
  const target = board[to];
  if (!source?.length || !target || target.length >= CAPACITY) return 0;
  const color = source[source.length - 1];
  if (target.length > 0 && target[target.length - 1] !== color) return 0;
  return Math.min(topRun(source), CAPACITY - target.length);
}

export function pour(board: Board, from: number, to: number): Board | null {
  const amount = pourAmount(board, from, to);
  if (!amount) return null;
  const result = cloneBoard(board);
  result[to].push(...result[from].splice(-amount));
  return result;
}

export function getLegalMoves(board: Board): Move[] {
  const moves: Move[] = [];
  for (let from = 0; from < board.length; from += 1) {
    for (let to = 0; to < board.length; to += 1) {
      if (pourAmount(board, from, to) > 0) moves.push({ from, to });
    }
  }
  return moves;
}

/** Ignore interchangeable bottle positions, but preserve their internal layer order. */
export function boardKey(board: Board): string {
  return board.map((bottle) => bottle.join(',')).sort().join('|');
}

export function sameBoard(a: Board, b: Board): boolean {
  return a.length === b.length && a.every((bottle, index) =>
    bottle.length === b[index].length && bottle.every((color, unit) => color === b[index][unit]));
}

export function countTransitions(board: Board): number {
  return board.reduce((sum, bottle) => sum + bottle.reduce((changes, color, index) =>
    changes + Number(index > 0 && color !== bottle[index - 1]), 0), 0);
}

export function isValidBoard(value: unknown): value is Board {
  return Array.isArray(value) && value.length >= 1 && value.length <= 20 &&
    value.every((bottle: unknown): bottle is Bottle => Array.isArray(bottle) &&
      bottle.length <= CAPACITY && bottle.every((color: unknown) =>
        typeof color === 'number' && Number.isInteger(color) && color >= 0 && color < 64));
}
