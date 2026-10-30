import { describe, expect, it } from "vitest";

import { COMPLETED_CONTRACT_STATUSES } from "@/lib/contract/case-stage";

import { LOCATION_MAX, TEXT_MAX, TITLE_MAX } from "./bounds";
import { commentFaults, fieldFaults, mayEdit, newItemFaults, parseFieldEdit, parseNewItem, typeHasField, typeOfferable, type FieldFacts, type NewItem } from "./fields";
import type { WhoNames } from "./labels";
import { WORK_ITEM_TYPES, type WorkActor, type WorkItemFacts, type WorkItemType } from "./types";

/** The item's fields (plan §3.4; W-3; 0008 §4.1, §4.3): parsed by hand, required per type, bounded, and edited only by those on the item. */

const KL = "Asia/Kuala_Lumpur";
const NOW = new Date("2026-11-05T02:00:00.000Z"); // 10:00 on 5 Nov in KL
const FACTS: FieldFacts = { now: NOW, activeIds: new Set(["aisyah", "hafiz"]), timeZone: KL, fromDocumentOnContract: true };
const form = (o: Record<string, string>) => new Map(Object.entries(o));

describe("parseNewItem", () => {
  it("reads a full RFI, trimming text; priority defaults to Normal", () => {
    expect(parseNewItem(form({ type: "RFI", title: "  Rebar spacing  ", dueOn: "2026-11-10", answer: "", assigneePersonId: " aisyah " }), KL)).toEqual({
      type: "RFI",
      title: "Rebar spacing",
      description: "",
      priority: "NORMAL",
      dueOn: "2026-11-10",
      location: "",
      assigneePersonId: "aisyah",
      answer: "",
      impact: null,
      inspectionResult: null,
      severity: null,
      happenedAt: null,
      fromDocumentId: null,
    });
  });

  it("an inspection starts Not yet; a safety incident's time is the organisation's wall clock", () => {
    expect(parseNewItem(form({ type: "INSPECTION", title: "Slab pour" }), KL)?.inspectionResult).toBe("NOT_YET");
    expect(parseNewItem(form({ type: "SAFETY_INCIDENT", title: "Fall", severity: "FIRST_AID", happenedAt: "2026-11-04T14:30" }), KL)?.happenedAt).toEqual(new Date("2026-11-04T06:30:00.000Z"));
  });

  it("with no time zone a time is not placed (never UTC): read as not given", () => {
    expect(parseNewItem(form({ type: "SAFETY_INCIDENT", title: "Fall", happenedAt: "2026-11-04T14:30" }), null)?.happenedAt).toBeNull();
  });

  it.each([
    ["no type", {}],
    ["an unknown type", { type: "NCR" }],
    ["a lower-case type", { type: "rfi" }],
    ["an unknown priority", { type: "TASK", priority: "CRITICAL" }],
    ["an impossible day", { type: "RFI", dueOn: "2026-02-30" }],
    ["an unknown impact", { type: "RFI", impact: "MONEY" }],
    ["an unknown result", { type: "INSPECTION", inspectionResult: "MAYBE" }],
    ["an unknown severity", { type: "SAFETY_INCIDENT", severity: "BAD" }],
    ["a malformed time", { type: "SAFETY_INCIDENT", happenedAt: "4 Nov 2:30pm" }],
  ])("%s is a tampered form: null", (_, o) => expect(parseNewItem(form(o as Record<string, string>), KL)).toBeNull());

  it("a file where text belongs reads as empty", () => {
    const f = { get: (k: string) => (k === "type" ? "TASK" : k === "title" ? new Blob(["x"]) : null) };
    expect(parseNewItem(f, KL)?.title).toBe("");
  });
});

const base = (type: WorkItemType, o: Partial<NewItem> = {}): NewItem => ({
  type,
  title: "A title",
  description: "",
  priority: "NORMAL",
  dueOn: null,
  location: "",
  assigneePersonId: null,
  answer: "",
  impact: null,
  inspectionResult: type === "INSPECTION" ? "NOT_YET" : null,
  severity: null,
  happenedAt: null,
  fromDocumentId: null,
  ...o,
});
const ACTIVE = { ...FACTS, contractStatus: "ACTIVE" as const };

