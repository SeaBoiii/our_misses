// Phase 3 content and rules: reasons, This or That, Hold hands, Kiasu Quiz and Chapteh.
// Numbers here mirror supabase/migrations/202611260001_more_ways_to_miss.sql.
import { createRng, hashSeed, shuffle } from '../pour/rng'
import { QUESTIONS } from '../quiz/questions'

// ---- Why I miss you ----------------------------------------------------------------------
/** Index 1-10 is what the database stores. Append only; never reorder. */
export const REASONS = [
  { id: 1, icon: '🎵', label: 'a song came on' },
  { id: 2, icon: '🍜', label: 'food you’d love' },
  { id: 3, icon: '📸', label: 'saw something you’d like' },
  { id: 4, icon: '😂', label: 'something funny happened' },
  { id: 5, icon: '🛏️', label: 'bed feels empty' },
  { id: 6, icon: '🌧️', label: 'it’s raining' },
  { id: 7, icon: '🚇', label: 'long ride home' },
  { id: 8, icon: '💼', label: 'boring meeting' },
  { id: 9, icon: '🌙', label: 'can’t sleep' },
  { id: 10, icon: '💭', label: 'no reason, just you' },
] as const
export const reasonOf = (id: number | null | undefined) => REASONS.find((r) => r.id === id)
export const TAG_WINDOW_MS = 10 * 60_000

// ---- Hold hands ----------------------------------------------------------------------------
export const HANDS_SECONDS_PER_MISS = 20
export const HANDS_DAILY_CAP = 5

// ---- This or That --------------------------------------------------------------------------
/** Ids are stored with answers: append only, never reorder or reuse an id. */
export const THIS_OR_THAT = [
  ['Chicken rice', 'Nasi lemak'], ['Kopi', 'Teh'], ['Sunrise', 'Sunset'], ['Beach day', 'Mall day'],
  ['Movie at home', 'Cinema'], ['Plan everything', 'Go with the flow'], ['Cats', 'Dogs'], ['Mookata', 'Hotpot'],
  ['Window seat', 'Aisle seat'], ['Early bird', 'Night owl'], ['Text first', 'Wait for them to text'], ['Hug hello', 'Kiss hello'],
  ['Say “I miss you”', 'Show it'], ['Breakfast in bed', 'Brunch out'], ['Sea', 'Mountains'], ['Rain sounds', 'Silence'],
  ['Japan', 'Korea'], ['Less sugar', 'Full sugar'], ['Durian: yes', 'Durian: no way'], ['Prata kosong', 'Prata egg'],
  ['Call', 'Voice note'], ['Big group', 'Just us two'], ['Road trip', 'Fly there'], ['Ice cream', 'Bubble tea'],
  ['Cook together', 'Order in'], ['Matching outfits', 'Never'], ['Sweet', 'Savoury'], ['Spicy', 'Not spicy'],
  ['Stay in on Friday', 'Go out on Friday'], ['Little gifts often', 'One big surprise'], ['Hold hands', 'Link arms'],
  ['Morning shower', 'Night shower'], ['Fairy lights', 'Candles'], ['Love letters', 'Love songs'],
  ['Sentosa', 'Changi Jewel'], ['Hawker centre', 'Café'], ['Wake up early on holiday', 'Sleep in on holiday'],
  ['Photos of us', 'Photos of food'], ['Laugh till we cry', 'Talk till 3am'], ['Kaya toast', 'Roti john'],
  ['Pyjamas all day', 'Dress up for no reason'], ['Sing in the car', 'Podcast in the car'], ['Window shopping', 'Online shopping'],
  ['Stargazing', 'City lights'], ['First to say sorry', 'First to make food'], ['Cuddles', 'Back rubs'],
  ['Teh tarik', 'Milo dinosaur'], ['Board games', 'Video games'], ['Spontaneous trip', 'Anniversary dinner'],
  ['Remember the dates', 'Remember the details'], ['Sweater weather', 'Beach weather'], ['Old photos', 'New adventures'],
  ['Ice kachang', 'Chendol'], ['Fall asleep on the call', 'Say goodnight properly'], ['Pick the movie', 'Pick the food'],
  ['Hand-written note', 'Surprise visit'], ['Bak chor mee dry', 'Bak chor mee soup'], ['Morning texts', 'Goodnight texts'],
  ['Nap together', 'Walk together'], ['Make a playlist', 'Make a scrapbook'],
].map(([a, b], i) => ({ id: `tot-${i + 1}`, a, b }))

/** Today's question, the same on both phones (the day is a Singapore date, YYYY-MM-DD). */
export function totOfDay(day: string) {
  return THIS_OR_THAT[hashSeed(`missu:tot:${day}`) % THIS_OR_THAT.length]
}
export const totById = (id: string) => THIS_OR_THAT.find((q) => q.id === id)
/** Mirrors the database: a right guess is +2; picking the same thing is +1, for each of you. */
export function totPoints(mine: number, guess: number, theirMine: number) {
  return (guess === theirMine ? 2 : 0) + (mine === theirMine ? 1 : 0)
}

// ---- Kiasu Quiz (versus) -------------------------------------------------------------------
export const QUIZ_QUESTIONS = 7
export const QUIZ_SECONDS = 12
export const QUIZ_MAX = QUIZ_QUESTIONS * (100 + QUIZ_SECONDS * 10)
export interface QuizItem { id: string; cat: string; q: string; answers: string[]; correct: number; fact: string }

/** The same 7 questions, answers in the same order, on both phones. */
export function quizRound(seed: number): QuizItem[] {
  const rand = createRng(`missu:quiz:${seed}`)
  return shuffle(QUESTIONS, rand).slice(0, QUIZ_QUESTIONS).map((item) => {
    const order = shuffle([0, 1, 2, 3], rand)
    return { id: item.id, cat: item.cat, q: item.q, fact: item.fact, answers: order.map((i) => item.answers[i]), correct: order.indexOf(0) }
  })
}
/** A right answer is 100 plus a speed bonus of 10 per second left; wrong or late is 0. */
export const quizPoints = (right: boolean, msLeft: number) =>
  right ? 100 + Math.max(0, Math.min(QUIZ_SECONDS * 10, Math.ceil(msLeft / 100))) : 0

// ---- Chapteh (together) --------------------------------------------------------------------
export type Zone = 'L' | 'C' | 'R'
export const ZONES: Record<Zone, { label: string; icon: string }> = {
  L: { label: 'Left foot', icon: '🦶' },
  C: { label: 'Knee', icon: '🦵' },
  R: { label: 'Right foot', icon: '🦶' },
}
/** Timing windows either side of the landing moment, from Chapteh Kick (sg_games). */
export const KICK_WINDOWS = { perfect: 65, good: 130, ok: 210 }
export type KickGrade = 'perfect' | 'good' | 'ok' | 'miss'
export function gradeKick(offsetMs: number): KickGrade {
  const d = Math.abs(offsetMs)
  return d <= KICK_WINDOWS.perfect ? 'perfect' : d <= KICK_WINDOWS.good ? 'good' : d <= KICK_WINDOWS.ok ? 'ok' : 'miss'
}
/** The chapteh speeds up as the rally grows. */
export const flightMs = (kicks: number) => Math.max(850, 1700 - kicks * 45)
/** Mirrors the database: every 4 agreed kicks is +1 miss each, 6 a rally, 12 a day. */
export const rallyMisses = (kicks: number) => Math.min(6, Math.floor(kicks / 4))
export const RALLY_DAILY_CAP = 12
export const randomZone = (): Zone => (['L', 'C', 'R'] as const)[Math.floor(Math.random() * 3)]
