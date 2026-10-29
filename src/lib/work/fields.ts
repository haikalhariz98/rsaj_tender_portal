/**
 * An item's fields: parsed from a form by hand (no schema library is installed; nothing from the client is trusted, the type and status included), and
 * judged (plan §3.4; W-3; 0008 §4.1, §4.3). Pure.
 *
 * - A parse returns null for a value no form offers (an unknown type, enum or day): a tampered request, refused whole by the action.
 * - An empty value is parsed, and the faults say what is missing: title; a due date on an RFI or SI; a severity and when it happened on a safety incident.
 * - A type's own field on another type is NOT_THIS_TYPE (an answer only on an RFI; impact on an RFI or SI; a result on an inspection; severity and when on a
 *   safety incident; "From" on an action item).
 * - Editing: a Done or Cancelled item is closed until reopened; only its raiser, its assignee or the lead edit it (W-3).
 * - Raising a Defect on a contract past practical completion is refused (OQ-4): the defect belongs in Close-out › Defects until 3b links the two.
 */

import { COMPLETED_CONTRACT_STATUSES } from "@/lib/contract/case-stage";
import type { ContractStatus } from "@/lib/contract/types";
import { instantAt, isDay } from "@/lib/dates";

import { LOCATION_MAX, TEXT_MAX, TITLE_MAX, textLength } from "./bounds";
import { whoCanWords, type WhoNames } from "./labels";
import { isOpen } from "./move";
import { WORK_ITEM_TYPES, type Day, type FieldFault, type IncidentSeverity, type InspectionResult, type WorkActor, type WorkImpact, type WorkItemFacts, type WorkItemType, type WorkPriority } from "./types";

const PRIORITIES: readonly WorkPriority[] = ["LOW", "NORMAL", "HIGH", "URGENT"];
const IMPACTS: readonly WorkImpact[] = ["NONE", "COST", "TIME", "COST_AND_TIME"];
const RESULTS: readonly InspectionResult[] = ["NOT_YET", "PASSED", "FAILED"];
const SEVERITIES: readonly IncidentSeverity[] = ["NEAR_MISS", "FIRST_AID", "MEDICAL_TREATMENT", "LOST_TIME", "DANGEROUS_OCCURRENCE"];

/// One field's change, named by its column (so Activity and a fault name it the same way).
export type FieldEdit =
  | { field: "title" | "description" | "location" | "answer"; value: string }
  | { field: "priority"; value: WorkPriority }
  | { field: "dueOn"; value: Day | null }
  | { field: "assigneePersonId"; value: string | null }
  | { field: "impact"; value: WorkImpact | null }
  | { field: "inspectionResult"; value: InspectionResult }
  | { field: "severity"; value: IncidentSeverity | null }
  | { field: "happenedAt"; value: Date | null }
  | { field: "fromDocumentId"; value: string | null };
export type EditableField = FieldEdit["field"];

/// The fields only some types have, and which.
const OWN_FIELDS: Readonly<Partial<Record<EditableField, readonly WorkItemType[]>>> = {
  answer: ["RFI"],
  impact: ["RFI", "SITE_INSTRUCTION"],
  inspectionResult: ["INSPECTION"],
  severity: ["SAFETY_INCIDENT"],
  happenedAt: ["SAFETY_INCIDENT"],
  fromDocumentId: ["ACTION"],
};
export const typeHasField = (type: WorkItemType, field: EditableField): boolean => OWN_FIELDS[field]?.includes(type) ?? true;
const DUE_REQUIRED: readonly WorkItemType[] = ["RFI", "SITE_INSTRUCTION"];

/// What the rules need beside the edit, read by the store: the clock (for "happened"), who is active, whether a "From" document is on the item's contract.
export interface FieldFacts {
  now: Date;
  activeIds: ReadonlySet<string>;
  /// The picked "From" project document is on the item's own contract. Unread (no document picked): ignored.
  fromDocumentOnContract: boolean;
}

