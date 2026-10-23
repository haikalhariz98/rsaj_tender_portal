/**
 * What loading starter packs would write, and what it would skip (ADR 0043 D1). Pure: given the packs and a snapshot of the organisation's
 * current values (`snapshot.ts`), it returns the writes in the order they must run, the skips with their reasons, and the faults. One fault
 * refuses the whole run. `apply.ts` runs the writes.
 *
 * The fill rules, which make loading idempotent and mean it never overwrites:
 * - a group is written only when every column it names is unset (null, or an empty list); a half-set group is skipped whole;
 * - a list is loaded only when it is empty; a list with any row is skipped whole;
 * - a reference (`{ ref: "<Model>:<code>" }`) resolves to a row this run writes; if that row is skipped, the referring group or list is too;
 * - packs load in the order given, and the first pack wins: a later pack finds what an earlier one wrote already set.
 *
 * A list row is given what its table has and the pack leaves out: its code, its order as listed, the pack's provenance and the row's source.
 *
 * Packs load only while two-person approval is off (SP-23). A run may create a new organisation's first security settings with it off
 * (`WHEN_CREATING_ROW`, the generic pack at setup, SP-3); the development fill may turn it off on a database holding the demonstration
 * (`DEMO_DATABASE_ONLY`, the only exception). No pack value may name the switch itself.
 */

import { Prisma } from "@/generated/prisma/browser";
import { policyFault } from "@/lib/auth/policy";
import { destinationRowFaults, type RejectionKind } from "@/lib/authority/rejection";
import { dayToDate, todayIn } from "@/lib/dates";
import { documentFaultText } from "@/lib/documents/labels";
import { policyFaults } from "@/lib/documents/policy";
import { patternFaults, type NumberingReset } from "@/lib/numbering/series";
import { listValueFaults } from "@/lib/suppliers/config";

import type { PackName, PackPlan, PackProvenance, PackSkip, StarterPack } from "./types";

/// A value standing for the organisation's day when the pack loads (a dated row's `effectiveFrom`). Needs the organisation's time zone.
export const LOAD_DAY = { loadDay: true } as const;

/// What the organisation holds now, as `snapshot.ts` reads it.
export interface PackSnapshot {
  now: Date;
  /// The organisation's own row ("Organisation"), its security settings ("SecurityPolicy"), and the one row of each other table a group
  /// writes, by model. Null: no row yet.
  rows: Record<string, Record<string, unknown> | null>;
  /// How many rows each list holds, by `listKey`.
  listSizes: Record<string, number>;
  /// The database holds the demonstration (`demoIsLoaded`).
  demoIsLoaded: boolean;
}

interface WriteBase {
  pack: PackName;
  /// The SYSTEM actor's label.
  actor: string;
  model: string;
  source: string;
  requirement?: string;
  provenance: PackProvenance;
}
export type PackWrite =
  | (WriteBase & { kind: "SWITCH_OFF"; create: boolean; reason: string })
  | (WriteBase & { kind: "GROUP"; label: string; create: boolean; values: Record<string, unknown>; before: Record<string, unknown> | null; provenanceColumn?: string; sourceColumn?: string })
  | (WriteBase & { kind: "ROW"; listLabel: string; code: string; label: string; values: Record<string, unknown> });
export type PlannedSkip = PackSkip & { pack: PackName; provenance: PackProvenance };
export interface PlannedPacks extends PackPlan {
  writes: PackWrite[];
  skips: PlannedSkip[];
}

/// Tables no pack writes: the audit trail, the two-person records, the issue-guarded tables (a pack's matrix or model is a draft, D2),
/// and people, their accounts and their grants (a script is not a person).
export const FORBIDDEN_MODELS: readonly string[] = [
  "AuditEntry",
  "ConfigurationChange",
  "ConfigurationDraftMaker",
  "AuthorityMatrix",
  "AuthorityMatrixMaker",
  "AuthorityRule",
  "EvaluationModel",
  "RateSchedule",
  "RolePermission",
  "RoleAssignment",
  "Delegation",
  "Person",
  "StaffAccount",
  "StaffSession",
  "SupplierAccount",
  "SupplierSession",
  "OneTimeCode",
  "SignInEvent",
];
/// Columns no pack value names: the keys the loader writes itself, and the switch, which moves only by `setsTwoPersonOff`.
const FORBIDDEN_COLUMNS = ["id", "organisationId", "twoPersonChanges"];

