import { expect, test, type Page } from '@playwright/test'

async function hold(page: Page, ms: number) {
  const box = (await page.locator('.miss-button').boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(ms)
  await page.mouse.up()
}

test('a held heart scores 3, rallies, bursts and runs out', async ({ page }) => {
  await page.goto('/?quiet&allgames')
  await page.getByRole('button', { name: 'Aleem' }).click()
  await expect(page.getByTestId('score-Aleem')).toHaveText('0')
  await expect(page.getByTestId('hearts')).toHaveAccessibleName('You have 3 of 3 hearts')

  await hold(page, 1900)
  await expect(page.getByTestId('score-Aleem')).toHaveText('3')
  await expect(page.getByTestId('hearts')).toHaveAccessibleName('You have 2 of 3 hearts')
  await expect(page.locator('.feed li').first()).toContainText('You ♥♥♥')
  await expect(page.getByTestId('rally')).toBeVisible()

  await hold(page, 3300)
  await expect(page.locator('.toast').filter({ hasText: 'too much' })).toBeVisible()
  await hold(page, 100)
  await expect(page.getByTestId('hearts')).toHaveAccessibleName('You have 0 of 3 hearts')
  await expect(page.locator('.miss-hint')).toContainText('out of hearts')
  await hold(page, 100)
  await expect(page.locator('.toast').filter({ hasText: 'Out of hearts' })).toBeVisible()

  await page.getByRole('button', { name: 'refill my hearts (demo)' }).click()
  await expect(page.getByTestId('hearts')).toHaveAccessibleName('You have 3 of 3 hearts')
})

test('missing each other at the same moment is a Same Brain', async ({ page }) => {
  await page.goto('/?samebrain&allgames')
  await page.getByRole('button', { name: 'Nurul' }).click()
  await expect(page.locator('.presence.on')).toBeVisible()
  await hold(page, 1200)
  await expect(page.getByRole('alert')).toContainText('SAME BRAIN')
  await expect(page.locator('.feed li').first()).toContainText('Same Brain')
})

test('fits a phone with no sideways scroll', async ({ page }) => {
  await page.goto('/?allgames')
  await page.getByRole('button', { name: 'Aleem' }).click()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})

test('the history board keeps every week and returns to the rope', async ({ page }) => {
  await page.goto('/?quiet&allgames')
  await page.getByRole('button', { name: 'Aleem' }).click()
  await hold(page, 100)
  await expect(page.getByTestId('score-Aleem')).toHaveText('1')
  await page.getByRole('button', { name: 'History' }).click()
  await expect(page.getByRole('heading', { name: 'History' })).toBeVisible()
  const weeks = page.getByTestId('week')
  await expect(weeks).toHaveCount(6) // this week + five pretend past seasons
  await expect(weeks.first()).toContainText('this week')
  await expect(weeks.first()).toContainText('You leading so far')
  await expect(weeks.first()).toContainText('♥ 1 vs 0 misses')
  await page.goBack()
  await expect(page.locator('.rope')).toBeVisible()
})

test('Prove It: claim, play the 20-second round, and get stamped', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/?quiet&allgames')
  await page.getByRole('button', { name: 'Aleem' }).click()
  await page.getByTestId('open-prove').click()
  await expect(page.getByText('How much did you miss Nurul today?')).toBeVisible()
  await page.getByRole('radio', { name: /Kallang River/ }).click()
  await page.getByRole('button', { name: 'Lock in Kallang River and play' }).click()
  await expect(page.getByTestId('countdown')).toBeVisible()
  await expect(page.getByTestId('catch-hud')).toBeVisible()
  // Standing still can't catch 18, so this round is a bluff.
  await expect(page.getByTestId('prove-mine')).toBeVisible({ timeout: 40_000 })
  await expect(page.getByTestId('prove-mine')).toContainText('Kallang River')
  await expect(page.getByTestId('prove-mine')).toContainText('BLUFF DETECTED')
  await expect(page.locator('.prove-card.waiting')).toContainText('hasn’t played yet')
  await page.getByRole('button', { name: '← back to the rope' }).click()
  await expect(page.getByTestId('open-prove')).toContainText('bluff 🤥 · waiting for Nurul')
  // One try a day.
  await page.getByTestId('open-prove').click()
  await expect(page.getByRole('radio')).toHaveCount(0)
})

