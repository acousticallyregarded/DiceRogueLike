import {
  createPublicClient,
  encodeFunctionData,
  http,
  keccak256,
  parseAbi,
  parseEther,
  type Address,
  type Hex,
} from "viem";
import { createPublicKey, verify } from "node:crypto";
import { privateKeyToAccount } from "viem/accounts";
import { and, desc, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";
import {
  db,
  redeemableGemAccounts,
  redeemableGemLedger,
  tokenPurchases,
} from "@workspace/db";
import { logger } from "./logger";
import { InvalidTokenPriceError, tokenAmountForPrice } from "./token-purchase-math";
import {
  DEFAULT_MIN_INVENTORY_PAYOUTS,
  DEFAULT_MIN_NATIVE_GAS,
  evaluateTokenPayoutHealth,
  TOKEN_ALERT_REPEAT_MS,
  TOKEN_MONITOR_INTERVAL_MS,
  type TokenPayoutAlert,
  type TokenPayoutHealthSnapshot,
  type TokenSymbol,
} from "./token-payout-health";
export { tokenAmountForPrice } from "./token-purchase-math";
export {
  DEFAULT_MIN_INVENTORY_PAYOUTS,
  DEFAULT_MIN_NATIVE_GAS,
  evaluateTokenPayoutHealth,
  STALE_RESERVATION_THRESHOLD_MS,
  TOKEN_ALERT_REPEAT_MS,
  TOKEN_MONITOR_INTERVAL_MS,
} from "./token-payout-health";
export type {
  TokenPayoutAlert,
  TokenPayoutHealthSnapshot,
  TokenSymbol,
} from "./token-payout-health";

export const ROBINHOOD_MAINNET_CHAIN_ID = 4663;
export const ROBINHOOD_MAINNET_RPC = "https://rpc.mainnet.chain.robinhood.com";
export const ESCROW_ADDRESS = "0x6efDa0f76c9B5D23a0dD777A773FAa876fc10C95" as Address;
export const TOKEN_DECIMALS = 18;
export const GEM_COST = 100;
export const MAX_REDEEMABLE_GEM_GRANT = 10_000;
/** A signer nonce stuck this long fails closed instead of creating a nonce gap. */
export const STUCK_NONCE_THRESHOLD_MS = 30 * 60 * 1000;

const UNRESOLVED_STATUSES = ["pending", "signed", "submitted"] as const;

export type PurchaseStatus = "pending" | "signed" | "submitted" | "confirmed" | "failed";

const TOKENS: Record<TokenSymbol, Address> = {
  GLD: "0xc9a981fee1f9dec688bb123ccdecc63d0debfc4e",
  SLV: "0x411efb0e7f985935daec3d4c3ebaea0d0ad7d89f",
};
const MASSIVE_TICKERS: Record<TokenSymbol, string> = {
  GLD: process.env.MASSIVE_GLD_TICKER ?? "GLD",
  SLV: process.env.MASSIVE_SLV_TICKER ?? "SLV",
};
const TRANSFER_ABI = parseAbi(["function transfer(address to, uint256 amount) returns (bool)"]);
const BALANCE_ABI = parseAbi(["function balanceOf(address owner) view returns (uint256)"]);
const publicClient = createPublicClient({
  chain: { id: ROBINHOOD_MAINNET_CHAIN_ID, name: "Robinhood Mainnet", nativeCurrency: { name: "Robinhood", symbol: "RBH", decimals: 18 }, rpcUrls: { default: { http: [ROBINHOOD_MAINNET_RPC] } } },
  transport: http(ROBINHOOD_MAINNET_RPC),
});

type EscrowAccount = ReturnType<typeof privateKeyToAccount>;
export interface Quote {
  symbol: TokenSymbol;
  tokenAddress: Address;
  price: string;
  amountBaseUnits: string;
  source: string;
  timestamp: Date;
  quoteDelayed: "previous-close";
  delayed: true;
}

export interface InventoryItem extends Quote {
  escrowBalanceBaseUnits: string;
  escrowBalance: string;
  reservedBaseUnits: string;
  availableBalanceBaseUnits: string;
  available: boolean;
}

export class TokenPurchaseError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 503,
  ) {
    super(message);
  }
}

export interface RedeemableGemGrantInput {
  walletAddress: string;
  amount: number;
  reason: string;
  operationKey: string;
  authorization: string;
}

function requiredPrintableText(value: string, maxLength: number): boolean {
  return value === value.trim() &&
    value.length > 0 &&
    value.length <= maxLength &&
    /^[\x20-\x7e]+$/.test(value);
}

