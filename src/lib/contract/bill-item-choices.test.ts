import { describe, expect, it } from "vitest";

import { BILL_ITEM_CAP, billItemChoices, billItemFault } from "./bill-item-choices";

describe("billItemChoices", () => {
  it("offers each reference once, in the bill's order, as reference and description", () => {
    const r = billItemChoices([
      { number: "1", items: [{ itemRef: "1.1", description: "Excavate" }, { itemRef: "", description: "A heading" }] },
      { number: "2", items: [{ itemRef: "1.1", description: "Same ref again" }, { itemRef: " 2.1 ", description: "Pour" }] },
    ]);
    expect(r.options).toEqual([{ value: "1.1", label: "1.1 — Excavate" }, { value: "2.1", label: "2.1 — Pour" }]);
    expect(r.truncated).toBe(false);
  });

  it("says when the bill is longer than the list can hold", () => {
    const items = Array.from({ length: BILL_ITEM_CAP + 1 }, (_, i) => ({ itemRef: `R${i}`, description: "x" }));
    const r = billItemChoices([{ number: "1", items }]);
    expect(r.options).toHaveLength(BILL_ITEM_CAP);
    expect(r.truncated).toBe(true);
  });

  it("an empty or unpinned bill offers nothing", () => {
    expect(billItemChoices([])).toEqual({ options: [], truncated: false });
  });
});

describe("billItemFault", () => {
  const bill = { options: [{ value: "1.1" }], truncated: false };
  it("refuses a reference not in a pinned bill", () => expect(billItemFault(bill, "9.9")).toMatch(/Choose an item/));
  it("accepts one in it, and lets anything through where the bill is not pinned or was cut", () => {
    expect(billItemFault(bill, "1.1")).toBeNull();
    expect(billItemFault({ options: [], truncated: false }, "9.9")).toBeNull();
    expect(billItemFault({ ...bill, truncated: true }, "9.9")).toBeNull();
    expect(billItemFault(bill, " ")).toBeNull();
  });
});
