import { describe, expect, it } from "vitest";

import { formatSen, parseSen } from "@/lib/money";

import { ago, lineFor, outstanding, summarise, syncReadiness, type Variance } from "./finance";

const ON = new Date("2026-08-14T12:00:00Z");

let seq = 0;
const variance = (portal: string, finance: string, extra: Partial<Variance> = {}): Variance => ({
  id: `v${++seq}`,
  budgetCodeCode: "OPX26-019",
  accountCode: "5-4100-205",
  compares: "Allocation",
  portalAmount: portal,
  financeAmount: finance,
  reason: "",
  lastSeenAt: new Date("2026-08-05T00:00:00Z"),
  resolvedOn: null,
  resolvedNote: "",
  ...extra,
});

describe("the difference between the two sides", () => {
  it("is taken from the full figures, not the abbreviated ones", () => {
    // A screen shows RM 2.35M and RM 2.30M, which would suggest 50K. It is 47K.
    const l = lineFor(variance("2350000.00", "2303000.00"), null, ON);
    expect(formatSen(l.difference)).toBe("−RM47,000.00");
  });

  it("is finance less portal, so a bigger finance figure reads positive", () => {
    const l = lineFor(variance("875700.00", "882700.00"), null, ON);
    expect(formatSen(l.difference)).toBe("RM7,000.00");
  });
});

describe("the tolerance the customer set", () => {
  it("counts a gap inside it as within", () => {
    const l = lineFor(variance("1000.00", "1400.00"), parseSen("500"), ON);
    expect(l.withinTolerance).toBe(true);
  });

  it("counts one outside it, in either direction", () => {
    expect(lineFor(variance("1000.00", "1600.00"), parseSen("500"), ON).withinTolerance).toBe(false);
    expect(lineFor(variance("1600.00", "1000.00"), parseSen("500"), ON).withinTolerance).toBe(false);
  });

  it("will not judge when nobody has set one", () => {
    // Not "within". An unset tolerance forgives nothing and condemns nothing.
    expect(lineFor(variance("1000.00", "9999.00"), null, ON).withinTolerance).toBeNull();
  });
});

describe("what still needs attention", () => {
  it("drops a settled line, an identical pair, and one inside the tolerance", () => {
    const lines = [
      lineFor(variance("100.00", "200.00"), null, ON),
      lineFor(variance("100.00", "100.00"), null, ON),
      lineFor(variance("100.00", "900.00"), null, ON, ), // still outstanding
      lineFor(variance("100.00", "500.00", { resolvedOn: new Date("2026-08-10") }), null, ON),
      lineFor(variance("100.00", "150.00"), parseSen("100"), ON),
    ];
    expect(outstanding(lines)).toHaveLength(2);
  });

  it("totals the gap without letting opposite signs cancel", () => {
    const lines = [
      lineFor(variance("100.00", "200.00"), null, ON),
      lineFor(variance("200.00", "100.00"), null, ON),
    ];
    // A hundred out on one and a hundred in on the other is two hundred apart,
    // not nothing apart.
    expect(formatSen(summarise(lines).gap)).toBe("RM200.00");
    expect(summarise(lines).outstanding).toBe(2);
  });
});

describe("how long ago", () => {
  it("counts days, then hours, then minutes", () => {
    expect(ago(new Date("2026-08-05T00:00:00Z"), ON)).toBe("9d ago");
    expect(ago(new Date("2026-08-14T09:00:00Z"), ON)).toBe("3h ago");
    expect(ago(new Date("2026-08-14T11:30:00Z"), ON)).toBe("30m ago");
  });

  it("says nothing about a run that never happened", () => {
    // Not "0d ago", which would put a time on something that did not occur.
    expect(ago(null, ON)).toBeNull();
  });
});

describe("whether the portal can synchronise", () => {
  it("says nothing is configured before a direction is chosen", () => {
    expect(syncReadiness(null)).toBe("NOT_CONFIGURED");
    expect(syncReadiness("")).toBe("NOT_CONFIGURED");
  });

  it("admits there is no adapter even once it is configured", () => {
    // A button reporting success without talking to anything would put a
    // meaningless timestamp on the screen.
    expect(syncReadiness("two_way")).toBe("NO_ADAPTER");
  });
});
