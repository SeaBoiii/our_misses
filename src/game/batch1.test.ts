import { describe, expect, it } from 'vitest'
import { AGAK_CARDS } from '../content/agak'
import { CANNOT_CARDS } from '../content/cannot'
import { HEART_QUESTIONS } from '../content/hearts'
import {
  agakCard, agakScore, bannedIn, cannotDeck, cannotMisses, demoHints, guessMatches, hthOfDay, spsState, TARGET_MAX, TARGET_MIN,
} from './batch1'
import { nextDay } from './lineup'
import { blankCup, diff, kopiOrders, matches } from './kopi'

describe('Heart to Heart', () => {
  it('has the 240 our_hearts questions, each id once', () => {
    expect(HEART_QUESTIONS).toHaveLength(240)
    expect(new Set(HEART_QUESTIONS.map((q) => q.id)).size).toBe(240)
    expect(HEART_QUESTIONS.every((q) => q.id.length <= 40 && q.prompt.length > 10)).toBe(true)
  })
  it('asks a different question every day for 240 days', () => {
    let day = '2026-11-27'
    const ids = new Set<string>()
    for (let i = 0; i < 240; i++) { ids.add(hthOfDay(day).id); day = nextDay(day) }
    expect(ids.size).toBe(240)
    expect(hthOfDay('2026-11-27')).toEqual(hthOfDay('2026-11-27'))
  })
})

describe('Agak Agak', () => {
  it('scores like the database', () => {
    expect([agakScore(90, 90), agakScore(90, 93.25), agakScore(90, 93.3), agakScore(90, 99.75), agakScore(90, 106.25), agakScore(90, 106.3)]).toEqual([4, 4, 3, 3, 2, 0])
    expect([TARGET_MIN, TARGET_MAX]).toEqual([16.25, 163.75])
  })
  it('deals agak-1 to agak-99', () => {
    expect(AGAK_CARDS).toHaveLength(99)
    expect(agakCard('agak-1')).toEqual(AGAK_CARDS[0])
    expect(agakCard('agak-99')).toEqual(AGAK_CARDS[98])
  })
})

describe('Scissors-Paper-Stone', () => {
  it('hides a throw until both are in and ends at 3 wins', () => {
    expect(spsState(['stone'], [])).toMatchObject({ rounds: [], waiting: true, next: 2, over: false })
    const s = spsState(['stone', 'scissors', 'scissors', 'stone', 'paper'], ['paper', 'scissors', 'stone', 'scissors', 'scissors'])
    expect(s.rounds.map((r) => r.winner)).toEqual(['them', 'tie', 'them', 'me', 'them'])
    expect([s.mine, s.theirs, s.over]).toEqual([1, 3, true])
  })
  it('stops after 9 rounds even without a winner', () => {
    const ties = Array<'paper'>(9).fill('paper')
    expect(spsState(ties, ties).over).toBe(true)
    expect(spsState(ties.slice(0, 8), ties.slice(0, 8)).over).toBe(false)
  })
})

describe('Cannot Say!', () => {
  const rice = CANNOT_CARDS.find((c) => c.word === 'Chicken rice')!
  it('blocks the word, its parts and the banned words, even glued or plural', () => {
    expect(bannedIn('a dish from Hainan', rice)).toEqual([])
    expect(bannedIn('Hainanese classic', rice)).toEqual(['Hainanese'])
    expect(bannedIn('cluck cluck chicken', rice)).toEqual(['chicken'])
    expect(bannedIn('CHICKENRICE!', rice)).toContain('Chicken rice')
    expect(bannedIn('with cucumbers', rice)).toEqual(['cucumber'])
  })
  it('takes guesses loosely', () => {
    expect(guessMatches('chicken  RICE', rice)).toBe(true)
    expect(guessMatches('chickenrice', rice)).toBe(true)
    expect(guessMatches('chicken', rice)).toBe(false)
    expect(guessMatches('', rice)).toBe(false)
  })
  it('shuffles one deck for both phones, and never hints a banned word', () => {
    expect(cannotDeck(42).map((c) => c.id)).toEqual(cannotDeck(42).map((c) => c.id))
    expect(cannotDeck(42).map((c) => c.id)).not.toEqual(cannotDeck(43).map((c) => c.id))
    for (const card of CANNOT_CARDS) for (const hint of demoHints(card)) expect(bannedIn(hint, card), `${card.word}: ${hint}`).toEqual([])
  })
  it('pays a miss a word, 6 a round, 12 a day', () => {
    expect([cannotMisses(7, 0), cannotMisses(4, 6), cannotMisses(5, 10), cannotMisses(3, 12)]).toEqual([6, 4, 2, 0])
  })
})

describe('Kopi Rush', () => {
  it('makes the same orders on both phones', () => {
    expect(kopiOrders(7).map((o) => o.text)).toEqual(kopiOrders(7).map((o) => o.text))
    expect(kopiOrders(7)[0].text).not.toBe(undefined)
  })
  it('knows its kopitiam', () => {
    const orders = kopiOrders(2026, 400)
    for (const o of orders) {
      const cup = { ...o.recipe }
      expect(matches(o, cup)).toBe(true)
      expect(diff(o, cup)).toEqual([])
      if (/\bO\b/.test(o.text)) expect([cup.condensed, cup.evaporated]).toEqual([0, 0])
      if (/\bC\b/.test(o.text)) expect(cup.evaporated).toBe(1)
      if (o.text.includes('siew dai')) expect(cup.sugar).toBe(1)
      if (o.text.includes('kosong')) expect(cup.sugar).toBe(0)
      if (/peng|Dinosaur/.test(o.text)) expect(cup.ice).toBe(1)
      if (/tapau|da bao/.test(o.text)) expect(cup.bag).toBe(1)
    }
    const kopiO = orders.find((o) => o.text === 'Kopi O')!
    expect(diff(kopiO, { ...blankCup(), kopi: 1, condensed: 1, sugar: 2 })).toEqual(['O means no milk!'])
  })
})
