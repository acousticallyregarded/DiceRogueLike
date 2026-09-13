import assert from "node:assert/strict";
import { calculateDamage, generateEnemies, getEncounterCount, NORMAL_ROSTER, ELITE_ROSTER } from "./engine";

for (const roll of [0, 0.5, 0.99]) {
  assert.equal(getEncounterCount(1, false, roll), 1);
  assert.equal(getEncounterCount(2, false, roll), 1);
  assert.equal(getEncounterCount(1, true, roll), 1);
  assert.ok(getEncounterCount(5, false, roll) <= 2);
}
assert.equal(getEncounterCount(8, false, 0.99), 3);
assert.equal(getEncounterCount(8, true, 0.99), 2);

// A fresh, ungeared hero can beat every opening species with an available
// physical style, without potions, bombs, crits, or healing during the fight.
for (const elite of [false, true]) {
  const enemy = generateEnemies(1, 1, elite, 1)[0];
  for (const species of elite ? ELITE_ROSTER : NORMAL_ROSTER) {
    const damage = Math.max(...(["slashing", "piercing", "bludgeoning"] as const)
      .map(style => calculateDamage(10, enemy.defense, species, style).amount));
    assert.ok(damage > 0);
    const attacks = Math.ceil(enemy.hp / damage);
    const healthLost = (attacks - 1) * Math.max(1, enemy.attack - 2);
    assert.ok(healthLost <= (elite ? 45 : 9), `${species}: lost ${healthLost} HP`);
    console.log(`${species}: ${attacks} attacks, ${healthLost} HP lost before recovery`);
  }
}
const early = generateEnemies(1, 1, false, 1)[0];
const underlevelled = generateEnemies(1, 10, false, 1)[0];
assert.equal(underlevelled.maxHp, early.maxHp);
assert.equal(underlevelled.attack, early.attack);
assert.ok(generateEnemies(1, 3, false, 7)[0].maxHp > early.maxHp);
console.log("Encounter balance assertions passed.");