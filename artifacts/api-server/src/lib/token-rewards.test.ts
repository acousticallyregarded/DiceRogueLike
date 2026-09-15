import assert from "node:assert/strict";
import { test } from "node:test";
import {
  appendCombatTranscript,
  issueEncounterEligibility,
  TokenRewardError,
} from "./token-rewards";
import { tokenRewardsEnabled } from "./token-purchases";

test("public encounter issuance is permanently fail-closed", async () => {
  const previous = process.env.TOKEN_REWARDS_ENABLED;
  const previousVerified = process.env.TOKEN_REWARDS_COMBAT_VERIFIED;
  process.env.TOKEN_REWARDS_ENABLED = "true";
  process.env.TOKEN_REWARDS_COMBAT_VERIFIED = "true";
  try {
    await assert.rejects(
      issueEncounterEligibility(),
      (error: unknown) => error instanceof TokenRewardError
        && error.code === "token_rewards_disabled"
        && error.status === 503,
    );
    assert.equal(tokenRewardsEnabled(), false);
  } finally {
    if (previous === undefined) delete process.env.TOKEN_REWARDS_ENABLED;
    else process.env.TOKEN_REWARDS_ENABLED = previous;
    if (previousVerified === undefined) delete process.env.TOKEN_REWARDS_COMBAT_VERIFIED;
    else process.env.TOKEN_REWARDS_COMBAT_VERIFIED = previousVerified;
  }
});

test("transcript settlement is unavailable even with arbitrary retry payloads", async () => {
  await assert.rejects(
    appendCombatTranscript("wallet", "session", "ticket", [
      { type: "PLAYER_ATTACK", targetIndex: 0 },
      { type: "PLAYER_ATTACK", targetIndex: 0 },
    ]),
    (error: unknown) => error instanceof TokenRewardError
      && error.code === "token_rewards_disabled"
      && error.status === 503,
  );
});