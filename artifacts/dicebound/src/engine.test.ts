import assert from "node:assert/strict";
import {
  act,
  calculateDamage,
  createInitialState,
  NORMAL_ROSTER,
  ELITE_ROSTER,
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
  run.playerCombat = { attackTimer: 100, roundCounter: 0 };
  return state;
}

function runAssertions() {
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

  let selected = act(createInitialState(), { type: "START_RUN" });
  selected = act(selected, { type: "SELECT_ATTACK", damageType: "fire" });
  assert.equal(selected.run!.selectedDamageType, "fire");

  // Poison is a real reducer effect but skeleton immunity blocks its damage.
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
  poisoned.run!.selectedDamageType = "fire";
  poisoned = act(poisoned, { type: "TICK_COMBAT", dtMs: 0 });
  const hpAfterHit = poisoned.run!.enemies[0].hp;
  poisoned = act(poisoned, { type: "TICK_COMBAT", dtMs: 1000 });
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
  leeched = act(leeched, { type: "TICK_COMBAT", dtMs: 0 });
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
  countered = act(countered, { type: "TICK_COMBAT", dtMs: 0 });
  assert.equal(countered.run!.enemies[0].hp, 100);

  // Every displayed species has at least one usable attack stance.
  for (const speciesKey of [...NORMAL_ROSTER, ...ELITE_ROSTER]) {
    assert.ok(
      ATTACK_STYLES.some(style => calculateDamage(10, 0, speciesKey, style.damageType).amount > 0),
      `${speciesKey} must have a viable stance`,
    );
  }
  assert.equal(speciesKeyForName("Dire Wolf"), "winter_wolf");
  assert.equal(BESTIARY.mummy.vulnerabilities[0].damageType, "fire");
}

runAssertions();
console.log("Dicebound engine assertions passed.");