import { expect, test, type Page } from '@playwright/test';
import { act, createInitialState, type GameStateV4 } from '../../src/engine';

const SAVE_KEY = 'dicebound-save-v4';

function campaignWithRecoveredVerdantShard(): GameStateV4 {
  const state = act(createInitialState(), { type: 'START_RUN', characterId: 'john' });
  if (!state.run) throw new Error('Expected START_RUN to create a run');

  state.run.floor = 2;
  state.run.phase = 'explore';
  state.run.trailCinematic = null;
  state.run.prologueStep = undefined;
  state.run.victoryReport = null;
  state.run.gold = 84;
  state.run.gemsEarned = 5;
  state.run.xp = 37;
  return state;
}

async function readSave(page: Page): Promise<GameStateV4> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    if (!raw) throw new Error(`Missing saved game at ${key}`);
    return JSON.parse(raw);
  }, SAVE_KEY);
}

function progressionSnapshot(state: GameStateV4) {
  if (!state.run) throw new Error('Expected an active run');
  return {
    floor: state.run.floor,
    phase: state.run.phase,
    gold: state.run.gold,
    gemsEarned: state.run.gemsEarned,
    xp: state.run.xp,
  };
}

async function expectVerdantShardJournal(page: Page) {
  await page.getByRole('button', {
    name: 'Open Crown Fragment Journal, 1 of 3 recovered',
  }).click();
  await expect(page.getByRole('heading', { name: 'Fragment Journal' })).toBeVisible();
  await expect(page.getByText('1 of 3 Crown fragments recovered')).toBeVisible();
  await expect(page.getByText('Fragment 1 · The Verdant Shard', { exact: true })).toBeVisible();
}

test('Crown stories persist across reloads and reset for a new campaign', async ({ page }) => {
  const earnedCampaign = campaignWithRecoveredVerdantShard();
  await page.addInitScript(({ key, value }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, value);
  }, {
    key: SAVE_KEY,
    value: JSON.stringify(earnedCampaign),
  });

  await page.goto('/');
  const beforeJournal = progressionSnapshot(await readSave(page));

  await expectVerdantShardJournal(page);
  await page.getByRole('button', { name: 'Close Crown Fragment Journal' }).click();
  await expect(page.getByRole('heading', { name: 'Fragment Journal' })).toBeHidden();
  expect(progressionSnapshot(await readSave(page))).toEqual(beforeJournal);

  await page.reload();
  await expectVerdantShardJournal(page);
  await page.getByRole('button', { name: 'Close Crown Fragment Journal' }).click();
  expect(progressionSnapshot(await readSave(page))).toEqual(beforeJournal);

  await page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    if (!raw) throw new Error(`Missing saved game at ${key}`);
    const saved = JSON.parse(raw);
    saved.run.phase = 'victory';
    saved.run.victoryReport = null;
    localStorage.setItem(key, JSON.stringify(saved));
  }, SAVE_KEY);
  await page.reload();
  await page.getByRole('button', { name: 'Return to Lobby' }).click();
  await expect(page.getByRole('heading', { name: 'Dicebound' })).toBeVisible();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByRole('button', { name: 'Start Adventure' }).click();
  await page.getByRole('button', { name: 'Skip story' }).click();

  await page.getByRole('button', {
    name: 'Open Crown Fragment Journal, 0 of 3 recovered',
  }).click();
  await expect(page.getByText('0 of 3 Crown fragments recovered')).toBeVisible();
  await expect(page.getByText('No fragments recovered yet.')).toBeVisible();
  await expect(page.getByText('Fragment 1 · The Verdant Shard', { exact: true })).toBeHidden();
});