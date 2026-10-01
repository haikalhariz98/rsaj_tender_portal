import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";

import { scopeFaultText } from "./labels";
import { issueFaults, itemFaults, nextIssueNo, priceFromSchedule, scheduleEditFault, scheduleInForce, schedulesInForce, startIssueFaults, type RateIssue } from "./rates";

const sen = parseSen;
const codes = (fs: { code: string }[]) => fs.map((f) => f.code);
const issue = (id: string, issueNo: number, status: RateIssue["status"], effectiveFrom: string | null, rate = "100.00", label = "Pipe works"): RateIssue => ({
  id, label, issueNo, status, effectiveFrom, items: [{ code: "P1", descriptionEn: "Lay 150mm pipe", unit: "m", rate: sen(rate) }],
});

describe("which issue is in force on a day (FR-EST-004)", () => {
  const issues = [issue("i1", 1, "SUPERSEDED", "2026-01-01", "100.00"), issue("i2", 2, "ISSUED", "2026-07-01", "110.00"), issue("i3", 3, "DRAFT", null, "999.00")];
  it("the one that took effect last on or before the day; a draft never", () => {
    expect(scheduleInForce(issues, "Pipe works", "2025-12-31")).toBeNull();
    expect(scheduleInForce(issues, "Pipe works", "2026-01-01")?.id).toBe("i1");
    expect(scheduleInForce(issues, "Pipe works", "2026-06-30")?.id).toBe("i1");
    expect(scheduleInForce(issues, "Pipe works", "2026-07-01")?.id).toBe("i2");
    expect(scheduleInForce(issues, "Other", "2026-07-01")).toBeNull();
  });
  it("an issue issued today to take effect later leaves the one before in force until then", () => {
    const later = [issue("i1", 1, "SUPERSEDED", "2026-01-01"), issue("i2", 2, "ISSUED", "2026-11-01")];
    expect(scheduleInForce(later, "Pipe works", "2026-10-01")?.id).toBe("i1");
    expect(schedulesInForce([...later, issue("o1", 1, "ISSUED", "2026-02-01", "5.00", "Electrical")], "2026-10-01").map((i) => i.id)).toEqual(["o1", "i1"]);
  });
});

describe("pricing a line from the schedule keeps what the issue said", () => {
  const issues = [issue("i1", 1, "ISSUED", "2026-01-01", "100.00")];
  it("snapshots the issue's label, number, effective day and rate", () => {
    expect(priceFromSchedule(issues, "Pipe works", "P1", "2026-09-01")).toEqual({
      ok: true,
      priced: { rate: sen("100.00"), rateScheduleId: "i1", rateItemCode: "P1", scheduleLabelSnapshot: "Pipe works", scheduleIssueSnapshot: "Issue 1", scheduleEffectiveFromSnapshot: "2026-01-01" },
    });
  });
  it("superseding the issue later leaves a priced line unchanged", () => {
    const priced = priceFromSchedule(issues, "Pipe works", "P1", "2026-09-01");
    const line = priced.ok ? { ...priced.priced } : null;
    const after = [{ ...issues[0], status: "SUPERSEDED" as const }, issue("i2", 2, "ISSUED", "2026-10-01", "120.00")];
    // The schedule moved on; the line is what it was, and pricing again today reads the new issue.
    expect(line).toEqual(priced.ok ? priced.priced : null);
    expect(line?.rate).toBe(sen("100.00"));
    const today = priceFromSchedule(after, "Pipe works", "P1", "2026-10-01");
    expect(today.ok && today.priced.rate).toBe(sen("120.00"));
    expect(today.ok && today.priced.scheduleIssueSnapshot).toBe("Issue 2");
  });
  it("refuses with no issue in force, an item the issue lacks, or no organisation day", () => {
    const none = priceFromSchedule(issues, "Pipe works", "P1", "2025-06-01");
    expect(!none.ok && none.fault.code).toBe("SCHEDULE_NOT_IN_FORCE");
    expect(!none.ok && scopeFaultText(none.fault)).toMatch(/No issue of Pipe works is in force/);
    const missing = priceFromSchedule(issues, "Pipe works", "P9", "2026-09-01");
    expect(!missing.ok && missing.fault.code).toBe("ITEM_NOT_IN_ISSUE");
    const noDay = priceFromSchedule(issues, "Pipe works", "P1", null);
    expect(!noDay.ok && noDay.fault.code).toBe("TIME_ZONE_NOT_SET");
  });
});

