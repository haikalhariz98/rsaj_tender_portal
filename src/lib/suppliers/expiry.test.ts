import { describe, expect, it } from "vitest";

import { bandPolicyFaults, expiryBand, reminderDue, remindersFor, startsOn, worstBand } from "./expiry";
import { BANDS, OFFSETS } from "./fixture";

const today = "2026-10-01";
const inDays = (n: number) => {
  const t = new Date(`${today}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};

describe("expiry bands (FR-VND-008), thresholds 30/60/90 (fixture)", () => {
  it.each([
    [30, "CRITICAL"],
    [31, "WARNING"],
    [60, "WARNING"],
    [61, "UPCOMING"],
    [90, "UPCOMING"],
    [91, "NONE"],
  ] as const)("%i days left reads %s (each band includes its own figure)", (n, band) => {
    expect(expiryBand(inDays(n), today, BANDS)).toEqual({ band, daysLeft: n });
  });

  it("the expiry day itself is still valid and CRITICAL; the day after is EXPIRED", () => {
    expect(expiryBand(today, today, BANDS)).toEqual({ band: "CRITICAL", daysLeft: 0 });
    expect(expiryBand(inDays(-1), today, BANDS)).toEqual({ band: "EXPIRED", daysLeft: -1 });
  });

  it("any threshold not set bands nothing and says so, never valid; an expired document is expired regardless", () => {
    for (const p of [{ ...BANDS, criticalDays: null }, { ...BANDS, warningDays: null }, { ...BANDS, upcomingDays: null }]) {
      expect(expiryBand(inDays(200), today, p).band).toBe("BANDS_NOT_SET");
      expect(expiryBand(inDays(-3), today, p).band).toBe("EXPIRED");
    }
  });

  it("a document with no expiry is in no band", () => {
    expect(expiryBand(null, today, BANDS)).toEqual({ band: "NO_EXPIRY", daysLeft: null });
  });

  it("the worst band of several is the soonest; none is null", () => {
    expect(worstBand(["NONE", "UPCOMING", "CRITICAL", "NO_EXPIRY"])).toBe("CRITICAL");
    expect(worstBand(["NONE", "EXPIRED"])).toBe("EXPIRED");
    expect(worstBand(["NONE", "BANDS_NOT_SET"])).toBe("BANDS_NOT_SET");
    expect(worstBand([])).toBeNull();
  });
});

describe("the thresholds as configured", () => {
  it("all three in order, whole days from 0, pass", () => {
    expect(bandPolicyFaults(BANDS)).toEqual([]);
    expect(bandPolicyFaults({ criticalDays: null, warningDays: null, upcomingDays: null })).toEqual([]);
    expect(bandPolicyFaults({ criticalDays: 0, warningDays: 1, upcomingDays: 2 })).toEqual([]);
  });
  it("out of order, equal, partly set or negative is refused", () => {
    expect(bandPolicyFaults({ criticalDays: 60, warningDays: 30, upcomingDays: 90 }).map((f) => f.code)).toEqual(["BANDS_OUT_OF_ORDER"]);
    expect(bandPolicyFaults({ criticalDays: 30, warningDays: 30, upcomingDays: 90 }).map((f) => f.code)).toEqual(["BANDS_OUT_OF_ORDER"]);
    expect(bandPolicyFaults({ criticalDays: 30, warningDays: null, upcomingDays: 90 }).map((f) => f.code)).toEqual(["BANDS_PARTLY_SET"]);
    expect(bandPolicyFaults({ criticalDays: -1, warningDays: 30, upcomingDays: 90 }).map((f) => f.code)).toEqual(["BAND_NEGATIVE"]);
    expect(bandPolicyFaults({ criticalDays: 1.5, warningDays: 30, upcomingDays: 90 }).map((f) => f.code)).toEqual(["BAND_NEGATIVE"]);
  });
});

describe("reminders from the rule's offsets (shown, not sent)", () => {
  it("worked example: offsets [90, 60, 30, 7] on a document valid for 7 days give only the 7-day reminder", () => {
    expect(remindersFor({ startsOn: "2026-10-01", expiresOn: "2026-10-08" }, OFFSETS)).toEqual([{ offset: 7, dueOn: "2026-10-01" }]);
  });

  it("a year's document has every reminder, largest first", () => {
    expect(remindersFor({ startsOn: "2026-01-01", expiresOn: "2026-12-31" }, OFFSETS).map((r) => [r.offset, r.dueOn])).toEqual([
      [90, "2026-10-02"],
      [60, "2026-11-01"],
      [30, "2026-12-01"],
      [7, "2026-12-24"],
    ]);
  });

  it("the reminder due is the latest one reached, and none once expired or with no offsets", () => {
    const d = { startsOn: "2026-01-01", expiresOn: "2026-12-31" };
    expect(reminderDue(d, OFFSETS, "2026-10-01")).toBeNull();
    expect(reminderDue(d, OFFSETS, "2026-10-02")?.offset).toBe(90);
    expect(reminderDue(d, OFFSETS, "2026-12-02")?.offset).toBe(30);
    expect(reminderDue(d, OFFSETS, "2026-12-31")?.offset).toBe(7);
    expect(reminderDue(d, OFFSETS, "2027-01-01")).toBeNull();
    expect(reminderDue(d, [], "2026-12-31")).toBeNull();
    expect(reminderDue({ ...d, expiresOn: null }, OFFSETS, "2026-12-31")).toBeNull();
  });

  it("a document starts at its validity, else its issue, else its lodging", () => {
    expect(startsOn({ validFrom: "2026-02-01", issuedOn: "2026-01-15", lodgedOn: "2026-03-01" })).toBe("2026-02-01");
    expect(startsOn({ validFrom: null, issuedOn: "2026-01-15", lodgedOn: "2026-03-01" })).toBe("2026-01-15");
    expect(startsOn({ validFrom: null, issuedOn: null, lodgedOn: "2026-03-01" })).toBe("2026-03-01");
  });
});
