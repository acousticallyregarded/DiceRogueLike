import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { eq, sql } from "drizzle-orm";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import {
  db,
  pool,
  redeemableGemAccounts,
  redeemableGemLedger,
  tokenPayoutAlertStates,
  tokenPayoutMonitorState,
  tokenPurchases,
  tokenRewardClaims,
  tokenRewards,
} from "@workspace/db";
import { tokenAmountForPrice, tokenAmountForUsdCents } from "./token-purchase-math";
import { auditTokenRewardProvenance } from "./token-reward-provenance";
import { claimTokenRewards } from "./token-rewards";
import {
  GEM_COST,
  MAX_REDEEMABLE_GEM_GRANT,
  authenticateRedeemableGemGrant,
  coordinateTokenPayoutAlerts,
  purchaseToken,
  quoteAgeIsAllowed,
  redeemableGemGrantSigningPayload,
  recoverPendingPurchases,
  setTokenPurchaseTestDependencies,
  tokenAddress,
  validateRedeemableGemGrant,
  type Quote,
} from "./token-purchases";

const WALLET = "0x1000000000000000000000000000000000000001";
const OTHER_WALLET = "0x2000000000000000000000000000000000000002";
const TEST_KEY = `0x${"11".repeat(32)}` as Hex;
const account = privateKeyToAccount(TEST_KEY);

class FakeChain {
  balance = 10n ** 30n;
  chainNonce = 40;
  receipt: "success" | "reverted" | "missing" = "success";
  failBroadcast = false;
  broadcasts: Hex[] = [];

  readContract = async () => this.balance;
  getTransactionCount = async () => this.chainNonce;
  estimateGas = async () => 50_000n;
  getGasPrice = async () => 1n;
  sendRawTransaction = async ({ serializedTransaction }: { serializedTransaction: Hex }) => {
    this.broadcasts.push(serializedTransaction);
    if (this.failBroadcast) throw new Error("ambiguous RPC failure");
    return `0x${"ab".repeat(32)}` as Hex;
  };
  getTransactionReceipt = async (_args?: { hash?: Hex }) => {
    if (this.receipt === "missing") throw new Error("receipt unavailable");
    return { status: this.receipt };
  };
}

let chain: FakeChain;

function quote(symbol: "GLD" | "SLV"): Quote {
  return {
    symbol,
    tokenAddress: tokenAddress(symbol),
    price: "10",
    amountBaseUnits: "1000000000000000000",
    source: "test fixture",
    timestamp: new Date("2026-09-14T20:00:00.000Z"),
    quoteDelayed: "previous-close",
    delayed: true,
  };
}

async function credit(walletAddress: string, balance = 1_000) {
  await db.insert(redeemableGemAccounts).values({ walletAddress, balance })
    .onConflictDoUpdate({
      target: redeemableGemAccounts.walletAddress,
      set: { balance, updatedAt: new Date() },
    });
}

async function gemBalance(walletAddress: string) {
  return (await db.select({ balance: redeemableGemAccounts.balance })
    .from(redeemableGemAccounts)
    .where(eq(redeemableGemAccounts.walletAddress, walletAddress)))[0]?.balance ?? 0;
}

before(async () => {
  await db.execute(sql`select 1`);
});

beforeEach(async () => {
  process.env.TOKEN_PURCHASES_ENABLED = "true";
  await db.delete(redeemableGemLedger);
  await db.delete(tokenPurchases);
  await db.delete(tokenRewards);
  await db.delete(tokenRewardClaims);
  await db.delete(redeemableGemAccounts);
  await db.delete(tokenPayoutAlertStates);
  await db.delete(tokenPayoutMonitorState);
  chain = new FakeChain();
  setTokenPurchaseTestDependencies({
    chainClient: chain,
    quoteFetcher: async (symbol) => quote(symbol),
    escrowAccountFactory: () => account,
  });
});

