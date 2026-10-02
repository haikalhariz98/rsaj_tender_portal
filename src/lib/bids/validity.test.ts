import { describe, expect, it } from "vitest";

import { awardValidityFault, validityExpiry, validityState } from "./validity";

const base = { closingDay: "2026-11-17", days: 120, extensions: [] as { toExpiry: string; appliedAt: Date }[], today: "2027-03-17", offsets: [30, 7] };

describe("bid validity (FR-BID-009, OD-10: closing day + N, ASSUMED)", () => {
  it("closing 17 Nov 2026, 120 days: expires 17 Mar 2027 — valid on the 17th, expired on the 18th", () => {
    expect(validityExpiry("2026-11-17", 120)).toBe("2027-03-17");
    expect(validityState(base).state).toBe("VALID");
    expect(validityState({ ...base, today: "2027-03-18" }).state).toBe("EXPIRED");
  });
  it("90 days: expires 15 Feb 2027", () => expect(validityExpiry("2026-11-17", 90)).toBe("2027-02-15"));
  it("offsets [30, 7] with 7 days left: the 7-day alert; with 20 left: the 30-day alert; with 40: none", () => {
    expect(validityState({ ...base, today: "2027-03-10" })).toMatchObject({ daysLeft: 7, alertOffset: 7 });
    expect(validityState({ ...base, today: "2027-02-25" })).toMatchObject({ daysLeft: 20, alertOffset: 30 });
    expect(validityState({ ...base, today: "2027-02-05" }).alertOffset).toBeNull();
    expect(validityState({ ...base, today: "2027-03-10", offsets: [] }).alertOffset).toBeNull();
  });
  it("an applied extension moves it, the latest governing", () => {
    const s = validityState({ ...base, today: "2027-03-20", extensions: [{ toExpiry: "2027-04-30", appliedAt: new Date("2027-03-01") }, { toExpiry: "2027-04-15", appliedAt: new Date("2027-02-01") }] });
    expect(s).toMatchObject({ state: "VALID", baseExpiry: "2027-03-17", expiry: "2027-04-30", extended: true });
  });
  it("null days: NOT_SET, never a default", () => expect(validityState({ ...base, days: null }).state).toBe("NOT_SET"));
  it("no closing, no zone: said, not guessed", () => {
    expect(validityState({ ...base, closingDay: null }).state).toBe("NO_CLOSING");
    expect(validityState({ ...base, today: null }).state).toBe("TIME_ZONE_UNSET");
  });
});

describe("the award's validity check (6.11 hook)", () => {
  it("expired with no extension: BID_VALIDITY_EXPIRED", () => expect(awardValidityFault(true, validityState({ ...base, today: "2027-03-18" }))?.code).toBe("BID_VALIDITY_EXPIRED"));
  it("not set: VALIDITY_NOT_SET; valid: clear", () => {
    expect(awardValidityFault(true, validityState({ ...base, days: null }))?.code).toBe("VALIDITY_NOT_SET");
    expect(awardValidityFault(true, validityState(base))).toBeNull();
  });
  it("not judged without a zone", () => expect(awardValidityFault(true, validityState({ ...base, today: null }))?.code).toBe("VALIDITY_NOT_JUDGED"));
  it("nothing is asked of an exercise not published through 6.5", () => expect(awardValidityFault(false, validityState({ ...base, days: null }))).toBeNull());
});
