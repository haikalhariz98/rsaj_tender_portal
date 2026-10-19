import type { CapturedAudit } from "@/lib/ambient/ambient-tx";
import { fieldLabel } from "@/lib/audit/diff";
import { historyEntityLabel, historyValueWords } from "@/lib/audit/entity-labels";
import { sulitFieldOf } from "@/lib/sulit-trail";

import type { ChangeLine } from "./configuration-change-words";
import type { PermissionKey } from "./types";

/**
 * A configuration editor's save, held for a second person (ADR 0034 D15, Phase 5). Pure.
 *
 * Every Configuration editor but the sign-in ones is one `ConfigurationChange` of an edit kind. The change carries the editor (`operation`) and what was posted to it
 * (`fields`). Nothing about the editor's rules is restated here: when the second person applies the change the editor itself runs, on the live values, inside the
 * decision's transaction (`src/lib/ambient/ambient-tx.ts`). The proposal is a rehearsal of the same run, which is undone: it tells the proposer at once what the editor
 * refuses, and it leaves the audit rows the editor wrote (`before`), which are what the second person reads and what an unchanged world must still produce at the
 * decision, or the change is STALE.
 *
 * What a change must not carry is the password or anything that names who signs: those fields are read from the request of whoever acts, and are never stored.
 */

/// The kinds that are an editor's save. Each has its own enum value and migration (BD-613-112); the rule of every one is the same.
export const EDIT_KINDS = [
  "CONFIGURATION_EDIT",
  "QUORUM_CHANGE",
  "OPENING_PANEL_SIZE",
  "CLASSIFICATION_DOWNGRADE",
  "BASELINE_CORRECTION",
  "AWARD_TERM_CORRECTION",
  "CONTRACT_DATE_CORRECTION",
  "AWARD_RETURN_CORRECTION",
  // Wave 3b (SR-13, ADR 0036 D1, build plan step 7): the bid sealing policy's editor, the switch and the recorded conditions for LIVE.
  "BID_SEALING_POLICY",
] as const;
export type EditKind = (typeof EDIT_KINDS)[number];
export const isEditKind = (kind: string): kind is EditKind => (EDIT_KINDS as readonly string[]).includes(kind);

/// Who proposes an editor's save and who decides it: the maker's key and the checker's, as for the approval matrix (draft, then issue).
export const EDIT_PROPOSE_PERMISSION: PermissionKey = "configuration.draft";
export const EDIT_DECIDE_PERMISSION: PermissionKey = "configuration.issue";
/// The checker of a correction of the record (a contract's baseline, an award's terms, the Contract Date, an accepted award's return, a lowered classification): granted to
/// a role by the organisation, never held through the administrator flag, and undecided until the organisation decides.
export const CORRECTIONS_DECIDE_PERMISSION: PermissionKey = "corrections.decide";

/// What each edit kind is, for the queue's heading. The operation's own label says which editor.
export const EDIT_KIND_WORDS: Record<EditKind, { en: string;  }> = {
  CONFIGURATION_EDIT: { en: "Change configuration" },
  QUORUM_CHANGE: { en: "Change a committee's quorum" },
  OPENING_PANEL_SIZE: { en: "Change the number of people who open the bids" },
  CLASSIFICATION_DOWNGRADE: { en: "Lower a classification" },
  BASELINE_CORRECTION: { en: "Correct a contract's baseline" },
  AWARD_TERM_CORRECTION: { en: "Correct an award's recorded terms" },
  CONTRACT_DATE_CORRECTION: { en: "Correct the Contract Date" },
  AWARD_RETURN_CORRECTION: { en: "Correct an accepted award's return" },
  BID_SEALING_POLICY: { en: "Change the bid sealing policy" },
};

/// The kinds that are an act of the record, not of configuration: what they carry names a document, an award or a contract, which may sit in an exercise restricted from the reader.
export const RECORD_EDIT_KINDS: readonly EditKind[] = ["CLASSIFICATION_DOWNGRADE", "BASELINE_CORRECTION", "AWARD_TERM_CORRECTION", "CONTRACT_DATE_CORRECTION", "AWARD_RETURN_CORRECTION"];

