// The real Supabase code path against a mocked project: sign-in, RPC names and arguments,
// and how database errors reach the screen. No request leaves the browser.
import { expect, test, type Page, type Route } from '@playwright/test'

const API = 'https://mock.supabase.test'
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
const exp = Math.floor(Date.now() / 1000) + 3600
const uid = '11111111-1111-4111-8111-111111111111'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: uid, role: 'authenticated', exp })}.sig`
const user = { id: uid, aud: 'authenticated', role: 'authenticated', email: 'aleem@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-11-01T00:00:00Z' }

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

async function mockProject(page: Page, opts: { member?: boolean; hearts?: number; refuse?: boolean; lineup?: unknown } = {}) {
  const sent: unknown[] = []
  const proveCalls: { fn: string; body: unknown }[] = []
  let mine: Record<string, unknown> | null = null
  let hthMine: { question: string; answer: string } | null = null
  let agakNeedle: number | null = null
  let doodleMine: { prompt: string; strokes: unknown } | null = null
  let hearts = opts.hearts ?? 3
  const now = () => new Date().toISOString()
  const heartsOf = () => ({ hearts, next_at: hearts < 3 ? new Date(Date.now() + 1_800_000).toISOString() : null })
  const status = () => ({ me: 'Aleem', now: now(), week_start: '2026-11-23', hearts: { Aleem: heartsOf(), Nurul: { hearts: 3, next_at: null } } })
  await page.route(`${API}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === '/auth/v1/token') {
      const body = route.request().postDataJSON()
      if (body.password !== 'right-password') return json(route, { code: 'invalid_credentials', error_code: 'invalid_credentials', msg: 'Invalid login credentials' }, 400)
      return json(route, { access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'refresh', user })
    }
    if (path === '/auth/v1/logout') return route.fulfill({ status: 204 })
    if (opts.member === false && path.startsWith('/rest/')) return json(route, { code: '42501', message: 'not a member', details: null, hint: null }, 403)
    if (path === '/rest/v1/rpc/our_misses_status') return json(route, status())
    if (path === '/rest/v1/rpc/our_misses_lineup' && opts.lineup) return json(route, opts.lineup)
    if (path === '/rest/v1/rpc/our_misses_weeks') return json(route, [
      { week_start: '2026-11-16', aleem: 7, nurul: 9, aleem_misses: 4, nurul_misses: 5, same_brains: 1, longest_rally: 3, aleem_proven: 2, nurul_proven: 3, aleem_bluffs: 1, nurul_bluffs: 0, aleem_duels: 1, nurul_duels: 0 },
      { week_start: '2026-11-09', aleem: 12, nurul: 5, aleem_misses: 6, nurul_misses: 3, same_brains: 0, longest_rally: 2, aleem_proven: 0, nurul_proven: 0, aleem_bluffs: 0, nurul_bluffs: 0, aleem_duels: 0, nurul_duels: 0 },
    ])
    if (path === '/rest/v1/our_misses_events') return json(route, [])
    if (path === '/rest/v1/rpc/our_misses_reasons') return json(route, [{ player: 'Aleem', reason: 1, n: 4 }, { player: 'Nurul', reason: 9, n: 2 }])
    if (path === '/rest/v1/rpc/our_misses_tag') {
      const body = route.request().postDataJSON()
      proveCalls.push({ fn: 'tag', body })
      return json(route, { id: body.p_id, player: 'Aleem', kind: 'miss', charge: 1, rally_length: 1, rally_bonus: 0, points: 1, ref_id: null, created_at: now(), reason: body.p_reason })
    }
    const totDay = new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10)
    if (path === '/rest/v1/rpc/our_misses_tot_today') return json(route, { now: now(), day: totDay, today: { day: totDay, revealed: false, Aleem: null, Nurul: null } })
    if (path === '/rest/v1/rpc/our_misses_tot_album') return json(route, [])
    if (path === '/rest/v1/rpc/our_misses_tot_answer') {
      const body = route.request().postDataJSON()
      proveCalls.push({ fn: 'tot', body })
      return json(route, { now: now(), day: totDay, today: { day: totDay, revealed: false, Aleem: { question: body.p_question, mine: body.p_mine, guess: body.p_guess }, Nurul: null } })
    }
    const today = new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10)
    const proveStatus = () => ({ now: now(), day: today, today: { day: today, revealed: false, Aleem: mine, Nurul: null }, last: null })
    if (path === '/rest/v1/rpc/our_misses_prove_today') return json(route, proveStatus())
    if (path === '/rest/v1/rpc/our_misses_prove_start') {
      const body = route.request().postDataJSON()
      proveCalls.push({ fn: 'start', body })
      mine = { finished: false, level: body.p_level, target: 6, score: null, passed: null, started_at: now() }
      return json(route, { level: body.p_level, target: 6, started_at: now() })
    }
    if (path === '/rest/v1/rpc/our_misses_prove_finish') {
      const body = route.request().postDataJSON()
      proveCalls.push({ fn: 'finish', body })
      mine = { ...mine, finished: true, score: body.p_score, passed: body.p_score >= 6 }
      return json(route, proveStatus())
    }
    // Like the database, these remember what was sent: the screens re-read them right after.
    const hthDay = () => ({ now: now(), day: today, today: { day: today, revealed: false, Aleem: hthMine, Nurul: { answered: true } } })
    if (path === '/rest/v1/rpc/our_misses_hth_today') return json(route, hthDay())
    if (path === '/rest/v1/rpc/our_misses_hth_album') return json(route, [])
    if (path === '/rest/v1/rpc/our_misses_hth_answer') {
      const body = route.request().postDataJSON()
      proveCalls.push({ fn: 'hth', body })
      hthMine = { question: body.p_question, answer: body.p_answer.trim() }
      return json(route, hthDay())
    }
    const doodleDay = () => ({ now: now(), day: today, today: { day: today, revealed: false, Aleem: doodleMine, Nurul: null } })
    if (path === '/rest/v1/rpc/our_misses_doodle_today') return json(route, doodleDay())
    if (path === '/rest/v1/rpc/our_misses_doodle_album') return json(route, [])
    if (path === '/rest/v1/rpc/our_misses_doodle_submit') {
      const body = route.request().postDataJSON()
      proveCalls.push({ fn: 'doodle', body })
      doodleMine = { prompt: body.p_prompt, strokes: body.p_strokes }
      return json(route, doodleDay())
    }
    const agakRound = () => ({
      day: today, psychic: 'Nurul', card: 'agak-1', clue: 'char kway teow at midnight', needle: agakNeedle,
      score: agakNeedle === null ? null : 3, target: agakNeedle === null ? null : 50,
    })
    if (path === '/rest/v1/rpc/our_misses_agak_today') return json(route, { now: now(), day: today, today: agakRound(), last: null })
    if (path === '/rest/v1/rpc/our_misses_agak_guess') {
      const body = route.request().postDataJSON()
      proveCalls.push({ fn: 'agak', body })
      agakNeedle = body.p_needle
      return json(route, { now: now(), day: today, today: agakRound(), last: null })
    }
    if (path === '/rest/v1/rpc/our_misses_send') {
      const body = route.request().postDataJSON()
      sent.push(body)
      if (hearts < 1 || opts.refuse) return json(route, { code: 'P0001', message: 'no hearts left', details: null, hint: new Date(Date.now() + 600_000).toISOString() }, 400)
      hearts--
      const event = { id: sent.length, player: 'Aleem', kind: 'miss', charge: body.p_charge, rally_length: 1, rally_bonus: 0, points: body.p_charge, ref_id: null, created_at: now() }
      return json(route, { events: [event], hearts: heartsOf(), now: now() })
    }
    return route.fulfill({ status: 404 })
  })
  return Object.assign(sent, { proveCalls })
}

