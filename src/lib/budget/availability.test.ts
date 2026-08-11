import { describe, expect, it } from "vitest";

import { senToDecimalString } from "@/lib/money";

import {
  allocationFor,
  availabilityOf,
  checkAgainstBudget,
  liveCommitments,
  totalsOn,
  type Allocation,
  type Commitment,
} from "./availability";

const NOW = new Date("2026-06-01");

const alloc = (a: Partial<Allocation> & Pick<Allocation, "id" | "amount">): Allocation => ({
  costCentreCode: "CC1",
  accountCodeCode: "AC1",
  periodLabel: "2026",
  sortOrder: 0,
  effectiveFrom: new Date("2026-01-01"),
  effectiveTo: null,
  ...a,
});

const commit = (
  c: Partial<Commitment> & Pick<Commitment, "id" | "allocationId" | "amount">,
): Commitment => ({
  reference: c.id,
  committedOn: new Date("2026-02-01"),
  releasedOn: null,
  ...c,
});

const money = (s: bigint) => senToDecimalString(s);

describe("what is committed", () => {
  const a = alloc({ id: "a1", amount: "1000.00" });

  it("counts only commitments against that allocation", () => {
    const commitments = [
      commit({ id: "c1", allocationId: "a1", amount: "100.00" }),
      commit({ id: "c2", allocationId: "other", amount: "500.00" }),
    ];
    expect(money(availabilityOf(a, commitments, NOW).committed)).toBe("100.00");
  });

  it("ignores a commitment raised after the date asked about", () => {
    const later = [
      commit({ id: "c1", allocationId: "a1", amount: "100.00", committedOn: new Date("2026-09-01") }),
    ];
    expect(money(availabilityOf(a, later, NOW).committed)).toBe("0.00");
  });

  it("frees the money when a commitment is released, and keeps the record", () => {
    const released = [
      commit({
        id: "c1",
        allocationId: "a1",
        amount: "400.00",
        releasedOn: new Date("2026-03-01"),
      }),
    ];
    expect(money(availabilityOf(a, released, NOW).committed)).toBe("0.00");
    expect(released).toHaveLength(1);
  });

  it("still counts it on a date before it was released", () => {
    const released = [
      commit({
        id: "c1",
        allocationId: "a1",
        amount: "400.00",
        releasedOn: new Date("2026-03-01"),
      }),
    ];
    expect(money(availabilityOf(a, released, new Date("2026-02-15")).committed)).toBe("400.00");
  });

  it("sums many small commitments without drift", () => {
    const many = Array.from({ length: 300 }, (_, i) =>
      commit({ id: `c${i}`, allocationId: "a1", amount: "0.07" }),
    );
    expect(money(availabilityOf(a, many, NOW).committed)).toBe("21.00");
  });

  it("lists the commitments still holding money", () => {
    const commitments = [
      commit({ id: "live", allocationId: "a1", amount: "10.00" }),
      commit({ id: "gone", allocationId: "a1", amount: "10.00", releasedOn: new Date("2026-03-01") }),
    ];
    expect(liveCommitments(commitments, "a1", NOW).map((c) => c.id)).toEqual(["live"]);
  });
});

describe("the balance", () => {
  it("is what is left", () => {
    const a = alloc({ id: "a1", amount: "1000.00" });
    const c = [commit({ id: "c1", allocationId: "a1", amount: "250.50" })];
    expect(money(availabilityOf(a, c, NOW).balance)).toBe("749.50");
  });

  it("goes negative rather than clamping, and says so", () => {
    const a = alloc({ id: "a1", amount: "100.00" });
    const c = [commit({ id: "c1", allocationId: "a1", amount: "150.00" })];
    const result = availabilityOf(a, c, NOW);
    expect(money(result.balance)).toBe("-50.00");
    expect(result.overcommitted).toBe(true);
  });
});

