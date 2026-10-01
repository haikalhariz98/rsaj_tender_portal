import { describe, expect, it } from "vitest";

import { SPEC_MATRIX, SPEC_METHODS } from "@/lib/method/fixture";
import { WINDOW_CHANGE_DOMAIN, type Method } from "@/lib/method/types";
import type { FunderContext } from "@/lib/method/approval";

import { appliedChangeFaults, authorityFault, cancelFaults, closingChangeFaults, resolveWindowChange, windowChangeRouteForRequester, type ClosingChangeInput } from "./change";
import { klAt, SPEC_CALENDAR, SPEC_POLICY } from "./fixture";
import { CHANGE_ROUTE_TEXT, windowFindingText } from "./labels";

/**
 * FR-ADV-015, 016 (OD-5 A): a change is decided on the window_change route; refused once the
 * closing has passed; re-runs every date rule against the new dates from the ORIGINAL
 * advertisement day; a cancellation needs its reason and the refund answered, and an award
 * standing refuses it.
 */

const TZ = "Asia/Kuala_Lumpur";
const codes = (fs: { code: string; level: string }[]) => fs.filter((f) => f.level === "block").map((f) => f.code);
const ext = (over: Partial<ClosingChangeInput> = {}): ClosingChangeInput => ({
  kind: "EXTENSION",
  status: "ADVERTISED",
  now: new Date("2026-11-10T02:00:00Z"),
  currentClosingAt: klAt("2026-11-17"),
  toClosingAt: klAt("2026-11-24"),
  currentPurchaseCloseDay: "2026-11-15",
  toPurchaseCloseDay: "2026-11-20",
  reason: "Addendum 1 changes the drawings.",
  changePending: false,
  rules: { advertisementDay: "2026-11-03", closingTimeReason: "", timeZone: TZ, policy: SPEC_POLICY, calendar: SPEC_CALENDAR },
  ...over,
});

describe("an extension", () => {
  it("to a weekday later than the current closing passes every rule", () => expect(codes(closingChangeFaults(ext()))).toEqual([]));
  it("is refused once the current closing has passed", () => {
    expect(codes(closingChangeFaults(ext({ now: new Date("2026-11-17T06:30:00Z") })))).toContain("CLOSING_PASSED");
  });
  it("moves the closing later, never earlier or to the same instant", () => {
    expect(codes(closingChangeFaults(ext({ toClosingAt: klAt("2026-11-17"), toPurchaseCloseDay: "2026-11-15" })))).toEqual(["UNCHANGED", "NOT_LATER"]);
  });
  it("re-runs the date rules from the original advertisement day: a Saturday, a holiday and the cut-off", () => {
    expect(codes(closingChangeFaults(ext({ toClosingAt: klAt("2026-11-28"), toPurchaseCloseDay: "2026-11-24" })))).toEqual(["CLOSING_ON_WEEKEND"]);
    expect(codes(closingChangeFaults(ext({ toClosingAt: klAt("2026-12-25"), toPurchaseCloseDay: "2026-12-20" })))).toEqual(["PUBLIC_HOLIDAY"]);
    expect(codes(closingChangeFaults(ext({ toPurchaseCloseDay: "2026-11-23" })))).toEqual(["PURCHASE_CUTOFF_TOO_LATE"]);
  });
  it("is asked only of a published exercise, with a reason, one change at a time", () => {
    expect(codes(closingChangeFaults(ext({ status: "APPROVED_FOR_TENDERING" })))).toEqual(["NOT_PUBLISHED"]);
    expect(codes(closingChangeFaults(ext({ reason: " " })))).toEqual(["REASON_REQUIRED"]);
    expect(codes(closingChangeFaults(ext({ changePending: true })))).toEqual(["CHANGE_PENDING"]);
  });
  it("a new closing that is not one is refused", () => expect(codes(closingChangeFaults(ext({ toClosingAt: null })))).toEqual(["NEW_CLOSING_NOT_VALID"]));

  // Worked example: closing Tue 17 Nov 14:30, sale closed after Sun 15 Nov. On Mon 16 Nov (closed
  // for purchase) the officer asks to extend the closing to Tue 24 Nov, leaving the last day of sale
  // where it is. The 15th is in the past, but the extension does not move it, so it is not refused.
  it("asked while closed for purchase, keeping the last day of sale, is not refused for that past day", () => {
    const asked = ext({ now: new Date("2026-11-16T02:00:00Z"), toPurchaseCloseDay: "2026-11-15", rules: { ...ext().rules, today: "2026-11-16" } });
    expect(codes(closingChangeFaults(asked))).toEqual([]);
  });
  it("asked while closed for purchase, moving the last day of sale to another past day, is refused", () => {
    const asked = ext({ now: new Date("2026-11-16T02:00:00Z"), toPurchaseCloseDay: "2026-11-14", rules: { ...ext().rules, today: "2026-11-16" } });
    expect(codes(closingChangeFaults(asked))).toEqual(["PURCHASE_CLOSE_IN_PAST"]);
  });
  it("asked while closed for purchase, reopening the sale to a future day, passes", () => {
    const asked = ext({ now: new Date("2026-11-16T02:00:00Z"), toPurchaseCloseDay: "2026-11-20", rules: { ...ext().rules, today: "2026-11-16" } });
    expect(codes(closingChangeFaults(asked))).toEqual([]);
  });
});

