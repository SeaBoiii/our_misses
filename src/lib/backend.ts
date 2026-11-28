import type { Lineups } from '../game/lineup'
import type { Zone } from '../game/more'
import type {
  AgakStatus, Duel, HthDay, HthStatus, MissEvent, Player, ProveStart, ProveStatus, ReasonCount, SendResult, SpsState, SpsThrow,
  Status, TotDay, TotStatus, VsGame, WeekTotal,
} from '../game/rules'

/** Messages the two phones pass each other directly (not stored). */
export type Signal =
  | { type: 'prove_played' }
  | { type: 'tot_answered' }
  | { type: 'hth_answered' }
  /** Agak Agak: a clue went in, or the needle did. */
  | { type: 'agak_moved' }
  /** Scissors-Paper-Stone: I've thrown this round (the throw itself stays in the database). */
  | { type: 'sps_thrown'; round: number }
  /** Cannot Say!: clues and guesses for card number `card` of the shared deck. */
  | { type: 'cannot_clue'; card: number; text: string }
  | { type: 'cannot_guess'; card: number; text: string }
  | { type: 'cannot_got'; card: number }
  | { type: 'cannot_pass'; card: number }
  | { type: 'duel_invite'; game: VsGame }
  | { type: 'duel_decline' }
  | { type: 'duel_cancel' }
  | { type: 'duel_start'; duel: Duel }
  /** Taps (tug), bottles (pour) or points (quiz) so far; solved when the race puzzle is done. */
  | { type: 'duel_progress'; value: number; solved?: boolean }
  | { type: 'duel_done'; id: number }
  /** Chapteh: the chapteh is on its way to you, aimed at a zone, landing in `ms`. */
  | { type: 'chapteh_kick'; kicks: number; zone: Zone; ms: number }
  | { type: 'chapteh_drop'; kicks: number }
  /** Hold hands: open = on the screen, down/up = thumb on/off, close = left. */
  | { type: 'hands'; state: 'open' | 'down' | 'up' | 'close' }

export type Change = 'insert' | 'update'

/** Everything the game screen needs, from the live database or the local demo. */
export interface Backend {
  kind: 'live' | 'demo'
  me: Player
  status(): Promise<Status>
  /** Today's and tomorrow's games (the daily rotation). */
  lineup(): Promise<Lineups>
  weekEvents(sinceIso: string): Promise<MissEvent[]>
  weeks(): Promise<WeekTotal[]>
  send(charge: number, seenId: number): Promise<SendResult>
  /** Why I miss you: tag your own miss within 10 minutes. */
  tag(id: number, reason: number): Promise<MissEvent>
  reasons(): Promise<ReasonCount[]>
  /** Hold hands: seconds held together since the last report. */
  hands(seconds: number): Promise<{ earned: number; today: number; cap: number }>
  totToday(): Promise<TotStatus>
  totAnswer(question: string, mine: number, guess: number): Promise<TotStatus>
  totAlbum(): Promise<TotDay[]>
  hthToday(): Promise<HthStatus>
  hthAnswer(question: string, answer: string): Promise<HthStatus>
  hthAlbum(): Promise<HthDay[]>
  /** Deals today's round the first time either of you opens it on an Agak Agak day. */
  agakToday(): Promise<AgakStatus>
  agakClue(clue: string): Promise<AgakStatus>
  agakGuess(needle: number): Promise<AgakStatus>
  spsThrow(id: number, round: number, hand: SpsThrow): Promise<SpsState>
  spsGet(id: number): Promise<SpsState>
  proveToday(): Promise<ProveStatus>
  proveStart(level: number): Promise<ProveStart>
  proveFinish(score: number): Promise<ProveStatus>
  duelStart(game: VsGame): Promise<Duel>
  duelFinish(id: number, value: number, solved?: boolean): Promise<Duel>
  duelGet(id: number): Promise<Duel>
  signal(s: Signal): void
  /** New or changed ledger rows, who has the app open, and signals from the partner. Returns an unsubscribe. */
  subscribe(onEvent: (e: MissEvent, change: Change) => void, onPresence: (here: Player[]) => void, onSignal: (s: Signal) => void): () => void
  noteHoldStart?(): void
  refillHearts?(): void
  signOut?(): Promise<void>
}
