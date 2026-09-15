import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateTokenPayoutHealth,
  type TokenPayoutHealthSnapshot,
} from "./token-payout-health";

test("payout health warns before inventory and gas are exhausted", () => {
  const snapshot: TokenPayoutHealthSnapshot = {
    checkedAt: new Date("2026-09-15T18:00:00.000Z"),
    configured: true,
    nativeGasBaseUnits: 5n,
    minimumNativeGasBaseUnits: 10n,
    tokens: [{
      symbol: "GLD",
      quoteHealthy: true,
      quoteTimestamp: new Date("2026-09-14T20:00:00.000Z"),
      availableBaseUnits: 40n,
      payoutAmountBaseUnits: 10n,
      unresolvedCount: 0,
      oldestUnresolvedAt: null,
      stuckNonceCount: 0,
      oldestStuckNonceAt: null,
    }],
  };

  const alerts = evaluateTokenPayoutHealth(snapshot, 5);
  assert.deepEqual(alerts.map((alert) => alert.condition), ["native_gas_low", "inventory_low"]);
  assert.equal(alerts[1]?.severity, "warning");
});

test("payout health identifies stale quotes, reservations, and signer nonces", () => {
  const snapshot: TokenPayoutHealthSnapshot = {
    checkedAt: new Date("2026-09-15T18:00:00.000Z"),
    configured: true,
    nativeGasBaseUnits: 10n,
    minimumNativeGasBaseUnits: 10n,
    tokens: [{
      symbol: "SLV",
      quoteHealthy: false,
      quoteTimestamp: null,
      availableBaseUnits: null,
      payoutAmountBaseUnits: null,
      unresolvedCount: 2,
      oldestUnresolvedAt: new Date("2026-09-15T17:00:00.000Z"),
      stuckNonceCount: 1,
      oldestStuckNonceAt: new Date("2026-09-15T17:00:00.000Z"),
    }],
  };

  const alerts = evaluateTokenPayoutHealth(snapshot);
  assert.deepEqual(alerts.map((alert) => alert.condition), [
    "quote_unhealthy",
    "inventory_unavailable",
    "unresolved_reservations_old",
    "signer_nonce_stuck",
  ]);
  assert.equal(JSON.stringify(alerts).includes("rawSignedTransaction"), false);
});