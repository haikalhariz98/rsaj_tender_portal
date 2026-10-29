/**
 * An item's Activity (WS-18, W-11; 0008 §5.4): its comments and the audit rows of its acts, merged in time order, oldest first, as a conversation reads.
 * No grouping: each audit row is its own line. "Comments" keeps the conversation only. A change line reads a label, from and to, in words: never a column
 * key or an enum code; a column with no label (`FIELD_WORDS`) is not shown, and a row left with nothing to show is dropped. Long text (a description, an
 * answer) is said to have changed, not quoted. Pure.
 */

import type { FieldChange } from "@/lib/audit/diff";
import { formatDate } from "@/lib/format";

import { enumValueWords, FIELD_WORDS } from "./labels";

export interface ActivityComment {
  id: string;
  body: string;
  personName: string | null;
  at: Date;
}

/// An audit row as `loadAudit` returns it (`AuditRow`), the fields Activity reads.
export interface ActivityAuditRow {
  id: string;
  entity: string;
  action: "CREATE" | "UPDATE" | "DELETE";
  changes: readonly FieldChange[];
  actorName: string | null;
  at: Date;
}

export type ActivityFilter = "all" | "comments";

export type ActivityLine = { kind: "COMMENT"; id: string; who: string; at: Date; body: string } | { kind: "CHANGE"; id: string; who: string; at: Date; text: string };

/// A row that is not a field edit, by what it records.
const ACT_WORDS: Readonly<Record<string, string>> = {
  "WorkItem:CREATE": "raised this",
  "WorkItemLink:CREATE": "added a link",
  "WorkItemLink:DELETE": "removed a link",
  "DocumentAttachment:CREATE": "added a file",
};
const LONG_TEXT = new Set(["description", "answer"]);
const DAY_FIELDS = new Set(["dueOn", "happenedAt"]);
const ID_FIELDS = new Set(["assigneePersonId", "fromDocumentId"]);
const SOMEONE = "Someone";

/// A stored value in words: an enum's words, a day, a person's or a document's name (from `names`), or the text itself.
function valueText(field: string, v: string | null, names: ReadonlyMap<string, string>): string {
  if (v === null || v === "") return "none";
  if (DAY_FIELDS.has(field)) return formatDate(v);
  if (ID_FIELDS.has(field)) return names.get(v) ?? "someone no longer listed";
  return enumValueWords(field, v) ?? v;
}

function changeText(c: FieldChange, names: ReadonlyMap<string, string>): string | null {
  const label = FIELD_WORDS[c.field]?.en;
  if (!label) return null;
  if (LONG_TEXT.has(c.field)) return `${label} ${c.before ? (c.after ? "changed" : "cleared") : "added"}`;
  return `${label}: ${valueText(c.field, c.before, names)} → ${valueText(c.field, c.after, names)}`;
}

function auditLine(r: ActivityAuditRow, names: ReadonlyMap<string, string>): ActivityLine | null {
  const fixed = ACT_WORDS[`${r.entity}:${r.action}`];
  const text = fixed ?? (r.action === "UPDATE" ? r.changes.map((c) => changeText(c, names)).filter((t) => t !== null).join("; ") : "");
  return text ? { kind: "CHANGE", id: r.id, who: r.actorName ?? SOMEONE, at: r.at, text } : null;
}

export function activityFeed(comments: readonly ActivityComment[], auditRows: readonly ActivityAuditRow[], filter: ActivityFilter, names: ReadonlyMap<string, string> = new Map()): ActivityLine[] {
  const lines: ActivityLine[] = comments.map((c) => ({ kind: "COMMENT", id: c.id, who: c.personName ?? SOMEONE, at: c.at, body: c.body }));
  if (filter === "all") for (const r of auditRows) {
    const line = auditLine(r, names);
    if (line) lines.push(line);
  }
  return lines.sort((a, b) => a.at.getTime() - b.at.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
