import { randomInt } from "node:crypto";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { db, encounterEligibilities, tokenPurchases, tokenRewardClaims, tokenRewards } from "@workspace/db";
import {
  getEscrowBalance,
  getTokenQuote,
  isRewardPayoutOperational,
  processTokenPayout,
  tokenRewardsEnabled,
  tokenLockSql,
  unresolvedReservation,
  type Quote,
} from "./token-purchases";
import { tokenAmountForUsdCents } from "./token-purchase-math";

export const REWARD_USD_CENTS = 15;
export const ENCOUNTER_TICKET_TTL_MS = 30 * 60 * 1000;
export const MIN_MONSTER_COMPLETION_INTERVAL_MS = 750;
const TOKEN_SYMBOLS = ["GLD", "SLV"] as const;

export class TokenRewardError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 409) {
    super(message);
  }
}

function validText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max && /^[A-Za-z0-9:_-]+$/.test(value);
}

function walletLockSql(walletAddress: string) {
  return sql`SELECT pg_advisory_xact_lock(hashtext(${"dicebound-encounter:" + walletAddress.toLowerCase()}))`;
}

function outputRewardClaim(row: typeof tokenRewardClaims.$inferSelect, payouts: Array<typeof tokenPurchases.$inferSelect>) {
  const sums = new Map<string, bigint>();
  for (const payout of payouts) sums.set(payout.symbol, (sums.get(payout.symbol) ?? 0n) + BigInt(payout.tokenAmountBaseUnits));
  return {
    id: row.id,
    status: row.status,
    GLD: (sums.get("GLD") ?? 0n).toString(),
    SLV: (sums.get("SLV") ?? 0n).toString(),
    pending: row.status === "pending" || row.status === "submitted" || row.status === "signed",
  };
}

export async function issueEncounterEligibility(
  walletAddress: string,
  sessionId: string,
  encounterId: string,
  monsterIds: string[],
) {
  if (!tokenRewardsEnabled()) {
    throw new TokenRewardError("token_rewards_disabled", "Monster token rewards are disabled until server-authoritative combat is enabled.", 503);
  }
  if (!validText(encounterId, 120) || monsterIds.length < 1 || monsterIds.length > 12 ||
      monsterIds.some(id => !validText(id, 120)) || new Set(monsterIds).size !== monsterIds.length) {
    throw new TokenRewardError("invalid_encounter_ticket", "A valid encounter ticket is required.", 400);
  }
  const now = new Date();
  return db.transaction(async (tx) => {
    await tx.execute(walletLockSql(walletAddress));
    await tx.update(encounterEligibilities).set({ status: "expired" }).where(and(
      eq(encounterEligibilities.walletAddress, walletAddress),
      eq(encounterEligibilities.status, "active"),
      // Expiration is checked again below; this update only cleans old tickets.
      sql`${encounterEligibilities.expiresAt} <= ${now}`,
    ));
    const active = await tx.select({ id: encounterEligibilities.id }).from(encounterEligibilities).where(and(
      eq(encounterEligibilities.walletAddress, walletAddress),
      eq(encounterEligibilities.status, "active"),
      gt(encounterEligibilities.expiresAt, now),
    )).limit(1);
    if (active.length) throw new TokenRewardError("encounter_ticket_active", "Finish the active encounter before starting another.", 409);
    const [ticket] = await tx.insert(encounterEligibilities).values({
      id: crypto.randomUUID(),
      walletAddress,
      sessionId,
      encounterId,
      monsterIds,
      completedMonsterIds: [],
      expiresAt: new Date(now.getTime() + ENCOUNTER_TICKET_TTL_MS),
      status: "active",
    }).returning();
    return ticket;
  });
}

