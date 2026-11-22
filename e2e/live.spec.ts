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

async function mockProject(page: Page, opts: { member?: boolean; hearts?: number; refuse?: boolean } = {}) {
  const sent: unknown[] = []
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
    if (path === '/rest/v1/rpc/our_misses_weeks') return json(route, [
      { week_start: '2026-11-16', aleem: 7, nurul: 9, aleem_misses: 4, nurul_misses: 5, same_brains: 1, longest_rally: 3 },
      { week_start: '2026-11-09', aleem: 12, nurul: 5, aleem_misses: 6, nurul_misses: 3, same_brains: 0, longest_rally: 2 },
    ])
    if (path === '/rest/v1/our_misses_events') return json(route, [])
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
  return sent
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
  expect(sent).toEqual([{ p_charge: 3, p_seen_id: 0 }])
  await expect(page.getByTestId('hearts')).toHaveAccessibleName('You have 0 of 3 hearts')
  await page.getByRole('button', { name: 'sign out' }).click()
  await expect(page.getByRole('button', { name: 'Grab the rope' })).toBeVisible()
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
