import assert from "node:assert/strict";
import test from "node:test";
import type { Request, Response } from "express";
import {
  isHttpsRequest,
  isTrustedOrigin,
  setSessionCookie,
} from "./wallet-security";

function fakeRequest(headers: Record<string, string>): Request {
  const normalized = new Map(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]),
  );
  return {
    get(name: string) {
      return normalized.get(name.toLowerCase());
    },
    protocol: "http",
    headers: {},
  } as unknown as Request;
}

test("forwarded host cannot authorize an unconfigured Origin", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousAllowed = process.env.WALLET_ALLOWED_ORIGINS;
  const previousDomains = process.env.REPLIT_DOMAINS;
  const previousDevDomain = process.env.REPLIT_DEV_DOMAIN;
  try {
    process.env.NODE_ENV = "development";
    delete process.env.WALLET_ALLOWED_ORIGINS;
    delete process.env.REPLIT_DOMAINS;
    delete process.env.REPLIT_DEV_DOMAIN;
    const request = fakeRequest({
      Origin: "https://evil.invalid",
      "X-Forwarded-Host": "evil.invalid",
    });
    assert.equal(isTrustedOrigin(request, request.get("origin")), false);
    assert.equal(
      isTrustedOrigin(request, "https://evil.invalid"),
      false,
      "the request's forwarded host must not authorize the evil Origin",
    );
    assert.equal(
      isTrustedOrigin(fakeRequest({ Origin: "http://localhost:8080" }), "http://localhost:8080"),
      true,
    );
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousAllowed === undefined) delete process.env.WALLET_ALLOWED_ORIGINS;
    else process.env.WALLET_ALLOWED_ORIGINS = previousAllowed;
    if (previousDomains === undefined) delete process.env.REPLIT_DOMAINS;
    else process.env.REPLIT_DOMAINS = previousDomains;
    if (previousDevDomain === undefined) delete process.env.REPLIT_DEV_DOMAIN;
    else process.env.REPLIT_DEV_DOMAIN = previousDevDomain;
  }
});

test("production session cookies are Secure regardless of proxy protocol", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const appended: string[] = [];
  try {
    process.env.NODE_ENV = "production";
    setSessionCookie(
      fakeRequest({ Origin: "http://localhost:8080" }),
      { append: (_name: string, value: string) => appended.push(value) } as unknown as Response,
      "opaque-test-token",
    );
    assert.equal(isHttpsRequest(fakeRequest({ Origin: "http://localhost:8080" })), true);
    assert.equal(appended.length, 1);
    assert.match(appended[0], /;\s*Secure(?:;|$)/i);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});