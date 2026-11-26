// Next Stop: an MRT quiz built from the network itself. Only long-open stretches are listed
// (no Changi Airport branch, no DT1-DT4, TEL to Marina Bay, CCL Dhoby Ghaut to HarbourFront),
// so every "next stop" answer is the station trains actually call at next.
import { createRng, shuffle } from '../pour/rng'
import type { QuizItem } from './more'

export type LineCode = 'NS' | 'EW' | 'NE' | 'CC' | 'DT' | 'TE'
export const LINES: Record<LineCode, { name: string; color: string }> = {
  NS: { name: 'North–South', color: '#d42e12' },
  EW: { name: 'East–West', color: '#009645' },
  NE: { name: 'North East', color: '#9900aa' },
  CC: { name: 'Circle', color: '#fa9e0d' },
  DT: { name: 'Downtown', color: '#005ec4' },
  TE: { name: 'Thomson–East Coast', color: '#9d5b25' },
}

/** [station number, name] in running order. Gaps are numbers reserved for unopened stations. */
export const STATIONS: Record<LineCode, [number, string][]> = {
  NS: [[1, 'Jurong East'], [2, 'Bukit Batok'], [3, 'Bukit Gombak'], [4, 'Choa Chu Kang'], [5, 'Yew Tee'], [7, 'Kranji'],
    [8, 'Marsiling'], [9, 'Woodlands'], [10, 'Admiralty'], [11, 'Sembawang'], [12, 'Canberra'], [13, 'Yishun'], [14, 'Khatib'],
    [15, 'Yio Chu Kang'], [16, 'Ang Mo Kio'], [17, 'Bishan'], [18, 'Braddell'], [19, 'Toa Payoh'], [20, 'Novena'], [21, 'Newton'],
    [22, 'Orchard'], [23, 'Somerset'], [24, 'Dhoby Ghaut'], [25, 'City Hall'], [26, 'Raffles Place'], [27, 'Marina Bay'],
    [28, 'Marina South Pier']],
  EW: [[1, 'Pasir Ris'], [2, 'Tampines'], [3, 'Simei'], [4, 'Tanah Merah'], [5, 'Bedok'], [6, 'Kembangan'], [7, 'Eunos'],
    [8, 'Paya Lebar'], [9, 'Aljunied'], [10, 'Kallang'], [11, 'Lavender'], [12, 'Bugis'], [13, 'City Hall'], [14, 'Raffles Place'],
    [15, 'Tanjong Pagar'], [16, 'Outram Park'], [17, 'Tiong Bahru'], [18, 'Redhill'], [19, 'Queenstown'], [20, 'Commonwealth'],
    [21, 'Buona Vista'], [22, 'Dover'], [23, 'Clementi'], [24, 'Jurong East'], [25, 'Chinese Garden'], [26, 'Lakeside'],
    [27, 'Boon Lay'], [28, 'Pioneer'], [29, 'Joo Koon'], [30, 'Gul Circle'], [31, 'Tuas Crescent'], [32, 'Tuas West Road'],
    [33, 'Tuas Link']],
  NE: [[1, 'HarbourFront'], [3, 'Outram Park'], [4, 'Chinatown'], [5, 'Clarke Quay'], [6, 'Dhoby Ghaut'], [7, 'Little India'],
    [8, 'Farrer Park'], [9, 'Boon Keng'], [10, 'Potong Pasir'], [11, 'Woodleigh'], [12, 'Serangoon'], [13, 'Kovan'],
    [14, 'Hougang'], [15, 'Buangkok'], [16, 'Sengkang'], [17, 'Punggol'], [18, 'Punggol Coast']],
  CC: [[1, 'Dhoby Ghaut'], [2, 'Bras Basah'], [3, 'Esplanade'], [4, 'Promenade'], [5, 'Nicoll Highway'], [6, 'Stadium'],
    [7, 'Mountbatten'], [8, 'Dakota'], [9, 'Paya Lebar'], [10, 'MacPherson'], [11, 'Tai Seng'], [12, 'Bartley'], [13, 'Serangoon'],
    [14, 'Lorong Chuan'], [15, 'Bishan'], [16, 'Marymount'], [17, 'Caldecott'], [19, 'Botanic Gardens'], [20, 'Farrer Road'],
    [21, 'Holland Village'], [22, 'Buona Vista'], [23, 'one-north'], [24, 'Kent Ridge'], [25, 'Haw Par Villa'],
    [26, 'Pasir Panjang'], [27, 'Labrador Park'], [28, 'Telok Blangah'], [29, 'HarbourFront']],
  DT: [[5, 'Beauty World'], [6, 'King Albert Park'], [7, 'Sixth Avenue'], [8, 'Tan Kah Kee'], [9, 'Botanic Gardens'], [10, 'Stevens'],
    [11, 'Newton'], [12, 'Little India'], [13, 'Rochor'], [14, 'Bugis'], [15, 'Promenade'], [16, 'Bayfront'], [17, 'Downtown'],
    [18, 'Telok Ayer'], [19, 'Chinatown'], [20, 'Fort Canning'], [21, 'Bencoolen'], [22, 'Jalan Besar'], [23, 'Bendemeer'],
    [24, 'Geylang Bahru'], [25, 'Mattar'], [26, 'MacPherson'], [27, 'Ubi'], [28, 'Kaki Bukit'], [29, 'Bedok North'],
    [30, 'Bedok Reservoir'], [31, 'Tampines West'], [32, 'Tampines'], [33, 'Tampines East'], [34, 'Upper Changi'], [35, 'Expo']],
  TE: [[1, 'Woodlands North'], [2, 'Woodlands'], [3, 'Woodlands South'], [4, 'Springleaf'], [5, 'Lentor'], [6, 'Mayflower'],
    [7, 'Bright Hill'], [8, 'Upper Thomson'], [9, 'Caldecott'], [11, 'Stevens'], [12, 'Napier'], [13, 'Orchard Boulevard'],
    [14, 'Orchard'], [15, 'Great World'], [16, 'Havelock'], [17, 'Outram Park'], [18, 'Maxwell'], [19, 'Shenton Way'],
    [20, 'Marina Bay']],
}