describe("editing and issuing", () => {
  it("only a draft is edited", () => {
    expect(scheduleEditFault({ status: "DRAFT" })).toBeNull();
    expect(scheduleEditFault({ status: "ISSUED" })?.code).toBe("ISSUE_FROZEN");
    expect(scheduleEditFault({ status: "SUPERSEDED" })?.code).toBe("ISSUE_FROZEN");
    expect(codes(itemFaults({ code: "P2", descriptionEn: "x", rate: sen("1.00") }, issue("i1", 1, "ISSUED", "2026-01-01")))).toEqual(["ISSUE_FROZEN"]);
  });
  it("an item needs a code unique in the issue, a description and a rate not below zero", () => {
    const d = issue("d", 2, "DRAFT", null);
    expect(itemFaults({ code: "P2", descriptionEn: "Valve", rate: sen("0.00") }, d)).toEqual([]);
    // RateScheduleItem.rate is Decimal(18, 2): 16 digits before the point, no more.
    expect(itemFaults({ code: "P2", descriptionEn: "Valve", rate: sen("9999999999999999.99") }, d)).toEqual([]);
    expect(itemFaults({ code: "P2", descriptionEn: "Valve", rate: sen("10000000000000000.00") }, d)).toEqual([{ code: "TOO_LARGE", level: "block", field: "rate", data: { field: "rate" } }]);
    expect(codes(itemFaults({ code: "P1", descriptionEn: "Valve", rate: sen("1.00") }, d))).toEqual(["CODE_TAKEN"]);
    expect(itemFaults({ code: "P1", descriptionEn: "Valve", rate: sen("1.00"), id: "same" }, { ...d, items: [{ ...d.items[0], id: "same" }] })).toEqual([]);
    expect(codes(itemFaults({ code: " ", descriptionEn: "", rate: -1n }, d))).toEqual(["ITEM_CODE_REQUIRED", "ITEM_DESCRIPTION_REQUIRED", "RATE_NEGATIVE"]);
  });
  it("one draft at a time under a label; issue numbers follow on", () => {
    const issues = [issue("i1", 1, "ISSUED", "2026-01-01"), issue("d2", 2, "DRAFT", null)];
    expect(codes(startIssueFaults(issues, "Pipe works"))).toEqual(["ISSUE_DRAFT_EXISTS"]);
    expect(startIssueFaults(issues, "Electrical")).toEqual([]);
    expect(codes(startIssueFaults(issues, " "))).toEqual(["LABEL_REQUIRED"]);
    expect(nextIssueNo(issues, "Pipe works")).toBe(3);
    expect(nextIssueNo(issues, "Electrical")).toBe(1);
  });
  it("issuing needs items, a day it takes effect after the current issue's, an issuer and a time zone; it supersedes the current issue", () => {
    const current = issue("i1", 1, "ISSUED", "2026-01-01");
    const draft = issue("d2", 2, "DRAFT", null);
    const ok = issueFaults(draft, [current, draft], { effectiveFrom: "2026-07-01", issuedByPersonId: "p1", today: "2026-06-20" });
    expect(ok).toEqual({ faults: [], supersedes: current });
    expect(codes(issueFaults(draft, [current, draft], { effectiveFrom: "2026-01-01", issuedByPersonId: "p1", today: "2026-06-20" }).faults)).toEqual(["EFFECTIVE_NOT_AFTER_CURRENT"]);
    expect(codes(issueFaults({ ...draft, items: [] }, [current], { effectiveFrom: null, issuedByPersonId: null, today: null }).faults)).toEqual(["ISSUE_NO_ITEMS", "TIME_ZONE_NOT_SET", "EFFECTIVE_REQUIRED", "ISSUER_REQUIRED"]);
    expect(issueFaults(issue("n1", 1, "DRAFT", null, "1.00", "New"), [], { effectiveFrom: "2026-07-01", issuedByPersonId: "p1", today: "2026-06-20" })).toEqual({ faults: [], supersedes: null });
    expect(codes(issueFaults(current, [current], { effectiveFrom: "2026-07-01", issuedByPersonId: "p1", today: "2026-06-20" }).faults)).toEqual(["ISSUE_FROZEN"]);
  });
  it("every refusal reads in words", () => {
    for (const code of ["ISSUE_FROZEN", "LABEL_REQUIRED", "ITEM_CODE_REQUIRED", "ITEM_DESCRIPTION_REQUIRED", "RATE_NEGATIVE", "ISSUE_NO_ITEMS", "EFFECTIVE_REQUIRED", "EFFECTIVE_NOT_AFTER_CURRENT", "ISSUER_REQUIRED", "ISSUE_DRAFT_EXISTS", "SCHEDULE_NOT_IN_FORCE", "ITEM_NOT_IN_ISSUE"]) {
      const t = scopeFaultText({ code, level: "block", data: { schedule: "Pipe works", on: "2026-01-01", issue: 1, item: "P1", current: "2026-01-01" } });
      expect(t, code).not.toBe("This was refused.");
      expect(t, code).not.toMatch(/[A-Z]{2,}_[A-Z_]+/);
    }
  });
});
