/**
 * An item's fields: parsed from a form by hand (no schema library is installed; nothing from the client is trusted, the type and status included), and
 * judged (plan §3.4; W-3; 0008 §4.1, §4.3). Pure.
 *
 * - A parse returns null for a value no form offers (an unknown type, enum or day): a tampered request, refused whole by the action.
 * - An empty value is parsed, and the faults say what is missing: title; a due date on an RFI or SI; a severity and when it happened on a safety incident.
 * - A type's own field on another type is NOT_THIS_TYPE (an answer only on an RFI; impact on an RFI or SI; a result on an inspection; severity and when on a
 *   safety incident; "From" on an action item).
 * - Editing: a Done or Cancelled item is closed until reopened; only its raiser, its assignee or the lead edit it (W-3).
 * - Who may edit is `mayEdit`. `FieldFacts.activeIds` is the active people of the item's organisation who may READ the case; an assignee outside it is refused.
 * - Raising a Defect on a contract past practical completion is refused (OQ-4): the defect belongs in Close-out › Defects until 3b links the two.
 * - 3b: the assignee dropdown's "{contractor}" posts `CONTRACTOR_ASSIGNEE` and parses to `assignedToContractor` (the company, WS-9), never a person id.
 * - 3b B-10: the contractor edits one field, the Answer of an RFI it holds while open (WB-6); anything else is CONTRACTOR_MAY_NOT_EDIT. It raises only an
 *   RFI or a safety incident (`contractorRaiseFaults`, B-15).
 */

import { COMPLETED_CONTRACT_STATUSES } from "@/lib/contract/case-stage";
import type { ContractStatus } from "@/lib/contract/types";
import { instantAt, isDay } from "@/lib/dates";

import { LOCATION_MAX, TEXT_MAX, TITLE_MAX, textLength } from "./bounds";
import { whoCanWords, type WhoNames } from "./labels";
import { isOpen } from "./move";
import { isContractor } from "./party";
import { WORK_ITEM_TYPES, type Day, type FieldFault, type IncidentSeverity, type InspectionResult, type WorkActor, type WorkImpact, type WorkItemFacts, type WorkItemType, type WorkPriority } from "./types";

const PRIORITIES: readonly WorkPriority[] = ["LOW", "NORMAL", "HIGH", "URGENT"];
const IMPACTS: readonly WorkImpact[] = ["NONE", "COST", "TIME", "COST_AND_TIME"];
const RESULTS: readonly InspectionResult[] = ["NOT_YET", "PASSED", "FAILED"];
const SEVERITIES: readonly IncidentSeverity[] = ["NEAR_MISS", "FIRST_AID", "MEDICAL_TREATMENT", "LOST_TIME", "DANGEROUS_OCCURRENCE"];

/// W-3: only its raiser, its assignee or the lead edit an item, and only a staff reader of the contract. On an item the contractor raised there is no
/// staff raiser, so it is the assignee or the lead (3b B-11). The contractor's one edit is `fieldFaults`'.
export function mayEdit(item: Pick<WorkItemFacts, "raisedBy" | "assignee">, actor: WorkActor): boolean {
  const me = actor.personId;
  if (actor.side !== "STAFF" || !actor.mayReadContract || me === null) return false;
  return (item.raisedBy.kind === "PERSON" && item.raisedBy.id === me) || (item.assignee?.kind === "PERSON" && item.assignee.id === me) || actor.leadIds.includes(me);
}

/// The assignee dropdown's value for "{contractor}". Not a person id (ids are cuids), so it never reaches `assigneePersonId`.
export const CONTRACTOR_ASSIGNEE = "contractor";

/// A comment's faults (empty, over the text bound): `Composer`'s action asks before it saves.
export function commentFaults(body: string): FieldFault[] {
  if (body.trim() === "") return [{ code: "COMMENT_EMPTY" }];
  return textLength(body) > TEXT_MAX ? [{ code: "TOO_LONG", field: "comment", max: TEXT_MAX }] : [];
}

/// One field's change, named by its column (so Activity and a fault name it the same way).
export type FieldEdit =
  | { field: "title" | "description" | "location" | "answer"; value: string }
  | { field: "priority"; value: WorkPriority }
  | { field: "dueOn"; value: Day | null }
  | { field: "assigneePersonId"; value: string | null }
  | { field: "assignedToContractor"; value: true } // "{contractor}" picked: `assigneePatch` (sharing.ts) writes the one UPDATE
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
  /// Active people of the item's organisation who may READ the case (the caller builds it): an assignee outside it is ASSIGNEE_NOT_ELIGIBLE.
  activeIds: ReadonlySet<string>;
  /// The organisation's zone: a safety incident's time cannot be judged without one (NEEDS_TIME_ZONE).
  timeZone: string | null;
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
      return raw.trim() === CONTRACTOR_ASSIGNEE ? { field: "assignedToContractor", value: true } : { field, value: idOrNull(raw) };
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
      if (e.value === null) return [{ code: facts.timeZone === null ? "NEEDS_TIME_ZONE" : "HAPPENED_AT_NEEDED" }];
      return e.value.getTime() > facts.now.getTime() ? [{ code: "HAPPENED_IN_FUTURE" }] : [];
    case "assigneePersonId":
      return e.value !== null && !facts.activeIds.has(e.value) ? [{ code: "ASSIGNEE_NOT_ELIGIBLE" }] : [];
    case "fromDocumentId":
      return e.value !== null && !facts.fromDocumentOnContract ? [{ code: "OTHER_CONTRACT" }] : [];
    default:
      return [];
  }
}