describe("newItemFaults: what each type requires", () => {
  it("a title, and nothing else, on a task, an action, a defect and an inspection", () => {
    for (const t of ["TASK", "ACTION", "DEFECT", "INSPECTION"] as const) {
      expect(newItemFaults(base(t), ACTIVE), t).toEqual([]);
      expect(newItemFaults(base(t, { title: "" }), ACTIVE), t).toEqual([{ code: "TITLE_NEEDED" }]);
    }
  });
  it("an RFI and a site instruction need a due date (EX-03); nothing is prefilled", () => {
    for (const t of ["RFI", "SITE_INSTRUCTION"] as const) {
      expect(newItemFaults(base(t), ACTIVE), t).toEqual([{ code: "DUE_NEEDED" }]);
      expect(newItemFaults(base(t, { dueOn: "2026-11-10" }), ACTIVE), t).toEqual([]);
    }
  });
  it("a safety incident needs its severity and when it happened, not in the future", () => {
    expect(newItemFaults(base("SAFETY_INCIDENT"), ACTIVE)).toEqual([{ code: "SEVERITY_NEEDED" }, { code: "HAPPENED_AT_NEEDED" }]);
    expect(newItemFaults(base("SAFETY_INCIDENT", { severity: "NEAR_MISS", happenedAt: NOW }), ACTIVE)).toEqual([]);
    expect(newItemFaults(base("SAFETY_INCIDENT", { severity: "NEAR_MISS", happenedAt: new Date(NOW.getTime() + 60_000) }), ACTIVE)).toEqual([{ code: "HAPPENED_IN_FUTURE" }]);
  });
  it("a safety incident's time with no organisation time zone asks for the zone, not for the time", () => {
    const noZone = { ...ACTIVE, timeZone: null };
    expect(newItemFaults(base("SAFETY_INCIDENT", { severity: "NEAR_MISS" }), noZone)).toEqual([{ code: "NEEDS_TIME_ZONE" }]);
    expect(newItemFaults(base("TASK"), noZone)).toEqual([]);
  });
  it("another type's own field, when given, is NOT_THIS_TYPE", () => {
    expect(newItemFaults(base("TASK", { answer: "Yes" }), ACTIVE)).toEqual([{ code: "NOT_THIS_TYPE", field: "answer" }]);
    expect(newItemFaults(base("DEFECT", { impact: "COST" }), ACTIVE)).toEqual([{ code: "NOT_THIS_TYPE", field: "impact" }]);
    expect(newItemFaults(base("TASK", { inspectionResult: "PASSED" }), ACTIVE)).toEqual([{ code: "NOT_THIS_TYPE", field: "inspectionResult" }]);
    expect(newItemFaults(base("RFI", { dueOn: "2026-11-10", severity: "LOST_TIME", happenedAt: NOW }), ACTIVE)).toEqual([
      { code: "NOT_THIS_TYPE", field: "severity" },
      { code: "NOT_THIS_TYPE", field: "happenedAt" },
    ]);
    expect(newItemFaults(base("TASK", { fromDocumentId: "doc1" }), ACTIVE)).toEqual([{ code: "NOT_THIS_TYPE", field: "fromDocumentId" }]);
    expect(newItemFaults(base("SITE_INSTRUCTION", { dueOn: "2026-11-10", impact: "COST" }), ACTIVE)).toEqual([]);
  });
  it("an inactive assignee, and a From document on another contract, are refused", () => {
    expect(newItemFaults(base("TASK", { assigneePersonId: "gone" }), ACTIVE)).toEqual([{ code: "ASSIGNEE_NOT_ELIGIBLE" }]);
    expect(newItemFaults(base("TASK", { assigneePersonId: "aisyah" }), ACTIVE)).toEqual([]);
    expect(newItemFaults(base("ACTION", { fromDocumentId: "doc1" }), { ...ACTIVE, fromDocumentOnContract: false })).toEqual([{ code: "OTHER_CONTRACT" }]);
    expect(newItemFaults(base("ACTION", { fromDocumentId: "doc1" }), ACTIVE)).toEqual([]);
  });
  it("a Defect on a contract past practical completion is refused (OQ-4); before it, a Defect is a snag", () => {
    for (const s of COMPLETED_CONTRACT_STATUSES) expect(newItemFaults(base("DEFECT"), { ...FACTS, contractStatus: s }), s).toEqual([{ code: "DEFECT_AFTER_COMPLETION" }]);
    expect(COMPLETED_CONTRACT_STATUSES).toEqual(["PRACTICALLY_COMPLETE", "MAKING_GOOD_COMPLETE", "FINAL_CERTIFICATE_ISSUED"]);
    expect(newItemFaults(base("DEFECT"), ACTIVE)).toEqual([]);
    expect(newItemFaults(base("TASK"), { ...FACTS, contractStatus: "PRACTICALLY_COMPLETE" })).toEqual([]);
  });
});

