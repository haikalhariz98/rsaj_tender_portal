/**
 * Exporting the audit trail (FR-APR-015, 6.9 ruling: partly met).
 *
 * The trail is a file an outside auditor can take away: every entry recorded on the
 * organisation's days asked for, oldest first, as CSV, with a SHA-256 digest of the
 * file's exact bytes. The export is itself recorded, with its digest, in the same
 * transaction as the rows are read — so a file handed over can later be checked
 * against the record of what was exported.
 *
 * What the digest proves is narrow, and the screen says so: that a file is the one
 * the portal produced. It does not prove the database was never altered — refusing an
 * edit at the database itself waits for sign-in and for demo tooling that does not
 * need to delete trail rows.
 *
 * SULIT values never leave in it (6.7 review M-3): a change to a registered SULIT field is listed
 * with its values replaced by "Withheld: SULIT, not exported".
 *
 * Pure.
 */

import { historyEntityLabel, historyValueWords } from "./entity-labels";
import { createHash } from "node:crypto";

import { csvCell } from "@/lib/csv-cell";
import { dayIn } from "@/lib/dates";
import { sulitFieldOf } from "@/lib/sulit-trail";
import { CONTRACTOR_ASSIGNEE } from "@/lib/work/fields";
import { CONTRACTOR_AUDIT_WORDS } from "@/lib/work/labels";

import { CORE_ROUTING_ENTITY_NAME } from "./core-routing-trail";
import { rowFieldLabel } from "./diff";

export interface ExportRow {
  id: string;
  at: Date;
  entity: string;
  entityId: string;
  entityLabel: string;
  action: string;
  changes: unknown;
  reason: string;
  unattributed: boolean;
  actorName: string | null;
}

export const EXPORT_COLUMNS = ["Entry", "Recorded at (UTC)", "Organisation's day", "Record type", "Record", "Record id", "Action", "Changes", "Reason", "Recorded by"] as const;

