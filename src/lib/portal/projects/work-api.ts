/**
 * What the contractor's Work routes read from a request body (workspace 3b step 4; plan section 5, "Trust boundary"). Pure, by hand (no schema library is installed): the shape a
 * request must have is held here, once per route, and tested without a server.
 *
 * - Unknown fields are refused, each named (400 VALIDATION with a field-level `errors`).
 * - The body names a contract, an item's reference ("RFI-12"), words, a day or a time, and staged version ids. Never a supplier, an organisation, an account, a status the item is
 *   to take or an instant the act is dated from: the supplier is the session's and the clock is the server's.
 * - Bounds here only keep a value from being absurdly large; the exact bounds are the pure rules' (`fields.ts`), judged again on the locked rows.
 */

import { isDay } from "@/lib/dates";
import { FILES_PER_ACT } from "@/lib/work/bounds";
import { parseFieldEdit } from "@/lib/work/fields";
import { parseItemRef } from "@/lib/work/number";
import type { IncidentSeverity, PortalAction, WorkAction, WorkItemType, WorkStatus } from "@/lib/work/types";

export type WorkParsed<T> = { ok: true; value: T } | { ok: false; message: string; errors: Record<string, string> };
const invalid = (errors: Record<string, string>): WorkParsed<never> => ({ ok: false, message: "Check the fields marked below.", errors });

const ID = /^[A-Za-z0-9_-]{8,40}$/;
const isId = (v: unknown): v is string => typeof v === "string" && ID.test(v);
/// Text, or null where it is not text or is far past any bound.
const text = (v: unknown, max: number): string | null => (v == null ? "" : typeof v === "string" && v.length <= max * 4 ? v : null);

/// The longest text read: the comment and description bound (`TEXT_MAX`), times the code-point slack `text` allows.
const WORDS_MAX = 10_000;
const TITLE_READ_MAX = 200;
const LOCATION_READ_MAX = 120;

const unknownFields = (b: Readonly<Record<string, unknown>>, allowed: readonly string[], errors: Record<string, string>) => {
  for (const k of Object.keys(b)) if (!allowed.includes(k)) errors[k] = "Not a field of this request.";
};

function contract(b: Readonly<Record<string, unknown>>, errors: Record<string, string>): string {
  if (!isId(b.contractId)) errors.contractId = "Say which contract this is for.";
  return isId(b.contractId) ? b.contractId : "";
}
function item(b: Readonly<Record<string, unknown>>, errors: Record<string, string>): string {
  const ok = typeof b.item === "string" && parseItemRef(b.item) !== null;
  if (!ok) errors.item = "Say which item this is for.";
  return ok ? (b.item as string) : "";
}
function staged(v: unknown, errors: Record<string, string>, required: boolean): string[] {
  if (v == null) {
    if (required) errors.stagedVersionIds = "Choose a file first.";
    return [];
  }
  if (!Array.isArray(v) || v.length > FILES_PER_ACT * 2 || !v.every(isId)) {
    errors.stagedVersionIds = "A file is not one that was uploaded.";
    return [];
  }
  if (required && v.length === 0) errors.stagedVersionIds = "Choose a file first.";
  return v as string[];
}
function words(b: Readonly<Record<string, unknown>>, field: string, max: number, errors: Record<string, string>): string {
  const t = text(b[field], max);
  if (t === null) errors[field] = "That is not text.";
  return t ?? "";
}

// ------------------------------------------------------------------ raise ("Ask a question", "Report an incident")

export interface RaiseBody {
  contractId: string;
  type: Extract<WorkItemType, "RFI" | "SAFETY_INCIDENT">;
  title: string;
  description: string;
  location: string;
  /// "Answer needed by" (RFI): a day, or "" where none was given (the rule says it is required).
  dueOn: string;
  /// An incident's severity ("" where none).
  severity: IncidentSeverity | "";
  /// An incident's wall clock in the organisation's zone, "YYYY-MM-DDTHH:mm" ("" where none); the store turns it into an instant.
  happenedAt: string;
  stagedVersionIds: string[];
}

