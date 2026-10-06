import { describe, expect, it } from "vitest";

import { absoluteEnd, concurrentSessionPlan, cookieMaxAgeSeconds, sessionVerdict, touchDue } from "./session-rules";

const at = (iso: string) => new Date(`2026-10-06T${iso}:00.000Z`);
const MIN = 60_000;

const session = (over: Partial<Parameters<typeof sessionVerdict>[0]> = {}) => ({
  createdAt: at("08:00"),
  lastSeenAt: at("09:00"),
  absoluteExpiresAt: at("16:00"),
  revokedAt: null,
  ...over,
});
const limits = { idleMinutes: 30, absoluteMinutes: 480 };

describe("sessionVerdict", () => {
  it("is valid inside both limits", () => {
    expect(sessionVerdict(session(), limits, at("09:29"))).toBe("VALID");
  });

  // Review fix (Phase 1a): last-seen is written at most once a minute (TOUCH_INTERVAL_MS), so it can trail the last request by up to a minute. The
  // verdict allows that minute on top of the limit, so an active person is never ended early. The boundary this test held ("09:30") moved to 09:31.
  it("ends at the idle limit plus the one touch interval last-seen can trail by, to the minute", () => {
    expect(sessionVerdict(session(), limits, at("09:30"))).toBe("VALID");
    expect(sessionVerdict(session(), limits, new Date(at("09:31").getTime() - 1))).toBe("VALID");
    expect(sessionVerdict(session(), limits, at("09:31"))).toBe("IDLE");
  });

  it("never ends a person who is active inside the limit, however small the limit and however seldom last-seen is written", () => {
    // Idle limit of one minute; a request every 30 seconds, last-seen written only when a minute has passed since it was.
    const limit = { idleMinutes: 1, absoluteMinutes: 480 };
    let lastSeenAt = at("09:00");
    for (let seconds = 30; seconds <= 600; seconds += 30) {
      const now = new Date(at("09:00").getTime() + seconds * 1000);
      expect(sessionVerdict(session({ lastSeenAt }), limit, now), `request at ${seconds}s`).toBe("VALID");
      if (touchDue(lastSeenAt, now)) lastSeenAt = now;
    }
  });

  it("ends at the absolute limit however recently it was used", () => {
    const s = session({ lastSeenAt: at("15:59") });
    expect(sessionVerdict(s, limits, at("15:59"))).toBe("VALID");
    expect(sessionVerdict(s, limits, at("16:00"))).toBe("ABSOLUTE");
  });

  it("says absolute before idle: a session past both can never come back", () => {
    expect(sessionVerdict(session(), limits, at("20:00"))).toBe("ABSOLUTE");
  });

  it("is revoked once revoked, whatever the clock says", () => {
    expect(sessionVerdict(session({ revokedAt: at("09:01") }), limits, at("09:02"))).toBe("REVOKED");
    expect(sessionVerdict(session({ revokedAt: at("09:01") }), { idleMinutes: null, absoluteMinutes: null }, at("09:02"))).toBe("REVOKED");
  });

  it("refuses to judge against a limit nobody set", () => {
    expect(sessionVerdict(session(), { idleMinutes: null, absoluteMinutes: 480 }, at("09:01"))).toBe("POLICY_NOT_SET");
    expect(sessionVerdict(session(), { idleMinutes: 30, absoluteMinutes: null }, at("09:01"))).toBe("POLICY_NOT_SET");
  });

  it("lets a shortened setting end sessions already open, and a lengthened one never extend them", () => {
    expect(sessionVerdict(session(), { idleMinutes: 30, absoluteMinutes: 60 }, at("09:00"))).toBe("ABSOLUTE");
    expect(sessionVerdict(session(), { idleMinutes: 30, absoluteMinutes: 9999 }, at("16:00"))).toBe("ABSOLUTE");
  });
});

describe("session lifetime", () => {
  it("fixes the absolute end when the session is made", () => {
    expect(absoluteEnd(at("08:00"), 480)).toEqual(at("16:00"));
  });

  it("gives the cookie what is left of the session, in whole seconds, never negative", () => {
    const s = { createdAt: at("08:00"), absoluteExpiresAt: at("16:00") };
    expect(cookieMaxAgeSeconds(s, 480, at("08:00"))).toBe(8 * 3600);
    expect(cookieMaxAgeSeconds(s, 480, new Date(at("15:59").getTime() + 500))).toBe(59);
    expect(cookieMaxAgeSeconds(s, 480, at("17:00"))).toBe(0);
    expect(cookieMaxAgeSeconds(s, 60, at("08:30"))).toBe(30 * 60);
  });

  it("writes last-seen at most once a minute", () => {
    expect(touchDue(at("09:00"), new Date(at("09:00").getTime() + MIN - 1))).toBe(false);
    expect(touchDue(at("09:00"), at("09:01"))).toBe(true);
  });
});

describe("concurrentSessionPlan", () => {
  const open = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `s${i}`, createdAt: new Date(2026, 9, 6, 8, i) }));

  it("lets a session in under the limit", () => {
    expect(concurrentSessionPlan(open(2), { maxConcurrentSessions: 3, concurrentSessionAction: "REFUSE_NEW" })).toEqual({ ok: true, revoke: [] });
  });

  it("at the limit with REFUSE_NEW, refuses the new session and ends none", () => {
    expect(concurrentSessionPlan(open(3), { maxConcurrentSessions: 3, concurrentSessionAction: "REFUSE_NEW" })).toEqual({ ok: false, reason: "REFUSED_AT_LIMIT" });
  });

  it("at the limit with REVOKE_OLDEST, ends the oldest to make room", () => {
    expect(concurrentSessionPlan(open(3), { maxConcurrentSessions: 3, concurrentSessionAction: "REVOKE_OLDEST" })).toEqual({ ok: true, revoke: ["s0"] });
    expect(concurrentSessionPlan([...open(3)].reverse(), { maxConcurrentSessions: 3, concurrentSessionAction: "REVOKE_OLDEST" })).toEqual({ ok: true, revoke: ["s0"] });
  });

  it("brings an account over the limit (the setting was lowered) back under it", () => {
    expect(concurrentSessionPlan(open(5), { maxConcurrentSessions: 2, concurrentSessionAction: "REVOKE_OLDEST" })).toEqual({ ok: true, revoke: ["s0", "s1", "s2", "s3"] });
    expect(concurrentSessionPlan(open(5), { maxConcurrentSessions: 2, concurrentSessionAction: "REFUSE_NEW" })).toEqual({ ok: false, reason: "REFUSED_AT_LIMIT" });
  });

  it("with a limit of one, a new sign-in replaces the last", () => {
    expect(concurrentSessionPlan(open(1), { maxConcurrentSessions: 1, concurrentSessionAction: "REVOKE_OLDEST" })).toEqual({ ok: true, revoke: ["s0"] });
  });

  it("refuses while either setting is unset", () => {
    expect(concurrentSessionPlan(open(0), { maxConcurrentSessions: null, concurrentSessionAction: "REVOKE_OLDEST" })).toEqual({ ok: false, reason: "POLICY_NOT_SET" });
    expect(concurrentSessionPlan(open(0), { maxConcurrentSessions: 3, concurrentSessionAction: null })).toEqual({ ok: false, reason: "POLICY_NOT_SET" });
  });
});