describe("the bounds, exactly on each and one over (code points, as char_length counts)", () => {
  const s = (n: number, ch = "a") => ch.repeat(n);
  it.each([
    ["title", TITLE_MAX],
    ["description", TEXT_MAX],
    ["location", LOCATION_MAX],
  ] as const)("%s at %i is accepted; one more is TOO_LONG", (field, max) => {
    expect(newItemFaults(base("TASK", { [field]: s(max) }), ACTIVE)).toEqual([]);
    expect(newItemFaults(base("TASK", { [field]: s(max + 1) }), ACTIVE)).toEqual([{ code: "TOO_LONG", field, max }]);
  });
  it("an RFI's answer is bounded like a description", () => {
    expect(newItemFaults(base("RFI", { dueOn: "2026-11-10", answer: s(TEXT_MAX) }), ACTIVE)).toEqual([]);
    expect(newItemFaults(base("RFI", { dueOn: "2026-11-10", answer: s(TEXT_MAX + 1) }), ACTIVE)).toEqual([{ code: "TOO_LONG", field: "answer", max: TEXT_MAX }]);
  });
  it("an emoji is one character", () => {
    expect(newItemFaults(base("TASK", { title: s(TITLE_MAX, "🏗") }), ACTIVE)).toEqual([]);
  });
  it("the plan's numbers (§3.1)", () => expect([TITLE_MAX, TEXT_MAX, LOCATION_MAX]).toEqual([200, 10_000, 120]));
});

describe("parseFieldEdit", () => {
  it("reads each field, or null for a value no form offers", () => {
    expect(parseFieldEdit("title", " New ", KL)).toEqual({ field: "title", value: "New" });
    expect(parseFieldEdit("priority", "URGENT", KL)).toEqual({ field: "priority", value: "URGENT" });
    expect(parseFieldEdit("priority", "", KL)).toBeNull();
    expect(parseFieldEdit("dueOn", "", KL)).toEqual({ field: "dueOn", value: null });
    expect(parseFieldEdit("dueOn", "2026-13-01", KL)).toBeNull();
    expect(parseFieldEdit("impact", "", KL)).toEqual({ field: "impact", value: null });
    expect(parseFieldEdit("inspectionResult", "FAILED", KL)).toEqual({ field: "inspectionResult", value: "FAILED" });
    expect(parseFieldEdit("inspectionResult", "", KL)).toBeNull();
    expect(parseFieldEdit("severity", "LOST_TIME", KL)).toEqual({ field: "severity", value: "LOST_TIME" });
    expect(parseFieldEdit("assigneePersonId", "", KL)).toEqual({ field: "assigneePersonId", value: null });
    expect(parseFieldEdit("happenedAt", "2026-11-04T23:59", KL)).toEqual({ field: "happenedAt", value: new Date("2026-11-04T15:59:00.000Z") });
    expect(parseFieldEdit("status", "DONE", KL)).toBeNull(); // a move, never a field edit
    expect(parseFieldEdit("type", "RFI", KL)).toBeNull(); // fixed at creation (OQ-3)
    expect(parseFieldEdit("assigneeSupplierAccountId", "acc", KL)).toBeNull(); // WS-9: nothing writes it
    expect(parseFieldEdit("raisedByPersonId", "x", KL)).toBeNull();
  });
});

describe("commentFaults", () => {
  it("empty or blank is refused; over the bound is too long; anything else is fine", () => {
    expect(commentFaults("  ")).toEqual([{ code: "COMMENT_EMPTY" }]);
    expect(commentFaults("a".repeat(TEXT_MAX + 1))).toEqual([{ code: "TOO_LONG", field: "comment", max: TEXT_MAX }]);
    expect(commentFaults("a".repeat(TEXT_MAX))).toEqual([]);
  });
});

