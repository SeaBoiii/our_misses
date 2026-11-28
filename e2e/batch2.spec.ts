// Batch 2 in the demo: Doodle Day, Marina Mini Golf, Chope Wars, Draw & Guess and In Sync.
import { expect, test, type Page } from '@playwright/test'

async function start(page: Page, query = '?quiet', who: 'Aleem' | 'Nurul' = 'Aleem') {
  await page.goto(`/${query}&allgames`)
  await page.getByRole('button', { name: who }).click()
  await expect(page.locator('.presence.on')).toBeVisible()
}
async function acceptInvite(page: Page, testId: string) {
  await page.getByRole('button', { name: 'I’m in' }).click({ timeout: 10_000 })
  await expect(page.getByTestId(testId)).toBeVisible({ timeout: 12_000 })
}
/** Draw a zigzag on a pad. */
async function scribble(page: Page, testId = 'drawpad') {
  const box = (await page.getByTestId(testId).boundingBox())!
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.3)
  await page.mouse.down()
  for (let i = 1; i <= 6; i++) await page.mouse.move(box.x + box.width * (0.2 + i * 0.1), box.y + box.height * (i % 2 ? 0.7 : 0.3), { steps: 4 })
  await page.mouse.up()
}

test('Doodle Day: draw in 30 seconds, see both once she has', async ({ page }) => {
  await start(page)
  await page.getByTestId('open-doodle').click()
  await expect(page.getByTestId('doodle-prompt')).not.toBeEmpty()
  await page.getByTestId('doodle-start').click()
  await expect(page.getByTestId('doodle-timer')).toContainText(/⏱ (30|29)s/)
  await expect(page.getByTestId('doodle-send')).toBeDisabled()
  await scribble(page)
  await expect(page.locator('[data-testid=drawpad] path')).toHaveCount(1)
  await page.getByTestId('doodle-send').click()
  await expect(page.getByTestId('doodle-reveal')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId('doodle-reveal')).toContainText('+2 misses each')
  await expect(page.locator('[data-testid=doodle-reveal] svg')).toHaveCount(2)
  await page.getByRole('button', { name: '← back to the rope' }).click()
  await expect(page.getByTestId('open-doodle')).toContainText('doodles are in')
  await expect(page.locator('.feed li').first()).toContainText('✏️')
})

test('Marina Mini Golf: three holes, fewest strokes wins', async ({ page }) => {
  test.setTimeout(150_000)
  await start(page, '?quiet&golfme')
  await acceptInvite(page, 'golf')
  await expect(page.getByTestId('golf')).toContainText('Hole 1/3')
  // A real drag putts too.
  const box = (await page.locator('.golf-board').boundingBox())!
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.42, box.y + box.height * 0.5, { steps: 5 })
  await page.mouse.up()
  await expect(page.getByTestId('golf-strokes')).toContainText('1 stroke')
  // Then aim at the cup until the round is over (blocked shots go a bit sideways).
  for (let i = 0; i < 40; i++) {
    if (!(await page.getByTestId('golf').isVisible())) break
    const phase = await page.evaluate(() => (window as unknown as { __missuGolf?: { phase(): string } }).__missuGolf?.phase())
    if (phase === 'aim') await page.evaluate((k) => (window as unknown as { __missuGolf: { puttAtCup(o: number): void } }).__missuGolf.puttAtCup(k % 3 === 2 ? 0.5 : 0), i)
    await page.waitForTimeout(1_200)
  }
  await expect(page.getByTestId('duel-result')).toBeVisible({ timeout: 90_000 })
  await expect(page.locator('.race-scores')).toContainText(/You \d+ strokes/)
})

test('Chope Wars: take turns until every stool is choped', async ({ page }) => {
  test.setTimeout(150_000)
  await start(page, '?quiet&chopeme')
  await acceptInvite(page, 'chope')
  // She sent the challenge, so she moves first.
  await expect(page.getByTestId('chope-turn')).toContainText('Nurul’s turn')
  for (let i = 0; i < 150; i++) {
    if (await page.getByTestId('duel-result').isVisible()) break
    const turn = page.getByTestId('chope-turn')
    await expect(turn.or(page.getByTestId('duel-result')).first()).toBeVisible()
    if (!(await turn.isVisible()) || !(await turn.innerText()).startsWith('Your turn')) { await page.waitForTimeout(700); continue }
    if (i === 3) {
      // Once: the cleaner auntie swaps one of her packets.
      await page.getByTestId('chope-auntie').click()
      const theirs = page.locator('.chope-stool.can').first()
      if (await theirs.count()) { await theirs.click(); await page.waitForTimeout(500); continue }
      await page.getByTestId('chope-auntie').click()
    }
    await page.locator('[data-free=yes]').first().click()
    await page.waitForTimeout(400)
  }
  await expect(page.getByTestId('duel-result')).toContainText(/wins!|You win!|A tie!/, { timeout: 60_000 })
  await expect(page.locator('.race-scores')).toContainText(/You \d+ pts/)
})

test('Draw & Guess: guess her scribbles, then draw yours', async ({ page }) => {
  test.setTimeout(150_000)
  await start(page, '?quiet&drawme')
  await acceptInvite(page, 'draw')
  // She sent the challenge, so she draws first.
  await expect(page.locator('[data-testid=draw] svg path')).not.toHaveCount(0, { timeout: 10_000 })
  await page.getByTestId('draw-guess-input').fill('definitely not this')
  await page.getByTestId('draw-send').click()
  await expect(page.getByTestId('draw')).toContainText('Not it: definitely not this')
  const word = (await page.getByTestId('draw').getAttribute('data-word'))!
  await page.getByTestId('draw-guess-input').fill(word.toLowerCase())
  await page.getByTestId('draw-send').click()
  await expect(page.getByTestId('draw-words')).toHaveText('1 word together')
  // At 45 seconds you swap and draw.
  await expect(page.getByTestId('draw-word')).toBeVisible({ timeout: 50_000 })
  await scribble(page)
  await expect(page.locator('[data-testid=drawpad] path')).toHaveCount(1)
  await expect(page.getByTestId('duel-result')).toContainText(/You got \d+ words? together!/, { timeout: 60_000 })
})

test('In Sync: tap the rhythm together', async ({ page }) => {
  test.setTimeout(90_000)
  await start(page, '?quiet&syncme')
  await acceptInvite(page, 'sync')
  // Tap every note on time (the demo shows the rhythm), except the first two.
  const hits = await page.evaluate(async () => {
    const w = window as unknown as { __missuSync?: { notes: number[]; at(): number } }
    while (!w.__missuSync) await new Promise((r) => setTimeout(r, 20))
    const { notes, at } = w.__missuSync
    const pad = document.querySelector('[data-testid=sync-tap]')!
    let n = 0
    for (const note of notes.slice(2)) {
      while (at() < note - 8) await new Promise((r) => setTimeout(r, 4))
      pad.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
      n++
    }
    return n
  })
  expect(hits).toBe(22)
  await expect(page.getByTestId('duel-result')).toContainText(/You hit \d+ beats? together!/, { timeout: 30_000 })
})