export const PACK_ACTOR: Record<PackName, (version: number) => string> = {
  generic: (v) => `Starter pack: Generic v${v}`,
  rsaj: (v) => `Starter pack: RSAJ v${v}`,
  "dev-fill": () => "Development fill (founder's instruction 2026-10-23)",
};
export const SWITCH_OFF_REASON: Record<"WHEN_CREATING_ROW" | "DEMO_DATABASE_ONLY", string> = {
  WHEN_CREATING_ROW: "A new organisation's security settings, made at setup with approval by another admin off: setup is before go-live (ADR 0043 D3, SP-3).",
  DEMO_DATABASE_ONLY: "The founder's instruction of 2026-10-23 for the demonstration database: \"we don't need second approver until after go live\" (ADR 0043 D3, SP-23).",
};

/// Which list a pack list fills: its model and the scope that narrows it.
export const listKey = (l: { model: string; scope?: Record<string, unknown> }) => `${l.model}${l.scope ? JSON.stringify(l.scope) : ""}`;
export const isSet = (v: unknown) => v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0);
const refOf = (v: unknown): string | null => (v && typeof v === "object" && !Array.isArray(v) && typeof (v as { ref?: unknown }).ref === "string" ? (v as { ref: string }).ref : null);
const isLoadDay = (v: unknown) => !!v && typeof v === "object" && (v as { loadDay?: unknown }).loadDay === true;
/// The columns of a model, from the generated client; null for a model the schema does not have.
export function columnsOf(model: string): readonly string[] | null {
  if (!(model in Prisma.ModelName)) return null;
  const e = (Prisma as unknown as Record<string, Record<string, string> | undefined>)[`${model}ScalarFieldEnum`];
  return e ? Object.values(e) : null;
}

function shapeFaults(pack: StarterPack): string[] {
  const out: string[] = [];
  const check = (model: string, cols: string[], where: string) => {
    const known = columnsOf(model);
    if (!known) return out.push(`${where}: there is no table ${model}.`);
    if (FORBIDDEN_MODELS.includes(model)) return out.push(`${where}: a pack never writes ${model}.`);
    for (const c of cols) {
      if (FORBIDDEN_COLUMNS.includes(c)) out.push(`${where}: a pack never sets ${model}.${c}.`);
      else if (!known.includes(c)) out.push(`${where}: ${model} has no column ${c}.`);
    }
  };
  for (const g of pack.groups) {
    check(g.model, [...Object.keys(g.values), ...(g.provenanceColumn ? [g.provenanceColumn] : []), ...(g.sourceColumn ? [g.sourceColumn] : [])], `${pack.name} · ${g.label}`);
    if (Object.keys(g.values).length === 0) out.push(`${pack.name} · ${g.label}: the group sets nothing.`);
  }
  for (const l of pack.lists) {
    check(l.model, Object.keys(l.scope ?? {}), `${pack.name} · ${l.label}`);
    for (const r of l.rows) check(l.model, Object.keys(r.values), `${pack.name} · ${l.label} · ${r.code}`);
    if (new Set(l.rows.map((r) => r.code)).size !== l.rows.length) out.push(`${pack.name} · ${l.label}: two rows share a code.`);
  }
  if (pack.drafts) out.push(`${pack.name}: this loader does not load drafts yet.`);
  return out;
}

