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

describe("a change of value re-opens a submitted or reviewed proposal (ruling on BD-5)", () => {
  it("re-opens as a draft on a change of method or of value, keeping nothing else", async () => {
    const { proposalStateFor } = await import("./proposal");
    const valueChanged = true;
    expect(proposalStateFor(true, "SUBMITTED", valueChanged)).toBe("DRAFT");
    expect(proposalStateFor(true, "REVIEWED", valueChanged)).toBe("DRAFT");
    expect(proposalStateFor(true, "SUBMITTED", false)).toBe("SUBMITTED");
  });
  it("clears the submission, the review and the record on a change of value alone", async () => {
    const { proposalReopen } = await import("./proposal");
    const r = proposalReopen(true, "REVIEWED", { methodChanged: false, valueChanged: true });
    expect(r.proposalState).toBe("DRAFT");
    expect(r.cleared).toEqual({ proposalSubmittedOn: null, proposalReviewedOn: null, proposalReviewerPersonId: null, proposalReviewComment: "" });
    expect(r.clearRecord).toBe(true);
    expect(proposalReopen(true, "SUBMITTED", { methodChanged: true, valueChanged: false }).clearRecord).toBe(true);
    const kept = proposalReopen(true, "REVIEWED", { methodChanged: false, valueChanged: false });
    expect(kept).toEqual({ proposalState: "REVIEWED", cleared: {}, clearRecord: false });
  });
});

describe("the proposal as submitted (ruling on the proposal record)", () => {
  it("stores each item's key, wording and required flag with its answer", async () => {
    const { proposalRecordOf } = await import("./proposal");
    const rec = proposalRecordOf(TEN_ITEMS, answers(), on);
    expect(rec.items).toHaveLength(10);
    expect(rec.items[4]).toEqual({ key: "e", label: "Item (e)", required: true, answer: "Answer e" });
  });
  it("a submitted proposal renders from the record: a retired or reworded item's answer still shows", async () => {
    const { proposalRecordOf, proposalView } = await import("./proposal");
    const rec = proposalRecordOf(TEN_ITEMS, answers(), on);
    const later = TEN_ITEMS.map((i) => (i.key === "e" ? { ...i, retiredOn: new Date("2026-09-01") } : i.key === "a" ? { ...i, labelEn: "Reworded" } : i));
    const view = proposalView("REVIEWED", rec, later, answers(), new Date("2026-10-30T00:00:00Z"));
    expect(view.fromRecord).toBe(true);
    expect(view.rows.find((r) => r.key === "e")?.answer).toBe("Answer e");
    expect(view.rows.find((r) => r.key === "a")?.label).toBe("Item (a)");
  });
  it("a proposal being prepared shows the items in force", async () => {
    const { proposalView } = await import("./proposal");
    const later = TEN_ITEMS.map((i) => (i.key === "e" ? { ...i, retiredOn: new Date("2026-09-01") } : i));
    const view = proposalView("DRAFT", null, later, answers(), on);
    expect(view.fromRecord).toBe(false);
    expect(view.rows.map((r) => r.key)).not.toContain("e");
  });
  it("one submitted before the record was kept says it is not from the record", async () => {
    const { proposalView } = await import("./proposal");
    expect(proposalView("SUBMITTED", null, TEN_ITEMS, answers(), on).fromRecord).toBe(false);
  });
});
