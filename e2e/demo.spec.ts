import { expect, test, type Page } from '@playwright/test'

async function hold(page: Page, ms: number) {
  const box = (await page.locator('.miss-button').boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(ms)
  await page.mouse.up()
}

test('a held heart scores 3, rallies, bursts and runs out', async ({ page }) => {
  await page.goto('/?quiet')
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
  await page.goto('/?samebrain')
  await page.getByRole('button', { name: 'Nurul' }).click()
  await expect(page.locator('.presence.on')).toBeVisible()
  await hold(page, 1200)
  await expect(page.getByRole('alert')).toContainText('SAME BRAIN')
  await expect(page.locator('.feed li').first()).toContainText('Same Brain')
})

test('fits a phone with no sideways scroll', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Aleem' }).click()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})

test('the history board keeps every week and returns to the rope', async ({ page }) => {
  await page.goto('/?quiet')
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
