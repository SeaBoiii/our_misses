// Types for the Chope Wars engine copied from sg_games (engine.js beside this file).
export interface Stool { id: number; kind: 'h' | 'v'; r: number; c: number; tables: number[] }
export interface Table { id: number; r: number; c: number; stools: number[]; name: string }
export interface Geo { n: number; stools: Stool[]; tables: Table[] }
export interface ChopeMove { type: 'place' | 'swap'; stool: number }
export interface ChopePlayer { name: string; color: string; score: number; tables: number; auntie: number }
export interface ChopeState {
  n: number
  phase: 'play' | 'over'
  players: ChopePlayer[]
  turn: 0 | 1
  stools: (0 | 1 | null)[]
  tables: { type: 'normal' | 'fan' | 'famous'; value: number; owner: 0 | 1 | null }[]
  moves: number
  last: { player: number; type: string; stool: number; claims: number[] } | null
  winner?: 0 | 1 | -1
}
export interface ChopeEvent { player: number; move: ChopeMove; claims: { table: number; owner: number; value: number; tie: boolean }[] }

export const COLORS: string[]
export const SIZES: Record<'small' | 'classic' | 'big', number>
export const TABLE_TYPES: Record<'normal' | 'fan' | 'famous', { value: number; label: string }>
export function layout(n: number): Geo
export function newGame(opts?: { names?: string[]; size?: 'small' | 'classic' | 'big'; cpu?: unknown; rand?: () => number }): ChopeState
export function geo(s: ChopeState): Geo
export function canSwap(s: ChopeState, stool: number, p?: number): boolean
export function canPlace(s: ChopeState, stool: number): boolean
export function apply(s: ChopeState, move: ChopeMove): ChopeEvent
export function winner(s: ChopeState): 0 | 1 | -1
export function cpuMove(s: ChopeState, level?: 'easy' | 'hard'): ChopeMove | null
