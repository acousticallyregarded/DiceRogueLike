import assert from "node:assert/strict";
import {
  act,
  createInitialState,
  generateBoard,
  validateState,
  type EnemyState,
  type GameStateV4,
} from "./engine.js";
import { getBossDeathDurationMs, getBossId, getVictoryInterlude, LEVELS } from "./level-content.js";

function bossReady(floor: number): GameStateV4 {
  let state = act(createInitialState(), { type: "START_RUN" });
  state = act(state, { type: "SKIP_PROLOGUE" });
  state = act(state, { type: "FINISH_TRAIL_CINEMATIC" });
  const run = state.run!;
  run.floor = floor;
  run.tiles = generateBoard(floor);
  run.position = run.tiles.length - 1;
  run.phase = "boss_awakening";
  run.trailCinematic = "awakening";
  run.trailAwakeningSeen = true;
  state = act(state, { type: "FINISH_TRAIL_CINEMATIC" });
  return act(state, { type: "FIGHT_BOSS" });
}

function bossTurn(state: GameStateV4, damageType: "slashing" | "fire" = "slashing") {
  const run = state.run!;
  run.selectedDamageType = damageType;
  if (damageType === "fire" && !run.skills.some(skill => skill.type === "fire")) {
    run.skills.push({ id: "test-fire", name: "Ember", description: "", type: "fire" });
  }
  state = act(state, { type: "PLAYER_ATTACK" });
  state = act(state, { type: "FINISH_HERO_ATTACK" });
  return act(state, { type: "RESOLVE_ENEMY_TURN" });
}

function defeatBoss(state: GameStateV4): GameStateV4 {
  const run = state.run!;
  run.attack = 10_000;
  run.enemies[0].hp = 1;
  state = act(state, {
    type: "PLAYER_ATTACK",
    targetId: run.enemies[0].id,
  });
  state = act(state, { type: "FINISH_HERO_ATTACK" });
  assert.equal(state.run!.phase, "victory");
  state = act(state, { type: "DISMISS_VICTORY_REPORT" });
  return state;
}