/**
 * The kinds of edit a person reads in the queue. An editor's save of configuration: to a holder of either permission that makes or decides one, and to a holder of the permission to
 * read the audit trail (what it carries is what the trail would record of it, and a SULIT figure is not shown). A correction of the record (its subject is a document, an award or a
 * contract, perhaps in an exercise restricted from the reader): only to the holder of the permission that decides it. The one who proposed it reads their own, whatever they hold
 * (`changes-view.ts`).
 */
export const editKindsReadBy = (permissions: ReadonlySet<PermissionKey>): EditKind[] => {
  const ofConfiguration = permissions.has("audit.read") || permissions.has(EDIT_PROPOSE_PERMISSION) || permissions.has(EDIT_DECIDE_PERMISSION) || permissions.has(CORRECTIONS_DECIDE_PERMISSION);
  const kinds = EDIT_KINDS.filter((k) => !RECORD_EDIT_KINDS.includes(k));
  if (permissions.has(CORRECTIONS_DECIDE_PERMISSION)) return [...EDIT_KINDS];
  return ofConfiguration ? kinds : [];
};

// --------------------------------------------------------------------------------------------- what is posted

/// A file posted with the form, held as it was sent. Only small ones are held: a change is a record, not a store of documents.
export interface StagedFile {
  name: string;
  type: string;
  size: number;
  base64: string;
}
export type StagedValue = string | { file: StagedFile };

export interface EditPayload {
  /// The editor, as the registry names it ("numbering.saveSeries").
  operation: string;
  fields: [string, StagedValue][];
}

export const MAX_FIELDS = 600;
export const MAX_VALUE_CHARS = 200_000;
export const MAX_FILE_BYTES = 1_500_000;
export const MAX_PAYLOAD_CHARS = 2_500_000;

/**
 * Whether a posted field is stored with the change. Not stored: a password (`<person>:password`), the fields of an act's attribution that say who it is on behalf of or
 * back-date it, and the form's token. The second person's own are read from their own request when the editor runs. Stored, since ruling 1982(h)(1): the paper's reference and
 * the act's reason, which the person who proposed an act that names its subject recorded, and which the apply attributes it through.
 */
export function isStoredField(name: string): boolean {
  if (name === "formToken" || name.startsWith("$ACTION") || name.startsWith("__")) return false;
  const colon = name.indexOf(":");
  if (colon >= 0) {
    const act = name.slice(colon + 1);
    // The paper's reference and the act's reason ARE kept (ruling 1982(h)(1), log line 2036): an act that names its subject in its form (a delegation's grantor, recorded from a
    // letter) is attributed at the apply to the person the proposer recorded it for, and its paper must reach the second person's apply. Never the password.
    if (["password", "onBehalf", "backdate", "backdateReason", "backdateAuthorisedBy"].includes(act)) return false;
  }
  return !/^(current|new|confirm)?password$/i.test(name);
}

export interface EditFault {
  field: string;
  code: string;
  en: string;
}
const bad = (field: string, code: string, en: string): EditFault => ({ field, code, en });

