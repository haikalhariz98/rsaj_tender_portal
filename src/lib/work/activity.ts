/**
 * An item's Activity (WS-18, W-11; 0008 §5.4): its comments and the audit rows of its acts, merged in time order, oldest first, as a conversation reads.
 * No grouping: each audit row is its own line. The All / Comments filter is the `Activity` component's alone (one owner): this returns every line, each marked COMMENT or CHANGE. A change line reads a label, from and to, in words: never a column
 * key or an enum code; a column with no label (`FIELD_WORDS`) is not shown, and a row left with nothing to show is dropped. Long text (a description, an
 * answer) is said to have changed, not quoted. A day (`dueOn`) is a plain day; an instant (`happenedAt`, audit-written as an ISO string) is the day and clock in the organisation's
 * time zone, marked as unset when there is none (never a bare UTC value). Pure.
 */

import type { FieldChange } from "@/lib/audit/diff";
import { formatDate, formatOrgDateTime } from "@/lib/format";

import { enumValueWords, FIELD_WORDS } from "./labels";

export interface ActivityComment {
  id: string;
  body: string;
  personName: string | null;
  at: Date;
  /// The audience the comment was written with (ADR 0048 D4): true is an internal note. Absent reads as internal, the safe side.
  internal?: boolean;
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

export type ActivityLine = { kind: "COMMENT"; id: string; who: string; at: Date; body: string; internal: boolean } | { kind: "CHANGE"; id: string; who: string; at: Date; text: string };

/// A row that is not a field edit, by what it records.
const ACT_WORDS: Readonly<Record<string, string>> = {
  "WorkItem:CREATE": "raised this",
  "WorkItemLink:CREATE": "added a link",
  "WorkItemLink:DELETE": "removed a link",
  "DocumentAttachment:CREATE": "added a file",
  "DocumentAttachment:UPDATE": "removed a file",
};
const LONG_TEXT = new Set(["description", "answer"]);
const DAY_FIELDS = new Set(["dueOn"]);
const INSTANT_FIELDS = new Set(["happenedAt", "sharedAt"]);
const ID_FIELDS = new Set(["assigneePersonId", "fromDocumentId"]);
const SOMEONE = "Someone";

/// A stored value in words: an enum's words, a day, a person's or a document's name (from `names`), or the text itself.
function valueText(field: string, v: string | null, names: ReadonlyMap<string, string>, timeZone: string | null): string {
  if (v === null || v === "") return "none";
  if (DAY_FIELDS.has(field)) return formatDate(v);
  if (INSTANT_FIELDS.has(field)) {
    const at = new Date(v);
    return Number.isNaN(at.getTime()) ? v : formatOrgDateTime(at, timeZone);
  }
  // The contractor as an assignee is written as the one token (3b B-7: one logical line, never a second column); the caller maps it to the awardee's name.
  if (ID_FIELDS.has(field)) return names.get(v) ?? "someone no longer listed";
  return enumValueWords(field, v) ?? v;
}

function changeText(c: FieldChange, names: ReadonlyMap<string, string>, timeZone: string | null): string | null {
  const label = FIELD_WORDS[c.field]?.en;
  if (!label) return null;
  if (c.field === "answerAccepted") return label; // the text itself is the Answer's; this line says it was accepted as it stood (WSEC-9)
  if (LONG_TEXT.has(c.field)) return `${label} ${c.before ? (c.after ? "changed" : "cleared") : "added"}`;
  return `${label}: ${valueText(c.field, c.before, names, timeZone)} → ${valueText(c.field, c.after, names, timeZone)}`;
}

function auditLine(r: ActivityAuditRow, names: ReadonlyMap<string, string>, timeZone: string | null): ActivityLine | null {
  const key = `${r.entity}:${r.action}`;
  // A link line says what was linked (the audit diff's `linkedTo`).
  const linked = r.entity === "WorkItemLink" ? r.changes.find((c) => c.field === "linkedTo") : undefined;
  // The audit holds the address form ("RFI-12"); a screen shows the type word and the number ("RFI 12", "Incident 3": WSEC-3).
  const to = (linked?.after ?? linked?.before)?.replace(/^([A-Za-z]+)-(\d+) · /, "$1 $2 · ");
  const fixed = ACT_WORDS[key] && to ? `${ACT_WORDS[key]} to ${to}` : ACT_WORDS[key];
  const text = fixed ?? (r.action === "UPDATE" ? r.changes.map((c) => changeText(c, names, timeZone)).filter((t) => t !== null).join("; ") : "");
  return text ? { kind: "CHANGE", id: r.id, who: r.actorName ?? SOMEONE, at: r.at, text } : null;
}

export function activityFeed(comments: readonly ActivityComment[], auditRows: readonly ActivityAuditRow[], timeZone: string | null, names: ReadonlyMap<string, string> = new Map()): ActivityLine[] {
  const lines: ActivityLine[] = comments.map((c) => ({ kind: "COMMENT", id: c.id, who: c.personName ?? SOMEONE, at: c.at, body: c.body, internal: c.internal ?? true }));
  for (const r of auditRows) {
    const line = auditLine(r, names, timeZone);
    if (line) lines.push(line);
  }
  return lines.sort((a, b) => a.at.getTime() - b.at.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
