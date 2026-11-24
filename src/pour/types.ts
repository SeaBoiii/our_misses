/** Liquid units are ordered bottom to top. All game functions preserve their inputs. */
export type Bottle = number[];
export type Board = Bottle[];

export interface Move {
  from: number;
  to: number;
}

export interface Puzzle {
  board: Board;
  /** A verified sequence of legal, maximal pours from board to a solved state. */
  solution: Move[];
  seed: string;
  level: number;
  difficulty: string;
  generatorVersion: number;
  /** Number of concealed bottom layers in each initial bottle. */
  initialHiddenCounts: number[];
}

export interface SolveOptions {
  maxNodes?: number;
  maxMs?: number;
  /** A generation certificate, or its remaining suffix. Independently replayed before use. */
  certificate?: readonly Move[];
}

export interface HintRequest {
  id: number;
  board: Board;
  certificate?: Move[];
}

export interface HintResponse {
  id: number;
  move: Move | null;
  /** A bounded search can time out without proving that a position is unsolvable. */
  status: 'found' | 'solved' | 'unavailable';
}
