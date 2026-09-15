import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";

export const WALLET_CHAIN_ID = 4663;
export const SESSION_COOKIE_NAME = "dicebound_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const CHALLENGE_TTL_MS = 5 * 60 * 1000;
export const MAX_SAVE_BYTES = 512 * 1024;

// The secret is read once at runtime and is never included in a response or log.
// A process-local fallback keeps local development safe when the secret has not
// been provisioned yet; configured deployments use SESSION_SECRET.
const runtimeSecret =
  process.env.SESSION_SECRET ?? randomBytes(32).toString("hex");

/** Internal trust-root MAC; never expose the runtime secret or this MAC key. */
export function trustRootMac(payload: string): string {
  return createHmac("sha256", runtimeSecret).update(payload).digest("hex");
}

export function newOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function newNonce(): string {
  // EIP-4361's nonce grammar is alphanumeric; hex avoids base64url's "-/_".
  return randomBytes(16).toString("hex");
}

export function newChallengeId(): string {
  return randomUUID();
}

export function hashOpaqueToken(token: string): string {
  return createHmac("sha256", runtimeSecret).update(token).digest("hex");
}

export function hashNonce(nonce: string): string {
  return createHash("sha256").update(nonce).digest("hex");
}

export function constantTimeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function parseSessionCookie(req: Request): string | null {
  const header = req.headers.cookie;
  if (!header) return null;

  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    if (name !== SESSION_COOKIE_NAME) continue;
    const value = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(value) || null;
    } catch {
      return null;
    }
  }
  return null;
}

export function setSessionCookie(
  req: Request,
  res: Response,
  value: string | null,
): void {
  const secure = isHttpsRequest(req);
  const pieces = [
    `${SESSION_COOKIE_NAME}=${value ? encodeURIComponent(value) : ""}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    value ? `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}` : "Max-Age=0",
  ];
  if (!value) pieces.push("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
  if (secure) pieces.push("Secure");
  res.append("Set-Cookie", pieces.join("; "));
}

export function isHttpsRequest(req: Request): boolean {
  if (process.env.NODE_ENV === "production") return true;
  const origin = req.get("origin");
  if (!origin || !isTrustedOrigin(req, origin)) return false;
  try {
    return new URL(origin).protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeOrigin(value: string, bareDomain = false): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const candidate =
    bareDomain && !/^https?:\/\//i.test(trimmed)
      ? `https://${trimmed}`
      : trimmed;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function configuredOrigins(): Set<string> {
  const origins = new Set<string>();
  for (const value of (process.env.WALLET_ALLOWED_ORIGINS ?? "").split(",")) {
    const normalized = normalizeOrigin(value);
    if (normalized) origins.add(normalized);
  }
  for (const value of (process.env.REPLIT_DOMAINS ?? "").split(",")) {
    const normalized = normalizeOrigin(value, true);
    if (normalized?.startsWith("https://")) origins.add(normalized);
  }
  if (process.env.NODE_ENV !== "production") {
    const devDomain = process.env.REPLIT_DEV_DOMAIN;
    if (devDomain) {
      const normalized = normalizeOrigin(devDomain, true);
      if (normalized?.startsWith("https://")) origins.add(normalized);
    }
    for (const host of ["localhost", "127.0.0.1"]) {
      for (const port of ["", "8080", "5000"]) {
        const suffix = port ? `:${port}` : "";
        origins.add(`http://${host}${suffix}`);
        origins.add(`https://${host}${suffix}`);
      }
    }
  }
  return origins;
}

/**
 * Allow only explicitly configured origins. Request Host and every forwarded
 * header are deliberately excluded: a client-controlled X-Forwarded-Host
 * must never turn into credentialed CORS authorization.
 */
export function isTrustedOrigin(req: Request, origin: string | undefined): boolean {
  void req;
  if (!origin) return true;
  if (origin === "null") return false;

  const normalizedOrigin = normalizeOrigin(origin);
  return normalizedOrigin !== null && configuredOrigins().has(normalizedOrigin);
}

export function requestOrigin(req: Request): string {
  const supplied = req.get("origin");
  if (supplied && isTrustedOrigin(req, supplied)) {
    return new URL(supplied).origin;
  }

  // State-changing wallet routes require a valid Origin. This fallback is
  // retained for diagnostics/GET callers and intentionally uses no forwarded
  // header.
  const host = req.get("host") ?? "localhost";
  return `http://${host}`;
}

export function requestDomain(req: Request): string {
  return new URL(requestOrigin(req)).host;
}

export function clientIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

export function sendJsonError(
  res: Response,
  status: number,
  error: string,
): void {
  res.status(status).json({ error });
}