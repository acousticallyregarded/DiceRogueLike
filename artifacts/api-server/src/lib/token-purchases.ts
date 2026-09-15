import {
  createPublicClient,
  encodeFunctionData,
  http,
  keccak256,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { desc, eq, isNotNull, sql } from "drizzle-orm";
import { db, tokenPurchases, walletSaves } from "@workspace/db";
import { logger } from "./logger";
import { InvalidTokenPriceError, tokenAmountForPrice } from "./token-purchase-math";
export { tokenAmountForPrice } from "./token-purchase-math";

export const ROBINHOOD_MAINNET_CHAIN_ID = 4663;
export const ROBINHOOD_MAINNET_RPC = "https://rpc.mainnet.chain.robinhood.com";
export const ESCROW_ADDRESS = "0x6efDa0f76c9B5D23a0dD777A773FAa876fc10C95" as Address;
export const TOKEN_DECIMALS = 18;
export const GEM_COST = 100;

export type TokenSymbol = "GLD" | "SLV";
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

function assertPurchasesEnabled(): void {
  if (process.env.TOKEN_PURCHASES_ENABLED !== "true") {
    throw new TokenPurchaseError(
      "purchases_disabled",
      "Token purchases are not enabled.",
      503,
    );
  }
}

function escrowAccount() {
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

function quoteAgeIsAllowed(timestamp: Date): boolean {
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const quotedDay = Date.UTC(timestamp.getUTCFullYear(), timestamp.getUTCMonth(), timestamp.getUTCDate());
  return today - quotedDay >= 0 && today - quotedDay <= 7 * 86_400_000;
}

async function fetchQuote(token: TokenSymbol): Promise<Quote> {
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
  const result = (body as { results?: Array<{ c?: number; t?: number }> })?.results?.[0];
  if (!result || typeof result.c !== "number" || !Number.isFinite(result.c) || result.c <= 0 || typeof result.t !== "number") {
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

export async function getTokenQuote(token: TokenSymbol): Promise<Quote> {
  return fetchQuote(token);
}

export async function getInventory(): Promise<InventoryItem[]> {
  const items: InventoryItem[] = [];
  const configured = isPayoutConfigured();
  for (const token of ["GLD", "SLV"] as const) {
    try {
      const quote = await fetchQuote(token);
      const balanceBaseUnits = await getEscrowBalance(quote.tokenAddress);
      items.push({
        ...quote,
        escrowBalanceBaseUnits: balanceBaseUnits.toString(),
        escrowBalance: decimalFromBaseUnits(balanceBaseUnits),
        available: configured && balanceBaseUnits >= BigInt(quote.amountBaseUnits),
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
        available: false,
      });
    }
  }
  return items;
}

async function getEscrowBalance(tokenAddress: Address): Promise<bigint> {
  const balance = await publicClient.readContract({
    address: tokenAddress,
    abi: BALANCE_ABI,
    functionName: "balanceOf",
    args: [ESCROW_ADDRESS],
  });
  return BigInt(balance as bigint);
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

function outputPurchase(row: typeof tokenPurchases.$inferSelect) {
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
    transactionHash: row.transactionHash,
  };
}

async function receiptStatus(row: typeof tokenPurchases.$inferSelect) {
  if (!row.transactionHash) return row;
  try {
    const receipt = await publicClient.getTransactionReceipt({ hash: row.transactionHash as Hex });
    const status: PurchaseStatus = receipt.status === "success" ? "confirmed" : "failed";
    const [updated] = await db.update(tokenPurchases).set({
      status,
      errorCode: status === "failed" ? "transaction_reverted" : null,
      updatedAt: new Date(),
      confirmedAt: status === "confirmed" ? new Date() : null,
    }).where(eq(tokenPurchases.id, row.id)).returning();
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
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"dicebound-token-payout"}))`);
    const current = (await tx.select().from(tokenPurchases).where(eq(tokenPurchases.id, row.id)).limit(1))[0];
    if (!current || current.rawSignedTransaction) return [current ?? row];
    const chainNonce = await publicClient.getTransactionCount({ address: account.address, blockTag: "pending" });
    const [latestSigned] = await tx
      .select({ nonce: tokenPurchases.nonce })
      .from(tokenPurchases)
      .where(isNotNull(tokenPurchases.nonce))
      .orderBy(desc(tokenPurchases.nonce))
      .limit(1);
    // A signed intent is durable before broadcast. Include it when allocating
    // the next nonce so two requests cannot sign different payouts at the same
    // nonce during the brief signed-but-not-yet-broadcast window.
    const databaseNonce = latestSigned?.nonce == null
      ? chainNonce
      : Number(latestSigned.nonce + 1n);
    const nonce = Math.max(chainNonce, databaseNonce);
    const gas = await publicClient.estimateGas({ account, to: row.tokenAddress as Address, data, value: 0n });
    const gasPrice = await publicClient.getGasPrice();
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
    await publicClient.sendRawTransaction({ serializedTransaction: row.rawSignedTransaction as Hex });
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
    return outputPurchase(await processPurchase(await receiptStatus(existing)));
  }

  assertPurchasesEnabled();
  const quote = await fetchQuote(token);
  // Fail closed before touching the wallet save. A signer mismatch is a
  // deployment/configuration error, not a reason to deduct gems.
  escrowAccount();
  let escrowBalance: bigint;
  try {
    escrowBalance = await getEscrowBalance(quote.tokenAddress);
  } catch {
    throw new TokenPurchaseError("inventory_unavailable", "Token inventory is unavailable.");
  }
  if (escrowBalance < BigInt(quote.amountBaseUnits)) {
    throw new TokenPurchaseError("inventory_unavailable", "The selected token is not currently available.", 409);
  }
  let intent: typeof tokenPurchases.$inferSelect;
  try {
    [intent] = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT address FROM wallet_saves WHERE address = ${walletAddress} FOR UPDATE`);
      const saveRow = (await tx.select().from(walletSaves).where(eq(walletSaves.address, walletAddress)).limit(1))[0];
      const save = saveRow?.save as { meta?: { gems?: unknown } } | null;
      const gems = save?.meta?.gems;
      if (!saveRow || !save || !save.meta || typeof gems !== "number" || !Number.isInteger(gems) || gems < GEM_COST) {
        throw new TokenPurchaseError("insufficient_gems", "At least 100 gems are required.", 409);
      }
      const nextSave = { ...save, meta: { ...save.meta, gems: gems - GEM_COST } };
      await tx.update(walletSaves).set({
        save: nextSave,
        revision: sql`${walletSaves.revision} + 1`,
        updatedAt: new Date(),
      }).where(eq(walletSaves.address, walletAddress));
      return tx.insert(tokenPurchases).values({
        id: crypto.randomUUID(),
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
      return outputPurchase(await processPurchase(await receiptStatus(retry)));
    }
    throw error;
  }
  if (!intent) throw new TokenPurchaseError("purchase_unavailable", "Purchase could not be created.");
  logger.info({ walletAddress, symbol: token, purchaseId: intent.id }, "Token purchase intent created");
  return outputPurchase(await processPurchase(intent));
}

export function tokenAddress(symbol: TokenSymbol): Address {
  return TOKENS[symbol];
}