async function awardReward(
  tx: any,
  walletAddress: string,
  eligibilityId: string,
  monsterId: string,
): Promise<typeof tokenRewards.$inferSelect | null> {
  // A failed roll is still a settled monster. No client input influences it.
  if (!(await isRewardPayoutOperational(tx))) return null;
  if (randomInt(0, 20) !== 0) return null;
  const start = randomInt(0, TOKEN_SYMBOLS.length);
  const candidates = [TOKEN_SYMBOLS[start], TOKEN_SYMBOLS[1 - start]];
  for (const symbol of candidates) {
    let quote: Quote;
    try {
      quote = await getTokenQuote(symbol);
      const amount = BigInt(tokenAmountForUsdCents(quote.price, REWARD_USD_CENTS));
      await tx.execute(tokenLockSql(quote.tokenAddress));
      const chainBalance = await getEscrowBalance(quote.tokenAddress);
      const reserved = await unresolvedReservation(tx, quote.tokenAddress);
      if (amount <= 0n || chainBalance - reserved < amount) continue;
      const [reward] = await tx.insert(tokenRewards).values({
        id: crypto.randomUUID(),
        walletAddress,
        eligibilityId,
        monsterId,
        symbol,
        tokenAddress: quote.tokenAddress,
        tokenAmountBaseUnits: amount.toString(),
        usdCents: REWARD_USD_CENTS,
        status: "unclaimed",
      }).returning();
      return reward ?? null;
    } catch {
      // Price and RPC failures fail closed. Inventory exhaustion may fall back
      // to the other token, but an infrastructure error never mints a claim.
      return null;
    }
  }
  return null;
}

export async function completeEncounterMonster(
  walletAddress: string,
  sessionId: string,
  eligibilityId: string,
  monsterId: string,
) {
  if (!validText(eligibilityId, 100) || !validText(monsterId, 120)) {
    throw new TokenRewardError("invalid_encounter_completion", "A valid encounter completion is required.", 400);
  }
  return db.transaction(async (tx) => {
    await tx.execute(walletLockSql(walletAddress));
    const [ticket] = await tx.select().from(encounterEligibilities).where(and(
      eq(encounterEligibilities.id, eligibilityId),
      eq(encounterEligibilities.walletAddress, walletAddress),
      eq(encounterEligibilities.sessionId, sessionId),
      eq(encounterEligibilities.status, "active"),
      gt(encounterEligibilities.expiresAt, new Date()),
    )).limit(1);
    if (!ticket || !ticket.monsterIds.includes(monsterId)) {
      throw new TokenRewardError("encounter_ticket_invalid", "Encounter eligibility is invalid or expired.", 409);
    }
    const completed = ticket.completedMonsterIds ?? [];
    if (completed.includes(monsterId)) {
      const existing = await tx.select().from(tokenRewards).where(and(
        eq(tokenRewards.eligibilityId, eligibilityId),
        eq(tokenRewards.monsterId, monsterId),
      )).limit(1);
      return { duplicate: true, reward: existing[0] ?? null };
    }
    if (ticket.lastCompletedAt && Date.now() - ticket.lastCompletedAt.getTime() < MIN_MONSTER_COMPLETION_INTERVAL_MS) {
      throw new TokenRewardError("encounter_completion_too_fast", "Encounter completion was too fast.", 429);
    }
    const nextCompleted = [...completed, monsterId];
    const [updated] = await tx.update(encounterEligibilities).set({
      completedMonsterIds: nextCompleted,
      lastCompletedAt: new Date(),
      status: nextCompleted.length === ticket.monsterIds.length ? "completed" : "active",
    }).where(and(eq(encounterEligibilities.id, eligibilityId), eq(encounterEligibilities.status, "active"))).returning();
    if (!updated) throw new TokenRewardError("encounter_ticket_replayed", "Encounter eligibility was already settled.", 409);
    const reward = await awardReward(tx, walletAddress, eligibilityId, monsterId);
    return { duplicate: false, reward };
  });
}

async function processClaimPayout(id: string | null) {
  if (!id) return null;
  const [row] = await db.select().from(tokenPurchases).where(eq(tokenPurchases.id, id)).limit(1);
  return row ? processTokenPayout(row) : null;
}