describe("fieldFaults: who edits, and when (W-3)", () => {
  const who: WhoNames = { raiser: "Hafiz", assignee: "Aisyah", lead: { roleLabel: "S.O.", names: ["Nurul"] } };
  const item = (o: Partial<WorkItemFacts> = {}): WorkItemFacts => ({ id: "w1", type: "RFI", number: 12, status: "IN_PROGRESS", raisedBy: "hafiz", assignee: "aisyah", dueOn: "2026-11-10", answer: "", inspectionResult: null, ...o });
  const as = (personId: string, mayReadContract = true): WorkActor => ({ personId, leadIds: ["nurul"], mayReadContract });
  const f = { ...FACTS, who };

  it("the raiser, the assignee and the lead edit; anyone else sees who can", () => {
    for (const p of ["hafiz", "aisyah", "nurul"]) expect(fieldFaults(item(), as(p), { field: "priority", value: "HIGH" }, f), p).toEqual([]);
    expect(fieldFaults(item(), as("other"), { field: "priority", value: "HIGH" }, f)).toEqual([
      { code: "NOT_EDITABLE", whoCan: { en: "Aisyah, the assignee, Hafiz, who raised it, or the S.O. (Nurul) can edit this." } },
    ]);
    expect(fieldFaults(item(), as("hafiz", false), { field: "priority", value: "HIGH" }, f).map((x) => x.code)).toEqual(["NOT_EDITABLE"]);
  });

  it("mayEdit is the raiser, the assignee or the lead who may read the contract", () => {
    expect([item(), item({ assignee: null })].map((i) => mayEdit(i, as("aisyah")))).toEqual([true, false]);
    expect(mayEdit(item(), as("nurul"))).toBe(true);
    expect(mayEdit(item(), as("nurul", false))).toBe(false);
  });

  it("a Done or Cancelled item is closed until reopened, before who is asked", () => {
    for (const status of ["DONE", "CANCELLED"] as const) expect(fieldFaults(item({ status }), as("other"), { field: "title", value: "x" }, f)).toEqual([{ code: "CLOSED_ITEM" }]);
  });

  it("the value is judged on the item's type", () => {
    expect(fieldFaults(item(), as("hafiz"), { field: "dueOn", value: null }, f)).toEqual([{ code: "DUE_NEEDED" }]);
    expect(fieldFaults(item({ type: "TASK" }), as("hafiz"), { field: "dueOn", value: null }, f)).toEqual([]);
    expect(fieldFaults(item({ type: "TASK" }), as("hafiz"), { field: "answer", value: "x" }, f)).toEqual([{ code: "NOT_THIS_TYPE", field: "answer" }]);
    expect(fieldFaults(item(), as("hafiz"), { field: "title", value: "" }, f)).toEqual([{ code: "TITLE_NEEDED" }]);
    expect(fieldFaults(item(), as("hafiz"), { field: "assigneePersonId", value: "gone" }, f)).toEqual([{ code: "ASSIGNEE_NOT_ELIGIBLE" }]);
    expect(fieldFaults(item(), as("hafiz"), { field: "assigneePersonId", value: null }, f)).toEqual([]); // unassigned is valid (W-6)
    expect(fieldFaults(item({ type: "SAFETY_INCIDENT" }), as("hafiz"), { field: "happenedAt", value: new Date(NOW.getTime() + 1) }, f)).toEqual([{ code: "HAPPENED_IN_FUTURE" }]);
    expect(fieldFaults(item({ type: "SAFETY_INCIDENT" }), as("hafiz"), { field: "severity", value: null }, f)).toEqual([{ code: "SEVERITY_NEEDED" }]);
    expect(fieldFaults(item({ type: "INSPECTION" }), as("hafiz"), { field: "inspectionResult", value: "FAILED" }, f)).toEqual([]);
  });

  it("every type's own fields are the plan's (§3.1 CHECKs)", () => {
    const own = (field: Parameters<typeof typeHasField>[1]) => WORK_ITEM_TYPES.filter((t) => typeHasField(t, field));
    expect(own("answer")).toEqual(["RFI"]);
    expect(own("impact")).toEqual(["RFI", "SITE_INSTRUCTION"]);
    expect(own("inspectionResult")).toEqual(["INSPECTION"]);
    expect(own("severity")).toEqual(["SAFETY_INCIDENT"]);
    expect(own("happenedAt")).toEqual(["SAFETY_INCIDENT"]);
    expect(own("fromDocumentId")).toEqual(["ACTION"]);
    expect(own("location")).toEqual([...WORK_ITEM_TYPES]);
  });
});

describe("typeOfferable", () => {
  it("agrees with newItemFaults: a Defect is not offered once the works are complete", () => {
    expect(typeOfferable("DEFECT", "ACTIVE")).toBe(true);
    for (const s of COMPLETED_CONTRACT_STATUSES) {
      expect(typeOfferable("DEFECT", s), s).toBe(false);
      expect(typeOfferable("TASK", s), s).toBe(true);
    }
  });
});
