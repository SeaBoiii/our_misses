// Kopi Rush: the drinks rules from Kopi Master (sg_games/games/kopi-master/js/engine.js),
// cut down to one customer at a time. Both phones make the same orders from one seed.
//   Kopi / Teh / Milo            base (Yuan Yang = kopi + teh)
//   (plain) / C / O              condensed milk / evaporated milk / no milk
//   siew dai / (normal) / ka dai / kosong   1 / 2 / 3 / 0 spoons of sugar
//   gau / po                     double shot / add hot water
//   peng                         add ice
//   tarik                        pull the teh (teh tarik)
//   tapau / da bao               takeaway bag

export const INGREDIENTS = ['kopi', 'teh', 'milo', 'condensed', 'evaporated', 'sugar', 'ice', 'water', 'tarik', 'bag'] as const
export type Ingredient = (typeof INGREDIENTS)[number]
export type Cup = Record<Ingredient, number>
export const ING_LABEL: Record<Ingredient, string> = {
  kopi: 'Kopi', teh: 'Teh', milo: 'Milo', condensed: 'Condensed', evaporated: 'Evaporated',
  sugar: 'Sugar', ice: 'Ice', water: 'Hot water', tarik: 'Tarik', bag: 'Tapau bag',
}
export const ING_ICON: Record<Ingredient, string> = {
  kopi: '☕', teh: '🍵', milo: '🍫', condensed: '🥫', evaporated: '🥛', sugar: '🍬', ice: '🧊', water: '💧', tarik: '🫗', bag: '🛍️',
}
export const MAX_COUNT: Cup = { kopi: 2, teh: 2, milo: 2, condensed: 1, evaporated: 1, sugar: 4, ice: 1, water: 1, tarik: 1, bag: 1 }
export const KOPI_MAX = 40

export interface KopiOrder {
  text: string
  recipe: Cup
  base: 'kopi' | 'teh' | 'milo' | 'yuanyang'
  milk: 'plain' | 'C' | 'O'
  special: 'tarik' | 'yuanyang' | 'dinosaur' | null
}

/** xorshift, as in Kopi Master. */
export function rng(seed: number) {
  let x = seed >>> 0 || 1
  return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 1e9) / 1e9 }
}
const pick = <T,>(rand: () => number, arr: readonly T[]) => arr[Math.floor(rand() * arr.length)]
export const blankCup = (): Cup => Object.fromEntries(INGREDIENTS.map((k) => [k, 0])) as Cup

/** One order, with everything from Kopi Master's supper shift (the specials come up less). */
export function makeOrder(rand: () => number): KopiOrder {
  const r = blankCup()
  let special: KopiOrder['special'] = null
  if (rand() < 0.2) special = pick(rand, ['tarik', 'yuanyang', 'dinosaur'] as const)
  const base: KopiOrder['base'] = special === 'tarik' ? 'teh' : special === 'dinosaur' ? 'milo' : special === 'yuanyang' ? 'yuanyang' : pick(rand, ['kopi', 'teh', 'milo'] as const)
  let milk: KopiOrder['milk'] = 'plain'
  if (!special && base !== 'milo') { const m = rand(); milk = m < 0.4 ? 'plain' : m < 0.7 ? 'C' : 'O' }
  let strength = ''
  if (!special && base !== 'milo' && rand() < 0.22) strength = rand() < 0.5 ? 'gau' : 'po'
  let sugar = 2
  if (special !== 'dinosaur') {
    const s = rand()
    if (s < 0.25) sugar = 1
    else if (s < 0.4) sugar = 3
    else if (s < 0.55 && milk !== 'plain') sugar = 0
  }
  const peng = special === 'dinosaur' ? true : special !== 'tarik' && rand() < 0.4
  const tapau = rand() < 0.2

  if (base === 'yuanyang') { r.kopi = 1; r.teh = 1 } else r[base] = strength === 'gau' ? 2 : 1
  if (special === 'dinosaur') r.milo = 2
  if (milk === 'plain') r.condensed = 1
  else if (milk === 'C') r.evaporated = 1
  if (strength === 'po') r.water = 1
  r.sugar = sugar
  if (peng) r.ice = 1
  if (special === 'tarik') r.tarik = 1
  if (tapau) r.bag = 1

  const words: string[] = []
  if (special === 'tarik') words.push('Teh Tarik')
  else if (special === 'dinosaur') words.push('Milo Dinosaur')
  else words.push({ kopi: 'Kopi', teh: 'Teh', milo: 'Milo', yuanyang: 'Yuan Yang' }[base])
  if (milk !== 'plain') words.push(milk)
  if (strength) words.push(strength)
  if (special !== 'dinosaur') {
    if (sugar === 1) words.push('siew dai')
    else if (sugar === 3) words.push('ka dai')
    else if (sugar === 0) words.push('kosong')
  }
  if (peng && special !== 'dinosaur') words.push('peng')
  if (tapau) words.push(rand() < 0.5 ? 'tapau' : 'da bao')
  return { text: words.join(' '), recipe: r, base, milk, special }
}

