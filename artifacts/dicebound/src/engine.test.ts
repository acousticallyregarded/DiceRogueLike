import assert from "node:assert/strict";
import {
  act,
  calculateDamage,
  createInitialState,
  NORMAL_ROSTER,
  ELITE_ROSTER,
  getCombatSpeedBonus,
  getBardSpellDC,
  getEnemyAttackBonus,
  getEnemyWisdomSaveBonus,
  getPlayerArmorClass,
  getPlayerAttackDurationMs,
  getPendingHeroAttackDurationMs,
  getUnsettledRunRewards,
  getEnemyResponseDelayMs,
  getHeroDeathDurationMs,
  POTION_ANIMATION_DURATION_MS,
  FIRE_BOMB_ANIMATION_DURATION_MS,
  GUARD_TONIC_ANIMATION_DURATION_MS,
  DEFAULT_ENEMY_RESPONSE_DELAY_MS,
  HERO_SWORD_ANIMATION_DURATION_MS,
  BOSS_AWAKENING_DURATION_MS,
  TRAIL_TILE_COUNT,
  getWalkDirection,
  validateState,
  type EnemyState,
  type GameAction,
  type GameStateV4,
  type Skill,
} from "./engine.js";
import {
  ATTACK_STYLES,
  BESTIARY,
  DEFAULT_DAMAGE_TYPE,
  speciesKeyForName,
  type DamageType,
} from "./bestiary.js";
import { CHARACTERS, getCharacter } from "./characters.js";
import { BARD_DURATIONS } from "./bard-moves.js";
import { JOHN_ATTACK_DURATIONS } from "./john-moves.js";
import { UNC_ACTION_DURATIONS } from "./unc-moves.js";
import { LEVELS } from "./level-content.js";

const authenticRandom = Math.random;

function combatState(enemy: EnemyState, skills: Skill[] = []) {
  // Setup UUIDs should not consume a deterministic combat-roll sequence.
  const selectedRandom = Math.random;
  Math.random = authenticRandom;
  try {
    let state = createInitialState();
    state = act(state, { type: "START_RUN" });
    state = act(state, { type: "SKIP_PROLOGUE" });
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
      takedownUsed: false,
    };
    return state;
  } finally {
    Math.random = selectedRandom;
  }
}

function startedRun() {
  let state = act(createInitialState(), { type: "START_RUN" });
  state = act(state, { type: "SKIP_PROLOGUE" });
  state = act(state, { type: "FINISH_TRAIL_CINEMATIC" });
  return state;
}

