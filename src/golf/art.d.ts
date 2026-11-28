// Types for the Marina Mini Golf SVG art copied from sg_games (art.js beside this file).
import type { Hole, MoverShape } from './engine'

export const S: number
export function holeSVG(h: Hole, prefix?: string, opts?: { flat?: boolean }): { under: string; over: string }
export function cupSVG(h: Hole, prefix?: string, flagColor?: string): string
export function ballSVG(color?: string): string
export function moverSVG(m: MoverShape): string
export function trainSVG(m: unknown): string
