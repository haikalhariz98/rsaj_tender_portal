import { isIP } from "node:net";

/**
 * What the product knows about where a request came from (ADR 0034 D11).
 *
 * The source address is read from `X-Forwarded-For` only where the deployment says how many proxies it sits behind
 * (`TRUSTED_PROXY_HOPS`, deployment configuration, not customer policy). Next fills that header from the socket only when the
 * client did not send one, so with nothing said about proxies the header could be anyone's word, and the address is then
 * recorded as unknown rather than guessed. An unknown address is never throttled: it cannot be told apart from another.
 */

export interface RequestFacts {
  /// Null where it is not known (see above).
  sourceAddress: string | null;
  userAgent: string;
}

/// `TRUSTED_PROXY_HOPS` as a count of proxies that each append the address they received the request from. Null while unset or not a whole number of at least one.
export function trustedProxyHops(value: string | undefined | null): number | null {
  const v = (value ?? "").trim();
  if (!/^\d{1,2}$/.test(v)) return null;
  const n = Number(v);
  return n >= 1 ? n : null;
}

/// The client's address: the `hops`-th entry from the right of `X-Forwarded-For`, the one the outermost trusted proxy appended. Null where it is not an address.
export function clientAddress(xForwardedFor: string | null, hops: number | null): string | null {
  if (hops == null || xForwardedFor == null) return null;
  const parts = xForwardedFor.split(",").map((p) => p.trim()).filter(Boolean);
  const entry = parts[parts.length - hops];
  return entry && isIP(entry) ? entry.toLowerCase() : null;
}

const USER_AGENT_MAX = 300;

export function requestFacts(header: (name: string) => string | null, hopsSetting: string | undefined | null = process.env.TRUSTED_PROXY_HOPS): RequestFacts {
  return {
    sourceAddress: clientAddress(header("x-forwarded-for"), trustedProxyHops(hopsSetting)),
    userAgent: (header("user-agent") ?? "").slice(0, USER_AGENT_MAX),
  };
}