/// A posted form, narrowed to what is stored. An unknown shape is refused field by field, never guessed at.
export function parseEditPayload(raw: unknown): { ok: true; payload: EditPayload } | { ok: false; faults: EditFault[] } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, faults: [bad("*", "NOT_AN_OBJECT", "A change is an object.")] };
  const o = raw as Record<string, unknown>;
  const faults: EditFault[] = [];
  for (const k of Object.keys(o)) if (k !== "operation" && k !== "fields") faults.push(bad(k, "UNKNOWN_FIELD", "This is not something a change of this kind carries."));
  if (typeof o.operation !== "string" || !/^[a-z][a-zA-Z0-9-]*\.[a-zA-Z][a-zA-Z0-9]*$/.test(o.operation)) faults.push(bad("operation", "BAD_OPERATION", "Name the editor."));
  if (!Array.isArray(o.fields)) faults.push(bad("fields", "BAD_FIELDS", "A change carries a list of fields."));
  if (faults.length > 0) return { ok: false, faults };
  const entries = o.fields as unknown[];
  if (entries.length > MAX_FIELDS) return { ok: false, faults: [bad("fields", "TOO_MANY", "This form has more fields than a change can hold.")] };
  const fields: [string, StagedValue][] = [];
  let size = 0;
  for (const e of entries) {
    if (!Array.isArray(e) || e.length !== 2 || typeof e[0] !== "string" || e[0] === "" || e[0].length > 120) {
      faults.push(bad("fields", "BAD_FIELD", "A field is a name and a value."));
      continue;
    }
    const [name, value] = e as [string, unknown];
    if (!isStoredField(name)) {
      faults.push(bad(name, "NOT_STORED", "This field is never stored with a change."));
      continue;
    }
    if (typeof value === "string") {
      if (value.length > MAX_VALUE_CHARS) faults.push(bad(name, "TOO_LONG", "This value is too long for a change to hold."));
      size += value.length;
      fields.push([name, value]);
      continue;
    }
    const f = typeof value === "object" && value !== null ? (value as { file?: unknown }).file : undefined;
    if (typeof f === "object" && f !== null) {
      const file = f as Record<string, unknown>;
      const ok = typeof file.name === "string" && typeof file.type === "string" && typeof file.size === "number" && typeof file.base64 === "string" && Object.keys(file).length === 4;
      if (!ok) faults.push(bad(name, "BAD_FILE", "A file is its name, type, size and bytes."));
      else if ((file.size as number) > MAX_FILE_BYTES) faults.push(bad(name, "FILE_TOO_LARGE", "This file is too large for a change to hold."));
      else {
        size += (file.base64 as string).length;
        fields.push([name, { file: { name: file.name as string, type: file.type as string, size: file.size as number, base64: file.base64 as string } }]);
      }
      continue;
    }
    faults.push(bad(name, "BAD_VALUE", "A value is text or a file."));
  }
  if (size > MAX_PAYLOAD_CHARS) faults.push(bad("fields", "TOO_LARGE", "This form is too large for a change to hold."));
  if (faults.length > 0) return { ok: false, faults };
  return { ok: true, payload: { operation: o.operation as string, fields } };
}

/// Two proposals that post the same thing to the same editor.
export function samePayload(a: EditPayload, b: EditPayload): boolean {
  if (a.operation !== b.operation || a.fields.length !== b.fields.length) return false;
  const key = (p: EditPayload) => p.fields.map(([n, v]) => `${n}\u0000${typeof v === "string" ? v : `file:${v.file.name}:${v.file.size}:${v.file.base64.length}:${v.file.base64.slice(0, 64)}`}`).sort().join("\u0001");
  return key(a) === key(b);
}

/// The value of a posted field, or null. Several of one name (a multiple choice) are all kept in the list, in order, and this reads the first.
export function fieldValue(payload: EditPayload, name: string): string | null {
  const hit = payload.fields.find(([n]) => n === name);
  return hit && typeof hit[1] === "string" ? hit[1] : null;
}

// --------------------------------------------------------------------------------------------- what it did, rehearsed

/// What the rehearsal left: the audit rows the editor wrote, as the trail would hold them. The `before` of the change.
export interface Rehearsal {
  rows: { entity: string; entityLabel: string; action: "CREATE" | "UPDATE" | "DELETE"; changes: { field: string; before: string | null; after: string | null }[] }[];
}

export const rehearsalOf = (captured: readonly CapturedAudit[]): Rehearsal => ({
  rows: captured.map((c) => ({ entity: c.entity, entityLabel: c.entityLabel, action: c.action, changes: c.changes.map((x) => ({ field: x.field, before: x.before, after: x.after })) })),
});

