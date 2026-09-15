import assert from "node:assert/strict";
import test from "node:test";
import { tokenAmountForPrice } from "./token-purchase-math";

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