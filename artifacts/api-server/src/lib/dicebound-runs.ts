import { createHash, createHmac, randomBytes } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { db, diceboundActionEvents, diceboundDeathRolls, diceboundRunStarts, diceboundRuns } from "@workspace/db";
import {
  act,
  BARD_MOVES,
  createInitialState as createEngineState,
  type CharacterId,
  type GameAction,
  type GameStateV4,
} from "@workspace/dicebound-engine";
import { LEVELS } from "@workspace/dicebound-engine/level-content";
import { trustRootMac } from "./wallet-security";

export type CharacterChoice = CharacterId;
export type RunAction = GameAction | "attack" | "use_potion" | "defend";
export type CombatState = GameStateV4;

export const DEATH_ROLL_ALGORITHM_VERSION = "dicebound-death-5pct-v2";
export const SEED_COMMITMENT_VERSION = "dicebound-seed-v1";
export const ENGINE_VERSION = "dicebound-engine-v1";
export const INITIAL_STATE_COMMITMENT_VERSION = "dicebound-initial-state-hmac-v1";
const ROLL_UPPER_BOUND = 100;
const SUCCESS_THRESHOLD = 5;
const PRESENTATION_ACTIONS = new Set([
  "RETURN_TO_LOBBY",
  "CONTINUE_RUN",
  "DISMISS_VICTORY_REPORT",
  "ADVANCE_VICTORY_REPORT",
  "ADVANCE_FINAL_EPILOGUE",
  "FINISH_HERO_DEATH",
]);
let seedFactory: (() => string) | null = null;

export function setDiceboundSeedFactory(factory: (() => string) | null): void {
  seedFactory = factory;
}

export class RunError extends Error {
  constructor(public readonly code: string, public readonly status: number, public readonly details?: unknown) {
    super(code);
  }
}