export function parseRaiseBody(b: Record<string, unknown>): WorkParsed<RaiseBody> {
  const errors: Record<string, string> = {};
  unknownFields(b, ["contractId", "type", "title", "description", "location", "dueOn", "severity", "happenedAt", "stagedVersionIds"], errors);
  const contractId = contract(b, errors);
  if (b.type !== "RFI" && b.type !== "SAFETY_INCIDENT") errors.type = "Ask a question or report an incident.";
  const title = words(b, "title", TITLE_READ_MAX, errors);
  const description = words(b, "description", WORDS_MAX, errors);
  const location = words(b, "location", LOCATION_READ_MAX, errors);
  const dueOn = words(b, "dueOn", 10, errors);
  if (dueOn !== "" && !isDay(dueOn)) errors.dueOn = "That is not a date.";
  const severity = words(b, "severity", 40, errors);
  if (severity !== "" && parseFieldEdit("severity", severity, null) === null) errors.severity = "Pick a severity from the list.";
  const happenedAt = words(b, "happenedAt", 16, errors);
  if (happenedAt !== "" && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(happenedAt)) errors.happenedAt = "That is not a date and time.";
  const stagedVersionIds = staged(b.stagedVersionIds, errors, false);
  if (Object.keys(errors).length > 0) return invalid(errors);
  return { ok: true, value: { contractId, type: b.type as RaiseBody["type"], title: title.trim(), description: description.trim(), location: location.trim(), dueOn, severity: severity as RaiseBody["severity"], happenedAt, stagedVersionIds } };
}

// ------------------------------------------------------------------ reply

export interface ReplyBody {
  contractId: string;
  item: string;
  body: string;
}

export function parseReplyBody(b: Record<string, unknown>): WorkParsed<ReplyBody> {
  const errors: Record<string, string> = {};
  unknownFields(b, ["contractId", "item", "body"], errors);
  const contractId = contract(b, errors);
  const ref = item(b, errors);
  const body = words(b, "body", WORDS_MAX, errors);
  if (Object.keys(errors).length > 0) return invalid(errors);
  return { ok: true, value: { contractId, item: ref, body } };
}

// ------------------------------------------------------------------ move (Send for checking, Accept answer, Ask again)

/// The three moves the contractor makes, by the words on its buttons, and the action each is in the move table (`move.ts`).
export const CONTRACTOR_MOVES: Readonly<Partial<Record<PortalAction, WorkAction>>> = { SEND_FOR_CHECKING: "SEND_FOR_REVIEW", ACCEPT_ANSWER: "MARK_DONE", ASK_AGAIN: "SEND_BACK" };
const STATUSES: readonly WorkStatus[] = ["TO_DO", "IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELLED"];

export interface MoveBody {
  contractId: string;
  item: string;
  action: WorkAction;
  /// The status the reader saw, so a move made on a stale view is MOVED_ALREADY.
  expectedFrom: WorkStatus;
  /// Ask again's reply.
  comment: string;
}

export function parseMoveBody(b: Record<string, unknown>): WorkParsed<MoveBody> {
  const errors: Record<string, string> = {};
  unknownFields(b, ["contractId", "item", "action", "expectedFrom", "comment"], errors);
  const contractId = contract(b, errors);
  const ref = item(b, errors);
  const action = typeof b.action === "string" ? CONTRACTOR_MOVES[b.action as PortalAction] : undefined;
  if (!action) errors.action = "Say whether you are sending it for checking, accepting the answer or asking again.";
  if (typeof b.expectedFrom !== "string" || !(STATUSES as readonly string[]).includes(b.expectedFrom)) errors.expectedFrom = "Say what the item looked like when you opened it.";
  const comment = words(b, "comment", WORDS_MAX, errors);
  if (Object.keys(errors).length > 0) return invalid(errors);
  return { ok: true, value: { contractId, item: ref, action: action!, expectedFrom: b.expectedFrom as WorkStatus, comment } };
}

// ------------------------------------------------------------------ answer

export interface AnswerBody {
  contractId: string;
  item: string;
  answer: string;
}

export function parseAnswerBody(b: Record<string, unknown>): WorkParsed<AnswerBody> {
  const errors: Record<string, string> = {};
  unknownFields(b, ["contractId", "item", "answer"], errors);
  const contractId = contract(b, errors);
  const ref = item(b, errors);
  const answer = words(b, "answer", WORDS_MAX, errors);
  if (Object.keys(errors).length > 0) return invalid(errors);
  return { ok: true, value: { contractId, item: ref, answer: answer.trim() } };
}

// ------------------------------------------------------------------ attach

export interface AttachBody {
  contractId: string;
  item: string;
  stagedVersionIds: string[];
}

export function parseAttachBody(b: Record<string, unknown>): WorkParsed<AttachBody> {
  const errors: Record<string, string> = {};
  unknownFields(b, ["contractId", "item", "stagedVersionIds"], errors);
  const contractId = contract(b, errors);
  const ref = item(b, errors);
  const stagedVersionIds = staged(b.stagedVersionIds, errors, true);
  if (Object.keys(errors).length > 0) return invalid(errors);
  return { ok: true, value: { contractId, item: ref, stagedVersionIds } };
}
