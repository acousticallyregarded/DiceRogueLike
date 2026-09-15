import assert from "node:assert/strict";
import test from "node:test";
import { act, createInitialState, type GameAction, type GameStateV4 } from "../engine.js";
import { createSingleFlightActionDispatcher } from "./authoritative-action-dispatcher.js";

test("automatic movement, combat response, and defeat stay on the canonical sequence", async () => {
  let serverState = act(createInitialState(), { type: "START_RUN", characterId: "unc" }, {
    seed: "client-integration",
    now: 1,
  });
  serverState = act(serverState, { type: "SKIP_PROLOGUE" }, { now: 2 });
  serverState = act(serverState, { type: "FINISH_TRAIL_CINEMATIC" }, { now: 3 });
  serverState.run!.tiles = serverState.run!.tiles.map((tile, index) => (
    index === 0 ? tile : { ...tile, type: "enemy" as const }
  ));

  let clientState: GameStateV4 = structuredClone(serverState);
  let sequence = 0;
  let appliedSequence = 0;
  const dispatcher = createSingleFlightActionDispatcher<GameAction, {
    state: GameStateV4;
    sequence: number;
  }>({
    submit: async action => {
      serverState = act(serverState, action, { now: sequence + 10 });
      sequence += 1;
      return { state: structuredClone(serverState), sequence };
    },
    apply: result => {
      clientState = result.state;
      appliedSequence = result.sequence;
    },
  });

  const submit = async (action: GameAction) => {
    const before = sequence;
    const result = await dispatcher.dispatch(action);
    assert.equal(result.accepted, true);
    assert.equal(sequence, before + 1);
    assert.equal(appliedSequence, sequence);
    assert.deepEqual(clientState, serverState);
  };

  await submit({ type: "ROLL_DICE" });
  await submit({ type: "BEGIN_MOVEMENT" });
  while (clientState.run?.phase === "moving") await submit({ type: "STEP_MOVE" });
  assert.equal(clientState.run?.phase, "combat");

  const targetId = clientState.run!.enemies[0].id;
  await submit({ type: "PLAYER_ATTACK", targetId });
  await submit({ type: "FINISH_HERO_ATTACK" });
  await submit({ type: "RESOLVE_ENEMY_TURN" });

  clientState.run!.hp = 1;
  clientState.run!.enemies[0].attack = 10_000;
  clientState.run!.enemies[0].hp = 10_000;
  clientState.run!.enemies[0].maxHp = 10_000;
  serverState = structuredClone(clientState);
  await submit({ type: "PLAYER_ATTACK", targetId });
  await submit({ type: "FINISH_HERO_ATTACK" });
  await submit({ type: "RESOLVE_ENEMY_TURN" });
  assert.equal(clientState.run?.heroDeathPending, true);
  await submit({ type: "FINISH_HERO_DEATH" });
  assert.equal(clientState.run?.phase, "defeat");
});

test("overlapping actions are rejected until the idempotent submission settles", async () => {
  let release!: () => void;
  const blocked = new Promise<void>(resolve => {
    release = resolve;
  });
  const dispatcher = createSingleFlightActionDispatcher<string, string>({
    submit: async action => {
      await blocked;
      return action;
    },
    apply: () => undefined,
  });

  const first = dispatcher.dispatch("first");
  assert.equal(dispatcher.isPending(), true);
  assert.deepEqual(await dispatcher.dispatch("overlap"), { accepted: false, result: null });
  release();
  assert.deepEqual(await first, { accepted: true, result: "first" });
  assert.equal(dispatcher.isPending(), false);
});