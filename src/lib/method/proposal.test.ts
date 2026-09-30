import { describe, expect, it } from "vitest";

import { TEN_ITEMS } from "./fixture";
import { nameRequestProposalFault, proposalFaults, proposalTransition } from "./proposal";

const on = new Date("2026-09-30T00:00:00Z");
const answers = (skip: string[] = [], blank: Record<string, string> = {}) =>
  TEN_ITEMS.filter((i) => !skip.includes(i.key)).map((i) => ({ itemKey: i.key, text: blank[i.key] ?? `Answer ${i.key}` }));

describe("the ten-item proposal (FR-MTD-006)", () => {
  it("with item (e) empty it cannot be submitted, nor sent for name approval", () => {
    const faults = proposalFaults(TEN_ITEMS, answers(["e"]), on);
    expect(faults).toHaveLength(1);
    expect(faults[0].data?.item).toBe("Item (e)");
    expect(proposalTransition("DRAFT", "SUBMITTED", { faults, today: "2026-09-30" }).map((f) => f.code)).toContain("ITEM_EMPTY");
    expect(nameRequestProposalFault(true, "DRAFT")?.code).toBe("NOT_REVIEWED");
  });
  it("whitespace counts as empty", () => {
    expect(proposalFaults(TEN_ITEMS, answers([], { e: "   " }), on)).toHaveLength(1);
  });
  it("retired items are ignored", () => {
    const items = TEN_ITEMS.map((i) => (i.key === "e" ? { ...i, retiredOn: new Date("2026-01-01") } : i));
    expect(proposalFaults(items, answers(["e"]), on)).toEqual([]);
  });
  it("no items configured is not complete", () => {
    expect(proposalFaults([], [], on).map((f) => f.code)).toEqual(["ITEMS_NOT_SET"]);
  });
  it("all ten answered: submitted, then reviewed by a named reviewer, then the name may be sent", () => {
    expect(proposalTransition("DRAFT", "SUBMITTED", { faults: proposalFaults(TEN_ITEMS, answers(), on), today: "2026-09-30" })).toEqual([]);
    expect(proposalTransition("SUBMITTED", "REVIEWED", { faults: [], reviewerPersonId: null, today: "2026-09-30" }).map((f) => f.code)).toEqual(["REVIEWER_REQUIRED"]);
    expect(proposalTransition("SUBMITTED", "REVIEWED", { faults: [], reviewerPersonId: "p", on: "2026-09-30", today: "2026-09-30" })).toEqual([]);
    expect(nameRequestProposalFault(true, "REVIEWED")).toBeNull();
  });
  it("only a submitted proposal is reviewed; a review is not dated after today; the zone must be set", () => {
    expect(proposalTransition("DRAFT", "REVIEWED", { faults: [], reviewerPersonId: "p", today: "2026-09-30" }).map((f) => f.code)).toEqual(["NOT_SUBMITTED"]);
    expect(proposalTransition("SUBMITTED", "REVIEWED", { faults: [], reviewerPersonId: "p", on: "2026-10-01", today: "2026-09-30" }).map((f) => f.code)).toEqual(["FUTURE_DATE"]);
    expect(proposalTransition("DRAFT", "SUBMITTED", { faults: [], today: null }).map((f) => f.code)).toEqual(["TIME_ZONE_UNSET"]);
  });
  it("a method without a proposal needs no review before the name", () => {
    expect(nameRequestProposalFault(false, null)).toBeNull();
  });
});

describe("choosing selected tender opens the proposal (FR-MTD-005)", () => {
  it("opens as a draft, holds none for other methods, re-opens on a change of method", async () => {
    const { proposalStateFor } = await import("./proposal");
    expect(proposalStateFor(true, null, true)).toBe("DRAFT");
    expect(proposalStateFor(false, "REVIEWED", true)).toBeNull();
    expect(proposalStateFor(true, "REVIEWED", false)).toBe("REVIEWED");
    expect(proposalStateFor(true, "REVIEWED", true)).toBe("DRAFT");
  });
});