async function hold(page: Page, ms: number) {
  const box = (await page.locator('.miss-button').boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(ms)
  await page.mouse.up()
}

async function signIn(page: Page, password = 'right-password') {
  await page.goto('/')
  await page.getByLabel('Email').fill('aleem@example.test')
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Grab the rope' }).click()
}

test('signs in, sends a miss through the RPC and shows last season', async ({ page }) => {
  const sent = await mockProject(page, { hearts: 1 })
  await signIn(page, 'wrong')
  await expect(page.getByRole('alert')).toHaveText('That email and password don’t match.')
  await signIn(page)
  await expect(page.getByTestId('score-Aleem')).toHaveText('0')
  await expect(page.locator('.banner')).toContainText('Last week 🏆 Nurul missed more, 9–7')
  await expect(page.locator('.score-nurul')).toContainText('🏆1')
  await hold(page, 1900)
  await expect(page.getByTestId('score-Aleem')).toHaveText('3')
  expect([...sent]).toEqual([{ p_charge: 3, p_seen_id: 0 }])
  await expect(page.getByTestId('hearts')).toHaveAccessibleName('You have 0 of 3 hearts')
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('button', { name: /Sign out of this phone/ }).click()
  await expect(page.getByRole('button', { name: 'Grab the rope' })).toBeVisible()
  await expect(page.getByLabel('Email')).toHaveValue('aleem@example.test')
})

test('the database refusing a send shows a friendly toast', async ({ page }) => {
  // The screen still thinks there are hearts (say, the other phone spent them); the database decides.
  await mockProject(page, { refuse: true })
  await signIn(page)
  await expect(page.getByTestId('hearts')).toHaveAccessibleName('You have 3 of 3 hearts')
  await hold(page, 100)
  await expect(page.locator('.toast').filter({ hasText: 'Out of hearts' })).toBeVisible()
})

test('a third account is turned away', async ({ page }) => {
  await mockProject(page, { member: false })
  await signIn(page)
  await expect(page.getByRole('alert')).toHaveText('This account is not one of the two players.')
})

test('the last-week banner opens the history board from the database', async ({ page }) => {
  await mockProject(page)
  await signIn(page)
  await page.getByRole('button', { name: /Last week/ }).click()
  const weeks = page.getByTestId('week')
  await expect(weeks).toHaveCount(3)
  await expect(weeks.nth(0)).toContainText('Just started')
  await expect(weeks.nth(1)).toContainText('🏆 Nurul missed more')
  await expect(weeks.nth(1)).toContainText('♥ 4 vs 5 misses')
  await expect(weeks.nth(1)).toContainText('🧠 1 Same Brain')
  await expect(weeks.nth(2)).toContainText('🏆 You missed more')
  await expect(page.getByTestId('trophies-Aleem')).toHaveText('🏆 1')
  await expect(page.getByTestId('trophies-Nurul')).toHaveText('🏆 1')
  await page.getByRole('button', { name: '← back to the rope' }).click()
  await expect(page.locator('.rope')).toBeVisible()
})

test('Prove It goes through the database: claim locked in first, then the score', async ({ page }) => {
  test.setTimeout(90_000)
  const mock = await mockProject(page)
  await signIn(page)
  await page.getByTestId('open-prove').click()
  await page.getByRole('radio', { name: /a kaya toast crumb/ }).click()
  await page.getByRole('button', { name: /^Lock in/ }).click()
  await expect(page.getByTestId('catch-hud')).toBeVisible()
  expect(mock.proveCalls).toEqual([{ fn: 'start', body: { p_level: 1 } }])
  await expect(page.getByTestId('prove-mine')).toBeVisible({ timeout: 40_000 })
  expect(mock.proveCalls[1]).toMatchObject({ fn: 'finish', body: { p_score: expect.any(Number) } })
  await expect(page.getByTestId('prove-mine')).toContainText(/PROVEN|BLUFF/)
})

test('the history board shows Prove It and Duel stats', async ({ page }) => {
  await mockProject(page)
  await signIn(page)
  await page.getByRole('button', { name: 'History' }).click()
  const week = page.getByTestId('week').nth(1)
  await expect(week).toContainText('🔍 2 vs 3 proven')
  await expect(week).toContainText('🤥 bluffs 1–0')
  await expect(week).toContainText('⚔️ versus 1–0')
  await expect(page.getByTestId('why-board')).toContainText('a song came on ×4')
  await expect(page.getByTestId('why-board')).toContainText('can’t sleep ×2')
})

test('once signed in, reopening the app goes straight to the rope', async ({ page }) => {
  await mockProject(page)
  await signIn(page)
  await expect(page.getByTestId('score-Aleem')).toBeVisible()
  await page.reload()
  await expect(page.getByTestId('score-Aleem')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Grab the rope' })).toHaveCount(0)
})

test('the sign-in screen explains how to install it on an iPhone first', async ({ page }) => {
  await mockProject(page)
  await page.goto('/')
  await expect(page.getByTestId('install')).toContainText('Add to Home Screen')
  await expect(page.getByTestId('install')).toContainText('sign in there once')
})

test('Why and This or That go through the database with the right values', async ({ page }) => {
  const mock = await mockProject(page)
  await signIn(page)
  await hold(page, 100)
  await page.getByTestId('why-9').click()
  await expect.poll(() => mock.proveCalls.find((c) => c.fn === 'tag')?.body).toEqual({ p_id: 1, p_reason: 9 })
  await expect(page.locator('.feed li').first()).toContainText('🌙 can’t sleep')
  await page.getByTestId('open-tot').click()
  await page.getByTestId('tot-1').click()
  await page.getByTestId('tot-0').click()
  await expect(page.getByTestId('tot-waiting')).toContainText('hasn’t answered yet')
  const body = mock.proveCalls.find((c) => c.fn === 'tot')?.body as { p_question: string; p_mine: number; p_guess: number }
  expect([body.p_mine, body.p_guess]).toEqual([1, 0])
  expect(body.p_question).toMatch(/^tot-\d+$/)
})

test('the Today card follows the database’s daily lineup', async ({ page }) => {
  await mockProject(page, {
    lineup: {
      today: { day: '2026-11-24', daily: 'tot', play: ['pour', 'mrt', 'chapteh'] },
      tomorrow: { day: '2026-11-25', daily: 'prove', play: ['tug', 'pour', 'quiz'] },
    },
  })
  await signIn(page)
  await expect(page.getByTestId('open-tot')).toBeVisible()
  await expect(page.getByTestId('open-prove')).toHaveCount(0)
  await expect(page.getByTestId('today-games')).toHaveText(/Pour-off.*Next Stop.*Chapteh/)
  await expect(page.getByTestId('teaser')).toHaveText('Tomorrow: 🔍 Prove It · 🪢 🧪 🧠')
})

test('Heart to Heart and Agak Agak go through their RPCs', async ({ page }) => {
  const mock = await mockProject(page, {
    lineup: {
      today: { day: '2026-11-27', daily: 'hth', play: ['kopi', 'sps', 'tug', 'cannot'] },
      tomorrow: { day: '2026-11-28', daily: 'agak', play: ['pour', 'mrt', 'quiz', 'chapteh'] },
    },
  })
  await signIn(page)
  await expect(page.getByTestId('today-games')).toHaveText(/Tug of war.*Kopi Rush.*Scissors-Paper-Stone.*Cannot Say!/)
  await expect(page.getByTestId('teaser')).toHaveText('Tomorrow: 🎯 Agak Agak · 🧪 🚇 🧠 🪶')
  await page.getByTestId('open-hth').click()
  await expect(page.getByTestId('hth-input')).toBeVisible()
  await expect(page.locator('.hth-card')).toContainText('Nurul has already answered')
  await page.getByTestId('hth-input').fill('  Your voice notes.  ')
  await page.getByTestId('hth-send').click()
  await expect(page.getByTestId('hth-waiting')).toContainText('Your voice notes.')
  const hth = mock.proveCalls.find((c) => c.fn === 'hth')?.body as { p_question: string; p_answer: string }
  expect(hth.p_question).toMatch(/^(laughs|know|story|closer|life|us)-\d\d$/)
  expect(hth.p_answer).toBe('  Your voice notes.  ') // the database trims
  // Agak Agak is still reachable by its address on another day; the database decides.
  await page.goto('/#agak')
  await expect(page.getByTestId('agak-their-clue')).toContainText('char kway teow at midnight')
  await page.getByTestId('agak-needle').fill('47.5')
  await page.getByTestId('agak-lock').click()
  await expect(page.getByTestId('agak-reveal')).toContainText('So close!')
  expect(mock.proveCalls.find((c) => c.fn === 'agak')?.body).toEqual({ p_needle: 47.5 })
})

test('Doodle Day sends its strokes as JSON', async ({ page }) => {
  const mock = await mockProject(page, {
    lineup: {
      today: { day: '2026-11-29', daily: 'doodle', play: ['mrt', 'sps', 'pour', 'chapteh'] },
      tomorrow: { day: '2026-11-30', daily: 'tot', play: ['kopi', 'quiz', 'chope', 'sync'] },
    },
  })
  await signIn(page)
  await expect(page.getByTestId('teaser')).toHaveText('Tomorrow: 🤔 This or That · ☕ 🧠 🧻 🥁')
  await page.getByTestId('open-doodle').click()
  await page.getByTestId('doodle-start').click()
  const box = (await page.getByTestId('drawpad').boundingBox())!
  await page.mouse.move(box.x + 40, box.y + 40)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width - 40, box.y + box.height - 40, { steps: 8 })
  await page.mouse.up()
  await page.getByTestId('doodle-send').click()
  await expect(page.getByTestId('doodle-waiting')).toContainText('hasn’t drawn yet')
  const body = mock.proveCalls.find((c) => c.fn === 'doodle')?.body as { p_prompt: string; p_strokes: { c: number; w: number; p: number[] }[] }
  expect(body.p_prompt).toMatch(/^doodle-\d\d$/)
  expect(body.p_strokes).toHaveLength(1)
  expect(body.p_strokes[0].p.length).toBeGreaterThanOrEqual(4)
  expect(body.p_strokes[0].p.every((v) => Number.isInteger(v) && v >= 0 && v <= 1000)).toBe(true)
})