/// Whether a stored `before` is a rehearsal (a change of an older shape, or damaged, is not).
export function readRehearsal(raw: unknown): Rehearsal | null {
  if (typeof raw !== "object" || raw === null) return null;
  const rows = (raw as { rows?: unknown }).rows;
  if (!Array.isArray(rows)) return null;
  for (const r of rows) {
    if (typeof r !== "object" || r === null) return null;
    const x = r as Record<string, unknown>;
    if (typeof x.entity !== "string" || typeof x.entityLabel !== "string" || !["CREATE", "UPDATE", "DELETE"].includes(String(x.action)) || !Array.isArray(x.changes)) return null;
  }
  return raw as Rehearsal;
}

/**
 * What an unchanged world must still produce: for each audit row the editor wrote, its record type, its action, and for every field it moved what the field held
 * before. What it moved the field to is the editor's own work from the same posted form, so it is not compared; what the field held is the world, and if that
 * differs the proposer did not see what the second person would change.
 */
export function standingOf(rows: Rehearsal["rows"]): string[] {
  const out: string[] = [];
  for (const r of rows) {
    out.push(`${r.entity}\u0000${r.action}`);
    for (const c of r.changes) out.push(`${r.entity}\u0000${r.action}\u0000${c.field}\u0000${c.before === null ? "\u0001null" : c.before}`);
  }
  return out.sort();
}

/// STALE: the editor, run now, would change something different from what it was rehearsed to change. Nothing is applied.
export function editIsStale(proposed: Rehearsal, now: readonly CapturedAudit[]): boolean {
  const a = standingOf(proposed.rows);
  const b = standingOf(rehearsalOf(now).rows);
  return a.length !== b.length || a.some((x, i) => x !== b[i]);
}

// --------------------------------------------------------------------------------------------- in words

export interface EditSummary {
  title: string;
  subject: string | null;
  lines: ChangeLine[];
}

export const SULIT_HIDDEN = "Held SULIT: shown only to a reader entitled to it";

/**
 * A stored edit in the trail's own words: what the editor would write, record by record. A value that is held SULIT is not shown (the queue is read by those who
 * decide the change, who are not thereby entitled to a SULIT figure: the rate of a bill of quantities, say). The values are the trail's rendering of the record.
 */
export function describeEdit(kind: EditKind, operationLabel: string | null, before: unknown): EditSummary {
  const title = kind === "CONFIGURATION_EDIT" ? (operationLabel ?? EDIT_KIND_WORDS[kind].en) : EDIT_KIND_WORDS[kind].en;
  const r = readRehearsal(before);
  if (!r) return { title, subject: null, lines: [{ label: "This change", before: null, after: "Cannot be read: it no longer fits what a change of this kind carries." }] };
  if (r.rows.length === 0) return { title, subject: null, lines: [{ label: "This change", before: null, after: "Writes nothing." }] };
  const lines: ChangeLine[] = [];
  const many = r.rows.length > 1;
  for (const row of r.rows) {
    const name = historyEntityLabel(row.entity, row.entityLabel);
    const verb = row.action === "CREATE" ? "Added" : row.action === "DELETE" ? "Removed" : null;
    if (verb && row.changes.length === 0) lines.push({ label: name, before: null, after: verb });
    for (const c of row.changes) {
      const hidden = sulitFieldOf(row.entity, c.field) != null;
      const value = (v: string | null) => (v == null ? null : hidden ? SULIT_HIDDEN : (historyValueWords(row.entity, c.field, v) ?? v));
      const label = fieldLabel(c.field);
      lines.push({ label: many || verb ? `${name}${verb ? ` (${verb.toLowerCase()})` : ""} · ${label}` : label, before: row.action === "CREATE" ? null : value(c.before), after: value(c.after) ?? "Cleared" });
    }
  }
  return { title, subject: historyEntityLabel(r.rows[0].entity, r.rows[0].entityLabel), lines };
}
