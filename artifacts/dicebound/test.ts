import { createInitialState, act, TRAIL_TILE_COUNT } from './src/engine';
import assert from 'assert';

let state = createInitialState();

// 1. Talents & Equip
state.meta.gems = 1000;
state = act(state, { type: 'BUY_TALENT', stat: 'vitality' });
assert.strictEqual(state.meta.talents.vitality, 1, 'Talent bought');

state = act(state, { type: 'OPEN_CHEST' });
assert.strictEqual(state.meta.inventory.length, 1, 'Chest opened');
const item = state.meta.inventory[0];
state = act(state, { type: 'EQUIP_ITEM', itemId: item.id });
assert.strictEqual(state.meta.equipped[item.type], item.id, 'Item equipped');

// 2. Start Run
state = act(state, { type: 'START_RUN' });
assert.ok(state.run, 'Run started');
assert.strictEqual(state.run.tiles.length, TRAIL_TILE_COUNT, 'Finite trail generated');
assert.strictEqual(state.run.position, 0, 'Trail starts at the first pace');
assert.strictEqual(state.run.bossCountdown, TRAIL_TILE_COUNT - 1, 'Boss countdown uses remaining paces');
assert.strictEqual(state.run.bossRollsLeft, TRAIL_TILE_COUNT - 1, 'Legacy countdown alias uses remaining paces');
assert.strictEqual(state.run.trailCinematic, 'intro', 'Trail intro is staged');
assert.strictEqual(state.run.tiles[TRAIL_TILE_COUNT - 1].type, 'boss', 'Trail ends at the boss approach');

// 3. Finish the intro, then roll finite trail movement
const blockedIntro = act(state, { type: 'ROLL_DICE' });
assert.deepStrictEqual(blockedIntro.run, state.run, 'Dice input is blocked during the intro');
state = act(state, { type: 'FINISH_TRAIL_CINEMATIC' });
assert.strictEqual(state.run.trailCinematic, null, 'Intro cinematic finished');

const startPos = state.run.position;
state = act(state, { type: 'ROLL_DICE' });
assert.strictEqual(state.run.phase, 'moving', 'Phase is moving');
assert.ok(state.run.stepsRemaining > 0, 'Steps generated');

while (state.run.stepsRemaining > 0) {
  state = act(state, { type: 'STEP_MOVE' });
}
assert.notStrictEqual(state.run.position, startPos, 'Position changed');
assert.strictEqual(
  state.run.bossCountdown,
  state.run.tiles.length - 1 - state.run.position,
  'Countdown tracks remaining trail paces',
);

// Force encounter
state.run.position = 20;
state.run.phase = 'moving';
state.run.stepsRemaining = 1;
state.run.rollAnimating = false;
state.run.tiles[state.run.position + 1].type = 'enemy';
state = act(state, { type: 'STEP_MOVE' });
assert.strictEqual(state.run.phase, 'combat', 'Combat started');
assert.ok(state.run.enemies.length > 0, 'Enemies generated');

// 4. Multi-enemy deliberate combat
let combatTurns = 0;
while (state.run.phase === 'combat' && combatTurns++ < 100) {
  if (state.run.combatTurn === 'player') {
    state = act(state, { type: 'PLAYER_ATTACK' });
    state = act(state, { type: 'FINISH_HERO_ATTACK' });
  } else {
    state = act(state, { type: 'RESOLVE_ENEMY_TURN' });
  }
}

// Either died or won
if (state.run.phase === 'explore' || state.run.phase === 'victory') {
    console.log("Won combat");
} else {
    console.log("Died in combat");
}

console.log("All tests passed");
