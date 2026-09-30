import { parseSen, type Sen } from "@/lib/money";

/**
 * A line's amount worked out from its quantity and unit price, in sen, rounded half
 * up. Null unless both are figures: the form then leaves the amount for the officer
 * to type. The quantity may carry up to three decimals (2.5 m, 0.125 t); the price is
 * money, to the sen. Never negative: a line is a thing being bought.
 */
export function lineAmount(quantity: string, unitPrice: string): Sen | null {
  const q = /^(\d+)(?:\.(\d{1,3}))?$/.exec(quantity.replace(/,/g, "").trim());
  if (!q) return null;
  let price: Sen;
  try {
    price = parseSen(unitPrice);
  } catch {
    return null;
  }
  if (price < 0n) return null;
  const milli = BigInt(q[1]) * 1000n + BigInt((q[2] ?? "").padEnd(3, "0"));
  return (milli * price + 500n) / 1000n;
}
