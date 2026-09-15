import assert from "node:assert/strict";
import test from "node:test";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  createInitialState,
  actionEventCommitment,
  DEATH_ROLL_ALGORITHM_VERSION,
  deriveDeathRoll,
  ENGINE_VERSION,
  initialStateCommitment,
  initialStateHash,
  isCharacterChoice,
  isRunAction,
  replayRun,
  seedCommitment,
  submitAction,
  getReplay,
} from "./dicebound-runs";
import {
  db,
  diceboundActionEvents,
  diceboundDeathReviews,
  diceboundDeathRolls,
  diceboundRuns,
  tokenRewards,
} from "@workspace/db";
import { generateEnemies } from "@workspace/dicebound-engine";
import { LEVELS } from "@workspace/dicebound-engine/level-content";
import { act, type GameAction } from "@workspace/dicebound-engine";
import {
  ESCROW_ADDRESS,
  setTokenPurchaseTestDependencies,
} from "./token-purchases";
import { reviewDiceboundDeath } from "./dicebound-review";

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).filter((key) => object[key] !== undefined).sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(",")}}`;
}

test("real campaign choices and actions are strict", () => {
  assert.deepEqual(["john", "unc", "alan-a-dale"].filter(isCharacterChoice), ["john", "unc", "alan-a-dale"]);
  assert.equal(isCharacterChoice("knight"), false);
  assert.equal(isRunAction({ type: "PLAYER_ATTACK", targetId: "goblin-1" }), true);
  assert.equal(isRunAction({ type: "PLAYER_ATTACK", targetId: 42 }), false);
  assert.equal(isRunAction({ type: "BUY_SHOP", itemId: 42 }), false);
  assert.equal(isRunAction({ type: "RESET_SAVE" }), false);
  assert.equal(isRunAction({ type: "START_RUN", characterId: "john" }), false);
});

test("all real characters start with deterministic canonical state", () => {
  for (const characterId of ["john", "unc", "alan-a-dale"] as const) {
    const first = createInitialState(characterId, "11".repeat(32));
    const second = createInitialState(characterId, "11".repeat(32));
    assert.deepEqual(first, second);
    assert.equal(first.run?.characterId, characterId);
    assert.equal(first.run?.phase, "explore");
    assert.equal(first.run?.enemies.length, 0);
  }
});

test("replay and death commitments are stable and key-order independent", () => {
  const seed = "22".repeat(32);
  const initial = createInitialState("alan-a-dale", seed);
  const replay = replayRun(seed, initial, [{ type: "FINISH_TRAIL_CINEMATIC" }]);
  assert.equal(replay.run?.characterId, "alan-a-dale");
  assert.equal(seedCommitment(seed), seedCommitment(seed));
  const roll = deriveDeathRoll(seed, "run-1", "enemy-1", 1, 0);
  assert.ok(roll >= 0 && roll < 100);
  assert.equal(deriveDeathRoll(seed, "run-1", "enemy-1", 1, 0), roll);
});

test("a real fire bomb records one unbiased roll for every stable monster death", async () => {
  const wallet = "0x" + "d1".repeat(20);
  const seed = "44".repeat(32);
  const runId = crypto.randomUUID();
  const state = createInitialState("unc", seed);
  const run = state.run!;
  const enemies = generateEnemies(2, 1, false, 1, 1);
  enemies.forEach((enemy) => { enemy.hp = 1; });
  run.enemies = enemies;
  run.phase = "combat";
  run.trailCinematic = undefined;
  run.isBossCombat = true;
  run.combatTurn = "player";
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
  await db.insert(diceboundRuns).values({
    id: runId,
    walletAddress: wallet,
    seed,
    seedCommitment: seedCommitment(seed),
    engineVersion: ENGINE_VERSION,
    initialState: state,
    initialStateHash: initialStateHash(state),
    initialStateCommitment: initialStateCommitment(runId, wallet, seedCommitment(seed), state),
    canonicalState: state,
    status: "active",
    sequence: 0,
  });
  try {
    const primed = await submitAction(wallet, runId, "bomb", 0, {
      type: "USE_CONSUMABLE",
      consumable: "fire_bomb",
    });
    assert.equal(primed.status, "active");
    const request = await submitAction(wallet, runId, "bomb-impact", 1, {
      type: "RESOLVE_ENEMY_TURN",
    });
    assert.equal(request.status, "active");
    assert.deepEqual(request.deaths?.sort(), enemies.map((enemy) => enemy.id).sort());
    const retry = await submitAction(wallet, runId, "bomb-impact", 1, {
      type: "RESOLVE_ENEMY_TURN",
    });
    assert.deepEqual(retry.deaths?.sort(), request.deaths?.sort());
    assert.equal(retry.sequence, request.sequence);
    assert.equal(retry.status, request.status);
    const rolls = await db.select().from(diceboundDeathRolls);
    assert.equal(rolls.length, 2);
    for (const roll of rolls) {
      assert.ok(enemies.some((enemy) => enemy.id === roll.monsterId));
      assert.ok(roll.rollValue >= 0 && roll.rollValue < 100);
      assert.equal(roll.rollUpperBound, 100);
      assert.equal(roll.successThreshold, 5);
      assert.equal(roll.status, "pending_review");
      assert.equal(
        roll.rollValue,
        deriveDeathRoll(seed, runId, roll.monsterId, roll.encounterIndex, roll.monsterIndex),
      );
    }
    assert.equal((await db.select().from(diceboundActionEvents)).length, 2);
  } finally {
    await db.delete(diceboundActionEvents).where(eq(diceboundActionEvents.runId, runId));
    await db.delete(diceboundDeathRolls).where(eq(diceboundDeathRolls.runId, runId));
    await db.delete(diceboundRuns).where(eq(diceboundRuns.id, runId));
  }
});

function nextCampaignAction(state: ReturnType<typeof createInitialState>): GameAction {
  const run = state.run!;
  if (run.victoryReport) return { type: "DISMISS_VICTORY_REPORT" };
  if (run.phase === "victory") {
    if (run.floor >= LEVELS.length) return { type: "ADVANCE_FINAL_EPILOGUE" };
    return { type: "CONTINUE_RUN" };
  }
  if (run.trailCinematic) return run.trailCinematic === "prologue"
    ? { type: "SKIP_PROLOGUE" }
    : { type: "FINISH_TRAIL_CINEMATIC" };
  if (run.phase === "explore") return { type: "ROLL_DICE" };
  if (run.phase === "moving") return run.rollAnimating
    ? { type: "BEGIN_MOVEMENT" }
    : { type: "STEP_MOVE" };
  if (run.phase === "boss_awakening") return { type: "COMPLETE_BOSS_AWAKENING" };
  if (run.phase === "boss_ready") return { type: "FIGHT_BOSS" };
  if (run.phase === "level_up") {
    const priority = ["vampire", "defense_boost", "counter", "speed_boost", "execute", "first_strike"];
    const options = [...(run.skillOptions ?? [])].sort((a, b) =>
      priority.indexOf(a.type) - priority.indexOf(b.type));
    return { type: "CHOOSE_SKILL", skillId: options[0]?.id ?? "" };
  }
  if (run.phase === "event_test_of_might") return { type: "TEST_OF_MIGHT_LEAVE" };
  if (run.phase === "rest") return { type: "REST_HEAL" };
  if (run.phase === "minigame") {
    return run.hp < run.maxHp * 0.5
      ? { type: "LEAVE_MINIGAME" }
      : run.minigameResult ? { type: "CONTINUE_MINIGAME" } : { type: "PLAY_MINIGAME" };
  }
  if (run.phase === "shop") {
    const items = (run.shopItems ?? []).filter((item) =>
      (item.stock ?? 1) > 0 && run.gold >= item.cost);
    items.sort((a, b) => {
      const score = (item: typeof a) =>
        item.consumable === "health_potion" ? 100
          : item.consumable === "guard_tonic" ? 95
            : item.stat === "defense" ? 90
              : item.stat === "maxHp" ? 85
                : item.stat === "attack" ? 80
                  : item.stat === "speed" ? 70 : 20;
      return score(b) - score(a);
    });
    return items[0] ? { type: "BUY_SHOP", itemId: items[0].id } : { type: "LEAVE_SHOP" };
  }
  if (run.phase === "combat") {
    if (run.enemies.length === 0) return { type: "CONTINUE_POST_COMBAT" };
    if (run.combatTurn === "enemy") {
      return run.playerCombat?.pendingHeroAttack
        ? { type: "FINISH_HERO_ATTACK" }
        : { type: "RESOLVE_ENEMY_TURN" };
    }
    if (run.playerCombat?.lastConsumable === "health_potion"
      || run.playerCombat?.lastConsumable === "guard_tonic") {
      return { type: "FINISH_BONUS_CONSUMABLE" };
    }
    if (run.hp < run.maxHp * 0.5 && (run.consumables.health_potion ?? 0) > 0) {
      return { type: "USE_CONSUMABLE", consumable: "health_potion" };
    }
    if (run.isBossCombat && (run.consumables.guard_tonic ?? 0) > 0) {
      return { type: "USE_CONSUMABLE", consumable: "guard_tonic" };
    }
    if ((run.enemies.length > 1 || run.isBossCombat) && (run.consumables.fire_bomb ?? 0) > 0) {
      return { type: "USE_CONSUMABLE", consumable: "fire_bomb" };
    }
    const target = run.enemies.find((enemy) => enemy.hp > 0);
    if (run.characterId === "alan-a-dale") {
      return {
        type: "BARD_ATTACK",
        move: target?.speciesKey === "ochre_jelly" ? "cutting_words" : "electric",
        targetId: target?.id,
      };
    }
    if (run.characterId === "unc" && !run.playerCombat?.holdMyBeerUsed) {
      return { type: "UNC_HOLD_MY_BEER", targetId: target?.id };
    }
    return { type: "PLAYER_ATTACK", targetId: target?.id };
  }
  throw new Error(`campaign fixture reached unsupported phase ${run.phase}`);
}

function nextEncounterAction(state: ReturnType<typeof createInitialState>): GameAction {
  const run = state.run!;
  if (run.trailCinematic) return run.trailCinematic === "prologue"
    ? { type: "SKIP_PROLOGUE" } : { type: "FINISH_TRAIL_CINEMATIC" };
  if (run.phase === "explore") return { type: "ROLL_DICE" };
  if (run.phase === "moving") return run.rollAnimating
    ? { type: "BEGIN_MOVEMENT" } : { type: "STEP_MOVE" };
  if (run.phase === "combat") {
    if (!run.enemies.length) return { type: "CONTINUE_POST_COMBAT" };
    if (run.combatTurn === "player") {
      if ((run.consumables.fire_bomb ?? 0) > 0) {
        return { type: "USE_CONSUMABLE", consumable: "fire_bomb" };
      }
      if (run.playerCombat?.lastConsumable === "health_potion") {
        return { type: "FINISH_BONUS_CONSUMABLE" };
      }
      return { type: "PLAYER_ATTACK", targetId: run.enemies[0]?.id };
    }
    return run.playerCombat?.pendingHeroAttack
      ? { type: "FINISH_HERO_ATTACK" } : { type: "RESOLVE_ENEMY_TURN" };
  }
  throw new Error(`encounter fixture reached unsupported phase ${run.phase}`);
}

test("normal server-issued campaign replay remains exact across a real encounter", async () => {
  const wallet = "0x" + "e1".repeat(20);
  const seed = "55".repeat(32);
  const runId = crypto.randomUUID();
  let state = createInitialState("john", seed);
  await db.insert(diceboundRuns).values({
    id: runId,
    walletAddress: wallet,
    seed,
    seedCommitment: seedCommitment(seed),
    engineVersion: ENGINE_VERSION,
    initialState: state,
    initialStateHash: initialStateHash(state),
    initialStateCommitment: initialStateCommitment(runId, wallet, seedCommitment(seed), state),
    canonicalState: state,
    status: "active",
    sequence: 0,
  });
  const actions: GameAction[] = [];
  try {
    for (let sequence = 0; sequence < 15; sequence += 1) {
       const action = nextEncounterAction(state);
      actions.push(action);
      const result = await submitAction(wallet, runId, `campaign-${sequence}`, sequence, action);
      state = act(state, action, { seed, now: (sequence + 1) * 1000 });
      assert.equal(result.state.run?.phase, state.run?.phase);
      assert.equal(canonicalJson(result.state), canonicalJson(state));
      if (result.status === "dead") break;
    }
    assert.equal(state.run?.phase, "explore");
    assert.ok(state.run?.victoryReport);
    const replay = await getReplay(wallet, runId);
    assert.ok(replay);
    assert.deepEqual(replay.state, state);
    assert.deepEqual(replay.events.map((event) => event.action), actions);
    const [row] = await db.select().from(diceboundRuns).where(eq(diceboundRuns.id, runId));
    assert.equal(row?.status, "active");
  } finally {
    await db.delete(diceboundActionEvents).where(eq(diceboundActionEvents.runId, runId));
    await db.delete(diceboundDeathRolls).where(eq(diceboundDeathRolls.runId, runId));
    await db.delete(diceboundRuns).where(eq(diceboundRuns.id, runId));
  }
});

test("bounded natural campaign planner reports the best legal in-memory run", () => {
  let best = { character: "alan-a-dale", seed: "", actions: 0, floor: 0, phase: "unknown" };
  let winner: { character: string; seed: string; actions: number } | undefined;
  for (const character of ["alan-a-dale", "unc"] as const) {
    for (let index = 0; index < 128; index += 1) {
      const seed = index.toString(16).padStart(64, "0");
      let state = createInitialState(character, seed);
      let actions = 0;
      try {
        for (; actions < 3000 && state.run; actions += 1) {
          state = act(state, nextCampaignAction(state), {
            seed,
            now: (actions + 1) * 1000,
          });
        }
      } catch {
        // Defeat is a normal terminal diagnostic for the bounded search.
      }
      const floor = state.run?.floor ?? LEVELS.length;
      const phase = state.run?.phase ?? "won";
      if (floor > best.floor || (floor === best.floor && actions > best.actions)) {
        best = { character, seed, actions, floor, phase };
      }
      if (!state.run) {
        winner = { character, seed, actions };
        break;
      }
    }
    if (winner) break;
  }
  if (winner) {
    console.info(`natural campaign winner ${winner.character} seed=${winner.seed} actions=${winner.actions}`);
  } else {
    console.info(`natural campaign bounded search best ${best.character} seed=${best.seed} floor=${best.floor} phase=${best.phase} actions=${best.actions}`);
  }
  assert.ok(best.actions > 0);
});

test("independent review is signed, fixed-value, exact-once, and fail-closed", async () => {
  const wallet = "0x" + "f1".repeat(20);
  const seed = "66".repeat(32);
  let runId = crypto.randomUUID();
  let state = createInitialState("unc", seed);
  const reviewRun = state.run!;
  reviewRun.trailCinematic = undefined;
  reviewRun.phase = "combat";
  reviewRun.combatTurn = "player";
  reviewRun.isBossCombat = true;
  reviewRun.floor = LEVELS.length;
  reviewRun.enemies = generateEnemies(1, 1, false, 1, 1).map((enemy) => ({ ...enemy, hp: 1 }));
  while (deriveDeathRoll(seed, runId, reviewRun.enemies[0]!.id, 1, 0) >= 5) {
    runId = crypto.randomUUID();
  }
  reviewRun.consumables.fire_bomb = 1;
  reviewRun.playerCombat = {
    attackTimer: 0,
    roundCounter: 0,
    heroAttackSequence: 0,
    heroConsumableSequence: 0,
    pendingFireBomb: false,
    enemyAttackSequence: 0,
    takedownUsed: false,
  };
  await db.insert(diceboundRuns).values({
    id: runId,
    walletAddress: wallet,
    seed,
    seedCommitment: seedCommitment(seed),
    engineVersion: ENGINE_VERSION,
    initialState: state,
    initialStateHash: initialStateHash(state),
    initialStateCommitment: initialStateCommitment(runId, wallet, seedCommitment(seed), state),
    canonicalState: state,
    status: "active",
    sequence: 0,
  });
  const previous = {
    DICEBOUND_REVIEW_ENABLED: process.env.DICEBOUND_REVIEW_ENABLED,
    DICEBOUND_REVIEW_SETTLEMENT_ENABLED: process.env.DICEBOUND_REVIEW_SETTLEMENT_ENABLED,
    TOKEN_REWARDS_ENABLED: process.env.TOKEN_REWARDS_ENABLED,
    TOKEN_REWARDS_COMBAT_VERIFIED: process.env.TOKEN_REWARDS_COMBAT_VERIFIED,
    TOKEN_PURCHASES_ENABLED: process.env.TOKEN_PURCHASES_ENABLED,
    DICEBOUND_REVIEW_OPERATOR_PUBLIC_KEYS: process.env.DICEBOUND_REVIEW_OPERATOR_PUBLIC_KEYS,
  };
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const reviewerId = "test-reviewer";
  process.env.DICEBOUND_REVIEW_ENABLED = "true";
  process.env.DICEBOUND_REVIEW_SETTLEMENT_ENABLED = "true";
  process.env.TOKEN_REWARDS_ENABLED = "true";
  process.env.TOKEN_REWARDS_COMBAT_VERIFIED = "true";
  process.env.TOKEN_PURCHASES_ENABLED = "true";
  process.env.DICEBOUND_REVIEW_OPERATOR_PUBLIC_KEYS = JSON.stringify({
    [reviewerId]: publicKey.export({ type: "spki", format: "pem" }).toString(),
  });
  setTokenPurchaseTestDependencies({
    quoteFetcher: async () => ({
      symbol: "GLD",
      tokenAddress: "0xc9a981fee1f9dec688bb123ccdecc63d0debfc4e",
      price: "2.5",
      amountBaseUnits: "400000000000000000000",
      source: "test-approved-quote",
      timestamp: new Date(Date.now() - 86_400_000),
      quoteDelayed: "previous-close",
      delayed: true,
    }),
    escrowAccountFactory: () => ({ address: ESCROW_ADDRESS } as never),
    chainClient: {
      readContract: async () => 10n ** 30n,
      getBalance: async () => 10n ** 18n,
    } as never,
  });
  try {
    for (let sequence = 0; sequence < 400 && state.run; sequence += 1) {
      const action = nextCampaignAction(state);
      const result = await submitAction(wallet, runId, `review-campaign-${sequence}`, sequence, action);
      state = act(state, action, { seed, now: (sequence + 1) * 1000 });
      if (result.status === "dead") throw new Error("review fixture unexpectedly died");
    }
    const [roll] = await db.select().from(diceboundDeathRolls).where(eq(diceboundDeathRolls.runId, runId));
    assert.ok(roll);
    const events = await db.select().from(diceboundActionEvents)
      .where(eq(diceboundActionEvents.runId, runId));
    const deathEvent = events.find((event) => (event.response as { deaths?: string[] }).deaths?.includes(roll.monsterId));
    assert.ok(deathEvent);
    const evidence = {
      runId,
      deathRollId: roll.id,
      monsterId: roll.monsterId,
      deathEventSequence: deathEvent.sequence,
      seedCommitment: seedCommitment(seed),
      replayStateHash: createHash("sha256").update(canonicalJson(state)).digest("hex"),
      rollValue: roll.rollValue,
      rollUpperBound: roll.rollUpperBound,
      successThreshold: roll.successThreshold,
      decision: roll.rollValue < roll.successThreshold ? "approved" : "rejected",
    };
    const stableJson = canonicalJson(evidence);
    const digest = createHash("sha256").update(stableJson).digest("hex");
    const payload = `dicebound-review-v1:${roll.id}:${runId}:${reviewerId}:${evidence.decision}:${digest}`;
    const authorization = sign(null, Buffer.from(payload), privateKey).toString("base64");
    process.env.DICEBOUND_REVIEW_ENABLED = "false";
    await assert.rejects(reviewDiceboundDeath({
      deathRollId: roll.id, reviewerId, evidence, authorization,
    }));
    process.env.DICEBOUND_REVIEW_ENABLED = "true";
    await assert.rejects(reviewDiceboundDeath({
      deathRollId: roll.id,
      reviewerId,
      evidence: { ...evidence, rollValue: 99 },
      authorization,
    }));
    await assert.rejects(reviewDiceboundDeath({
      deathRollId: roll.id,
      reviewerId,
      evidence,
      authorization: Buffer.from("bad-signature").toString("base64"),
    }));
    if (evidence.decision === "rejected") {
      const reviewed = await reviewDiceboundDeath({ deathRollId: roll.id, reviewerId, evidence, authorization });
      assert.equal(reviewed.rewardId, null);
      const retry = await reviewDiceboundDeath({ deathRollId: roll.id, reviewerId, evidence, authorization });
      assert.equal(retry.rewardId, null);
    } else {
      const [reviewed, concurrentRetry] = await Promise.all([
        reviewDiceboundDeath({ deathRollId: roll.id, reviewerId, evidence, authorization }),
        reviewDiceboundDeath({ deathRollId: roll.id, reviewerId, evidence, authorization }),
      ]);
      assert.ok(reviewed.rewardId);
      assert.equal(concurrentRetry.rewardId, reviewed.rewardId);
    }
  } finally {
    setTokenPurchaseTestDependencies(null);
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await db.delete(diceboundActionEvents).where(eq(diceboundActionEvents.runId, runId));
    await db.delete(diceboundDeathReviews).where(eq(diceboundDeathReviews.runId, runId));
    await db.delete(diceboundDeathRolls).where(eq(diceboundDeathRolls.runId, runId));
    await db.delete(tokenRewards).where(eq(tokenRewards.eligibilityId, runId));
    await db.delete(diceboundRuns).where(eq(diceboundRuns.id, runId));
  }
});

test("failed independent death roll is rejected without creating a reward", async () => {
  const wallet = "0x" + "f2".repeat(20);
  const seed = "88".repeat(32);
  let runId = crypto.randomUUID();
  const initial = createInitialState("john", seed);
  const run = initial.run!;
  run.trailCinematic = undefined;
  run.phase = "combat";
  run.combatTurn = "player";
  run.isBossCombat = true;
  run.enemies = generateEnemies(1, 1).map((enemy) => ({ ...enemy, hp: 1 }));
  run.consumables.fire_bomb = 1;
  run.playerCombat = {
    attackTimer: 0, roundCounter: 0, heroAttackSequence: 0, heroConsumableSequence: 0,
    pendingFireBomb: false, enemyAttackSequence: 0, takedownUsed: false,
  };
  while (deriveDeathRoll(seed, runId, run.enemies[0]!.id, 1, 0) < 5) runId = crypto.randomUUID();
  const primed = act(initial, { type: "USE_CONSUMABLE", consumable: "fire_bomb" }, { seed, now: 1000 });
  const terminal = act(primed, { type: "RESOLVE_ENEMY_TURN" }, { seed, now: 2000 });
  const monsterId = run.enemies[0]!.id;
  const rollValue = deriveDeathRoll(seed, runId, monsterId, 1, 0);
  const deathRollId = crypto.randomUUID();
  const commitment = createHash("sha256")
    .update(`dicebound-death-5pct-v2:${runId}:${monsterId}:${rollValue}:100:5:${seed}`)
    .digest("hex");
  await db.insert(diceboundRuns).values({
    id: runId, walletAddress: wallet, seed, seedCommitment: seedCommitment(seed),
    engineVersion: ENGINE_VERSION, initialState: initial,
    initialStateHash: initialStateHash(initial),
    initialStateCommitment: initialStateCommitment(runId, wallet, seedCommitment(seed), initial),
    canonicalState: terminal, status: "won", sequence: 2,
  });
  const firstIntent = { action: { type: "USE_CONSUMABLE", consumable: "fire_bomb" }, expectedSequence: 0 };
  const secondIntent = { action: { type: "RESOLVE_ENEMY_TURN" }, expectedSequence: 1 };
  const firstResponse = { deaths: [] };
  const secondResponse = { deaths: [monsterId] };
  const firstBeforeHash = initialStateHash(initial);
  const firstAfterHash = initialStateHash(primed);
  const firstCommitment = actionEventCommitment(
    initialStateCommitment(runId, wallet, seedCommitment(seed), initial),
    runId, wallet, seedCommitment(seed), ENGINE_VERSION, 1,
    firstIntent, firstResponse, firstBeforeHash, firstAfterHash,
  );
  const secondCommitment = actionEventCommitment(
    firstCommitment, runId, wallet, seedCommitment(seed), ENGINE_VERSION, 2,
    secondIntent, secondResponse, firstAfterHash, initialStateHash(terminal),
  );
  await db.insert(diceboundActionEvents).values([
    {
      id: crypto.randomUUID(), runId, sequence: 1, clientRequestId: "failed-bomb",
      intent: firstIntent, response: firstResponse,
      beforeStateHash: firstBeforeHash, afterStateHash: firstAfterHash,
      previousEventCommitment: initialStateCommitment(runId, wallet, seedCommitment(seed), initial),
      eventCommitment: firstCommitment,
    },
    {
      id: crypto.randomUUID(), runId, sequence: 2, clientRequestId: "failed-impact",
      intent: secondIntent, response: secondResponse,
      beforeStateHash: firstAfterHash, afterStateHash: initialStateHash(terminal),
      previousEventCommitment: firstCommitment, eventCommitment: secondCommitment,
    },
  ]);
  await db.insert(diceboundDeathRolls).values({
    id: deathRollId, runId, monsterId, encounterIndex: 1, monsterIndex: 0,
    algorithmVersion: DEATH_ROLL_ALGORITHM_VERSION, rollValue, rollUpperBound: 100,
    successThreshold: 5, commitment, status: "pending_review",
  });
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const reviewerId = "failed-reviewer";
  const previous = process.env.DICEBOUND_REVIEW_ENABLED;
  process.env.DICEBOUND_REVIEW_ENABLED = "true";
  process.env.DICEBOUND_REVIEW_OPERATOR_PUBLIC_KEYS = JSON.stringify({
    [reviewerId]: publicKey.export({ type: "spki", format: "pem" }).toString(),
  });
  try {
    const replayStateHash = createHash("sha256").update(canonicalJson(terminal)).digest("hex");
    const evidence = {
      runId, deathRollId, monsterId, deathEventSequence: 2,
      seedCommitment: seedCommitment(seed), replayStateHash, rollValue,
      rollUpperBound: 100, successThreshold: 5, decision: "rejected",
    };
    const digest = createHash("sha256").update(canonicalJson(evidence)).digest("hex");
    const payload = `dicebound-review-v1:${deathRollId}:${runId}:${reviewerId}:rejected:${digest}`;
    const authorization = sign(null, Buffer.from(payload), privateKey).toString("base64");
    const result = await reviewDiceboundDeath({
      deathRollId, reviewerId, evidence, authorization,
    });
    assert.equal(result.rewardId, null);
    const retry = await reviewDiceboundDeath({
      deathRollId, reviewerId, evidence, authorization,
    });
    assert.equal(retry.rewardId, null);
    assert.equal((await db.select().from(tokenRewards).where(eq(tokenRewards.eligibilityId, runId))).length, 0);
    await db.delete(diceboundDeathReviews).where(eq(diceboundDeathReviews.deathRollId, deathRollId));
    await db.update(diceboundDeathRolls).set({
      algorithmVersion: "tampered-algorithm",
      status: "pending_review",
    }).where(eq(diceboundDeathRolls.id, deathRollId));
    await assert.rejects(
      () => reviewDiceboundDeath({ deathRollId, reviewerId, evidence, authorization }),
      (error: unknown) => (error as { code?: string }).code === "death_commitment_invalid",
    );
  } finally {
    if (previous === undefined) delete process.env.DICEBOUND_REVIEW_ENABLED;
    else process.env.DICEBOUND_REVIEW_ENABLED = previous;
    delete process.env.DICEBOUND_REVIEW_OPERATOR_PUBLIC_KEYS;
    await db.delete(diceboundDeathReviews).where(eq(diceboundDeathReviews.runId, runId));
    await db.delete(diceboundActionEvents).where(eq(diceboundActionEvents.runId, runId));
    await db.delete(diceboundDeathRolls).where(eq(diceboundDeathRolls.runId, runId));
    await db.delete(diceboundRuns).where(eq(diceboundRuns.id, runId));
  }
});