/** Interchanges asked about, with every line that serves them (hand-checked). */
export const INTERCHANGES: Record<string, LineCode[]> = {
  'Jurong East': ['NS', 'EW'], 'City Hall': ['NS', 'EW'], 'Raffles Place': ['NS', 'EW'], 'Dhoby Ghaut': ['NS', 'NE', 'CC'],
  'Outram Park': ['EW', 'NE', 'TE'], 'Paya Lebar': ['EW', 'CC'], 'Buona Vista': ['EW', 'CC'], Serangoon: ['NE', 'CC'],
  Bishan: ['NS', 'CC'], Newton: ['NS', 'DT'], 'Little India': ['NE', 'DT'], Bugis: ['EW', 'DT'], Promenade: ['CC', 'DT'],
  Chinatown: ['NE', 'DT'], MacPherson: ['CC', 'DT'], Tampines: ['EW', 'DT'], 'Botanic Gardens': ['CC', 'DT'],
  Caldecott: ['CC', 'TE'], Stevens: ['DT', 'TE'], Orchard: ['NS', 'TE'], Woodlands: ['NS', 'TE'], HarbourFront: ['NE', 'CC'],
}
/** Single-line in this list but really on another line too (CE, CG, Expo branch). Never asked "which line". */
const NOT_SINGLE = new Set(['Bayfront', 'Expo', 'Marina Bay'])

const linesAt = (station: string) => (Object.keys(STATIONS) as LineCode[]).filter((l) => STATIONS[l].some(([, s]) => s === station))
const code = (line: LineCode, station: string) => `${line}${STATIONS[line].find(([, s]) => s === station)![0]}`
const lineList = (lines: LineCode[]) => lines.map((l) => LINES[l].name).join(', ').replace(/, ([^,]*)$/, ' & $1')