/// The faults of the values as they would stand after the run, judged by the product's own validators.
function valueFaults(writes: PackWrite[], rows: PackSnapshot["rows"]): string[] {
  const out: string[] = [];
  const sp = rows.SecurityPolicy;
  if (writes.some((w) => w.kind === "GROUP" && w.model === "SecurityPolicy") && sp) {
    const f = policyFault(sp as Parameters<typeof policyFault>[0]);
    if (f) out.push(`Security settings: ${f}`);
  }
  const store = rows.DocumentStorePolicy;
  if (writes.some((w) => w.kind === "GROUP" && w.model === "DocumentStorePolicy") && store) {
    const maxBytes = store.maxBytes == null ? null : String(store.maxBytes);
    for (const f of policyFaults({ allowedMediaTypes: (store.allowedMediaTypes as string[] | undefined) ?? [], maxBytes })) out.push(`Upload rules: ${documentFaultText(f)}`);
  }
  const destinations = writes.filter((w): w is Extract<PackWrite, { kind: "ROW" }> => w.kind === "ROW" && w.model === "RejectionDestination");
  const asDestination = (w: Extract<PackWrite, { kind: "ROW" }>) => ({
    id: w.code,
    domain: String(w.values.domain),
    kind: w.values.kind as RejectionKind,
    returnToRoleCode: (w.values.returnToRoleCode as string | null | undefined) ?? null,
    effectiveFrom: w.values.effectiveFrom as Date,
    effectiveTo: (w.values.effectiveTo as Date | null | undefined) ?? null,
  });
  for (const w of destinations) for (const f of destinationRowFaults(asDestination(w), destinations.map(asDestination), [])) out.push(`${w.listLabel} · ${w.code}: ${f}`);
  for (const w of writes) {
    if (w.kind === "ROW" && w.model === "SupplierListValue") {
      const v = w.values as { code: string; nameEn: string; provenance: string; callingCode?: string | null; list: string };
      for (const f of listValueFaults(v, { codeTaken: false, kindListed: true, list: v.list })) out.push(`${w.listLabel} · ${w.code}: ${f.code}`);
    }
    if (w.kind !== "ROW" || w.model !== "NumberingSeries") continue;
    for (const f of patternFaults({ pattern: String(w.values.pattern ?? ""), resetOn: (w.values.resetOn as NumberingReset | undefined) ?? "CALENDAR_YEAR" })) out.push(`${w.listLabel} · ${w.code}: ${f.kind}`);
  }
  return out;
}

