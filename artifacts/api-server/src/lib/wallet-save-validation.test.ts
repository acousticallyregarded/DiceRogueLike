import assert from "node:assert/strict";
import test from "node:test";
import { validateGameStateV4 } from "./wallet-save-validation";

function bossSave() {
  return {
    meta: {
      version: 4,
      gems: 12,
      talents: { vitality: 0, quickness: 0, power: 0 },
      inventory: [],
      equipped: { weapon: null, armor: null, accessory: null },
    },
    run: {
      hp: 80,
      maxHp: 100,
      attack: 10,
      defense: 4,
      speed: 40,
      gold: 120,
      gemsEarned: 50,
      xp: 0,
      level: 1,
      queuedLevels: 0,
      bossRollsLeft: 3,
      floor: 3,
      position: 60,
      tiles: [
        { id: 0, type: "start" },
        { id: 63, type: "boss" },
      ],
      lastRolls: null,
      stepsRemaining: 0,
      phase: "combat",
      enemies: [{
        id: "silkmaw",
        name: "Lady Silkmaw, the Spider Queen",
        hp: 300,
        maxHp: 350,
        attack: 28,
        defense: 10,
        speed: 65,
        boss: true,
        artKey: "boss",
        bossMove: "summon_brood",
        bossTurnCounter: 3,
        bossSummonsUsed: 2,
        bossRageActive: false,
        bossRegenSuppressed: false,
        lastBossAttack: "fireball",
      }],
      playerCombat: null,
      combatTurn: "player",
      guardActive: false,
      consumables: { health_potion: 3, fire_bomb: 2, guard_tonic: 1 },
      selectedDamageType: "slashing",
      skills: [],
      skillOptions: null,
      shopItems: null,
      shopRerollCost: 10,
      log: [{ id: "log", msg: "Silkmaw summons broodlings." }],
      settled: true,
      settledGold: 12,
      settledGems: 50,
      isBossCombat: true,
      heroHinderedTurns: 1,
      trailIntroSeen: true,
      trailAlertSeen: true,
      trailAwakeningSeen: true,
      pendingTileTrigger: false,
      rollAnimating: false,
      heroDeathPending: false,
    },
  };
}

test("wallet validator accepts and round-trips new boss state", () => {
  const input = bossSave();
  const validation = validateGameStateV4(JSON.parse(JSON.stringify(input)));
  assert.equal(validation.ok, true);
  if (!validation.ok) return;
  const run = validation.value.run as Record<string, unknown>;
  const enemy = (run.enemies as Record<string, unknown>[])[0];
  assert.equal(enemy.bossMove, "summon_brood");
  assert.equal(enemy.bossTurnCounter, 3);
  assert.equal(enemy.bossSummonsUsed, 2);
  assert.equal(run.heroHinderedTurns, 1);
  assert.equal(run.settledGold, 12);
  assert.equal(run.settledGems, 50);
});

test("wallet validator accepts a prologue in progress", () => {
  const input: any = bossSave();
  input.run.trailCinematic = "prologue";
  input.run.prologueStep = 2;
  input.run.trailIntroSeen = false;
  const validation = validateGameStateV4(JSON.parse(JSON.stringify(input)));
  assert.equal(validation.ok, true);
  if (!validation.ok) return;
  const run = validation.value.run as Record<string, unknown>;
  assert.equal(run.trailCinematic, "prologue");
  assert.equal(run.prologueStep, 2);
});

test("wallet validator rejects unknown boss moves", () => {
  const input = bossSave();
  (input.run.enemies[0] as { bossMove: string }).bossMove = "teleport";
  const validation = validateGameStateV4(input);
  assert.equal(validation.ok, false);
});