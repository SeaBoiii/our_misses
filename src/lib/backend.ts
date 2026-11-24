import type { Duel, MissEvent, Player, ProveStart, ProveStatus, SendResult, Status, VsGame, WeekTotal } from '../game/rules'

/** Messages the two phones pass each other directly (not stored): VS handshakes and live progress. */
export type Signal =
  | { type: 'prove_played' }
  | { type: 'duel_invite'; game: VsGame }
  | { type: 'duel_decline' }
  | { type: 'duel_cancel' }
  | { type: 'duel_start'; duel: Duel }
  /** Taps so far (tug) or bottles completed (pour); solved when the race puzzle is done. */
  | { type: 'duel_progress'; value: number; solved?: boolean }
  | { type: 'duel_done'; id: number }

/** Everything the game screen needs, from the live database or the local demo. */
export interface Backend {
  kind: 'live' | 'demo'
  me: Player
  status(): Promise<Status>
  weekEvents(sinceIso: string): Promise<MissEvent[]>
  weeks(): Promise<WeekTotal[]>
  send(charge: number, seenId: number): Promise<SendResult>
  proveToday(): Promise<ProveStatus>
  proveStart(level: number): Promise<ProveStart>
  proveFinish(score: number): Promise<ProveStatus>
  duelStart(game: VsGame): Promise<Duel>
  duelFinish(id: number, value: number, solved?: boolean): Promise<Duel>
  duelGet(id: number): Promise<Duel>
  signal(s: Signal): void
  /** New ledger rows, who has the app open, and signals from the partner. Returns an unsubscribe. */
  subscribe(onEvent: (e: MissEvent) => void, onPresence: (here: Player[]) => void, onSignal: (s: Signal) => void): () => void
  noteHoldStart?(): void
  refillHearts?(): void
  signOut?(): Promise<void>
}
