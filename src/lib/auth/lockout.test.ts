import { describe, expect, it } from "vitest";

import { afterFailedAttempt, afterSuccess, effectiveFailures, isLocked, lockoutVerdict, throttleSince, type AccountLockState } from "./lockout";

const at = (iso: string) => new Date(`2026-10-06T${iso}:00.000Z`);
const policy = { maxFailedAttempts: 5, lockoutMinutes: 15, addressThrottleAttempts: 10 };
const fresh: AccountLockState = { failedAttempts: 0, lockedUntil: null };

describe("lockoutVerdict", () => {
  it("allows a clean account from a quiet address", () => {
    expect(lockoutVerdict(fresh, 0, policy, at("09:00"))).toBe("ALLOW");
    expect(lockoutVerdict(null, 0, policy, at("09:00"))).toBe("ALLOW");
  });

  it("holds an address back at its limit, before looking at any account, and for a name that matched none", () => {
    expect(lockoutVerdict(null, 9, policy, at("09:00"))).toBe("ALLOW");
    expect(lockoutVerdict(null, 10, policy, at("09:00"))).toBe("THROTTLED");
    expect(lockoutVerdict(fresh, 10, policy, at("09:00"))).toBe("THROTTLED");
  });

  it("locks an account until its time, and the lock ends when its window does", () => {
    const locked = { failedAttempts: 5, lockedUntil: at("09:15") };
    expect(lockoutVerdict(locked, 0, policy, at("09:14"))).toBe("LOCKED");
    expect(lockoutVerdict(locked, 0, policy, at("09:15"))).toBe("ALLOW");
  });

  it("refuses while any setting it needs is unset", () => {
    expect(lockoutVerdict(fresh, 0, { ...policy, maxFailedAttempts: null }, at("09:00"))).toBe("POLICY_NOT_SET");
    expect(lockoutVerdict(fresh, 0, { ...policy, lockoutMinutes: null }, at("09:00"))).toBe("POLICY_NOT_SET");
    expect(lockoutVerdict(fresh, 0, { ...policy, addressThrottleAttempts: null }, at("09:00"))).toBe("POLICY_NOT_SET");
  });
});

describe("afterFailedAttempt", () => {
  it("counts up to the limit, then locks for the window", () => {
    let account = fresh;
    for (let n = 1; n <= 4; n++) {
      account = afterFailedAttempt(account, policy, at("09:00"));
      expect(account).toEqual({ failedAttempts: n, lockedUntil: null });
    }
    account = afterFailedAttempt(account, policy, at("09:00"));
    expect(account).toEqual({ failedAttempts: 5, lockedUntil: at("09:15") });
  });

  it("does not extend a lock that is running", () => {
    const locked = { failedAttempts: 5, lockedUntil: at("09:15") };
    expect(afterFailedAttempt(locked, policy, at("09:10"))).toEqual(locked);
  });

  it("starts the count again once a lock has run its course", () => {
    const ended = { failedAttempts: 5, lockedUntil: at("09:15") };
    expect(effectiveFailures(ended, at("09:20"))).toBe(0);
    expect(afterFailedAttempt(ended, policy, at("09:20"))).toEqual({ failedAttempts: 1, lockedUntil: null });
  });

  it("needs the settings it counts against", () => {
    expect(() => afterFailedAttempt(fresh, { maxFailedAttempts: null, lockoutMinutes: 15 }, at("09:00"))).toThrow();
  });
});

describe("the rest", () => {
  it("a good sign-in clears the count", () => {
    expect(afterSuccess()).toEqual({ failedAttempts: 0, lockedUntil: null });
  });
  it("isLocked is false at the instant the lock ends", () => {
    expect(isLocked({ failedAttempts: 5, lockedUntil: at("09:15") }, at("09:15"))).toBe(false);
  });
  it("looks back the throttle window", () => {
    expect(throttleSince(at("09:30"), 30)).toEqual(at("09:00"));
  });
});
