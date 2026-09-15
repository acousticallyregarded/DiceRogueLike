import { createHash, createPublicKey, verify } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import {
  db,
  diceboundActionEvents,
  diceboundDeathReviews,
  diceboundDeathRolls,
  diceboundRuns,
  tokenRewards,
} from "@workspace/db";
import {
  deriveDeathRoll,
  DEATH_ROLL_ALGORITHM_VERSION,
  replayAudit,
  replayCanonicalRun,
  assertCheckpoint,
  seedCommitment,
} from "./dicebound-runs";
import {
  getEscrowBalance,
  getTokenQuote,
  isRewardPayoutOperational,
  tokenLockSql,
  unresolvedReservation,
  tokenRewardsEnabled,
} from "./token-purchases";
import { tokenAmountForUsdCents } from "./token-purchase-math";

const REVIEW_PROTOCOL = "dicebound-review-v1";

export class DiceboundReviewError extends Error {
  constructor(public readonly code: string, public readonly status = 409) {
    super(code);
  }
}

type ReviewInput = {
  deathRollId: string;
  reviewerId: string;
  evidence: unknown;
  authorization: string;
};

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).filter((key) => object[key] !== undefined).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalJson(object[key])}`,
  ).join(",")}}`;
}

function evidenceHash(input: unknown): string {
  return createHash("sha256").update(canonicalJson(input)).digest("hex");
}

function reviewerPayload(
  deathRollId: string,
  runId: string,
  reviewerId: string,
  decision: string,
  evidenceDigest: string,
): string {
  return `${REVIEW_PROTOCOL}:${deathRollId}:${runId}:${reviewerId}:${decision}:${evidenceDigest}`;
}

function verifyReviewer(
  reviewerId: string,
  payload: string,
  authorization: string,
): void {
  if (process.env.DICEBOUND_REVIEW_ENABLED !== "true") {
    throw new DiceboundReviewError("dicebound_review_disabled", 503);
  }
  let configured: Record<string, unknown>;
  try {
    configured = JSON.parse(process.env.DICEBOUND_REVIEW_OPERATOR_PUBLIC_KEYS ?? "{}") as Record<string, unknown>;
  } catch {
    throw new DiceboundReviewError("review_operators_unconfigured", 503);
  }
  const publicKey = configured[reviewerId];
  if (typeof publicKey !== "string" || !/^[A-Za-z0-9+/=_-]{1,4096}$/.test(authorization)) {
    throw new DiceboundReviewError("unauthorized_review_operator", 403);
  }
  try {
    if (!verify(
      null,
      Buffer.from(payload),
      createPublicKey(publicKey),
      Buffer.from(authorization, "base64"),
    )) throw new Error("invalid");
  } catch {
    throw new DiceboundReviewError("unauthorized_review_operator", 403);
  }
}

function lockReview(deathRollId: string) {
  return sql`SELECT pg_advisory_xact_lock(hashtextextended(${deathRollId}, 0))`;
}

/**
 * Operator-only trust-boundary settlement. No Express route calls this
 * function. The environment gate is disabled by default and the signed
 * evidence is retained beside the immutable roll for independent audit.
 */
