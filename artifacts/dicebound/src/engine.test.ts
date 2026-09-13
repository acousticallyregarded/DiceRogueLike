import assert from "node:assert/strict";
import {
  act,
  calculateDamage,
  createInitialState,
  NORMAL_ROSTER,
  ELITE_ROSTER,
  getCombatSpeedBonus,
  getPlayerAttackDurationMs,
  getEnemyResponseDelayMs,
  POTION_ANIMATION_DURATION_MS,
  FIRE_BOMB_ANIMATION_DURATION_MS,
  GUARD_TONIC_ANIMATION_DURATION_MS,
  DEFAULT_ENEMY_RESPONSE_DELAY_MS,
  BOSS_AWAKENING_DURATION_MS,
  TRAIL_TILE_COUNT,
  getWalkDirection,
  validateState,
  type EnemyState,
  type Skill,
} from "./engine.js";
import {
  ATTACK_STYLES,
  BESTIARY,
  DEFAULT_DAMAGE_TYPE,
  speciesKeyForName,
} from "./bestiary.js";
import { CHARACTERS, getCharacter } from "./characters.js";
import { UNC_ACTION_DURATIONS } from "./unc-moves.js";

function combatState(enemy: EnemyState, skills: Skill[] = []) {
  let state = createInitialState();
  state = act(state, { type: "START_RUN" });
  state = act(state, { type: "FINISH_TRAIL_CINEMATIC" });
  const run = state.run!;
  run.attack = 10;
  run.speed = 0;
  run.hp = 50;
  run.skills = skills;
  run.enemies = [enemy];
  run.phase = "combat";
  run.isBossCombat = false;
  run.combatTurn = "player";
  run.playerCombat = {
    attackTimer: 0,
    roundCounter: 0,
    heroAttackSequence: 0,
    heroConsumableSequence: 0,
    pendingFireBomb: false,
    enemyAttackSequence: 0,
  };
  return state;
}

function startedRun() {
  let state = act(createInitialState(), { type: "START_RUN" });
  state = act(state, { type: "FINISH_TRAIL_CINEMATIC" });
  return state;
}

