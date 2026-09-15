import assert from "node:assert/strict";
import { test } from "node:test";
import { issueEncounterEligibility, TokenRewardError } from "./token-rewards";

test("browser encounter eligibility is disabled by default", async () => {
  const previous = process.env.TOKEN_REWARDS_ENABLED;
  delete process.env.TOKEN_REWARDS_ENABLED;
  try {
    await assert.rejects(
      issueEncounterEligibility(
        "0x1000000000000000000000000000000000000001",
        "session",
        "encounter",
        ["monster"],
      ),
      (error: unknown) => error instanceof TokenRewardError
        && error.code === "token_rewards_disabled"
        && error.status === 503,
    );
  } finally {
    if (previous === undefined) delete process.env.TOKEN_REWARDS_ENABLED;
    else process.env.TOKEN_REWARDS_ENABLED = previous;
  }
});