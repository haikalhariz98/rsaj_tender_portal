import { describe, expect, it } from "vitest";

import {
  afterConfiguring,
  afterIssuing,
  formatReference,
  needsReset,
  patternFaults,
  periodFor,
  previewNext,
  serialFor,
  tokensIn,
  type Series,
} from "./series";

const series = (s: Partial<Series> = {}): Series => ({
  key: "contract",
  nameEn: "Contract",
  pattern: "{SERIAL}/{YEAR}",
  padding: 3,
  resetOn: "CALENDAR_YEAR",
  financialYearStartMonth: 1,
  nextSerial: 1,
  serialPeriod: "2026",
  ...s,
});

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("tokens", () => {
  it("finds the tokens a pattern uses", () => {
    expect(tokensIn("AB/{SERIAL}/{YEAR}")).toEqual(["SERIAL", "YEAR"]);
  });

  it("finds none in a pattern with no tokens", () => {
    expect(tokensIn("nothing here")).toEqual([]);
  });
});

describe("pattern faults", () => {
  it("refuses a pattern with no serial, which would repeat every reference", () => {
    expect(patternFaults({ pattern: "AB/{YEAR}", resetOn: "NEVER" })).toContainEqual({
      kind: "NO_SERIAL",
    });
  });

  it("reports a token nobody defined", () => {
    expect(patternFaults({ pattern: "{SERIAL}/{DEPARTMENT}", resetOn: "NEVER" })).toContainEqual({
      kind: "UNKNOWN_TOKEN",
      token: "DEPARTMENT",
    });
  });

  it("catches a yearly reset with no year in the reference", () => {
    // The dangerous one: it looks fine until the first matter of next year collides
    // with the first of this year.
    expect(patternFaults({ pattern: "AB/{SERIAL}", resetOn: "CALENDAR_YEAR" })).toContainEqual({
      kind: "RESET_WITHOUT_PERIOD",
    });
  });

  it("accepts a short year as showing the period", () => {
    expect(patternFaults({ pattern: "AB/{SERIAL}/{SHORTYEAR}", resetOn: "CALENDAR_YEAR" })).toEqual(
      [],
    );
  });

  it("is happy with a serial that never resets and shows no year", () => {
    expect(patternFaults({ pattern: "AB/{SERIAL}", resetOn: "NEVER" })).toEqual([]);
  });
});

describe("periods", () => {
  it("has no period when the series never resets", () => {
    expect(periodFor(series({ resetOn: "NEVER" }), d("2026-06-01"))).toBe("");
  });

  it("uses the calendar year", () => {
    expect(periodFor(series(), d("2026-06-01"))).toBe("2026");
    expect(periodFor(series(), d("2026-12-31"))).toBe("2026");
    expect(periodFor(series(), d("2027-01-01"))).toBe("2027");
  });

  it("labels a financial year by the calendar year it starts in", () => {
    const fy = series({ resetOn: "FINANCIAL_YEAR", financialYearStartMonth: 4 });
    expect(periodFor(fy, d("2026-04-01"))).toBe("2026");
    expect(periodFor(fy, d("2027-03-31"))).toBe("2026");
    expect(periodFor(fy, d("2027-04-01"))).toBe("2027");
  });

  it("treats a January financial year as the calendar year", () => {
    const fy = series({ resetOn: "FINANCIAL_YEAR", financialYearStartMonth: 1 });
    expect(periodFor(fy, d("2026-06-01"))).toBe("2026");
  });
});

describe("resetting", () => {
  it("does not reset within the period", () => {
    expect(needsReset(series({ serialPeriod: "2026", nextSerial: 42 }), d("2026-09-01"))).toBe(
      false,
    );
    expect(serialFor(series({ serialPeriod: "2026", nextSerial: 42 }), d("2026-09-01"))).toBe(42);
  });

  it("starts again at one in a new period", () => {
    const s = series({ serialPeriod: "2026", nextSerial: 42 });
    expect(needsReset(s, d("2027-01-01"))).toBe(true);
    expect(serialFor(s, d("2027-01-01"))).toBe(1);
  });

  it("never resets a series set never to", () => {
    const s = series({ resetOn: "NEVER", serialPeriod: "", nextSerial: 987 });
    expect(needsReset(s, d("2030-01-01"))).toBe(false);
    expect(serialFor(s, d("2030-01-01"))).toBe(987);
  });
});