export function validateRedeemableGemGrant(input: RedeemableGemGrantInput): void {
  if (!/^0x[a-fA-F0-9]{40}$/.test(input.walletAddress)) {
    throw new TokenPurchaseError("invalid_grant_wallet", "A valid wallet address is required.", 400);
  }
  if (!Number.isSafeInteger(input.amount) || input.amount < 1 || input.amount > MAX_REDEEMABLE_GEM_GRANT) {
    throw new TokenPurchaseError(
      "invalid_grant_amount",
      `Grant amount must be an integer from 1 to ${MAX_REDEEMABLE_GEM_GRANT}.`,
      400,
    );
  }
  if (!requiredPrintableText(input.reason, 500)) {
    throw new TokenPurchaseError("invalid_grant_reason", "A grant reason is required.", 400);
  }
  if (!requiredPrintableText(input.operationKey, 200)) {
    throw new TokenPurchaseError("invalid_grant_operation_key", "A valid operation key is required.", 400);
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(input.authorization) || input.authorization.length > 200) {
    throw new TokenPurchaseError("invalid_grant_authorization", "A valid grant authorization is required.", 400);
  }
}

export function redeemableGemGrantSigningPayload(
  input: Pick<RedeemableGemGrantInput, "walletAddress" | "amount" | "reason" | "operationKey">,
): string {
  return JSON.stringify([
    "dicebound-redeemable-gem-grant-v1",
    input.walletAddress.toLowerCase(),
    input.amount,
    input.reason,
    input.operationKey,
  ]);
}

export function authenticateRedeemableGemGrant(input: RedeemableGemGrantInput): string {
  let configured: unknown;
  try {
    configured = JSON.parse(process.env.REDEEMABLE_GEM_OPERATOR_PUBLIC_KEYS ?? "{}");
  } catch {
    throw new TokenPurchaseError("grant_operators_unconfigured", "Grant operators are not configured.", 503);
  }
  if (!configured || Array.isArray(configured) || typeof configured !== "object") {
    throw new TokenPurchaseError("grant_operators_unconfigured", "Grant operators are not configured.", 503);
  }
  const signature = Buffer.from(input.authorization, "base64");
  const payload = Buffer.from(redeemableGemGrantSigningPayload(input), "utf8");
  for (const [operatorId, publicKey] of Object.entries(configured)) {
    if (!requiredPrintableText(operatorId, 100) || typeof publicKey !== "string") continue;
    try {
      if (verify(null, payload, createPublicKey(publicKey), signature)) return operatorId;
    } catch {
      continue;
    }
  }
  throw new TokenPurchaseError("unauthorized_grant_operator", "Grant authorization is invalid.", 403);
}

export async function grantRedeemableGems(input: RedeemableGemGrantInput) {
  validateRedeemableGemGrant(input);
  const operatorId = authenticateRedeemableGemGrant(input);
  const walletAddress = input.walletAddress.toLowerCase();

  const result = await db.transaction(async (tx) => {
    await ensureRedeemableAccount(tx, walletAddress);
    const [entry] = await tx.insert(redeemableGemLedger).values({
      id: crypto.randomUUID(),
      walletAddress,
      operationKey: input.operationKey,
      delta: input.amount,
      reason: input.reason,
      operatorId,
    }).onConflictDoNothing().returning();

    if (!entry) {
      const [existing] = await tx.select().from(redeemableGemLedger)
        .where(eq(redeemableGemLedger.operationKey, input.operationKey))
        .limit(1);
      if (
        !existing ||
        existing.walletAddress !== walletAddress ||
        existing.delta !== input.amount ||
        existing.reason !== input.reason ||
        existing.operatorId !== operatorId ||
        existing.purchaseId !== null
      ) {
        throw new TokenPurchaseError(
          "grant_operation_conflict",
          "Operation key belongs to a different ledger entry.",
          409,
        );
      }
      const [account] = await tx.select({ balance: redeemableGemAccounts.balance })
        .from(redeemableGemAccounts)
        .where(eq(redeemableGemAccounts.walletAddress, walletAddress))
        .limit(1);
      return { ledgerEntryId: existing.id, balance: account?.balance ?? 0, created: false };
    }

    const [account] = await tx.update(redeemableGemAccounts).set({
      balance: sql`${redeemableGemAccounts.balance} + ${input.amount}`,
      updatedAt: new Date(),
    }).where(eq(redeemableGemAccounts.walletAddress, walletAddress))
      .returning({ balance: redeemableGemAccounts.balance });
    if (!account) throw new Error("Redeemable gem account update failed.");
    return { ledgerEntryId: entry.id, balance: account.balance, created: true };
  });

  logger.info({
    operatorId,
    walletAddress,
    amount: input.amount,
    operationKey: input.operationKey,
    ledgerEntryId: result.ledgerEntryId,
    created: result.created,
  }, "Redeemable gem grant processed");
  return result;
}

function assertPurchasesEnabled(): void {
  if (process.env.TOKEN_PURCHASES_ENABLED !== "true") {
    throw new TokenPurchaseError(
      "purchases_disabled",
      "Token purchases are not enabled.",
      503,
    );
  }
}

