// Phase 3 in the demo: Why, This or That, Hold hands, Kiasu Quiz, Next Stop and Chapteh.
import { expect, test, type Page } from '@playwright/test'

async function start(page: Page, query = '?quiet', who: 'Aleem' | 'Nurul' = 'Aleem') {
  await page.goto(`/${query}${query.includes('lineupday') ? '' : '&allgames'}`)
  await page.getByRole('button', { name: who }).click()
  await expect(page.locator('.presence.on')).toBeVisible()
}

async function tapMiss(page: Page) {
  const box = (await page.locator('.miss-button').boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(100)
  await page.mouse.up()
}

async function answerAll(page: Page) {
  for (let q = 0; q < 7; q++) {
    await expect(page.getByTestId('quiz')).toContainText(`Q${q + 1}/7`, { timeout: 10_000 })
    const right = await page.evaluate((i) => (window as unknown as { __missuQuiz: number[] }).__missuQuiz[i], q)
    await page.getByTestId(`answer-${right}`).click()
  }
}

test('Why: tag a miss and it shows in the feed and on the history board', async ({ page }) => {
  await start(page)
  await tapMiss(page)
  await page.getByTestId('why-1').click()
  await expect(page.locator('.feed li').first()).toContainText('🎵 a song came on')
  await expect(page.getByTestId('why')).toHaveCount(0)
  await page.getByRole('button', { name: 'History' }).click()
  await expect(page.getByTestId('why-board')).toContainText('a song came on ×1')
})

test('This or That: pick yours, guess theirs, see both', async ({ page }) => {
  await start(page)
  await page.getByTestId('open-tot').click()
  await page.getByTestId('tot-0').click()
  await expect(page.locator('.tot-step')).toContainText('Guess their pick')
  await page.getByTestId('tot-1').click()
  await expect(page.getByTestId('tot-reveal')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId('tot-reveal')).toContainText('Nurul picked')
  await page.getByRole('button', { name: '← back to the rope' }).click()
  await expect(page.getByTestId('open-tot')).toContainText('results are in')
})

test('Hold hands: both thumbs down for 20 seconds is a miss each', async ({ page }) => {
  test.setTimeout(60_000)
  await start(page)
  await page.getByTestId('open-hands').click()
  await expect(page.getByTestId('hands-status')).toContainText('Nurul is here')
  const box = (await page.getByTestId('hands-pad').boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await expect(page.getByTestId('hands-status')).toHaveText('Holding hands with Nurul')
  await page.waitForTimeout(21_500)
  await page.mouse.up()
  await expect(page.locator('.toast').filter({ hasText: '+1 miss for holding hands' })).toBeVisible()
  await page.getByRole('button', { name: 'Let go' }).click()
  await expect(page.locator('.feed li').first()).toContainText('🤝 You held hands +1')
})

test('Hold hands: an invite from her phone', async ({ page }) => {
  await start(page, '?quiet&handsme', 'Nurul')
  await expect(page.getByTestId('hands-nudge')).toContainText('Aleem wants to hold hands')
  await page.getByTestId('hands-nudge').getByRole('button', { name: 'Hold hands' }).click()
  await expect(page.getByTestId('hands-status')).toBeVisible()
})

test('Kiasu Quiz: answer all 7 right and win the day’s +5', async ({ page }) => {
  test.setTimeout(90_000)
  await start(page)
  await page.getByTestId('open-duel').click()
  await page.getByTestId('vs-quiz').click()
  await expect(page.getByTestId('quiz')).toBeVisible({ timeout: 12_000 })
  await answerAll(page)
  await expect(page.getByTestId('duel-result')).toHaveText('You win! +5 misses', { timeout: 40_000 })
  await expect(page.locator('.race-scores')).toContainText(/You \d+ pts/)
})

test('Next Stop: the MRT quiz starts with the clock running, and plays through', async ({ page }) => {
  test.setTimeout(90_000)
  await start(page)
  await page.getByTestId('open-duel').click()
  await page.getByTestId('vs-mrt').click()
  await expect(page.getByTestId('quiz')).toBeVisible({ timeout: 12_000 })
  // Regression: the first question must not be timed out the moment it appears.
  await page.waitForTimeout(500)
  await expect(page.locator('.quiz-answer.right')).toHaveCount(0)
  await answerAll(page)
  await expect(page.getByTestId('duel-result')).toBeVisible({ timeout: 40_000 })
  await expect(page.locator('.race-scores')).toContainText(/You 1[0-9]{3} pts/)
})

test('Chapteh: serve, kick it back on time, and count the rally together', async ({ page }) => {
  test.setTimeout(90_000)
  await start(page)
  await page.getByTestId('open-duel').click()
  await page.getByTestId('vs-chapteh').click()
  await expect(page.getByTestId('chapteh')).toBeVisible({ timeout: 12_000 })
  await expect(page.getByTestId('chapteh')).toContainText('You serve')
  await page.getByTestId('zone-C').dispatchEvent('pointerdown')
  // Kick back the next few on time, then let one drop.
  for (let i = 0; i < 3; i++) {
    const done = await page.getByTestId('duel-result').isVisible()
    if (done) break
    const kicked = await page.evaluate(async () => {
      const w = window as unknown as { __missuChapteh: { zone: string; arriveAt: number } | null }
      const t0 = performance.now()
      while (!w.__missuChapteh && performance.now() - t0 < 6000) await new Promise((r) => setTimeout(r, 20))
      const c = w.__missuChapteh
      if (!c) return false
      await new Promise((r) => setTimeout(r, Math.max(0, c.arriveAt - performance.now())))
      document.querySelector(`[data-testid=zone-${c.zone}]`)!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
      return true
    })
    if (!kicked) break
  }
  await expect(page.getByTestId('duel-result')).toContainText(/You kept it up \d+ times? together!/, { timeout: 30_000 })
})

test('Daily lineup: only today’s games, and a peek at tomorrow', async ({ page }) => {
  // 22 Nov 2026 is a Heart to Heart day with Scissors-Paper-Stone, Kiasu Quiz, Chope Wars and Cannot Say!.
  await start(page, '?quiet&lineupday=2026-11-22')
  await expect(page.getByTestId('open-hth')).toBeVisible()
  for (const g of ['prove', 'tot', 'agak', 'doodle']) await expect(page.getByTestId(`open-${g}`)).toHaveCount(0)
  await expect(page.getByTestId('today-games')).toHaveText(/Kiasu Quiz.*Scissors-Paper-Stone.*Chope Wars.*Cannot Say!/)
  await expect(page.getByTestId('teaser')).toHaveText('Tomorrow: 🎯 Agak Agak · 🪢 ☕ 🚇 🥁')
  await page.getByTestId('open-duel').click()
  for (const g of ['sps', 'quiz', 'chope', 'cannot']) await expect(page.getByTestId(`vs-${g}`)).toBeVisible()
  for (const g of ['tug', 'pour', 'mrt', 'kopi', 'golf', 'chapteh', 'draw', 'sync']) await expect(page.getByTestId(`vs-${g}`)).toHaveCount(0)
  await expect(page.locator('.vs-heading')).toHaveText(['Versus', 'Together'])
  await page.getByRole('dialog').getByRole('button', { name: 'not now' }).click()
  // Prove It is resting today, even by its address.
  await page.goto('/?quiet&lineupday=2026-11-22#prove')
  await expect(page.getByTestId('not-today')).toContainText('Prove It is resting today')
})
