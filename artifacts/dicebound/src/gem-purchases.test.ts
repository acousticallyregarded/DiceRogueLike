import assert from "node:assert/strict";
import { createInitialState } from "./engine";
import { applyGameAction } from "./gem-purchases";

const guest = createInitialState();
guest.meta.gems = 1000;
const original = JSON.stringify(guest);
assert.equal(applyGameAction(guest, { type: "OPEN_CHEST" }, false), guest);
for (const stat of ["vitality", "quickness", "power"] as const) {
  assert.equal(applyGameAction(guest, { type: "BUY_TALENT", stat }, false), guest);
}
assert.equal(JSON.stringify(guest), original, "blocked purchases cannot change guest balances or items");
const walletChest = applyGameAction(guest, { type: "OPEN_CHEST" }, true);
assert.equal(walletChest.meta.gems, 900, "wallet chest spends exactly 100 gems");
const walletTalent = applyGameAction(guest, { type: "BUY_TALENT", stat: "vitality" }, true);
assert.equal(walletTalent.meta.gems, 950);
assert.equal(walletTalent.meta.talents.vitality, guest.meta.talents.vitality + 1);
const poorWallet = createInitialState();
assert.equal(applyGameAction(poorWallet, { type: "OPEN_CHEST" }, true).meta.gems, 0);
assert.equal(JSON.stringify(guest), original, "wallet purchases cannot mutate the source guest save");
console.log("Gem purchase authorization assertions passed.");