function characterId(choice: CharacterChoice): CharacterId {
  return choice;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).filter((key) => object[key] !== undefined).sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(",")}}`;
}

/** Reducer entropy/time is replay bookkeeping, not an action mutation. */
function gameplayJson(state: CombatState): string {
  const comparable = structuredClone(state) as CombatState;
  delete comparable.entropy;
  return canonicalJson(comparable);
}

export function seedCommitment(seed: string): string {
  return createHash("sha256").update(`${SEED_COMMITMENT_VERSION}:${seed}`).digest("hex");
}

export function initialStateHash(state: CombatState): string {
  return createHash("sha256").update(canonicalJson(state)).digest("hex");
}

export function initialStateCommitment(
  runId: string,
  walletAddress: string,
  seedCommitmentValue: string,
  state: CombatState,
): string {
  return trustRootMac(
    `${INITIAL_STATE_COMMITMENT_VERSION}:${runId}:${walletAddress}:${seedCommitmentValue}:${ENGINE_VERSION}:${initialStateHash(state)}`,
  );
}

export function assertCheckpoint(run: Pick<typeof diceboundRuns.$inferSelect,
  "id" | "walletAddress" | "seedCommitment" | "engineVersion" | "initialState" | "initialStateHash" | "initialStateCommitment">): CombatState {
  if (
    !run.initialState
    || run.engineVersion !== ENGINE_VERSION
    || !run.initialStateHash
    || !run.initialStateCommitment
    || initialStateHash(run.initialState as CombatState) !== run.initialStateHash
    || initialStateCommitment(
      run.id,
      run.walletAddress,
      run.seedCommitment,
      run.initialState as CombatState,
    ) !== run.initialStateCommitment
  ) {
    throw new RunError("legacy_unreviewable", 409);
  }
  return run.initialState as CombatState;
}

export function deriveDeathRoll(seed: string, runId: string, monsterId: string, encounterIndex: number, monsterIndex: number): number {
  const domain = `dicebound-death-roll-v2:${runId}:${encounterIndex}:${monsterIndex}:${monsterId}`;
  const limit = Math.floor(0x1_0000_0000 / ROLL_UPPER_BOUND) * ROLL_UPPER_BOUND;
  for (let counter = 0; counter < 256; counter += 1) {
    const digest = createHmac("sha256", Buffer.from(seed, "hex"))
      .update(`${domain}:${counter}`)
      .digest();
    const value = digest.readUInt32BE(0);
    if (value < limit) return value % ROLL_UPPER_BOUND;
  }
  throw new Error("death roll entropy exhausted");
}

export function actionEventCommitment(
  previous: string,
  runId: string,
  walletAddress: string,
  seedCommitmentValue: string,
  engineVersion: string,
  sequence: number,
  intent: unknown,
  response: unknown,
  beforeStateHash: string,
  afterStateHash: string,
): string {
  return trustRootMac(canonicalJson({
    domain: "dicebound-action-chain-hmac-v1",
    previous,
    runId,
    walletAddress,
    seedCommitment: seedCommitmentValue,
    engineVersion,
    sequence,
    intent,
    response,
    beforeStateHash,
    afterStateHash,
  }));
}

export function createInitialState(choice: CharacterChoice, seed?: string): CombatState {
  const state = createEngineState();
  if (!seed) return state;
  return act(state, { type: "START_RUN", characterId: characterId(choice) }, { seed, now: 0 });
}

function publicState(state: CombatState): CombatState {
  return state;
}

function publicRun(run: typeof diceboundRuns.$inferSelect) {
  const state = run.canonicalState as CombatState;
  const status = run.status as "active" | "won" | "dead";
  return {
    runId: run.id,
    sequence: run.sequence,
    status,
    state: publicState(state),
    seedCommitment: run.seedCommitment,
    ...(status === "active" ? {} : { seed: run.seed }),
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
  };
}
type PublicRun = ReturnType<typeof publicRun>;

function lockRun(runId: string) {
  return sql`SELECT pg_advisory_xact_lock(hashtextextended(${runId}, 0))`;
}

function lockWallet(walletAddress: string) {
  return sql`SELECT pg_advisory_xact_lock(hashtextextended(${walletAddress}, 1))`;
}

function normalizeAction(action: RunAction): GameAction {
  if (action === "attack") return { type: "PLAYER_ATTACK" };
  if (action === "use_potion") return { type: "USE_CONSUMABLE", consumable: "health_potion" };
  if (action === "defend") return { type: "USE_CONSUMABLE", consumable: "guard_tonic" };
  return action;
}

export function replayCanonicalRun(seed: string, initial: CombatState, actions: RunAction[]): CombatState {
  // Replay must begin from the immutable server checkpoint rather than
  // reconstructing a potentially evolved campaign from today's reducer.
  let state = structuredClone(initial) as CombatState;
  actions.forEach((action, index) => {
    state = act(state, normalizeActionForState(action, state), { seed, now: (index + 1) * 1000 });
  });
  return state;
}

export function replayRun(seed: string, initial: CombatState, actions: RunAction[]): CombatState {
  const state = replayCanonicalRun(seed, initial, actions);
  return publicState(state);
}

function normalizeActionForState(action: RunAction, state: CombatState): GameAction {
  if (action === "attack") {
    if (state.run?.combatTurn !== "enemy") return { type: "PLAYER_ATTACK" };
    return state.run.playerCombat?.pendingHeroAttack && !state.run.playerCombat.heroImpactResolved
      ? { type: "FINISH_HERO_ATTACK" }
      : { type: "RESOLVE_ENEMY_TURN" };
  }
  if (action === "defend") {
    return state.run?.combatTurn === "enemy"
      ? { type: "RESOLVE_ENEMY_TURN" }
      : { type: "USE_CONSUMABLE", consumable: "guard_tonic" };
  }
  return normalizeAction(action);
}

const ACTION_TYPES = new Set([
  "ROLL_DICE", "BEGIN_MOVEMENT", "STEP_MOVE", "FINISH_TRAIL_CINEMATIC", "SKIP_PROLOGUE",
  "COMPLETE_BOSS_AWAKENING", "FIGHT_BOSS", "SELECT_ATTACK", "PLAYER_ATTACK", "BARD_ATTACK",
  "UNC_HOLD_MY_BEER", "JOHN_TAKEDOWN", "USE_CONSUMABLE", "FINISH_BONUS_CONSUMABLE",
  "RESOLVE_ENEMY_TURN", "FINISH_HERO_ATTACK", "FINISH_HERO_DEATH", "CHOOSE_SKILL",
  "BUY_SHOP", "REROLL_SHOP", "LEAVE_SHOP", "TEST_OF_MIGHT_ENTER", "TEST_OF_MIGHT_LEAVE",
  "REST_HEAL", "REST_TRAIN", "PLAY_MINIGAME", "CONTINUE_MINIGAME", "LEAVE_MINIGAME",
  "CONTINUE_POST_COMBAT", "DISMISS_VICTORY_REPORT", "ADVANCE_VICTORY_REPORT",
  "ADVANCE_FINAL_EPILOGUE",
  "RETURN_TO_LOBBY", "CONTINUE_RUN", "OPEN_CHEST", "EQUIP_ITEM",
  "UNEQUIP_ITEM", "BUY_TALENT",
]);

export function isRunAction(value: unknown): value is RunAction {
  if (value === "attack" || value === "use_potion" || value === "defend") return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  const type = input.type;
  if (typeof type !== "string" || !ACTION_TYPES.has(type)) return false;
  const keys = Object.keys(input);
  const optionalTarget = type === "PLAYER_ATTACK" || type === "BARD_ATTACK"
    || type === "UNC_HOLD_MY_BEER" || type === "JOHN_TAKEDOWN";
  const allowed = new Set(
    type === "BARD_ATTACK" ? ["type", "move", "targetId"] :
    type === "SELECT_ATTACK" ? ["type", "damageType"] :
    type === "USE_CONSUMABLE" ? ["type", "consumable"] :
    type === "CHOOSE_SKILL" ? ["type", "skillId"] :
    type === "BUY_SHOP" || type === "EQUIP_ITEM" ? ["type", "itemId"] :
    type === "UNEQUIP_ITEM" ? ["type", "slot"] :
    type === "BUY_TALENT" ? ["type", "stat"] :
    type === "START_RUN" ? ["type", "characterId"] :
    optionalTarget ? ["type", "targetId"] : ["type"],
  );
  if (keys.some((key) => !allowed.has(key))) return false;
  if (optionalTarget && input.targetId !== undefined && typeof input.targetId !== "string") return false;
  if (type === "START_RUN" && input.characterId !== undefined && !isCharacterChoice(input.characterId)) return false;
  if (type === "SELECT_ATTACK" && ![
    "slashing", "piercing", "bludgeoning", "fire", "cold", "lightning",
    "acid", "poison", "wind", "necrotic", "psychic",
  ].includes(String(input.damageType))) return false;
  if (type === "USE_CONSUMABLE" && !["health_potion", "guard_tonic", "fire_bomb"].includes(String(input.consumable))) return false;
  if (type === "BARD_ATTACK" && (
    typeof input.move !== "string"
    || !Object.prototype.hasOwnProperty.call(BARD_MOVES, input.move)
  )) return false;
  if (type === "CHOOSE_SKILL" && typeof input.skillId !== "string") return false;
  if (type === "BUY_SHOP" && typeof input.itemId !== "string") return false;
  if (type === "EQUIP_ITEM" && typeof input.itemId !== "string") return false;
  if (type === "UNEQUIP_ITEM" && !["weapon", "armor", "accessory"].includes(String(input.slot))) return false;
  if (type === "BUY_TALENT" && !["vitality", "quickness", "power"].includes(String(input.stat))) return false;
  for (const key of ["move", "skillId", "itemId", "slot", "stat"] as const) {
    if (input[key] !== undefined && typeof input[key] !== "string") return false;
  }
  return true;
}

export function isCharacterChoice(value: unknown): value is CharacterChoice {
  return value === "john" || value === "unc" || value === "alan-a-dale";
}

function stateRun(state: CombatState) {
  return state.run;
}

function livingEnemies(state: CombatState): Map<string, { id: string; hp: number; index: number }> {
  const result = new Map<string, { id: string; hp: number; index: number }>();
  state.run?.enemies.forEach((enemy, index) => {
    result.set(enemy.id, { id: enemy.id, hp: enemy.hp, index });
  });
  return result;
}

function deathIds(before: CombatState, after: CombatState): Array<{ id: string; index: number }> {
  if (!after.run) return [];
  const afterEnemies = livingEnemies(after);
  return [...livingEnemies(before).values()]
    .filter((enemy) => enemy.hp > 0 && (afterEnemies.get(enemy.id)?.hp ?? 0) <= 0)
    .map((enemy) => ({ id: enemy.id, index: enemy.index }));
}

export type ReplayAuditEvent = {
  sequence: number;
  action: RunAction;
  intent?: unknown;
  response?: unknown;
  beforeStateHash?: string | null;
  afterStateHash?: string | null;
  previousEventCommitment?: string | null;
  eventCommitment?: string | null;
};

export type ReplayAuditDeath = {
  sequence: number;
  monsterId: string;
  encounterIndex: number;
  monsterIndex: number;
};

/**
 * Replays an immutable checkpoint one event at a time and derives deaths from
 * state transitions. Consumers must not use persisted response death labels as
 * evidence: those labels are merely an idempotent UI response cache.
 */
export function replayAudit(
  seed: string,
  initial: CombatState,
  events: ReplayAuditEvent[],
  integrity?: {
    runId: string;
    walletAddress: string;
    seedCommitment: string;
    engineVersion: string;
    initialStateCommitment: string;
  },
): { state: CombatState; deaths: ReplayAuditDeath[] } {
  let state = structuredClone(initial) as CombatState;
  const deaths: ReplayAuditDeath[] = [];
  let previousCommitment = integrity?.initialStateCommitment;
  for (const event of [...events].sort((a, b) => a.sequence - b.sequence)) {
    const before = state;
    const next = act(before, normalizeActionForState(event.action, before), {
      seed,
      now: event.sequence * 1000,
    });
    if (integrity) {
      const beforeHash = initialStateHash(before);
      const afterHash = initialStateHash(next);
      const expectedCommitment = actionEventCommitment(
        previousCommitment!,
        integrity.runId,
        integrity.walletAddress,
        integrity.seedCommitment,
        integrity.engineVersion,
        event.sequence,
        event.intent ?? { action: event.action, expectedSequence: event.sequence - 1 },
        event.response,
        beforeHash,
        afterHash,
      );
      if (
        event.beforeStateHash !== beforeHash
        || event.afterStateHash !== afterHash
        || event.previousEventCommitment !== previousCommitment
        || event.eventCommitment !== expectedCommitment
      ) {
        throw new RunError("event_chain_invalid", 409);
      }
      previousCommitment = event.eventCommitment;
    }
    for (const death of deathIds(before, next)) {
      deaths.push({
        sequence: event.sequence,
        monsterId: death.id,
        encounterIndex: before.run?.floor ?? 0,
        monsterIndex: death.index,
      });
    }
    state = next;
  }
  return { state, deaths };
}

export function validateRunIntegrity(
  run: typeof diceboundRuns.$inferSelect,
  events: typeof diceboundActionEvents.$inferSelect[],
): void {
  assertCheckpoint(run);
  if (events.length !== run.sequence || events.some((event, index) => event.sequence !== index + 1)) {
    throw new RunError("event_chain_invalid", 409);
  }
  const replayed = replayActions(run, events);
  if (canonicalJson(replayed) !== canonicalJson(run.canonicalState)) {
    throw new RunError("replay_mismatch", 409);
  }
}

function replayActions(run: typeof diceboundRuns.$inferSelect, events: typeof diceboundActionEvents.$inferSelect[]): CombatState {
  const checkpoint = assertCheckpoint(run);
  if (events.some((event, index) => {
    const intent = event.intent as { expectedSequence?: unknown };
    return event.sequence !== index + 1 || intent.expectedSequence !== index;
  })) {
    throw new RunError("replay_event_sequence_invalid", 409);
  }
  return replayAudit(run.seed, checkpoint, events.map((event) => ({
    sequence: event.sequence,
    action: (event.intent as { action: RunAction }).action,
    intent: event.intent,
    response: event.response,
    beforeStateHash: event.beforeStateHash,
    afterStateHash: event.afterStateHash,
    previousEventCommitment: event.previousEventCommitment,
    eventCommitment: event.eventCommitment,
  })), {
    runId: run.id,
    walletAddress: run.walletAddress,
    seedCommitment: run.seedCommitment,
    engineVersion: run.engineVersion!,
    initialStateCommitment: run.initialStateCommitment!,
  }).state;
}

function rewardBearingSnapshot(state: CombatState): unknown {
  const run = state.run;
  if (!run) return null;
  return {
    floor: run.floor,
    phase: run.phase,
    characterId: run.characterId,
    hp: run.hp,
    maxHp: run.maxHp,
    xp: run.xp,
    level: run.level,
    attack: run.attack,
    defense: run.defense,
    speed: run.speed,
    gold: run.gold,
    gemsEarned: run.gemsEarned,
    settled: run.settled,
    settledGold: run.settledGold,
    settledGems: run.settledGems,
    enemies: run.enemies.map((enemy) => ({
      id: enemy.id,
      speciesKey: enemy.speciesKey,
      hp: enemy.hp,
      maxHp: enemy.maxHp,
      attack: enemy.attack,
      defense: enemy.defense,
      boss: enemy.boss,
    })),
    consumables: run.consumables,
    skills: run.skills,
    inventory: state.meta.inventory,
    equipped: state.meta.equipped,
    talents: state.meta.talents,
  };
}

export async function startRun(walletAddress: string, choice: CharacterChoice, clientRequestId: string): Promise<PublicRun> {
  return db.transaction(async (tx) => {
    await tx.execute(lockWallet(walletAddress));
    const [existing] = await tx.select().from(diceboundRunStarts).where(and(
      eq(diceboundRunStarts.walletAddress, walletAddress),
      eq(diceboundRunStarts.clientRequestId, clientRequestId),
    )).limit(1);
    if (existing) {
      if (existing.character !== choice) throw new RunError("start_idempotency_conflict", 409);
      return existing.response as PublicRun;
    }
    const [active] = await tx.select().from(diceboundRuns).where(and(
      eq(diceboundRuns.walletAddress, walletAddress),
      eq(diceboundRuns.status, "active"),
    )).limit(1);
    if (active) throw new RunError("run_already_active", 409, publicRun(active));
    const seed = seedFactory?.() ?? randomBytes(32).toString("hex");
    const now = new Date();
    const state = createInitialState(choice, seed);
    const runId = crypto.randomUUID();
    const committedSeed = seedCommitment(seed);
    const [run] = await tx.insert(diceboundRuns).values({
      id: runId,
      walletAddress,
      seed,
      seedCommitment: committedSeed,
      engineVersion: ENGINE_VERSION,
      initialState: state,
      initialStateHash: initialStateHash(state),
      initialStateCommitment: initialStateCommitment(runId, walletAddress, committedSeed, state),
      canonicalState: state,
      status: "active",
      sequence: 0,
      createdAt: now,
      updatedAt: now,
    }).returning();
    if (!run) throw new Error("run_insert_failed");
    const response = publicRun(run);
    await tx.insert(diceboundRunStarts).values({
      id: crypto.randomUUID(),
      walletAddress,
      clientRequestId,
      character: choice,
      runId: run.id,
      response,
      createdAt: now,
    });
    return response;
  });
}

export async function submitAction(
  walletAddress: string,
  runId: string,
  clientRequestId: string,
  expectedSequence: number,
  action: RunAction,
): Promise<PublicRun & { deaths?: string[] }> {
  return db.transaction(async (tx) => {
    await tx.execute(lockRun(runId));
    const [run] = await tx.select().from(diceboundRuns).where(and(
      eq(diceboundRuns.id, runId),
      eq(diceboundRuns.walletAddress, walletAddress),
    )).limit(1);
    if (!run) throw new RunError("run_not_found", 404);
    const integrityEvents = await tx.select().from(diceboundActionEvents)
      .where(eq(diceboundActionEvents.runId, run.id))
      .orderBy(asc(diceboundActionEvents.sequence));
    validateRunIntegrity(run, integrityEvents);
    const [existing] = await tx.select().from(diceboundActionEvents).where(and(
      eq(diceboundActionEvents.runId, runId),
      eq(diceboundActionEvents.clientRequestId, clientRequestId),
    )).limit(1);
    if (existing) {
      const intent = existing.intent as { action?: unknown; expectedSequence?: unknown };
      if (canonicalJson(intent.action) !== canonicalJson(action) || intent.expectedSequence !== expectedSequence) {
        throw new RunError("idempotency_conflict", 409);
      }
      return existing.response as PublicRun & { deaths?: string[] };
    }
    if (expectedSequence !== run.sequence) throw new RunError("sequence_conflict", 409, publicRun(run));
    const terminalPresentation = run.status !== "active"
      && typeof action === "object"
      && PRESENTATION_ACTIONS.has(action.type);
    if (run.status !== "active") {
      // The web reducer can emit RETURN_TO_LOBBY after a terminal cinematic.
      // Never let that presentation action erase the terminal DB run: it
      // remains the durable review and settlement subject.
      if (!terminalPresentation) throw new RunError("run_terminal", 409, publicRun(run));
    }
    if (!isRunAction(action)) throw new RunError("invalid_run_action", 400);
    assertCheckpoint(run);
    const priorEvents = integrityEvents;
    const current = run.canonicalState as CombatState;
    const normalized = normalizeActionForState(action, current);
    const next = act(current, normalized, { seed: run.seed, now: (run.sequence + 1) * 1000 });
    if (!terminalPresentation && gameplayJson(next) === gameplayJson(current)) {
      throw new RunError("action_not_legal", 409, publicRun(run));
    }
    const transitionDeaths = deathIds(current, next);
    if (terminalPresentation && transitionDeaths.length) {
      throw new RunError("terminal_presentation_mutation", 409, publicRun(run));
    }
    if (terminalPresentation && next.run && canonicalJson(rewardBearingSnapshot(current))
      !== canonicalJson(rewardBearingSnapshot(next))) {
      throw new RunError("terminal_presentation_mutation", 409, publicRun(run));
    }
    const deaths = transitionDeaths;
    for (const death of deaths) {
      const monster = current.run?.enemies[death.index];
      if (!monster) continue;
      const rollValue = deriveDeathRoll(run.seed, run.id, death.id, current.run?.floor ?? 0, death.index);
      const commitment = createHash("sha256")
        .update(`${DEATH_ROLL_ALGORITHM_VERSION}:${run.id}:${death.id}:${rollValue}:${ROLL_UPPER_BOUND}:${SUCCESS_THRESHOLD}:${run.seed}`)
        .digest("hex");
      await tx.insert(diceboundDeathRolls).values({
        id: crypto.randomUUID(),
        runId: run.id,
        monsterId: death.id,
        encounterIndex: current.run?.floor ?? 0,
        monsterIndex: death.index,
        algorithmVersion: DEATH_ROLL_ALGORITHM_VERSION,
        rollValue,
        rollUpperBound: ROLL_UPPER_BOUND,
        successThreshold: SUCCESS_THRESHOLD,
        commitment,
        status: "pending_review",
      });
    }
    const reachedFinalEpilogue = !next.run
      && current.run?.phase === "victory"
      && current.run.floor >= LEVELS.length;
    const status: "active" | "won" | "dead" = terminalPresentation
      ? run.status as "won" | "dead"
      : next.run?.phase === "defeat"
      ? "dead"
      : reachedFinalEpilogue
        ? "won"
        : "active";
    const now = new Date();
    const previousEventCommitment = priorEvents.at(-1)?.eventCommitment ?? run.initialStateCommitment!;
    const response = {
      runId: run.id,
      sequence: run.sequence + 1,
      status,
      state: publicState(next),
      seedCommitment: run.seedCommitment,
      ...(status === "active" ? {} : { seed: run.seed }),
      createdAt: run.createdAt.toISOString(),
      updatedAt: now.toISOString(),
      ...(deaths.length ? { deaths: deaths.map((death) => death.id) } : {}),
    };
    const beforeStateHash = initialStateHash(current);
    const afterStateHash = initialStateHash(next);
    const eventIntent = { action, expectedSequence };
    const eventCommitment = actionEventCommitment(
      previousEventCommitment,
      run.id,
      run.walletAddress,
      run.seedCommitment,
      run.engineVersion!,
      run.sequence + 1,
      eventIntent,
      response,
      beforeStateHash,
      afterStateHash,
    );
    await tx.update(diceboundRuns).set({
      canonicalState: next,
      sequence: run.sequence + 1,
      status,
      updatedAt: now,
      ...(status === "active" ? {} : { completedAt: now }),
    }).where(eq(diceboundRuns.id, run.id));
    await tx.insert(diceboundActionEvents).values({
      id: crypto.randomUUID(),
      runId: run.id,
      sequence: run.sequence + 1,
      clientRequestId,
      intent: { action, expectedSequence },
      response,
      beforeStateHash,
      afterStateHash,
      previousEventCommitment,
      eventCommitment,
      createdAt: now,
    });
    return response;
  });
}

export async function getCurrentRun(walletAddress: string): Promise<PublicRun | null> {
  const [active] = await db.select().from(diceboundRuns).where(and(
    eq(diceboundRuns.walletAddress, walletAddress),
    eq(diceboundRuns.status, "active"),
  )).limit(1);
  if (active) {
    const events = await db.select().from(diceboundActionEvents)
      .where(eq(diceboundActionEvents.runId, active.id))
      .orderBy(asc(diceboundActionEvents.sequence));
    validateRunIntegrity(active, events);
    return publicRun(active);
  }
  const [terminal] = await db.select().from(diceboundRuns)
    .where(and(eq(diceboundRuns.walletAddress, walletAddress), sql`${diceboundRuns.status} <> 'active'`))
    .orderBy(sql`${diceboundRuns.updatedAt} DESC`).limit(1);
  if (!terminal) return null;
  const events = await db.select().from(diceboundActionEvents)
    .where(eq(diceboundActionEvents.runId, terminal.id))
    .orderBy(asc(diceboundActionEvents.sequence));
  validateRunIntegrity(terminal, events);
  return publicRun(terminal);
}

export async function getRun(walletAddress: string, runId: string): Promise<PublicRun | null> {
  const [run] = await db.select().from(diceboundRuns).where(and(
    eq(diceboundRuns.walletAddress, walletAddress),
    eq(diceboundRuns.id, runId),
  )).limit(1);
  if (!run) return null;
  const events = await db.select().from(diceboundActionEvents)
    .where(eq(diceboundActionEvents.runId, run.id))
    .orderBy(asc(diceboundActionEvents.sequence));
  validateRunIntegrity(run, events);
  return publicRun(run);
}

export async function getReplay(walletAddress: string, runId: string) {
  const [run] = await db.select().from(diceboundRuns).where(and(
    eq(diceboundRuns.walletAddress, walletAddress),
    eq(diceboundRuns.id, runId),
  )).limit(1);
  if (!run) return null;
  const events = await db.select().from(diceboundActionEvents)
    .where(eq(diceboundActionEvents.runId, runId)).orderBy(asc(diceboundActionEvents.sequence));
  validateRunIntegrity(run, events);
  const output = publicRun(run);
  return {
    ...output,
    events: events.map((event) => ({
      sequence: event.sequence,
      clientRequestId: event.clientRequestId,
      action: (event.intent as { action: RunAction }).action,
      intent: event.intent,
      response: event.response,
    })),
  };
}

export { canonicalJson };