/// A record type as a person reads it: "AuthorityRule" is "Authority rule", the core
/// routing types have their own names. The model name is a code and stays out of the file.
export function recordTypeLabel(entity: string): string {
  const own = (CORE_ROUTING_ENTITY_NAME as Record<string, string>)[entity];
  if (own) return own;
  const spaced = entity.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/// What the file holds in place of a SULIT value (6.7 review M-3): the change is listed, its figure is not.
export const SULIT_WITHHELD = "Withheld: SULIT, not exported";

/// A value of a registered SULIT field, withheld; an empty one stays empty (nothing to withhold).
const withheld = (v: unknown) => (v == null || v === "" ? v : SULIT_WITHHELD);

/// A work item's person and document columns hold ids; the file names them, resolved when it is made (`workIdsIn`, then the caller's lookup).
const isWorkIdField = (entity: string, field: string) => entity === "WorkItem" && (field === "assigneePersonId" || field === "fromDocumentId");

/// The ids in the rows' work item changes that the file should name.
export function workIdsIn(rows: readonly Pick<ExportRow, "entity" | "changes">[]): string[] {
  const ids = new Set<string>();
  for (const r of rows) {
    if (r.entity !== "WorkItem" || !Array.isArray(r.changes)) continue;
    for (const c of r.changes as { field?: unknown; before?: unknown; after?: unknown }[]) {
      if (typeof c?.field !== "string" || !isWorkIdField("WorkItem", c.field)) continue;
      for (const v of [c.before, c.after]) if (typeof v === "string" && v && v !== CONTRACTOR_ASSIGNEE) ids.add(v);
    }
  }
  return [...ids];
}

/**
 * The changes with field names as the History drawer reads them, not as stored. A registered SULIT
 * field (`sulit-fields.ts`: a price as read, the company estimate, the paper copy's figure, a
 * withdrawal letter's quote…) is listed with its values withheld: the file leaves the portal, and
 * nothing yet restricts who reads it (NFR-SEC-002, 6.2 OD-8).
 */
function labelledChanges(changes: unknown, entity = "", names: ReadonlyMap<string, string> = new Map()): unknown {
  if (!Array.isArray(changes)) return changes ?? [];
  const fields = changes.map((c) => (c && typeof c === "object" && "field" in c ? String((c as { field: unknown }).field) : ""));
  // 612-C2: a value an older writer built from a code reads through the label map, as History reads it.
  const words = (raw: string, v: unknown) => (typeof v !== "string" ? v : isWorkIdField(entity, raw) ? (v === CONTRACTOR_ASSIGNEE ? CONTRACTOR_AUDIT_WORDS : (names.get(v) ?? "someone no longer listed")) : historyValueWords(entity, raw, v));
  return changes.map((c) => {
    if (!c || typeof c !== "object" || !("field" in c)) return c;
    const raw = String((c as { field: unknown }).field);
    const change = c as { before?: unknown; after?: unknown };
    return { ...c, field: rowFieldLabel(raw, fields), ...(sulitFieldOf(entity, raw) ? { before: withheld(change.before), after: withheld(change.after) } : { before: words(raw, change.before), after: words(raw, change.after) }) };
  });
}

/**
 * The file, byte for byte: a header, then one line per entry in the order given,
 * lines ended with CRLF as RFC 4180 has it. Nothing in it depends on the clock or the
 * locale, so the same rows always give the same bytes and the same digest.
 */
export function auditCsv(rows: readonly ExportRow[], timeZone: string, names: ReadonlyMap<string, string> = new Map()): string {
  const lines = [EXPORT_COLUMNS.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.id,
        r.at.toISOString(),
        dayIn(r.at, timeZone),
        recordTypeLabel(r.entity),
        historyEntityLabel(r.entity, r.entityLabel),
        r.entityId,
        r.action,
        JSON.stringify(labelledChanges(r.changes, r.entity, names)),
        r.reason,
        r.unattributed ? "Not attributed: before sign-in" : (r.actorName ?? "A person no longer on record"),
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return lines.join("\r\n") + "\r\n";
}

/// SHA-256 of the file's UTF-8 bytes, as lowercase hex.
export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/// The entries of the days asked for, on the organisation's day, oldest first, ties by id.
export function entriesOnDays<T extends { id: string; at: Date }>(rows: readonly T[], fromDay: string, toDay: string, timeZone: string): T[] {
  return rows
    .filter((r) => {
      const d = dayIn(r.at, timeZone);
      return d >= fromDay && d <= toDay;
    })
    .sort((a, b) => a.at.getTime() - b.at.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export type ExportFault = "TIME_ZONE_UNSET" | "RANGE_REQUIRED" | "RANGE_REVERSED" | "RANGE_IN_FUTURE";

export function exportFault(fromDay: string | null, toDay: string | null, today: string | null): ExportFault | null {
  if (today == null) return "TIME_ZONE_UNSET";
  if (!fromDay || !toDay) return "RANGE_REQUIRED";
  if (fromDay > toDay) return "RANGE_REVERSED";
  if (toDay > today) return "RANGE_IN_FUTURE";
  return null;
}

export const EXPORT_FAULT_TEXT: Record<ExportFault, string> = {
  TIME_ZONE_UNSET: "Set the organisation's time zone first: the trail is exported by the organisation's days, which are not assumed to be UTC.",
  RANGE_REQUIRED: "Give the first and the last day to export.",
  RANGE_REVERSED: "The first day must not be after the last.",
  RANGE_IN_FUTURE: "The last day cannot be after today.",
};

/**
 * Who may take the trail away (Phase 3b, ADR 0034 D14: "the audit export needs `audit.read`"). The file holds every record's changes, among them the sign-in accounts' (their
 * sign-in names, why codes were issued). A filtered file would no longer be the whole range its digest and its record attest, so the whole export is for a holder of the
 * permission: an administrator holds it as one, and the organisation may grant it to a role (an auditor's). The file carries no SULIT value: a registered field is withheld
 * from it byte for byte (`SULIT_WITHHELD`), so what leaves is the trail and not the figures.
 */
export const EXPORT_NEEDS_AUDIT_READ_TEXT = "Reading and exporting the audit trail needs the permission to read and export it: it holds every change, among them the sign-in accounts' history.";

export const exportMayBeMadeBy = (holdsAuditRead: boolean): boolean => holdsAuditRead;

export const exportFileName = (fromDay: string, toDay: string) => `audit-trail_${fromDay}_to_${toDay}.csv`;
