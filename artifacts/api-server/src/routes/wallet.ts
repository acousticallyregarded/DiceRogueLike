import { isAddress, verifyMessage } from "viem";
import type { Address, Hex } from "viem";
import { and, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";
import { Router, type IRouter } from "express";
import {
  db,
  walletChallenges,
  walletSaves,
  walletSessions,
} from "@workspace/db";
import {
  CHALLENGE_TTL_MS,
  clientIp,
  constantTimeEqual,
  hashNonce,
  hashOpaqueToken,
  isTrustedOrigin,
  newChallengeId,
  newNonce,
  newOpaqueToken,
  parseSessionCookie,
  requestOrigin,
  sendJsonError,
  SESSION_TTL_MS,
  setSessionCookie,
  WALLET_CHAIN_ID,
} from "../lib/wallet-security";
import { validateGameStateV4 } from "../lib/wallet-save-validation";
import {
  GetTokenCatalogResponse,
  GetTokenInventoryResponse,
  GetPendingTokenPurchasesResponse,
  GetRedeemableGemBalanceResponse,
  GetTokenPurchaseResponse,
  PurchaseTokenBody,
  PurchaseTokenResponse,
} from "@workspace/api-zod";
import {
  catalogItem,
  getInventory,
  getPendingTokenPurchases,
  getRedeemableGemBalance,
  getTokenPurchase,
  getTokenQuote,
  isPayoutConfigured,
  purchaseToken,
  TokenPurchaseError,
} from "../lib/token-purchases";
import {
  claimTokenRewards,
  getTokenRewards,
  TokenRewardError,
} from "../lib/token-rewards";
import {
  getCurrentRun,
  getReplay,
  getRun,
  isCharacterChoice,
  isRunAction,
  RunError,
  startRun,
  submitAction,
} from "../lib/dicebound-runs";

const router: IRouter = Router();
router.use("/wallet", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

type RateBucket = { startedAt: number; count: number };
const rateBuckets = new Map<string, RateBucket>();

function allowRate(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  if (rateBuckets.size > 2_000) {
    for (const [bucketKey, bucket] of rateBuckets) {
      if (now - bucket.startedAt > windowMs) rateBuckets.delete(bucketKey);
    }
  }
  const current = rateBuckets.get(key);
  if (!current || now - current.startedAt >= windowMs) {
    rateBuckets.set(key, { startedAt: now, count: 1 });
    return true;
  }
  current.count += 1;
  return current.count <= limit;
}

function normalizeAddress(value: unknown): string | null {
  if (typeof value !== "string" || !isAddress(value)) return null;
  return value.toLowerCase();
}

function requestIsTrusted(req: Request, res: Response): boolean {
  const origin = req.get("origin");
  if (
    (req.method === "POST" || req.method === "PUT") &&
    !origin
  ) {
    sendJsonError(res, 403, "origin_required");
    return false;
  }
  if (!isTrustedOrigin(req, origin)) {
    sendJsonError(res, 403, "origin_not_allowed");
    return false;
  }
  return true;
}

function bodyRecord(req: Request): Record<string, unknown> | null {
  return typeof req.body === "object" &&
    req.body !== null &&
    !Array.isArray(req.body)
    ? req.body as Record<string, unknown>
    : null;
}

function asyncRoute(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    void handler(req, res, next).catch(next);
  };
}

async function cleanExpiredChallenges(): Promise<void> {
  // Keep maintenance bounded so an attacker cannot make a request spend an
  // unbounded amount of time cleaning old challenges.
  const expired = await db
    .select({ id: walletChallenges.id })
    .from(walletChallenges)
    .where(lt(walletChallenges.expiresAt, new Date()))
    .limit(100);
  if (expired.length > 0) {
    await db.delete(walletChallenges).where(
      inArray(
        walletChallenges.id,
        expired.map((challenge) => challenge.id),
      ),
    );
  }
}

function siweMessage(
  address: string,
  origin: string,
  nonce: string,
  issuedAt: string,
  expirationTime: string,
): string {
  const domain = new URL(origin).host;
  return `${domain} wants you to sign in with your Ethereum account:
${address}

Sign in to Dicebound to sync your cloud save.

URI: ${origin}/api/wallet
Version: 1
Chain ID: ${WALLET_CHAIN_ID}
Nonce: ${nonce}
Issued At: ${issuedAt}
Expiration Time: ${expirationTime}`;
}

function outputSave(row: {
  save: unknown;
  revision: number;
  updatedAt: Date | null;
}) {
  return {
    save: row.save ?? null,
    revision: row.revision,
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
  };
}

async function findSave(address: string) {
  const rows = await db
    .select({
      save: walletSaves.save,
      revision: walletSaves.revision,
      updatedAt: walletSaves.updatedAt,
    })
    .from(walletSaves)
    .where(eq(walletSaves.address, address))
    .limit(1);
  return rows[0] ?? null;
}

async function findSession(req: Request) {
  const cookie = parseSessionCookie(req);
  if (!cookie) return null;
  const rows = await db
    .select()
    .from(walletSessions)
    .where(eq(walletSessions.tokenHash, hashOpaqueToken(cookie)))
    .limit(1);
  const session = rows[0];
  if (
    !session ||
    session.revokedAt !== null ||
    session.expiresAt.getTime() <= Date.now()
  ) {
    return null;
  }
  return session;
}

function requireWalletAddress(
  req: Request,
  res: Response,
  sessionAddress: string,
): boolean {
  const requested = normalizeAddress(req.get("x-wallet-address"));
  if (!requested || requested !== sessionAddress) {
    sendJsonError(res, 403, "wallet_mismatch");
    return false;
  }
  return true;
}

function requireCsrf(
  req: Request,
  res: Response,
  csrfToken: string,
): boolean {
  const supplied = req.get("x-csrf-token");
  if (!supplied || supplied.length > 256 || !constantTimeEqual(supplied, csrfToken)) {
    sendJsonError(res, 403, "csrf_failed");
    return false;
  }
  return true;
}

function unauthorized(req: Request, res: Response): void {
  setSessionCookie(req, res, null);
  sendJsonError(res, 401, "unauthorized");
}

router.post(
  "/wallet/challenge",
  asyncRoute(async (req, res) => {
    if (!requestIsTrusted(req, res)) return;
    const ip = clientIp(req);
    if (!allowRate(`challenge:${ip}`, 10, 60_000)) {
      sendJsonError(res, 429, "rate_limited");
      return;
    }
    const body = bodyRecord(req);
    const address = normalizeAddress(body?.address);
    if (!address || body?.chainId !== WALLET_CHAIN_ID) {
      sendJsonError(res, 400, "invalid_challenge_request");
      return;
    }

    await cleanExpiredChallenges();
    const origin = requestOrigin(req);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + CHALLENGE_TTL_MS);
    const nonce = newNonce();
    const message = siweMessage(
      address,
      origin,
      nonce,
      now.toISOString(),
      expiresAt.toISOString(),
    );
    const challengeId = newChallengeId();
    await db.insert(walletChallenges).values({
      id: challengeId,
      address,
      chainId: WALLET_CHAIN_ID,
      message,
      origin,
      nonceHash: hashNonce(nonce),
      expiresAt,
      requestIp: ip,
    });
    res.status(200).json({ challengeId, message });
  }),
);