describe("rendering a reference", () => {
  it("pads the serial to the configured width", () => {
    expect(formatReference(series({ pattern: "{SERIAL}" }), d("2026-06-01"), 7)).toBe("007");
    expect(formatReference(series({ pattern: "{SERIAL}", padding: 5 }), d("2026-06-01"), 7)).toBe(
      "00007",
    );
  });

  it("does not truncate a serial that outgrows its padding", () => {
    // Better a wider reference than a wrong one.
    expect(formatReference(series({ pattern: "{SERIAL}", padding: 2 }), d("2026-06-01"), 1234)).toBe(
      "1234",
    );
  });

  it("keeps the literal parts exactly as written", () => {
    const s = series({ pattern: "ABC/KP/T/{SERIAL}/{YEAR}" });
    expect(formatReference(s, d("2026-06-01"), 12)).toBe("ABC/KP/T/012/2026");
  });

  it("renders a short year and a padded month", () => {
    const s = series({ pattern: "{SHORTYEAR}-{MONTH}-{SERIAL}" });
    expect(formatReference(s, d("2026-03-04"), 5)).toBe("26-03-005");
  });

  it("shows the financial year the matter belongs to, not the calendar year", () => {
    const fy = series({
      pattern: "{SERIAL}/{YEAR}",
      resetOn: "FINANCIAL_YEAR",
      financialYearStartMonth: 4,
    });
    // March 2027 is still the 2026 financial year.
    expect(formatReference(fy, d("2027-03-31"), 9)).toBe("009/2026");
  });

  it("leaves an unknown token visible rather than producing a plausible wrong one", () => {
    const s = series({ pattern: "{SERIAL}/{NOPE}" });
    expect(formatReference(s, d("2026-06-01"), 1)).toBe("001/{NOPE}");
  });
});

describe("issuing", () => {
  it("moves the serial forward and records the period", () => {
    const s = series({ nextSerial: 5, serialPeriod: "2026" });
    const after = afterIssuing(s, d("2026-06-01"));
    expect(after.nextSerial).toBe(6);
    expect(after.serialPeriod).toBe("2026");
  });

  it("starts a new period at one and moves to two", () => {
    const s = series({ nextSerial: 88, serialPeriod: "2026" });
    const after = afterIssuing(s, d("2027-02-01"));
    expect(after.nextSerial).toBe(2);
    expect(after.serialPeriod).toBe("2027");
  });

  it("never moves the serial backwards within a period", () => {
    let s = series({ nextSerial: 1, serialPeriod: "2026" });
    for (let i = 0; i < 5; i++) s = afterIssuing(s, d("2026-06-01"));
    expect(s.nextSerial).toBe(6);
  });

  it("returns a new series rather than mutating the one given", () => {
    const s = series({ nextSerial: 1 });
    afterIssuing(s, d("2026-06-01"));
    expect(s.nextSerial).toBe(1);
  });
});

describe("preview", () => {
  it("shows what the next reference would be", () => {
    const s = series({ pattern: "AB/{SERIAL}/{YEAR}", nextSerial: 41, serialPeriod: "2026" });
    expect(previewNext(s, d("2026-06-01"))).toBe("AB/041/2026");
  });

  it("shows the reset in the preview before it happens", () => {
    const s = series({ pattern: "AB/{SERIAL}/{YEAR}", nextSerial: 41, serialPeriod: "2026" });
    expect(previewNext(s, d("2027-01-01"))).toBe("AB/001/2027");
  });
});

describe("saving a series", () => {
  const on = d("2026-06-15");

  it("stamps a new series with the period it is created in", () => {
    const s = afterConfiguring(null, { resetOn: "CALENDAR_YEAR", financialYearStartMonth: 1 }, 500, on);
    expect(s).toEqual({ nextSerial: 500, serialPeriod: "2026" });
    // The take-on serial is what the first reference uses — not a restart at 1.
    expect(serialFor(series(s), on)).toBe(500);
  });

  it("keeps the stored serial when the field is left blank", () => {
    const before = series({ nextSerial: 42, serialPeriod: "2026" });
    const s = afterConfiguring(before, { resetOn: "CALENDAR_YEAR", financialYearStartMonth: 1 }, null, on);
    expect(s).toEqual({ nextSerial: 42, serialPeriod: "2026" });
  });

  it("leaves a pending reset alone when only the name changes", () => {
    // Last year's serial, saved in the new year without touching it: the new year still
    // starts at 1 rather than inheriting 42.
    const before = series({ nextSerial: 42, serialPeriod: "2025" });
    const s = afterConfiguring(before, { resetOn: "CALENDAR_YEAR", financialYearStartMonth: 1 }, 1, on);
    expect(serialFor(series(s), on)).toBe(1);
  });

  it("stamps a serial typed in by hand with today's period", () => {
    const before = series({ nextSerial: 42, serialPeriod: "2025" });
    const s = afterConfiguring(before, { resetOn: "CALENDAR_YEAR", financialYearStartMonth: 1 }, 7, on);
    expect(s).toEqual({ nextSerial: 7, serialPeriod: "2026" });
  });

  it("never restarts when a running series is switched to reset yearly", () => {
    const before = series({ resetOn: "NEVER", nextSerial: 231, serialPeriod: "" });
    const s = afterConfiguring(before, { resetOn: "CALENDAR_YEAR", financialYearStartMonth: 1 }, null, on);
    expect(serialFor(series({ ...s, resetOn: "CALENDAR_YEAR" }), on)).toBe(231);
  });
});