afterEach(() => setTokenPurchaseTestDependencies(null));
after(async () => pool.end());

test("token quote conversion uses integer-safe base-unit math", () => {
  assert.equal(tokenAmountForPrice("1"), "10000000000000000000");
  assert.equal(tokenAmountForPrice("2000"), "5000000000000000");
  assert.equal(tokenAmountForPrice("12.50"), "800000000000000000");
  assert.equal(tokenAmountForUsdCents("10", 15), "15000000000000000");
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

test("payout alert suppression is shared, durable, and resolves once", async () => {
  const alert = {
    key: "inventory_low:GLD",
    severity: "warning" as const,
    condition: "inventory_low",
    symbol: "GLD" as const,
    action: "Refill inventory.",
    details: { availablePayouts: 2 },
  };
  const firstAt = new Date("2026-09-15T18:00:00.000Z");

  const concurrent = await Promise.all([
    coordinateTokenPayoutAlerts([alert], firstAt),
    coordinateTokenPayoutAlerts([alert], firstAt),
  ]);
  assert.equal(concurrent.flatMap((result) => result.emit).length, 1);

  const afterRestartEquivalent = await coordinateTokenPayoutAlerts(
    [alert],
    new Date(firstAt.getTime() + 60_000),
  );
  assert.equal(afterRestartEquivalent.emit.length, 0);

  const resolutions = await Promise.all([
    coordinateTokenPayoutAlerts([], new Date(firstAt.getTime() + 120_000)),
    coordinateTokenPayoutAlerts([], new Date(firstAt.getTime() + 120_000)),
  ]);
  assert.deepEqual(resolutions.flatMap((result) => result.resolved), [alert]);
});

test("older healthy snapshots cannot resolve newer payout alerts", async () => {
  const alert = {
    key: "native-gas-low",
    severity: "critical" as const,
    condition: "native_gas_low",
    action: "Refill native gas.",
    details: { nativeGasBaseUnits: "0" },
  };
  const olderAt = new Date("2026-09-15T18:00:00.000Z");
  const newerAt = new Date("2026-09-15T18:01:00.000Z");

  assert.equal((await coordinateTokenPayoutAlerts([alert], newerAt)).emit.length, 1);
  assert.deepEqual((await coordinateTokenPayoutAlerts([], olderAt)).resolved, []);

  const nextCycle = await coordinateTokenPayoutAlerts(
    [alert],
    new Date(newerAt.getTime() + 60_000),
  );
  assert.equal(nextCycle.emit.length, 0);
  assert.equal(
    (await db.select().from(tokenPayoutAlertStates)
      .where(eq(tokenPayoutAlertStates.alertKey, alert.key)))[0]?.active,
    true,
  );
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
  assert.throws(() => validateRedeemableGemGrant({ ...validGrant, amount: 1.5 }), /grant amount/i);
  assert.throws(() => validateRedeemableGemGrant({ ...validGrant, reason: "" }), /grant reason/i);
  assert.throws(() => validateRedeemableGemGrant({ ...validGrant, operationKey: "" }), /operation key/i);
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

test("concurrent requests with the same key debit and sign exactly once", async () => {
  await credit(WALLET);
  chain.receipt = "missing";

  const [first, second] = await Promise.all([
    purchaseToken(WALLET, "GLD", "same-key"),
    purchaseToken(WALLET, "GLD", "same-key"),
  ]);

  const purchases = await db.select().from(tokenPurchases);
  assert.equal(first.id, second.id);
  assert.equal(purchases.length, 1);
  assert.equal(await gemBalance(WALLET), 900);
  assert.deepEqual(purchases.map((row) => row.nonce), [40n]);
  assert.equal(new Set(chain.broadcasts).size, 1);
});

test("concurrent different keys debit once each and allocate distinct nonces", async () => {
  await credit(WALLET, GEM_COST * 2);

  const results = await Promise.allSettled([
    purchaseToken(WALLET, "GLD", "different-one"),
    purchaseToken(WALLET, "GLD", "different-two"),
  ]);
  await recoverPendingPurchases();

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 2);
  assert.equal(await gemBalance(WALLET), 0);
  const purchases = await db.select().from(tokenPurchases);
  assert.equal(purchases.length, 2);
  assert.deepEqual(purchases.map((row) => row.nonce).sort(), [40n, 41n]);
});

test("concurrent reservations cannot exceed chain inventory", async () => {
  await Promise.all([credit(WALLET), credit(OTHER_WALLET)]);
  chain.balance = 1_000_000_000_000_000_000n;
  chain.receipt = "missing";

  const results = await Promise.allSettled([
    purchaseToken(WALLET, "GLD", "inventory-one"),
    purchaseToken(OTHER_WALLET, "GLD", "inventory-two"),
  ]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal((await db.select().from(tokenPurchases)).length, 1);
  assert.equal((await gemBalance(WALLET)) + (await gemBalance(OTHER_WALLET)), 1_900);
});

test("restart recovery resumes pending, signed, and submitted intents", async () => {
  const base = {
    walletAddress: WALLET,
    symbol: "GLD",
    tokenAddress: tokenAddress("GLD"),
    gemCost: GEM_COST,
    quotePrice: "10",
    quoteSource: "test fixture",
    quoteTimestamp: new Date("2026-09-14T20:00:00.000Z"),
    quoteDelayed: "previous-close",
    tokenAmountBaseUnits: "1000000000000000000",
    updatedAt: new Date(),
  };
  await db.insert(tokenPurchases).values([
    {
      ...base,
      id: "submitted-restart",
      idempotencyKey: "submitted-restart",
      status: "submitted",
      rawSignedTransaction: "0x02",
      transactionHash: `0x${"38".repeat(32)}`,
      nonce: 40n,
      createdAt: new Date("2026-09-15T17:00:00.000Z"),
    },
    {
      ...base,
      id: "signed-restart",
      idempotencyKey: "signed-restart",
      status: "signed",
      rawSignedTransaction: "0x01",
      transactionHash: `0x${"39".repeat(32)}`,
      nonce: 41n,
      createdAt: new Date("2026-09-15T17:01:00.000Z"),
    },
    {
      ...base,
      id: "pending-restart",
      idempotencyKey: "pending-restart",
      status: "pending",
      createdAt: new Date("2026-09-15T17:02:00.000Z"),
    },
  ]);

  await recoverPendingPurchases();

  const recovered = await db.select().from(tokenPurchases);
  assert.equal(recovered.filter((row) => row.status === "confirmed").length, 3);
  assert.deepEqual(recovered.map((row) => row.nonce).sort(), [40n, 41n, 42n]);
});

test("definitive reverts refund exactly once across repeated recovery", async () => {
  await credit(WALLET);
  chain.receipt = "missing";
  await purchaseToken(WALLET, "GLD", "revert-once");
  assert.equal(await gemBalance(WALLET), 900);

  chain.receipt = "reverted";
  await Promise.all([recoverPendingPurchases(), recoverPendingPurchases()]);
  await recoverPendingPurchases();

  assert.equal(await gemBalance(WALLET), 1_000);
  const refunds = await db.select().from(redeemableGemLedger)
    .where(eq(redeemableGemLedger.reason, "token-purchase-definitive-revert"));
  assert.equal(refunds.length, 1);
  assert.equal((await db.select().from(tokenPurchases))[0]?.status, "failed");
});

test("ambiguous RPC failures retain one debit and one signed transfer without refund", async () => {
  await credit(WALLET);
  chain.failBroadcast = true;
  chain.receipt = "missing";

  const first = await purchaseToken(WALLET, "GLD", "ambiguous");
  await recoverPendingPurchases();
  const second = await purchaseToken(WALLET, "GLD", "ambiguous");

  assert.equal(first.id, second.id);
  assert.equal(await gemBalance(WALLET), 900);
  assert.equal((await db.select().from(tokenPurchases)).length, 1);
  assert.equal(new Set(chain.broadcasts).size, 1);
  const refunds = await db.select().from(redeemableGemLedger)
    .where(eq(redeemableGemLedger.reason, "token-purchase-definitive-revert"));
  assert.equal(refunds.length, 0);
});

test("reward payout failure is symbol-scoped and never mints gems", async () => {
  const claimId = "reward-claim-partial";
  const now = new Date();
  await db.insert(tokenRewardClaims).values({
    id: claimId,
    walletAddress: WALLET,
    status: "pending",
  });
  await db.insert(tokenRewards).values([
    {
      id: "reward-gld",
      walletAddress: WALLET,
      eligibilityId: "eligibility",
      monsterId: "monster-gld",
      symbol: "GLD",
      tokenAddress: tokenAddress("GLD"),
      tokenAmountBaseUnits: "15",
      usdCents: 15,
      status: "claiming",
      claimId,
    },
    {
      id: "reward-slv",
      walletAddress: WALLET,
      eligibilityId: "eligibility",
      monsterId: "monster-slv",
      symbol: "SLV",
      tokenAddress: tokenAddress("SLV"),
      tokenAmountBaseUnits: "30",
      usdCents: 15,
      status: "claiming",
      claimId,
    },
  ]);
  const payoutBase = {
    walletAddress: WALLET,
    gemCost: 0,
    quotePrice: "0",
    quoteSource: "test",
    quoteTimestamp: now,
    quoteDelayed: "previous-close",
    status: "submitted",
    rawSignedTransaction: `0x${"11".repeat(32)}`,
    payoutKind: "reward",
    rewardClaimId: claimId,
    updatedAt: now,
  } as const;
  const gldHash = `0x${"22".repeat(32)}` as Hex;
  const slvHash = `0x${"33".repeat(32)}` as Hex;
  await db.insert(tokenPurchases).values([
    { ...payoutBase, id: "payout-gld", idempotencyKey: "reward:gld", symbol: "GLD", tokenAddress: tokenAddress("GLD"), tokenAmountBaseUnits: "15", transactionHash: gldHash },
    { ...payoutBase, id: "payout-slv", idempotencyKey: "reward:slv", symbol: "SLV", tokenAddress: tokenAddress("SLV"), tokenAmountBaseUnits: "30", transactionHash: slvHash },
  ]);

  let slvReceiptCalls = 0;
  chain.getTransactionReceipt = async ({ hash }: { hash?: Hex } = {}) => {
    if (hash === gldHash) return { status: "reverted" };
    slvReceiptCalls += 1;
    if (slvReceiptCalls === 1) throw new Error("receipt unavailable");
    return { status: "success" };
  };
  await recoverPendingPurchases();
  const afterFailure = await db.select().from(tokenRewards).orderBy(tokenRewards.id);
  assert.equal(afterFailure.find(row => row.symbol === "GLD")?.status, "unclaimed");
  assert.equal(afterFailure.find(row => row.symbol === "SLV")?.status, "claimed");
  assert.equal((await db.select().from(tokenRewardClaims))[0]?.status, "partial");
  assert.equal(await gemBalance(WALLET), 0);

  await recoverPendingPurchases();
  const afterSuccess = await db.select().from(tokenRewards).orderBy(tokenRewards.id);
  assert.equal(afterSuccess.find(row => row.symbol === "SLV")?.status, "claimed");
  assert.equal((await db.select().from(tokenRewardClaims))[0]?.status, "partial");
  assert.equal(await gemBalance(WALLET), 0);
});

test("provenance audit quarantines unverifiable rewards and claims cannot create payouts", async () => {
  await db.insert(tokenRewards).values([
    {
      id: "trusted-reward",
      walletAddress: WALLET,
      eligibilityId: "trusted-eligibility",
      monsterId: "trusted-monster",
      symbol: "GLD",
      tokenAddress: tokenAddress("GLD"),
      tokenAmountBaseUnits: "15",
      createdAt: new Date("2026-08-15T12:00:00.000Z"),
    },
    {
      id: "unknown-reward",
      walletAddress: OTHER_WALLET,
      eligibilityId: "unknown-eligibility",
      monsterId: "unknown-monster",
      symbol: "SLV",
      tokenAddress: tokenAddress("SLV"),
      tokenAmountBaseUnits: "30",
      status: "claiming",
      claimId: "historical-claim",
      createdAt: new Date("2026-08-16T12:00:00.000Z"),
    },
  ]);
  await db.insert(tokenRewardClaims).values({
    id: "historical-claim",
    walletAddress: OTHER_WALLET,
    status: "pending",
  });
  await db.insert(tokenPurchases).values({
    id: "historical-payout",
    walletAddress: OTHER_WALLET,
    idempotencyKey: "reward-claim:historical-claim:SLV",
    symbol: "SLV",
    tokenAddress: tokenAddress("SLV"),
    gemCost: 0,
    quotePrice: "0",
    quoteSource: "historical reward",
    quoteTimestamp: new Date("2026-08-16T12:00:00.000Z"),
    quoteDelayed: "previous-close",
    tokenAmountBaseUnits: "30",
    status: "pending",
    payoutKind: "reward",
    rewardClaimId: "historical-claim",
  });
  const manifest = {
    auditId: "test-audit",
    trustedPeriods: [{
      source: "reviewed server export",
      period: "authoritative-pilot",
      startsAt: "2026-08-01T00:00:00.000Z",
      endsAt: "2026-09-01T00:00:00.000Z",
      eligibilityIds: ["trusted-eligibility"],
    }],
  };

  const preview = await auditTokenRewardProvenance(manifest);
  assert.deepEqual(preview, {
    auditId: "test-audit",
    trusted: 1,
    quarantined: 1,
    alreadyClassified: 0,
    blockedPendingPayouts: 0,
    dryRun: true,
  });
  assert.equal((await db.select().from(tokenRewards))[0]?.provenanceStatus, "unverified");

  const applied = await auditTokenRewardProvenance(manifest, { apply: true });
  assert.equal(applied.blockedPendingPayouts, 1);
  const rows = await db.select().from(tokenRewards).orderBy(tokenRewards.id);
  assert.equal(rows.find((row) => row.id === "trusted-reward")?.provenanceStatus, "trusted");
  assert.equal(rows.find((row) => row.id === "trusted-reward")?.provenanceSource, "reviewed server export");
  assert.equal(rows.find((row) => row.id === "unknown-reward")?.provenanceStatus, "quarantined");
  assert.equal(rows.find((row) => row.id === "unknown-reward")?.provenanceAuditId, "test-audit");
  assert.ok(rows.find((row) => row.id === "unknown-reward")?.quarantineReason);

  await recoverPendingPurchases();
  const [blockedPayout] = await db.select().from(tokenPurchases);
  assert.equal(blockedPayout?.status, "failed");
  assert.equal(blockedPayout?.errorCode, "reward_provenance_quarantined");
  assert.equal(blockedPayout?.rawSignedTransaction, null);
  assert.equal(chain.broadcasts.length, 0);
  assert.equal((await db.select().from(tokenRewardClaims))[0]?.status, "quarantined");

  const claim = await claimTokenRewards(OTHER_WALLET);
  assert.equal(claim.status, "empty");
  assert.equal((await db.select().from(tokenPurchases)).length, 1);
  assert.equal((await db.select().from(tokenRewardClaims)).length, 1);

  const repeat = await auditTokenRewardProvenance(manifest);
  assert.deepEqual(repeat, {
    auditId: "test-audit",
    trusted: 0,
    quarantined: 0,
    alreadyClassified: 2,
    blockedPendingPayouts: 0,
    dryRun: true,
  });
});