router.post(
  "/wallet/verify",
  asyncRoute(async (req, res) => {
    if (!requestIsTrusted(req, res)) return;
    const ip = clientIp(req);
    if (!allowRate(`verify:${ip}`, 20, 60_000)) {
      sendJsonError(res, 429, "rate_limited");
      return;
    }
    const body = bodyRecord(req);
    const challengeId = body?.challengeId;
    const signature = body?.signature;
    if (
      typeof challengeId !== "string" ||
      challengeId.length > 100 ||
      typeof signature !== "string" ||
      signature.length > 1_024 ||
      !/^0x(?:[0-9a-fA-F]{2})+$/.test(signature)
    ) {
      sendJsonError(res, 400, "invalid_verify_request");
      return;
    }

    await cleanExpiredChallenges();
    const challenges = await db
      .select()
      .from(walletChallenges)
      .where(eq(walletChallenges.id, challengeId))
      .limit(1);
    const challenge = challenges[0];
    if (!challenge) {
      sendJsonError(res, 401, "invalid_challenge");
      return;
    }
    if (challenge.chainId !== WALLET_CHAIN_ID) {
      sendJsonError(res, 401, "chain_mismatch");
      return;
    }
    if (challenge.consumedAt !== null) {
      sendJsonError(res, 401, "challenge_consumed");
      return;
    }
    if (challenge.expiresAt.getTime() <= Date.now()) {
      sendJsonError(res, 401, "challenge_expired");
      return;
    }
    if (challenge.origin !== requestOrigin(req)) {
      sendJsonError(res, 403, "origin_not_allowed");
      return;
    }

    let validSignature = false;
    try {
      // verifyMessage recovers an EOA locally.  No EIP-1271/client transport
      // is supplied, so this endpoint intentionally makes no contract-wallet
      // support claim.
      validSignature = await verifyMessage({
        address: challenge.address as Address,
        message: challenge.message,
        signature: signature as Hex,
      });
    } catch {
      validSignature = false;
    }
    if (!validSignature) {
      sendJsonError(res, 401, "invalid_signature");
      return;
    }

    // Signature verification precedes this conditional update.  Only one
    // concurrent verifier can consume a challenge.
    const consumed = await db
      .update(walletChallenges)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(walletChallenges.id, challenge.id),
          isNull(walletChallenges.consumedAt),
          gt(walletChallenges.expiresAt, new Date()),
        ),
      )
      .returning({ id: walletChallenges.id });
    if (consumed.length !== 1) {
      sendJsonError(res, 401, "challenge_consumed");
      return;
    }

    const oldCookie = parseSessionCookie(req);
    const token = newOpaqueToken();
    const csrfToken = newOpaqueToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await db.transaction(async (tx) => {
      if (oldCookie) {
        await tx
          .update(walletSessions)
          .set({ revokedAt: new Date() })
          .where(
            and(
              eq(walletSessions.tokenHash, hashOpaqueToken(oldCookie)),
              isNull(walletSessions.revokedAt),
            ),
          );
      }
      await tx.insert(walletSessions).values({
        id: newChallengeId(),
        tokenHash: hashOpaqueToken(token),
        address: challenge.address,
        chainId: WALLET_CHAIN_ID,
        csrfToken,
        expiresAt,
      });
    });

    setSessionCookie(req, res, token);
    res.json({
      address: challenge.address,
      chainId: WALLET_CHAIN_ID,
      csrfToken,
    });
  }),
);

