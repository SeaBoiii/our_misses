import type { MissEvent, Player, SendResult, Status, WeekTotal } from '../game/rules'

/** Everything the game screen needs, from the live database or the local demo. */
export interface Backend {
  kind: 'live' | 'demo'
  me: Player
  status(): Promise<Status>
  weekEvents(sinceIso: string): Promise<MissEvent[]>
  weeks(): Promise<WeekTotal[]>
  send(charge: number, seenId: number): Promise<SendResult>
  /** New ledger rows and who has the app open right now. Returns an unsubscribe. */
  subscribe(onEvent: (e: MissEvent) => void, onPresence: (here: Player[]) => void): () => void
  noteHoldStart?(): void
  refillHearts?(): void
  signOut?(): Promise<void>
}
