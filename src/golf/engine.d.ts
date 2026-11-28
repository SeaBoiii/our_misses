// Types for the Marina Mini Golf engine copied from sg_games (engine.js beside this file).
export type Pt = [number, number]
export interface Zone { type: 'sand' | 'water' | 'slope' | 'pull'; poly?: Pt[]; circle?: [number, number, number]; ax?: number; ay?: number; strength?: number; kind?: string }
export interface Circle { x: number; y: number; r: number; kind: string; bounce?: number }
export interface Mover { type: 'bar' | 'slider'; kind: string; [k: string]: unknown }
export interface Hole {
  id: string
  name: string
  place: string
  par: number
  blurb: string
  tee: Pt
  cup: Pt
  outline: Pt[]
  blocks: Pt[][]
  circles: Circle[]
  zones: Zone[]
  movers: Mover[]
}
export interface Ball { x: number; y: number; vx: number; vy: number }
export interface GolfState {
  players: number
  course: Hole[]
  holeCount: number
  holeIdx: number
  scores: (number | undefined)[][]
  t: number
  ball: Ball
  strokes: number
  phase: 'ready' | 'aim' | 'roll' | 'holed' | 'capped' | 'over'
  last: { x: number; y: number }
}
export interface GolfEvent { type: 'hit' | 'bump' | 'sand' | 'lip' | 'water' | 'sink' | 'stop' | 'capped' | 'rest'; kind?: string; speed?: number; at?: { x: number; y: number } }
export interface MoverShape { kind: string; type: 'bar' | 'slider'; y0?: number; [k: string]: unknown }

export const W: number
export const H: number
export const BALL_R: number
export const CUP_R: number
export const VMAX: number
export const HOLES: Hole[]
export function newGame(opts?: { players?: number; names?: string[]; holes?: number; course?: Hole[] | null }): GolfState
export function holeOf(s: GolfState): Hole
export function capOf(h: Hole): number
export function beginTurn(s: GolfState): void
export function shoot(s: GolfState, angle: number, power: number): boolean
export function tick(s: GolfState, dt: number): GolfEvent[]
export function endTurn(s: GolfState): 'player' | 'hole' | 'over'
export function moverShapes(h: Hole, t: number): MoverShape[]
export function total(s: GolfState, p: number): number
export function scoreName(strokes: number, par: number, capped?: boolean): { name: string; line: string }