router.get(
  "/wallet/session",
  asyncRoute(async (req, res) => {
    if (!requestIsTrusted(req, res)) return;
    const session = await findSession(req);
    if (!session) {
      unauthorized(req, res);
      return;
    }
    res.json({
      address: session.address,
      chainId: session.chainId,
      csrfToken: session.csrfToken,
    });
  }),
);

router.get(
  "/wallet/save",
  asyncRoute(async (req, res) => {
    if (!requestIsTrusted(req, res)) return;
    const session = await findSession(req);
    if (!session) {
      unauthorized(req, res);
      return;
    }
    if (!requireWalletAddress(req, res, session.address)) return;
    const row = await findSave(session.address);
    res.json(
      row
        ? outputSave(row)
        : { save: null, revision: 0, updatedAt: null },
    );
  }),
);

router.put(
  "/wallet/save",
  asyncRoute(async (req, res) => {
    if (!requestIsTrusted(req, res)) return;
    const session = await findSession(req);
    if (!session) {
      unauthorized(req, res);
      return;
    }
    if (!requireWalletAddress(req, res, session.address)) return;
    if (!requireCsrf(req, res, session.csrfToken)) return;

    const body = bodyRecord(req);
    const expectedRevision = body?.expectedRevision;
    if (
      !body ||
      typeof expectedRevision !== "number" ||
      !Number.isInteger(expectedRevision) ||
      expectedRevision < 0 ||
      expectedRevision > 2_000_000_000
    ) {
      sendJsonError(res, 400, "invalid_save_request");
      return;
    }
    const validation = validateGameStateV4(body.save);
    if (!validation.ok) {
      sendJsonError(
        res,
        validation.reason === "save_too_large" ? 413 : 400,
        validation.reason,
      );
      return;
    }

    const updatedAt = new Date();
    if (expectedRevision === 0) {
      const inserted = await db
        .insert(walletSaves)
        .values({
          address: session.address,
          save: validation.value,
          revision: 1,
          updatedAt,
        })
        .onConflictDoNothing()
        .returning({
          save: walletSaves.save,
          revision: walletSaves.revision,
          updatedAt: walletSaves.updatedAt,
        });
      if (inserted.length > 0) {
        res.json(outputSave(inserted[0]));
        return;
      }
    }

    // If an insert raced an existing row, the conditional update below is
    // still the single compare-and-swap operation that decides the winner.
    const updated = await db
      .update(walletSaves)
      .set({
        save: validation.value,
        revision: sql`${walletSaves.revision} + 1`,
        updatedAt,
      })
      .where(
        and(
          eq(walletSaves.address, session.address),
          eq(walletSaves.revision, expectedRevision),
        ),
      )
      .returning({
        save: walletSaves.save,
        revision: walletSaves.revision,
        updatedAt: walletSaves.updatedAt,
      });
    if (updated.length > 0) {
      res.json(outputSave(updated[0]));
      return;
    }

    const current = await findSave(session.address);
    res.status(409).json({
      error: "revision_conflict",
      ...(current
        ? outputSave(current)
        : { save: null, revision: 0, updatedAt: null }),
    });
  }),
);