function configuredEscrowAccount() {
  // The private key is intentionally read only at signer construction. It is
  // never returned, logged, persisted, or included in an error.
  let account: ReturnType<typeof privateKeyToAccount>;
  try {
    account = privateKeyToAccount(process.env.TOKEN_ESCROW_PRIVATE_KEY as Hex);
  } catch {
    throw new TokenPurchaseError("escrow_unconfigured", "Token payout is not configured.");
  }
  if (account.address.toLowerCase() !== ESCROW_ADDRESS.toLowerCase()) {
    throw new TokenPurchaseError("escrow_mismatch", "Token payout is not configured.");
  }
  return account;
}
function escrowAccount() {
  return dependencies.escrowAccountFactory();
}

export function isPayoutConfigured(): boolean {
  try {
    assertPurchasesEnabled();
    escrowAccount();
    return true;
  } catch {
    return false;
  }
}

function decimalFromBaseUnits(value: bigint): string {
  const scale = 10n ** 18n;
  const whole = value / scale;
  const fraction = (value % scale).toString().padStart(18, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function symbol(value: unknown): TokenSymbol | null {
  return value === "GLD" || value === "SLV" ? value : null;
}

export function quoteAgeIsAllowed(timestamp: Date, now = new Date()): boolean {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const quotedDay = Date.UTC(timestamp.getUTCFullYear(), timestamp.getUTCMonth(), timestamp.getUTCDate());
  // The /prev aggregate must belong to a completed prior UTC calendar day,
  // never today's in-progress data. Four days covers a normal weekend plus an
  // observed US market holiday without accepting a full trading week-old quote.
  return today - quotedDay >= 86_400_000 && today - quotedDay <= 4 * 86_400_000;
}

async function fetchQuoteFromProvider(token: TokenSymbol): Promise<Quote> {
  const key = process.env.MASSIVE_API_KEY;
  if (!key) throw new TokenPurchaseError("quote_unavailable", "Approved token pricing is unavailable.");
  const ticker = MASSIVE_TICKERS[token];
  const source = `https://api.massive.com/v2/aggs/ticker/${encodeURIComponent(ticker)}/prev?adjusted=true`;
  let response: Response;
  try {
    response = await fetch(`${source}&apiKey=${encodeURIComponent(key)}`, { headers: { Accept: "application/json" } });
  } catch {
    throw new TokenPurchaseError("quote_unavailable", "Approved token pricing is unavailable.");
  }
  if (!response.ok) throw new TokenPurchaseError("quote_unavailable", "Approved token pricing is unavailable.");
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new TokenPurchaseError("quote_unavailable", "Approved token pricing is unavailable.");
  }
  const results = (body as { results?: Array<{ c?: number; t?: number }> })?.results;
  const result = results?.[0];
  if (!results || results.length !== 1 || !result || typeof result.c !== "number" || !Number.isFinite(result.c) || result.c <= 0 || typeof result.t !== "number" || result.t > Date.now()) {
    throw new TokenPurchaseError("quote_unavailable", "Approved token pricing is unavailable.");
  }
  const timestamp = new Date(result.t);
  if (!Number.isFinite(timestamp.getTime()) || !quoteAgeIsAllowed(timestamp)) {
    throw new TokenPurchaseError("quote_stale", "Approved token pricing is stale.");
  }
  const price = String(result.c);
  let amountBaseUnits: string;
  try {
    amountBaseUnits = tokenAmountForPrice(price);
  } catch (error) {
    if (error instanceof InvalidTokenPriceError) {
      throw new TokenPurchaseError("invalid_quote", "The reference price was invalid.");
    }
    throw error;
  }
  return {
    symbol: token,
    tokenAddress: TOKENS[token],
    price,
    amountBaseUnits,
    source: "Massive previous-day aggregate",
    timestamp,
    quoteDelayed: "previous-close",
    delayed: true,
  };
}
async function fetchQuote(token: TokenSymbol): Promise<Quote> {
  return dependencies.quoteFetcher(token);
}

export async function getTokenQuote(token: TokenSymbol): Promise<Quote> {
  return fetchQuote(token);
}

export async function getInventory(): Promise<InventoryItem[]> {
  const items: InventoryItem[] = [];
  const configured = isPayoutConfigured();
  for (const token of ["GLD", "SLV"] as const) {
    try {
      const quote = await fetchQuote(token);
      const { balanceBaseUnits, reservedBaseUnits } = await db.transaction(async (tx) => {
        await tx.execute(tokenLockSql(quote.tokenAddress));
        const chainBalance = await getEscrowBalance(quote.tokenAddress);
        return {
          balanceBaseUnits: chainBalance,
          reservedBaseUnits: await unresolvedReservation(tx, quote.tokenAddress),
        };
      });
      const availableBalanceBaseUnits = balanceBaseUnits - reservedBaseUnits;
      items.push({
        ...quote,
        escrowBalanceBaseUnits: balanceBaseUnits.toString(),
        escrowBalance: decimalFromBaseUnits(balanceBaseUnits),
        reservedBaseUnits: reservedBaseUnits.toString(),
        availableBalanceBaseUnits: availableBalanceBaseUnits.toString(),
        available: configured && availableBalanceBaseUnits >= BigInt(quote.amountBaseUnits),
      });
    } catch {
      // Inventory is fail-closed: a missing quote, RPC failure, or bad config
      // cannot turn into a purchasable item.
      items.push({
        symbol: token,
        tokenAddress: TOKENS[token],
        price: "",
        amountBaseUnits: "0",
        source: "Massive previous-day aggregate",
        timestamp: new Date(0),
        quoteDelayed: "previous-close",
        delayed: true,
        escrowBalanceBaseUnits: "0",
        escrowBalance: "0",
        reservedBaseUnits: "0",
        availableBalanceBaseUnits: "0",
        available: false,
      });
    }
  }
  return items;
}

async function getEscrowBalance(tokenAddress: Address): Promise<bigint> {
  const balance = await dependencies.chainClient.readContract({
    address: tokenAddress,
    abi: BALANCE_ABI,
    functionName: "balanceOf",
    args: [ESCROW_ADDRESS],
  });
  return BigInt(balance as bigint);
}

function tokenLockSql(tokenAddress: Address) {
  return sql`SELECT pg_advisory_xact_lock(hashtext(${"dicebound-token-reservation:" + tokenAddress.toLowerCase()}))`;
}

function signerLockSql() {
  return sql`SELECT pg_advisory_xact_lock(hashtext(${"dicebound-token-signer-nonce"}))`;
}

async function unresolvedReservation(
  tx: any,
  tokenAddress: Address,
): Promise<bigint> {
  const rows = await tx
    .select({ amount: tokenPurchases.tokenAmountBaseUnits })
    .from(tokenPurchases)
    .where(and(
      eq(tokenPurchases.tokenAddress, tokenAddress),
      inArray(tokenPurchases.status, [...UNRESOLVED_STATUSES]),
    ));
  return rows.reduce((total: bigint, row: { amount: string }) => total + BigInt(row.amount), 0n);
}

async function ensureRedeemableAccount(tx: any, walletAddress: string): Promise<void> {
  await tx.insert(redeemableGemAccounts).values({
    walletAddress,
    balance: 0,
    updatedAt: new Date(),
  }).onConflictDoNothing();
}

async function debitRedeemableGems(
  tx: any,
  walletAddress: string,
  purchaseId: string,
): Promise<void> {
  await ensureRedeemableAccount(tx, walletAddress);
  const [debit] = await tx.insert(redeemableGemLedger).values({
    id: crypto.randomUUID(),
    walletAddress,
    operationKey: `purchase:${purchaseId}:debit`,
    delta: -GEM_COST,
    reason: "token-purchase",
    purchaseId,
  }).onConflictDoNothing().returning({ id: redeemableGemLedger.id });
  if (!debit) throw new TokenPurchaseError("purchase_already_accounted", "Purchase accounting conflict.", 409);
  const updated = await tx.update(redeemableGemAccounts).set({
    balance: sql`${redeemableGemAccounts.balance} - ${GEM_COST}`,
    updatedAt: new Date(),
  }).where(and(
    eq(redeemableGemAccounts.walletAddress, walletAddress),
    sql`${redeemableGemAccounts.balance} >= ${GEM_COST}`,
  )).returning({ balance: redeemableGemAccounts.balance });
  if (updated.length !== 1) {
    throw new TokenPurchaseError("insufficient_redeemable_gems", "At least 100 redeemable gems are required.", 409);
  }
}

async function markDefinitiveRevert(
  purchase: typeof tokenPurchases.$inferSelect,
): Promise<typeof tokenPurchases.$inferSelect> {
  return db.transaction(async (tx) => {
    const [updated] = await tx.update(tokenPurchases).set({
      status: "failed",
      errorCode: "transaction_reverted",
      updatedAt: new Date(),
    }).where(and(
      eq(tokenPurchases.id, purchase.id),
      inArray(tokenPurchases.status, [...UNRESOLVED_STATUSES]),
    )).returning();
    if (!updated) {
      const [current] = await tx.select().from(tokenPurchases)
        .where(eq(tokenPurchases.id, purchase.id)).limit(1);
      return current ?? purchase;
    }
    await ensureRedeemableAccount(tx, updated.walletAddress);
    const [refund] = await tx.insert(redeemableGemLedger).values({
      id: crypto.randomUUID(),
      walletAddress: updated.walletAddress,
      operationKey: `purchase:${updated.id}:revert-refund`,
      delta: GEM_COST,
      reason: "token-purchase-definitive-revert",
      purchaseId: updated.id,
    }).onConflictDoNothing().returning({ id: redeemableGemLedger.id });
    if (refund) {
      await tx.update(redeemableGemAccounts).set({
        balance: sql`${redeemableGemAccounts.balance} + ${GEM_COST}`,
        updatedAt: new Date(),
      }).where(eq(redeemableGemAccounts.walletAddress, updated.walletAddress));
    }
    return updated;
  });
}

async function purchaseStuck(tx: any): Promise<boolean> {
  const cutoff = new Date(Date.now() - STUCK_NONCE_THRESHOLD_MS);
  const rows = await tx
    .select({ id: tokenPurchases.id })
    .from(tokenPurchases)
    .where(and(
      inArray(tokenPurchases.status, ["signed", "submitted"]),
      isNotNull(tokenPurchases.nonce),
      lt(tokenPurchases.updatedAt, cutoff),
    ))
    .limit(1);
  return rows.length > 0;
}

export function catalogItem(quote: Quote) {
  return {
    symbol: quote.symbol,
    tokenAddress: quote.tokenAddress,
    decimals: TOKEN_DECIMALS,
    gemCost: GEM_COST,
    usdValue: "10",
    tokenAmount: decimalFromBaseUnits(BigInt(quote.amountBaseUnits)),
    quotePrice: quote.price,
    quoteSource: quote.source,
    quoteTimestamp: quote.timestamp.toISOString(),
    quoteDelayed: "previous-close",
    delayed: true,
    available: true,
  };
}

function outputPurchase(
  row: typeof tokenPurchases.$inferSelect,
  redeemableGemBalance: number,
) {
  return {
    id: row.id,
    symbol: row.symbol,
    status: row.status,
    gemCost: row.gemCost,
    tokenAmount: decimalFromBaseUnits(BigInt(row.tokenAmountBaseUnits)),
    quotePrice: row.quotePrice,
    quoteSource: row.quoteSource,
    quoteTimestamp: row.quoteTimestamp.toISOString(),
    quoteDelayed: row.quoteDelayed,
    delayed: true,
    redeemableGemBalance,
    transactionHash: row.transactionHash,
  };
}

async function purchaseResponse(row: typeof tokenPurchases.$inferSelect) {
  const balance = await db
    .select({ balance: redeemableGemAccounts.balance })
    .from(redeemableGemAccounts)
    .where(eq(redeemableGemAccounts.walletAddress, row.walletAddress))
    .limit(1);
  return outputPurchase(row, balance[0]?.balance ?? 0);
}

async function receiptStatus(row: typeof tokenPurchases.$inferSelect) {
  if (!row.transactionHash || row.status === "confirmed" || row.status === "failed") return row;
  try {
    const receipt = await dependencies.chainClient.getTransactionReceipt({ hash: row.transactionHash as Hex });
    const status: PurchaseStatus = receipt.status === "success" ? "confirmed" : "failed";
    if (status === "failed") return markDefinitiveRevert(row);
    const [updated] = await db.update(tokenPurchases).set({
      status,
      errorCode: null,
      updatedAt: new Date(),
      confirmedAt: new Date(),
    }).where(and(
      eq(tokenPurchases.id, row.id),
      inArray(tokenPurchases.status, [...UNRESOLVED_STATUSES]),
    )).returning();
    return updated ?? row;
  } catch {
    return row;
  }
}

async function signAndPersist(row: typeof tokenPurchases.$inferSelect): Promise<typeof tokenPurchases.$inferSelect> {
  const account = escrowAccount();
  const destination = row.walletAddress as Address;
  const data = encodeFunctionData({
    abi: TRANSFER_ABI,
    functionName: "transfer",
    args: [destination, BigInt(row.tokenAmountBaseUnits)],
  });
  // The advisory transaction lock serializes nonce allocation and remains held
  // until the signed bytes and their hash are durable.
  const [updated] = await db.transaction(async (tx) => {
    await tx.execute(signerLockSql());
    if (await purchaseStuck(tx)) {
      throw new TokenPurchaseError(
        "signer_nonce_stuck",
        "A previous token payout is still pending. New payouts are temporarily paused.",
        503,
      );
    }
    const current = (await tx.select().from(tokenPurchases).where(eq(tokenPurchases.id, row.id)).limit(1))[0];
    if (!current || current.rawSignedTransaction) return [current ?? row];
    const earlierSigned = await tx
      .select({ id: tokenPurchases.id })
      .from(tokenPurchases)
      .where(and(
        isNotNull(tokenPurchases.nonce),
        inArray(tokenPurchases.status, ["signed", "submitted"]),
        sql`${tokenPurchases.id} <> ${row.id}`,
      ))
      .limit(1);
    // Do not create a nonce gap by signing a later pending intent while an
    // earlier durable transaction still needs to be rebroadcast/confirmed.
    if (earlierSigned.length > 0) return [current];
    const chainNonce = await dependencies.chainClient.getTransactionCount({ address: account.address, blockTag: "pending" });
    const [latestSigned] = await tx
      .select({ nonce: tokenPurchases.nonce })
      .from(tokenPurchases)
      .where(isNotNull(tokenPurchases.nonce))
      .orderBy(desc(tokenPurchases.nonce))
      .limit(1);
    // A signed intent is durable before broadcast. Include it when allocating
    // the next nonce so two requests cannot sign different payouts at the same
    // nonce during the brief signed-but-not-yet-broadcast window.
    const databaseNonceBig = latestSigned?.nonce == null
      ? BigInt(chainNonce)
      : latestSigned.nonce + 1n;
    if (databaseNonceBig > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new TokenPurchaseError("nonce_unavailable", "Token payout nonce is unavailable.", 503);
    }
    const nonce = Math.max(chainNonce, Number(databaseNonceBig));
    const gas = await dependencies.chainClient.estimateGas({ account, to: row.tokenAddress as Address, data, value: 0n });
    const gasPrice = await dependencies.chainClient.getGasPrice();
    const raw = await account.signTransaction({
      chainId: ROBINHOOD_MAINNET_CHAIN_ID,
      to: row.tokenAddress as Address,
      data,
      value: 0n,
      nonce,
      gas,
      gasPrice,
    });
    const hash = keccak256(raw);
    return tx.update(tokenPurchases).set({
      rawSignedTransaction: raw,
      transactionHash: hash,
      nonce: BigInt(nonce),
      status: "signed",
      signedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(tokenPurchases.id, row.id)).returning();
  });
  return updated ?? row;
}

async function broadcast(row: typeof tokenPurchases.$inferSelect) {
  if (!row.rawSignedTransaction) return row;
  try {
    await dependencies.chainClient.sendRawTransaction({ serializedTransaction: row.rawSignedTransaction as Hex });
    if (row.status === "submitted") return receiptStatus(row);
    const [updated] = await db.update(tokenPurchases).set({
      status: "submitted",
      submittedAt: row.submittedAt ?? new Date(),
      updatedAt: new Date(),
    }).where(eq(tokenPurchases.id, row.id)).returning();
    return await receiptStatus(updated ?? row);
  } catch {
    // The raw transaction and hash are retained. A retry rebroadcasts exactly
    // these bytes; it never allocates a replacement nonce or signs again.
    return row;
  }
}

async function processPurchase(row: typeof tokenPurchases.$inferSelect) {
  let current = row;
  if (current.status === "confirmed" || current.status === "failed") return current;
  if (process.env.TOKEN_PURCHASES_ENABLED !== "true") return current;
  if (!current.rawSignedTransaction) current = await signAndPersist(current);
  if (current.rawSignedTransaction) current = await broadcast(current);
  return current;
}

export async function purchaseToken(walletAddress: string, requestedSymbol: unknown, idempotencyKey: string) {
  const token = symbol(requestedSymbol);
  if (!token) throw new TokenPurchaseError("invalid_symbol", "Choose GLD or SLV.", 400);
  if (!/^[\x21-\x7e]{1,200}$/.test(idempotencyKey)) {
    throw new TokenPurchaseError("invalid_idempotency_key", "A valid idempotency key is required.", 400);
  }

  const existing = (await db.select().from(tokenPurchases).where(sql`${tokenPurchases.walletAddress} = ${walletAddress} AND ${tokenPurchases.idempotencyKey} = ${idempotencyKey}`).limit(1))[0];
  if (existing) {
    if (existing.symbol !== token) throw new TokenPurchaseError("idempotency_conflict", "Idempotency key belongs to another token.", 409);
    return purchaseResponse(await processPurchase(await receiptStatus(existing)));
  }

  assertPurchasesEnabled();
  const quote = await fetchQuote(token);
  // Fail closed before touching the redeemable-gem account. A signer mismatch
  // is a deployment/configuration error, not a reason to debit gems.
  escrowAccount();
  let intent: typeof tokenPurchases.$inferSelect;
  try {
    [intent] = await db.transaction(async (tx) => {
      await tx.execute(tokenLockSql(quote.tokenAddress));
      await tx.execute(signerLockSql());
      if (await purchaseStuck(tx)) {
        throw new TokenPurchaseError(
          "signer_nonce_stuck",
          "A previous token payout is still pending. New payouts are temporarily paused.",
          503,
        );
      }
      let chainBalance: bigint;
      try {
        chainBalance = await getEscrowBalance(quote.tokenAddress);
      } catch {
        throw new TokenPurchaseError("inventory_unavailable", "Token inventory is unavailable.");
      }
      const reserved = await unresolvedReservation(tx, quote.tokenAddress);
      if (chainBalance - reserved < BigInt(quote.amountBaseUnits)) {
        throw new TokenPurchaseError("inventory_unavailable", "The selected token is not currently available.", 409);
      }
      const purchaseId = crypto.randomUUID();
      await debitRedeemableGems(tx, walletAddress, purchaseId);
      return tx.insert(tokenPurchases).values({
        id: purchaseId,
        walletAddress,
        idempotencyKey,
        symbol: token,
        tokenAddress: TOKENS[token],
        gemCost: GEM_COST,
        quotePrice: quote.price,
        quoteSource: quote.source,
        quoteTimestamp: quote.timestamp,
        quoteDelayed: "previous-close",
        tokenAmountBaseUnits: quote.amountBaseUnits,
        status: "pending",
        updatedAt: new Date(),
      }).returning();
    });
  } catch (error) {
    if (error instanceof TokenPurchaseError) throw error;
    const retry = (await db.select().from(tokenPurchases).where(sql`${tokenPurchases.walletAddress} = ${walletAddress} AND ${tokenPurchases.idempotencyKey} = ${idempotencyKey}`).limit(1))[0];
    if (retry) {
      if (retry.symbol !== token) throw new TokenPurchaseError("idempotency_conflict", "Idempotency key belongs to another token.", 409);
      return purchaseResponse(await processPurchase(await receiptStatus(retry)));
    }
    throw error;
  }
  if (!intent) throw new TokenPurchaseError("purchase_unavailable", "Purchase could not be created.");
  logger.info({ walletAddress, symbol: token, purchaseId: intent.id }, "Token purchase intent created");
  return purchaseResponse(await processPurchase(intent));
}

export async function getRedeemableGemBalance(walletAddress: string): Promise<number> {
  return db.transaction(async (tx) => {
    await ensureRedeemableAccount(tx, walletAddress);
    const [row] = await tx
      .select({ balance: redeemableGemAccounts.balance })
      .from(redeemableGemAccounts)
      .where(eq(redeemableGemAccounts.walletAddress, walletAddress))
      .limit(1);
    return row?.balance ?? 0;
  });
}

export async function getTokenPurchase(walletAddress: string, id: string) {
  const [row] = await db.select().from(tokenPurchases).where(and(
    eq(tokenPurchases.id, id),
    eq(tokenPurchases.walletAddress, walletAddress),
  )).limit(1);
  if (!row) return null;
  return purchaseResponse(await receiptStatus(row));
}

export async function getPendingTokenPurchases(walletAddress: string) {
  const rows = await db.select().from(tokenPurchases).where(and(
    eq(tokenPurchases.walletAddress, walletAddress),
    inArray(tokenPurchases.status, [...UNRESOLVED_STATUSES]),
  )).orderBy(tokenPurchases.createdAt).limit(100);
  const processed = [];
  for (const row of rows) {
    processed.push(await purchaseResponse(await receiptStatus(row)));
  }
  return processed;
}

export async function recoverPendingPurchases(): Promise<void> {
  if (process.env.TOKEN_PURCHASES_ENABLED !== "true") return;
  const rows = await db.select().from(tokenPurchases).where(
    inArray(tokenPurchases.status, [...UNRESOLVED_STATUSES]),
  ).orderBy(tokenPurchases.createdAt).limit(25);
  for (const row of rows) {
    try {
      await processPurchase(await receiptStatus(row));
    } catch (error) {
      // Never include raw transaction bytes or signer configuration in logs.
      // RPC errors can echo request payloads; do not attach the error object
      // because it could contain serialized transaction bytes.
      logger.warn({ purchaseId: row.id, symbol: row.symbol }, "Token purchase recovery deferred");
    }
  }
}

export async function inspectTokenPayoutHealth(now = new Date()): Promise<TokenPayoutHealthSnapshot> {
  const minimumNativeGasBaseUnits = minimumNativeGas();
  let nativeGasBaseUnits: bigint | null = null;
  try {
    nativeGasBaseUnits = await publicClient.getBalance({ address: ESCROW_ADDRESS, blockTag: "pending" });
  } catch {
    // The monitor reports the failed read without attaching the RPC error,
    // which may contain request payloads.
  }

  const tokens: TokenPayoutHealthSnapshot["tokens"] = [];
  for (const token of ["GLD", "SLV"] as const) {
    let quote: Quote | null = null;
    let availableBaseUnits: bigint | null = null;
    let unresolvedRows: Array<{ createdAt: Date; updatedAt: Date; nonce: bigint | null }> = [];
    try {
      quote = await fetchQuote(token);
    } catch {
      // Represent quote failure in the snapshot without logging provider data.
    }
    try {
      const state = await db.transaction(async (tx) => {
        await tx.execute(tokenLockSql(TOKENS[token]));
        const rows = await tx.select({
          createdAt: tokenPurchases.createdAt,
          updatedAt: tokenPurchases.updatedAt,
          nonce: tokenPurchases.nonce,
        }).from(tokenPurchases).where(and(
          eq(tokenPurchases.tokenAddress, TOKENS[token]),
          inArray(tokenPurchases.status, [...UNRESOLVED_STATUSES]),
        ));
        const reserved = await unresolvedReservation(tx, TOKENS[token]);
        const chainBalance = await getEscrowBalance(TOKENS[token]);
        return { rows, available: chainBalance - reserved };
      });
      unresolvedRows = state.rows;
      availableBaseUnits = state.available;
    } catch {
      // Represent inventory/RPC failure in the snapshot.
    }
    const stuck = unresolvedRows.filter((row) =>
      row.nonce !== null && now.getTime() - row.updatedAt.getTime() >= STUCK_NONCE_THRESHOLD_MS
    );
    tokens.push({
      symbol: token,
      quoteHealthy: quote !== null,
      quoteTimestamp: quote?.timestamp ?? null,
      availableBaseUnits,
      payoutAmountBaseUnits: quote ? BigInt(quote.amountBaseUnits) : null,
      unresolvedCount: unresolvedRows.length,
      oldestUnresolvedAt: unresolvedRows.reduce<Date | null>(
        (oldest, row) => !oldest || row.createdAt < oldest ? row.createdAt : oldest,
        null,
      ),
      stuckNonceCount: stuck.length,
      oldestStuckNonceAt: stuck.reduce<Date | null>(
        (oldest, row) => !oldest || row.updatedAt < oldest ? row.updatedAt : oldest,
        null,
      ),
    });
  }
  return {
    checkedAt: now,
    configured: isPayoutConfigured(),
    nativeGasBaseUnits,
    minimumNativeGasBaseUnits,
    tokens,
  };
}
export function startTokenPurchaseWorker(): ReturnType<typeof setInterval> | null {
  if (process.env.TOKEN_PURCHASES_ENABLED !== "true") return null;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await recoverPendingPurchases();
    } catch {
      logger.warn("Token purchase recovery cycle failed");
    } finally {
      running = false;
    }
  };
  void tick();
  return setInterval(() => void tick(), 15_000);
}

