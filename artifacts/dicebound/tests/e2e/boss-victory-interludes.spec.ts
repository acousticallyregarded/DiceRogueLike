import { expect, test, type Page } from '@playwright/test';
import { act, createInitialState } from '../../src/engine';
import { getLevelDefinition, getVictoryInterlude } from '../../src/level-content';

const SAVE_KEY = 'dicebound-save-v4';

function bossVictory(floor: number) {
  let state = act(createInitialState(), { type: 'START_RUN', characterId: 'john' });
  if (!state.run) throw new Error('Expected START_RUN to create a run');

  state.meta.gems = 13;
  state.run.floor = floor;
  state.run.phase = 'victory';
  state.run.gold = 170 + floor;
  state.run.gemsEarned = 5 + floor;
  state.run.trailCinematic = null;
  state.run.prologueStep = undefined;
  state.run.victoryReport = {
    id: `boss-${floor}-victory`,
    boss: true,
    floor,
    xp: 90 + floor,
    gold: 40 + floor,
    gems: floor,
    healing: 3,
    equipment: [`Floor ${floor} relic`],
    showAt: 0,
  };
  return state;
}

async function loadVictory(page: Page, floor: number) {
  const state = bossVictory(floor);
  await page.goto('/');
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), {
    key: SAVE_KEY,
    value: JSON.stringify(state),
  });
  await page.reload();
  return state;
}

async function readSave(page: Page) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    if (!raw) throw new Error(`Missing saved game at ${key}`);
    return JSON.parse(raw);
  }, SAVE_KEY);
}

function rewardSnapshot(state: ReturnType<typeof bossVictory>) {
  return {
    wallet: state.meta.gems,
    floor: state.run!.floor,
    gold: state.run!.gold,
    gemsEarned: state.run!.gemsEarned,
  };
}

async function expectRewards(page: Page, expected: ReturnType<typeof rewardSnapshot>) {
  const saved = await readSave(page);
  expect({
    wallet: saved.meta.gems,
    floor: saved.run.floor,
    gold: saved.run.gold,
    gemsEarned: saved.run.gemsEarned,
  }).toEqual(expected);
}

test('the first three boss reports expose keyboard-usable interludes and neutral dismissal paths', async ({ page }) => {
  for (const floor of [1, 2, 3]) {
    const skippedState = await loadVictory(page, floor);
    const rewards = rewardSnapshot(skippedState);
    const boss = getLevelDefinition(floor).boss;
    const interlude = getVictoryInterlude(floor)!;
    const reveal = page.getByRole('button', { name: 'Reveal the Crown Fragment' });
    const skip = page.getByRole('button', { name: 'Skip story' });

    await expect(page.getByRole('heading', { name: `${boss.name} Has Fallen` })).toBeVisible();
    await expect(reveal).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(skip).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(reveal).toBeFocused();
    await skip.click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expectRewards(page, rewards);

    await loadVictory(page, floor);
    await reveal.click();
    await expect(page.getByRole('heading', { name: interlude.title })).toBeVisible();
    await expect(page.getByText(interlude.body)).toBeVisible();
    await expect(page.getByText(interlude.destination)).toBeVisible();
    const journey = page.getByRole('button', { name: `Journey to ${getLevelDefinition(floor + 1).name}` });
    await expect(journey).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(journey).toBeFocused();
    await journey.click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expectRewards(page, rewards);
  }
});

test('the fourth boss report continues into the normal finale', async ({ page }) => {
  const state = await loadVictory(page, 4);
  const rewards = rewardSnapshot(state);
  const continueButton = page.getByRole('button', { name: 'Continue', exact: true });

  await expect(page.getByRole('heading', { name: 'Sir Cinder, the Ashen Knight Has Fallen' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reveal the Crown Fragment' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Skip story' })).toHaveCount(0);
  await expect(continueButton).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(continueButton).toBeFocused();
  await continueButton.click();
  await expect(page.getByRole('heading', { name: 'The Ash Settles' })).toBeVisible();
  await expectRewards(page, rewards);
});