router.post(
  "/wallet/logout",
  asyncRoute(async (req, res) => {
    if (!requestIsTrusted(req, res)) return;
    const session = await findSession(req);
    if (!session) {
      unauthorized(req, res);
      return;
    }
    if (
      !requireWalletAddress(req, res, session.address) ||
      !requireCsrf(req, res, session.csrfToken)
    ) {
      return;
    }
    await db
      .update(walletSessions)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(walletSessions.id, session.id),
          isNull(walletSessions.revokedAt),
        ),
      );
    setSessionCookie(req, res, null);
    res.json({ ok: true });
  }),
);

router.get(
  "/wallet/catalog",
  asyncRoute(async (req, res) => {
    if (!requestIsTrusted(req, res)) return;
    const session = await findSession(req);
    if (!session) {
      unauthorized(req, res);
      return;
    }
    if (!requireWalletAddress(req, res, session.address)) return;
    const payoutConfigured = isPayoutConfigured();
    const items = await Promise.all(
      (["GLD", "SLV"] as const).map(async (symbol) => {
        try {
          const item = catalogItem(await getTokenQuote(symbol));
          return { ...item, available: item.available && payoutConfigured };
        } catch {
          return {
            symbol,
            tokenAddress: symbol === "GLD"
              ? "0xc9a981fee1f9dec688bb123ccdecc63d0debfc4e"
              : "0x411efb0e7f985935daec3d4c3ebaea0d0ad7d89f",
            decimals: 18,
            gemCost: 100,
            usdValue: "5",
            tokenAmount: "0",
            quotePrice: "",
            quoteSource: "Massive previous-day aggregate",
            quoteTimestamp: new Date(0).toISOString(),
            quoteDelayed: "previous-close",
            delayed: true,
            available: false,
          };
        }
      }),
    );
    res.json(GetTokenCatalogResponse.parse({ items }));
  }),
);

router.get(
  "/wallet/inventory",
  asyncRoute(async (req, res) => {
    if (!requestIsTrusted(req, res)) return;
    const session = await findSession(req);
    if (!session) {
      unauthorized(req, res);
      return;
    }
    if (!requireWalletAddress(req, res, session.address)) return;
    res.json(GetTokenInventoryResponse.parse({ items: await getInventory() }));
  }),
);

router.get(
  "/wallet/rewards",
  asyncRoute(async (req, res) => {
    if (!requestIsTrusted(req, res)) return;
    const session = await findSession(req);
    if (!session) {
      unauthorized(req, res);
      return;
    }
    if (!requireWalletAddress(req, res, session.address)) return;
    res.json(await getTokenRewards(session.address));
  }),
);

