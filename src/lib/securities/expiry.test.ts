import { describe, expect, it } from "vitest";

import { expiryAlert, expiryChip, remindersText, alertingUpTo, longExpiredBefore, registerRank } from "./expiry";

describe("expiry alerts from the notification rule's offsets", () => {
  it("offsets 30 and 7 with seven days left give the seven-day alert", () => {
    expect(expiryAlert("2026-10-07", [30, 7], "2026-09-30")).toEqual({ state: "DUE", offset: 7, daysLeft: 7 });
  });
  it("twenty days left gives the thirty-day alert", () => {
    expect(expiryAlert("2026-10-20", [30, 7], "2026-09-30")).toEqual({ state: "DUE", offset: 30, daysLeft: 20 });
  });
  it("no offsets: no alert before expiry", () => {
    expect(expiryAlert("2026-10-07", [], "2026-09-30")).toEqual({ state: "NONE", daysLeft: 7 });
  });
  it("past its expiry: expired, whatever the offsets", () => {
    expect(expiryAlert("2026-09-20", [], "2026-09-30")).toEqual({ state: "EXPIRED", daysAgo: 10 });
  });
  it("no expiry recorded is said, not alerted", () => {
    expect(expiryAlert(null, [30], "2026-09-30")).toEqual({ state: "NO_EXPIRY" });
  });
});

describe("counting what is expiring", () => {
  it("is everything up to today plus the largest offset, or only the expired with none set — as expiryAlert reads it", () => {
    expect(alertingUpTo([30, 60, 90], "2026-10-01")).toBe("2026-12-30");
    expect(alertingUpTo([], "2026-10-01")).toBe("2026-09-30");
    const up = alertingUpTo([30], "2026-10-01");
    expect(expiryAlert(up, [30], "2026-10-01").state).toBe("DUE");
    expect(expiryAlert("2026-11-01", [30], "2026-10-01").state).toBe("NONE");
  });
});

describe("the register's order", () => {
  it("live first, then long expired, then rejected; long expired is past the largest reminder offset", () => {
    const cutoff = longExpiredBefore([30, 60], "2026-10-01");
    expect(cutoff).toBe("2026-08-02");
    expect(registerRank({ status: "VERIFIED", expiresOn: "2026-09-01" }, cutoff)).toBe(0);
    expect(registerRank({ status: "LODGED", expiresOn: null }, cutoff)).toBe(0);
    expect(registerRank({ status: "VERIFIED", expiresOn: "2026-08-01" }, cutoff)).toBe(1);
    expect(registerRank({ status: "REJECTED", expiresOn: "2027-01-01" }, cutoff)).toBe(2);
    expect(longExpiredBefore([], "2026-10-01")).toBe("2026-10-01");
  });
});

describe("expiryChip and remindersText (AC-15)", () => {
  it("words each alert once, and nothing when not due", () => {
    expect(expiryChip(null)).toBeNull();
    expect(expiryChip({ state: "NONE", daysLeft: 90 })).toBeNull();
    expect(expiryChip({ state: "EXPIRED", daysAgo: 3 })).toEqual({ text: "Expired 3 days ago", tone: "err" });
    expect(expiryChip({ state: "DUE", offset: 30, daysLeft: 12 })).toEqual({ text: "Expires in 12 days", tone: "warn" });
    expect(expiryChip({ state: "NO_EXPIRY" })).toEqual({ text: "No expiry recorded", tone: "warn" });
  });
  it("says the reminders are not set rather than 0 days", () => {
    expect(remindersText([])).toBe("Expiry reminders are not set");
    expect(remindersText([60, 30])).toBe("Reminders at 60, 30 days");
  });
});