export function planPacks(packs: readonly StarterPack[], snap: PackSnapshot): PlannedPacks {
  const faults = packs.flatMap(shapeFaults);
  if (new Set(packs.map((p) => p.name)).size !== packs.length) faults.push("A pack is named twice.");
  const writes: PackWrite[] = [];
  const skips: PlannedSkip[] = [];
  const rows: PackSnapshot["rows"] = Object.fromEntries(Object.entries(snap.rows).map(([m, r]) => [m, r && { ...r }]));
  const sizes = { ...snap.listSizes };
  if (!rows.Organisation) faults.push("There is no such organisation.");

  // The switch, judged once for the whole run: a missing row reads as on.
  const sp = rows.SecurityPolicy;
  const devFill = packs.find((p) => p.setsTwoPersonOff === "DEMO_DATABASE_ONLY");
  const creator = packs.find((p) => p.setsTwoPersonOff === "WHEN_CREATING_ROW");
  const switchOff = (p: StarterPack, why: keyof typeof SWITCH_OFF_REASON) => {
    writes.push({ kind: "SWITCH_OFF", pack: p.name, actor: PACK_ACTOR[p.name](p.version), model: "SecurityPolicy", create: !sp, reason: SWITCH_OFF_REASON[why], source: SWITCH_OFF_REASON[why], provenance: p.provenance });
    rows.SecurityPolicy = { ...(sp ?? {}), twoPersonChanges: false };
  };
  if (devFill) {
    if (!snap.demoIsLoaded) faults.push("The development fill loads only into a database that holds the demonstration.");
    else if (sp?.twoPersonChanges !== false) switchOff(devFill, "DEMO_DATABASE_ONLY");
  } else if (!sp && creator) switchOff(creator, "WHEN_CREATING_ROW");
  else if (sp?.twoPersonChanges !== false) faults.push("Approval by another admin is on for this organisation. A pack loads only before go-live, while it is off: a live organisation's settings change through people.");

  // Every row any pack in the run defines, so a reference to nothing is a fault rather than a skip.
  const defined = new Set(packs.flatMap((p) => p.lists.flatMap((l) => l.rows.map((r) => `${l.model}:${r.code}`))));
  const written = new Set<string>();
  const unresolved = (values: Record<string, unknown>, where: string): boolean => {
    let missing = false;
    for (const v of Object.values(values)) {
      const ref = refOf(v);
      if (ref == null) continue;
      if (!defined.has(ref)) faults.push(`${where}: the reference ${ref} names no row of any pack in this run.`);
      if (!written.has(ref)) missing = true;
    }
    return missing;
  };

  for (const pack of packs) {
    const actor = PACK_ACTOR[pack.name](pack.version);
    const skip = (target: string, reason: PackSkip["reason"]) => skips.push({ target, reason, pack: pack.name, provenance: pack.provenance });
    for (const list of pack.lists) {
      const key = listKey(list);
      if ((sizes[key] ?? 0) > 0) {
        skip(list.label, "LIST_NOT_EMPTY");
        continue;
      }
      if (list.rows.some((r) => unresolved(r.values, `${pack.name} · ${list.label} · ${r.code}`))) {
        skip(list.label, "REFERENCE_SKIPPED");
        continue;
      }
      const columns = columnsOf(list.model) ?? [];
      for (const [i, r] of list.rows.entries()) {
        const values: Record<string, unknown> = { ...list.scope, ...r.values };
        if (columns.includes("sortOrder") && !("sortOrder" in values)) values.sortOrder = i + 1;
        if (columns.includes("code") && !("code" in values)) values.code = r.code;
        if (columns.includes("provenance") && !("provenance" in values)) values.provenance = pack.provenance;
        if (columns.includes("governingSource") && !("governingSource" in values)) values.governingSource = r.source;
        writes.push({ kind: "ROW", pack: pack.name, actor, model: list.model, listLabel: list.label, code: r.code, label: r.label ?? String(r.values.nameEn ?? r.values.name ?? r.code), values, source: r.source, requirement: r.requirement, provenance: pack.provenance });
        written.add(`${list.model}:${r.code}`);
      }
      sizes[key] = list.rows.length;
    }
    for (const g of pack.groups) {
      const row = rows[g.model] ?? null;
      const cols = Object.keys(g.values);
      const set = cols.filter((c) => row != null && isSet(row[c]));
      if (set.length === cols.length) {
        skip(g.label, "GROUP_SET");
        continue;
      }
      if (set.length > 0) {
        skip(g.label, "GROUP_PARTLY_SET");
        continue;
      }
      if (unresolved(g.values, `${pack.name} · ${g.label}`)) {
        skip(g.label, "REFERENCE_SKIPPED");
        continue;
      }
      if (!row && g.model === "Organisation") continue; // faulted above
      const values: Record<string, unknown> = { ...g.values };
      if (g.provenanceColumn) values[g.provenanceColumn] = pack.provenance;
      if (g.sourceColumn) values[g.sourceColumn] = g.source;
      const before = row ? Object.fromEntries(Object.keys(values).map((c) => [c, row[c] ?? null])) : null;
      writes.push({ kind: "GROUP", pack: pack.name, actor, model: g.model, label: g.label, create: !row, values, before, provenanceColumn: g.provenanceColumn, sourceColumn: g.sourceColumn, source: g.source, requirement: g.requirement, provenance: pack.provenance });
      rows[g.model] = { ...(row ?? {}), ...values };
    }
  }

  // A dated row takes the organisation's day, in the time zone it will have once this run is done.
  const today = todayIn(snap.now, (rows.Organisation?.timeZone as string | null | undefined) ?? null);
  for (const w of writes) {
    if (w.kind === "SWITCH_OFF") continue;
    for (const [c, v] of Object.entries(w.values)) {
      if (!isLoadDay(v)) continue;
      if (today == null) faults.push(`${w.kind === "ROW" ? w.listLabel : w.label}: a dated value needs the organisation's time zone.`);
      else w.values[c] = dayToDate(today);
    }
  }
  if (faults.length === 0) faults.push(...valueFaults(writes, rows));
  return faults.length > 0 ? { writes: [], skips, faults } : { writes, skips, faults };
}