/// A form as the action has it (`FormData` is one). A non-string entry (a file) reads as empty.
export interface FormLike {
  get(name: string): unknown;
}
const text = (form: FormLike, name: string): string => {
  const v = form.get(name);
  return typeof v === "string" ? v : "";
};

const BAD = Symbol("bad");
type Parsed<T> = T | typeof BAD;
const oneOf = <T extends string>(raw: string, values: readonly T[]): Parsed<T | null> => (raw === "" ? null : (values as readonly string[]).includes(raw) ? (raw as T) : BAD);
const idOrNull = (raw: string): string | null => (raw.trim() === "" ? null : raw.trim());
const dayOrNull = (raw: string): Parsed<Day | null> => (raw === "" ? null : isDay(raw) ? raw : BAD);
/// "2026-11-04T14:30", the wall clock in the organisation's zone. With no zone there is no instant: read as not given (never UTC).
function instantOrNull(raw: string, timeZone: string | null): Parsed<Date | null> {
  if (raw === "") return null;
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(raw);
  if (!m) return BAD;
  return instantAt(m[1], m[2], timeZone);
}

/// One field's edit from the panel, or null when the field or its value is not one any form offers.
export function parseFieldEdit(field: string, raw: string, timeZone: string | null): FieldEdit | null {
  switch (field) {
    case "title":
    case "description":
    case "location":
    case "answer":
      return { field, value: raw.trim() };
    case "priority": {
      const v = oneOf(raw, PRIORITIES);
      return v === BAD || v === null ? null : { field, value: v };
    }
    case "inspectionResult": {
      const v = oneOf(raw, RESULTS);
      return v === BAD || v === null ? null : { field, value: v };
    }
    case "impact": {
      const v = oneOf(raw, IMPACTS);
      return v === BAD ? null : { field, value: v };
    }
    case "severity": {
      const v = oneOf(raw, SEVERITIES);
      return v === BAD ? null : { field, value: v };
    }
    case "dueOn": {
      const v = dayOrNull(raw);
      return v === BAD ? null : { field, value: v };
    }
    case "happenedAt": {
      const v = instantOrNull(raw, timeZone);
      return v === BAD ? null : { field, value: v };
    }
    case "assigneePersonId":
    case "fromDocumentId":
      return { field, value: idOrNull(raw) };
    default:
      return null;
  }
}

/// A value's own faults on a type: required, bounded, active, on this contract, not in the future.
function valueFaults(type: WorkItemType, e: FieldEdit, facts: FieldFacts): FieldFault[] {
  const tooLong = (max: number): FieldFault[] => (typeof e.value === "string" && textLength(e.value) > max ? [{ code: "TOO_LONG", field: e.field, max }] : []);
  switch (e.field) {
    case "title":
      return e.value === "" ? [{ code: "TITLE_NEEDED" }] : tooLong(TITLE_MAX);
    case "description":
    case "answer":
      return tooLong(TEXT_MAX);
    case "location":
      return tooLong(LOCATION_MAX);
    case "dueOn":
      return e.value === null && DUE_REQUIRED.includes(type) ? [{ code: "DUE_NEEDED" }] : [];
    case "severity":
      return e.value === null ? [{ code: "SEVERITY_NEEDED" }] : [];
    case "happenedAt":
      if (e.value === null) return [{ code: "HAPPENED_AT_NEEDED" }];
      return e.value.getTime() > facts.now.getTime() ? [{ code: "HAPPENED_IN_FUTURE" }] : [];
    case "assigneePersonId":
      return e.value !== null && !facts.activeIds.has(e.value) ? [{ code: "ASSIGNEE_INACTIVE" }] : [];
    case "fromDocumentId":
      return e.value !== null && !facts.fromDocumentOnContract ? [{ code: "OTHER_CONTRACT" }] : [];
    default:
      return [];
  }
}

const judge = (type: WorkItemType, e: FieldEdit, facts: FieldFacts): FieldFault[] => (typeHasField(type, e.field) ? valueFaults(type, e, facts) : [{ code: "NOT_THIS_TYPE", field: e.field }]);