test('Duel: challenge, tap, win the day’s +5', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/?quiet&allgames')
  await page.getByRole('button', { name: 'Aleem' }).click()
  await expect(page.locator('.presence.on')).toBeVisible()
  await page.getByTestId('open-duel').click()
  await page.getByTestId('vs-tug').click()
  await expect(page.getByRole('dialog')).toContainText('Challenge sent')
  await expect(page.getByTestId('duel-countdown')).toBeVisible()
  const tap = page.getByTestId('tap')
  await expect(tap).toBeVisible({ timeout: 8_000 })
  const box = (await tap.boundingBox())!
  for (let i = 0; i < 90; i++) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.up()
    await page.waitForTimeout(60)
  }
  await expect(page.getByTestId('duel-result')).toHaveText('You win! +5 misses', { timeout: 20_000 })
  await page.getByRole('button', { name: 'Back to the rope' }).click()
  await expect(page.getByTestId('score-Aleem')).toHaveText('5')
  await expect(page.locator('.feed li').first()).toContainText('⚔️ You won VS +5')
  await expect(page.getByTestId('open-duel')).toContainText('today’s +5 went to you')
})

test('Duel: answering a challenge', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/?quiet&duelme&allgames')
  await page.getByRole('button', { name: 'Nurul' }).click()
  await expect(page.getByRole('dialog')).toContainText('Aleem challenges you!')
  await page.getByRole('button', { name: 'I’m in' }).click()
  await expect(page.getByTestId('tap')).toBeVisible({ timeout: 8_000 })
  await expect(page.getByTestId('duel-result')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('duel-result')).toContainText('Aleem wins! +5 misses')
})

async function playRace(page: import('@playwright/test').Page) {
  await expect(page.getByTestId('pour-board')).toBeVisible({ timeout: 10_000 })
  await page.waitForTimeout(8_500) // a believable solve takes at least 8 seconds
  const moves = await page.evaluate(() => (window as unknown as { __missuPour: { from: number; to: number }[] }).__missuPour)
  for (const m of moves) {
    await page.getByTestId(`bottle-${m.from}`).click()
    await page.getByTestId(`bottle-${m.to}`).click()
  }
}

test('Pour-off: sort every colour first and win the race', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/?quiet&allgames')
  await page.getByRole('button', { name: 'Aleem' }).click()
  await expect(page.locator('.presence.on')).toBeVisible()
  await page.getByTestId('open-duel').click()
  await page.getByTestId('vs-pour').click()
  await expect(page.getByRole('dialog')).toContainText('Waiting for Nurul to accept Pour-off')
  await playRace(page)
  await expect(page.getByTestId('duel-result')).toHaveText('You win! +5 misses', { timeout: 20_000 })
  await expect(page.locator('.race-scores')).toContainText(/You solved in \d/)
  await expect(page.locator('.race-scores')).toContainText(/Nurul \d bottles?/)
  await page.getByRole('button', { name: 'Back to the rope' }).click()
  await expect(page.getByTestId('score-Aleem')).toHaveText('5')
})

test('Pour-off: when she solves first, your round ends and she wins', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/?quiet&pourme&fastbot&allgames')
  await page.getByRole('button', { name: 'Nurul' }).click()
  await expect(page.getByRole('dialog')).toContainText('Aleem challenges you!')
  await expect(page.getByRole('dialog')).toContainText('Pour-off')
  await page.getByRole('button', { name: 'I’m in' }).click()
  await expect(page.getByTestId('pour-board')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId('race-alert')).toHaveText('🏁 Aleem solved it first!', { timeout: 20_000 })
  await expect(page.getByTestId('duel-result')).toHaveText('Aleem wins! +5 misses', { timeout: 15_000 })
})

test('the menu keeps sign-out out of the way, and the counter is front and centre', async ({ page }) => {
  await page.goto('/?quiet&allgames')
  await page.getByRole('button', { name: 'Aleem' }).click()
  await expect(page.getByTestId('counter')).toContainText('misses between you, all time')
  await expect(page.getByRole('button', { name: /switch|sign out/i })).toHaveCount(0)
  await page.getByRole('button', { name: 'Menu' }).click()
  await expect(page.getByRole('dialog', { name: 'Menu' })).toContainText('You’re signed in as Aleem (demo)')
  // Playwright's phone is an iPhone, so it gets the Safari steps.
  await expect(page.getByRole('dialog', { name: 'Menu' })).toContainText('Add to Home Screen')
  await expect(page.getByRole('button', { name: /Switch player/ })).toBeVisible()
})
