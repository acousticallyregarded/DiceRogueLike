import { expect, test, type Page } from '@playwright/test';
import { act, createInitialState } from '../../src/engine';

const SAVE_KEY = 'dicebound-save-v4';
const INITIAL_WALLET = 11;
const RUN_GOLD = 230;
const RUN_GEMS = 7;
const SETTLED_WALLET = INITIAL_WALLET + Math.floor(RUN_GOLD / 10) + RUN_GEMS;

function finalSirCinderVictory() {
  let state = act(createInitialState(), { type: 'START_RUN', characterId: 'john' });
  if (!state.run) throw new Error('Expected START_RUN to create a run');

  state.meta.gems = INITIAL_WALLET;
  state.run.floor = 4;
  state.run.phase = 'victory';
  state.run.gold = RUN_GOLD;
  state.run.gemsEarned = RUN_GEMS;
  state.run.settled = false;
  state.run.settledGold = 0;
  state.run.settledGems = 0;
  state.run.finalEpilogueStep = undefined;
  state.run.trailCinematic = null;
  state.run.prologueStep = undefined;
  state.run.victoryReport = {
    id: 'sir-cinder-final-victory',
    boss: true,
    floor: 4,
    xp: 0,
    gold: 120,
    gems: 50,
    healing: 0,
    equipment: [],
    showAt: 0,
  };
  return state;
}

async function readSave(page: Page) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    if (!raw) throw new Error(`Missing saved game at ${key}`);
    return JSON.parse(raw);
  }, SAVE_KEY);
}

async function expectUnsettledWallet(page: Page, step: number) {
  const saved = await readSave(page);
  expect(saved.meta.gems).toBe(INITIAL_WALLET);
  expect(saved.run.finalEpilogueStep).toBe(step);
  expect(saved.run.settled).toBe(false);
}

test('Sir Cinder rewards settle once after the complete epilogue journey', async ({ page }) => {
  const victory = finalSirCinderVictory();
  await page.addInitScript(({ key, value }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, value);
  }, {
    key: SAVE_KEY,
    value: JSON.stringify(victory),
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Sir Cinder, the Ashen Knight Has Fallen' })).toBeVisible();
  expect((await readSave(page)).meta.gems).toBe(INITIAL_WALLET);

  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'The Ash Settles' })).toBeVisible();
  await expectUnsettledWallet(page, 0);

  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'The Heartwood Breathes' })).toBeVisible();
  await expectUnsettledWallet(page, 1);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'The Heartwood Breathes' })).toBeVisible();
  await expectUnsettledWallet(page, 1);

  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'A Hero’s Rest' })).toBeVisible();
  await expectUnsettledWallet(page, 2);

  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'The Tale is Told' })).toBeVisible();
  await expect(page.getByText(`+${Math.floor(RUN_GOLD / 10)}`, { exact: true })).toBeVisible();
  await expect(page.getByText(`+${RUN_GEMS}`, { exact: true })).toBeVisible();
  await expect(page.getByText(`+${SETTLED_WALLET - INITIAL_WALLET}`, { exact: true })).toBeVisible();
  await expectUnsettledWallet(page, 3);

  await page.getByRole('button', { name: 'Return Home' }).evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });

  await expect(page.getByRole('heading', { name: 'Dicebound' })).toBeVisible();
  await expect(page.getByLabel(`Unspendable gems: ${SETTLED_WALLET}`)).toBeVisible();
  const settled = await readSave(page);
  expect(settled.meta.gems).toBe(SETTLED_WALLET);
  expect(settled.run).toBeNull();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Dicebound' })).toBeVisible();
  await expect(page.getByLabel(`Unspendable gems: ${SETTLED_WALLET}`)).toBeVisible();
  expect((await readSave(page)).meta.gems).toBe(SETTLED_WALLET);
});