type Kind = 'next' | 'line' | 'interchange'

function nextStop(rand: () => number, used: Set<string>): QuizItem {
  for (;;) {
    const line = (Object.keys(STATIONS) as LineCode[])[Math.floor(rand() * 6)]
    const list = STATIONS[line].map(([, s]) => s)
    const forward = rand() < 0.5
    const order = forward ? list : [...list].reverse()
    const i = 1 + Math.floor(rand() * (order.length - 3)) // leave room for a station after "next"
    const [from, next, after, before] = [order[i], order[i + 1], order[i + 2], order[i - 1]]
    const towards = order[order.length - 1]
    if (used.has(from) || towards === next) continue
    used.add(from)
    const others = shuffle(list.filter((s) => ![from, next, after, before].includes(s)), rand)
    const answers = shuffle([next, before, after, others[0]], rand)
    return {
      id: `mrt-next-${line}-${from}-${forward ? 'f' : 'b'}`, cat: line,
      q: `On the ${LINES[line].name} Line, what’s the next stop after ${from}, heading towards ${towards}?`,
      answers, correct: answers.indexOf(next),
      fact: `${from} is ${code(line, from)}, then ${next} (${code(line, next)}).`,
    }
  }
}

function whichLine(rand: () => number, used: Set<string>): QuizItem {
  for (;;) {
    const line = (Object.keys(STATIONS) as LineCode[])[Math.floor(rand() * 6)]
    const [, station] = STATIONS[line][Math.floor(rand() * STATIONS[line].length)]
    if (used.has(station) || NOT_SINGLE.has(station) || linesAt(station).length !== 1) continue
    used.add(station)
    const wrong = shuffle((Object.keys(LINES) as LineCode[]).filter((l) => l !== line), rand).slice(0, 3)
    const answers = shuffle([line, ...wrong].map((l) => `${LINES[l].name} Line`), rand)
    return {
      id: `mrt-line-${station}`, cat: line, q: `Which line is ${station} on?`,
      answers, correct: answers.indexOf(`${LINES[line].name} Line`),
      fact: `${station} is ${code(line, station)} on the ${LINES[line].name} Line.`,
    }
  }
}

function interchange(rand: () => number, used: Set<string>): QuizItem {
  const names = Object.keys(INTERCHANGES)
  for (;;) {
    const station = names[Math.floor(rand() * names.length)]
    if (used.has(station)) continue
    used.add(station)
    const right = lineList(INTERCHANGES[station])
    const wrong = shuffle([...new Set(Object.values(INTERCHANGES).map(lineList))].filter((x) => x !== right), rand).slice(0, 3)
    const answers = shuffle([right, ...wrong], rand)
    return {
      id: `mrt-ix-${station}`, cat: 'MRT', q: `${station} is an interchange between which lines?`,
      answers, correct: answers.indexOf(right),
      fact: `${station}: ${INTERCHANGES[station].map((l) => code(l, station)).join(' · ')}.`,
    }
  }
}

/** The same 7 MRT questions on both phones: 3 next stops, 2 lines, 2 interchanges. */
export function mrtRound(seed: number): QuizItem[] {
  const rand = createRng(`missu:mrt:${seed}`)
  const used = new Set<string>()
  const kinds = shuffle<Kind>(['next', 'next', 'next', 'line', 'line', 'interchange', 'interchange'], rand)
  return kinds.map((k) => (k === 'next' ? nextStop(rand, used) : k === 'line' ? whichLine(rand, used) : interchange(rand, used)))
}

export const MRT_CATS: Record<string, { name: string; color: string }> = {
  ...Object.fromEntries((Object.keys(LINES) as LineCode[]).map((l) => [l, { name: `${l} line`, color: LINES[l].color }])),
  MRT: { name: 'Interchange', color: '#555c6e' },
}
