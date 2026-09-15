import {
  bigint,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * A short-lived EIP-4361 challenge.  The message is persisted verbatim so
 * verification can never accidentally be performed against a reconstructed
 * or client-provided message.
 */
export const walletChallenges = pgTable(
  "wallet_challenges",
  {
    id: text("id").primaryKey(),
    address: text("address").notNull(),
    chainId: integer("chain_id").notNull(),
    message: text("message").notNull(),
    origin: text("origin").notNull(),
    nonceHash: text("nonce_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    requestIp: text("request_ip").notNull(),
  },
  (table) => ({
    nonceHashIndex: uniqueIndex("wallet_challenges_nonce_hash_idx").on(table.nonceHash),
  }),
);

/**
 * The bearer cookie is never stored in plaintext.  csrfToken is scoped to
 * this session and is only useful when paired with the opaque cookie.
 */
export const walletSessions = pgTable(
  "wallet_sessions",
  {
    id: text("id").primaryKey(),
    tokenHash: text("token_hash").notNull(),
    address: text("address").notNull(),
    chainId: integer("chain_id").notNull(),
    csrfToken: text("csrf_token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
  },
  (table) => ({
    tokenHashIndex: uniqueIndex("wallet_sessions_token_hash_idx").on(table.tokenHash),
  }),
);

export const walletSaves = pgTable("wallet_saves", {
  address: text("address").primaryKey(),
  save: jsonb("save").$type<unknown>(),
  revision: integer("revision").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }),
});

/**
 * A purchase is both the durable user intent and the outbox record used to
 * submit its already-signed transaction.  Keeping these in one normalized
 * table makes idempotency and retrying an ambiguous RPC response atomic.
 */
export const tokenPurchases = pgTable(
  "token_purchases",
  {
    id: text("id").primaryKey(),
    walletAddress: text("wallet_address").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    symbol: text("symbol").notNull(),
    tokenAddress: text("token_address").notNull(),
    gemCost: integer("gem_cost").notNull(),
    quotePrice: text("quote_price").notNull(),
    quoteSource: text("quote_source").notNull(),
    quoteTimestamp: timestamp("quote_timestamp", { withTimezone: true, mode: "date" }).notNull(),
    quoteDelayed: text("quote_delayed").notNull(),
    tokenAmountBaseUnits: text("token_amount_base_units").notNull(),
    status: text("status").notNull(),
    rawSignedTransaction: text("raw_signed_transaction"),
    transactionHash: text("transaction_hash"),
    nonce: bigint("nonce", { mode: "bigint" }),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    signedAt: timestamp("signed_at", { withTimezone: true, mode: "date" }),
    submittedAt: timestamp("submitted_at", { withTimezone: true, mode: "date" }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true, mode: "date" }),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => ({
    walletIdempotencyIndex: uniqueIndex("token_purchases_wallet_idempotency_idx").on(
      table.walletAddress,
      table.idempotencyKey,
    ),
  }),
);

export type WalletChallenge = typeof walletChallenges.$inferSelect;
export type WalletSession = typeof walletSessions.$inferSelect;
export type WalletSave = typeof walletSaves.$inferSelect;
export type TokenPurchase = typeof tokenPurchases.$inferSelect;