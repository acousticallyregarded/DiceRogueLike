import assert from "node:assert/strict";
import {
  act,
  calculateDamage,
  createInitialState,
  NORMAL_ROSTER,
  ELITE_ROSTER,
  getCombatSpeedBonus,
  getEnemyResponseDelayMs,
  POTION_ANIMATION_DURATION_MS,
  FIRE_BOMB_ANIMATION_DURATION_MS,
  GUARD_TONIC_ANIMATION_DURATION_MS,
  DEFAULT_ENEMY_RESPONSE_DELAY_MS,
  BOSS_AWAKENING_DURATION_MS,
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

function combatState(enemy: EnemyState, skills: Skill[] = []) {
  let state = createInitialState();
  state = act(state, { type: "START_RUN" });
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

function runAssertions() {
  // Clockwise perimeter directions use all four sheets, including the
  // wrapped 23 -> 0 north-east step; backward/non-step updates preserve
  // facing in the board component rather than forcing a mirror.
  assert.equal(getWalkDirection(0, 1), "south-east");
  assert.equal(getWalkDirection(6, 7), "south-west");
  assert.equal(getWalkDirection(12, 13), "north-west");
  assert.equal(getWalkDirection(18, 19), "north-east");
  assert.equal(getWalkDirection(23, 0), "north-east");
  assert.equal(getWalkDirection(1, 0), null);

  // The reducer owns the one authentic 2d6 roll. The displayed pair and
  // movement budget are committed together, so a second click cannot replace
  // the result while that roll is being presented.
  let rolled = act(createInitialState(), { type: "START_RUN" });
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

  // Movement takes exactly N clockwise steps, including a 23 -> 0 wrap, and
  // each intermediate index remains one adjacent tile in the same direction.
  let wrapped = act(createInitialState(), { type: "START_RUN" });
  wrapped.run!.position = 22;
  wrapped.run!.phase = "moving";
  wrapped.run!.stepsRemaining = 5;
  wrapped.run!.rollAnimating = false;
  wrapped.run!.tiles = wrapped.run!.tiles.map(tile => ({ ...tile, type: "start" }));
  const expectedPositions = [23, 0, 1, 2, 3];
  let previousPosition = wrapped.run!.position;
  for (const expectedPosition of expectedPositions) {
    wrapped = act(wrapped, { type: "STEP_MOVE" });
    assert.equal(wrapped.run!.position, expectedPosition);
    assert.equal(getWalkDirection(previousPosition, expectedPosition) !== null, true);
    previousPosition = expectedPosition;
  }
  assert.equal(wrapped.run!.stepsRemaining, 0);
  assert.equal(wrapped.run!.phase, "explore");

  // The final committed roll finishes its exact movement path before the
  // statue presentation begins. The threshold has priority over whatever tile
  // the last step lands on, but it does not create a boss until chosen.
  assert.equal(BOSS_AWAKENING_DURATION_MS, 2200);
  let finalLanding = act(createInitialState(), { type: "START_RUN" });
  // ROLL_DICE decrements before movement; this is the committed final roll.
  finalLanding.run!.bossRollsLeft = 0;
  finalLanding.run!.position = 0;
  finalLanding.run!.stepsRemaining = 2;
  finalLanding.run!.phase = "moving";
  finalLanding.run!.rollAnimating = false;
  finalLanding.run!.tiles[1] = { id: 1, type: "enemy" };
  finalLanding.run!.tiles[2] = { id: 2, type: "shop" };
  finalLanding = act(finalLanding, { type: "STEP_MOVE" });
  assert.equal(finalLanding.run!.phase, "moving");
  assert.equal(finalLanding.run!.stepsRemaining, 1);
  finalLanding = act(finalLanding, { type: "STEP_MOVE" });
  assert.equal(finalLanding.run!.phase, "boss_awakening");
  assert.equal(finalLanding.run!.bossRollsLeft, 0);
  assert.deepEqual(finalLanding.run!.enemies, []);
  assert.equal(finalLanding.run!.playerCombat, null);
  const awakeningSnapshot = JSON.stringify(finalLanding.run);
  finalLanding = act(finalLanding, { type: "PLAYER_ATTACK" });
  finalLanding = act(finalLanding, { type: "ROLL_DICE" });
  finalLanding = act(finalLanding, { type: "SELECT_ATTACK", damageType: "fire" });
  assert.equal(JSON.stringify(finalLanding.run), awakeningSnapshot);
  finalLanding = act(finalLanding, { type: "COMPLETE_BOSS_AWAKENING" });
  assert.equal(finalLanding.run!.phase, "boss_ready");
  const readySnapshot = JSON.stringify(finalLanding.run);
  finalLanding = act(finalLanding, { type: "COMPLETE_BOSS_AWAKENING" });
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
  let savedAwakening = createInitialState();
  savedAwakening = act(savedAwakening, { type: "START_RUN" });
  savedAwakening.run!.bossRollsLeft = 0;
  savedAwakening.run!.phase = "boss_awakening";
  savedAwakening.run!.enemies = [];
  savedAwakening.run!.playerCombat = null;
  const restoredAwakening = validateState(JSON.parse(JSON.stringify(savedAwakening)));
  assert.equal(restoredAwakening.run!.phase, "boss_awakening");
  const savedReady = act(restoredAwakening, { type: "COMPLETE_BOSS_AWAKENING" });
  const restoredReady = validateState(JSON.parse(JSON.stringify(savedReady)));
  assert.equal(restoredReady.run!.phase, "boss_ready");
  assert.equal(restoredReady.run!.enemies.length, 0);
  assert.equal(restoredReady.run!.playerCombat, null);

  // A pending old v4 threshold with no steps left is migrated into awakening,
  // while an in-flight final roll is left alone until its last step.
  const pendingLegacy = JSON.parse(JSON.stringify(savedAwakening));
  pendingLegacy.run.phase = "moving";
  pendingLegacy.run.stepsRemaining = 0;
  pendingLegacy.run.rollAnimating = false;
  assert.equal(validateState(pendingLegacy).run!.phase, "boss_awakening");
  const inFlightLegacy = JSON.parse(JSON.stringify(savedAwakening));
  inFlightLegacy.run.phase = "moving";
  inFlightLegacy.run.stepsRemaining = 1;
  assert.equal(validateState(inFlightLegacy).run!.phase, "moving");

  // Boss victory settles once; continuing starts the next floor with a fresh
  // statue schedule and no stale boss combat state.
  let bossVictory = createInitialState();
  bossVictory = act(bossVictory, { type: "START_RUN" });
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
  const beforeSettlement = bossVictory.meta.gems;
  bossVictory = act(bossVictory, { type: "CONTINUE_RUN" });
  assert.equal(bossVictory.meta.gems, beforeSettlement + 62);
  assert.equal(bossVictory.run!.floor, 2);
  assert.equal(bossVictory.run!.bossRollsLeft, 30);
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
  let saved = createInitialState();
  saved = act(saved, { type: "START_RUN" });
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

  let selected = act(createInitialState(), { type: "START_RUN" });
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

  // Shop listings expose stock, sell consumables, and disappear after a buy.
  let shop = act(createInitialState(), { type: "START_RUN" });
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