router.post(
  "/wallet/rewards/claim",
  asyncRoute(async (req, res) => {
    if (!requestIsTrusted(req, res)) return;
    const session = await findSession(req);
    if (!session) {
      unauthorized(req, res);
      return;
    }
    if (!requireWalletAddress(req, res, session.address) || !requireCsrf(req, res, session.csrfToken)) return;
    try {
      res.json(await claimTokenRewards(session.address));
    } catch (error) {
      if (error instanceof TokenRewardError) {
        sendJsonError(res, error.status, error.code);
        return;
      }
      throw error;
    }
  }),
);

router.post(
  "/wallet/purchase",
  asyncRoute(async (req, res) => {
    if (!requestIsTrusted(req, res)) return;
    const session = await findSession(req);
    if (!session) {
      unauthorized(req, res);
      return;
    }
    if (
      !requireWalletAddress(req, res, session.address) ||
      !requireCsrf(req, res, session.csrfToken)
    ) return;
    const body = bodyRecord(req);
    const idempotencyKey = req.get("idempotency-key");
    const parsedBody = PurchaseTokenBody.safeParse(body);
    if (
      !parsedBody.success ||
      typeof idempotencyKey !== "string" ||
      !/^[\x21-\x7e]{1,200}$/.test(idempotencyKey)
    ) {
      sendJsonError(res, 400, "invalid_purchase_request");
      return;
    }
    try {
      res.json(PurchaseTokenResponse.parse(
        await purchaseToken(session.address, parsedBody.data.symbol, idempotencyKey),
      ));
    } catch (error) {
      if (error instanceof TokenPurchaseError) {
        sendJsonError(res, error.status, error.code);
        return;
      }
      throw error;
    }
  }),
);

router.get(
  "/wallet/redeemable-gems",
  asyncRoute(async (req, res) => {
    if (!requestIsTrusted(req, res)) return;
    const session = await findSession(req);
    if (!session) {
      unauthorized(req, res);
      return;
    }
    if (!requireWalletAddress(req, res, session.address)) return;
    res.json(GetRedeemableGemBalanceResponse.parse({
      balance: await getRedeemableGemBalance(session.address),
    }));
  }),
);

router.get(
  "/wallet/purchase/:id",
  asyncRoute(async (req, res) => {
    if (!requestIsTrusted(req, res)) return;
    const session = await findSession(req);
    if (!session) {
      unauthorized(req, res);
      return;
    }
    if (!requireWalletAddress(req, res, session.address)) return;
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id || id.length > 100) {
      sendJsonError(res, 400, "invalid_purchase_id");
      return;
    }
    const purchase = await getTokenPurchase(session.address, id);
    if (!purchase) {
      sendJsonError(res, 404, "purchase_not_found");
      return;
    }
    res.json(GetTokenPurchaseResponse.parse(purchase));
  }),
);

router.get(
  "/wallet/purchases/pending",
  asyncRoute(async (req, res) => {
    if (!requestIsTrusted(req, res)) return;
    const session = await findSession(req);
    if (!session) {
      unauthorized(req, res);
      return;
    }
    if (!requireWalletAddress(req, res, session.address)) return;
    res.json(GetPendingTokenPurchasesResponse.parse({
      items: await getPendingTokenPurchases(session.address),
    }));
  }),
);

function hasOnlyKeys(body: Record<string, unknown> | null, keys: string[]): boolean {
  return body !== null &&
    Object.keys(body).length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(body, key));
}

function runIdParam(req: Request): string | null {
  const runId = Array.isArray(req.params.runId) ? req.params.runId[0] : req.params.runId;
  return typeof runId === "string" && /^[0-9a-f-]{20,100}$/i.test(runId) ? runId : null;
}

function sendRunError(res: Response, error: unknown): void {
  if (error instanceof RunError) {
    res.status(error.status).json({
      error: error.code,
      ...(error.details ? { current: error.details } : {}),
    });
    return;
  }
  throw error;
}

