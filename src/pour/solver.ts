import { boardKey, countTransitions, isComplete, isMonochrome, isSolved, pour } from './rules';
import type { Board, Move, SolveOptions } from './types';

/** Replays every pour. A reverse-generation certificate is proof, not an assumed solution. */
export function validateSolution(board: Board, solution: readonly Move[]): boolean {
  let state = board;
  for (const move of solution) {
    const next = pour(state, move.from, move.to);
    if (!next) return false;
    state = next;
  }
  return isSolved(state);
}

interface SearchNode {
  board: Board;
  key: string;
  depth: number;
  priority: number;
  parent: SearchNode | null;
  move: Move | null;
}

class MinHeap {
  private items: SearchNode[] = [];
  get length(): number { return this.items.length; }

  push(node: SearchNode): void {
    const items = this.items;
    let index = items.length;
    items.push(node);
    while (index > 0) {
      const parent = (index - 1) >>> 1;
      if (items[parent].priority <= node.priority) break;
      items[index] = items[parent];
      index = parent;
    }
    items[index] = node;
  }

  pop(): SearchNode | undefined {
    const first = this.items[0];
    const last = this.items.pop();
    if (this.items.length && last) {
      let index = 0;
      while (index * 2 + 1 < this.items.length) {
        let child = index * 2 + 1;
        if (child + 1 < this.items.length && this.items[child + 1].priority < this.items[child].priority) child += 1;
        if (this.items[child].priority >= last.priority) break;
        this.items[index] = this.items[child];
        index = child;
      }
      this.items[index] = last;
    }
    return first;
  }
}

/** Excludes symmetric empty bottles and reversible, unhelpful mono-to-empty moves. */
function searchMoves(board: Board): Move[] {
  const moves: { move: Move; score: number }[] = [];
  const firstEmpty = board.findIndex((bottle) => !bottle.length);
  for (let from = 0; from < board.length; from += 1) {
    const source = board[from];
    if (!source.length || isComplete(source)) continue;
    for (let to = 0; to < board.length; to += 1) {
      if (from === to || board[to].length >= 4) continue;
      const target = board[to];
      if (target.length === 0) {
        if (to !== firstEmpty || isMonochrome(source)) continue;
      } else if (target[target.length - 1] !== source[source.length - 1]) continue;
      // Consolidate before spending a spare. The search still explores both choices.
      const score = target.length * 3 + Number(target.length > 0 && isMonochrome(target)) * 4;
      moves.push({ move: { from, to }, score });
    }
  }
  return moves.sort((a, b) => b.score - a.score).map(({ move }) => move);
}

function trace(node: SearchNode): Move[] {
  const path: Move[] = [];
  for (let current: SearchNode | null = node; current?.move; current = current.parent) path.push(current.move);
  return path.reverse();
}

/**
 * Bounded, weighted A* for hints. Null means no solution was found within the budget;
 * it is never treated as proof of an impossible position. Run this in the hint worker.
 * Color boundaries are a useful lower bound: a legal pour removes at most one.
 */
export function solve(board: Board, options: SolveOptions = {}): Move[] | null {
  if (isSolved(board)) return [];
  if (options.certificate && validateSolution(board, options.certificate)) return options.certificate.map((move) => ({ ...move }));
  const maxNodes = options.maxNodes ?? 35_000;
  const maxMs = options.maxMs ?? 900;
  if (maxNodes <= 0 || maxMs <= 0) return null;
  const start = performance.now();
  const frontier = new MinHeap();
  const firstKey = boardKey(board);
  frontier.push({ board, key: firstKey, depth: 0, priority: countTransitions(board) * 3, parent: null, move: null });
  const bestDepth = new Map<string, number>([[firstKey, 0]]);
  let examined = 0;
  while (frontier.length && examined < maxNodes) {
    if ((examined & 127) === 0 && performance.now() - start > maxMs) return null;
    const node = frontier.pop()!;
    if (node.depth !== bestDepth.get(node.key)) continue;
    examined += 1;
    if (isSolved(node.board)) return trace(node);
    for (const move of searchMoves(node.board)) {
      const next = pour(node.board, move.from, move.to)!;
      const key = boardKey(next);
      const depth = node.depth + 1;
      if (depth >= (bestDepth.get(key) ?? Infinity)) continue;
      bestDepth.set(key, depth);
      const occupied = next.filter((bottle) => bottle.length > 0).length;
      const priority = depth + countTransitions(next) * 3 + occupied * 0.12;
      frontier.push({ board: next, key, depth, priority, parent: node, move });
    }
  }
  return null;
}
