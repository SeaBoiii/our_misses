// Copied from sort_of_us (the water sort game made for Nurul) for the Pour-off VS race.
// Keep in step with that repo if its generator changes; generateRace at the bottom is missu-only.
import { getDifficulty, normalizeLevel } from './difficulty';
import type { Difficulty } from './difficulty';
import { createRng, hashSeed, shuffle } from './rng';
import { CAPACITY, cloneBoard, countTransitions, isComplete, isSolved, pour, sameBoard } from './rules';
import { solve, validateSolution } from './solver';
import type { Board, Move, Puzzle } from './types';
import { createHiddenCounts } from './visibility';

export const GENERATOR_VERSION = 2;

/**
 * Reverse dealing starts with solved bottles and keeps untouched donor bottles mono.
 * A receiver is filled with chunks from DIFFERENT donor colors. Every reverse transfer
 * is checked against an actual forward maximal pour before it is accepted. Filled mixed
 * receivers are set aside; partial donors become the next receiver. Conservation of
 * liquid guarantees the process ends with full bottles and exactly two empty spares.
 * The reversed transfer log is then independently validated by the solver.
 */
function reverseDeal(settings: Difficulty, random: () => number): { board: Board; solution: Move[] } {
  const colors = shuffle(Array.from({ length: settings.colors }, (_, index) => index), random);
  let board: Board = colors.map((color) => Array<number>(CAPACITY).fill(color));
  board.push([], []);
  let donors = shuffle(Array.from({ length: settings.activeColors }, (_, index) => index), random);
  const reverseMoves: Move[] = [];
  let openingReceivers = settings.fineMix >= 0.55 ? 2 : 1;

  while (donors.length > 1) {
    const partial = donors.filter((index) => board[index].length < CAPACITY);
    // No partial donors means the mixed component is finished. Start another only
    // when at least two untouched colors remain, to keep later levels fully involved.
    let receiver: number;
    if (partial.length && openingReceivers <= 0) {
      const smallest = Math.min(...partial.map((index) => board[index].length));
      const choices = partial.filter((index) => board[index].length === smallest);
      receiver = choices[Math.floor(random() * choices.length)];
      donors = donors.filter((index) => index !== receiver);
    } else {
      receiver = board.findIndex((bottle) => !bottle.length);
      if (receiver < 0) throw new Error('Reverse generator exhausted its spare bottles.');
      openingReceivers -= 1;
    }

    const available = (settings.fineMix >= 0.55
      ? donors.map((index) => ({ index, weight: board[index].length + random() * 3 }))
        .sort((a, b) => a.weight - b.weight).map(({ index }) => index)
      : shuffle(donors, random))
      // Involve untouched colors before consuming partial donors. Otherwise the
      // final untouched donor could remain as a completed bottle at the start.
      .sort((a, b) => Number(board[b].length === CAPACITY) - Number(board[a].length === CAPACITY));
    while (board[receiver].length < CAPACITY) {
      const donor = available.shift();
      if (donor === undefined) throw new Error('Reverse generator could not fill a receiver.');
      const room = CAPACITY - board[receiver].length;
      const maximum = Math.min(room, board[donor].length);
      const remaining = available.reduce((sum, index) => sum + board[index].length, 0);
      // Reserve enough liquid among unvisited donor colors to fill the receiver.
      const minimum = Math.max(1, room - remaining);
      let amount = random() < settings.fineMix ? minimum : minimum + Math.floor(random() * (maximum - minimum + 1));
      // Every empty receiver must mix at least two colors, including later ones.
      if (board[receiver].length === 0) amount = Math.min(amount, CAPACITY - 1);
      const before = board;
      const next = cloneBoard(before);
      next[receiver].push(...next[donor].splice(-amount));
      const inverse = pour(next, receiver, donor);
      if (!inverse || !sameBoard(inverse, before)) throw new Error('A reverse transfer was not exactly reversible.');
      board = next;
      reverseMoves.push({ from: receiver, to: donor });
      donors = donors.filter((index) => board[index].length > 0);
    }
  }

  // Remap the certificate with the visual order. Keep spare bottles at the end.
  const order = [...shuffle(board.map((_, index) => index).filter((index) => board[index].length > 0), random),
    ...board.map((_, index) => index).filter((index) => board[index].length === 0)];
  const positions = new Map(order.map((oldIndex, newIndex) => [oldIndex, newIndex]));
  return {
    board: order.map((index) => [...board[index]]),
    solution: reverseMoves.reverse().map((move) => ({ from: positions.get(move.from)!, to: positions.get(move.to)! })),
  };
}

