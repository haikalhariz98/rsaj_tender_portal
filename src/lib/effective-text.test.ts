import { describe, expect, it } from "vitest";

import { hasEnded, inForceOn } from "./effective";
import { END_DAY_LABEL, endDayText, NO_END_DATE, NOT_INCLUDED, periodText } from "./effective-text";

const day = (s: string) => new Date(`${s}T00:00:00.000Z`);
/// The texts keep each date and "(not included)" on one line with non-breaking spaces;
/// read them with plain spaces so the expectations stay legible.
const plain = (s: string) => s.replaceAll("\u00a0", " ");

describe("the end day of an effective-dated period", () => {
  // Worked example a reader can check by hand: a delegation entered as From 18 Sep 2026,
  // Ends on 21 Sep 2026. It covers the 18th, 19th and 20th — three days — and not the 21st.
  const delegation = { effectiveFrom: day("2026-09-18"), effectiveTo: day("2026-09-21") };

  it("is not included: in force up to the day before it, ended on it", () => {
    expect(inForceOn(delegation, day("2026-09-17"))).toBe(false);
    expect(inForceOn(delegation, day("2026-09-18"))).toBe(true);
    expect(inForceOn(delegation, day("2026-09-20"))).toBe(true);
    expect(inForceOn(delegation, day("2026-09-21"))).toBe(false);
    expect(hasEnded(delegation, day("2026-09-20"))).toBe(false);
    expect(hasEnded(delegation, day("2026-09-21"))).toBe(true);
  });

  it("and the period text says so, rather than reading as if the 21st were covered", () => {
    expect(plain(periodText(delegation))).toBe("18 Sep 2026 until 21 Sep 2026 (not included)");
    expect(plain(periodText(delegation))).not.toMatch(/ to /);
    expect(plain(endDayText(delegation.effectiveTo))).toBe("21 Sep 2026 (not included)");
  });

  it("a one-day period (From D, Ends on D+1) is in force on D only", () => {
    const oneDay = { effectiveFrom: day("2026-10-05"), effectiveTo: day("2026-10-06") };
    expect(inForceOn(oneDay, day("2026-10-04"))).toBe(false);
    expect(inForceOn(oneDay, day("2026-10-05"))).toBe(true);
    expect(inForceOn(oneDay, day("2026-10-06"))).toBe(false);
    expect(hasEnded(oneDay, day("2026-10-05"))).toBe(false);
    expect(hasEnded(oneDay, day("2026-10-06"))).toBe(true);
    expect(plain(periodText(oneDay))).toBe("05 Oct 2026 until 06 Oct 2026 (not included)");
  });

  it("a period not yet begun has not ended, and an open period never ends", () => {
    expect(hasEnded(delegation, day("2026-09-01"))).toBe(false);
    expect(hasEnded({ effectiveTo: null }, day("2099-01-01"))).toBe(false);
  });

  it("agrees with inForceOn on every day across the boundary: in force is begun and not ended", () => {
    for (let d = 10; d <= 28; d++) {
      const on = day(`2026-09-${String(d).padStart(2, "0")}`);
      expect(inForceOn(delegation, on)).toBe(delegation.effectiveFrom <= on && !hasEnded(delegation, on));
    }
  });
});

describe("the words for it", () => {
  it("an open period says it has no end date, never a blank end", () => {
    expect(periodText({ effectiveFrom: day("2026-09-01"), effectiveTo: null })).toBe("From 01 Sep 2026, no end date");
    expect(NO_END_DATE).toBe("no end date");
  });

  it("one wording, used by the field label and the text alike", () => {
    expect(END_DAY_LABEL).toBe("Ends on (not included)");
    expect(END_DAY_LABEL.endsWith(NOT_INCLUDED)).toBe(true);
    expect(plain(endDayText(day("2027-02-01"))).endsWith(NOT_INCLUDED)).toBe(true);
  });

  it("breaks a narrow column only between a date, 'until' and '(not included)', never inside one", () => {
    const text = periodText({ effectiveFrom: day("2026-09-18"), effectiveTo: day("2026-09-21") });
    expect(text.split(" ")).toEqual(["18\u00a0Sep\u00a02026", "until", "21\u00a0Sep\u00a02026", "(not\u00a0included)"]);
  });

  it("reads the stored day as typed, whatever the server's time zone", () => {
    // Stored at midnight UTC: the 1st of February stays the 1st, never the 31st of January.
    expect(plain(endDayText(day("2027-02-01")))).toBe("01 Feb 2027 (not included)");
  });
});