const judge = (type: WorkItemType, e: FieldEdit, facts: FieldFacts): FieldFault[] => (typeHasField(type, e.field) ? valueFaults(type, e, facts) : [{ code: "NOT_THIS_TYPE", field: e.field }]);

/// The contractor's one edit (3b B-10, WB-6): the Answer of a shared RFI it holds.
const contractorMayEdit = (item: WorkItemFacts, actor: WorkActor, edit: FieldEdit): boolean =>
  actor.mayReadContract && item.sharedAt !== null && item.type === "RFI" && isContractor(item.assignee) && edit.field === "answer";

/// One field's edit on an item (W-3): a closed item refuses alone, then a reader who is not its raiser, assignee or lead, then the value.
export function fieldFaults(item: WorkItemFacts, actor: WorkActor, edit: FieldEdit, facts: FieldFacts & { who: WhoNames }): FieldFault[] {
  if (!isOpen(item.status)) return [{ code: "CLOSED_ITEM" }];
  if (actor.side === "CONTRACTOR") return contractorMayEdit(item, actor, edit) ? judge(item.type, edit, facts) : [{ code: "CONTRACTOR_MAY_NOT_EDIT", field: edit.field }];
  if (!mayEdit(item, actor)) return [{ code: "NOT_EDITABLE", whoCan: whoCanWords("EDIT", facts.who) }];
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
  /// "{contractor}" picked as the assignee (then `assigneePersonId` is null); it shares the item (B-1).
  assignedToContractor: boolean;
  /// The drawer's "Share with {contractor}" toggle, as posted (`shareDefault` presets it). The quick-add row posts none: false.
  share: boolean;
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
  const toContractor = text(form, "assigneePersonId").trim() === CONTRACTOR_ASSIGNEE;
  return {
    type,
    title: text(form, "title").trim(),
    description: text(form, "description").trim(),
    priority: priority ?? "NORMAL",
    dueOn,
    location: text(form, "location").trim(),
    assigneePersonId: toContractor ? null : idOrNull(text(form, "assigneePersonId")),
    assignedToContractor: toContractor,
    share: text(form, "share") === "on",
    answer: text(form, "answer").trim(),
    impact,
    inspectionResult: result ?? (type === "INSPECTION" ? "NOT_YET" : null),
    severity,
    happenedAt,
    fromDocumentId: idOrNull(text(form, "fromDocumentId")),
  };
}

/// Whether a type can be raised on a contract in this status (a Defect cannot after completion, OQ-4); the screens offer only these.
export function typeOfferable(type: string, contractStatus: ContractStatus): boolean {
  return !(type === "DEFECT" && COMPLETED_CONTRACT_STATUSES.includes(contractStatus));
}

/// Every fault of a new item: the contract's stage for a Defect (OQ-4), then each field, its own type's fields always and another type's only when given.
export function newItemFaults(n: NewItem, facts: FieldFacts & { contractStatus: ContractStatus }): FieldFault[] {
  const out: FieldFault[] = [];
  if (!typeOfferable(n.type, facts.contractStatus)) out.push({ code: "DEFECT_AFTER_COMPLETION" });
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

/// The types the contractor raises from the portal (0008 §4.1; 3b B-8, B-15): fixed, like the types (CHECK `WorkItem_contractor_raises_type`).
export const CONTRACTOR_RAISE_TYPES: readonly WorkItemType[] = ["RFI", "SAFETY_INCIDENT"];

/// What the portal's "Ask a question" and "Report an incident" send (B-15): no priority, assignee, answer or "From"; the store sets those.
export interface ContractorRaise {
  type: WorkItemType;
  title: string;
  description: string;
  location: string;
  /// "Answer needed by" on an RFI (required: the RFI CHECK).
  dueOn: Day | null;
  severity: IncidentSeverity | null;
  happenedAt: Date | null;
}

/// A contractor's raise: another type is refused alone (NOT_CONTRACTOR_TYPE); then each field as staff's are judged, so an RFI needs its date, an incident
/// its severity and a time not in the future, and a field of the other type is NOT_THIS_TYPE.
export function contractorRaiseFaults(r: ContractorRaise, facts: Pick<FieldFacts, "now" | "timeZone">): FieldFault[] {
  if (!CONTRACTOR_RAISE_TYPES.includes(r.type)) return [{ code: "NOT_CONTRACTOR_TYPE" }];
  // No assignee or "From" is judged here, so neither fact is read.
  const f: FieldFacts = { ...facts, activeIds: new Set(), fromDocumentOnContract: true };
  const edits: FieldEdit[] = [
    { field: "title", value: r.title },
    { field: "description", value: r.description },
    { field: "location", value: r.location },
    { field: "dueOn", value: r.dueOn },
  ];
  for (const e of [{ field: "severity", value: r.severity }, { field: "happenedAt", value: r.happenedAt }] as FieldEdit[]) if (typeHasField(r.type, e.field) || e.value !== null) edits.push(e);
  return edits.flatMap((e) => judge(r.type, e, f));
}