export async function reviewDiceboundDeath(input: ReviewInput) {
  if (
    !/^[\x21-\x7e]{1,200}$/.test(input.deathRollId) ||
    !/^[\x21-\x7e]{1,200}$/.test(input.reviewerId) ||
    !input.evidence ||
    typeof input.evidence !== "object" ||
    Array.isArray(input.evidence) ||
    Object.keys(input.evidence as Record<string, unknown>).length === 0
  ) {
    throw new DiceboundReviewError("invalid_review", 400);
  }
  return db.transaction(async (tx) => {
    await tx.execute(lockReview(input.deathRollId));
    const [existing] = await tx.select().from(diceboundDeathReviews).where(
      eq(diceboundDeathReviews.deathRollId, input.deathRollId),
    ).limit(1);
    if (existing) {
      if (
        existing.reviewerId !== input.reviewerId ||
        existing.evidenceHash !== evidenceHash(input.evidence) ||
        existing.reviewerSignature !== input.authorization
      ) {
        throw new DiceboundReviewError("review_idempotency_conflict", 409);
      }
      return { review: existing, rewardId: existing.rewardId };
    }

    const [roll] = await tx.select().from(diceboundDeathRolls).where(
      eq(diceboundDeathRolls.id, input.deathRollId),
    ).limit(1);
    if (!roll || roll.status !== "pending_review") {
      throw new DiceboundReviewError("death_roll_not_reviewable", 409);
    }
    const [run] = await tx.select().from(diceboundRuns).where(
      eq(diceboundRuns.id, roll.runId),
    ).limit(1);
    if (!run || run.status === "active") {
      throw new DiceboundReviewError("run_not_terminal", 409);
    }
    let initial: Parameters<typeof replayCanonicalRun>[1];
    try {
      initial = assertCheckpoint(run);
    } catch {
      throw new DiceboundReviewError("legacy_unreviewable", 409);
    }
    const events = await tx.select().from(diceboundActionEvents)
      .where(eq(diceboundActionEvents.runId, run.id))
      .orderBy(asc(diceboundActionEvents.sequence));
    if (events.some((event, index) => {
      const intent = event.intent as { expectedSequence?: unknown };
      return event.sequence !== index + 1 || intent.expectedSequence !== index;
    })) {
      throw new DiceboundReviewError("replay_event_sequence_invalid", 409);
    }
    const canonical = run.canonicalState as Parameters<typeof replayCanonicalRun>[1];
    const audited = replayAudit(run.seed, initial, events.map((event) => ({
      sequence: event.sequence,
      action: (event.intent as { action: Parameters<typeof replayCanonicalRun>[2][number] }).action,
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
    });
    const replayed = audited.state;
    if (canonicalJson(replayed) !== canonicalJson(canonical)) {
      throw new DiceboundReviewError("replay_mismatch", 409);
    }
    for (const event of events) {
      const expectedDeaths = audited.deaths
        .filter((death) => death.sequence === event.sequence)
        .map((death) => death.monsterId)
        .sort();
      const responseDeaths = (event.response as { deaths?: unknown }).deaths;
      if ((expectedDeaths.length > 0 && responseDeaths === undefined)
        || (responseDeaths !== undefined && (
        !Array.isArray(responseDeaths)
        || responseDeaths.some((id) => typeof id !== "string")
        || [...responseDeaths].sort().join("\u0000") !== expectedDeaths.join("\u0000")
      ))) {
        throw new DiceboundReviewError("death_response_mismatch", 409);
      }
    }
    const proof = audited.deaths.find((death) => death.monsterId === roll.monsterId);
    if (!proof) {
      throw new DiceboundReviewError("death_not_verified", 409);
    }
    const deathEvent = events.find((event) => event.sequence === proof.sequence);
    if (!deathEvent
      || proof.encounterIndex !== roll.encounterIndex
      || proof.monsterIndex !== roll.monsterIndex) {
      throw new DiceboundReviewError("death_metadata_mismatch", 409);
    }
    const allRolls = await tx.select().from(diceboundDeathRolls)
      .where(eq(diceboundDeathRolls.runId, run.id));
    if (allRolls.length !== audited.deaths.length || allRolls.some((stored) => {
      const matching = audited.deaths.find((death) => death.monsterId === stored.monsterId);
      return !matching
        || matching.encounterIndex !== stored.encounterIndex
        || matching.monsterIndex !== stored.monsterIndex;
    })) {
      throw new DiceboundReviewError("death_roll_set_mismatch", 409);
    }

    const validSeed = seedCommitment(run.seed) === run.seedCommitment;
    const validRollSet = allRolls.every((stored) => {
      const expectedCommitment = createHash("sha256")
        .update(`dicebound-death-5pct-v2:${run.id}:${stored.monsterId}:${stored.rollValue}:${stored.rollUpperBound}:${stored.successThreshold}:${run.seed}`)
        .digest("hex");
      return expectedCommitment === stored.commitment
        && deriveDeathRoll(run.seed, run.id, stored.monsterId, stored.encounterIndex, stored.monsterIndex) === stored.rollValue
        && stored.algorithmVersion === DEATH_ROLL_ALGORITHM_VERSION
        && stored.rollUpperBound === 100
        && stored.successThreshold === 5;
    });
    if (!validSeed || !validRollSet) {
      throw new DiceboundReviewError("death_commitment_invalid", 409);
    }

    const successful = roll.rollValue < roll.successThreshold;
    const decision = successful ? "approved" : "rejected";
    const replayStateHash = createHash("sha256").update(canonicalJson(replayed)).digest("hex");
    const expectedEvidence = {
      runId: run.id,
      deathRollId: roll.id,
      monsterId: roll.monsterId,
      deathEventSequence: proof.sequence,
      seedCommitment: run.seedCommitment,
      replayStateHash,
      rollValue: roll.rollValue,
      rollUpperBound: roll.rollUpperBound,
      successThreshold: roll.successThreshold,
      decision,
    };
    if (canonicalJson(input.evidence) !== canonicalJson(expectedEvidence)) {
      throw new DiceboundReviewError("review_evidence_mismatch", 409);
    }
    const digest = evidenceHash(input.evidence);
    verifyReviewer(
      input.reviewerId,
      reviewerPayload(roll.id, run.id, input.reviewerId, decision, digest),
      input.authorization,
    );
    const reviewedAt = new Date();
    const [review] = await tx.insert(diceboundDeathReviews).values({
      id: crypto.randomUUID(),
      deathRollId: roll.id,
      runId: run.id,
      reviewerId: input.reviewerId,
      decision,
      evidence: input.evidence,
      evidenceHash: digest,
      reviewerSignature: input.authorization,
      reviewedAt,
    }).returning();
    if (!review) throw new Error("review_insert_failed");
    if (!successful) {
      await tx.update(diceboundDeathRolls).set({ status: "rejected" })
        .where(and(eq(diceboundDeathRolls.id, roll.id), eq(diceboundDeathRolls.status, "pending_review")));
      return { review, rewardId: null };
    }

    if (!tokenRewardsEnabled() || !(await isRewardPayoutOperational(tx))) {
      throw new DiceboundReviewError("reward_settlement_unavailable", 503);
    }
    let quote;
    try {
      quote = await getTokenQuote("GLD");
    } catch {
      throw new DiceboundReviewError("reward_quote_unavailable", 503);
    }
    const rewardAmount = tokenAmountForUsdCents(quote.price, 15);
    await tx.execute(tokenLockSql(quote.tokenAddress));
    let balance: bigint;
    try {
      balance = await getEscrowBalance(quote.tokenAddress);
    } catch {
      throw new DiceboundReviewError("reward_inventory_unavailable", 503);
    }
    const reserved = await unresolvedReservation(tx, quote.tokenAddress);
    if (balance - reserved < BigInt(rewardAmount)) {
      throw new DiceboundReviewError("reward_inventory_unavailable", 503);
    }
    const [reward] = await tx.insert(tokenRewards).values({
      id: crypto.randomUUID(),
      walletAddress: run.walletAddress,
      eligibilityId: run.id,
      monsterId: roll.monsterId,
      symbol: "GLD",
      tokenAddress: quote.tokenAddress,
      tokenAmountBaseUnits: rewardAmount,
      status: "unclaimed",
      provenanceStatus: "trusted",
      provenanceSource: "dicebound-independent-review",
      provenancePeriod: "dicebound-death-5pct-v2",
      provenanceAuditId: review.id,
      provenanceAuditedAt: reviewedAt,
    }).returning({ id: tokenRewards.id });
    if (!reward) throw new Error("reward_insert_failed");
    await tx.update(diceboundDeathRolls).set({ status: "approved" })
      .where(and(eq(diceboundDeathRolls.id, roll.id), eq(diceboundDeathRolls.status, "pending_review")));
    const [updatedReview] = await tx.update(diceboundDeathReviews).set({
      rewardId: reward.id,
    }).where(eq(diceboundDeathReviews.id, review.id)).returning();
    return { review: updatedReview ?? review, rewardId: reward.id };
  });
}
