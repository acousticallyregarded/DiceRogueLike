import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { db, tokenPurchases, tokenRewardClaims, tokenRewards } from "@workspace/db";

export interface TrustedRewardPeriod {
  source: string;
  period: string;
  startsAt: string;
  endsAt: string;
  eligibilityIds: string[];
}

export interface RewardProvenanceManifest {
  auditId: string;
  trustedPeriods: TrustedRewardPeriod[];
}

export interface RewardProvenanceAuditResult {
  auditId: string;
  trusted: number;
  quarantined: number;
  alreadyClassified: number;
  blockedPendingPayouts: number;
  dryRun: boolean;
}

function requiredText(value: unknown, max: number): value is string {
  return typeof value === "string" && value === value.trim() && value.length > 0 && value.length <= max;
}

export function validateRewardProvenanceManifest(value: unknown): RewardProvenanceManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Audit manifest must be an object.");
  const manifest = value as Partial<RewardProvenanceManifest>;
  if (!requiredText(manifest.auditId, 120) || !Array.isArray(manifest.trustedPeriods)) {
    throw new Error("Audit manifest requires auditId and trustedPeriods.");
  }
  const seenPeriods = new Set<string>();
  const seenEligibility = new Set<string>();
  for (const period of manifest.trustedPeriods) {
    if (!period || !requiredText(period.source, 120) || !requiredText(period.period, 120)) {
      throw new Error("Every trusted period requires source and period labels.");
    }
    if (seenPeriods.has(period.period)) throw new Error(`Duplicate period label: ${period.period}`);
    seenPeriods.add(period.period);
    const startsAt = new Date(period.startsAt);
    const endsAt = new Date(period.endsAt);
    if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || startsAt >= endsAt) {
      throw new Error(`Invalid UTC period: ${period.period}`);
    }
    if (!Array.isArray(period.eligibilityIds) || period.eligibilityIds.length === 0) {
      throw new Error(`Trusted period ${period.period} requires exact eligibility IDs.`);
    }
    for (const id of period.eligibilityIds) {
      if (!requiredText(id, 200)) throw new Error(`Invalid eligibility ID in ${period.period}.`);
      if (seenEligibility.has(id)) throw new Error(`Eligibility ID appears more than once: ${id}`);
      seenEligibility.add(id);
    }
  }
  return manifest as RewardProvenanceManifest;
}

export async function auditTokenRewardProvenance(
  input: unknown,
  options: { apply?: boolean } = {},
): Promise<RewardProvenanceAuditResult> {
  const manifest = validateRewardProvenanceManifest(input);
  const apply = options.apply === true;
  return db.transaction(async (tx) => {
    const unverified = await tx.select().from(tokenRewards)
      .where(eq(tokenRewards.provenanceStatus, "unverified"));
    let trusted = 0;
    const trustedIds = new Set<string>();

    for (const period of manifest.trustedPeriods) {
      const startsAt = new Date(period.startsAt);
      const endsAt = new Date(period.endsAt);
      const rows = await tx.select({ id: tokenRewards.id }).from(tokenRewards).where(and(
        eq(tokenRewards.provenanceStatus, "unverified"),
        inArray(tokenRewards.eligibilityId, period.eligibilityIds),
        gte(tokenRewards.createdAt, startsAt),
        lt(tokenRewards.createdAt, endsAt),
      ));
      for (const row of rows) trustedIds.add(row.id);
      trusted += rows.length;
      if (apply && rows.length) {
        await tx.update(tokenRewards).set({
          provenanceStatus: "trusted",
          provenanceSource: period.source,
          provenancePeriod: period.period,
          provenanceAuditId: manifest.auditId,
          provenanceAuditedAt: new Date(),
          quarantineReason: null,
        }).where(inArray(tokenRewards.id, rows.map((row) => row.id)));
      }
    }

    const quarantinedIds = unverified.filter((row) => !trustedIds.has(row.id)).map((row) => row.id);
    if (apply && quarantinedIds.length) {
      await tx.update(tokenRewards).set({
        provenanceStatus: "quarantined",
        provenanceSource: "unverifiable",
        provenancePeriod: "historical-audit",
        provenanceAuditId: manifest.auditId,
        provenanceAuditedAt: new Date(),
        quarantineReason: "Not present in the trusted eligibility manifest for its creation period.",
      }).where(inArray(tokenRewards.id, quarantinedIds));
    }

    let blockedPendingPayouts = 0;
    if (apply) {
      const pendingRewardPayouts = await tx.select().from(tokenPurchases).where(and(
        eq(tokenPurchases.payoutKind, "reward"),
        eq(tokenPurchases.status, "pending"),
      ));
      for (const payout of pendingRewardPayouts) {
        if (!payout.rewardClaimId) continue;
        const sources = await tx.select({ provenanceStatus: tokenRewards.provenanceStatus })
          .from(tokenRewards).where(and(
            eq(tokenRewards.claimId, payout.rewardClaimId),
            eq(tokenRewards.symbol, payout.symbol),
          ));
        if (sources.length > 0 && sources.every((row) => row.provenanceStatus === "trusted")) continue;
        const stopped = await tx.update(tokenPurchases).set({
          status: "failed",
          errorCode: "reward_provenance_quarantined",
          errorMessage: "Reward payout blocked because its source rewards are not trusted.",
          updatedAt: new Date(),
        }).where(and(
          eq(tokenPurchases.id, payout.id),
          eq(tokenPurchases.status, "pending"),
        )).returning({ id: tokenPurchases.id });
        if (!stopped.length) continue;
        blockedPendingPayouts += 1;
        await tx.update(tokenRewardClaims).set({
          status: "quarantined",
          updatedAt: new Date(),
        }).where(eq(tokenRewardClaims.id, payout.rewardClaimId));
      }
    }

    return {
      auditId: manifest.auditId,
      trusted,
      quarantined: quarantinedIds.length,
      alreadyClassified: (await tx.select({ id: tokenRewards.id }).from(tokenRewards)).length - unverified.length,
      blockedPendingPayouts,
      dryRun: !apply,
    };
  });
}