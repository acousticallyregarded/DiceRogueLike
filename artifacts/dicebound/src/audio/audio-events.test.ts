import assert from "node:assert/strict";
import {
  act,
  createInitialState,
  validateState,
  type EnemyState,
  type GameStateV4,
} from "../engine";
import { getAudioTransitionEvents } from "./audio-events";

const enemy = (id: string, hp = 100): EnemyState => ({
  id,
  name: "Wolf",
  speciesKey: "wolf",
  artKey: "wolf",
  hp,
  maxHp: hp,
  attack: 5,
  defense: 0,
  speed: 20,
});

function combatState(enemyRoster: EnemyState[] = [enemy("wolf-1")]): GameStateV4 {
  let state = act(createInitialState(), { type: "START_RUN" });
  state = act(state, { type: "FINISH_TRAIL_CINEMATIC" });
  state.run!.hp = 50;
  state.run!.enemies = enemyRoster;
  state.run!.phase = "combat";
  state.run!.combatTurn = "player";
  state.run!.selectedDamageType = "slashing";
  state.run!.playerCombat = {
    roundCounter: 0,
    heroAttackSequence: 0,
    heroConsumableSequence: 0,
    pendingFireBomb: false,
    enemyAttackSequence: 0,
    lastConsumable: null,
  };
  return state;
}

function runAssertions() {
  // A restored state establishes a baseline rather than replaying its history.
  const restoredStarted = act(act(createInitialState(), { type: "START_RUN" }), { type: "FINISH_TRAIL_CINEMATIC" });
  const restoredRoll = act(restoredStarted, { type: "ROLL_DICE" });
  assert.deepEqual(getAudioTransitionEvents(null, validateState(JSON.parse(JSON.stringify(restoredRoll)))), []);
  assert.deepEqual(
    getAudioTransitionEvents(restoredRoll, act(restoredRoll, { type: "ROLL_DICE" })),
    [],
    "duplicate roll cannot replay dice sound",
  );

  const started = act(
    act(createInitialState(), { type: "START_RUN" }),
    { type: "FINISH_TRAIL_CINEMATIC" },
  );
  const rolled = act(started, { type: "ROLL_DICE" });
  assert.deepEqual(getAudioTransitionEvents(started, rolled), [{ type: "dice-roll" }]);

  let slashState = combatState();
  const selected = act(slashState, { type: "SELECT_ATTACK", damageType: "piercing" });
  assert.deepEqual(getAudioTransitionEvents(slashState, selected), []);
  const slashAttack = act(selected, { type: "PLAYER_ATTACK" });
  assert.deepEqual(getAudioTransitionEvents(selected, slashAttack), [{ type: "weapon-hit", damageType: "piercing" }]);
  assert.deepEqual(getAudioTransitionEvents(selected, slashAttack), [{ type: "weapon-hit", damageType: "piercing" }]);
  assert.deepEqual(getAudioTransitionEvents(slashAttack, act(slashAttack, { type: "PLAYER_ATTACK" })), []);

  const bluntBefore = combatState();
  bluntBefore.run!.selectedDamageType = "bludgeoning";
  const bluntAfter = act(bluntBefore, { type: "PLAYER_ATTACK" });
  assert.deepEqual(getAudioTransitionEvents(bluntBefore, bluntAfter), [{ type: "weapon-hit", damageType: "bludgeoning" }]);

  const potionBefore = combatState();
  potionBefore.run!.hp = 10;
  const potionAfter = act(potionBefore, { type: "USE_CONSUMABLE", consumable: "health_potion" });
  assert.deepEqual(getAudioTransitionEvents(potionBefore, potionAfter), [
    { type: "consumable", consumable: "health_potion" },
  ]);

  const bombBefore = combatState();
  const bombAfter = act(bombBefore, { type: "USE_CONSUMABLE", consumable: "fire_bomb" });
  assert.deepEqual(getAudioTransitionEvents(bombBefore, bombAfter), [
    { type: "consumable", consumable: "fire_bomb" },
  ]);
  const bombResolution = act(bombAfter, { type: "RESOLVE_ENEMY_TURN" });
  assert.deepEqual(getAudioTransitionEvents(bombAfter, bombResolution), [{ type: "hero-hit" }]);

  // Two enemies can attack in one response, but the hero receives one impact
  // sound for that committed response.
  const packBefore = combatState([enemy("wolf-1"), enemy("wolf-2")]);
  const packAttack = act(packBefore, { type: "PLAYER_ATTACK" });
  const packResponse = act(packAttack, { type: "RESOLVE_ENEMY_TURN" });
  assert.deepEqual(getAudioTransitionEvents(packAttack, packResponse), [{ type: "hero-hit" }]);
}

runAssertions();