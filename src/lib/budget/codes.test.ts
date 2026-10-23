import { describe, expect, it } from "vitest";

import { formatSen, parseSen } from "@/lib/money";

import {
  figuresFor,
  fitsWithin,
  ledgerFor,
  ledgerLines,
  movementsFor,
  offerableOn,
  percentUsed,
  thresholdState,
  totalsAcross,
  transferFaults,
  type BudgetCode,
  type Movement,
  type MovementKind,
} from "./codes";

const ON = new Date("2026-06-30");

let seq = 0;
const move = (
  kind: MovementKind,
  amount: string,
  extra: Partial<Movement> = {},
  budgetCodeId = "b1",
): Movement => ({
  id: `m${++seq}`,
  budgetCodeId,
  kind,
  reference: "",
  description: "",
  amount,
  occurredOn: new Date("2026-01-01"),
  releasedOn: null,
  releaseNote: "",
  counterpartCode: null,
  ...extra,
});

const code = (id: string, extra: Partial<BudgetCode> = {}): BudgetCode => ({
  id,
  code: id.toUpperCase(),
  descriptionEn: id,
  descriptionMs: null,
  type: "",
  owningUnitCode: null,
  accountCode: "",
  holderPersonId: null,
  isActive: true,
  effectiveFrom: new Date("2026-01-01"),
  effectiveTo: null,
  ...extra,
});

describe("what a code is worth", () => {
  it("adds revisions and transfers in, and takes transfers out off", () => {
    const f = figuresFor(
      [
        move("ORIGINAL", "1000.00"),
        move("REVISION", "250.00"),
        move("TRANSFER_IN", "100.00"),
        move("TRANSFER_OUT", "50.00"),
      ],
      "b1",
      ON,
    );
    expect(formatSen(f.allocated)).toBe("RM1,300.00");
  });

  it("leaves a movement dated after the day asked about out of it", () => {
    const f = figuresFor(
      [move("ORIGINAL", "1000.00"), move("REVISION", "500.00", { occurredOn: new Date("2026-12-01") })],
      "b1",
      ON,
    );
    expect(formatSen(f.allocated)).toBe("RM1,000.00");
  });

  it("ignores movements belonging to another code", () => {
    const f = figuresFor([move("ORIGINAL", "1000.00"), move("ORIGINAL", "9000.00", {}, "b2")], "b1", ON);
    expect(formatSen(f.allocated)).toBe("RM1,000.00");
  });
});

describe("what is left", () => {
  it("takes commitments and spend off the allocation", () => {
    const f = figuresFor(
      [move("ORIGINAL", "1000.00"), move("COMMITMENT", "200.00"), move("ACTUAL_SPEND", "300.00")],
      "b1",
      ON,
    );
    expect(formatSen(f.available)).toBe("RM500.00");
  });

  it("stops counting a commitment once it is released", () => {
    const movements = [
      move("ORIGINAL", "1000.00"),
      move("COMMITMENT", "400.00", { releasedOn: new Date("2026-03-01") }),
    ];
    expect(formatSen(figuresFor(movements, "b1", ON).committed)).toBe("RM0.00");
    // Read on a date before the release, it was still holding the money.
    expect(formatSen(figuresFor(movements, "b1", new Date("2026-02-01")).committed)).toBe("RM400.00");
  });

  it("goes negative rather than clamping at nothing left", () => {
    const f = figuresFor([move("ORIGINAL", "100.00"), move("COMMITMENT", "150.00")], "b1", ON);
    expect(formatSen(f.available)).toBe("−RM50.00");
  });
});

describe("utilisation", () => {
  it("counts committed and spent together", () => {
    expect(percentUsed(parseSen("1000"), parseSen("250"), parseSen("250"))).toBe(50);
  });

  it("is not set where nothing has been allocated", () => {
    // Not zero. A code with no budget has not used none of it.
    expect(percentUsed(parseSen("0"), parseSen("0"), parseSen("0"))).toBeNull();
    expect(figuresFor([], "b1", ON).utilisation).toBeNull();
  });

  it("keeps two decimals, which is what the meter is drawn from", () => {
    // A third of the budget used, to two places rather than one.
    expect(percentUsed(parseSen("3000"), parseSen("1000"), parseSen("0"))).toBe(33.33);
    expect(percentUsed(parseSen("13341000"), parseSen("6860000"), parseSen("5000000"))).toBeCloseTo(
      88.9,
      1,
    );
  });

  it("can exceed a hundred", () => {
    expect(percentUsed(parseSen("100"), parseSen("150"), parseSen("0"))).toBe(150);
  });
});

describe("the warning threshold", () => {
  it("is not met, met, or not set", () => {
    expect(thresholdState(80, 85)).toBe("UNDER");
    expect(thresholdState(85, 85)).toBe("AT_OR_OVER");
    expect(thresholdState(90, 85)).toBe("AT_OR_OVER");
  });

  it("refuses to judge when nobody has set one", () => {
    // An unset threshold is not a threshold of zero, and not one of a hundred either.
    expect(thresholdState(99, null)).toBe("NOT_SET");
    expect(thresholdState(null, 85)).toBe("NOT_SET");
  });
});

describe("the allocation ledger", () => {
  it("totals to the current allocation", () => {
    const l = ledgerFor(
      [
        move("ORIGINAL", "12400000.00"),
        move("TRANSFER_IN", "941000.00"),
      ],
      "b1",
      ON,
    );
    expect(formatSen(l.current)).toBe("RM13,341,000.00");
    expect(formatSen(l.transfers)).toBe("RM941,000.00");
  });

  it("nets transfers both ways", () => {
    const l = ledgerFor(
      [move("ORIGINAL", "2800000.00"), move("TRANSFER_OUT", "95000.00"), move("TRANSFER_OUT", "132000.00")],
      "b1",
      ON,
    );
    expect(formatSen(l.current)).toBe("RM2,573,000.00");
  });
});

