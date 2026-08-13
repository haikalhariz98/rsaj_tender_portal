import { describe, expect, it } from "vitest";

import {
  defaultYear,
  periodStatus,
  periodsIn,
  refusalToClose,
  refusalToReopen,
  summariseYear,
  yearsIn,
  type Period,
} from "./periods";

let seq = 0;
const period = (year: number, extra: Partial<Period> = {}): Period => ({
  id: `p${++seq}`,
  year,
  code: `P${String(seq).padStart(2, "0")}`,
  nameEn: `Period ${seq}`,
  nameMs: null,
  startsOn: new Date(`${year}-01-01`),
  endsOn: new Date(`${year}-01-31`),
  openedOn: null,
  closedOn: null,
  sortOrder: seq,
  ...extra,
});

const OPENED = new Date("2026-01-01");
const CLOSED = new Date("2026-02-01");

describe("what state a period is in", () => {
  it("is open once opened and not yet closed", () => {
    expect(periodStatus(period(2026, { openedOn: OPENED }))).toBe("OPEN");
  });

  it("is closed once closed", () => {
    expect(periodStatus(period(2026, { openedOn: OPENED, closedOn: CLOSED }))).toBe("CLOSED");
  });

  it("is not yet open when nobody has opened it", () => {
    // Not "closed". Closing is an act with a date behind it.
    expect(periodStatus(period(2026))).toBe("NOT_YET_OPEN");
  });

  it("reads as closed even if it was closed without ever being opened", () => {
    expect(periodStatus(period(2026, { closedOn: CLOSED }))).toBe("CLOSED");
  });
});

describe("what a year adds up to", () => {
  it("is open while any period is", () => {
    const periods = [
      period(2026, { openedOn: OPENED, closedOn: CLOSED }),
      period(2026, { openedOn: OPENED }),
      period(2026),
    ];
    const s = summariseYear(periods, 2026);
    expect(s.status).toBe("OPEN");
    expect(s.open).toBe(1);
    expect(s.closed).toBe(1);
    expect(s.total).toBe(3);
  });

  it("is closed only when every period is", () => {
    const all = [
      period(2025, { openedOn: OPENED, closedOn: CLOSED }),
      period(2025, { openedOn: OPENED, closedOn: CLOSED }),
    ];
    expect(summariseYear(all, 2025).status).toBe("CLOSED");

    const some = [...all, period(2025)];
    // One period never opened means the year is not closed, it is unfinished.
    expect(summariseYear(some, 2025).status).toBe("IN_PLANNING");
  });

  it("is in planning while nothing has been opened", () => {
    expect(summariseYear([period(2027), period(2027)], 2027).status).toBe("IN_PLANNING");
  });

  it("measures progress by what is closed, not by what is open", () => {
    const periods = [
      period(2026, { openedOn: OPENED, closedOn: CLOSED }),
      period(2026, { openedOn: OPENED }),
      period(2026),
      period(2026),
    ];
    expect(summariseYear(periods, 2026).closedPercent).toBe(25);
  });

  it("has no progress to report for a year with no periods", () => {
    // Not zero per cent — there is nothing to be through.
    expect(summariseYear([], 2030).closedPercent).toBeNull();
  });
});

describe("which year to show", () => {
  it("lands on the one with something open", () => {
    const periods = [
      period(2025, { openedOn: OPENED, closedOn: CLOSED }),
      period(2026, { openedOn: OPENED }),
      period(2027),
    ];
    expect(defaultYear(periods)).toBe(2026);
  });

  it("falls back to the latest planned year when nothing is open", () => {
    expect(defaultYear([period(2025), period(2027)])).toBe(2027);
  });

  it("has nothing to land on when there are no periods", () => {
    expect(defaultYear([])).toBeNull();
  });
});

describe("listing", () => {
  it("lists the years that have periods, in order", () => {
    expect(yearsIn([period(2027), period(2025), period(2026)])).toEqual([2025, 2026, 2027]);
  });

  it("keeps the customer's own period order", () => {
    const a = period(2026, { code: "P02", sortOrder: 2 });
    const b = period(2026, { code: "P01", sortOrder: 1 });
    expect(periodsIn([a, b], 2026).map((p) => p.code)).toEqual(["P01", "P02"]);
  });
});

describe("refusing a close or a reopen", () => {
  it("will not close one twice", () => {
    expect(refusalToClose(period(2026, { openedOn: OPENED, closedOn: CLOSED }))).toBe(
      "ALREADY_CLOSED",
    );
  });

  it("will not close one that was never opened", () => {
    expect(refusalToClose(period(2026))).toBe("NEVER_OPENED");
  });

  it("allows closing one that is open", () => {
    expect(refusalToClose(period(2026, { openedOn: OPENED }))).toBeNull();
  });

  it("will not reopen one that is already open", () => {
    expect(refusalToReopen(period(2026, { openedOn: OPENED }))).toBe("ALREADY_OPEN");
    expect(refusalToReopen(period(2026))).toBeNull();
  });
});