/// One field's edit on an item (W-3): a closed item refuses alone, then a reader who is not its raiser, assignee or lead, then the value.
export function fieldFaults(item: WorkItemFacts, actor: WorkActor, edit: FieldEdit, facts: FieldFacts & { who: WhoNames }): FieldFault[] {
  if (!isOpen(item.status)) return [{ code: "CLOSED_ITEM" }];
  const on = actor.mayReadContract && (actor.personId === item.raisedBy || actor.personId === item.assignee || actor.leadIds.includes(actor.personId));
  if (!on) return [{ code: "NOT_EDITABLE", whoCan: whoCanWords("EDIT", facts.who) }];
  return judge(item.type, edit, facts);
}

/// A new item as the New item drawer or the quick-add row sends it.
export interface NewItem {
  type: WorkItemType;
  title: string;
  description: string;
  priority: WorkPriority;
  dueOn: Day | null;
  location: string;
  assigneePersonId: string | null;
  answer: string;
  impact: WorkImpact | null;
  inspectionResult: InspectionResult | null;
  severity: IncidentSeverity | null;
  happenedAt: Date | null;
  fromDocumentId: string | null;
}

/// The New item form, or null when its type or any picked value is not one the form offers. Priority defaults to Normal; an inspection's result to Not yet.
export function parseNewItem(form: FormLike, timeZone: string | null): NewItem | null {
  const type = oneOf(text(form, "type"), WORK_ITEM_TYPES);
  const priority = oneOf(text(form, "priority"), PRIORITIES);
  const dueOn = dayOrNull(text(form, "dueOn"));
  const impact = oneOf(text(form, "impact"), IMPACTS);
  const result = oneOf(text(form, "inspectionResult"), RESULTS);
  const severity = oneOf(text(form, "severity"), SEVERITIES);
  const happenedAt = instantOrNull(text(form, "happenedAt"), timeZone);
  if (type === BAD || type === null || priority === BAD || dueOn === BAD || impact === BAD || result === BAD || severity === BAD || happenedAt === BAD) return null;
  return {
    type,
    title: text(form, "title").trim(),
    description: text(form, "description").trim(),
    priority: priority ?? "NORMAL",
    dueOn,
    location: text(form, "location").trim(),
    assigneePersonId: idOrNull(text(form, "assigneePersonId")),
    answer: text(form, "answer").trim(),
    impact,
    inspectionResult: result ?? (type === "INSPECTION" ? "NOT_YET" : null),
    severity,
    happenedAt,
    fromDocumentId: idOrNull(text(form, "fromDocumentId")),
  };
}

/// Every fault of a new item: the contract's stage for a Defect (OQ-4), then each field, its own type's fields always and another type's only when given.
export function newItemFaults(n: NewItem, facts: FieldFacts & { contractStatus: ContractStatus }): FieldFault[] {
  const out: FieldFault[] = [];
  if (n.type === "DEFECT" && COMPLETED_CONTRACT_STATUSES.includes(facts.contractStatus)) out.push({ code: "DEFECT_AFTER_COMPLETION" });
  const edits: FieldEdit[] = [
    { field: "title", value: n.title },
    { field: "description", value: n.description },
    { field: "priority", value: n.priority },
    { field: "dueOn", value: n.dueOn },
    { field: "location", value: n.location },
    { field: "assigneePersonId", value: n.assigneePersonId },
  ];
  const own: FieldEdit[] = [
    { field: "answer", value: n.answer },
    { field: "impact", value: n.impact },
    { field: "severity", value: n.severity },
    { field: "happenedAt", value: n.happenedAt },
    { field: "fromDocumentId", value: n.fromDocumentId },
  ];
  if (n.inspectionResult !== null) own.push({ field: "inspectionResult", value: n.inspectionResult });
  for (const e of own) if (typeHasField(n.type, e.field) || (e.value !== null && e.value !== "")) edits.push(e);
  for (const e of edits) out.push(...judge(n.type, e, facts));
  return out;
}
