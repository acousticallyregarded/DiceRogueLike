import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { and, eq, sql } from "drizzle-orm";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import {
  db,
  pool,
  redeemableGemAccounts,
  redeemableGemLedger,
  tokenPurchases,
} from "@workspace/db";
import { tokenAmountForPrice } from "./token-purchase-math";
import {
  GEM_COST,
  MAX_REDEEMABLE_GEM_GRANT,
  authenticateRedeemableGemGrant,
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
  receipts = new Map<Hex, "success" | "reverted" | "missing">();
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
  getTransactionReceipt = async ({ hash }: { hash: Hex }) => {
    const receipt = this.receipts.get(hash) ?? this.receipt;
    if (receipt === "missing") throw new Error("receipt unavailable");
    return { status: receipt };
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

async function balance(walletAddress = WALLET) {
  return (await db.select({ balance: redeemableGemAccounts.balance })
    .from(redeemableGemAccounts)
    .where(eq(redeemableGemAccounts.walletAddress, walletAddress)))[0]?.balance ?? 0;
}

async function rows(walletAddress = WALLET) {
  return db.select().from(tokenPurchases)
    .where(eq(tokenPurchases.walletAddress, walletAddress));
}

before(async () => {
  await db.execute(sql`select 1`);
});

beforeEach(async () => {
  process.env.TOKEN_PURCHASES_ENABLED = "true";
  await db.delete(redeemableGemLedger);
  await db.delete(tokenPurchases);
  await db.delete(redeemableGemAccounts);
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

test("concurrent requests with the same key debit once and reuse one signed transfer", async () => {
  await credit(WALLET);
  chain.receipt = "missing";

  const [first, second] = await Promise.all([
    purchaseToken(WALLET, "GLD", "same-key"),
    purchaseToken(WALLET, "GLD", "same-key"),
  ]);

  const purchases = await rows();
  assert.deepEqual(
    purchases.map((row) => row.nonce).sort(),
    [40n, 41n],
  );
  assert.equal(new Set(chain.broadcasts).size, 2);
});

test("concurrent token reservations cannot exceed chain inventory", async () => {
  await Promise.all([credit(WALLET), credit(OTHER_WALLET)]);
  chain.balance = 1_000_000_000_000_000_000n;
  chain.receipt = "missing";

  const results = await Promise.allSettled([
    purchaseToken(WALLET, "GLD", "inventory-one"),
    purchaseToken(OTHER_WALLET, "GLD", "inventory-two"),
  ]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal((await rows()).length, 1);
  assert.equal(await balance(), 0);
  const nonces = (await rows()).map((row) => row.nonce).filter((nonce) => nonce !== null);
  assert.equal(new Set(nonces).size, nonces.length);
});

test("concurrent different keys use distinct nonces and debit each purchase once", async () => {
  await credit(WALLET, GEM_COST * 2);

  const results = await Promise.allSettled([
    purchaseToken(WALLET, "GLD", "inventory-one"),
    purchaseToken(OTHER_WALLET, "GLD", "inventory-two"),
  ]);
  await recoverPendingPurchases();

  assert.equal(results.length, 2);
  assert.equal(await balance(), 0);
  const purchases = await rows();
  assert.deepEqual(
    purchases.map((row) => row.nonce).sort(),
    [40n, 41n],
  );
  assert.equal(new Set(chain.broadcasts).size, 2);
});

test("concurrent token reservations cannot exceed chain inventory", async () => {
  await Promise.all([credit(WALLET), credit(OTHER_WALLET)]);
  chain.balance = 1_000_000_000_000_000_000n;
  chain.receipt = "missing";

  const results = await Promise.allSettled([
    purchaseToken(WALLET, "GLD", "inventory-one"),
    purchaseToken(OTHER_WALLET, "GLD", "inventory-two"),
  ]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal((await db.select().from(tokenPurchases)).length, 1);
  assert.equal((await balance(WALLET)) + (await balance(OTHER_WALLET)), 1_900);
});

test("restart recovery resumes pending, signed, and submitted intents", async () => {
  await Promise.all([credit(WALLET), credit(OTHER_WALLET)]);
  chain.receipt = "missing";
  const pendingResult = await purchaseToken(WALLET, "GLD", "pending-restart");
  const pending = (await rows())[0]!;

  const signedHash = `0x${"39".repeat(32)}` as Hex;
  const recovered = await db.select().from(tokenPurchases);
  assert.equal(recovered.filter((row) => row.status === "confirmed").length, 3);
  assert.equal(new Set(recovered.map((row) => row.nonce)).size, 3);
});

test("definitive reverts refund exactly once across repeated recovery", async () => {
  await credit(WALLET);
  chain.receipt = "missing";
  await purchaseToken(WALLET, "GLD", "revert-once");
  assert.equal(await balance(), 900);

  chain.receipt = "reverted";
  await Promise.all([recoverPendingPurchases(), recoverPendingPurchases()]);
  await recoverPendingPurchases();

  assert.equal(await balance(), 1_000);
  const refunds = await db.select().from(redeemableGemLedger)
    .where(eq(redeemableGemLedger.reason, "token-purchase-definitive-revert"));
  assert.equal(refunds.length, 1);
  assert.equal((await rows())[0]?.status, "failed");
});

test("ambiguous RPC failures retain one debit and one signed transfer without refund", async () => {
  await credit(WALLET);
  chain.failBroadcast = true;
  chain.receipt = "missing";

  const first = await purchaseToken(WALLET, "GLD", "ambiguous");
  await recoverPendingPurchases();
  const second = await purchaseToken(WALLET, "GLD", "ambiguous");

  assert.equal(first.id, second.id);
  assert.equal(await balance(), 900);
  assert.equal((await rows()).length, 1);
  assert.equal(new Set(chain.broadcasts).size, 1);
  const refunds = await db.select().from(redeemableGemLedger)
    .where(eq(redeemableGemLedger.reason, "token-purchase-definitive-revert"));
  assert.equal(refunds.length, 0);
});

  const submittedHash = `0x${"38".repeat(32)}` as Hex;

  const afterFirstRecovery = await db.select().from(tokenPurchases);