export function tokenAddress(symbol: TokenSymbol): Address {
  return TOKENS[symbol];
}

export function startTokenPayoutMonitor(): ReturnType<typeof setInterval> | null {
  if (process.env.TOKEN_PURCHASES_ENABLED !== "true") return null;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await monitorTokenPayoutHealth();
    } catch {
      logger.error({
        condition: "monitor_cycle_failed",
        action: "Check database and Robinhood Chain RPC connectivity; payout health could not be evaluated.",
      }, "Token payout operator alert");
    } finally {
      running = false;
    }
  };
  void tick();
  return setInterval(() => void tick(), TOKEN_MONITOR_INTERVAL_MS);
}

interface TokenPurchaseDependencies {
  chainClient: TokenPurchaseChainClient;
  quoteFetcher: (token: TokenSymbol) => Promise<Quote>;
  escrowAccountFactory: () => EscrowAccount;
}

const productionDependencies: TokenPurchaseDependencies = {
  chainClient: publicClient as TokenPurchaseChainClient,
  quoteFetcher: fetchQuoteFromProvider,
  escrowAccountFactory: configuredEscrowAccount,
};

let dependencies = productionDependencies;

/** Test-only seam for deterministic local chain clients. */
export function setTokenPurchaseTestDependencies(
  overrides: Partial<TokenPurchaseDependencies> | null,
): void {
  dependencies = overrides ? { ...productionDependencies, ...overrides } : productionDependencies;
}

