import { describe, expect, it } from "vitest";

import { CONTRACTOR, person } from "./party";
import { MY_WORK_SECTIONS, myWorkGroup, myWorkHref, myWorkWhere, parseMyWorkAddress, type MyWorkFacts } from "./my-work";

/** My work (0008 §5.6; WB-10): who an item is on, which group, and the address that carries the contract. */

const ME = { personId: "me" };
const TODAY = "2026-11-05";
const mine = (o: Partial<MyWorkFacts> = {}): MyWorkFacts => ({ status: "TO_DO", raisedBy: person("boss"), assignee: person("me"), dueOn: null, ...o });

describe("myWorkGroup", () => {
  it("splits the dated groups on the organisation's today: late, today, this week (+1 to +6), later", () => {
    const at = (dueOn: string) => myWorkGroup(mine({ dueOn }), ME, TODAY);
    expect(at("2026-11-04")).toBe("LATE");
    expect(at("2026-11-05")).toBe("TODAY");
    expect(at("2026-11-06")).toBe("THIS_WEEK");
    expect(at("2026-11-11")).toBe("THIS_WEEK");
    expect(at("2026-11-12")).toBe("LATER");
    expect(myWorkGroup(mine(), ME, TODAY)).toBe("NO_DATE");
  });

  it("with no time zone the dated groups collapse to one Open; no date and To check stay", () => {
    expect(myWorkGroup(mine({ dueOn: "2020-01-01" }), ME, null)).toBe("OPEN");
    expect(myWorkGroup(mine({ dueOn: "2099-01-01" }), ME, null)).toBe("OPEN");
    expect(myWorkGroup(mine(), ME, null)).toBe("NO_DATE");
    expect(myWorkGroup(mine({ status: "IN_REVIEW", raisedBy: person("me"), assignee: person("x") }), ME, null)).toBe("TO_CHECK");
  });

  it("To check is an item I raised that is In review, whoever holds it, and wins over its date", () => {
    expect(myWorkGroup(mine({ status: "IN_REVIEW", raisedBy: person("me"), assignee: CONTRACTOR, dueOn: "2026-01-01" }), ME, TODAY)).toBe("TO_CHECK");
    expect(myWorkGroup(mine({ status: "IN_REVIEW", raisedBy: person("me"), assignee: null }), ME, TODAY)).toBe("TO_CHECK");
    expect(myWorkGroup(mine({ status: "IN_PROGRESS", raisedBy: person("me"), assignee: person("x") }), ME, TODAY)).toBeNull();
  });

  it("is not on me when closed, assigned to someone else or to the contractor", () => {
    expect(myWorkGroup(mine({ status: "DONE" }), ME, TODAY)).toBeNull();
    expect(myWorkGroup(mine({ status: "CANCELLED", raisedBy: person("me") }), ME, TODAY)).toBeNull();
    expect(myWorkGroup(mine({ assignee: person("other") }), ME, TODAY)).toBeNull();
    expect(myWorkGroup(mine({ assignee: CONTRACTOR }), ME, TODAY)).toBeNull();
    expect(myWorkGroup(mine({ assignee: null }), ME, TODAY)).toBeNull();
  });

  it("an item assigned to me and In review, raised by someone else, is dated, not To check", () => {
    expect(myWorkGroup(mine({ status: "IN_REVIEW", dueOn: TODAY }), ME, TODAY)).toBe("TODAY");
  });

  it("every group has a place in the order", () => {
    expect(MY_WORK_SECTIONS).toHaveLength(7);
  });
});

describe("myWorkWhere", () => {
  it("is assigned to me and open, or raised by me and In review", () => {
    expect(myWorkWhere(ME)).toEqual({
      OR: [
        { assigneePersonId: "me", status: { in: ["TO_DO", "IN_PROGRESS", "IN_REVIEW"] } },
        { raisedByPersonId: "me", status: "IN_REVIEW" },
      ],
    });
  });
});

describe("the address", () => {
  it("carries the contract with the item, so two contracts' RFI 1 are told apart", () => {
    expect(myWorkHref({ contract: "c1", item: "RFI-1" })).toBe("/my-work?contract=c1&item=RFI-1");
    expect(parseMyWorkAddress({ contract: "c2", item: "RFI-1" })).toEqual({ contract: "c2", item: "RFI-1" });
    expect(myWorkHref(null)).toBe("/my-work");
  });
  it("drops an item with no contract, a contract with no item, and a word that is not a reference", () => {
    const none = { contract: null, item: null };
    expect(parseMyWorkAddress({ item: "RFI-1" })).toEqual(none);
    expect(parseMyWorkAddress({ contract: "c1" })).toEqual(none);
    expect(parseMyWorkAddress({ contract: "c1", item: "rfi-1" })).toEqual(none);
    expect(parseMyWorkAddress({ contract: "x".repeat(101), item: "RFI-1" })).toEqual(none);
  });
});
