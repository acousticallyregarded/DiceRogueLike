import assert from "node:assert/strict";
import {
  ATTACK_STYLES,
  BESTIARY,
  getDamageModifier,
  speciesKeyForName,
} from "./bestiary.js";

assert.equal(speciesKeyForName("Slime"), "ochre_jelly");
assert.equal(speciesKeyForName("Dire Wolf"), "winter_wolf");
assert.equal(speciesKeyForName("The Overlord"), undefined);

assert.equal(getDamageModifier("skeleton", "bludgeoning").kind, "vulnerable");
assert.equal(getDamageModifier("skeleton", "poison").kind, "immune");
assert.equal(getDamageModifier("ochre_jelly", "acid").kind, "resisted");
assert.equal(getDamageModifier("ochre_jelly", "slashing").kind, "immune");
assert.equal(getDamageModifier("mummy", "fire").kind, "vulnerable");
assert.equal(getDamageModifier("mummy", "slashing").kind, "resisted");
assert.equal(getDamageModifier("mummy", "slashing", true).kind, "normal");
assert.equal(getDamageModifier("winter_wolf", "fire").kind, "normal");

for (const entry of Object.values(BESTIARY)) {
  assert.ok(
    ATTACK_STYLES.some(style => getDamageModifier(entry.key, style.damageType).multiplier > 0),
    `${entry.name} needs a viable attack style`,
  );
}

console.log("Dicebound bestiary assertions passed.");