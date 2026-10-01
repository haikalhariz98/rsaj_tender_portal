import { describe, expect, it } from "vitest";

import { formatSen } from "@/lib/money";

import type { BudgetCode, Movement, MovementKind } from "./codes";
import { exampleSentence, outcomeFor, outcomeTitle, workedExample } from "./controls";

const ON = new Date("2026-06-30");

let seq = 0;
const move = (kind: MovementKind, amount: string, budgetCodeId = "b1"): Movement => ({
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
});

const code = (id: string): BudgetCode => ({
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
});

describe("what happens to a requirement", () => {
  it("releases one that fits, whatever the check is set to", () => {
    expect(outcomeFor("blocking", true)).toBe("RELEASED");
    expect(outcomeFor("advisory", true)).toBe("RELEASED");
    expect(outcomeFor(null, true)).toBe("RELEASED");
  });

  it("holds one that does not fit when the check blocks", () => {
    expect(outcomeFor("blocking", false)).toBe("HELD");
  });

  it("lets one through with a warning when the check is advisory", () => {
    expect(outcomeFor("advisory", false)).toBe("ALLOWED_WITH_WARNING");
  });

  it("will not say what happens when nobody has configured the check", () => {
    // Guessing either way tells an officer the portal will do something it may not.
    expect(outcomeFor(null, false)).toBe("NOT_SET");
    expect(outcomeFor("", false)).toBe("NOT_SET");
  });
});

describe("the worked example", () => {
  const codes = [code("b1")];
  const movements = [move("ORIGINAL", "1000.00"), move("ACTUAL_SPEND", "600.00")];

  it("asks about one sen more than is left, so the setting actually shows", () => {
    const e = workedExample(codes, movements, "blocking", ON)!;
    expect(formatSen(e.available)).toBe("RM400.00");
    expect(formatSen(e.amount)).toBe("RM400.01");
    expect(e.outcome).toBe("HELD");
  });

  it("changes its answer when the check changes", () => {
    expect(workedExample(codes, movements, "advisory", ON)!.outcome).toBe("ALLOWED_WITH_WARNING");
    expect(workedExample(codes, movements, null, ON)!.outcome).toBe("NOT_SET");
  });

  it("picks the code closest to running out", () => {
    const many = [code("b1"), code("b2")];
    const mv = [
      move("ORIGINAL", "1000.00"),
      move("ACTUAL_SPEND", "100.00"),
      move("ORIGINAL", "1000.00", "b2"),
      move("ACTUAL_SPEND", "900.00", "b2"),
    ];
    expect(workedExample(many, mv, "blocking", ON)!.code.id).toBe("b2");
  });

  it("has nothing to illustrate when no code carries an allocation", () => {
    // Better than inventing a code and an amount to show off with.
    expect(workedExample([code("b1")], [], "blocking", ON)).toBeNull();
    expect(workedExample([], [], "blocking", ON)).toBeNull();
  });

  it("reports where utilisation would land", () => {
    const e = workedExample(codes, movements, "blocking", ON)!;
    // 600 spent plus the 400.01 asked for, over 1000 allocated.
    expect(e.utilisationAfter).toBeCloseTo(100, 1);
  });
});

describe("an example that does not ask about an overspent code", () => {
  const two = [code("b1"), code("b2")];
  const mv = [
    move("ORIGINAL", "1000.00"),
    move("ACTUAL_SPEND", "1200.00"), // b1 is overspent by 200.00: the most utilised
    move("ORIGINAL", "1000.00", "b2"),
    move("ACTUAL_SPEND", "100.00", "b2"),
  ];

  it("prefers a code with a balance over a more utilised code that is already overspent", () => {
    const e = workedExample(two, mv, "blocking", ON)!;
    expect(e.code.id).toBe("b2");
    expect(e.overspent).toBe(false);
    expect(formatSen(e.amount)).toBe("RM900.01");
  });

  it("when every code is overspent, says so rather than asking for a sen more than a negative balance", () => {
    const e = workedExample([code("b1")], mv.slice(0, 2), "blocking", ON)!;
    expect(e.overspent).toBe(true);
    const text = exampleSentence(e, { amount: "RM0", available: "-RM200" });
    expect(text).toContain("already overspent");
    expect(text).toContain("any requirement on it would be held");
    expect(text).not.toContain("A requirement of");
  });

  it("titles the outcome in sentence case", () => {
    expect(outcomeTitle("HELD")).toBe("Held");
    expect(outcomeTitle("ALLOWED_WITH_WARNING")).toBe("Allowed with a warning");
  });
});
