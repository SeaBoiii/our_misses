// Rules for Heart to Heart, Agak Agak, Scissors-Paper-Stone and Cannot Say!. The database
// (supabase/migrations/202611270001_batch1_games.sql) is the referee in live play; these
// mirror it for the demo and the screens. Change both together.
import { AGAK_CARDS } from '../content/agak'
import { CANNOT_CARDS, type CannotCard } from '../content/cannot'
import { HEART_QUESTIONS } from '../content/hearts'
import { createRng, hashSeed, shuffle } from '../pour/rng'
import type { SpsRound, SpsState, SpsThrow } from './rules'

// ---- Heart to Heart ------------------------------------------------------------------------
export const HTH_POINTS = 2
export const HTH_MAX = 600
const HEART_ORDER = shuffle(HEART_QUESTIONS, createRng('missu:hth'))
const dayNumber = (day: string) => Math.round(Date.parse(`${day}T00:00:00Z`) / 86_400_000)
/** The day's question: a fixed shuffle walked one a day, so none repeats for 240 days. */
export const hthOfDay = (day: string) => HEART_ORDER[((dayNumber(day) % HEART_ORDER.length) + HEART_ORDER.length) % HEART_ORDER.length]
export const hthById = (id: string) => HEART_QUESTIONS.find((q) => q.id === id)

// ---- Agak Agak -----------------------------------------------------------------------------
export const DIAL_MAX = 180
export const BAND = 6.5
export const TARGET_MIN = BAND * 2.5
export const TARGET_MAX = DIAL_MAX - BAND * 2.5
export const CLUE_MAX = 80
/** Both of you score this: 4 within 3.25°, 3 within 9.75°, 2 within 16.25°. */
export function agakScore(target: number, needle: number) {
  const d = Math.abs(target - needle)
  if (d <= BAND * 0.5) return 4
  if (d <= BAND * 1.5) return 3
  if (d <= BAND * 2.5) return 2
  return 0
}
/** agak-1 ... agak-99 → [left, right]. */
export function agakCard(id: string): [string, string] {
  const n = Number(id.replace('agak-', ''))
  return AGAK_CARDS[(Number.isInteger(n) && n >= 1 && n <= AGAK_CARDS.length ? n : 1) - 1]
}

// ---- Scissors-Paper-Stone ------------------------------------------------------------------
export const SPS_THROWS: SpsThrow[] = ['scissors', 'paper', 'stone']
export const SPS_ICON: Record<SpsThrow, string> = { scissors: '✌️', paper: '✋', stone: '✊' }
export const SPS_FIRST_TO = 3
export const SPS_MAX_ROUNDS = 9
export const spsBeats = (a: SpsThrow, b: SpsThrow) =>
  (a === 'scissors' && b === 'paper') || (a === 'paper' && b === 'stone') || (a === 'stone' && b === 'scissors')
/** The same view the database's sps_state gives one side, from both sides' throws so far. */
export function spsState(mine: SpsThrow[], theirs: SpsThrow[]): SpsState {
  const rounds: SpsRound[] = []
  for (let i = 0; i < mine.length && i < theirs.length; i++) {
    const [m, t] = [mine[i], theirs[i]]
    rounds.push({ round: i + 1, mine: m, theirs: t, winner: spsBeats(m, t) ? 'me' : spsBeats(t, m) ? 'them' : 'tie' })
  }
  const won = rounds.filter((r) => r.winner === 'me').length
  const lost = rounds.filter((r) => r.winner === 'them').length
  return {
    rounds,
    waiting: mine.length > theirs.length,
    next: mine.length + 1,
    mine: won,
    theirs: lost,
    over: won >= SPS_FIRST_TO || lost >= SPS_FIRST_TO || rounds.length >= SPS_MAX_ROUNDS,
  }
}

// ---- Cannot Say! ---------------------------------------------------------------------------
export const CANNOT_SWAP_MS = 45_000
export const CANNOT_PER_ROUND = 6
export const CANNOT_DAILY_CAP = 12
export const CANNOT_CLUE_MAX = 60
/** Both phones walk the same shuffled deck. */
export const cannotDeck = (seed: number): CannotCard[] => shuffle(CANNOT_CARDS, createRng(hashSeed(`missu:cannot:${seed}`)))

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
const squash = (s: string) => norm(s).replace(/ /g, '')
/**
 * The words a clue isn't allowed to use: the word itself (or any part of it longer than two
 * letters) and the banned words, as whole words or glued together ("chickenrice").
 */
export function bannedIn(clue: string, card: CannotCard): string[] {
  const text = ` ${norm(clue)} `
  const glued = squash(clue)
  const parts = norm(card.word).split(' ').filter((w) => w.length > 2)
  const hits: string[] = []
  for (const w of [card.word, ...parts, ...card.banned]) {
    const n = norm(w)
    if (!n) continue
    const plural = n.endsWith('s') ? n.slice(0, -1) : `${n}s`
    if (text.includes(` ${n} `) || text.includes(` ${plural} `) || (n.length > 3 && glued.includes(n.replace(/ /g, '')))) {
      if (!hits.includes(w)) hits.push(w)
    }
  }
  return hits
}
/** A guess counts if it matches the word, ignoring case, spaces and punctuation. */
export const guessMatches = (guess: string, card: CannotCard) => {
  const g = squash(guess)
  const w = squash(card.word)
  return g.length > 0 && (g === w || g === `${w}s` || `${g}s` === w)
}
/** Words both of you agree on → misses each: one a word, 6 a round, 12 a day. */
export const cannotMisses = (words: number, earnedToday: number) =>
  Math.max(0, Math.min(words, CANNOT_PER_ROUND, CANNOT_DAILY_CAP - earnedToday))
/** Hints the demo partner gives without saying anything banned. */
export function demoHints(card: CannotCard): string[] {
  const letters = card.word.replace(/[^A-Za-z]/g, '').length
  const words = card.word.trim().split(/\s+/).length
  return [
    { food: 'Hawker centre stuff', places: 'A place in Singapore', singlish: 'Something we say', life: 'Singapore life', transport: 'Getting around' }[card.cat],
    `${words === 1 ? 'One word' : `${words} words`}, ${letters} letters`,
    `Starts with ${card.word[0].toUpperCase()}`,
  ].filter((hint) => bannedIn(hint, card).length === 0)
}