/** The same 60 orders on both phones (nobody serves 60 in a minute). */
export function kopiOrders(seed: number, n = 60): KopiOrder[] {
  const rand = rng(seed)
  return Array.from({ length: n }, () => makeOrder(rand))
}

export const matches = (order: KopiOrder, cup: Cup) => INGREDIENTS.every((k) => order.recipe[k] === cup[k])

/** How a drink differs from the order, in auntie-speak (from Kopi Master). */
export function diff(order: KopiOrder, cup: Cup): string[] {
  const r = order.recipe
  const out: string[] = []
  const bases = ['kopi', 'teh', 'milo'] as const
  if (bases.some((b) => (r[b] > 0) !== (cup[b] > 0))) out.push(`I said ${order.base === 'yuanyang' ? 'yuan yang (kopi + teh)' : order.base === 'milo' ? 'Milo' : order.base}!`)
  else if (bases.some((b) => r[b] !== cup[b])) out.push(r.kopi === 2 || r.teh === 2 ? 'Gau means double shot leh.' : r.milo === 2 ? 'Dinosaur needs extra Milo on top!' : 'Too strong lah, just one shot.')
  if (r.condensed !== cup.condensed || r.evaporated !== cup.evaporated) {
    out.push(order.milk === 'O' ? 'O means no milk!' : order.milk === 'C' ? 'C means evaporated milk.' : 'Plain kopi/teh got condensed milk one.')
  }
  if (r.sugar !== cup.sugar) out.push(r.sugar === 0 ? 'Kosong means no sugar!' : `${({ 1: 'Siew dai (1 sugar)', 2: 'Normal (2 sugar)', 3: 'Ka dai (3 sugar)' } as Record<number, string>)[r.sugar]}, you gave ${cup.sugar}.`)
  if (r.ice !== cup.ice) out.push(r.ice ? 'Peng means got ice!' : 'I want hot, not peng!')
  if (r.water !== cup.water) out.push(r.water ? 'Po means add hot water.' : 'Why so diluted?')
  if (r.tarik !== cup.tarik) out.push(r.tarik ? 'Teh tarik must pull one!' : 'No need to tarik.')
  if (r.bag !== cup.bag) out.push(r.bag ? 'Tapau leh, I take away!' : 'I drink here, no need bag.')
  return out
}

export const GLOSSARY: [string, string][] = [
  ['Kopi / Teh', 'Coffee / tea, with condensed milk'],
  ['O', 'No milk'],
  ['C', 'Evaporated milk instead'],
  ['Siew dai', '1 sugar'],
  ['(normal)', '2 sugar'],
  ['Ka dai', '3 sugar'],
  ['Kosong', 'No sugar'],
  ['Peng', 'Add ice'],
  ['Gau', 'Double shot'],
  ['Po', 'Add hot water'],
  ['Tapau / da bao', 'Bag it'],
  ['Teh Tarik', 'Teh, condensed, then tarik'],
  ['Yuan Yang', 'Kopi + teh, condensed'],
  ['Milo Dinosaur', '2 Milo, condensed, ice'],
]
