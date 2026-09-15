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
import { sql } from "drizzle-orm";

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
    provenanceStatus: text("provenance_status").notNull().default("unverified"),
    provenanceSource: text("provenance_source"),
    provenancePeriod: text("provenance_period"),
    provenanceAuditId: text("provenance_audit_id"),
    provenanceAuditedAt: timestamp("provenance_audited_at", { withTimezone: true, mode: "date" }),
    quarantineReason: text("quarantine_reason"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true, mode: "date" }),
  },
  (table) => ({
    monsterIndex: uniqueIndex("token_rewards_eligibility_monster_idx").on(table.eligibilityId, table.monsterId),
    walletStatusIndex: index("token_rewards_wallet_status_idx").on(table.walletAddress, table.status),
    provenanceIndex: index("token_rewards_provenance_idx").on(table.provenanceStatus, table.createdAt),
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

/**
 * A server-owned Dicebound combat run.  The seed is never sent to the
 * browser; it is retained so an operator can deterministically replay the
 * value-bearing state from the append-only action events.
 */
export const diceboundRuns = pgTable(
  "dicebound_runs",
  {
    id: text("id").primaryKey(),
    walletAddress: text("wallet_address").notNull(),
    seed: text("seed").notNull(),
    seedCommitment: text("seed_commitment").notNull(),
    engineVersion: text("engine_version"),
    // Immutable replay checkpoint. Nullable only for legacy rows created before
    // durable checkpoints existed; such rows are never independently reviewable.
    initialState: jsonb("initial_state").$type<unknown>(),
    initialStateHash: text("initial_state_hash"),
    initialStateCommitment: text("initial_state_commitment"),
    canonicalState: jsonb("canonical_state").$type<unknown>().notNull(),
    status: text("status").notNull(),
    sequence: integer("sequence").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
  },
  (table) => ({
    walletCreatedIndex: index("dicebound_runs_wallet_created_idx").on(table.walletAddress, table.createdAt),
    walletStatusIndex: index("dicebound_runs_wallet_status_idx").on(table.walletAddress, table.status),
    activeWalletUniqueIndex: uniqueIndex("dicebound_runs_one_active_wallet_idx")
      .on(table.walletAddress)
      .where(sql`status = 'active'`),
  }),
);
export type WalletChallenge = typeof walletChallenges.$inferSelect;
export type WalletSession = typeof walletSessions.$inferSelect;
export type WalletSave = typeof walletSaves.$inferSelect;
export type TokenReward = typeof tokenRewards.$inferSelect;
export type TokenRewardClaim = typeof tokenRewardClaims.$inferSelect;
export type RedeemableGemAccount = typeof redeemableGemAccounts.$inferSelect;
export type RedeemableGemLedgerEntry = typeof redeemableGemLedger.$inferSelect;
export type TokenPurchase = typeof tokenPurchases.$inferSelect;
export type TokenPayoutAlertState = typeof tokenPayoutAlertStates.$inferSelect;

export type TokenPayoutMonitorState = typeof tokenPayoutMonitorState.$inferSelect;

export type DiceboundRun = typeof diceboundRuns.$inferSelect;

export type DiceboundDeathRoll = typeof diceboundDeathRolls.$inferSelect;

/** Durable start idempotency record; a retry returns its stored response. */
export const diceboundRunStarts = pgTable(
  "dicebound_run_starts",
  {
    id: text("id").primaryKey(),
    walletAddress: text("wallet_address").notNull(),
    clientRequestId: text("client_request_id").notNull(),
    character: text("character").notNull(),
    runId: text("run_id").notNull(),
    response: jsonb("response").$type<unknown>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => ({
    requestIndex: uniqueIndex("dicebound_run_starts_wallet_request_idx").on(
      table.walletAddress,
      table.clientRequestId,
    ),
    runIndex: uniqueIndex("dicebound_run_starts_run_idx").on(table.runId),
  }),
);

export type DiceboundRunStart = typeof diceboundRunStarts.$inferSelect;
export type DiceboundDeathReview = typeof diceboundDeathReviews.$inferSelect;

/**
 * Exactly one cryptographic roll is recorded for each monster death.  The
 * pending_review status is intentional: it is not a token reward or a claim
 * and cannot create one until an independent trust-boundary review exists.
 */
export const diceboundDeathRolls = pgTable(
  "dicebound_death_rolls",
  {
    id: text("id").primaryKey(),
    runId: text("run_id").notNull(),
    monsterId: text("monster_id").notNull(),
    encounterIndex: integer("encounter_index").notNull(),
    monsterIndex: integer("monster_index").notNull(),
    algorithmVersion: text("algorithm_version").notNull(),
    rollValue: integer("roll_value").notNull(),
    rollUpperBound: integer("roll_upper_bound").notNull().default(100),
    successThreshold: integer("success_threshold").notNull().default(5),
    commitment: text("commitment").notNull(),
    status: text("status").notNull().default("pending_review"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => ({
    monsterIndex: uniqueIndex("dicebound_death_rolls_run_monster_idx").on(table.runId, table.monsterId),
    runStatusIndex: index("dicebound_death_rolls_run_status_idx").on(table.runId, table.status),
  }),
);

/** Independent trust-boundary decision for one immutable death roll. */
export const diceboundDeathReviews = pgTable(
  "dicebound_death_reviews",
  {
    id: text("id").primaryKey(),
    deathRollId: text("death_roll_id").notNull(),
    runId: text("run_id").notNull(),
    reviewerId: text("reviewer_id").notNull(),
    decision: text("decision").notNull(),
    evidence: jsonb("evidence").$type<unknown>().notNull(),
    evidenceHash: text("evidence_hash").notNull(),
    reviewerSignature: text("reviewer_signature").notNull(),
    rewardId: text("reward_id"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => ({
    deathRollIndex: uniqueIndex("dicebound_death_reviews_roll_idx").on(table.deathRollId),
    runDecisionIndex: index("dicebound_death_reviews_run_decision_idx").on(table.runId, table.decision),
  }),
);

export type DiceboundActionEvent = typeof diceboundActionEvents.$inferSelect;

/** Append-only intent records and exact response cache for run idempotency. */
export const diceboundActionEvents = pgTable(
  "dicebound_action_events",
  {
    id: text("id").primaryKey(),
    runId: text("run_id").notNull(),
    sequence: integer("sequence").notNull(),
    clientRequestId: text("client_request_id").notNull(),
    intent: jsonb("intent").$type<unknown>().notNull(),
    response: jsonb("response").$type<unknown>().notNull(),
    beforeStateHash: text("before_state_hash"),
    afterStateHash: text("after_state_hash"),
    previousEventCommitment: text("previous_event_commitment"),
    eventCommitment: text("event_commitment"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => ({
    requestIndex: uniqueIndex("dicebound_action_events_run_request_idx").on(table.runId, table.clientRequestId),
    sequenceIndex: uniqueIndex("dicebound_action_events_run_sequence_idx").on(table.runId, table.sequence),
  }),
);
