import assert from "node:assert/strict";
import { test } from "node:test";
import walletRouter from "./wallet";

test("wallet router exposes no public combat issuance or transcript settlement route", () => {
  const stack = (walletRouter as unknown as {
    stack: Array<{ route?: { path?: string; methods?: Record<string, boolean> } }>;
  }).stack;
  const paths = stack
    .map((layer) => layer.route?.path)
    .filter((path): path is string => typeof path === "string");
  assert.equal(paths.some((path) => path === "/wallet/encounter-ticket"), false);
  assert.equal(paths.some((path) => path.includes("encounter-ticket")), false);
});