/**
 * RSEC-1(a) (security audit H2): how many submissions the public registration takes from one source address in a window (`SupplierPolicy.portalAddressAttempts` and
 * `portalAddressMinutes`, set per organisation through the two-person path). Every submission that reaches the route is counted, refused or received. The count is kept in memory, per
 * server process: no table of addresses is written, a restart clears it, and with several processes each counts its own (the settings screen says so). While the address is unknown
 * (`TRUSTED_PROXY_HOPS` unset, ADR 0034 D11) nothing is counted or refused, and the screen says the limit is set but not applied, never that it is met.
 */

export interface AddressLimit {
  attempts: number | null;
  minutes: number | null;
}

/// The figures an officer may set. The attempts mirror sign-in's address throttle; the window runs to a week.
export const ADDRESS_LIMIT_BOUNDS = { attempts: { min: 1, max: 10_000 }, minutes: { min: 1, max: 10_080 } } as const;

/// What the limit does for this deployment: not set (the register is closed), set but not applied (the address is unknown), or applied.
export type AddressLimitState = "NOT_SET" | "NOT_APPLIED" | "APPLIED";

export function addressLimitState(limit: AddressLimit, addressKnown: boolean): AddressLimitState {
  if (limit.attempts == null || limit.minutes == null) return "NOT_SET";
  return addressKnown ? "APPLIED" : "NOT_APPLIED";
}

/// Whether this submission is over the limit: the submissions counted from its address in the window, itself included. Never while the address is unknown or the limit unset.
export function overAddressLimit(counted: number, limit: AddressLimit, address: string | null): boolean {
  if (address == null || limit.attempts == null || limit.minutes == null) return false;
  return counted > limit.attempts;
}

/// Technical bounds on the counter's memory, not policy: the most addresses held at once (the least recently seen goes first) and the most moments held for one address (the attempts'
/// own ceiling, so a count is never cut short of a limit an officer may set).
export const COUNTER_MAX_ADDRESSES = 10_000;
const COUNTER_MAX_PER_ADDRESS = ADDRESS_LIMIT_BOUNDS.attempts.max + 1;
/// The longest window the counter keeps moments for, before it has been told the organisation's.
const LONGEST_WINDOW_MS = ADDRESS_LIMIT_BOUNDS.minutes.max * 60_000;

export interface AddressCounter {
  /// One submission from this address, now.
  hit(address: string, nowMs: number): void;
  /// The submissions from this address in the window that ends now.
  count(address: string, nowMs: number, windowMs: number): number;
  /// How many addresses are held.
  size(): number;
}

export function createAddressCounter(maxAddresses = COUNTER_MAX_ADDRESSES): AddressCounter {
  const seen = new Map<string, number[]>();
  const prune = (list: number[], since: number) => {
    let i = 0;
    while (i < list.length && list[i]! <= since) i += 1;
    if (i > 0) list.splice(0, i);
  };
  return {
    hit(address, nowMs) {
      const list = seen.get(address) ?? [];
      // Moved to the end: the Map's order is then the order addresses were last seen.
      seen.delete(address);
      prune(list, nowMs - LONGEST_WINDOW_MS);
      list.push(nowMs);
      if (list.length > COUNTER_MAX_PER_ADDRESS) list.splice(0, list.length - COUNTER_MAX_PER_ADDRESS);
      seen.set(address, list);
      while (seen.size > maxAddresses) seen.delete(seen.keys().next().value!);
    },
    count(address, nowMs, windowMs) {
      const list = seen.get(address);
      if (!list) return 0;
      prune(list, nowMs - windowMs);
      return list.length;
    },
    size: () => seen.size,
  };
}

const KEY = Symbol.for("perolehan.registerAddressCounter");
/// The process's one counter, held on globalThis so a reloaded module in development shares it.
export function registerAddressCounter(): AddressCounter {
  const g = globalThis as unknown as Record<symbol, AddressCounter | undefined>;
  return (g[KEY] ??= createAddressCounter());
}