interface TokenPurchaseChainClient {
  readContract(args: Parameters<typeof publicClient.readContract>[0]): Promise<unknown>;
  getTransactionReceipt(args: Parameters<typeof publicClient.getTransactionReceipt>[0]): Promise<{ status: "success" | "reverted" }>;
  getTransactionCount(args: Parameters<typeof publicClient.getTransactionCount>[0]): Promise<number>;
  estimateGas(args: Parameters<typeof publicClient.estimateGas>[0]): Promise<bigint>;
  getGasPrice(): Promise<bigint>;
  sendRawTransaction(args: Parameters<typeof publicClient.sendRawTransaction>[0]): Promise<Hex>;
}

function minimumNativeGas(): bigint {
  try {
    return parseEther(process.env.TOKEN_ESCROW_MIN_NATIVE_GAS ?? DEFAULT_MIN_NATIVE_GAS);
  } catch {
    return parseEther(DEFAULT_MIN_NATIVE_GAS);
  }
}

const activePayoutAlerts = new Map<string, number>();

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export async function monitorTokenPayoutHealth(now = new Date()): Promise<TokenPayoutAlert[]> {
  const snapshot = await inspectTokenPayoutHealth(now);
  const alerts = evaluateTokenPayoutHealth(
    snapshot,
    positiveInteger(process.env.TOKEN_ESCROW_MIN_INVENTORY_PAYOUTS, DEFAULT_MIN_INVENTORY_PAYOUTS),
  );
  const currentKeys = new Set(alerts.map((alert) => alert.key));
  for (const key of activePayoutAlerts.keys()) {
    if (!currentKeys.has(key)) {
      activePayoutAlerts.delete(key);
      logger.info({ alertKey: key }, "Token payout operator alert resolved");
    }
  }
  for (const alert of alerts) {
    const lastEmitted = activePayoutAlerts.get(alert.key) ?? 0;
    if (now.getTime() - lastEmitted < TOKEN_ALERT_REPEAT_MS) continue;
    activePayoutAlerts.set(alert.key, now.getTime());
    logger[alert.severity === "critical" ? "error" : "warn"](
      {
        alertKey: alert.key,
        condition: alert.condition,
        symbol: alert.symbol,
        action: alert.action,
        ...alert.details,
      },
      "Token payout operator alert",
    );
  }
  return alerts;
}