describe("which codes may be charged", () => {
  it("leaves out one that has been withdrawn", () => {
    const codes = [code("a"), code("b", { isActive: false })];
    expect(offerableOn(codes, ON).map((c) => c.id)).toEqual(["a"]);
  });

  it("leaves out one whose period has not started or has ended", () => {
    const codes = [
      code("a"),
      code("b", { effectiveFrom: new Date("2027-01-01") }),
      code("c", { effectiveTo: new Date("2026-01-31") }),
    ];
    expect(offerableOn(codes, ON).map((c) => c.id)).toEqual(["a"]);
  });
});

describe("totals across codes", () => {
  it("sums each code's figures", () => {
    const codes = [code("b1"), code("b2")];
    const movements = [
      move("ORIGINAL", "1000.00"),
      move("COMMITMENT", "100.00"),
      move("ORIGINAL", "3000.00", {}, "b2"),
      move("ACTUAL_SPEND", "500.00", {}, "b2"),
    ];
    const t = totalsAcross(codes, movements, ON);
    expect(formatSen(t.allocated)).toBe("RM4,000.00");
    expect(formatSen(t.available)).toBe("RM3,400.00");
    expect(t.utilisation).toBe(15);
  });

  it("each code reads only its own movements, in ledger order, however often the same ledger is asked", () => {
    const movements = [
      move("ORIGINAL", "1000.00", {}, "b1"),
      move("ORIGINAL", "3000.00", {}, "b2"),
      move("TRANSFER_OUT", "200.00", { occurredOn: new Date("2026-03-01") }, "b1"),
      move("TRANSFER_IN", "200.00", { occurredOn: new Date("2026-03-01") }, "b2"),
      move("REVISION", "50.00", { occurredOn: new Date("2026-09-01") }, "b1"),
    ];
    const plain = (id: string, on: Date) => movements.filter((m) => m.budgetCodeId === id && m.occurredOn <= on);
    for (const on of [new Date("2026-02-01"), ON, new Date("2026-12-31")]) {
      for (const id of ["b1", "b2", "b3"]) expect(movementsFor(movements, id, on)).toEqual(plain(id, on));
    }
    expect(figuresFor(movements, "b1", ON).allocated).toBe(parseSen("800.00"));
    expect(figuresFor(movements, "b2", ON).allocated).toBe(parseSen("3200.00"));
  });
});

describe("whether a charge fits", () => {
  it("lets a charge that exactly exhausts the balance through", () => {
    expect(fitsWithin(parseSen("100"), parseSen("100"))).toBe(true);
    expect(fitsWithin(parseSen("100"), parseSen("100.01"))).toBe(false);
  });
});

describe("the allocation ledger, line by line", () => {
  const write = (d: Date) => d.toISOString().slice(0, 10);

  it("reads original, then what moved it, then the total", () => {
    const lines = ledgerLines(
      [
        move("ORIGINAL", "12400000.00"),
        move("TRANSFER_IN", "941000.00", {
          occurredOn: new Date("2026-06-17"),
          reference: "BT26-660",
          counterpartCode: "CAP26-014",
        }),
      ],
      "b1",
      ON,
      write,
    );
    expect(lines.map((l) => l.label)).toEqual([
      "Original",
      "Transferred in · CAP26-014",
      "Current allocation",
    ]);
    expect(lines[1].note).toBe("BT26-660 · 2026-06-17");
    expect(lines[1].adds).toBe(true);
    expect(formatSen(lines[2].amount)).toBe("RM13,341,000.00");
  });

  it("leaves commitments and spend out — they do not change the allocation", () => {
    const lines = ledgerLines(
      [move("ORIGINAL", "100.00"), move("COMMITMENT", "50.00"), move("ACTUAL_SPEND", "20.00")],
      "b1",
      ON,
      write,
    );
    expect(lines.map((l) => l.label)).toEqual(["Original", "Current allocation"]);
  });

  it("marks a transfer out as taking away", () => {
    const lines = ledgerLines([move("TRANSFER_OUT", "95000.00")], "b1", ON, write);
    expect(lines[0].adds).toBe(false);
  });

  it("reads a downward revision as taking away, at its size", () => {
    const lines = ledgerLines(
      [move("ORIGINAL", "1000.00"), move("REVISION", "-250.00")],
      "b1",
      ON,
      write,
    );
    expect(lines[1].label).toBe("Revised down");
    expect(lines[1].adds).toBe(false);
    expect(formatSen(lines[1].amount)).toBe("RM250.00");
    expect(formatSen(lines[2].amount)).toBe("RM750.00");
  });
});

describe("refusing a transfer", () => {
  const AVAILABLE = parseSen("1000");

  it("allows one the source can afford", () => {
    expect(transferFaults("a", "b", parseSen("1000"), AVAILABLE)).toEqual([]);
  });

  it("refuses moving money to the same code", () => {
    expect(transferFaults("a", "a", parseSen("10"), AVAILABLE)).toContain("SAME_CODE");
  });

  it("refuses nothing, and refuses a negative", () => {
    expect(transferFaults("a", "b", parseSen("0"), AVAILABLE)).toContain("NOT_POSITIVE");
  });

  it("refuses more than the source has", () => {
    expect(transferFaults("a", "b", parseSen("1000.01"), AVAILABLE)).toContain(
      "MORE_THAN_AVAILABLE",
    );
  });

  it("names a missing side", () => {
    expect(transferFaults("", "b", parseSen("10"), AVAILABLE)).toContain("NO_SOURCE");
    expect(transferFaults("a", "", parseSen("10"), AVAILABLE)).toContain("NO_DESTINATION");
  });
});
