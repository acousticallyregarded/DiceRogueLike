import { and, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  tokenPurchases,
  tokenRewardClaims,
  tokenRewards,
} from "@workspace/db";
import {
  processTokenPayout,
  tokenRewardsEnabled,
} from "./token-purchases";

export const REWARD_USD_CENTS = 15;
const TOKEN_SYMBOLS = ["GLD", "SLV"] as const;

export class TokenRewardError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 409) {
    super(message);
  }
}

/**
 * Browser combat is not a trusted authority. There is deliberately no public
 * ticket/transcript implementation until the server owns the complete run
 * progression (including character, inventory, and encounter state).
 */
export async function issueEncounterEligibility(): Promise<never> {
  throw new TokenRewardError(
    "token_rewards_disabled",
    "Monster token rewards require a server-authoritative run.",
    503,
  );
}

export async function appendCombatTranscript(..._args: unknown[]): Promise<never> {
  throw new TokenRewardError(
    "token_rewards_disabled",
    "Monster token rewards require a server-authoritative run.",
    503,
  );
}

function walletLockSql(walletAddress: string) {
  return sql`SELECT pg_advisory_xact_lock(hashtextextended(${walletAddress}, 0))`;
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
      eq(tokenRewards.provenanceStatus, "trusted"),
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
        eq(tokenRewards.provenanceStatus, "trusted"),
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
  const payouts = await db.select().from(tokenPurchases).where(eq(tokenPurchases.rewardClaimId, claim.id));
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
    eq(tokenRewards.provenanceStatus, "trusted"),
  ));
  const totals = { GLD: 0n, SLV: 0n };
  const counts = { GLD: 0, SLV: 0 };
  for (const row of rows) if (row.symbol === "GLD" || row.symbol === "SLV") totals[row.symbol] += BigInt(row.tokenAmountBaseUnits);
  for (const row of rows) if (row.symbol === "GLD" || row.symbol === "SLV") counts[row.symbol] += 1;
  return {
    enabled: tokenRewardsEnabled(),
    GLD: totals.GLD.toString(),
    SLV: totals.SLV.toString(),
    GLDValueCents: counts.GLD * REWARD_USD_CENTS,
    SLVValueCents: counts.SLV * REWARD_USD_CENTS,
    count: rows.length,
  };
}