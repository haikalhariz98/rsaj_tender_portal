import { describe, expect, it } from "vitest";

import { formatSen } from "@/lib/money";

import { movementRows, movementStatus, spendByPeriod, utilisationByUnit } from "./analysis";
import type { BudgetCode, Movement, MovementKind } from "./codes";
import type { Period } from "./periods";

let seq = 0;
const move = (
  kind: MovementKind,
  amount: string,
  occurredOn: string,
  extra: Partial<Movement> = {},
  budgetCodeId = "b1",
): Movement => ({
  id: `m${++seq}`,
  budgetCodeId,
  kind,
  reference: "",
  description: "",
  amount,
  occurredOn: new Date(occurredOn),
  releasedOn: null,
  releaseNote: "",
  counterpartCode: null,
  ...extra,
});

const code = (id: string, owningUnitCode: string | null = null): BudgetCode => ({
  id,
  code: id.toUpperCase(),
  descriptionEn: id,
  descriptionMs: null,
  type: "",
  owningUnitCode,
  accountCode: "",
  holderPersonId: null,
  isActive: true,
  effectiveFrom: new Date("2026-01-01"),
  effectiveTo: null,
});

const period = (n: number): Period => ({
  id: `p${n}`,
  year: 2026,
  code: `P${String(n).padStart(2, "0")}`,
  nameEn: `Period ${n}`,
  nameMs: null,
  startsOn: new Date(`2026-${String(n).padStart(2, "0")}-01`),
  endsOn: new Date(2026, n, 0),
  openedOn: null,
  closedOn: null,
  sortOrder: n,
});

describe("spend against allocation", () => {
  const periods = [period(1), period(2), period(3)];
  const codes = [code("b1")];

  it("accumulates across the year rather than reporting each period alone", () => {
    const movements = [
      move("ORIGINAL", "1000.00", "2026-01-01"),
      move("ACTUAL_SPEND", "100.00", "2026-01-15"),
      move("ACTUAL_SPEND", "200.00", "2026-02-15"),
    ];
    const rows = spendByPeriod(periods, codes, movements);
    expect(rows.map((r) => formatSen(r.actualSpend))).toEqual(["RM100.00", "RM300.00", "RM300.00"]);
  });

  it("reads each point as at that period's end, so a later movement has not happened", () => {
    const movements = [
      move("ORIGINAL", "1000.00", "2026-01-01"),
      move("REVISION", "500.00", "2026-03-10"),
    ];
    const rows = spendByPeriod(periods, codes, movements);
    expect(rows.map((r) => formatSen(r.allocated))).toEqual([
      "RM1,000.00",
      "RM1,000.00",
      "RM1,500.00",
    ]);
  });

  it("adds commitments on top of spend for the third line", () => {
    const movements = [
      move("ORIGINAL", "1000.00", "2026-01-01"),
      move("ACTUAL_SPEND", "100.00", "2026-01-15"),
      move("COMMITMENT", "250.00", "2026-01-20"),
    ];
    const [first] = spendByPeriod(periods, codes, movements);
    expect(formatSen(first.spendPlusCommitments)).toBe("RM350.00");
  });
});

describe("utilisation by department", () => {
  it("groups codes under the unit that owns them", () => {
    const codes = [code("b1", "OPS"), code("b2", "OPS"), code("b3", "FIN")];
    const movements = [
      move("ORIGINAL", "1000.00", "2026-01-01"),
      move("ORIGINAL", "1000.00", "2026-01-01", {}, "b2"),
      move("ACTUAL_SPEND", "500.00", "2026-02-01", {}, "b2"),
      move("ORIGINAL", "4000.00", "2026-01-01", {}, "b3"),
    ];
    const rows = utilisationByUnit(codes, movements, new Date("2026-06-30"));
    const ops = rows.find((r) => r.unitCode === "OPS")!;
    expect(formatSen(ops.allocated)).toBe("RM2,000.00");
    expect(ops.utilisation).toBe(25);
    expect(rows.find((r) => r.unitCode === "FIN")!.utilisation).toBe(0);
  });

  it("keeps codes nobody owns rather than dropping them", () => {
    // A budget with no owning department is exactly what somebody needs to see.
    const rows = utilisationByUnit(
      [code("b1", null)],
      [move("ORIGINAL", "100.00", "2026-01-01")],
      new Date("2026-06-30"),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].unitCode).toBe("");
  });

  it("reports no utilisation for a unit whose codes carry no allocation", () => {
    const rows = utilisationByUnit([code("b1", "OPS")], [], new Date("2026-06-30"));
    expect(rows[0].utilisation).toBeNull();
  });

  it("puts the busiest department first", () => {
    const codes = [code("b1", "LOW"), code("b2", "HIGH")];
    const movements = [
      move("ORIGINAL", "1000.00", "2026-01-01"),
      move("ACTUAL_SPEND", "100.00", "2026-02-01"),
      move("ORIGINAL", "1000.00", "2026-01-01", {}, "b2"),
      move("ACTUAL_SPEND", "900.00", "2026-02-01", {}, "b2"),
    ];
    const rows = utilisationByUnit(codes, movements, new Date("2026-06-30"));
    expect(rows.map((r) => r.unitCode)).toEqual(["HIGH", "LOW"]);
  });
});

describe("the movements list", () => {
  const on = new Date("2026-06-30");

  it("is newest first", () => {
    const rows = movementRows(
      [
        move("ORIGINAL", "100.00", "2026-01-01"),
        move("ACTUAL_SPEND", "20.00", "2026-05-01"),
        move("COMMITMENT", "30.00", "2026-03-01"),
      ],
      "b1",
      on,
    );
    expect(rows.map((r) => r.occurredOn.getMonth())).toEqual([4, 2, 0]);
  });

  it("keeps a released commitment on the list", () => {
    // It held budget for a time. A trail that drops it cannot explain the balance.
    const rows = movementRows(
      [move("COMMITMENT", "30.00", "2026-03-01", { releasedOn: new Date("2026-04-01") })],
      "b1",
      on,
    );
    expect(rows).toHaveLength(1);
    expect(movementStatus(rows[0], on)).toBe("Released");
  });

  it("reads a commitment still holding as committed", () => {
    const rows = movementRows([move("COMMITMENT", "30.00", "2026-03-01")], "b1", on);
    expect(movementStatus(rows[0], on)).toBe("Committed");
  });

  it("names spend and allocation movements for what they are", () => {
    const [spend] = movementRows([move("ACTUAL_SPEND", "1.00", "2026-03-01")], "b1", on);
    const [alloc] = movementRows([move("TRANSFER_IN", "1.00", "2026-03-01")], "b1", on);
    expect(movementStatus(spend, on)).toBe("Actual spend");
    expect(movementStatus(alloc, on)).toBe("Allocation");
  });
});