/** A closed color cycle always solves in colors + 1 maximal pours. */
function cyclicFallback(settings: Difficulty, random: () => number): { board: Board; solution: Move[] } {
  const colors = shuffle(Array.from({ length: settings.colors }, (_, index) => index), random);
  const board = colors.map((color, index) => [color, color, color, colors[(index + 1) % colors.length]]);
  board.push([], []);
  const solution: Move[] = [{ from: 0, to: colors.length }];
  for (let from = colors.length - 1; from >= 1; from -= 1) {
    solution.push({ from, to: (from + 1) % colors.length });
  }
  solution.push({ from: colors.length, to: 1 });
  return { board, solution };
}

function puzzleFrom(seed: string, level: number, settings: Difficulty, candidate: { board: Board; solution: Move[] }): Puzzle {
  return {
    ...candidate, seed, level, difficulty: settings.label, generatorVersion: GENERATOR_VERSION,
    initialHiddenCounts: createHiddenCounts(candidate.board, level, seed),
  };
}

function generate(seed: string, level: number, settings: Difficulty): Puzzle {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    let candidate: ReturnType<typeof reverseDeal>;
    try {
      candidate = reverseDeal(settings, createRng(`${seed}:v${GENERATOR_VERSION}:${attempt}`));
    } catch {
      // A candidate that cannot maintain exact reversibility is discarded completely.
      // The next seed derives only from the level/date and attempt, never wall time.
      continue;
    }
    const { board, solution } = candidate;
    const minimumTransitions = settings.activeColors <= 2 ? 2 : settings.fineMix >= 0.8
      ? Math.ceil(settings.activeColors * 1.7) : settings.activeColors;
    if (isSolved(board) || board.some(isComplete) || countTransitions(board) < minimumTransitions) continue;
    const validated = solve(board, { certificate: solution, maxNodes: 0 });
    if (!validated) continue;
    return puzzleFrom(seed, level, settings, { board, solution: validated });
  }
  const fallback = cyclicFallback(settings, createRng(`${seed}:v${GENERATOR_VERSION}:fallback`));
  if (!validateSolution(fallback.board, fallback.solution)) throw new Error('Cyclic puzzle certificate is invalid.');
  return puzzleFrom(seed, level, settings, fallback);
}

export function generateLevel(level: number): Puzzle {
  normalizeLevel(level);
  return generate(`sort-of-us:level:${level}`, level, getDifficulty(level));
}

/** The caller passes YYYY-MM-DD obtained in Asia/Singapore, never the device timezone. */
export function generateDaily(date: string, seedOverride?: string): Puzzle {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
    throw new RangeError('Daily date must be a valid YYYY-MM-DD date.');
  }
  const seed = `sort-of-us:daily:${seedOverride || date}`;
  const colors = 6 + (hashSeed(seed) % 3);
  return generate(seed, 0, { label: 'Normal', colors, spares: 2, activeColors: colors, fineMix: 0.64 });
}

export function singaporeDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** missu Pour-off: one shared race puzzle per VS game, built identically on both phones from its seed. */
export function generateRace(seed: number): Puzzle {
  return generate(`missu:pour:${seed}`, 0, { label: 'Normal', colors: 6, spares: 2, activeColors: 6, fineMix: 0.6 });
}
