import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { and, eq } from "drizzle-orm";
import {
  db,
  diceboundActionEvents,
  diceboundDeathRolls,
  diceboundRunStarts,
  diceboundRuns,
  walletSessions,
} from "@workspace/db";
import app from "../app";
import { hashOpaqueToken, newOpaqueToken, WALLET_CHAIN_ID } from "../lib/wallet-security";
import {
  createInitialState,
  ENGINE_VERSION,
  initialStateCommitment,
  initialStateHash,
  seedCommitment,
} from "../lib/dicebound-runs";
import { generateEnemies } from "@workspace/dicebound-engine";
import { LEVELS } from "@workspace/dicebound-engine/level-content";

type Result = { status: number; body: any };
type Client = {
  request(path: string, method: "GET" | "POST", body?: unknown): Promise<Result>;
  close(): Promise<void>;
  cleanup(): Promise<void>;
};

async function client(suffix: string): Promise<Client> {
  const wallet = `0x${suffix.repeat(40 / suffix.length)}`.toLowerCase();
  const sessionToken = newOpaqueToken();
  const csrfToken = newOpaqueToken();
  const sessionId = crypto.randomUUID();
  await db.insert(walletSessions).values({
    id: sessionId,
    tokenHash: hashOpaqueToken(sessionToken),
    address: wallet,
    chainId: WALLET_CHAIN_ID,
    csrfToken,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });
  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test_server_failed");
  const base = `http://127.0.0.1:${address.port}/api`;
  return {
    async request(path, method, body) {
      const response = await fetch(`${base}${path}`, {
        method,
        headers: {
          Origin: "http://localhost",
          Cookie: `dicebound_session=${encodeURIComponent(sessionToken)}`,
          "X-Wallet-Address": wallet,
          "X-CSRF-Token": csrfToken,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    },
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
    async cleanup() {
      const runs = await db.select({ id: diceboundRuns.id }).from(diceboundRuns)
        .where(eq(diceboundRuns.walletAddress, wallet));
      for (const run of runs) {
        await db.delete(diceboundActionEvents).where(eq(diceboundActionEvents.runId, run.id));
        await db.delete(diceboundDeathRolls).where(eq(diceboundDeathRolls.runId, run.id));
        await db.delete(diceboundRunStarts).where(eq(diceboundRunStarts.runId, run.id));
        await db.delete(diceboundRuns).where(eq(diceboundRuns.id, run.id));
      }
      await db.delete(walletSessions).where(and(eq(walletSessions.id, sessionId), eq(walletSessions.address, wallet)));
    },
  };
}

async function withClient<T>(suffix: string, callback: (client: Client) => Promise<T>): Promise<T> {
  const testClient = await client(suffix);
  try {
    return await callback(testClient);
  } finally {
    await testClient.close();
    await testClient.cleanup();
  }
}

async function start(testClient: Client, character: "john" | "unc" | "alan-a-dale", id = "start") {
  const response = await testClient.request("/wallet/runs/start", "POST", {
    clientRequestId: id,
    character,
  });
  assert.equal(response.status, 201);
  return response.body;
}

test("authenticated start/current/reconnect/replay expose real canonical state", async () => {
  await withClient("a1", async (testClient) => {
    const started = await start(testClient, "john");
    assert.equal(started.state.run.characterId, "john");
    assert.equal(started.state.run.enemies.length, 0);
    assert.equal("seed" in started, false);
    const current = await testClient.request("/wallet/runs/current", "GET");
    assert.deepEqual(current.body, started);
    const action = await testClient.request(`/wallet/runs/${started.runId}/action`, "POST", {
      clientRequestId: "cinematic",
      expectedSequence: 0,
      action: { type: "FINISH_TRAIL_CINEMATIC" },
    });
    assert.equal(action.status, 200);
    const replay = await testClient.request(`/wallet/runs/${started.runId}/replay`, "GET");
    assert.equal(replay.status, 200);
    assert.deepEqual(replay.body.state, action.body.state);
    assert.equal(replay.body.events.length, 1);
  });
});

test("concurrent starts are idempotent and a second active run is rejected", async () => {
  await withClient("a2", async (testClient) => {
    const body = { clientRequestId: "same-start", character: "unc" };
    const results = await Promise.all([
      testClient.request("/wallet/runs/start", "POST", body),
      testClient.request("/wallet/runs/start", "POST", body),
    ]);
    assert.equal(results[0].status, 201);
    assert.equal(results[1].status, 201);
    assert.deepEqual(results[0].body, results[1].body);
    const other = await testClient.request("/wallet/runs/start", "POST", {
      clientRequestId: "different-start",
      character: "alan-a-dale",
    });
    assert.equal(other.status, 409);
    assert.equal(other.body.error, "run_already_active");
  });
});

test("exact action retry is idempotent while stale concurrent action is rejected", async () => {
  await withClient("a3", async (testClient) => {
    const started = await start(testClient, "alan-a-dale");
    const request = {
      clientRequestId: "same-action",
      expectedSequence: 0,
      action: { type: "FINISH_TRAIL_CINEMATIC" },
    };
    const responses = await Promise.all([
      testClient.request(`/wallet/runs/${started.runId}/action`, "POST", request),
      testClient.request(`/wallet/runs/${started.runId}/action`, "POST", request),
    ]);
    assert.equal(responses[0].status, 200);
    assert.equal(responses[1].status, 200);
    assert.deepEqual(responses[0].body, responses[1].body);
    const stale = await testClient.request(`/wallet/runs/${started.runId}/action`, "POST", {
      clientRequestId: "stale-action",
      expectedSequence: 0,
      action: { type: "FINISH_TRAIL_CINEMATIC" },
    });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.error, "sequence_conflict");
  });
});

test("all real characters start and character-specific moves cannot be forged", async () => {
  for (const [index, character] of (["john", "unc", "alan-a-dale"] as const).entries()) {
    await withClient(`b${index + 1}`, async (testClient) => {
      const started = await start(testClient, character, `start-${index}`);
      assert.equal(started.state.run.characterId, character);
      const illegal = await testClient.request(`/wallet/runs/${started.runId}/action`, "POST", {
        clientRequestId: `illegal-${index}`,
        expectedSequence: 0,
        action: character === "john"
          ? { type: "BARD_ATTACK", move: "cutting_words", targetId: "forged-monster" }
          : character === "unc"
            ? { type: "JOHN_TAKEDOWN", targetId: "forged-monster" }
            : { type: "UNC_HOLD_MY_BEER", targetId: "forged-monster" },
      });
      assert.equal(illegal.status, 409);
    });
  }
});

test("inventory, skills, monsters, and targets are server-owned", async () => {
  await withClient("a5", async (testClient) => {
    const invalidStart = await testClient.request("/wallet/runs/start", "POST", {
      clientRequestId: "forged-start",
      character: "john",
      stats: { hp: 999999 },
      inventory: ["fire_bomb"],
      monsters: [{ id: "forged", hp: 1 }],
    });
    assert.equal(invalidStart.status, 400);
    const started = await start(testClient, "john");
    const forged = await testClient.request(`/wallet/runs/${started.runId}/action`, "POST", {
      clientRequestId: "forged-action",
      expectedSequence: 0,
      action: { type: "BUY_SHOP", itemId: "forged-item", hp: 1 },
    });
    assert.equal(forged.status, 400);
    const target = await testClient.request(`/wallet/runs/${started.runId}/action`, "POST", {
      clientRequestId: "forged-target",
      expectedSequence: 0,
      action: { type: "PLAYER_ATTACK", targetId: "forged-monster" },
    });
    assert.equal(target.status, 409);
  });
});

test("authenticated real multi-enemy terminal death is durable across concurrent action retry", async () => {
  await withClient("c1", async (testClient) => {
    const started = await start(testClient, "unc", "terminal-fixture");
    const seed = "77".repeat(32);
    const fixture = createInitialState("unc", seed);
    const run = fixture.run!;
    run.trailCinematic = undefined;
    run.phase = "combat";
    run.combatTurn = "player";
    run.isBossCombat = true;
    run.floor = LEVELS.length;
    run.enemies = generateEnemies(2, 1, false, 1, 1).map((enemy) => ({ ...enemy, hp: 1 }));
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
    await db.update(diceboundRuns).set({
      seed,
      seedCommitment: seedCommitment(seed),
      engineVersion: ENGINE_VERSION,
      initialState: fixture,
      initialStateHash: initialStateHash(fixture),
      initialStateCommitment: initialStateCommitment(started.runId, `0x${"c1".repeat(20)}`, seedCommitment(seed), fixture),
      canonicalState: fixture,
      sequence: 0,
      status: "active",
    }).where(eq(diceboundRuns.id, started.runId));
    const primed = await testClient.request(`/wallet/runs/${started.runId}/action`, "POST", {
      clientRequestId: "fixture-bomb",
      expectedSequence: 0,
      action: { type: "USE_CONSUMABLE", consumable: "fire_bomb" },
    });
    assert.equal(primed.status, 200, JSON.stringify(primed.body));
    const impactRequest = {
      clientRequestId: "fixture-impact",
      expectedSequence: 1,
      action: { type: "RESOLVE_ENEMY_TURN" },
    };
    const impacts = await Promise.all([
      testClient.request(`/wallet/runs/${started.runId}/action`, "POST", impactRequest),
      testClient.request(`/wallet/runs/${started.runId}/action`, "POST", impactRequest),
    ]);
    assert.equal(impacts[0].status, 200);
    assert.equal(impacts[1].status, 200);
    assert.deepEqual(impacts[0].body, impacts[1].body);
    assert.equal(impacts[0].body.status, "active");
    assert.equal(impacts[0].body.deaths.length, 2);
    const retry = await testClient.request(`/wallet/runs/${started.runId}/action`, "POST", impactRequest);
    assert.deepEqual(retry.body, impacts[0].body);
    const dismiss = await testClient.request(`/wallet/runs/${started.runId}/action`, "POST", {
      clientRequestId: "fixture-dismiss",
      expectedSequence: 2,
      action: { type: "DISMISS_VICTORY_REPORT" },
    });
    assert.equal(dismiss.status, 200);
    let terminal = dismiss.body;
    for (let step = 0; step < 4; step += 1) {
      terminal = (await testClient.request(`/wallet/runs/${started.runId}/action`, "POST", {
        clientRequestId: `fixture-epilogue-${step}`,
        expectedSequence: 3 + step,
        action: { type: "ADVANCE_FINAL_EPILOGUE" },
      })).body;
    }
    assert.equal(terminal.status, "won");
    const rolls = await db.select().from(diceboundDeathRolls)
      .where(eq(diceboundDeathRolls.runId, started.runId));
    assert.equal(rolls.length, 2);
    assert.deepEqual(new Set(rolls.map((roll) => roll.monsterId)).size, 2);
    assert.ok(rolls.every((roll) => roll.rollValue >= 0 && roll.rollValue < 100 && roll.successThreshold === 5));
    const current = await testClient.request("/wallet/runs/current", "GET");
    assert.equal(current.body.status, "won");
    const replay = await testClient.request(`/wallet/runs/${started.runId}/replay`, "GET");
    assert.equal(replay.status, 200);
    assert.deepEqual(replay.body.state, current.body.state);
  });
});

test("intermediate boss victory continues to a later-floor reconnect and exact replay", async () => {
  await withClient("c2", async (testClient) => {
    const started = await start(testClient, "john", "later-floor");
    const seed = "78".repeat(32);
    const fixture = createInitialState("john", seed);
    const run = fixture.run!;
    run.trailCinematic = undefined;
    run.phase = "combat";
    run.combatTurn = "player";
    run.isBossCombat = true;
    run.floor = 1;
    run.enemies = generateEnemies(1, 1).map((enemy) => ({ ...enemy, hp: 1, boss: true }));
    run.consumables.fire_bomb = 1;
    run.playerCombat = {
      attackTimer: 0, roundCounter: 0, heroAttackSequence: 0, heroConsumableSequence: 0,
      pendingFireBomb: false, enemyAttackSequence: 0, takedownUsed: false,
    };
    await db.update(diceboundRuns).set({
      seed, seedCommitment: seedCommitment(seed), engineVersion: ENGINE_VERSION,
      initialState: fixture, initialStateHash: initialStateHash(fixture),
      initialStateCommitment: initialStateCommitment(started.runId, `0x${"c2".repeat(20)}`, seedCommitment(seed), fixture), canonicalState: fixture,
      sequence: 0, status: "active",
    }).where(eq(diceboundRuns.id, started.runId));
    await testClient.request(`/wallet/runs/${started.runId}/action`, "POST", {
      clientRequestId: "later-bomb", expectedSequence: 0,
      action: { type: "USE_CONSUMABLE", consumable: "fire_bomb" },
    });
    const boss = await testClient.request(`/wallet/runs/${started.runId}/action`, "POST", {
      clientRequestId: "later-impact", expectedSequence: 1,
      action: { type: "RESOLVE_ENEMY_TURN" },
    });
    assert.equal(boss.status, 200);
    assert.equal(boss.body.status, "active");
    await testClient.request(`/wallet/runs/${started.runId}/action`, "POST", {
      clientRequestId: "later-dismiss", expectedSequence: 2,
      action: { type: "DISMISS_VICTORY_REPORT" },
    });
    const continued = await testClient.request(`/wallet/runs/${started.runId}/action`, "POST", {
      clientRequestId: "later-continue", expectedSequence: 3,
      action: { type: "CONTINUE_RUN" },
    });
    assert.equal(continued.status, 200);
    assert.equal(continued.body.status, "active");
    assert.equal(continued.body.state.run.floor, 2);
    const current = await testClient.request("/wallet/runs/current", "GET");
    assert.equal(current.body.state.run.floor, 2);
    const replay = await testClient.request(`/wallet/runs/${started.runId}/replay`, "GET");
    assert.equal(replay.status, 200);
    assert.deepEqual(replay.body.state, current.body.state);
  });
});

test("authenticated defeat is terminal and only presentation actions remain accepted", async () => {
  await withClient("c3", async (testClient) => {
    const started = await start(testClient, "alan-a-dale", "defeat-fixture");
    const seed = "79".repeat(32);
    const fixture = createInitialState("alan-a-dale", seed);
    const run = fixture.run!;
    run.trailCinematic = undefined;
    run.phase = "combat";
    run.combatTurn = "enemy";
    run.hp = 1;
    run.enemies = generateEnemies(1, 1).map((enemy) => ({ ...enemy, attack: 999 }));
    run.playerCombat = {
      attackTimer: 0, roundCounter: 0, heroAttackSequence: 0, heroConsumableSequence: 0,
      pendingFireBomb: false, enemyAttackSequence: 0, takedownUsed: false,
    };
    await db.update(diceboundRuns).set({
      seed, seedCommitment: seedCommitment(seed), engineVersion: ENGINE_VERSION,
      initialState: fixture, initialStateHash: initialStateHash(fixture),
      initialStateCommitment: initialStateCommitment(started.runId, `0x${"c3".repeat(20)}`, seedCommitment(seed), fixture), canonicalState: fixture,
      sequence: 0, status: "active",
    }).where(eq(diceboundRuns.id, started.runId));
    const defeated = await testClient.request(`/wallet/runs/${started.runId}/action`, "POST", {
      clientRequestId: "defeat", expectedSequence: 0,
      action: { type: "RESOLVE_ENEMY_TURN" },
    });
    assert.equal(defeated.status, 200);
    assert.equal(defeated.body.status, "dead");
    const presentation = await testClient.request(`/wallet/runs/${started.runId}/action`, "POST", {
      clientRequestId: "defeat-presentation", expectedSequence: 1,
      action: { type: "FINISH_HERO_DEATH" },
    });
    assert.equal(presentation.status, 200);
    assert.equal(presentation.body.status, "dead");
    const afterDeathReplay = await testClient.request(`/wallet/runs/${started.runId}/replay`, "GET");
    assert.equal(afterDeathReplay.status, 200);
    assert.deepEqual(afterDeathReplay.body.state, presentation.body.state);
    const lobby = await testClient.request(`/wallet/runs/${started.runId}/action`, "POST", {
      clientRequestId: "defeat-lobby", expectedSequence: 2,
      action: { type: "RETURN_TO_LOBBY" },
    });
    assert.equal(lobby.status, 200);
    assert.equal(lobby.body.status, "dead");
    const finalReplay = await testClient.request(`/wallet/runs/${started.runId}/replay`, "GET");
    assert.equal(finalReplay.status, 200);
    assert.deepEqual(finalReplay.body.state, lobby.body.state);
  });
});

test("checkpoint hash tampering fails closed for action and replay", async () => {
  await withClient("c4", async (testClient) => {
    const started = await start(testClient, "john", "tamper-checkpoint");
    await db.update(diceboundRuns).set({
      initialStateHash: "tampered",
    }).where(eq(diceboundRuns.id, started.runId));
    const action = await testClient.request(`/wallet/runs/${started.runId}/action`, "POST", {
      clientRequestId: "tampered-action",
      expectedSequence: 0,
      action: { type: "FINISH_TRAIL_CINEMATIC" },
    });
    assert.equal(action.status, 409);
    assert.equal(action.body.error, "legacy_unreviewable");
    const replay = await testClient.request(`/wallet/runs/${started.runId}/replay`, "GET");
    assert.equal(replay.status, 409);
    assert.equal(replay.body.error, "legacy_unreviewable");
    const row = (await db.select().from(diceboundRuns).where(eq(diceboundRuns.id, started.runId)))[0]!;
    const canonical = row.canonicalState as { meta: Record<string, unknown> };
    await db.update(diceboundRuns).set({
      initialStateHash: initialStateHash(row.initialState as any),
      canonicalState: { ...row.canonicalState as object, meta: { ...canonical.meta, gems: 999999 } },
    }).where(eq(diceboundRuns.id, started.runId));
    const canonicalReplay = await testClient.request(`/wallet/runs/${started.runId}/replay`, "GET");
    assert.equal(canonicalReplay.status, 409);
    assert.equal(canonicalReplay.body.error, "replay_mismatch");
    const current = await testClient.request("/wallet/runs/current", "GET");
    assert.equal(current.status, 409);
    assert.equal(current.body.error, "replay_mismatch");
    const reconnect = await testClient.request(`/wallet/runs/${started.runId}`, "GET");
    assert.equal(reconnect.status, 409);
    assert.equal(reconnect.body.error, "replay_mismatch");
  });
});

test("valid cached retry succeeds, but tampered cached response fails closed", async () => {
  await withClient("c5", async (testClient) => {
    const started = await start(testClient, "john", "cached-integrity");
    const request = {
      clientRequestId: "cached-action",
      expectedSequence: 0,
      action: { type: "FINISH_TRAIL_CINEMATIC" },
    };
    const first = await testClient.request(`/wallet/runs/${started.runId}/action`, "POST", request);
    assert.equal(first.status, 200);
    const retry = await testClient.request(`/wallet/runs/${started.runId}/action`, "POST", request);
    assert.deepEqual(retry.body, first.body);
    const current = await testClient.request("/wallet/runs/current", "GET");
    assert.equal(current.status, 200);
    await db.update(diceboundActionEvents).set({
      response: { ...first.body, status: "won" },
    }).where(and(
      eq(diceboundActionEvents.runId, started.runId),
      eq(diceboundActionEvents.clientRequestId, request.clientRequestId),
    ));
    const tampered = await testClient.request(`/wallet/runs/${started.runId}/action`, "POST", request);
    assert.equal(tampered.status, 409);
    assert.equal(tampered.body.error, "event_chain_invalid");
    const reconnect = await testClient.request(`/wallet/runs/${started.runId}`, "GET");
    assert.equal(reconnect.status, 409);
    assert.equal(reconnect.body.error, "event_chain_invalid");
  });
});