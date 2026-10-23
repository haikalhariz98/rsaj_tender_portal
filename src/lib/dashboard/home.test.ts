import { describe, expect, it } from "vitest";

import type { MyStep } from "@/lib/approvals/queue";

import { needsYou, nonZeroParts, waitedLabel } from "./home";

const step = (id: string, barred = false): MyStep =>
  ({ barred, via: "HOLDER", relation: null, item: { stepId: id, matterLabel: `Matter ${id}`, matterKindLabel: "Requisition", officeLabel: "Head of Department", waitingDays: 2, href: `/requisitions/${id}` } }) as unknown as MyStep;
const matter = (id: string, committeeCode: string, waitingDays: number) => ({ decisionId: id, committeeCode, committeeName: `Committee ${committeeCode}`, subject: `Subject ${id}`, meetingId: `m-${id}`, waitingDays });

describe("needsYou", () => {
  it("lists my steps first, then the matters of my committees only, oldest first, and leaves out a step I am barred from", () => {
    const rows = needsYou([step("a"), step("b", true)], [matter("1", "X", 3), matter("2", "Y", 9), matter("3", "X", 7)], new Set(["X"]));
    expect(rows.map((r) => r.key)).toEqual(["step:a", "matter:3", "matter:1"]);
    expect(rows[1]).toMatchObject({ waitingOn: "Committee X", href: "/committees/m-3", days: 7 });
  });
  it("is empty when nothing is mine", () => expect(needsYou([], [matter("1", "Y", 1)], new Set())).toEqual([]));
});

describe("home wording helpers", () => {
  it("says how long, and says nothing when the wait is not counted", () => {
    expect([0, 1, 4, null].map(waitedLabel)).toEqual(["today", "1 day", "4 days", null]);
  });
  it("hides zero parts", () => {
    expect(nonZeroParts([[2, "approved"], [0, "sent back"]])).toBe("2 approved");
    expect(nonZeroParts([[0, "a"], [0, "b"]])).toBe("");
  });
});
