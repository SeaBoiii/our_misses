// Batch 1 in the demo: Heart to Heart, Agak Agak, Kopi Rush, Scissors-Paper-Stone and Cannot Say!.
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

test('Heart to Heart: write yours, see both once she has', async ({ page }) => {
  await start(page)
  await page.getByTestId('open-hth').click()
  await expect(page.getByTestId('hth-question')).not.toBeEmpty()
  await expect(page.getByTestId('hth-send')).toBeDisabled()
  await page.getByTestId('hth-input').fill('The first kopi we shared, at that kopitiam by the bus stop.')
  await page.getByTestId('hth-send').click()
  await expect(page.getByTestId('hth-waiting')).toContainText('Nurul hasn’t answered yet')
  await expect(page.getByTestId('hth-reveal')).toContainText('The first kopi we shared', { timeout: 10_000 })
  await expect(page.getByTestId('hth-reveal')).toContainText('+2 misses each')
  await page.getByRole('button', { name: '← back to the rope' }).click()
  await expect(page.getByTestId('open-hth')).toContainText('answers are in')
  await expect(page.locator('.feed li').first()).toContainText('💬')
})

test('Agak Agak: the Psychic clues, she sets the needle', async ({ page }) => {
  await start(page)
  await page.getByTestId('open-agak').click()
  await expect(page.getByText('You’re today’s Psychic')).toBeVisible()
  await expect(page.getByTestId('agak-target')).toBeVisible()
  await page.getByTestId('agak-clue').fill('Supper prata at 2am')
  await page.getByTestId('agak-send').click()
  await expect(page.getByTestId('agak-waiting')).toContainText('Waiting for Nurul to set the needle')
  await expect(page.getByTestId('agak-reveal')).toContainText(/Bullseye|So close|Agak agak lah|Way off/, { timeout: 10_000 })
})

test('Agak Agak: guess from his clue', async ({ page }) => {
  await start(page, '?quiet', 'Nurul')
  await page.getByTestId('open-agak').click()
  await expect(page.getByTestId('agak-their-clue')).toContainText('pretend clue', { timeout: 10_000 })
  await expect(page.getByTestId('agak-target')).toHaveCount(0) // hidden from the guesser
  await page.getByTestId('agak-needle').fill('120')
  await page.getByTestId('agak-lock').click()
  await expect(page.getByTestId('agak-reveal')).toBeVisible()
  await expect(page.getByTestId('agak-target')).toBeVisible()
  await page.getByRole('button', { name: '← back to the rope' }).click()
  await expect(page.getByTestId('open-agak')).toContainText(/bullseye|so close|agak agak|way off/)
})

test('Kopi Rush: serve the orders right and win the day’s +5', async ({ page }) => {
  test.setTimeout(120_000)
  await start(page, '?quiet&kopime')
  await acceptInvite(page, 'kopi')
  // One wrong drink first: the auntie says what was wrong.
  await page.getByTestId('kopi-milo').click()
  await page.getByTestId('kopi-ice').click()
  await page.getByTestId('kopi-ice').click() // only one lot of ice fits
  await page.getByTestId('kopi-serve').click()
  await expect(page.getByTestId('kopi-flash')).not.toHaveText('Shiok! ✓')
  for (let i = 0; i < 12; i++) {
    const recipe = JSON.parse((await page.getByTestId('kopi-order').getAttribute('data-recipe'))!) as Record<string, number>
    for (const [k, n] of Object.entries(recipe)) for (let j = 0; j < n; j++) await page.getByTestId(`kopi-${k}`).click()
    await page.getByTestId('kopi-serve').click()
    await expect(page.getByTestId('kopi-served')).toHaveText(`${i + 1} served`)
  }
  await expect(page.getByTestId('duel-result')).toHaveText('You win! +5 misses', { timeout: 70_000 })
  await expect(page.locator('.race-scores')).toContainText('You 12 drinks')
})

test('Scissors-Paper-Stone: throw until someone gets 3', async ({ page }) => {
  test.setTimeout(120_000)
  await start(page, '?quiet&spsme', 'Nurul')
  await acceptInvite(page, 'sps')
  await expect(page.getByTestId('sps-paper')).toBeVisible()
  // Always stone. A round moves on once both throws are in.
  const roundLabel = page.locator('.sps-round')
  for (let round = 1; round <= 9; round++) {
    await expect(roundLabel.or(page.getByTestId('duel-result')).or(page.getByText('Match over!')).first()).toBeVisible({ timeout: 10_000 })
    if (!(await roundLabel.isVisible())) break
    await expect(roundLabel).toContainText(`Round ${round}`)
    await page.getByTestId('sps-stone').click()
    await expect(page.getByTestId('sps-waiting').or(page.getByTestId('sps-last')).first()).toBeVisible()
    await expect(roundLabel.filter({ hasText: `Round ${round}` })).toHaveCount(0, { timeout: 10_000 })
    await expect(page.getByTestId('sps-last')).toContainText(/^✊\s*vs/) // my stone, revealed
  }
  await expect(page.getByTestId('duel-result')).toContainText(/wins!|You win!|A tie!/, { timeout: 30_000 })
  await expect(page.locator('.race-scores')).toContainText(/You \d wins?/)
})

test('Cannot Say!: guess her clues, then describe without the banned words', async ({ page }) => {
  test.setTimeout(150_000)
  await start(page, '?quiet&cannotme')
  await acceptInvite(page, 'cannot')
  // She sent the challenge, so she describes first.
  await expect(page.getByTestId('cannot-clues')).toBeVisible({ timeout: 10_000 })
  await page.getByTestId('cannot-guess-input').fill('definitely not this')
  await page.getByTestId('cannot-send').click()
  await expect(page.getByTestId('cannot')).toContainText('Not it: definitely not this')
  const word = (await page.getByTestId('cannot').getAttribute('data-word'))!
  await page.getByTestId('cannot-guess-input').fill(word.toUpperCase())
  await page.getByTestId('cannot-send').click()
  await expect(page.getByTestId('cannot-words')).toHaveText('1 word together')
  // At 45 seconds you swap and describe.
  await expect(page.getByTestId('cannot-word')).toBeVisible({ timeout: 50_000 })
  const mine = await page.getByTestId('cannot-word').innerText()
  await page.getByTestId('cannot-clue-input').fill(`it's ${mine.toLowerCase()} lah`)
  await page.getByTestId('cannot-send').click()
  await expect(page.getByTestId('cannot-warn')).toContainText('Cannot say')
  await page.getByTestId('cannot-clue-input').fill('zzz you know one')
  await page.getByTestId('cannot-send').click()
  await expect(page.getByTestId('cannot')).toContainText('Your clues: “zzz you know one”')
  await expect(page.getByTestId('duel-result')).toContainText(/You got \d+ words? together!/, { timeout: 60_000 })
})
