export class InvalidTokenPriceError extends Error {}

function parseDecimal(value: string): { integer: bigint; scale: bigint } {
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
    throw new InvalidTokenPriceError("The reference price was invalid.");
  }
  const [whole, fraction = ""] = value.split(".");
  return {
    integer: BigInt(`${whole}${fraction}`),
    scale: 10n ** BigInt(fraction.length),
  };
}

/** Returns floor(USD5 / quote price) in token base units without floats. */
export function tokenAmountForPrice(price: string): string {
  return tokenAmountForUsdCents(price, 500);
}

/** Integer-safe base-unit conversion for a fixed USD-cent liability. */
export function tokenAmountForUsdCents(price: string, usdCents: number): string {
  const parsed = parseDecimal(price);
  if (parsed.integer <= 0n) throw new InvalidTokenPriceError("The reference price was invalid.");
  if (!Number.isSafeInteger(usdCents) || usdCents <= 0) {
    throw new InvalidTokenPriceError("The reward value was invalid.");
  }
  const amount = (BigInt(usdCents) * 10n ** 16n * parsed.scale) / parsed.integer;
  if (amount <= 0n) throw new InvalidTokenPriceError("The reference price was invalid.");
  return amount.toString();
}