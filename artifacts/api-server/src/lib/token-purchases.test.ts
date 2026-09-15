import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import { tokenAmountForPrice } from "./token-purchase-math";
import {
  MAX_REDEEMABLE_GEM_GRANT,
  authenticateRedeemableGemGrant,
  quoteAgeIsAllowed,
  redeemableGemGrantSigningPayload,
  validateRedeemableGemGrant,
} from "./token-purchases";

test("token quote conversion uses integer-safe base-unit math", () => {
  assert.equal(tokenAmountForPrice("1"), "10000000000000000000");
  assert.equal(tokenAmountForPrice("2000"), "5000000000000000");
  assert.equal(tokenAmountForPrice("12.50"), "800000000000000000");
});

test("non-positive and malformed quotes fail closed", () => {
  assert.throws(() => tokenAmountForPrice("0"), /reference price was invalid/i);
  assert.throws(() => tokenAmountForPrice("-1"), /reference price was invalid/i);
  assert.throws(() => tokenAmountForPrice("not-a-price"), /reference price was invalid/i);
});

test("previous-close quotes cover long weekends but not a full trading week", () => {
  const now = new Date("2026-09-15T18:00:00.000Z");
  assert.equal(quoteAgeIsAllowed(new Date("2026-09-14T20:00:00.000Z"), now), true);
  assert.equal(quoteAgeIsAllowed(new Date("2026-09-11T20:00:00.000Z"), now), true);
  assert.equal(quoteAgeIsAllowed(new Date("2026-09-10T20:00:00.000Z"), now), false);
});

const validGrant = {
  walletAddress: "0x1111111111111111111111111111111111111111",
  amount: 100,
  reason: "Tournament award",
  operationKey: "tournament-2026-09-15:first-place",
  authorization: Buffer.alloc(64, 1).toString("base64"),
};

test("operator grants require bounded integer amounts and audit fields", () => {
  assert.doesNotThrow(() => validateRedeemableGemGrant(validGrant));
  assert.throws(
    () => validateRedeemableGemGrant({ ...validGrant, amount: MAX_REDEEMABLE_GEM_GRANT + 1 }),
    /grant amount/i,
  );
  assert.throws(
    () => validateRedeemableGemGrant({ ...validGrant, amount: 1.5 }),
    /grant amount/i,
  );
  assert.throws(
    () => validateRedeemableGemGrant({ ...validGrant, reason: "" }),
    /grant reason/i,
  );
  assert.throws(
    () => validateRedeemableGemGrant({ ...validGrant, operationKey: "" }),
    /operation key/i,
  );
});

test("operator identity is derived from a signature over the exact grant", () => {
  const previous = process.env.REDEEMABLE_GEM_OPERATOR_PUBLIC_KEYS;
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  process.env.REDEEMABLE_GEM_OPERATOR_PUBLIC_KEYS = JSON.stringify({
    "ops-primary": publicKey.export({ type: "spki", format: "pem" }),
  });
  try {
    const authorization = sign(
      null,
      Buffer.from(redeemableGemGrantSigningPayload(validGrant)),
      privateKey,
    ).toString("base64");
    const signedGrant = { ...validGrant, authorization };
    assert.equal(authenticateRedeemableGemGrant(signedGrant), "ops-primary");
    assert.throws(
      () => authenticateRedeemableGemGrant({ ...signedGrant, amount: signedGrant.amount + 1 }),
      /authorization is invalid/i,
    );
  } finally {
    if (previous === undefined) delete process.env.REDEEMABLE_GEM_OPERATOR_PUBLIC_KEYS;
    else process.env.REDEEMABLE_GEM_OPERATOR_PUBLIC_KEYS = previous;
  }
});