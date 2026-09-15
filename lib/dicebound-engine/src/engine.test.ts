import assert from "node:assert/strict";
import test from "node:test";
import {
  act,
  createInitialState,
  generateEnemies,
  type GameAction,
} from "./engine";
import { LEVELS } from "./level-content";

test("deterministic campaign entropy and replay actions are stable", () => {
  for (const characterId of ["john", "unc", "alan-a-dale"] as const) {
    const seed = "engine-test-seed";
    const started = act(createInitialState(), { type: "START_RUN", characterId }, { seed, now: 0 });
    let first = structuredClone(started);
    let second = structuredClone(started);
    const actions: GameAction[] = [
      { type: "SKIP_PROLOGUE" },
      { type: "FINISH_TRAIL_CINEMATIC" },
      { type: "ROLL_DICE" },
    ];
    for (const [index, action] of actions.entries()) {
      first = act(first, action, { seed, now: (index + 1) * 1000 });
      second = act(second, action, { seed, now: (index + 1) * 1000 });
    }
    assert.deepEqual(first, second);
    assert.equal(first.run?.characterId, characterId);
  }
});

test("real combat reducer resolves every living enemy death from one fire bomb", () => {
  const seed = "combat-test-seed";
  const state = act(createInitialState(), { type: "START_RUN", characterId: "unc" }, { seed, now: 0 });
  const run = state.run!;
  run.trailCinematic = undefined;
  run.phase = "combat";
  run.combatTurn = "player";
  run.isBossCombat = true;
  run.enemies = generateEnemies(2, 1).map((enemy) => ({ ...enemy, hp: 1 }));
  run.consumables.fire_bomb = 1;
  run.playerCombat = {
    attackTimer: 0,
    roundCounter: 0,
    heroAttackSequence: 0,
    heroConsumableSequence: 0,
    pendingFireBomb: false,
    enemyAttackSequence: 0,
    takedownUsed: false,
  };
  const primed = act(state, { type: "USE_CONSUMABLE", consumable: "fire_bomb" }, { seed, now: 1000 });
  const terminal = act(primed, { type: "RESOLVE_ENEMY_TURN" }, { seed, now: 2000 });
  assert.equal(terminal.run?.phase, "victory");
  assert.equal(terminal.run?.enemies.length, 0);
});

test("complete multi-floor boss presentation lifecycle reaches final epilogue", () => {
  const seed = "full-campaign-test-seed";
  let state = act(createInitialState(), { type: "START_RUN", characterId: "john" }, { seed, now: 0 });
  for (let floor = 1; floor <= LEVELS.length; floor += 1) {
    const run = state.run!;
    run.trailCinematic = undefined;
    run.phase = "combat";
    run.combatTurn = "player";
    run.floor = floor;
    run.isBossCombat = true;
    run.enemies = generateEnemies(1, 1).map((enemy) => ({ ...enemy, hp: 1, boss: true }));
    run.consumables.fire_bomb = 1;
    run.playerCombat = {
      attackTimer: 0, roundCounter: 0, heroAttackSequence: 0, heroConsumableSequence: 0,
      pendingFireBomb: false, enemyAttackSequence: 0, takedownUsed: false,
    };
    state = act(state, { type: "USE_CONSUMABLE", consumable: "fire_bomb" }, { seed, now: floor * 1000 });
    state = act(state, { type: "RESOLVE_ENEMY_TURN" }, { seed, now: floor * 1000 + 1 });
    assert.equal(state.run?.phase, "victory");
    state = act(state, { type: "DISMISS_VICTORY_REPORT" }, { seed, now: floor * 1000 + 2 });
    if (floor < LEVELS.length) {
      state = act(state, { type: "CONTINUE_RUN" }, { seed, now: floor * 1000 + 3 });
      assert.equal(state.run?.floor, floor + 1);
    } else {
      for (let step = 0; step < 4; step += 1) {
        state = act(state, { type: "ADVANCE_FINAL_EPILOGUE" }, { seed, now: floor * 1000 + 3 + step });
      }
      assert.equal(state.run, null);
    }
  }
});