function commitHeroAttack(state: GameStateV4, action: GameAction): GameStateV4 {
  const committed = act(state, action);
  return committed.run?.playerCombat?.pendingHeroAttack
    ? act(committed, { type: "FINISH_HERO_ATTACK" })
    : committed;
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
  restoredUnc = act(restoredUnc, { type: "SKIP_PROLOGUE" });
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

  // New runs begin with a durable, player-paced prologue. Every other input
  // stays blocked through the prologue and the existing floor intro.
  let intro = act(createInitialState(), { type: "START_RUN" });
  assert.equal(intro.run!.tiles.length, TRAIL_TILE_COUNT);
  assert.equal(intro.run!.position, 0);
  assert.equal(intro.run!.bossCountdown, TRAIL_TILE_COUNT - 1);
  assert.equal(intro.run!.bossRollsLeft, TRAIL_TILE_COUNT - 1);
  assert.equal(intro.run!.trailCinematic, "prologue");
  assert.equal(intro.run!.prologueStep, 0);
  assert.equal(intro.run!.trailIntroSeen, false);
  assert.equal(intro.run!.tiles[TRAIL_TILE_COUNT - 1].type, "boss");
  assert.ok(new Set(intro.run!.tiles.map(tile => tile.type)).size >= 6);
  assert.deepEqual(act(intro, { type: "ROLL_DICE" }).run, intro.run);
  for (let step = 1; step <= 3; step++) {
    intro = act(intro, { type: "FINISH_TRAIL_CINEMATIC" });
    assert.equal(intro.run!.trailCinematic, "prologue");
    assert.equal(intro.run!.prologueStep, step);
  }
  intro = act(intro, { type: "FINISH_TRAIL_CINEMATIC" });
  assert.equal(intro.run!.trailCinematic, "intro");
  assert.equal(intro.run!.prologueStep, undefined);
  intro = act(intro, { type: "FINISH_TRAIL_CINEMATIC" });
  assert.equal(intro.run!.trailCinematic, null);
  assert.equal(intro.run!.trailIntroSeen, true);

  let skippedStory = act(createInitialState(), { type: "START_RUN", characterId: "unc" });
  skippedStory = act(skippedStory, { type: "SKIP_PROLOGUE" });
  assert.equal(skippedStory.run!.trailCinematic, "intro");
  assert.equal(skippedStory.run!.prologueStep, undefined);

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
  assert.deepEqual(
    {
      hp: finalLanding.run!.enemies[0].hp,
      attack: finalLanding.run!.enemies[0].attack,
      defense: finalLanding.run!.enemies[0].defense,
    },
    { hp: 170, attack: 16, defense: 5 },
  );
  let kingTurns = JSON.parse(JSON.stringify(finalLanding));
  kingTurns.run.hp = 1000;
  kingTurns.run.maxHp = 1000;
  kingTurns.run.attack = 0;
  for (const expected of ["sword", "fireball", "sword"]) {
    kingTurns = commitHeroAttack(kingTurns, { type: "PLAYER_ATTACK" });
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

  // Non-terminal Continue starts the next floor without crediting the wallet;
  // terminal settlement converts only the remaining cumulative run rewards.
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
  bossVictory = commitHeroAttack(bossVictory, { type: "PLAYER_ATTACK" });
  assert.equal(bossVictory.run!.phase, "victory");
  assert.equal(bossVictory.run!.victoryReport!.gold, 120);
  assert.equal(bossVictory.run!.victoryReport!.gems, 50);
  assert.equal(bossVictory.run!.victoryReport!.xp, 0);
  const pendingReport = JSON.stringify(bossVictory);
  assert.equal(JSON.stringify(act(bossVictory, { type: "CONTINUE_RUN" })), pendingReport);
  assert.deepEqual(validateState(bossVictory).run!.victoryReport, bossVictory.run!.victoryReport);
  bossVictory = act(bossVictory, { type: "DISMISS_VICTORY_REPORT" });
  const beforeInterimSettlement = bossVictory.meta.gems;
  bossVictory = act(bossVictory, { type: "CONTINUE_RUN" });
  assert.equal(bossVictory.meta.gems, beforeInterimSettlement);
  assert.equal(bossVictory.run!.floor, 2);
  assert.equal(bossVictory.run!.bossCountdown, TRAIL_TILE_COUNT - 1);
  assert.equal(bossVictory.run!.bossRollsLeft, TRAIL_TILE_COUNT - 1);
  assert.equal(bossVictory.run!.position, 0);
  assert.equal(bossVictory.run!.phase, "explore");
  assert.equal(bossVictory.run!.isBossCombat, false);
  assert.deepEqual(bossVictory.run!.enemies, []);
  assert.equal(bossVictory.run!.playerCombat, null);

  // A spend followed by new earnings is settled from the terminal balance,
  // while the earlier floor remains uncredited. The old 120 gold becomes
  // 70, then 30 is earned, so 100 gold + 50 gems => 60 wallet gems.
  bossVictory.run!.gold -= 50;
  bossVictory.run!.gold += 30;
  bossVictory.run!.floor = LEVELS.length;
  bossVictory.run!.phase = "victory";
  bossVictory.run!.trailCinematic = null;
  bossVictory.run!.victoryReport = null;
  const beforeTerminalSettlement = bossVictory.meta.gems;
  const blockedTerminalContinue = act(bossVictory, { type: "CONTINUE_RUN" });
  assert.equal(blockedTerminalContinue.run!.phase, "victory");
  assert.equal(blockedTerminalContinue.meta.gems, beforeTerminalSettlement);
  const blockedRestart = act(blockedTerminalContinue, { type: "START_RUN", characterId: "unc" });
  assert.deepEqual(blockedRestart, blockedTerminalContinue);
  bossVictory = blockedTerminalContinue;
  for (let step = 1; step <= 3; step++) {
    bossVictory = act(bossVictory, { type: "ADVANCE_FINAL_EPILOGUE" });
    assert.equal(bossVictory.run!.finalEpilogueStep, step);
    assert.equal(bossVictory.meta.gems, beforeTerminalSettlement);
    bossVictory = validateState(JSON.parse(JSON.stringify(bossVictory)));
  }
  bossVictory = act(bossVictory, { type: "ADVANCE_FINAL_EPILOGUE" });
  assert.equal(bossVictory.run, null);
  assert.equal(bossVictory.meta.gems, beforeTerminalSettlement + 60);
  const settledState = JSON.stringify(bossVictory);
  bossVictory = act(bossVictory, { type: "ADVANCE_FINAL_EPILOGUE" });
  assert.equal(JSON.stringify(bossVictory), settledState);

  // A legacy settled:true save has no historical ledger. Loading it records
  // the current totals as a conservative baseline, never replays old credit,
  // and never deducts wallet gems when gold fell before a future earning.
  const legacySettled = JSON.parse(JSON.stringify(startedRun()));
  legacySettled.meta.gems = 100;
  legacySettled.run.settled = true;
  delete legacySettled.run.settledGold;
  delete legacySettled.run.settledGems;
  legacySettled.run.gold = 80;
  const migratedSettled = validateState(legacySettled);
  assert.equal(migratedSettled.run!.settledGold, 8);
  assert.equal(migratedSettled.run!.settledGems, migratedSettled.run!.gemsEarned);
  migratedSettled.run!.gold += 30;
  migratedSettled.run!.floor = LEVELS.length;
  migratedSettled.run!.phase = "victory";
  migratedSettled.run!.trailCinematic = null;
  migratedSettled.run!.victoryReport = null;
  assert.deepEqual(getUnsettledRunRewards(migratedSettled.run!), {
    goldReward: 3,
    gemReward: 0,
    total: 3,
  });
  const blockedTerminalExit = act(migratedSettled, { type: "CONTINUE_RUN" });
  assert.equal(blockedTerminalExit.run!.phase, "victory");
  let terminalLegacy = blockedTerminalExit;
  for (let step = 1; step <= 3; step++) {
    terminalLegacy = act(terminalLegacy, { type: "ADVANCE_FINAL_EPILOGUE" });
    assert.equal(terminalLegacy.run!.finalEpilogueStep, step);
  }
  terminalLegacy = act(terminalLegacy, { type: "ADVANCE_FINAL_EPILOGUE" });
  assert.equal(terminalLegacy.run, null);
  assert.equal(terminalLegacy.meta.gems, 103);
  assert.equal(act(terminalLegacy, { type: "ADVANCE_FINAL_EPILOGUE" }).meta.gems, 103);

  // Reloaded final epilogues normalize malformed progress before selecting a card.
  const malformedEpilogue = JSON.parse(JSON.stringify(startedRun()));
  malformedEpilogue.run.floor = LEVELS.length;
  malformedEpilogue.run.phase = "victory";
  malformedEpilogue.run.finalEpilogueStep = -99;
  assert.equal(validateState(malformedEpilogue).run!.finalEpilogueStep, 0);
  malformedEpilogue.run.finalEpilogueStep = 99;
  assert.equal(validateState(malformedEpilogue).run!.finalEpilogueStep, 3);

  // Traits are applied after defense: resistance floors, vulnerability doubles,
  // and immunity is exactly zero (never promoted to one).
  assert.equal(calculateDamage(14, 2, "skeleton", "bludgeoning").amount, 24);
  assert.equal(calculateDamage(13, 1, "ochre_jelly", "acid").amount, 6);
  assert.equal(calculateDamage(13, 1, "ochre_jelly", "lightning").amount, 0);
  assert.equal(calculateDamage(10, 0, "mummy", "slashing").amount, 5);
  assert.equal(calculateDamage(10, 0, "mummy", "fire").amount, 20);
  // Bard's first-pass spell math is intentionally compact: no six-stat sheet,
  // a fixed +3 Charisma surrogate, and standard level bands for proficiency.
  assert.equal(getBardSpellDC({ level: 1 }), 13);
  assert.equal(getBardSpellDC({ level: 5 }), 14);
  assert.equal(getBardSpellDC({ level: 9 }), 15);
  assert.equal(getBardSpellDC({ level: 13 }), 16);
  assert.equal(getBardSpellDC({ level: 17 }), 17);
  assert.equal(getBardSpellDC({ level: 99 }), 17);
  assert.equal(getPlayerArmorClass({ defense: 4 }), 14);
  assert.equal(getEnemyWisdomSaveBonus({ speciesKey: "wolf" }), 1);
  assert.equal(getEnemyWisdomSaveBonus({ speciesKey: "goblin" }), -1);
  assert.equal(getEnemyWisdomSaveBonus({ speciesKey: "skeleton" }), -1);
  assert.equal(getEnemyWisdomSaveBonus({ speciesKey: "ochre_jelly" }), -2);
  assert.equal(getEnemyWisdomSaveBonus({ speciesKey: "ogre" }), -2);
  assert.equal(getEnemyWisdomSaveBonus({ speciesKey: "winter_wolf" }), 1);
  assert.equal(getEnemyWisdomSaveBonus({ speciesKey: "mummy" }), 2);
  assert.equal(getEnemyWisdomSaveBonus({ name: "Unknown Monster" }), 0);
  assert.equal(getEnemyWisdomSaveBonus({ name: "The Unknown King", boss: true }), 2);
  assert.equal(getEnemyAttackBonus({ speciesKey: "wolf" }), 5);
  assert.equal(getEnemyAttackBonus({ name: "Unknown Monster" }), 3);

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
  poisoned = commitHeroAttack(poisoned, { type: "PLAYER_ATTACK" });
  poisoned = act(poisoned, { type: "RESOLVE_ENEMY_TURN" });
  const hpAfterHit = poisoned.run!.enemies[0].hp;
  poisoned = commitHeroAttack(poisoned, { type: "PLAYER_ATTACK" });
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
  leeched = commitHeroAttack(leeched, { type: "PLAYER_ATTACK" });
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
  countered = commitHeroAttack(countered, { type: "PLAYER_ATTACK" });
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

  // A committed hero attack leaves all impact state untouched until the
  // animation finish action. The durable snapshot survives reload and is
  // consumed exactly once.
  const pendingWolf: EnemyState = {
    ...skeleton,
    id: "pending-hero-wolf",
    name: "Wolf",
    speciesKey: "wolf",
    hp: 100,
    maxHp: 100,
    attack: 0,
    defense: 0,
    poisoned: true,
    poisonTimerMs: 9000,
  };
  let pendingHero = combatState(pendingWolf, [
    {
      id: "pending-poison",
      name: "Poison Strike",
      description: "",
      type: "poison",
    },
    {
      id: "pending-leech",
      name: "Life Leech",
      description: "",
      type: "vampire",
    },
  ]);
  pendingHero.run!.attack = 10;
  pendingHero.run!.hp = 10;
  const pendingFeedback = pendingHero.run!.combatFeedback;
  pendingHero = act(pendingHero, { type: "PLAYER_ATTACK", targetId: pendingWolf.id });
  assert.equal(pendingHero.run!.enemies[0].hp, 100);
  assert.equal(pendingHero.run!.enemies[0].poisonTimerMs, 9000);
  assert.equal(pendingHero.run!.hp, 10);
  assert.equal(pendingHero.run!.combatFeedback, pendingFeedback);
  assert.equal(pendingHero.run!.playerCombat!.heroAttackSequence, 1);
  assert.equal(pendingHero.run!.playerCombat!.roundCounter, 1);
  assert.equal(pendingHero.run!.playerCombat!.pendingHeroAttack!.targetId, pendingWolf.id);
  assert.equal(getEnemyResponseDelayMs(pendingHero.run!), DEFAULT_ENEMY_RESPONSE_DELAY_MS);
  const restoredPendingHero = validateState(JSON.parse(JSON.stringify(pendingHero)));
  assert.ok(restoredPendingHero.run!.playerCombat!.pendingHeroAttack);
  const pendingAfterFinish = act(restoredPendingHero, { type: "FINISH_HERO_ATTACK" });
  assert.equal(pendingAfterFinish.run!.enemies[0].hp, 89);
  assert.equal(pendingAfterFinish.run!.hp, 11);
  assert.equal(pendingAfterFinish.run!.playerCombat!.pendingHeroAttack, undefined);
  assert.equal(pendingAfterFinish.run!.playerCombat!.heroImpactResolved, true);
  assert.equal(getEnemyResponseDelayMs(pendingAfterFinish.run!), 500);
  const pendingAfterDuplicateFinish = act(pendingAfterFinish, { type: "FINISH_HERO_ATTACK" });
  assert.equal(JSON.stringify(pendingAfterDuplicateFinish.run), JSON.stringify(pendingAfterFinish.run));
  const pendingAfterResponse = act(pendingAfterFinish, { type: "RESOLVE_ENEMY_TURN" });
  assert.equal(pendingAfterResponse.run!.playerCombat!.heroImpactResolved, false);

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

  // A successful potion is a bonus action: it heals and animates without
  // advancing the round, applying poison, or handing the turn to enemies.
  let potion = combatState({ ...skeleton, id: "potion", hp: 50 });
  potion.run!.maxHp = 100;
  potion.run!.consumables.health_potion = 2;
  potion.run!.poisonStacks = 2;
  const potionRound = potion.run!.playerCombat!.roundCounter;
  potion = act(potion, { type: "USE_CONSUMABLE", consumable: "health_potion" });
  assert.equal(potion.run!.consumables.health_potion, 1);
  assert.equal(potion.run!.playerCombat!.lastConsumable, "health_potion");
  assert.equal(potion.run!.playerCombat!.heroConsumableSequence, 1);
  assert.equal(potion.run!.combatTurn, "player");
  assert.equal(potion.run!.playerCombat!.roundCounter, potionRound);
  assert.equal(potion.run!.poisonStacks, 2);
  const reloadedPotion = validateState(JSON.parse(JSON.stringify(potion)));
  assert.equal(reloadedPotion.run!.consumables.health_potion, 1);
  assert.equal(reloadedPotion.run!.playerCombat!.lastConsumable, "health_potion");
  const resolvedReloadedPotion = act(reloadedPotion, { type: "FINISH_BONUS_CONSUMABLE" });
  assert.equal(resolvedReloadedPotion.run!.combatTurn, "player");
  assert.equal(resolvedReloadedPotion.run!.playerCombat!.lastConsumable, null);
  potion = act(potion, { type: "FINISH_BONUS_CONSUMABLE" });
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

  // Guard Tonic is also a bonus action; Fire Bomb still consumes the full turn.
  let otherConsumable = combatState({ ...skeleton, id: "other-consumables", hp: 50 });
  const guardRound = otherConsumable.run!.playerCombat!.roundCounter;
  otherConsumable = act(otherConsumable, { type: "USE_CONSUMABLE", consumable: "guard_tonic" });
  assert.equal(otherConsumable.run!.playerCombat!.lastConsumable, "guard_tonic");
  assert.equal(otherConsumable.run!.consumables.guard_tonic, 0);
  assert.equal(otherConsumable.run!.playerCombat!.heroConsumableSequence, 1);
  assert.equal(otherConsumable.run!.combatTurn, "player");
  assert.equal(otherConsumable.run!.playerCombat!.roundCounter, guardRound);

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
  const bardBomb = validateState(JSON.parse(JSON.stringify(bomb)));
  bardBomb.run!.characterId = "alan-a-dale";
  assert.equal(getEnemyResponseDelayMs(bardBomb.run!), 4200);
  const uncBomb = validateState(JSON.parse(JSON.stringify(bomb)));
  uncBomb.run!.characterId = "unc";
  assert.equal(getEnemyResponseDelayMs(uncBomb.run!), 4200);
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

  // Guard is consumed as a bonus action and remains active for the player's
  // subsequent full action and the next enemy response.
  let guarded = combatState({ ...skeleton, id: "guarded", attack: 20 });
  guarded.run!.defense = 0;
  guarded = act(guarded, { type: "USE_CONSUMABLE", consumable: "guard_tonic" });
  assert.equal(guarded.run!.guardActive, true);
  assert.equal(guarded.run!.playerCombat!.lastConsumable, "guard_tonic");
  assert.equal(guarded.run!.combatTurn, "player");
  const savedGuard = validateState(JSON.parse(JSON.stringify(guarded)));
  assert.equal(savedGuard.run!.consumables.guard_tonic, 0);
  assert.equal(savedGuard.run!.playerCombat!.heroConsumableSequence, 1);
  const finishedGuardAnimation = act(savedGuard, { type: "FINISH_BONUS_CONSUMABLE" });
  assert.equal(finishedGuardAnimation.run!.playerCombat!.lastConsumable, null);
  const guardAttack = act(finishedGuardAnimation, { type: "PLAYER_ATTACK" });
  const guardImpact = act(guardAttack, { type: "FINISH_HERO_ATTACK" });
  const resolvedGuard = act(guardImpact, { type: "RESOLVE_ENEMY_TURN" });
  assert.equal(resolvedGuard.run!.guardActive, false);
  assert.equal(resolvedGuard.run!.playerCombat!.lastConsumable, null);
  assert.equal(resolvedGuard.run!.hp, 40);
  assert.equal(getEnemyResponseDelayMs(resolvedGuard.run!), DEFAULT_ENEMY_RESPONSE_DELAY_MS);
  const resolvedGuardAgain = act(resolvedGuard, { type: "RESOLVE_ENEMY_TURN" });
  assert.equal(JSON.stringify(resolvedGuardAgain.run), JSON.stringify(resolvedGuard.run));

  // Deliberate combat has no exhaustion timeout; defeat settlement is idempotent.
  let defeated = combatState({ ...skeleton, id: "defeated", attack: 100, hp: 1000, maxHp: 1000 });
  defeated.run!.hp = 1;
  defeated = commitHeroAttack(defeated, { type: "PLAYER_ATTACK" });
  defeated = act(defeated, { type: "RESOLVE_ENEMY_TURN" });
  const gemsAfterDefeat = defeated.meta.gems;
  defeated = act(defeated, { type: "RESOLVE_ENEMY_TURN" });
  assert.equal(defeated.meta.gems, gemsAfterDefeat);

  // Unc's authored action sheets drive the special and class-consumable
  // timings, while the existing hero timings remain unchanged.
  assert.deepEqual(UNC_ACTION_DURATIONS, {
    guard: 2500,
    health: 2100,
    special: 4100,
    death: 4100,
    hurt: 2100,
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
  assert.equal(getEnemyResponseDelayMs(uncTiming.run!), UNC_ACTION_DURATIONS.health / 2);
  assert.equal(getEnemyResponseDelayMs(validateState(JSON.parse(JSON.stringify(uncTiming))).run!), UNC_ACTION_DURATIONS.health / 2);
  uncTiming.run!.playerCombat!.lastConsumable = "guard_tonic";
  assert.equal(getEnemyResponseDelayMs(uncTiming.run!), UNC_ACTION_DURATIONS.guard / 2);
  assert.equal(getEnemyResponseDelayMs(validateState(JSON.parse(JSON.stringify(uncTiming))).run!), UNC_ACTION_DURATIONS.guard / 2);

  // Alan-a-Dale's authored attack sheets map all physical styles to the lute
  // bludgeon clip, lightning to the electric clip, and every other magical
  // style to the magic clip. Pending impact timing uses the committed style
  // and playback pace rather than the current stance.
  assert.deepEqual(BARD_DURATIONS, {
    electric: 4100,
    bludgeoning: 2100,
    magic: 2900,
    idle: 4200,
    hurt: 2500,
    death: 2500,
    walk: 4200,
  });
  const bardStyles: Skill[] = [
    "fire", "cold", "acid", "lightning",
  ].map((type, index) => ({
    id: `bard-style-${index}`,
    name: type,
    description: "",
    type: type as Skill["type"],
  }));
  const bardTiming = combatState({ ...skeleton, id: "bard-timing", hp: 1000 }, bardStyles);
  bardTiming.run!.characterId = "alan-a-dale";
  bardTiming.run!.combatSpeed = 2;
  for (const damageType of ["slashing", "piercing", "bludgeoning"] as const) {
    bardTiming.run!.selectedDamageType = damageType;
    assert.equal(getPlayerAttackDurationMs(bardTiming.run!), BARD_DURATIONS.bludgeoning);
  }
  for (const damageType of ["fire", "cold", "acid"] as const) {
    bardTiming.run!.selectedDamageType = damageType;
    assert.equal(getPlayerAttackDurationMs(bardTiming.run!), BARD_DURATIONS.magic);
  }
  bardTiming.run!.selectedDamageType = "lightning";
  assert.equal(getPlayerAttackDurationMs(bardTiming.run!), BARD_DURATIONS.electric);
  bardTiming.run!.combatTurn = "player";
  const bardTargetHp = bardTiming.run!.enemies[0].hp;
  const committedBard = act(bardTiming, {
    type: "PLAYER_ATTACK",
    targetId: bardTiming.run!.enemies[0].id,
  });
  assert.equal(committedBard.run!.enemies[0].hp, bardTargetHp);
  assert.equal(
    getPendingHeroAttackDurationMs(committedBard.run!),
    BARD_DURATIONS.electric / 2,
  );
  assert.equal(getEnemyResponseDelayMs(committedBard.run!), BARD_DURATIONS.electric / 2);
  const landedBard = act(committedBard, { type: "FINISH_HERO_ATTACK" });
  assert.ok(landedBard.run!.enemies[0].hp < bardTargetHp);
  assert.equal(getEnemyResponseDelayMs(landedBard.run!), 500 / 2);

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
  uncSkillLevel = act(uncSkillLevel, { type: "SKIP_PROLOGUE" });
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
  uncShop = act(uncShop, { type: "SKIP_PROLOGUE" });
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
  assert.equal(uncSpecial.run!.enemies[0].hp, 1000);
  assert.equal(uncSpecial.run!.enemies[1].hp, 100);
  assert.equal(uncSpecial.run!.combatTurn, "enemy");
  assert.equal(getEnemyResponseDelayMs(uncSpecial.run!), UNC_ACTION_DURATIONS.special);
  assert.equal(getPendingHeroAttackDurationMs(uncSpecial.run!), UNC_ACTION_DURATIONS.special);
  assert.equal(uncSpecial.run!.playerCombat!.pendingHeroAttack!.targetId, "unc-special-target");
  uncSpecial = act(uncSpecial, { type: "FINISH_HERO_ATTACK" });
  assert.equal(uncSpecial.run!.enemies[0].hp, 980);
  assert.equal(getEnemyResponseDelayMs(uncSpecial.run!), 500);
  const usedSpecial = JSON.stringify(uncSpecial.run);
  assert.equal(JSON.stringify(act(uncSpecial, {
    type: "UNC_HOLD_MY_BEER",
    targetId: "unc-special-other",
  }).run), usedSpecial);
  uncSpecial = act(uncSpecial, { type: "RESOLVE_ENEMY_TURN" });
  uncSpecial = commitHeroAttack(uncSpecial, { type: "PLAYER_ATTACK", targetId: "unc-special-other" });
  assert.equal(uncSpecial.run!.playerCombat!.lastAttackKind, "normal");

  // A first punch that kills cannot spill its second punch to another target.
  let noSpill = combatState({ ...uncEnemy, id: "unc-special-kill", hp: 5, maxHp: 5 });
  noSpill.run!.characterId = "unc";
  noSpill.run!.attack = 10;
  noSpill.run!.enemies = [
    { ...uncEnemy, id: "unc-special-kill", hp: 5, maxHp: 5 },
    { ...uncEnemy, id: "unc-special-spill", hp: 100, maxHp: 100 },
  ];
  noSpill = commitHeroAttack(noSpill, { type: "UNC_HOLD_MY_BEER", targetId: "unc-special-kill" });
  assert.equal(noSpill.run!.enemies[0].hp, 100);
  assert.equal(noSpill.run!.playerCombat!.heroAttackSequence, 1);
  assert.equal(noSpill.run!.combatTurn, "enemy");

  // A final special kill uses only the regular corpse window, scaled by the
  // current Unc playback speed rather than replaying the special sheet.
  let speedSpecial = combatState({ ...uncEnemy, id: "unc-speed-special", hp: 5, maxHp: 5 });
  speedSpecial.run!.characterId = "unc";
  speedSpecial.run!.combatSpeed = 2;
  speedSpecial.run!.attack = 10;
  speedSpecial.run!.enemies = [{ ...uncEnemy, id: "unc-speed-special", hp: 5, maxHp: 5 }];
  const originalNow = Date.now;
  try {
    Date.now = () => 123456;
    speedSpecial = commitHeroAttack(speedSpecial, { type: "UNC_HOLD_MY_BEER", targetId: "unc-speed-special" });
    assert.equal(
      speedSpecial.run!.victoryReport!.showAt,
      123456 + HERO_SWORD_ANIMATION_DURATION_MS / 2,
    );
  } finally {
    Date.now = originalNow;
  }

  // John's authored attacks use exact timings; Slash keeps its original clip.
  assert.deepEqual(JOHN_ATTACK_DURATIONS, {
    lightning: 1700,
    cold: 900,
    acid: 2500,
    piercing: 2100,
    fire: 2500,
    bludgeoning: 2500,
    takedown: 2900,
  });
  const johnTiming = combatState({ ...skeleton, id: "john-timing", hp: 1000 });
  johnTiming.run!.combatSpeed = 2;
  const johnTimingSkills: Skill[] = ["cold", "acid", "fire", "lightning"].map((type, index) => ({
    id: `john-timing-${index}`,
    name: type,
    description: "",
    type: type as Skill["type"],
  }));
  johnTiming.run!.skills = johnTimingSkills;
  for (const [damageType, duration] of Object.entries({
    cold: JOHN_ATTACK_DURATIONS.cold,
    acid: JOHN_ATTACK_DURATIONS.acid,
    fire: JOHN_ATTACK_DURATIONS.fire,
    piercing: JOHN_ATTACK_DURATIONS.piercing,
    bludgeoning: JOHN_ATTACK_DURATIONS.bludgeoning,
    lightning: JOHN_ATTACK_DURATIONS.lightning,
  }) as [Skill["type"], number][]) {
    johnTiming.run!.selectedDamageType = damageType as DamageType;
    assert.equal(getPlayerAttackDurationMs(johnTiming.run!), duration);
    const pending = {
      ...johnTiming.run!,
      combatTurn: "enemy" as const,
      playerCombat: {
        ...johnTiming.run!.playerCombat!,
        pendingHeroAttack: {
          targetId: "john-timing",
          damageType: damageType as DamageType,
          kind: "normal" as const,
        },
      },
    };
    assert.equal(getPendingHeroAttackDurationMs(pending), duration / 2);
  }
  johnTiming.run!.selectedDamageType = "slashing";
  assert.equal(getPlayerAttackDurationMs(johnTiming.run!), HERO_SWORD_ANIMATION_DURATION_MS);
  johnTiming.run!.selectedDamageType = "lightning";
  johnTiming.run!.skills.push({
    id: "john-lightning",
    name: "Spark",
    description: "",
    type: "lightning",
  });
  assert.equal(getPlayerAttackDurationMs(johnTiming.run!), JOHN_ATTACK_DURATIONS.lightning);
  const sparkCommitted = act(johnTiming, { type: "PLAYER_ATTACK", targetId: "john-timing" });
  assert.equal(sparkCommitted.run!.enemies[0].hp, johnTiming.run!.enemies[0].hp);
  assert.equal(getPendingHeroAttackDurationMs(sparkCommitted.run!), JOHN_ATTACK_DURATIONS.lightning / 2);
  const sparkLanded = act(sparkCommitted, { type: "FINISH_HERO_ATTACK" });
  assert.ok(sparkLanded.run!.enemies[0].hp < sparkCommitted.run!.enemies[0].hp);
  const legacyJohnTiming = JSON.parse(JSON.stringify(johnTiming)) as GameStateV4;
  delete legacyJohnTiming.run!.characterId;
  legacyJohnTiming.run!.selectedDamageType = "acid";
  assert.equal(getPlayerAttackDurationMs(legacyJohnTiming.run!), JOHN_ATTACK_DURATIONS.acid);

  // Takedown commits one locked, delayed, physical hit. It doubles the base
  // attack before the normal defense/trait/skill pipeline, and never spills
  // to another enemy if its target dies.
  const johnTarget: EnemyState = {
    ...skeleton,
    id: "john-takedown-target",
    name: "Wolf",
    speciesKey: "wolf",
    hp: 15,
    maxHp: 15,
    defense: 0,
    attack: 0,
  };
  const johnOther = { ...johnTarget, id: "john-takedown-other", hp: 100, maxHp: 100 };
  let takedown = combatState(johnTarget);
  takedown.run!.attack = 10;
  takedown.run!.enemies = [johnTarget, johnOther];
  takedown.run!.combatSpeed = 2;
  takedown = act(takedown, {
    type: "JOHN_TAKEDOWN",
    targetId: johnTarget.id,
  });
  assert.equal(takedown.run!.combatTurn, "enemy");
  assert.equal(takedown.run!.playerCombat!.takedownUsed, true);
  assert.equal(takedown.run!.playerCombat!.lastAttackKind, "takedown");
  assert.equal(takedown.run!.playerCombat!.heroAttackSequence, 1);
  assert.equal(takedown.run!.playerCombat!.roundCounter, 1);
  assert.equal(takedown.run!.enemies[0].hp, johnTarget.hp, "takedown leaves HP unchanged until impact");
  assert.equal(takedown.run!.enemies[1].hp, 100);
  assert.equal(getPlayerAttackDurationMs(takedown.run!), JOHN_ATTACK_DURATIONS.takedown);
  assert.equal(getPendingHeroAttackDurationMs(takedown.run!), JOHN_ATTACK_DURATIONS.takedown / 2);
  assert.equal(getEnemyResponseDelayMs(takedown.run!), JOHN_ATTACK_DURATIONS.takedown / 2);
  const earlyTakedown = JSON.stringify(takedown.run);
  takedown = act(takedown, { type: "JOHN_TAKEDOWN", targetId: johnOther.id });
  assert.equal(JSON.stringify(takedown.run), earlyTakedown);
  const reloadedTakedown = validateState(JSON.parse(JSON.stringify(takedown)));
  assert.equal(reloadedTakedown.run!.playerCombat!.pendingHeroAttack!.kind, "takedown");
  takedown = act(reloadedTakedown, { type: "FINISH_HERO_ATTACK" });
  assert.equal(takedown.run!.enemies[0].id, johnOther.id);
  assert.equal(takedown.run!.enemies[0].hp, 100);
  assert.equal(takedown.run!.playerCombat!.pendingHeroAttack, undefined);
  assert.equal(takedown.run!.playerCombat!.heroImpactResolved, true);
  const landedTakedown = JSON.stringify(takedown.run);
  takedown = act(takedown, { type: "FINISH_HERO_ATTACK" });
  assert.equal(JSON.stringify(takedown.run), landedTakedown);
  takedown = act(takedown, { type: "RESOLVE_ENEMY_TURN" });
  takedown = act(takedown, {
    type: "PLAYER_ATTACK",
    targetId: johnOther.id,
  });
  assert.equal(takedown.run!.playerCombat!.lastAttackKind, "normal");
  assert.equal(getPlayerAttackDurationMs(takedown.run!), HERO_SWORD_ANIMATION_DURATION_MS);

  // A malformed save cannot turn Unc's punch into John's special or give a
  // takedown a magical style. New combat constructors start unspent.
  const invalidTakedownSave = JSON.parse(JSON.stringify(reloadedTakedown));
  invalidTakedownSave.run.characterId = "unc";
  assert.equal(validateState(invalidTakedownSave).run!.playerCombat!.pendingHeroAttack, undefined);
  let freshTakedown = startedRun();
  freshTakedown.run!.phase = "event_test_of_might";
  freshTakedown.run!.trailCinematic = null;
  freshTakedown = act(freshTakedown, { type: "TEST_OF_MIGHT_ENTER" });
  assert.equal(freshTakedown.run!.playerCombat!.takedownUsed, false);

  // A final Takedown kill uses only the ordinary corpse window, not a second
  // 5800ms special presentation.
  let finalTakedown = combatState({
    ...johnTarget,
    id: "john-final-takedown",
    hp: 5,
    maxHp: 5,
  });
  finalTakedown.run!.attack = 10;
  const finalNow = Date.now;
  try {
    Date.now = () => 234567;
    finalTakedown = commitHeroAttack(finalTakedown, {
      type: "JOHN_TAKEDOWN",
      targetId: "john-final-takedown",
    });
    assert.equal(
      finalTakedown.run!.victoryReport!.showAt,
      234567 + HERO_SWORD_ANIMATION_DURATION_MS,
    );
  } finally {
    Date.now = finalNow;
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
  uncDefeat = commitHeroAttack(uncDefeat, { type: "PLAYER_ATTACK" });
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

  // Bard defeat owns its authored death presentation too. The marker and
  // completion action are reload-safe, while John's default has no authored
  // hero death duration.
  let bardDefeat = combatState({ ...skeleton, id: "bard-death", attack: 1 });
  bardDefeat.run!.characterId = "alan-a-dale";
  bardDefeat.run!.hp = 1;
  bardDefeat = commitHeroAttack(bardDefeat, { type: "PLAYER_ATTACK" });
  bardDefeat = act(bardDefeat, { type: "RESOLVE_ENEMY_TURN" });
  assert.equal(bardDefeat.run!.phase, "defeat");
  assert.equal(bardDefeat.run!.heroDeathPending, true);
  assert.equal(getHeroDeathDurationMs(bardDefeat.run!), BARD_DURATIONS.death);
  const restoredBardDeath = validateState(JSON.parse(JSON.stringify(bardDefeat)));
  assert.equal(restoredBardDeath.run!.heroDeathPending, true);
  const finishedBardDeath = act(restoredBardDeath, { type: "FINISH_HERO_DEATH" });
  assert.equal(finishedBardDeath.run!.heroDeathPending, false);
  assert.equal(getHeroDeathDurationMs({ characterId: "john" }), 0);
  assert.equal(getHeroDeathDurationMs({ characterId: undefined }), 0);

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
  paced = commitHeroAttack(paced, { type: "PLAYER_ATTACK" });
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
  combo = commitHeroAttack(combo, { type: "PLAYER_ATTACK" });
  combo = act(combo, { type: "RESOLVE_ENEMY_TURN" });
  combo = commitHeroAttack(combo, { type: "PLAYER_ATTACK" });
  combo = act(combo, { type: "RESOLVE_ENEMY_TURN" });
  const afterTwoAttacks = combo.run!.enemies[0].hp;
  combo = commitHeroAttack(combo, { type: "PLAYER_ATTACK" });
  assert.equal(combo.run!.playerCombat!.heroAttackSequence, 3);
  assert.equal(combo.run!.enemies[0].hp, afterTwoAttacks - 15);

  // Bard abilities are inherent, target-locked actions. Their effects wait
  // for the authored impact, and Sleep rolls only once at that impact.
  const bardEnemy: EnemyState = {
    ...pacedEnemy,
    id: "bard-sleep-target",
    hp: 100,
    maxHp: 100,
    attack: 10,
    defense: 0,
  };
  const originalBardRandom = Math.random;
  try {
    // Wolf +1 Wisdom save: d20 1 fails DC 13, so Sleep takes effect.
    Math.random = () => 0;
    let bard = combatState(bardEnemy);
    bard.run!.characterId = "alan-a-dale";
    bard.run!.skills = [];
    bard.run!.attack = 10;
    bard = act(bard, { type: "BARD_ATTACK", move: "sleep", targetId: bardEnemy.id });
    assert.equal(bard.run!.enemies[0].hp, 100);
    assert.equal(bard.run!.enemies[0].sleepTurns, undefined);
    assert.equal(bard.run!.playerCombat!.pendingHeroAttack!.kind, "bard_sleep");
    assert.equal(bard.run!.playerCombat!.pendingHeroAttack!.damageType, "psychic");
    assert.equal(getPendingHeroAttackDurationMs(bard.run!), BARD_DURATIONS.magic);
    bard = act(bard, { type: "FINISH_HERO_ATTACK" });
    assert.equal(bard.run!.enemies[0].hp, 100);
    assert.equal(bard.run!.enemies[0].sleepTurns, 2);
    assert.match(bard.run!.bardSpellFeedback!, /falls asleep/);
    assert.equal(bard.run!.playerCombat!.enemyAttackSequence, 0);

    // One response is skipped. A positive player hit wakes the sleeper before
    // the next response, so that response can attack immediately.
    bard = act(bard, { type: "RESOLVE_ENEMY_TURN" });
    assert.equal(bard.run!.enemies[0].sleepTurns, 1);
    assert.equal(bard.run!.hp, 50);
    assert.equal(bard.run!.playerCombat!.enemyAttackSequence, 0);
    bard = validateState(JSON.parse(JSON.stringify(bard)));
    bard = commitHeroAttack(bard, { type: "PLAYER_ATTACK", targetId: bardEnemy.id });
    bard = act(bard, { type: "RESOLVE_ENEMY_TURN" });
    assert.equal(bard.run!.enemies[0].sleepTurns, 0);
    assert.equal(bard.run!.hp, 42);
    assert.equal(bard.run!.playerCombat!.enemyAttackSequence, 1);
    bard = commitHeroAttack(bard, { type: "PLAYER_ATTACK", targetId: bardEnemy.id });
    bard = act(bard, { type: "RESOLVE_ENEMY_TURN" });
    assert.equal(bard.run!.enemies[0].sleepTurns, 0);
    assert.equal(bard.run!.hp, 34, "woken response deals 10 attack minus 2 defense");
    assert.equal(bard.run!.playerCombat!.enemyAttackSequence, 2);
    assert.ok(bard.run!.log.some(entry => entry.msg.includes("wakes")));

    // Sleep refreshes an existing countdown, while a successful save never adds
    // status or HP changes.
    let refreshed = combatState({ ...bardEnemy, id: "bard-refresh" });
    refreshed.run!.characterId = "alan-a-dale";
    refreshed.run!.enemies[0].sleepTurns = 1;
    refreshed = act(refreshed, { type: "BARD_ATTACK", move: "sleep", targetId: "bard-refresh" });
    refreshed = act(refreshed, { type: "FINISH_HERO_ATTACK" });
    assert.equal(refreshed.run!.enemies[0].sleepTurns, 2);

    // d20 20 + Wolf's +1 = 21 succeeds: the enemy resists Sleep.
    Math.random = () => 0.99;
    let resisted = combatState({ ...bardEnemy, id: "bard-resisted" });
    resisted.run!.characterId = "alan-a-dale";
    resisted = act(resisted, { type: "BARD_ATTACK", move: "sleep", targetId: "bard-resisted" });
    resisted = act(resisted, { type: "FINISH_HERO_ATTACK" });
    assert.equal(resisted.run!.enemies[0].sleepTurns, undefined);
    assert.equal(resisted.run!.enemies[0].hp, 100);
    assert.match(resisted.run!.bardSpellFeedback!, /resists/);

    // Cutting Words now uses a Wisdom save and, on a failed save, deals half
    // base attack psychic damage while marking the next enemy attack.
    Math.random = () => 0;
    let bardSpells = combatState({ ...bardEnemy, id: "bard-spells" });
    bardSpells.run!.characterId = "alan-a-dale";
    bardSpells.run!.skills = [];
    bardSpells = act(bardSpells, { type: "BARD_ATTACK", move: "cutting_words", targetId: "bard-spells" });
    assert.equal(bardSpells.run!.playerCombat!.pendingHeroAttack!.damageType, "psychic");
    assert.equal(getPendingHeroAttackDurationMs(bardSpells.run!), BARD_DURATIONS.magic);
    bardSpells = act(bardSpells, { type: "FINISH_HERO_ATTACK" });
    assert.equal(bardSpells.run!.enemies[0].hp, 95);
    assert.equal(bardSpells.run!.enemies[0].attackDisadvantage, true);
    assert.match(bardSpells.run!.bardSpellFeedback!, /Wisdom save:/);
    assert.match(bardSpells.run!.bardSpellFeedback!, /disadvantage/);
    bardSpells = act(bardSpells, { type: "RESOLVE_ENEMY_TURN" });
    assert.equal(bardSpells.run!.enemies[0].attackDisadvantage, false);
    assert.match(bardSpells.run!.bardSpellFeedback!, /d20s .* AC .* — miss/);
    assert.equal(bardSpells.run!.hp, 50);
    // Electric remains a reliable full-base lightning hit.
    bardSpells = act(bardSpells, { type: "BARD_ATTACK", move: "electric", targetId: "bard-spells" });
    assert.equal(bardSpells.run!.playerCombat!.pendingHeroAttack!.damageType, "lightning");
    assert.equal(getPendingHeroAttackDurationMs(bardSpells.run!), BARD_DURATIONS.electric);

    Math.random = () => 0;
    const stableFirst = { ...bardEnemy, id: "stable-first" };
    const stableSecond = { ...bardEnemy, id: "stable-second" };
    let stableTarget = combatState(stableFirst);
    stableTarget.run!.characterId = "alan-a-dale";
    stableTarget.run!.enemies = [stableFirst, stableSecond];
    stableTarget = act(stableTarget, {
      type: "BARD_ATTACK",
      move: "sleep",
      targetId: stableSecond.id,
    });
    assert.equal(stableTarget.run!.playerCombat!.pendingHeroAttack!.targetId, stableSecond.id);
    stableTarget = act(stableTarget, { type: "FINISH_HERO_ATTACK" });
    assert.equal(stableTarget.run!.enemies.find(enemy => enemy.id === stableFirst.id)!.sleepTurns, undefined);
    assert.equal(stableTarget.run!.enemies.find(enemy => enemy.id === stableSecond.id)!.sleepTurns, 2);

    const legacyBard = JSON.parse(JSON.stringify(stableTarget));
    legacyBard.run.characterId = "john";
    legacyBard.run.playerCombat.pendingHeroAttack = {
      kind: "bard_sleep", damageType: "psychic", targetId: stableSecond.id,
    };
    legacyBard.run.playerCombat.lastAttackKind = "bard_sleep";
    assert.equal(validateState(legacyBard).run!.playerCombat!.pendingHeroAttack, undefined);
    assert.equal(validateState(legacyBard).run!.playerCombat!.lastAttackKind, undefined);

    // A non-Bard cannot commit an authored Bard ability.
    const unsupported = combatState({ ...bardEnemy, id: "unsupported-bard" });
    assert.deepEqual(
      act(unsupported, { type: "BARD_ATTACK", move: "sleep", targetId: "unsupported-bard" }).run,
      unsupported.run,
    );
  } finally {
    Math.random = originalBardRandom;
  }
}

function withRandomSequence<T>(values: number[], callback: () => T): T {
  const original = Math.random;
  let index = 0;
  Math.random = () => values[index++] ?? values[values.length - 1] ?? 0;
  try {
    return callback();
  } finally {
    Math.random = original;
  }
}

function bardCombatState(enemy: EnemyState): GameStateV4 {
  const state = combatState(enemy);
  state.run!.characterId = "alan-a-dale";
  state.run!.skills = [];
  return state;
}

function runFocusedCombatAssertions() {
  // Save equality is a success, including for a negative species bonus.
  const equalWolfSave = withRandomSequence([0.55], () => {
    let state = bardCombatState({
      id: "equal-wolf",
      name: "Wolf",
      speciesKey: "wolf",
      hp: 100,
      maxHp: 100,
      attack: 0,
      defense: 0,
      speed: 0,
    });
    state = act(state, { type: "BARD_ATTACK", move: "sleep", targetId: "equal-wolf" });
    return act(state, { type: "FINISH_HERO_ATTACK" });
  });
  assert.equal(equalWolfSave.run!.enemies[0].sleepTurns, undefined);
  assert.match(equalWolfSave.run!.bardSpellFeedback!, /resists Sleep/);
  assert.match(equalWolfSave.run!.bardSpellFeedback!, /d20 12 \+ \(\+1\) = 13 vs DC 13 — succeeds/);

  const equalGoblinSave = withRandomSequence([0.65], () => {
    let state = bardCombatState({
      id: "equal-goblin",
      name: "Goblin",
      speciesKey: "goblin",
      hp: 100,
      maxHp: 100,
      attack: 0,
      defense: 0,
      speed: 0,
    });
    state = act(state, { type: "BARD_ATTACK", move: "sleep", targetId: "equal-goblin" });
    return act(state, { type: "FINISH_HERO_ATTACK" });
  });
  assert.equal(equalGoblinSave.run!.enemies[0].sleepTurns, undefined);
  assert.match(equalGoblinSave.run!.bardSpellFeedback!, /resists Sleep/);
  assert.match(equalGoblinSave.run!.bardSpellFeedback!, /d20 14 \+ \(-1\) = 13 vs DC 13 — succeeds/);

  // A save is pending with the authored impact: neither damage nor CW status
  // appears early, and a failed save uses ceil(half base attack) before
  // defenses.
  const cuttingPending = withRandomSequence([0], () => {
    let state = bardCombatState({
      id: "cutting-pending",
      name: "Wolf",
      speciesKey: "wolf",
      hp: 100,
      maxHp: 100,
      attack: 0,
      defense: 0,
      speed: 0,
    });
    state.run!.attack = 11;
    state = act(state, { type: "BARD_ATTACK", move: "cutting_words", targetId: "cutting-pending" });
    assert.equal(state.run!.enemies[0].hp, 100);
    assert.equal(state.run!.enemies[0].attackDisadvantage, undefined);
    return act(state, { type: "FINISH_HERO_ATTACK" });
  });
  assert.equal(cuttingPending.run!.enemies[0].hp, 94);
  assert.equal(cuttingPending.run!.enemies[0].attackDisadvantage, true);

  const cuttingWake = withRandomSequence([0], () => {
    let state = bardCombatState({
      id: "cutting-wake",
      name: "Wolf",
      speciesKey: "wolf",
      hp: 100,
      maxHp: 100,
      attack: 0,
      defense: 0,
      speed: 0,
      sleepTurns: 2,
    });
    state = act(state, { type: "BARD_ATTACK", move: "cutting_words", targetId: "cutting-wake" });
    return act(state, { type: "FINISH_HERO_ATTACK" });
  });
  assert.equal(cuttingWake.run!.enemies[0].hp, 95);
  assert.equal(cuttingWake.run!.enemies[0].sleepTurns, 0);

  // A successful CW save is zero damage and does not add disadvantage.
  const cuttingPassed = withRandomSequence([0.99], () => {
    let state = bardCombatState({
      id: "cutting-passed",
      name: "Wolf",
      speciesKey: "wolf",
      hp: 100,
      maxHp: 100,
      attack: 0,
      defense: 0,
      speed: 0,
    });
    state.run!.attack = 11;
    state = act(state, { type: "BARD_ATTACK", move: "cutting_words", targetId: "cutting-passed" });
    return act(state, { type: "FINISH_HERO_ATTACK" });
  });
  assert.equal(cuttingPassed.run!.enemies[0].hp, 100);
  assert.equal(cuttingPassed.run!.enemies[0].attackDisadvantage, undefined);
  assert.match(cuttingPassed.run!.bardSpellFeedback!, /resists Cutting Words/);

  // The next actual disadvantaged attempt consumes the marker on both hit and
  // miss. The lower die is used, while the normal reliable response model is
  // unchanged for enemies without the marker.
  const disadvantagedHit = withRandomSequence([0, 0, 0, 0.7, 0.8], () => {
    let state = bardCombatState({
      id: "disadvantaged-hit",
      name: "Wolf",
      speciesKey: "wolf",
      hp: 100,
      maxHp: 100,
      attack: 10,
      defense: 0,
      speed: 0,
    });
    state = act(state, { type: "BARD_ATTACK", move: "cutting_words", targetId: "disadvantaged-hit" });
    state = act(state, { type: "FINISH_HERO_ATTACK" });
    assert.equal(state.run!.enemies[0].attackDisadvantage, true);
    return act(state, { type: "RESOLVE_ENEMY_TURN" });
  });
  assert.equal(disadvantagedHit.run!.hp, 42);
  assert.equal(disadvantagedHit.run!.enemies[0].attackDisadvantage, false);
  assert.equal(disadvantagedHit.run!.playerCombat!.enemyAttackSequence, 1);
  assert.match(disadvantagedHit.run!.bardSpellFeedback!, /d20s 15, 17 \(keep 15\) \+ 5 = 20 vs AC 12 — hit/);

  const disadvantagedMiss = withRandomSequence([0, 0, 0, 0.2, 0.9], () => {
    let state = bardCombatState({
      id: "disadvantaged-miss",
      name: "Wolf",
      speciesKey: "wolf",
      hp: 100,
      maxHp: 100,
      attack: 10,
      defense: 0,
      speed: 0,
    });
    state = act(state, { type: "BARD_ATTACK", move: "cutting_words", targetId: "disadvantaged-miss" });
    state = act(state, { type: "FINISH_HERO_ATTACK" });
    return act(state, { type: "RESOLVE_ENEMY_TURN" });
  });
  assert.equal(disadvantagedMiss.run!.hp, 50);
  assert.equal(disadvantagedMiss.run!.enemies[0].attackDisadvantage, false);
  assert.equal(disadvantagedMiss.run!.playerCombat!.enemyAttackSequence, 1);
  assert.match(disadvantagedMiss.run!.bardSpellFeedback!, /d20s 5, 19 \(keep 5\) \+ 5 = 10 vs AC 12 — miss/);

  // Sleep skips do not consume a pending disadvantage marker.
  const sleepKeepsDisadvantage = withRandomSequence([0], () => {
    let state = bardCombatState({
      id: "sleep-keeps-disadvantage",
      name: "Wolf",
      speciesKey: "wolf",
      hp: 100,
      maxHp: 100,
      attack: 10,
      defense: 0,
      speed: 0,
      attackDisadvantage: true,
    });
    state = act(state, { type: "BARD_ATTACK", move: "sleep", targetId: "sleep-keeps-disadvantage" });
    state = act(state, { type: "FINISH_HERO_ATTACK" });
    state = act(state, { type: "RESOLVE_ENEMY_TURN" });
    return state;
  });
  assert.equal(sleepKeepsDisadvantage.run!.enemies[0].sleepTurns, 1);
  assert.equal(sleepKeepsDisadvantage.run!.enemies[0].attackDisadvantage, true);
  assert.equal(sleepKeepsDisadvantage.run!.playerCombat!.enemyAttackSequence, 0);

  const stunnedKeepsDisadvantage = bardCombatState({
    id: "stunned-keeps-disadvantage",
    name: "Wolf",
    speciesKey: "wolf",
    hp: 100,
    maxHp: 100,
    attack: 10,
    defense: 0,
    speed: 0,
    stunned: true,
    attackDisadvantage: true,
  });
  stunnedKeepsDisadvantage.run!.combatTurn = "enemy";
  const stunnedSkipped = act(stunnedKeepsDisadvantage, { type: "RESOLVE_ENEMY_TURN" });
  assert.equal(stunnedSkipped.run!.enemies[0].attackDisadvantage, true);
  assert.equal(stunnedSkipped.run!.playerCombat!.enemyAttackSequence, 0);

  // Every positive player-side source wakes a surviving sleeper; immunity is
  // exactly zero and leaves Sleep intact. Sleep itself remains HP-neutral.
  const normalWake = bardCombatState({
    id: "normal-wake",
    name: "Wolf",
    speciesKey: "wolf",
    hp: 100,
    maxHp: 100,
    attack: 0,
    defense: 0,
    speed: 0,
    sleepTurns: 2,
  });
  normalWake.run!.attack = 10;
  const normalWoken = commitHeroAttack(normalWake, { type: "PLAYER_ATTACK", targetId: "normal-wake" });
  assert.equal(normalWoken.run!.enemies[0].hp, 90);
  assert.equal(normalWoken.run!.enemies[0].sleepTurns, 0);

  const electricWake = bardCombatState({
    id: "electric-wake",
    name: "Wolf",
    speciesKey: "wolf",
    hp: 100,
    maxHp: 100,
    attack: 0,
    defense: 0,
    speed: 0,
    sleepTurns: 2,
  });
  electricWake.run!.attack = 10;
  const electricWoken = commitHeroAttack(electricWake, {
    type: "BARD_ATTACK",
    move: "electric",
    targetId: "electric-wake",
  });
  assert.equal(electricWoken.run!.enemies[0].hp, 90);
  assert.equal(electricWoken.run!.enemies[0].sleepTurns, 0);

  const poisonWake = combatState({
    id: "poison-wake",
    name: "Wolf",
    speciesKey: "wolf",
    hp: 100,
    maxHp: 100,
    attack: 0,
    defense: 0,
    speed: 0,
    sleepTurns: 2,
    poisoned: true,
  });
  const poisonedWoken = act(poisonWake, { type: "USE_CONSUMABLE", consumable: "health_potion" });
  assert.equal(poisonedWoken.run!.enemies[0].hp, 100);
  assert.equal(poisonedWoken.run!.enemies[0].sleepTurns, 2);

  const bombWake = combatState({
    id: "bomb-wake",
    name: "Wolf",
    speciesKey: "wolf",
    hp: 100,
    maxHp: 100,
    attack: 0,
    defense: 0,
    speed: 0,
    sleepTurns: 2,
  });
  const bombPending = act(bombWake, { type: "USE_CONSUMABLE", consumable: "fire_bomb" });
  const bombWoken = act(bombPending, { type: "RESOLVE_ENEMY_TURN" });
  assert.equal(bombWoken.run!.enemies[0].sleepTurns, 0);

  const immuneSleeper = bardCombatState({
    id: "immune-sleeper",
    name: "Ochre Jelly",
    speciesKey: "ochre_jelly",
    hp: 100,
    maxHp: 100,
    attack: 0,
    defense: 0,
    speed: 0,
    sleepTurns: 2,
  });
  immuneSleeper.run!.attack = 10;
  const immuneResult = commitHeroAttack(immuneSleeper, {
    type: "BARD_ATTACK",
    move: "electric",
    targetId: "immune-sleeper",
  });
  assert.equal(immuneResult.run!.enemies[0].hp, 100);
  assert.equal(immuneResult.run!.enemies[0].sleepTurns, 2);

  const sleepWithPoison = withRandomSequence([0], () => {
    let state = combatState({
      id: "sleep-poison",
      name: "Wolf",
      speciesKey: "wolf",
      hp: 100,
      maxHp: 100,
      attack: 0,
      defense: 0,
      speed: 0,
      sleepTurns: 1,
      poisoned: true,
    });
    state.run!.characterId = "alan-a-dale";
    state.run!.skills = [];
    state = act(state, { type: "BARD_ATTACK", move: "sleep", targetId: "sleep-poison" });
    return act(state, { type: "FINISH_HERO_ATTACK" });
  });
  assert.equal(sleepWithPoison.run!.enemies[0].hp, 99);
  assert.equal(sleepWithPoison.run!.enemies[0].sleepTurns, 0);
  assert.ok(sleepWithPoison.run!.log.some(entry => entry.msg.includes("wakes")));
}

runAssertions();
runFocusedCombatAssertions();
console.log("Dicebound engine assertions passed.");