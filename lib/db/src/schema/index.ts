import {
  bigint,
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  index,
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
 * A server-issued combat eligibility window.  The client may report only
 * monster identifiers that were included in this ticket; the ticket itself is
 * single-use per monster and is bound to the authenticated wallet session.
 */
export const encounterEligibilities = pgTable(
  "encounter_eligibilities",
  {
    id: text("id").primaryKey(),
    walletAddress: text("wallet_address").notNull(),
    sessionId: text("session_id").notNull(),
    encounterId: text("encounter_id").notNull(),
    monsterIds: jsonb("monster_ids").$type<string[]>().notNull(),
    completedMonsterIds: jsonb("completed_monster_ids").$type<string[]>().notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    lastCompletedAt: timestamp("last_completed_at", { withTimezone: true, mode: "date" }),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    status: text("status").notNull().default("active"),
  },
  (table) => ({
    walletStatusIndex: index("encounter_eligibilities_wallet_status_idx").on(table.walletAddress, table.status),
    encounterIndex: uniqueIndex("encounter_eligibilities_wallet_encounter_idx").on(table.walletAddress, table.encounterId),
  }),
);

/** A fixed-$0.15 liability reserved against escrow inventory at award time. */
export const tokenRewards = pgTable(
  "token_rewards",
  {
    id: text("id").primaryKey(),
    walletAddress: text("wallet_address").notNull(),
    eligibilityId: text("eligibility_id").notNull(),
    monsterId: text("monster_id").notNull(),
    symbol: text("symbol").notNull(),
    tokenAddress: text("token_address").notNull(),
    tokenAmountBaseUnits: text("token_amount_base_units").notNull(),
    usdCents: integer("usd_cents").notNull().default(15),
    status: text("status").notNull().default("unclaimed"),
    claimId: text("claim_id"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true, mode: "date" }),
  },
  (table) => ({
    monsterIndex: uniqueIndex("token_rewards_eligibility_monster_idx").on(table.eligibilityId, table.monsterId),
    walletStatusIndex: index("token_rewards_wallet_status_idx").on(table.walletAddress, table.status),
  }),
);

/** Durable idempotent aggregation of reward payouts. */
export const tokenRewardClaims = pgTable(
  "token_reward_claims",
  {
    id: text("id").primaryKey(),
    walletAddress: text("wallet_address").notNull(),
    status: text("status").notNull().default("pending"),
    gldPayoutId: text("gld_payout_id"),
    slvPayoutId: text("slv_payout_id"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => ({
    walletStatusIndex: index("token_reward_claims_wallet_status_idx").on(table.walletAddress, table.status),
  }),
);

/** Server-authoritative token-redeemable gem balance. */
export const redeemableGemAccounts = pgTable("redeemable_gem_accounts", {
  walletAddress: text("wallet_address").primaryKey(),
  balance: integer("balance").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

/** Append-only accounting entries for debits, refunds, and operator grants. */
export const redeemableGemLedger = pgTable(
  "redeemable_gem_ledger",
  {
    id: text("id").primaryKey(),
    walletAddress: text("wallet_address").notNull(),
    operationKey: text("operation_key").notNull(),
    delta: integer("delta").notNull(),
    reason: text("reason").notNull(),
    operatorId: text("operator_id"),
    purchaseId: text("purchase_id"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => ({
    operationKeyIndex: uniqueIndex("redeemable_gem_ledger_operation_key_idx").on(table.operationKey),
    walletCreatedIndex: index("redeemable_gem_ledger_wallet_created_idx").on(table.walletAddress, table.createdAt),
    purchaseIndex: index("redeemable_gem_ledger_purchase_idx").on(table.purchaseId),
  }),
);

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
    payoutKind: text("payout_kind").notNull().default("purchase"),
    rewardClaimId: text("reward_claim_id"),
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
    tokenStatusIndex: index("token_purchases_token_status_idx").on(table.tokenAddress, table.status),
    walletStatusIndex: index("token_purchases_wallet_status_idx").on(table.walletAddress, table.status),
    nonceIndex: uniqueIndex("token_purchases_signer_nonce_idx").on(table.nonce),
  }),
);

/** Shared repeat-suppression state for payout health alerts across API replicas. */
export const tokenPayoutAlertStates = pgTable("token_payout_alert_states", {
  alertKey: text("alert_key").primaryKey(),
  alertSnapshot: jsonb("alert_snapshot").$type<{
    key: string;
    severity: "warning" | "critical";
    condition: string;
    symbol?: "GLD" | "SLV";
    action: string;
    details: Record<string, string | number | boolean | null>;
  }>(),
  active: boolean("active").notNull().default(true),
  lastEmittedAt: timestamp("last_emitted_at", { withTimezone: true, mode: "date" }).notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: "date" }),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

/** Monotonic checkpoint preventing stale replica snapshots from changing alert state. */
export const tokenPayoutMonitorState = pgTable("token_payout_monitor_state", {
  id: text("id").primaryKey(),
  lastObservedAt: timestamp("last_observed_at", { withTimezone: true, mode: "date" }).notNull(),
});
export type WalletChallenge = typeof walletChallenges.$inferSelect;
export type WalletSession = typeof walletSessions.$inferSelect;
export type WalletSave = typeof walletSaves.$inferSelect;
export type EncounterEligibility = typeof encounterEligibilities.$inferSelect;
export type TokenReward = typeof tokenRewards.$inferSelect;
export type TokenRewardClaim = typeof tokenRewardClaims.$inferSelect;
export type RedeemableGemAccount = typeof redeemableGemAccounts.$inferSelect;
export type RedeemableGemLedgerEntry = typeof redeemableGemLedger.$inferSelect;
export type TokenPurchase = typeof tokenPurchases.$inferSelect;
export type TokenPayoutAlertState = typeof tokenPayoutAlertStates.$inferSelect;

export type TokenPayoutMonitorState = typeof tokenPayoutMonitorState.$inferSelect;