router.post(
  "/wallet/runs/start",
  asyncRoute(async (req, res) => {
    if (!requestIsTrusted(req, res)) return;
    const session = await findSession(req);
    if (!session) {
      unauthorized(req, res);
      return;
    }
    if (
      !requireWalletAddress(req, res, session.address) ||
      !requireCsrf(req, res, session.csrfToken)
    ) return;
    const body = bodyRecord(req);
    if (
      !hasOnlyKeys(body, ["clientRequestId", "character"]) ||
      typeof body?.clientRequestId !== "string" ||
      !/^[\x21-\x7e]{1,200}$/.test(body.clientRequestId) ||
      !isCharacterChoice(body.character)
    ) {
      sendJsonError(res, 400, "invalid_run_start");
      return;
    }
    try {
      res.status(201).json(await startRun(
        session.address,
        body.character,
        body.clientRequestId,
      ));
    } catch (error) {
      sendRunError(res, error);
    }
  }),
);

router.get(
  "/wallet/runs/current",
  asyncRoute(async (req, res) => {
    if (!requestIsTrusted(req, res)) return;
    const session = await findSession(req);
    if (!session) {
      unauthorized(req, res);
      return;
    }
    if (!requireWalletAddress(req, res, session.address)) return;
    let run;
    try {
      run = await getCurrentRun(session.address);
    } catch (error) {
      sendRunError(res, error);
      return;
    }
    if (!run) {
      sendJsonError(res, 404, "run_not_found");
      return;
    }
    res.json(run);
  }),
);

router.get(
  "/wallet/runs/:runId/replay",
  asyncRoute(async (req, res) => {
    if (!requestIsTrusted(req, res)) return;
    const session = await findSession(req);
    if (!session) {
      unauthorized(req, res);
      return;
    }
    if (!requireWalletAddress(req, res, session.address)) return;
    const runId = runIdParam(req);
    if (!runId) {
      sendJsonError(res, 400, "invalid_run_id");
      return;
    }
    let replay;
    try {
      replay = await getReplay(session.address, runId);
    } catch (error) {
      sendRunError(res, error);
      return;
    }
    if (!replay) {
      sendJsonError(res, 404, "run_not_found");
      return;
    }
    res.json(replay);
  }),
);

router.get(
  "/wallet/runs/:runId",
  asyncRoute(async (req, res) => {
    if (!requestIsTrusted(req, res)) return;
    const session = await findSession(req);
    if (!session) {
      unauthorized(req, res);
      return;
    }
    if (!requireWalletAddress(req, res, session.address)) return;
    const runId = runIdParam(req);
    if (!runId) {
      sendJsonError(res, 400, "invalid_run_id");
      return;
    }
    let run;
    try {
      run = await getRun(session.address, runId);
    } catch (error) {
      sendRunError(res, error);
      return;
    }
    if (!run) {
      sendJsonError(res, 404, "run_not_found");
      return;
    }
    res.json(run);
  }),
);

router.post(
  "/wallet/runs/:runId/action",
  asyncRoute(async (req, res) => {
    if (!requestIsTrusted(req, res)) return;
    const session = await findSession(req);
    if (!session) {
      unauthorized(req, res);
      return;
    }
    if (
      !requireWalletAddress(req, res, session.address) ||
      !requireCsrf(req, res, session.csrfToken)
    ) return;
    const runId = runIdParam(req);
    const body = bodyRecord(req);
    if (
      !runId ||
      !hasOnlyKeys(body, ["clientRequestId", "expectedSequence", "action"]) ||
      typeof body?.clientRequestId !== "string" ||
      !/^[\x21-\x7e]{1,200}$/.test(body.clientRequestId) ||
      typeof body.expectedSequence !== "number" ||
      !Number.isInteger(body.expectedSequence) ||
      body.expectedSequence < 0 ||
      body.expectedSequence > 2_000_000_000 ||
      !isRunAction(body.action)
    ) {
      sendJsonError(res, 400, "invalid_run_action");
      return;
    }
    try {
      res.json(await submitAction(
        session.address,
        runId,
        body.clientRequestId,
        body.expectedSequence,
        body.action,
      ));
    } catch (error) {
      sendRunError(res, error);
    }
  }),
);

router.use("/wallet", (_req, res) => {
  sendJsonError(res, 404, "not_found");
});

export default router;