describe("finding the allocation to check against", () => {
  const allocations = [
    alloc({ id: "a1", amount: "100.00" }),
    alloc({ id: "a2", amount: "200.00", costCentreCode: "CC2" }),
    alloc({
      id: "old",
      amount: "999.00",
      effectiveFrom: new Date("2025-01-01"),
      effectiveTo: new Date("2026-01-01"),
    }),
  ];

  it("matches on the cost centre and account code pair", () => {
    expect(allocationFor(allocations, "CC1", "AC1", NOW).allocation?.id).toBe("a1");
    expect(allocationFor(allocations, "CC2", "AC1", NOW).allocation?.id).toBe("a2");
  });

  it("ignores an allocation whose period has ended", () => {
    expect(allocationFor(allocations, "CC1", "AC1", NOW).allocation?.id).not.toBe("old");
  });

  it("finds last year's allocation when asked about last year", () => {
    const then = new Date("2025-06-01");
    expect(allocationFor(allocations, "CC1", "AC1", then).allocation?.id).toBe("old");
  });

  it("returns nothing where no allocation covers the pair", () => {
    const result = allocationFor(allocations, "NOPE", "AC1", NOW);
    expect(result.allocation).toBe(null);
    expect(result.ambiguous).toBe(false);
  });

  it("refuses to choose where two allocations overlap", () => {
    const twice = [...allocations, alloc({ id: "dup", amount: "50.00" })];
    const result = allocationFor(twice, "CC1", "AC1", NOW);
    expect(result.allocation).toBe(null);
    expect(result.ambiguous).toBe(true);
  });
});

describe("checking a requirement", () => {
  const allocations = [alloc({ id: "a1", amount: "1000.00" })];
  const commitments = [commit({ id: "c1", allocationId: "a1", amount: "600.00" })];
  const check = (amount: string) =>
    checkAgainstBudget(
      allocations,
      commitments,
      { costCentreCode: "CC1", accountCodeCode: "AC1", amount },
      NOW,
    );

  it("passes a requirement within the balance", () => {
    const r = check("300.00");
    expect(r.state).toBe("WITHIN");
    if (r.state === "WITHIN") expect(money(r.remainingAfter)).toBe("100.00");
  });

  it("treats exactly exhausting the balance as within it", () => {
    const r = check("400.00");
    expect(r.state).toBe("WITHIN");
    if (r.state === "WITHIN") expect(money(r.remainingAfter)).toBe("0.00");
  });

  it("fails one sen over, and says by how much", () => {
    const r = check("400.01");
    expect(r.state).toBe("EXCEEDS");
    if (r.state === "EXCEEDS") expect(money(r.shortfall)).toBe("0.01");
  });

  it("distinguishes no allocation from no money", () => {
    const r = checkAgainstBudget(
      [],
      [],
      { costCentreCode: "CC1", accountCodeCode: "AC1", amount: "1.00" },
      NOW,
    );
    // Nobody has set an allocation. That sends the officer to configuration, not to
    // finance, and the two must not read alike.
    expect(r.state).toBe("NO_ALLOCATION");
  });

  it("refuses to check against two overlapping allocations", () => {
    const r = checkAgainstBudget(
      [alloc({ id: "a1", amount: "10.00" }), alloc({ id: "a2", amount: "20.00" })],
      [],
      { costCentreCode: "CC1", accountCodeCode: "AC1", amount: "1.00" },
      NOW,
    );
    expect(r.state).toBe("AMBIGUOUS");
  });
});

describe("totals", () => {
  it("adds up only what is in force", () => {
    const allocations = [
      alloc({ id: "a1", amount: "1000.00" }),
      alloc({ id: "a2", amount: "500.00", costCentreCode: "CC2" }),
      alloc({
        id: "old",
        amount: "9999.00",
        effectiveFrom: new Date("2025-01-01"),
        effectiveTo: new Date("2026-01-01"),
      }),
    ];
    const commitments = [commit({ id: "c1", allocationId: "a1", amount: "250.00" })];
    const t = totalsOn(allocations, commitments, NOW);
    expect(money(t.allocated)).toBe("1500.00");
    expect(money(t.committed)).toBe("250.00");
    expect(money(t.balance)).toBe("1250.00");
  });

  it("is all zero when nothing is allocated", () => {
    const t = totalsOn([], [], NOW);
    expect(money(t.allocated)).toBe("0.00");
    expect(t.overcommitted).toBe(false);
  });
});
