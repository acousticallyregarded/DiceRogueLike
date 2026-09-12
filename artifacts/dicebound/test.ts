import { createInitialState, act, GameStateV4 } from './src/engine';
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
assert.strictEqual(state.run.bossRollsLeft, 30, 'Boss scheduled');

// 3. Looping Dice & Movement
const startPos = state.run.position;
state = act(state, { type: 'ROLL_DICE' });
assert.strictEqual(state.run.phase, 'moving', 'Phase is moving');
assert.ok(state.run.stepsRemaining > 0, 'Steps generated');

while (state.run.stepsRemaining > 0) {
  state = act(state, { type: 'STEP_MOVE' });
}
assert.notStrictEqual(state.run.position, startPos, 'Position changed');

// Force encounter
state.run.phase = 'moving';
state.run.stepsRemaining = 1;
state.run.tiles[(state.run.position + 1) % 24].type = 'enemy';
state.run.bossRollsLeft = 5; // skip wait
state = act(state, { type: 'STEP_MOVE' });
assert.strictEqual(state.run.phase, 'combat', 'Combat started');
assert.ok(state.run.enemies.length > 0, 'Enemies generated');

// 4. Multi-enemy combat tick
while (state.run.phase === 'combat') {
  state = act(state, { type: 'TICK_COMBAT', dtMs: 1000 });
}

// Either died or won
if (state.run.phase === 'explore' || state.run.phase === 'victory') {
    console.log("Won combat");
} else {
    console.log("Died in combat");
}

console.log("All tests passed");