export async function claimTokenRewards(walletAddress: string) {
  let claim: typeof tokenRewardClaims.$inferSelect | undefined;
  let payoutIds: string[] = [];
  await db.transaction(async (tx) => {
    await tx.execute(walletLockSql(walletAddress));
    const [existing] = await tx.select().from(tokenRewardClaims).where(and(
      eq(tokenRewardClaims.walletAddress, walletAddress),
      inArray(tokenRewardClaims.status, ["pending", "signed", "submitted"]),
    )).orderBy(tokenRewardClaims.createdAt).limit(1);
    if (existing) {
      claim = existing;
      payoutIds = [existing.gldPayoutId, existing.slvPayoutId].filter((id): id is string => Boolean(id));
      return false;
    }
    const rewards = await tx.select().from(tokenRewards).where(and(
      eq(tokenRewards.walletAddress, walletAddress),
      eq(tokenRewards.status, "unclaimed"),
    ));
    if (!rewards.length) return false;
    const claimId = crypto.randomUUID();
    const [inserted] = await tx.insert(tokenRewardClaims).values({
      id: claimId,
      walletAddress,
      status: "pending",
    }).returning();
    claim = inserted;
    const bySymbol = new Map<string, typeof rewards>();
    for (const reward of rewards) {
      const list = bySymbol.get(reward.symbol) ?? [];
      list.push(reward);
      bySymbol.set(reward.symbol, list);
    }
    const ids: Record<string, string | null> = { GLD: null, SLV: null };
    for (const symbol of TOKEN_SYMBOLS) {
      const group = bySymbol.get(symbol);
      if (!group?.length) continue;
      const payoutId = crypto.randomUUID();
      await tx.update(tokenRewards).set({ status: "claiming", claimId }).where(and(
        eq(tokenRewards.walletAddress, walletAddress),
        eq(tokenRewards.status, "unclaimed"),
        eq(tokenRewards.symbol, symbol),
      ));
      const amount = group.reduce((sum, reward) => sum + BigInt(reward.tokenAmountBaseUnits), 0n);
      const [payout] = await tx.insert(tokenPurchases).values({
        id: payoutId,
        walletAddress,
        idempotencyKey: `reward-claim:${claimId}:${symbol}`,
        symbol,
        tokenAddress: group[0].tokenAddress,
        gemCost: 0,
        quotePrice: "0",
        quoteSource: "Dicebound monster reward",
        quoteTimestamp: new Date(),
        quoteDelayed: "previous-close",
        tokenAmountBaseUnits: amount.toString(),
        status: "pending",
        payoutKind: "reward",
        rewardClaimId: claimId,
        updatedAt: new Date(),
      }).returning();
      ids[symbol] = payout?.id ?? null;
      if (payout?.id) payoutIds.push(payout.id);
    }
    const [updated] = await tx.update(tokenRewardClaims).set({
      gldPayoutId: ids.GLD,
      slvPayoutId: ids.SLV,
      updatedAt: new Date(),
    }).where(eq(tokenRewardClaims.id, claimId)).returning();
    claim = updated ?? claim;
    return true;
  });
  if (!claim) return { id: null, status: "empty", GLD: "0", SLV: "0", pending: false };
  for (const id of payoutIds) {
    try { await processClaimPayout(id); } catch { /* durable row remains for recovery */ }
  }
  const [latest] = await db.select().from(tokenRewardClaims).where(eq(tokenRewardClaims.id, claim.id)).limit(1);
  const payouts = await db.select().from(tokenPurchases).where(and(
    eq(tokenPurchases.rewardClaimId, claim.id),
  ));
  return outputRewardClaim(latest ?? claim, payouts);
}

export async function recoverPendingRewardClaims() {
  const rows = await db.select().from(tokenRewardClaims).where(inArray(tokenRewardClaims.status, ["pending", "partial", "signed", "submitted"])).limit(25);
  for (const row of rows) {
    await processClaimPayout(row.gldPayoutId);
    await processClaimPayout(row.slvPayoutId);
  }
}

export async function getTokenRewards(walletAddress: string) {
  const rows = await db.select().from(tokenRewards).where(and(
    eq(tokenRewards.walletAddress, walletAddress),
    inArray(tokenRewards.status, ["unclaimed", "claiming"]),
  ));
  const totals = { GLD: 0n, SLV: 0n };
  const counts = { GLD: 0, SLV: 0 };
  for (const row of rows) if (row.symbol === "GLD" || row.symbol === "SLV") totals[row.symbol] += BigInt(row.tokenAmountBaseUnits);
  for (const row of rows) if (row.symbol === "GLD" || row.symbol === "SLV") counts[row.symbol] += 1;
  return {
    enabled: process.env.TOKEN_REWARDS_ENABLED === "true",
    GLD: totals.GLD.toString(),
    SLV: totals.SLV.toString(),
    GLDValueCents: counts.GLD * REWARD_USD_CENTS,
    SLVValueCents: counts.SLV * REWARD_USD_CENTS,
    count: rows.length,
  };
}