describe("applying an approved extension (the approving step's re-run)", () => {
  // Closing Tue 24 Nov 14:30, last day of sale Sun 15 Nov. Asked Tue 10 Nov: closing to Tue 1 Dec,
  // last day of sale to Thu 19 Nov. Approved Mon 23 Nov (09:00 in Kuala Lumpur): the 19th has
  // passed, the current closing has not.
  const asked = { ...ext(), now: new Date("2026-11-23T01:00:00Z"), currentClosingAt: klAt("2026-11-24"), currentPurchaseCloseDay: "2026-11-15", toClosingAt: klAt("2026-12-01"), toPurchaseCloseDay: "2026-11-19", rules: { ...ext().rules, today: "2026-11-23" } };
  it("judges a moved last day of sale against the day of approval: one that has passed while the change waited is not applied", () => {
    expect(codes(appliedChangeFaults(asked))).toEqual(["PURCHASE_CLOSE_IN_PAST"]);
  });
  it("the same change approved before that day passes", () => {
    expect(codes(appliedChangeFaults({ ...asked, now: new Date("2026-11-18T01:00:00Z"), rules: { ...asked.rules, today: "2026-11-18" } }))).toEqual([]);
  });
  it("a last day of sale the change does not move is not judged, however long ago it was", () => {
    expect(codes(appliedChangeFaults({ ...asked, toPurchaseCloseDay: "2026-11-15" }))).toEqual([]);
  });
  it("is still refused when the current closing passed while it waited", () => {
    expect(codes(appliedChangeFaults({ ...asked, now: new Date("2026-11-24T07:00:00Z"), toPurchaseCloseDay: "2026-11-15" }))).toEqual(["CLOSING_PASSED"]);
  });
  it("an unchanged request is no fault at the approving step", () => {
    expect(codes(appliedChangeFaults({ ...ext(), toClosingAt: klAt("2026-11-17"), toPurchaseCloseDay: "2026-11-15", kind: "CORRECTION", status: "APPROVED_FOR_TENDERING" }))).toEqual([]);
  });
});

describe("a correction before publication", () => {
  const corr = (over: Partial<ClosingChangeInput> = {}) => ext({ kind: "CORRECTION", status: "APPROVED_FOR_TENDERING", currentClosingAt: klAt("2026-11-21"), currentPurchaseCloseDay: "2026-11-19", toClosingAt: klAt("2026-11-24"), toPurchaseCloseDay: "2026-11-20", rules: { ...ext().rules, advertisementDay: null }, ...over });
  it("fixes a Saturday closing; the days to the closing wait for the advertisement", () => {
    const fs = closingChangeFaults(corr());
    expect(codes(fs)).toEqual([]);
    expect(fs.find((f) => f.code === "ADVERTISEMENT_DAY_NOT_KNOWN")?.level).toBe("info");
  });
  it("may move the closing earlier, but is refused once published", () => {
    expect(codes(closingChangeFaults(corr({ toClosingAt: klAt("2026-11-20"), toPurchaseCloseDay: "2026-11-18" })))).toEqual([]);
    expect(codes(closingChangeFaults(corr({ status: "ADVERTISED" })))).toEqual(["ALREADY_PUBLISHED"]);
  });
});

