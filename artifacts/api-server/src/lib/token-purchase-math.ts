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

/** Returns floor(USD10 / quote price) in token base units without floats. */
export function tokenAmountForPrice(price: string): string {
  const parsed = parseDecimal(price);
  if (parsed.integer <= 0n) throw new InvalidTokenPriceError("The reference price was invalid.");
  const amount = (10n * 10n ** 18n * parsed.scale) / parsed.integer;
  if (amount <= 0n) throw new InvalidTokenPriceError("The reference price was invalid.");
  return amount.toString();
}