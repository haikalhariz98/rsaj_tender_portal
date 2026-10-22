import { requestFacts } from "@/lib/auth/request";
import { createLimiter, parseConcurrency, RETRY_AFTER_SECONDS, type Limiter } from "@/lib/documents/concurrency";
import { createAddressCounter, type AddressCounter } from "@/lib/portal/register/address-limit";
import { APPLY } from "@/lib/portal/labels";

/**
 * The public form's two small reads, `/supplier/register/token` and `/supplier/register/values` (security audit L8, and the review's minor note on the code search's ILIKE). Each is
 * counted per source address, in memory per server process, and refused past so many a minute; the code search also has a cap on how many run at once, which holds whether or not the
 * address is known (while `TRUSTED_PROXY_HOPS` is unset nothing is counted per address, ADR 0034 D11). Technical bounds the deployment may raise, not the organisation's policy: the
 * submission's own limit is (RSEC-1).
 */

export const DEFAULT_REGISTER_LOOKUPS_PER_MINUTE = 120;
export const DEFAULT_MAX_CONCURRENT_REGISTER_LOOKUPS = 4;
const MINUTE_MS = 60_000;

const KEY = Symbol.for("perolehan.registerLookups");
type Held = { counter?: AddressCounter; searches?: Limiter };
function held(): Held {
  const g = globalThis as unknown as Record<symbol, Held | undefined>;
  return (g[KEY] ??= {});
}

const refused = (status: number, code: "TOO_MANY" | "BUSY", message: string, retryAfter: number) =>
  Response.json({ ok: false, code, message }, { status, headers: { "cache-control": "no-store", "Retry-After": String(retryAfter) } });

/// Counts this request against its address, and refuses it past the minute's allowance. Null: go on.
export function lookupRefusal(request: Request, route: "token" | "values", env: Readonly<Record<string, string | undefined>> = process.env): Response | null {
  const address = requestFacts((n) => request.headers.get(n)).sourceAddress;
  if (!address) return null;
  const counter = (held().counter ??= createAddressCounter());
  const key = `${route}\u0000${address}`;
  const now = Date.now();
  counter.hit(key, now);
  return counter.count(key, now, MINUTE_MS) > parseConcurrency(env.REGISTER_LOOKUPS_PER_MINUTE, DEFAULT_REGISTER_LOOKUPS_PER_MINUTE) ? refused(429, "TOO_MANY", APPLY.tooManyLookups.en, 60) : null;
}

/// A place among the code searches running now, or a refusal. Release the place when done.
export function searchSlot(env: Readonly<Record<string, string | undefined>> = process.env): { release: () => void } | { refusal: Response } {
  const limiter = (held().searches ??= createLimiter(parseConcurrency(env.REGISTER_MAX_CONCURRENT_LOOKUPS, DEFAULT_MAX_CONCURRENT_REGISTER_LOOKUPS)));
  const release = limiter.tryAcquire();
  return release ? { release } : { refusal: refused(503, "BUSY", APPLY.tooManyLookups.en, RETRY_AFTER_SECONDS) };
}