describe("the route's authority", () => {
  it("only an approved route applies a change", () => {
    expect(authorityFault("APPROVED")).toBeNull();
    for (const s of ["PENDING", "REJECTED", "RECALLED", null]) expect(authorityFault(s)?.code).toBe("AUTHORITY_NOT_RECORDED");
  });
  const m = (code: string): Method => SPEC_METHODS.find((x) => x.code === code)!;
  const general = { ...SPEC_MATRIX.rules.find((x) => x.ruleKey === "NAME_QUOTATION")!, ruleKey: "WC", domain: WINDOW_CHANGE_DOMAIN, approverCode: "FD", recommenders: [] };
  const ctx = (rules: typeof SPEC_MATRIX.rules): FunderContext => ({ dal: { ...SPEC_MATRIX, rules: [...SPEC_MATRIX.rules, ...rules] }, override: null, supersedes: false });
  it("no rule refuses naming the approval matrix; a committee step is refused with its exit", () => {
    expect(resolveWindowChange(ctx([]), m("selective_quotation"), 80_000, "EXTENSION").changeState).toBe("NO_RULE");
    expect(CHANGE_ROUTE_TEXT.NO_RULE).toMatch(/approval matrix/);
    expect(resolveWindowChange(ctx([{ ...general, recommenders: [{ roleCode: "QC", act: "R" as const }] }]), m("selective_quotation"), 80_000, "EXTENSION").changeState).toBe("HAS_COMMITTEE_STEP");
    expect(resolveWindowChange(ctx([general]), m("selective_quotation"), 80_000, "CANCELLATION")).toMatchObject({ changeState: "RESOLVED", approverCode: "FD" });
  });
  it("the requester never approves their own change: with nowhere to escalate it is refused, naming the office", () => {
    const requester = { id: "p1", holds: (c: string) => c === "FD", ableToAct: () => ({ holderIds: ["p1", "p2"], delegateIds: [] }) };
    const r = windowChangeRouteForRequester(ctx([general]), m("selective_quotation"), 80_000, "EXTENSION", requester);
    expect(r.refusal).toMatch(/approves a change to the closing \(Functional Director\)/);
  });
});

describe("cancelling a published exercise (FR-ADV-016)", () => {
  const ok = { status: "ADVERTISED" as const, reason: "The scope is withdrawn.", feeRefund: true, changePending: false, awardStands: null, today: "2026-11-10" };
  it("passes with a reason and the refund answered either way", () => {
    expect(cancelFaults(ok)).toEqual([]);
    expect(cancelFaults({ ...ok, feeRefund: false })).toEqual([]);
  });
  it("refuses without a reason or with the refund unanswered", () => {
    expect(codes(cancelFaults({ ...ok, reason: "" }))).toEqual(["REASON_REQUIRED"]);
    expect(codes(cancelFaults({ ...ok, feeRefund: null }))).toEqual(["REFUND_NOT_ANSWERED"]);
  });
  it("refuses while an award stands (6.11 BD-29's mirror), naming it", () => {
    const fs = cancelFaults({ ...ok, awardStands: "AW/2026/3" });
    expect(codes(fs)).toEqual(["AWARD_STANDS"]);
    expect(windowFindingText(fs[0])).toBe("Award AW/2026/3 stands on this exercise. Cancel the award first, from its own record.");
  });
  it("is for a published exercise: before publication the exercise's own cancel act is used", () => {
    expect(codes(cancelFaults({ ...ok, status: "APPROVED_FOR_TENDERING" }))).toEqual(["NOT_PUBLISHED"]);
    expect(codes(cancelFaults({ ...ok, status: "INVITED" }))).toEqual([]);
  });
  it("one change at a time", () => expect(codes(cancelFaults({ ...ok, changePending: true }))).toEqual(["CHANGE_PENDING"]));
});