function runAssertions() {
  // If the queen dies before her brood, retain her identity across turns and
  // reloads so the last minion cannot accidentally select the King's exit.
  let broodFight = bossReady(3);
  const queen = broodFight.run!.enemies[0];
  broodFight.run!.enemies.push({
    ...queen, id: "surviving-brood", name: "Broodling", boss: false,
    speciesKey: "goblin", artKey: "goblin", hp: 10, maxHp: 10, attack: 0,
  });
  queen.hp = 1;
  broodFight.run!.attack = 10_000;
  broodFight = act(broodFight, { type: "PLAYER_ATTACK", targetId: queen.id });
  broodFight = act(broodFight, { type: "FINISH_HERO_ATTACK" });
  assert.equal(broodFight.run!.playerCombat!.pendingBossDeath?.name, queen.name);
  broodFight = validateState(awaitableClone(broodFight));
  broodFight = act(broodFight, { type: "RESOLVE_ENEMY_TURN" });
  broodFight = act(broodFight, { type: "PLAYER_ATTACK", targetId: "surviving-brood" });
  const beforeBroodFinish = Date.now();
  broodFight = act(broodFight, { type: "FINISH_HERO_ATTACK" });
  assert.equal(broodFight.run!.phase, "victory");
  assert.ok(broodFight.run!.victoryReport!.showAt - beforeBroodFinish < 2200);

  // The authored contract exposes four floors and every floor gets a fresh,
  // finite trail with a real endpoint boss.
  assert.equal(LEVELS.length, 4);
  assert.equal(getVictoryInterlude(1)?.fragment, "The Verdant Shard");
  assert.match(getVictoryInterlude(1)?.body ?? "", /Grubgut/);
  assert.match(getVictoryInterlude(2)?.body ?? "", /Lady Silkmaw/);
  assert.match(getVictoryInterlude(3)?.body ?? "", /Sir Cinder/);
  assert.equal(getVictoryInterlude(4), null);
  assert.equal(generateBoard(1).length, 64);
  for (let floor = 1; floor <= 4; floor++) {
    const board = generateBoard(floor);
    assert.equal(board[0].type, "start");
    assert.equal(board[63].type, "boss");
    assert.ok(new Set(board.map(tile => tile.type)).size >= 6);
  }

  // Story progression lives inside the persisted report and cannot advance
  // the floor or grant rewards. Dismissing either page is a state-neutral skip.
  let storyVictory = bossReady(1);
  storyVictory = defeatBoss(storyVictory);
  // Recreate the pending report because defeatBoss exercises the skip path.
  storyVictory = bossReady(1);
  storyVictory.run!.attack = 10_000;
  storyVictory.run!.enemies[0].hp = 1;
  storyVictory = act(storyVictory, { type: "PLAYER_ATTACK", targetId: storyVictory.run!.enemies[0].id });
  storyVictory = act(storyVictory, { type: "FINISH_HERO_ATTACK" });
  const rewardsBeforeStory = {
    floor: storyVictory.run!.floor,
    gold: storyVictory.run!.gold,
    gems: storyVictory.run!.gemsEarned,
  };
  storyVictory = act(storyVictory, { type: "ADVANCE_VICTORY_REPORT" });
  assert.equal(storyVictory.run!.victoryReport!.interludeVisible, true);
  assert.deepEqual(
    { floor: storyVictory.run!.floor, gold: storyVictory.run!.gold, gems: storyVictory.run!.gemsEarned },
    rewardsBeforeStory,
  );
  const restoredStory = validateState(awaitableClone(storyVictory));
  assert.equal(restoredStory.run!.victoryReport!.interludeVisible, true);
  storyVictory = act(restoredStory, { type: "DISMISS_VICTORY_REPORT" });
  assert.equal(storyVictory.run!.victoryReport, null);
  assert.deepEqual(
    { floor: storyVictory.run!.floor, gold: storyVictory.run!.gold, gems: storyVictory.run!.gemsEarned },
    rewardsBeforeStory,
  );
  assert.notDeepEqual(generateBoard(1), generateBoard(2));
  assert.notDeepEqual(generateBoard(2), generateBoard(3));

  // Victory reports use the actual killed boss's corpse window: a new boss
  // must not inherit the Skeleton King's 5200ms death presentation.
  assert.equal(getBossDeathDurationMs({ boss: true, name: "Skeleton King" }), 5200);
  assert.equal(getBossDeathDurationMs({ boss: true, name: "Grubgut, the Troll King" }), 1800);
  const originalNow = Date.now;
  let newBossShowAt = 0;
  let kingShowAt = 0;
  let poisonKilledBossShowAt = 0;
  let fastNewBossShowAt = 0;
  let fastKingShowAt = 0;
  try {
    Date.now = () => 100_000;
    let newBoss = bossReady(2);
    newBoss.run!.attack = 10_000;
    newBoss.run!.enemies[0].hp = 1;
    newBoss = act(newBoss, { type: "PLAYER_ATTACK" });
    newBoss = act(newBoss, { type: "FINISH_HERO_ATTACK" });
    newBossShowAt = newBoss.run!.victoryReport!.showAt;
    let king = bossReady(1);
    king.run!.attack = 10_000;
    king.run!.enemies[0].hp = 1;
    king = act(king, { type: "PLAYER_ATTACK" });
    king = act(king, { type: "FINISH_HERO_ATTACK" });
    kingShowAt = king.run!.victoryReport!.showAt;
    let poisonedGrubgut = bossReady(2);
    poisonedGrubgut.run!.skills.push({
      id: "test-poison",
      name: "Poison Strike",
      description: "",
      type: "poison",
    });
    poisonedGrubgut.run!.enemies[0].hp = 1;
    poisonedGrubgut.run!.enemies[0].poisoned = true;
    poisonedGrubgut = act(poisonedGrubgut, { type: "PLAYER_ATTACK" });
    poisonedGrubgut = act(poisonedGrubgut, { type: "FINISH_HERO_ATTACK" });
    poisonKilledBossShowAt = poisonedGrubgut.run!.victoryReport!.showAt;
    let fastNewBoss = bossReady(2);
    fastNewBoss.run!.combatSpeed = 2;
    fastNewBoss.run!.attack = 10_000;
    fastNewBoss.run!.enemies[0].hp = 1;
    fastNewBoss = act(fastNewBoss, { type: "PLAYER_ATTACK" });
    fastNewBoss = act(fastNewBoss, { type: "FINISH_HERO_ATTACK" });
    fastNewBossShowAt = fastNewBoss.run!.victoryReport!.showAt;
    let fastKing = bossReady(1);
    fastKing.run!.combatSpeed = 2;
    fastKing.run!.attack = 10_000;
    fastKing.run!.enemies[0].hp = 1;
    fastKing = act(fastKing, { type: "PLAYER_ATTACK" });
    fastKing = act(fastKing, { type: "FINISH_HERO_ATTACK" });
    fastKingShowAt = fastKing.run!.victoryReport!.showAt;
  } finally {
    Date.now = originalNow;
  }
  assert.equal(newBossShowAt, 101_800);
  assert.equal(kingShowAt, 105_200);
  assert.equal(poisonKilledBossShowAt, 101_800);
  assert.equal(fastNewBossShowAt, 100_900);
  assert.equal(fastKingShowAt, 102_600);

  // Grubgut alternates club/belch and performs a fire-suppressible third-turn
  // regeneration without using the melee presentation category.
  let grubgut = bossReady(2);
  assert.equal(getBossId(grubgut.run!.enemies[0]), "grubgut");
  grubgut.run!.attack = 1;
  grubgut.run!.enemies[0].defense = 99;
  grubgut = bossTurn(grubgut, "fire");
  assert.equal(grubgut.run!.enemies[0].bossMove, "club");
  assert.equal(grubgut.run!.enemies[0].lastBossAttack, "sword");
  grubgut = bossTurn(grubgut, "fire");
  assert.equal(grubgut.run!.enemies[0].bossMove, "poison_belch");
  assert.equal(grubgut.run!.enemies[0].lastBossAttack, "fireball");
  const grubgutHp = grubgut.run!.enemies[0].hp;
  grubgut = bossTurn(grubgut, "fire");
  assert.equal(grubgut.run!.enemies[0].bossMove, "regen");
  assert.equal(grubgut.run!.enemies[0].bossRegenSuppressed, false);
  assert.equal(grubgut.run!.enemies[0].hp, grubgutHp);
  assert.match(grubgut.run!.log[0].msg, /suppressed by fire/i);
  assert.match(grubgut.run!.combatFeedback!.message, /suppressed by fire/i);
  assert.equal(grubgut.run!.combatFeedback!.durationMs, 2200);

  // Silkmaw bites, webs the hero for the next committed attack, then summons
  // exactly two generic-art broodlings.
  let silkmaw = bossReady(3);
  assert.equal(getBossId(silkmaw.run!.enemies[0]), "silkmaw");
  silkmaw.run!.attack = 1;
  silkmaw.run!.enemies[0].defense = 99;
  silkmaw = bossTurn(silkmaw);
  assert.equal(silkmaw.run!.enemies[0].bossMove, "venom_bite");
  silkmaw = bossTurn(silkmaw);
  assert.equal(silkmaw.run!.enemies[0].bossMove, "web");
  assert.equal(silkmaw.run!.heroHinderedTurns, 1);
  silkmaw = bossTurn(silkmaw);
  assert.equal(silkmaw.run!.enemies[0].bossMove, "summon_brood");
  const brood = silkmaw.run!.enemies.filter(enemy => enemy.name.startsWith("Silkmaw Broodling"));
  assert.equal(brood.length, 2);
  assert.ok(brood.every(enemy => enemy.artKey === "goblin"));

  // Cinder's one-time rage is a real attack buff and still reports the
  // underlying sword/fireball animation category.
  let cinder = bossReady(4);
  assert.equal(getBossId(cinder.run!.enemies[0]), "cinder");
  cinder.run!.attack = 1;
  cinder.run!.enemies[0].defense = 99;
  cinder.run!.enemies[0].hp = Math.floor(cinder.run!.enemies[0].maxHp / 2) - 1;
  const cinderAttackBefore = cinder.run!.enemies[0].attack;
  cinder = bossTurn(cinder);
  assert.equal(cinder.run!.enemies[0].bossRageActive, true);
  assert.ok(cinder.run!.enemies[0].attack > cinderAttackBefore);
  assert.equal(cinder.run!.enemies[0].bossMove, "rage");
  assert.equal(cinder.run!.enemies[0].lastBossAttack, "sword");
  assert.match(cinder.run!.combatFeedback!.message, /enters a rage/i);
  assert.equal(cinder.run!.combatFeedback!.durationMs, 2400);

  // A campaign advances 1 -> 2 -> 3 -> 4 on separate boards and the fourth
  // victory exits through its epilogue. Terminal settlement is idempotent.
  let campaign = bossReady(1);
  for (let floor = 1; floor <= 4; floor++) {
    assert.equal(campaign.run!.floor, floor);
    campaign = defeatBoss(campaign);
    const beforeContinue = campaign.meta.gems;
    if (floor < 4) {
      campaign = act(campaign, { type: "CONTINUE_RUN" });
      assert.ok(campaign.run);
      assert.equal(campaign.meta.gems, beforeContinue);
      assert.equal(campaign.run!.floor, floor + 1);
      assert.equal(campaign.run!.tiles.length, 64);
      assert.equal(campaign.run!.trailCinematic, "intro");
      assert.equal(campaign.run!.trailIntroSeen, false);
      campaign = act(campaign, { type: "FINISH_TRAIL_CINEMATIC" });
      campaign.run!.position = 63;
      campaign.run!.phase = "boss_awakening";
      campaign.run!.trailCinematic = "awakening";
      campaign = act(campaign, { type: "FINISH_TRAIL_CINEMATIC" });
      campaign = act(campaign, { type: "FIGHT_BOSS" });
    } else {
      campaign = act(campaign, { type: "CONTINUE_RUN" });
      assert.ok(campaign.run);
      assert.equal(campaign.meta.gems, beforeContinue);
      for (let step = 0; step < 4; step++) {
        campaign = act(campaign, { type: "ADVANCE_FINAL_EPILOGUE" });
      }
      assert.equal(campaign.run, null);
      assert.ok(campaign.meta.gems > beforeContinue);
      const settledGems = campaign.meta.gems;
      campaign = act(campaign, { type: "ADVANCE_FINAL_EPILOGUE" });
      assert.equal(campaign.run, null);
      assert.equal(campaign.meta.gems, settledGems);
    }
  }

  // Explicit Return to Lobby is also a terminal settlement boundary, even
  // when a player leaves on a non-final floor.
  let returned = bossReady(2);
  returned.run!.phase = "victory";
  returned.run!.trailCinematic = null;
  returned.run!.gemsEarned = 7;
  returned.run!.gold = 115;
  const beforeReturn = returned.meta.gems;
  returned = act(returned, { type: "RETURN_TO_LOBBY" });
  assert.equal(returned.run, null);
  assert.equal(returned.meta.gems, beforeReturn + 18);
  assert.equal(act(returned, { type: "RETURN_TO_LOBBY" }).meta.gems, beforeReturn + 18);

  // New boss fields and a legacy pending hero attack survive engine migration.
  let pending = bossReady(3);
  const enemy = pending.run!.enemies[0];
  enemy.bossMove = "web";
  enemy.bossTurnCounter = 2;
  pending.run!.heroHinderedTurns = 1;
  pending = act(pending, { type: "PLAYER_ATTACK", targetId: enemy.id });
  const restored = validateState(awaitableClone(pending));
  assert.equal(restored.run!.playerCombat!.pendingHeroAttack!.targetId, enemy.id);
  assert.equal(restored.run!.enemies[0].bossMove, "web");
  assert.equal(restored.run!.enemies[0].bossTurnCounter, 2);
  assert.equal(restored.run!.heroHinderedTurns, 1);
}

function awaitableClone(state: GameStateV4): GameStateV4 {
  // Keep the fixture explicit: this mirrors a V4 local/cloud JSON round trip.
  return JSON.parse(JSON.stringify(state)) as GameStateV4;
}

runAssertions();
console.log("Dicebound level engine assertions passed.");
