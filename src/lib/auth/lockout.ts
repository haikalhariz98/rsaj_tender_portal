/**
 * Lockout and address throttling (ADR 0034 D5). Both are counted in the database, so every instance of the product shares
 * one count. Nothing here reads a clock or a table: the caller passes the facts it counted.
 *
 * The same "Sign-in failed" is shown whatever the verdict, so a stranger cannot tell a wrong password from a lock from a
 * name that does not exist. The sign-in log records which it was.
 */

const MINUTE = 60_000;

export interface AccountLockState {
  failedAttempts: number;
  lockedUntil: Date | null;
}

export interface LockoutPolicy {
  maxFailedAttempts: number | null;
  lockoutMinutes: number | null;
  addressThrottleAttempts: number | null;
}

export type LockoutVerdict = "ALLOW" | "LOCKED" | "THROTTLED" | "POLICY_NOT_SET";

/// Whether the lock on an account is still running. A lock that has ended is gone, and its failures with it.
export function isLocked(account: AccountLockState, now: Date): boolean {
  return account.lockedUntil != null && account.lockedUntil.getTime() > now.getTime();
}

/// The failures that still count: none once a lock has run its course.
export function effectiveFailures(account: AccountLockState, now: Date): number {
  return account.lockedUntil != null && account.lockedUntil.getTime() <= now.getTime() ? 0 : account.failedAttempts;
}

/**
 * Whether an attempt may go on to be checked. The address is judged first and without the account (an unknown name has
 * none), and before any hash is computed. `account` is null for a name that matched nothing.
 */
export function lockoutVerdict(account: AccountLockState | null, recentAddressFailures: number, policy: LockoutPolicy, now: Date): LockoutVerdict {
  if (policy.maxFailedAttempts == null || policy.lockoutMinutes == null || policy.addressThrottleAttempts == null) return "POLICY_NOT_SET";
  if (recentAddressFailures >= policy.addressThrottleAttempts) return "THROTTLED";
  if (account && isLocked(account, now)) return "LOCKED";
  return "ALLOW";
}

/// What the account row holds after one more wrong password. A failure on a locked account changes nothing: a lock is not extended by being knocked on.
export function afterFailedAttempt(account: AccountLockState, policy: Pick<LockoutPolicy, "maxFailedAttempts" | "lockoutMinutes">, now: Date): AccountLockState {
  if (policy.maxFailedAttempts == null || policy.lockoutMinutes == null) throw new Error("afterFailedAttempt needs the lockout settings: check lockoutVerdict first.");
  if (isLocked(account, now)) return { failedAttempts: account.failedAttempts, lockedUntil: account.lockedUntil };
  const failedAttempts = effectiveFailures(account, now) + 1;
  return failedAttempts >= policy.maxFailedAttempts
    ? { failedAttempts, lockedUntil: new Date(now.getTime() + policy.lockoutMinutes * MINUTE) }
    : { failedAttempts, lockedUntil: null };
}

/// A good sign-in clears the count.
export function afterSuccess(): AccountLockState {
  return { failedAttempts: 0, lockedUntil: null };
}

/// How far back the address throttle looks, as a date, for the count the caller makes.
export function throttleSince(now: Date, addressThrottleMinutes: number): Date {
  return new Date(now.getTime() - addressThrottleMinutes * MINUTE);
}