function runAssertions() {
  // Character definitions supply their own starting build while preserving
  // the existing meta talent and equipment bonuses.
  const john = startedRun();
  assert.equal(john.run!.characterId, "john");
  assert.deepEqual(
    {
      maxHp: john.run!.maxHp,
      attack: john.run!.attack,
      defense: john.run!.defense,
      speed: john.run!.speed,
    },
    CHARACTERS.john.baseStats,
  );
  assert.deepEqual(john.run!.skills, []);
  assert.equal(john.run!.selectedDamageType, "slashing");

  const unc = act(createInitialState(), { type: "START_RUN", characterId: "unc" });
  assert.equal(unc.run!.characterId, "unc");
  assert.deepEqual(
    {
      maxHp: unc.run!.maxHp,
      attack: unc.run!.attack,
      defense: unc.run!.defense,
      speed: unc.run!.speed,
    },
    CHARACTERS.unc.baseStats,
  );
  assert.deepEqual(unc.run!.skills.map(skill => skill.type), ["fire", "cold"]);
  assert.equal(unc.run!.selectedDamageType, "fire");

  const alan = act(createInitialState(), { type: "START_RUN", characterId: "alan-a-dale" });
  assert.equal(alan.run!.characterId, "alan-a-dale");
  assert.deepEqual(
    {
      maxHp: alan.run!.maxHp,
      attack: alan.run!.attack,
      defense: alan.run!.defense,
      speed: alan.run!.speed,
    },
    CHARACTERS["alan-a-dale"].baseStats,
  );
  assert.deepEqual(alan.run!.skills.map(skill => [skill.name, skill.type]), [
    ["Restorative Refrain", "vampire"],
    ["Inspiring Melody", "defense_boost"],
  ]);
  assert.equal(alan.run!.selectedDamageType, "slashing");

  // Invalid selections use John only when creating a new run.
  const invalidSelection = act(createInitialState(), {
    type: "START_RUN",
    characterId: "not-a-character" as never,
  });
  assert.equal(invalidSelection.run!.characterId, "john");
  assert.deepEqual(invalidSelection.run!.skills, []);
  assert.equal(getCharacter("not-a-character").id, "john");

  // Save migration repairs identity without rebalancing an existing run or
  // replacing its acquired skills.
  const invalidSave = JSON.parse(JSON.stringify(unc));
  invalidSave.run.characterId = "not-a-character";
  invalidSave.run.maxHp = 321;
  invalidSave.run.attack = 77;
  invalidSave.run.skills = [{
    id: "kept-skill",
    name: "Kept Skill",
    description: "Kept from the save",
    type: "poison",
  }];
  const migratedInvalidSave = validateState(invalidSave);
  assert.equal(migratedInvalidSave.run!.characterId, "john");
  assert.equal(migratedInvalidSave.run!.maxHp, 321);
  assert.equal(migratedInvalidSave.run!.attack, 77);
  assert.deepEqual(migratedInvalidSave.run!.skills, invalidSave.run.skills);

  const oldSave = JSON.parse(JSON.stringify(alan));
  delete oldSave.run.characterId;
  oldSave.run.defense = 99;
  const migratedOldSave = validateState(oldSave);
  assert.equal(migratedOldSave.run!.characterId, "john");
  assert.equal(migratedOldSave.run!.defense, 99);
  assert.equal(migratedOldSave.run!.skills[0].name, "Restorative Refrain");

  // Identity survives serialization and a subsequent floor transition.
  let restoredUnc = validateState(JSON.parse(JSON.stringify(unc)));
  assert.equal(restoredUnc.run!.characterId, "unc");
  restoredUnc = act(restoredUnc, { type: "FINISH_TRAIL_CINEMATIC" });
  restoredUnc.run!.phase = "victory";
  restoredUnc.run!.victoryReport = null;
  const nextFloor = act(restoredUnc, { type: "CONTINUE_RUN" });
  assert.equal(nextFloor.run!.characterId, "unc");
  assert.equal(nextFloor.run!.floor, 2);

  // The finite trail keeps the four walking sheets but never wraps from its
  // final pace back to the first.
  assert.equal(getWalkDirection(0, 1), "south-east");
  assert.equal(getWalkDirection(6, 7), "south-west");
  assert.equal(getWalkDirection(12, 13), "north-west");
  assert.equal(getWalkDirection(18, 19), "north-east");
  assert.equal(getWalkDirection(TRAIL_TILE_COUNT - 1, 0), null);
  assert.equal(getWalkDirection(1, 0), null);

  // New runs begin with a durable intro scene. Every other input is blocked
  // until that scene is explicitly finished.
  let intro = act(createInitialState(), { type: "START_RUN" });
  assert.equal(intro.run!.tiles.length, TRAIL_TILE_COUNT);
  assert.equal(intro.run!.position, 0);
  assert.equal(intro.run!.bossCountdown, TRAIL_TILE_COUNT - 1);
  assert.equal(intro.run!.bossRollsLeft, TRAIL_TILE_COUNT - 1);
  assert.equal(intro.run!.trailCinematic, "intro");
  assert.equal(intro.run!.trailIntroSeen, false);
  assert.equal(intro.run!.tiles[TRAIL_TILE_COUNT - 1].type, "boss");
  assert.ok(new Set(intro.run!.tiles.map(tile => tile.type)).size >= 6);
  assert.deepEqual(act(intro, { type: "ROLL_DICE" }).run, intro.run);
  intro = act(intro, { type: "FINISH_TRAIL_CINEMATIC" });
  assert.equal(intro.run!.trailCinematic, null);
  assert.equal(intro.run!.trailIntroSeen, true);

  // The reducer owns the one authentic 2d6 roll. The displayed pair and
  // movement budget are committed together, so a second click cannot replace
  // the result while that roll is being presented.
  let rolled = startedRun();
  rolled = act(rolled, { type: "ROLL_DICE" });
  assert.equal(rolled.run!.phase, "moving");
  assert.equal(rolled.run!.rollAnimating, true);
  assert.ok(rolled.run!.lastRolls);
  const [dieOne, dieTwo] = rolled.run!.lastRolls!;
  assert.ok(dieOne >= 1 && dieOne <= 6);
  assert.ok(dieTwo >= 1 && dieTwo <= 6);
  assert.equal(rolled.run!.stepsRemaining, dieOne + dieTwo);
  const duplicateRoll = act(rolled, { type: "ROLL_DICE" });
  assert.deepEqual(duplicateRoll.run, rolled.run);
  const reloadedRoll = validateState(JSON.parse(JSON.stringify(rolled)));
  assert.deepEqual(reloadedRoll.run!.lastRolls, rolled.run!.lastRolls);
  assert.equal(reloadedRoll.run!.stepsRemaining, rolled.run!.stepsRemaining);
  assert.equal(reloadedRoll.run!.rollAnimating, true);
  const startedMoving = act(rolled, { type: "BEGIN_MOVEMENT" });
  assert.equal(startedMoving.run!.rollAnimating, false);

  // Movement is finite and clamps at the endpoint. An oversized final roll
  // keeps its ordinary dice faces but cannot move past the boss approach.
  let finite = startedRun();
  finite.run!.position = TRAIL_TILE_COUNT - 3;
  finite.run!.phase = "moving";
  finite.run!.stepsRemaining = 5;
  finite.run!.rollAnimating = false;
  finite.run!.tiles = finite.run!.tiles.map((tile, index) => index === TRAIL_TILE_COUNT - 1
    ? { ...tile, type: "boss" }
    : { ...tile, type: "start" });
  finite = act(finite, { type: "STEP_MOVE" });
  assert.equal(finite.run!.position, TRAIL_TILE_COUNT - 2);
  assert.equal(finite.run!.bossCountdown, 1);
  assert.equal(finite.run!.bossRollsLeft, 1);
  finite = act(finite, { type: "STEP_MOVE" });
  assert.equal(finite.run!.position, TRAIL_TILE_COUNT - 1);
  assert.equal(finite.run!.stepsRemaining, 0);
  assert.equal(finite.run!.bossCountdown, 0);
  assert.equal(finite.run!.bossRollsLeft, 0);
  assert.equal(finite.run!.phase, "boss_awakening");
  assert.equal(finite.run!.trailCinematic, "awakening");
  const endpoint = JSON.stringify(finite.run);
  finite = act(finite, { type: "STEP_MOVE" });
  assert.equal(JSON.stringify(finite.run), endpoint);

  // A real final roll still displays both normal six-sided faces even when
  // its movement budget is clamped to the three remaining paces.
  const originalRandom = Math.random;
  try {
    Math.random = () => 0.999999;
    let finalRoll = startedRun();
    finalRoll.run!.position = TRAIL_TILE_COUNT - 4;
    finalRoll = act(finalRoll, { type: "ROLL_DICE" });
    assert.deepEqual(finalRoll.run!.lastRolls, [6, 6]);
    assert.equal(finalRoll.run!.stepsRemaining, 3);
    finalRoll = act(finalRoll, { type: "BEGIN_MOVEMENT" });
    while (finalRoll.run!.phase === "moving") finalRoll = act(finalRoll, { type: "STEP_MOVE" });
    assert.equal(finalRoll.run!.position, TRAIL_TILE_COUNT - 1);
    assert.equal(finalRoll.run!.bossRollsLeft, 0);
  } finally {
    Math.random = originalRandom;
  }

  // Crossing the alert threshold pauses a roll without skipping its later
  // landing. This covers both an in-flight threshold and a rolled overshoot.
  let alert = startedRun();
  alert.run!.position = TRAIL_TILE_COUNT - 18;
  alert.run!.phase = "moving";
  alert.run!.stepsRemaining = 6;
  alert.run!.rollAnimating = false;
  alert.run!.tiles = alert.run!.tiles.map((tile, index) => index === TRAIL_TILE_COUNT - 1
    ? { ...tile, type: "boss" }
    : { ...tile, type: "start" });
  alert = act(alert, { type: "STEP_MOVE" });
  assert.equal(alert.run!.position, TRAIL_TILE_COUNT - 17);
  assert.equal(alert.run!.trailCinematic, null);
  alert = act(alert, { type: "STEP_MOVE" });
  assert.equal(alert.run!.position, TRAIL_TILE_COUNT - 16);
  assert.equal(alert.run!.bossCountdown, 15);
  assert.equal(alert.run!.bossRollsLeft, 15);
  assert.equal(alert.run!.trailCinematic, "alert");
  const alertSnapshot = JSON.stringify(alert.run);
  assert.equal(JSON.stringify(act(alert, { type: "STEP_MOVE" }).run), alertSnapshot);
  alert = act(alert, { type: "FINISH_TRAIL_CINEMATIC" });
  assert.equal(alert.run!.trailCinematic, null);
  assert.equal(alert.run!.stepsRemaining, 4);
  while (alert.run!.stepsRemaining > 0) alert = act(alert, { type: "STEP_MOVE" });
  assert.equal(alert.run!.position, TRAIL_TILE_COUNT - 12);
  assert.equal(alert.run!.phase, "explore");
  assert.equal(alert.run!.trailAlertSeen, true);

  // The final committed roll finishes its exact clamped path before the
  // blue-fire awakening. The boss is not created until Fight Boss is chosen.
  assert.equal(BOSS_AWAKENING_DURATION_MS, 2200);
  let finalLanding = startedRun();
  finalLanding.run!.position = TRAIL_TILE_COUNT - 3;
  finalLanding.run!.stepsRemaining = 2;
  finalLanding.run!.phase = "moving";
  finalLanding.run!.rollAnimating = false;
  finalLanding.run!.tiles = finalLanding.run!.tiles.map((tile, index) => index === TRAIL_TILE_COUNT - 1
    ? { ...tile, type: "boss" }
    : { ...tile, type: "start" });
  finalLanding = act(finalLanding, { type: "STEP_MOVE" });
  assert.equal(finalLanding.run!.phase, "moving");
  assert.equal(finalLanding.run!.stepsRemaining, 1);
  finalLanding = act(finalLanding, { type: "STEP_MOVE" });
  assert.equal(finalLanding.run!.phase, "boss_awakening");
  assert.equal(finalLanding.run!.bossRollsLeft, 0);
  assert.equal(finalLanding.run!.trailCinematic, "awakening");
  assert.deepEqual(finalLanding.run!.enemies, []);
  assert.equal(finalLanding.run!.playerCombat, null);
  const awakeningSnapshot = JSON.stringify(finalLanding.run);
  finalLanding = act(finalLanding, { type: "PLAYER_ATTACK" });
  finalLanding = act(finalLanding, { type: "ROLL_DICE" });
  finalLanding = act(finalLanding, { type: "SELECT_ATTACK", damageType: "fire" });
  assert.equal(JSON.stringify(finalLanding.run), awakeningSnapshot);
  finalLanding = act(finalLanding, { type: "FINISH_TRAIL_CINEMATIC" });
  assert.equal(finalLanding.run!.phase, "boss_ready");
  const readySnapshot = JSON.stringify(finalLanding.run);
  finalLanding = act(finalLanding, { type: "FINISH_TRAIL_CINEMATIC" });
  assert.equal(JSON.stringify(finalLanding.run), readySnapshot);
  finalLanding = act(finalLanding, { type: "FIGHT_BOSS" });
  assert.equal(finalLanding.run!.phase, "combat");
  assert.equal(finalLanding.run!.isBossCombat, true);
  assert.equal(finalLanding.run!.enemies[0].name, "Skeleton King");
  let kingTurns = JSON.parse(JSON.stringify(finalLanding));
  kingTurns.run.hp = 1000;
  kingTurns.run.maxHp = 1000;
  kingTurns.run.attack = 0;
  for (const expected of ["sword", "fireball", "sword"]) {
    kingTurns = act(kingTurns, { type: "PLAYER_ATTACK" });
    kingTurns = act(kingTurns, { type: "RESOLVE_ENEMY_TURN" });
    assert.equal(kingTurns.run.enemies[0].lastBossAttack, expected);
    assert.equal(kingTurns.run.enemies[0].damageType, expected === "fireball" ? "fire" : "slashing");
  }
  assert.equal(finalLanding.run!.combatTurn, "player");
  const bossSnapshot = JSON.stringify(finalLanding.run);
  finalLanding = act(finalLanding, { type: "FIGHT_BOSS" });
  assert.equal(JSON.stringify(finalLanding.run), bossSnapshot);

  // Reloading either presentation phase preserves the player's choice point.
  let savedAwakening = startedRun();
  savedAwakening.run!.position = TRAIL_TILE_COUNT - 1;
  savedAwakening.run!.phase = "boss_awakening";
  savedAwakening.run!.trailCinematic = "awakening";
  savedAwakening.run!.enemies = [];
  savedAwakening.run!.playerCombat = null;
  const restoredAwakening = validateState(JSON.parse(JSON.stringify(savedAwakening)));
  assert.equal(restoredAwakening.run!.phase, "boss_awakening");
  const savedReady = act(restoredAwakening, { type: "FINISH_TRAIL_CINEMATIC" });
  const restoredReady = validateState(JSON.parse(JSON.stringify(savedReady)));
  assert.equal(restoredReady.run!.phase, "boss_ready");
  assert.equal(restoredReady.run!.enemies.length, 0);
  assert.equal(restoredReady.run!.playerCombat, null);

  // A legacy 24-tile v4 save keeps its old position and rewards while the
  // remaining trail is appended. Its countdown is recomputed from paces.
  const legacy = JSON.parse(JSON.stringify(startedRun()));
  legacy.run.tiles = legacy.run.tiles.slice(0, 24);
  legacy.run.position = 12;
  legacy.run.bossRollsLeft = 1;
  legacy.run.trailCinematic = undefined;
  legacy.run.trailIntroSeen = undefined;
  legacy.run.trailAlertSeen = undefined;
  legacy.run.trailAwakeningSeen = undefined;
  legacy.meta.inventory = [{ id: "kept", name: "Kept", type: "weapon", stats: { attack: 3 }, rarity: "common" }];
  legacy.meta.gems = 17;
  const migratedTrail = validateState(legacy);
  assert.equal(migratedTrail.run!.tiles.length, TRAIL_TILE_COUNT);
  assert.equal(migratedTrail.run!.position, 12);
  assert.equal(migratedTrail.run!.bossCountdown, TRAIL_TILE_COUNT - 1 - 12);
  assert.equal(migratedTrail.run!.bossRollsLeft, TRAIL_TILE_COUNT - 1 - 12);
  assert.equal(migratedTrail.meta.gems, 17);
  assert.equal(migratedTrail.meta.inventory[0].id, "kept");
  assert.equal(migratedTrail.run!.trailIntroSeen, true);

  // Boss victory settles once; continuing starts the next floor with a fresh
  // statue schedule and no stale boss combat state.
  let bossVictory = startedRun();
  bossVictory.run!.phase = "combat";
  bossVictory.run!.isBossCombat = true;
  bossVictory.run!.attack = 100;
  bossVictory.run!.enemies = [{
    id: "test-boss",
    name: "Mummy",
    speciesKey: "mummy",
    artKey: "boss",
    hp: 1,
    maxHp: 1,
    attack: 0,
    defense: 0,
    speed: 0,
    boss: true,
  }];
  bossVictory.run!.playerCombat = {
    roundCounter: 0,
    heroAttackSequence: 0,
    heroConsumableSequence: 0,
    pendingFireBomb: false,
    enemyAttackSequence: 0,
    firstAttackPending: false,
  };
  bossVictory = act(bossVictory, { type: "PLAYER_ATTACK" });
  assert.equal(bossVictory.run!.phase, "victory");
  assert.equal(bossVictory.run!.victoryReport!.gold, 120);
  assert.equal(bossVictory.run!.victoryReport!.gems, 50);
  assert.equal(bossVictory.run!.victoryReport!.xp, 0);
  const pendingReport = JSON.stringify(bossVictory);
  assert.equal(JSON.stringify(act(bossVictory, { type: "CONTINUE_RUN" })), pendingReport);
  assert.deepEqual(validateState(bossVictory).run!.victoryReport, bossVictory.run!.victoryReport);
  bossVictory = act(bossVictory, { type: "DISMISS_VICTORY_REPORT" });
  const beforeSettlement = bossVictory.meta.gems;
  bossVictory = act(bossVictory, { type: "CONTINUE_RUN" });
  assert.equal(bossVictory.meta.gems, beforeSettlement + 62);
  assert.equal(bossVictory.run!.floor, 2);
  assert.equal(bossVictory.run!.bossCountdown, TRAIL_TILE_COUNT - 1);
  assert.equal(bossVictory.run!.bossRollsLeft, TRAIL_TILE_COUNT - 1);
  assert.equal(bossVictory.run!.position, 0);
  assert.equal(bossVictory.run!.phase, "explore");
  assert.equal(bossVictory.run!.isBossCombat, false);
  assert.deepEqual(bossVictory.run!.enemies, []);
  assert.equal(bossVictory.run!.playerCombat, null);
  const settledState = JSON.stringify(bossVictory);
  bossVictory = act(bossVictory, { type: "CONTINUE_RUN" });
  assert.equal(JSON.stringify(bossVictory), settledState);

  // Traits are applied after defense: resistance floors, vulnerability doubles,
  // and immunity is exactly zero (never promoted to one).
  assert.equal(calculateDamage(14, 2, "skeleton", "bludgeoning").amount, 24);
  assert.equal(calculateDamage(13, 1, "ochre_jelly", "acid").amount, 6);
  assert.equal(calculateDamage(13, 1, "ochre_jelly", "lightning").amount, 0);
  assert.equal(calculateDamage(10, 0, "mummy", "slashing").amount, 5);
  assert.equal(calculateDamage(10, 0, "mummy", "fire").amount, 20);

  // Save migration defaults the selected stance and only infers known names.
  let saved = startedRun();
  saved.run!.selectedDamageType = undefined as never;
  saved.run!.enemies = [
    { id: "legacy-jelly", name: "Slime", hp: 10, maxHp: 10, attack: 1, defense: 0, speed: 0, attackTimer: 0 },
    { id: "legacy-boss", name: "The Overlord", hp: 10, maxHp: 10, attack: 1, defense: 0, speed: 0, attackTimer: 0, boss: true },
  ];
  const migrated = validateState(saved);
  assert.equal(migrated.run!.selectedDamageType, DEFAULT_DAMAGE_TYPE);
  assert.equal(migrated.run!.enemies[0].speciesKey, "ochre_jelly");
  assert.equal(migrated.run!.enemies[1].speciesKey, undefined);
  assert.deepEqual(migrated.run!.consumables, { health_potion: 3, fire_bomb: 2, guard_tonic: 1 });
  assert.equal(migrated.run!.combatTurn, "player");

  const enemyTurnSave = JSON.parse(JSON.stringify(saved));
  enemyTurnSave.run.phase = "combat";
  enemyTurnSave.run.combatTurn = "enemy";
  const preservedEnemyTurn = validateState(enemyTurnSave);
  assert.equal(preservedEnemyTurn.run!.combatTurn, "enemy");

  let selected = startedRun();
  selected = act(selected, { type: "SELECT_ATTACK", damageType: "fire" });
  assert.equal(selected.run!.selectedDamageType, "slashing");
  selected.run!.phase = "combat";
  selected.run!.combatTurn = "player";
  selected = act(selected, { type: "SELECT_ATTACK", damageType: "fire" });
  assert.equal(selected.run!.selectedDamageType, "slashing");
  for (const damageType of ["piercing", "bludgeoning", "slashing"] as const) {
    selected = act(selected, { type: "SELECT_ATTACK", damageType });
    assert.equal(selected.run!.selectedDamageType, damageType);
    assert.equal(selected.run!.combatTurn, "player");
  }
  selected.run!.skills.push({ id: "learn-fire", name: "Ember", description: "", type: "fire" });
  selected = act(selected, { type: "SELECT_ATTACK", damageType: "fire" });
  assert.equal(selected.run!.selectedDamageType, "fire");
  selected.run!.skills = [];
  assert.equal(validateState(selected).run!.selectedDamageType, "slashing");

  // Poison is a real discrete-turn effect but skeleton immunity blocks its damage.
  const skeleton: EnemyState = {
    id: "skeleton",
    name: "Skeleton",
    speciesKey: "skeleton",
    hp: 100,
    maxHp: 100,
    attack: 0,
    defense: 0,
    speed: 0,
    attackTimer: 0,
  };
  let poisoned = combatState(skeleton, [{
    id: "poison",
    name: "Poison Strike",
    description: "",
    type: "poison",
  }]);
  poisoned.run!.attack = 0;
  poisoned.run!.selectedDamageType = "fire";
  poisoned = act(poisoned, { type: "PLAYER_ATTACK" });
  poisoned = act(poisoned, { type: "RESOLVE_ENEMY_TURN" });
  const hpAfterHit = poisoned.run!.enemies[0].hp;
  poisoned = act(poisoned, { type: "PLAYER_ATTACK" });
  assert.equal(poisoned.run!.enemies[0].hp, hpAfterHit);

  // Leech uses actual damage, so an immune hit cannot heal.
  const jelly: EnemyState = {
    id: "jelly",
    name: "Ochre Jelly",
    speciesKey: "ochre_jelly",
    hp: 100,
    maxHp: 100,
    attack: 0,
    defense: 0,
    speed: 0,
    attackTimer: 0,
  };
  let leeched = combatState(jelly, [{
    id: "leech",
    name: "Life Leech",
    description: "",
    type: "vampire",
  }]);
  leeched.run!.hp = 20;
  leeched.run!.selectedDamageType = "lightning";
  leeched.run!.skills.push({ id: "learn-spark", name: "Spark", description: "", type: "lightning" });
  leeched.run!.attack = 10;
  leeched = act(leeched, { type: "PLAYER_ATTACK" });
  assert.equal(leeched.run!.hp, 20);
  assert.equal(leeched.run!.enemies[0].hp, 100);

  // Counter damage goes through the same immunity pipeline and may be zero.
  const counterJelly = { ...jelly, id: "counter-jelly", attack: 10, attackTimer: 100 };
  let countered = combatState(counterJelly, [{
    id: "counter",
    name: "Counter Mastery",
    description: "",
    type: "counter",
  }]);
  countered.run!.selectedDamageType = "slashing";
  countered.run!.attack = 0;
  countered = act(countered, { type: "PLAYER_ATTACK" });
  countered = act(countered, { type: "RESOLVE_ENEMY_TURN" });
  assert.equal(countered.run!.enemies[0].hp, 100);

  // Selecting a stance and an enemy-turn double tap are inert.
  let waiting = combatState({ ...skeleton, id: "waiting", hp: 100, attack: 10 });
  waiting = act(waiting, { type: "PLAYER_ATTACK" });
  const beforeRound = waiting.run!.playerCombat!.roundCounter;
  const beforeEnemyHp = waiting.run!.enemies[0].hp;
  waiting = act(waiting, { type: "SELECT_ATTACK", damageType: "fire" });
  waiting = act(waiting, { type: "PLAYER_ATTACK" });
  assert.equal(waiting.run!.combatTurn, "enemy");
  assert.equal(waiting.run!.playerCombat!.roundCounter, beforeRound);
  assert.equal(waiting.run!.enemies[0].hp, beforeEnemyHp);
  const locked = act(waiting, { type: "RESOLVE_ENEMY_TURN" });
  const lockedAgain = act(locked, { type: "RESOLVE_ENEMY_TURN" });
  assert.equal(JSON.stringify(lockedAgain.run), JSON.stringify(locked.run));

  // Health potions reject full health and empty inventory without consuming a turn.
  let items = combatState({ ...skeleton, id: "items", hp: 100 });
  items.run!.maxHp = 100;
  items.run!.hp = 100;
  items = act(items, { type: "USE_CONSUMABLE", consumable: "health_potion" });
  assert.equal(items.run!.consumables.health_potion, 3);
  assert.equal(items.run!.combatTurn, "player");
  items.run!.consumables.health_potion = 0;
  items.run!.hp = 50;
  items = act(items, { type: "USE_CONSUMABLE", consumable: "health_potion" });
  assert.equal(items.run!.combatTurn, "player");

  // Only a successful potion commits a durable drink marker. The marker
  // selects the long enemy-response delay and clears after that response.
  let potion = combatState({ ...skeleton, id: "potion", hp: 50 });
  potion.run!.maxHp = 100;
  potion.run!.consumables.health_potion = 2;
  potion = act(potion, { type: "USE_CONSUMABLE", consumable: "health_potion" });
  assert.equal(potion.run!.consumables.health_potion, 1);
  assert.equal(potion.run!.playerCombat!.lastConsumable, "health_potion");
  assert.equal(potion.run!.playerCombat!.heroConsumableSequence, 1);
  assert.equal(getEnemyResponseDelayMs(potion.run!), POTION_ANIMATION_DURATION_MS);
  const reloadedPotion = validateState(JSON.parse(JSON.stringify(potion)));
  assert.equal(reloadedPotion.run!.consumables.health_potion, 1);
  assert.equal(reloadedPotion.run!.playerCombat!.lastConsumable, "health_potion");
  assert.equal(getEnemyResponseDelayMs(reloadedPotion.run!), POTION_ANIMATION_DURATION_MS);
  const resolvedReloadedPotion = act(reloadedPotion, { type: "RESOLVE_ENEMY_TURN" });
  const resolvedReloadedAgain = act(resolvedReloadedPotion, { type: "RESOLVE_ENEMY_TURN" });
  assert.equal(JSON.stringify(resolvedReloadedAgain.run), JSON.stringify(resolvedReloadedPotion.run));
  potion = act(potion, { type: "RESOLVE_ENEMY_TURN" });
  assert.equal(potion.run!.playerCombat!.lastConsumable, null);
  assert.equal(getEnemyResponseDelayMs(potion.run!), DEFAULT_ENEMY_RESPONSE_DELAY_MS);

  // Full-health and depleted potion attempts leave both the count and marker
  // untouched, so they cannot trigger a drink or a delayed response.
  const potionBeforeFailedAttempt = potion.run!.playerCombat!.heroConsumableSequence;
  potion.run!.hp = potion.run!.maxHp;
  potion = act(potion, { type: "USE_CONSUMABLE", consumable: "health_potion" });
  assert.equal(potion.run!.consumables.health_potion, 1);
  assert.equal(potion.run!.playerCombat!.heroConsumableSequence, potionBeforeFailedAttempt);
  potion.run!.consumables.health_potion = 0;
  potion.run!.hp = 50;
  potion = act(potion, { type: "USE_CONSUMABLE", consumable: "health_potion" });
  assert.equal(potion.run!.playerCombat!.heroConsumableSequence, potionBeforeFailedAttempt);
  assert.equal(getEnemyResponseDelayMs(potion.run!), DEFAULT_ENEMY_RESPONSE_DELAY_MS);

  // Fire Bomb and Guard Tonic are committed actions, but neither is a potion.
  let otherConsumable = combatState({ ...skeleton, id: "other-consumables", hp: 50 });
  otherConsumable = act(otherConsumable, { type: "USE_CONSUMABLE", consumable: "guard_tonic" });
  assert.equal(otherConsumable.run!.playerCombat!.lastConsumable, "guard_tonic");
  assert.equal(otherConsumable.run!.consumables.guard_tonic, 0);
  assert.equal(otherConsumable.run!.playerCombat!.heroConsumableSequence, 1);
  assert.equal(getEnemyResponseDelayMs(otherConsumable.run!), GUARD_TONIC_ANIMATION_DURATION_MS);

  // A fire bomb consumes immediately but holds all damage until its 2600ms
  // impact. The selected attack stance cannot change the bomb's fire type.
  let bomb = combatState({ ...skeleton, id: "bomb-skeleton", hp: 20, defense: 0 });
  bomb.run!.enemies = [
    { ...bomb.run!.enemies[0], hp: 20, maxHp: 20, speciesKey: "skeleton" },
    { ...bomb.run!.enemies[0], id: "bomb-mummy", name: "Mummy", speciesKey: "mummy", hp: 20, maxHp: 20 },
  ];
  bomb.run!.selectedDamageType = "lightning";
  bomb = act(bomb, { type: "USE_CONSUMABLE", consumable: "fire_bomb" });
  assert.equal(bomb.run!.phase, "combat");
  assert.equal(bomb.run!.combatTurn, "enemy");
  assert.equal(bomb.run!.consumables.fire_bomb, 1);
  assert.equal(bomb.run!.playerCombat!.pendingFireBomb, true);
  assert.equal(getEnemyResponseDelayMs(bomb.run!), FIRE_BOMB_ANIMATION_DURATION_MS);
  assert.equal(bomb.run!.enemies[0].hp, 20);
  assert.equal(bomb.run!.enemies[1].hp, 20);
  bomb = act(bomb, { type: "RESOLVE_ENEMY_TURN" });
  assert.equal(bomb.run!.phase, "explore");
  assert.equal(bomb.run!.playerCombat!.pendingFireBomb, false);
  assert.equal(bomb.run!.playerCombat!.enemyAttackSequence, 0);
  assert.equal(bomb.run!.combatFeedback!.kind, "vulnerable");

  // A depleted bomb or guard cannot commit a turn, marker, or response.
  let depleted = combatState({ ...skeleton, id: "depleted", attack: 10 });
  depleted.run!.consumables.fire_bomb = 0;
  depleted = act(depleted, { type: "USE_CONSUMABLE", consumable: "fire_bomb" });
  assert.equal(depleted.run!.combatTurn, "player");
  assert.equal(depleted.run!.playerCombat!.pendingFireBomb, false);
  depleted.run!.consumables.guard_tonic = 0;
  depleted = act(depleted, { type: "USE_CONSUMABLE", consumable: "guard_tonic" });
  assert.equal(depleted.run!.combatTurn, "player");
  assert.equal(depleted.run!.guardActive, false);
  assert.equal(depleted.run!.consumables.guard_tonic, 0);
  assert.equal(depleted.run!.playerCombat!.heroConsumableSequence, 0);
  assert.equal(depleted.run!.playerCombat!.lastConsumable ?? null, null);

  // A lethal impact finishes once and never gives surviving enemies a
  // retaliation turn. Repeated resolves are inert.
  let lethalBomb = combatState({ ...skeleton, id: "lethal-bomb", hp: 20, defense: 0, attack: 0 });
  lethalBomb.run!.enemies = [
    { ...lethalBomb.run!.enemies[0], hp: 10, maxHp: 10 },
    { ...lethalBomb.run!.enemies[0], id: "lethal-bomb-2", hp: 10, maxHp: 10 },
  ];
  lethalBomb = act(lethalBomb, { type: "USE_CONSUMABLE", consumable: "fire_bomb" });
  assert.equal(lethalBomb.run!.enemies[0].hp, 10);
  lethalBomb = act(lethalBomb, { type: "RESOLVE_ENEMY_TURN" });
  assert.equal(lethalBomb.run!.phase, "explore");
  assert.equal(lethalBomb.run!.victoryReport!.xp, 50);
  assert.equal(lethalBomb.run!.victoryReport!.gold, 20);
  assert.deepEqual(lethalBomb.run!.victoryReport!.equipment, []);
  const beforeReportDismiss = lethalBomb.run!.gold;
  lethalBomb = act(lethalBomb, { type: "DISMISS_VICTORY_REPORT" });
  lethalBomb = act(lethalBomb, { type: "DISMISS_VICTORY_REPORT" });
  assert.equal(lethalBomb.run!.gold, beforeReportDismiss);
  assert.equal(lethalBomb.run!.playerCombat!.enemyAttackSequence, 0);
  const lethalAfterImpact = JSON.stringify(lethalBomb.run);
  lethalBomb = act(lethalBomb, { type: "RESOLVE_ENEMY_TURN" });
  assert.equal(JSON.stringify(lethalBomb.run), lethalAfterImpact);

  // A saved pending bomb replays its impact exactly once without consuming
  // another item. A legacy fire-bomb marker without pending damage is inert.
  let pendingBomb = combatState({ ...skeleton, id: "pending-bomb", hp: 100, defense: 0 });
  pendingBomb = act(pendingBomb, { type: "USE_CONSUMABLE", consumable: "fire_bomb" });
  const savedPendingBomb = validateState(JSON.parse(JSON.stringify(pendingBomb)));
  assert.equal(savedPendingBomb.run!.consumables.fire_bomb, 1);
  assert.equal(savedPendingBomb.run!.playerCombat!.pendingFireBomb, true);
  const pendingEnemyHp = savedPendingBomb.run!.enemies[0].hp;
  const resolvedPendingBomb = act(savedPendingBomb, { type: "RESOLVE_ENEMY_TURN" });
  assert.ok(resolvedPendingBomb.run!.enemies[0].hp < pendingEnemyHp);
  assert.equal(resolvedPendingBomb.run!.consumables.fire_bomb, 1);
  const resolvedPendingAgain = act(resolvedPendingBomb, { type: "RESOLVE_ENEMY_TURN" });
  assert.equal(JSON.stringify(resolvedPendingAgain.run), JSON.stringify(resolvedPendingBomb.run));

  const legacyBomb = JSON.parse(JSON.stringify(pendingBomb));
  legacyBomb.run.playerCombat.pendingFireBomb = undefined;
  legacyBomb.run.playerCombat.lastConsumable = "fire_bomb";
  const legacyBeforeHp = legacyBomb.run.enemies[0].hp;
  const resolvedLegacyBomb = act(validateState(legacyBomb), { type: "RESOLVE_ENEMY_TURN" });
  assert.equal(resolvedLegacyBomb.run!.enemies[0].hp, legacyBeforeHp);

  // Guard is consumed now, delays the response for its animation, and clears
  // after exactly one response. A saved pending guard does not consume twice.
  let guarded = combatState({ ...skeleton, id: "guarded", attack: 20 });
  guarded.run!.defense = 0;
  guarded = act(guarded, { type: "USE_CONSUMABLE", consumable: "guard_tonic" });
  assert.equal(guarded.run!.guardActive, true);
  assert.equal(guarded.run!.playerCombat!.lastConsumable, "guard_tonic");
  assert.equal(getEnemyResponseDelayMs(guarded.run!), GUARD_TONIC_ANIMATION_DURATION_MS);
  const savedGuard = validateState(JSON.parse(JSON.stringify(guarded)));
  assert.equal(savedGuard.run!.consumables.guard_tonic, 0);
  assert.equal(savedGuard.run!.playerCombat!.heroConsumableSequence, 1);
  const resolvedGuard = act(savedGuard, { type: "RESOLVE_ENEMY_TURN" });
  assert.equal(resolvedGuard.run!.guardActive, false);
  assert.equal(resolvedGuard.run!.playerCombat!.lastConsumable, null);
  assert.equal(resolvedGuard.run!.hp, 40);
  assert.equal(getEnemyResponseDelayMs(resolvedGuard.run!), DEFAULT_ENEMY_RESPONSE_DELAY_MS);
  const resolvedGuardAgain = act(resolvedGuard, { type: "RESOLVE_ENEMY_TURN" });
  assert.equal(JSON.stringify(resolvedGuardAgain.run), JSON.stringify(resolvedGuard.run));

  // Deliberate combat has no exhaustion timeout; defeat settlement is idempotent.
  let defeated = combatState({ ...skeleton, id: "defeated", attack: 100, hp: 1000, maxHp: 1000 });
  defeated.run!.hp = 1;
  defeated = act(defeated, { type: "PLAYER_ATTACK" });
  defeated = act(defeated, { type: "RESOLVE_ENEMY_TURN" });
  const gemsAfterDefeat = defeated.meta.gems;
  defeated = act(defeated, { type: "RESOLVE_ENEMY_TURN" });
  assert.equal(defeated.meta.gems, gemsAfterDefeat);

  // Unc's authored action sheets drive the special and class-consumable
  // timings, while the existing hero timings remain unchanged.
  assert.deepEqual(UNC_ACTION_DURATIONS, {
    guard: 5000,
    health: 4200,
    special: 8200,
    death: 8200,
    hurt: 4200,
    idle: 3400,
  });
  const uncTiming = combatState({ ...skeleton, id: "unc-timing", hp: 1000 });
  uncTiming.run!.characterId = "unc";
  uncTiming.run!.combatSpeed = 2;
  uncTiming.run!.playerCombat!.lastAttackKind = "hold_my_beer";
  assert.equal(getPlayerAttackDurationMs(uncTiming.run!), UNC_ACTION_DURATIONS.special);
  assert.equal(getEnemyResponseDelayMs(uncTiming.run!), DEFAULT_ENEMY_RESPONSE_DELAY_MS);
  uncTiming.run!.combatTurn = "enemy";
  assert.equal(getEnemyResponseDelayMs(uncTiming.run!), UNC_ACTION_DURATIONS.special / 2);
  uncTiming.run!.playerCombat!.lastConsumable = "health_potion";
  assert.equal(getEnemyResponseDelayMs(uncTiming.run!), UNC_ACTION_DURATIONS.health);
  uncTiming.run!.playerCombat!.lastConsumable = "guard_tonic";
  assert.equal(getEnemyResponseDelayMs(uncTiming.run!), UNC_ACTION_DURATIONS.guard);

  // Level-up and shop skill candidates use the active character's attack
  // menu. Wind is not a John/Bard stance, lightning is not an Unc stance,
  // while poison remains a usable passive for the physical roster.
  let johnSkillLevel = startedRun();
  johnSkillLevel.run!.queuedLevels = 1;
  johnSkillLevel = act(johnSkillLevel, { type: "ROLL_DICE" });
  assert.ok(johnSkillLevel.run!.skillOptions!.every(skill => skill.type !== "wind"));
  const learnedExceptPoison: Skill["type"][] = [
    "fire", "cold", "acid", "lightning", "wind", "vampire",
    "first_strike", "speed_boost", "defense_boost", "execute", "combo", "counter",
  ];
  johnSkillLevel.run!.phase = "explore";
  johnSkillLevel.run!.skillOptions = null;
  johnSkillLevel.run!.skills = learnedExceptPoison.map((type, index) => ({
    id: `learned-${index}`,
    name: "Learned",
    description: "",
    type,
  }));
  johnSkillLevel.run!.queuedLevels = 1;
  johnSkillLevel = act(johnSkillLevel, { type: "ROLL_DICE" });
  assert.deepEqual(johnSkillLevel.run!.skillOptions!.map(skill => skill.type), ["poison"]);
  let uncSkillLevel = startedRun();
  uncSkillLevel = act(uncSkillLevel, { type: "RESET_SAVE" });
  uncSkillLevel = act(uncSkillLevel, { type: "START_RUN", characterId: "unc" });
  uncSkillLevel = act(uncSkillLevel, { type: "FINISH_TRAIL_CINEMATIC" });
  uncSkillLevel.run!.queuedLevels = 1;
  uncSkillLevel = act(uncSkillLevel, { type: "ROLL_DICE" });
  assert.ok(uncSkillLevel.run!.skillOptions!.every(skill => skill.type !== "lightning"));
  let johnShop = startedRun();
  johnShop.run!.phase = "shop";
  johnShop.run!.gold = 100;
  johnShop = act(johnShop, { type: "REROLL_SHOP" });
  assert.notEqual(
    johnShop.run!.shopItems!.find(item => item.skill)?.skill?.type,
    "wind",
  );
  let uncShop = act(createInitialState(), { type: "START_RUN", characterId: "unc" });
  uncShop = act(uncShop, { type: "FINISH_TRAIL_CINEMATIC" });
  uncShop.run!.phase = "shop";
  uncShop.run!.gold = 100;
  uncShop = act(uncShop, { type: "REROLL_SHOP" });
  assert.notEqual(
    uncShop.run!.shopItems!.find(item => item.skill)?.skill?.type,
    "lightning",
  );

  // Hold My Beer is one committed turn with two bludgeoning hits on one
  // target. It increments the attack sequence once, never retargets after a
  // kill, and remains unavailable for the rest of that encounter.
  const uncEnemy: EnemyState = {
    ...skeleton,
    id: "unc-special-target",
    name: "Wolf",
    speciesKey: "wolf",
    hp: 1000,
    maxHp: 1000,
    defense: 0,
    attack: 0,
  };
  let uncSpecial = combatState(uncEnemy);
  uncSpecial.run!.characterId = "unc";
  uncSpecial.run!.attack = 10;
  uncSpecial.run!.skills = [];
  uncSpecial.run!.enemies = [{ ...uncEnemy }, { ...uncEnemy, id: "unc-special-other", hp: 100, maxHp: 100 }];
  uncSpecial = act(uncSpecial, { type: "UNC_HOLD_MY_BEER", targetId: "unc-special-target" });
  assert.equal(uncSpecial.run!.playerCombat!.holdMyBeerUsed, true);
  assert.equal(uncSpecial.run!.playerCombat!.lastAttackKind, "hold_my_beer");
  assert.equal(uncSpecial.run!.playerCombat!.heroAttackSequence, 1);
  assert.equal(uncSpecial.run!.playerCombat!.roundCounter, 1);
  assert.equal(uncSpecial.run!.enemies[0].hp, 980);
  assert.equal(uncSpecial.run!.enemies[1].hp, 100);
  assert.equal(uncSpecial.run!.combatTurn, "enemy");
  assert.equal(getEnemyResponseDelayMs(uncSpecial.run!), UNC_ACTION_DURATIONS.special);
  const usedSpecial = JSON.stringify(uncSpecial.run);
  assert.equal(JSON.stringify(act(uncSpecial, {
    type: "UNC_HOLD_MY_BEER",
    targetId: "unc-special-other",
  }).run), usedSpecial);
  uncSpecial = act(uncSpecial, { type: "RESOLVE_ENEMY_TURN" });
  uncSpecial = act(uncSpecial, { type: "PLAYER_ATTACK", targetId: "unc-special-other" });
  assert.equal(uncSpecial.run!.playerCombat!.lastAttackKind, "normal");

  // A first punch that kills cannot spill its second punch to another target.
  let noSpill = combatState({ ...uncEnemy, id: "unc-special-kill", hp: 5, maxHp: 5 });
  noSpill.run!.characterId = "unc";
  noSpill.run!.attack = 10;
  noSpill.run!.enemies = [
    { ...uncEnemy, id: "unc-special-kill", hp: 5, maxHp: 5 },
    { ...uncEnemy, id: "unc-special-spill", hp: 100, maxHp: 100 },
  ];
  noSpill = act(noSpill, { type: "UNC_HOLD_MY_BEER", targetId: "unc-special-kill" });
  assert.equal(noSpill.run!.enemies[0].hp, 100);
  assert.equal(noSpill.run!.playerCombat!.heroAttackSequence, 1);
  assert.equal(noSpill.run!.combatTurn, "enemy");

  // A speed-2 Unc special uses half the authored duration for its victory
  // report; report timing for other heroes remains unaffected elsewhere.
  let speedSpecial = combatState({ ...uncEnemy, id: "unc-speed-special", hp: 5, maxHp: 5 });
  speedSpecial.run!.characterId = "unc";
  speedSpecial.run!.combatSpeed = 2;
  speedSpecial.run!.attack = 10;
  speedSpecial.run!.enemies = [{ ...uncEnemy, id: "unc-speed-special", hp: 5, maxHp: 5 }];
  const originalNow = Date.now;
  try {
    Date.now = () => 123456;
    speedSpecial = act(speedSpecial, { type: "UNC_HOLD_MY_BEER", targetId: "unc-speed-special" });
    assert.equal(
      speedSpecial.run!.victoryReport!.showAt,
      123456 + UNC_ACTION_DURATIONS.special / 2,
    );
  } finally {
    Date.now = originalNow;
  }

  // Combat initialization starts a fresh special charge, but save migration
  // preserves a consumed charge during an in-progress fight.
  let freshSpecial = startedRun();
  freshSpecial.run!.characterId = "unc";
  freshSpecial.run!.phase = "event_test_of_might";
  freshSpecial.run!.trailCinematic = null;
  freshSpecial.run!.playerCombat = null;
  freshSpecial = act(freshSpecial, { type: "TEST_OF_MIGHT_ENTER" });
  assert.equal(freshSpecial.run!.playerCombat!.holdMyBeerUsed, false);
  freshSpecial.run!.playerCombat!.holdMyBeerUsed = true;
  const restoredSpecial = validateState(JSON.parse(JSON.stringify(freshSpecial)));
  assert.equal(restoredSpecial.run!.playerCombat!.holdMyBeerUsed, true);

  // Unc death owns an authored presentation before defeat can be exited. The
  // marker round-trips through a save and only the finish action clears it.
  let uncDefeat = combatState({ ...skeleton, id: "unc-death", attack: 1 });
  uncDefeat.run!.characterId = "unc";
  uncDefeat.run!.hp = 1;
  uncDefeat = act(uncDefeat, { type: "PLAYER_ATTACK" });
  uncDefeat = act(uncDefeat, { type: "RESOLVE_ENEMY_TURN" });
  assert.equal(uncDefeat.run!.phase, "defeat");
  assert.equal(uncDefeat.run!.heroDeathPending, true);
  const deathSnapshot = JSON.stringify(uncDefeat.run);
  assert.equal(JSON.stringify(act(uncDefeat, { type: "RETURN_TO_LOBBY" }).run), deathSnapshot);
  assert.equal(JSON.stringify(act(uncDefeat, { type: "START_RUN" }).run), deathSnapshot);
  const restoredDeath = validateState(JSON.parse(JSON.stringify(uncDefeat)));
  assert.equal(restoredDeath.run!.heroDeathPending, true);
  const finishedDeath = act(restoredDeath, { type: "FINISH_HERO_DEATH" });
  assert.equal(finishedDeath.run!.heroDeathPending, false);
  const oldDefeat = JSON.parse(JSON.stringify(finishedDeath));
  delete oldDefeat.run.heroDeathPending;
  assert.equal(validateState(oldDefeat).run!.heroDeathPending, false);

  // Shop listings expose stock, sell consumables, and disappear after a buy.
  let shop = startedRun();
  shop.run!.phase = "shop";
  shop.run!.gold = 1000;
  shop = act(shop, { type: "REROLL_SHOP" });
  assert.ok(shop.run!.shopItems!.every(item => item.stock === 1));
  const potionListing = shop.run!.shopItems!.find(item => item.consumable === "health_potion");
  assert.ok(potionListing);
  const potionCount = shop.run!.consumables.health_potion;
  shop = act(shop, { type: "BUY_SHOP", itemId: potionListing!.id });
  assert.equal(shop.run!.consumables.health_potion, potionCount + 1);
  assert.equal(shop.run!.shopItems!.some(item => item.id === potionListing!.id), false);

  // Every displayed species has at least one usable attack stance.
  for (const speciesKey of [...NORMAL_ROSTER, ...ELITE_ROSTER]) {
    assert.ok(
      ATTACK_STYLES.some(style => calculateDamage(10, 0, speciesKey, style.damageType).amount > 0),
      `${speciesKey} must have a viable stance`,
    );
  }
  assert.equal(speciesKeyForName("Dire Wolf"), "winter_wolf");
  assert.equal(BESTIARY.mummy.vulnerabilities[0].damageType, "fire");

  // Speed is a deterministic combat stat: 40 is the base and each 20 above
  // it adds one successful outgoing damage, capped at five.
  assert.equal(getCombatSpeedBonus(40), 0);
  assert.equal(getCombatSpeedBonus(100), 3);
  assert.equal(getCombatSpeedBonus(999), 5);
  const pacedEnemy: EnemyState = {
    id: "paced",
    name: "Wolf",
    speciesKey: "wolf",
    hp: 100,
    maxHp: 100,
    attack: 0,
    defense: 0,
    speed: 0,
    attackTimer: 0,
  };
  let paced = combatState(pacedEnemy);
  paced.run!.speed = 100;
  paced = act(paced, { type: "PLAYER_ATTACK" });
  assert.equal(paced.run!.enemies[0].hp, 87);

  // Consumables advance rounds but not the attack sequence: the third actual
  // attack, not the third committed action, receives Combo Mastery.
  const comboEnemy: EnemyState = {
    ...pacedEnemy,
    id: "combo",
    hp: 1000,
    maxHp: 1000,
  };
  let combo = combatState(comboEnemy, [{
    id: "combo-skill",
    name: "Combo Mastery",
    description: "Every 3rd attack deals 1.5x damage",
    type: "combo",
  }]);
  combo.run!.hp = 1;
  combo = act(combo, { type: "USE_CONSUMABLE", consumable: "health_potion" });
  combo = act(combo, { type: "RESOLVE_ENEMY_TURN" });
  combo = act(combo, { type: "USE_CONSUMABLE", consumable: "health_potion" });
  combo = act(combo, { type: "RESOLVE_ENEMY_TURN" });
  assert.equal(combo.run!.playerCombat!.heroAttackSequence, 0);
  combo = act(combo, { type: "PLAYER_ATTACK" });
  combo = act(combo, { type: "RESOLVE_ENEMY_TURN" });
  combo = act(combo, { type: "PLAYER_ATTACK" });
  combo = act(combo, { type: "RESOLVE_ENEMY_TURN" });
  const afterTwoAttacks = combo.run!.enemies[0].hp;
  combo = act(combo, { type: "PLAYER_ATTACK" });
  assert.equal(combo.run!.playerCombat!.heroAttackSequence, 3);
  assert.equal(combo.run!.enemies[0].hp, afterTwoAttacks - 15);
}

runAssertions();
console.log("Dicebound engine assertions passed.");