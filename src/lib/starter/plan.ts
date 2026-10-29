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
 * A list row is given what its table has and the pack leaves out: its code, its order as listed, the pack's provenance and the row's source. A row
 * that names its own provenance (an ASSUMED row in a STATED pack) keeps it, and its audit row says so. A list
 * whose table has no organisation column (a method's proposal items) belongs to rows of another list: each of its rows names its parent by
 * reference, so it is empty by construction when its parent is written in the same run, and skipped with it.
 *
 * Drafts (ADR 0043 D2): an approval matrix or an evaluation model is loaded only as a draft, never in force, with no issuer and no maker, so a
 * named person adopts it and puts it in force through the normal issue path. A draft matrix is skipped (DRAFT_EXISTS) where the organisation has
 * any matrix of its own, draft or issued; draft models are skipped where it has any model. A draft names offices and committees by code: each
 * must be a row the same run writes, or the draft is skipped with it. The issue triggers still guard the tables.
 *
 * Packs load only while two-person approval is off (SP-23). A run may create a new organisation's first security settings with it off
 * (`WHEN_CREATING_ROW`, the generic pack at setup, SP-3); the development fill may turn it off on a database holding the demonstration
 * (`DEMO_DATABASE_ONLY`, the only exception). No pack value may name the switch itself.
 */

import { Prisma } from "@/generated/prisma/browser";
import { policyFault } from "@/lib/auth/policy";
import { awardReturnClassFault } from "@/lib/documents/award-return-class";
import { coreChainFaultsAcross, coreLevelFaults } from "@/lib/authority/core-routing";
import { choiceFaults, choiceFaultText } from "@/lib/authority/choice";
import { destinationRowFaults, type RejectionKind } from "@/lib/authority/rejection";
import { boundaryFaultsAcross } from "@/lib/authority/resolve";
import type { Role } from "@/lib/authority/types";
import { dayToDate, todayIn } from "@/lib/dates";
import { documentFaultText } from "@/lib/documents/labels";
import { matterLabel } from "@/lib/labels";
import { policyFaults } from "@/lib/documents/policy";
import { isLoopKey } from "@/lib/evaluation/loop";
import { patternFaults, type NumberingReset } from "@/lib/numbering/series";
import { channelSettingFaults } from "@/lib/sealing/switch";
import { listValueFaults } from "@/lib/suppliers/config";
import { megabytesOfBytes, registrationSettingErrors } from "@/lib/suppliers/registration-settings";
import { PART_CONFIG_FAULT_TEXT, partConfigFaults } from "@/lib/tender-docs/config";
import type { ConfiguredPart } from "@/lib/tender-docs/types";
import { configFaultText, policyFaults as windowPolicyFaults } from "@/lib/window/config";

import type { PackGroup, PackMatrixDraft, PackModelDraft, PackName, PackPlan, PackProvenance, PackSkip, StarterPack } from "./types";

/// A value standing for the organisation's day when the pack loads (a dated row's `effectiveFrom`). Needs the organisation's time zone.
export const LOAD_DAY = { loadDay: true } as const;

/// What the organisation holds now, as `snapshot.ts` reads it.
export interface PackSnapshot {
  now: Date;
  /// The organisation's own row ("Organisation"), its security settings ("SecurityPolicy"), and the one row of each other table a group
  /// writes, by model; a group naming a row by id, by `groupKey` ("ContractType#demo_ct3"). Null: no row yet.
  rows: Record<string, Record<string, unknown> | null>;
  /// How many rows each list holds, by `listKey`.
  listSizes: Record<string, number>;
  /// The database holds the demonstration (`demoIsLoaded`).
  demoIsLoaded: boolean;
  /// How many approval matrices of its own (not a funder's) and evaluation models the organisation has, draft or in force. Absent: none.
  drafts?: { matrices: number; evaluationModels: number };
  /// The document classes a pack names by literal id (`LITERAL_CLASS_COLUMNS`), by id; a missing id is no such class. Absent: none are named.
  classes?: Record<string, { organisationId: string; classification: string | null }>;
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
  | (WriteBase & { kind: "GROUP"; label: string; create: boolean; rowId?: string; values: Record<string, unknown>; before: Record<string, unknown> | null; provenanceColumn?: string; sourceColumn?: string })
  | (WriteBase & { kind: "ROW"; listLabel: string; code: string; label: string; values: Record<string, unknown> })
  | (WriteBase & { kind: "DRAFT_MATRIX"; label: string; draft: PackMatrixDraft; values: { effectiveFrom: unknown } })
  | (WriteBase & { kind: "DRAFT_MODEL"; label: string; draft: PackModelDraft; values: Record<string, never> });
export type PlannedSkip = PackSkip & { pack: PackName; provenance: PackProvenance };
export interface PlannedPacks extends PackPlan {
  writes: PackWrite[];
  skips: PlannedSkip[];
}

/// The tables a pack's groups and lists write: an allow-list, derived from the three packs (a test holds it to them). Anything else, the trail, people, grants,
/// the two-person records, the committee and panel members and the issue-guarded tables, is refused; a matrix or model is a draft written by the loader itself (D2).
export const ALLOWED_MODELS: readonly string[] = [
  "AuthorityRole",
  "AwardPolicy",
  "CertificateKindSetting",
  // Phase 2 close-out stage C (ruling 8): the final account's pack documents the RSAJ pack states.
  "CloseoutDocumentRequirement",
  "CodeFormat",
  "Committee",
  "ContractBasis",
  "ContractPolicy",
  "ContractType",
  "ControlledCopyRecipient",
  "DeclarationText",
  "DistributionRecipient",
  "DocumentClass",
  "DocumentFeeFloor",
  "DocumentStorePolicy",
  "EvaluationAspect",
  "FundingRoute",
  // ADR 0046: the funding sources and impact measures a pack states; project categories for the development fill only (the RSAJ pack names none).
  "FundingSource",
  "HolidayCalendar",
  "ImpactMeasure",
  "MethodChecklistItem",
  "NotApprovedOutcome",
  "NotificationRule",
  "NumberingSeries",
  "Organisation",
  "PostAwardPolicy",
  "ProjectCategory",
  "PublicationChannel",
  "RegistrationBody",
  "RejectionDestination",
  "RoutingSheetType",
  "RoutingTarget",
  "ScopePolicy",
  "SecurityPolicy",
  "SourcingMethod",
  "StandingReason",
  "SupplierDocumentType",
  "SupplierContact",
  "SupplierListValue",
  "SupplierPolicy",
  "TenderDocumentPart",
  "WindowPolicy",
];
/// The columns that name a document class. A pack names one by reference to a row it writes, or by the literal id of an existing row (the development fill): the latter is
/// judged to be a class of this organisation, and a bank statement's to be SULIT (step 4.8 M4).
export const LITERAL_CLASS_COLUMNS = ["projectDocumentClassId", "supplierUploadClassId", "supplierBankStatementClassId", "awardReturnClassId"] as const;
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
/// Where a group's row sits in the snapshot: by model, or by model and id for a group naming a row (`PackGroup.rowId`).
export const groupKey = (g: { model: string; rowId?: string }) => (g.rowId ? `${g.model}#${g.rowId}` : g.model);
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
    if (!ALLOWED_MODELS.includes(model)) return out.push(`${where}: a pack never writes ${model}.`);
    for (const c of cols) {
      if (FORBIDDEN_COLUMNS.includes(c)) out.push(`${where}: a pack never sets ${model}.${c}.`);
      else if (!known.includes(c)) out.push(`${where}: ${model} has no column ${c}.`);
    }
  };
  for (const g of pack.groups) {
    check(g.model, [...Object.keys(g.values), ...(g.provenanceColumn ? [g.provenanceColumn] : []), ...(g.sourceColumn ? [g.sourceColumn] : [])], `${pack.name} · ${g.label}`);
    if (Object.keys(g.values).length === 0) out.push(`${pack.name} · ${g.label}: the group sets nothing.`);
    if (g.rowId && pack.setsTwoPersonOff !== "DEMO_DATABASE_ONLY") out.push(`${pack.name} · ${g.label}: only the development fill names a row by its id.`);
  }
  for (const l of pack.lists) {
    check(l.model, Object.keys(l.scope ?? {}), `${pack.name} · ${l.label}`);
    for (const r of l.rows) check(l.model, Object.keys(r.values), `${pack.name} · ${l.label} · ${r.code}`);
    if (new Set(l.rows.map((r) => r.code)).size !== l.rows.length) out.push(`${pack.name} · ${l.label}: two rows share a code.`);
  }
  for (const l of pack.lists) {
    // A list with no organisation column belongs to rows of another list, and is told apart only by its parent.
    if (!(columnsOf(l.model) ?? []).includes("organisationId") && l.rows.some((r) => !Object.values(r.values).some((v) => refOf(v) != null))) out.push(`${pack.name} · ${l.label}: each row names the row it belongs to, by reference.`);
  }
  for (const m of pack.drafts?.matrices ?? []) out.push(...matrixShapeFaults(m).map((f) => `${pack.name} · ${m.label}: ${f}`));
  for (const d of pack.drafts?.evaluationModels ?? []) out.push(...modelShapeFaults(d).map((f) => `${pack.name} · ${d.content.nameEn}: ${f}`));
  return out;
}

/// Keys that would put a draft in force or name who made it: a pack sets none of them (ADR 0043 D2). Checked at run time, whatever the type says.
const IN_FORCE_KEYS = ["issuedAt", "issuedByPersonId", "issuedBy", "status", "makersUnknownAtLanding", "makers", "contentSnapshot", "effectiveTo", "retiredAt"];
const inForceKeys = (o: object) => Object.keys(o).filter((k) => IN_FORCE_KEYS.includes(k));

function matrixShapeFaults(m: PackMatrixDraft): string[] {
  const out = inForceKeys(m).map((k) => `a draft never sets ${k}.`);
  if (m.rules.length === 0) out.push("the draft has no rules.");
  if (new Set(m.rules.map((r) => r.ruleKey)).size !== m.rules.length) out.push("two rules share a key.");
  for (const r of m.rules) if (!r.labelEn.trim() || r.labelEn === r.ruleKey) out.push(`the rule ${r.ruleKey} needs a label in words.`);
  // As the issue's own rule (decision D2): a route choice is well formed, made or not.
  for (const f of choiceFaults(m.rules)) out.push(choiceFaultText(f, matterLabel(f.domain)));
  // As the issue's own rule: a boundary ruling is STATED only with its written source.
  if (m.boundaryProvenance === "STATED" && !m.boundarySource?.trim()) out.push("a stated boundary ruling needs its source.");
  return out;
}

function modelShapeFaults(d: PackModelDraft): string[] {
  const c = d.content;
  const out = inForceKeys(c).map((k) => `a draft never sets ${k}.`);
  const unique = (xs: readonly unknown[], what: string) => {
    if (new Set(xs).size !== xs.length) out.push(`two ${what} are the same.`);
  };
  unique(c.stages.map((s) => s.order), "stages' orders");
  unique(c.stages.map((s) => s.code), "stages' codes");
  unique(c.bandSets.map((b) => b.code), "band sets' codes");
  for (const s of c.stages) {
    unique(s.criteria.map((x) => x.code), `codes of the criteria of ${s.labelEn}`);
    unique(s.factors.map((x) => x.code), `codes of the factors of ${s.labelEn}`);
    for (const [i, x] of s.criteria.entries()) {
      if (x.parentCode && !s.criteria.slice(0, i).some((p) => p.code === x.parentCode)) out.push(`${s.labelEn} · ${x.labelEn}: its group comes before it in the same stage.`);
      if (x.bandSetCode && !c.bandSets.some((b) => b.code === x.bandSetCode)) out.push(`${s.labelEn} · ${x.labelEn}: the model has no band set ${x.bandSetCode}.`);
    }
  }
  return out;
}

/// The invitation controls' rules (`policyFaults`, with the channel rule of ruling 13), on a window policy row.
function windowFaults(window: Record<string, unknown>): string[] {
  const n = (c: string) => (window[c] == null ? null : Number(window[c]));
  const input = {
    minAdvertisementDays: n("minAdvertisementDays"),
    targetAdvertisementDays: n("targetAdvertisementDays"),
    newspaperWarnDays: n("newspaperWarnDays"),
    purchaseCutoffDays: n("purchaseCutoffDays"),
    defaultClosingTime: (window.defaultClosingTime as string | null | undefined) ?? null,
    advertisementDayRule: (window.advertisementDayRule as "LATEST_REQUIRED_CHANNEL" | "NAMED_CHANNEL" | null | undefined) ?? null,
    // Whether a named channel or calendar exists is the reference's question, not the policy's.
    advertisementChannelId: window.advertisementChannelId == null ? null : "named",
    calendarId: null,
    templateIds: [],
    documentSaleMode: (window.documentSaleMode as "COUNTER" | "ONLINE" | null | undefined) ?? null,
    electronicDocumentRelease: (window.electronicDocumentRelease as boolean | null | undefined) ?? null,
    // Ruling 13: a pack cannot know the deployment allows online bids, so it never sets the channel online.
    channelOnlineNotAllowed: channelSettingFaults((window.submissionChannel as "PAPER" | "ONLINE" | null | undefined) ?? null, { allowed: false, demonstration: false, fault: "ONLINE_NOT_ALLOWED" }).length > 0,
  };
  return windowPolicyFaults(input, { channels: [{ id: "named", retiredOn: null }], calendars: [], templateIds: [], today: null }).map((f) => `Invitation controls: ${configFaultText(f)}`);
}

/// The supplier register's rules (`registrationSettingErrors`) on a supplier policy row. A class named by reference is the run's own; a class id
/// already set was judged when it was saved.
function supplierFaults(supplier: Record<string, unknown>, classes: { id: string; classification: string | null }[]): string[] {
  const named = (c: string) => refOf(supplier[c]) ?? (typeof supplier[c] === "string" ? (supplier[c] as string) : null);
  const str = (c: string) => (supplier[c] == null ? null : String(supplier[c]));
  const bytes = supplier.uploadMaxBytesPerApplication as bigint | number | null | undefined;
  const input = {
    helpEmail: str("helpEmail"),
    helpPhone: str("helpPhone"),
    helpProvenance: str("helpProvenance"),
    maxFiles: supplier.uploadMaxFilesPerApplication == null ? null : Number(supplier.uploadMaxFilesPerApplication),
    maxMegabytes: bytes == null ? null : megabytesOfBytes(bytes),
    uploadLimitProvenance: str("uploadLimitProvenance"),
    uploadClassId: named("supplierUploadClassId"),
    statementClassId: named("supplierBankStatementClassId"),
    uploadClassProvenance: str("uploadClassProvenance"),
    onlineDeclarationReplacesPaper: (supplier.onlineDeclarationReplacesPaper as boolean | null | undefined) ?? null,
    onlineDeclarationProvenance: str("onlineDeclarationProvenance"),
  };
  return registrationSettingErrors(input, { classes }).map((e) => `Supplier register: ${e.message}`);
}

/// The faults of the values as they would stand after the run, judged by the product's own validators.
function valueFaults(writes: PackWrite[], rows: PackSnapshot["rows"], before: PackSnapshot["rows"], literal: NonNullable<PackSnapshot["classes"]>): string[] {
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

  // The register's and the invitation controls' rules on the row as it would stand, less what was already wrong with it before the run.
  const fresh = (judge: (row: Record<string, unknown>) => string[], model: string) => {
    const after = rows[model];
    if (!after || !writes.some((w) => w.kind === "GROUP" && w.model === model)) return [];
    const was = new Set(before[model] ? judge(before[model]!) : []);
    return judge(after).filter((f) => !was.has(f));
  };
  out.push(...fresh(windowFaults, "WindowPolicy"));
  const classes = writes.filter((w): w is Extract<PackWrite, { kind: "ROW" }> => w.kind === "ROW" && w.model === "DocumentClass").map((w) => ({ id: `DocumentClass:${w.code}`, classification: (w.values.classification as string | null) ?? null }));
  classes.push(...Object.entries(literal).map(([id, c]) => ({ id, classification: c.classification })));
  // A class named by literal id is a class of this organisation: another's is no class of ours, whatever its id (step 4.8 M4).
  for (const w of writes) {
    if (w.kind !== "GROUP") continue;
    for (const c of LITERAL_CLASS_COLUMNS) {
      const id = w.values[c];
      if (typeof id === "string" && literal[id]?.organisationId !== rows.Organisation?.id) out.push(`${w.label}: ${c} names a document class that is not this organisation's.`);
    }
    // As the setting's own save (WV-5): the class for returned award documents is SULIT.
    const ret = w.values.awardReturnClassId;
    if (typeof ret === "string" && literal[ret]?.organisationId === rows.Organisation?.id) {
      const f = awardReturnClassFault({ classification: literal[ret].classification as "SULIT" | null });
      if (f) out.push(`${w.label}: ${f}`);
    }
  }
  out.push(...fresh((row) => supplierFaults(row, classes), "SupplierPolicy"));
  const parts = writes.filter((w): w is Extract<PackWrite, { kind: "ROW" }> => w.kind === "ROW" && w.model === "TenderDocumentPart");
  const bases = writes.filter((w): w is Extract<PackWrite, { kind: "ROW" }> => w.kind === "ROW" && w.model === "ContractBasis").map((w) => w.code);
  const asPart = (w: Extract<PackWrite, { kind: "ROW" }>) => {
    const v = w.values as Partial<ConfiguredPart>;
    return { ...(v as ConfiguredPart), id: w.code, contractBasisCode: v.contractBasisCode ?? null, ownerOrgUnitCode: v.ownerOrgUnitCode ?? null, templateCode: v.templateCode ?? null, retiredOn: null };
  };
  for (const w of parts) {
    const others = parts.filter((o) => o !== w).map(asPart);
    for (const f of partConfigFaults(asPart(w), { others, bases, templates: [], units: [], today: "0000-00-00" })) out.push(`${w.listLabel} · ${w.label}: ${PART_CONFIG_FAULT_TEXT[f.code]}`);
  }
  for (const w of writes) {
    if (w.kind === "ROW" && w.model === "NotApprovedOutcome" && w.values.kind === "LOOP" && !isLoopKey(w.values.returnsToStage as string | null)) out.push(`${w.listLabel} · ${w.label}: a loop returns to one of the evaluation's stages.`);
    if (w.kind === "ROW" && w.model === "SupplierListValue") {
      const v = w.values as { code: string; nameEn: string; provenance: string; callingCode?: string | null; list: string };
      for (const f of listValueFaults(v, { codeTaken: false, kindListed: true, list: v.list })) out.push(`${w.listLabel} · ${w.code}: ${f.code}`);
    }
    if (w.kind !== "ROW" || w.model !== "NumberingSeries") continue;
    for (const f of patternFaults({ pattern: String(w.values.pattern ?? ""), resetOn: (w.values.resetOn as NumberingReset | undefined) ?? "CALENDAR_YEAR" })) out.push(`${w.listLabel} · ${w.code}: ${f.kind}`);
  }
  return out;
}

/// A row a group names by id (the development fill's demo rows) must be there and this organisation's: never created, never another's.
function namedRowFaults(packs: readonly StarterPack[], rows: PackSnapshot["rows"]): string[] {
  const ours = (g: PackGroup) => rows[groupKey(g)] != null && rows[groupKey(g)]!.organisationId === rows.Organisation?.id;
  return packs.flatMap((p) => p.groups.filter((g) => g.rowId && !ours(g)).map((g) => `${p.name} · ${g.label}: there is no such ${g.model} row of this organisation.`));
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
        writes.push({ kind: "ROW", pack: pack.name, actor, model: list.model, listLabel: list.label, code: r.code, label: r.label ?? String(r.values.nameEn ?? r.values.name ?? r.values.labelEn ?? r.code), values, source: r.source, requirement: r.requirement, provenance: (values.provenance as PackProvenance | undefined) ?? pack.provenance });
        written.add(`${list.model}:${r.code}`);
      }
      sizes[key] = list.rows.length;
    }
    for (const g of pack.groups) {
      const key = groupKey(g);
      const row = rows[key] ?? null;
      // A row named by id that is missing or another organisation's gets no write; `namedRowFaults` refuses the run.
      if (g.rowId && (!row || row.organisationId !== rows.Organisation?.id)) continue;
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
      writes.push({ kind: "GROUP", pack: pack.name, actor, model: g.model, label: g.label, create: !row, ...(g.rowId ? { rowId: g.rowId } : {}), values, before, provenanceColumn: g.provenanceColumn, sourceColumn: g.sourceColumn, source: g.source, requirement: g.requirement, provenance: pack.provenance });
      rows[key] = { ...(row ?? {}), ...values };
    }
    planDrafts(pack, actor, skip);
  }

  // Drafts (ADR 0043 D2): never one beside a matrix or a model the organisation already has, and never naming an office or a committee this
  // run did not write. Judged by the checks issuing makes, so a draft the run loads can be put in force once a person has reviewed it.
  function planDrafts(pack: StarterPack, actor: string, skip: (target: string, reason: PackSkip["reason"]) => void) {
    const has = { matrices: snap.drafts?.matrices ?? 0, evaluationModels: snap.drafts?.evaluationModels ?? 0 };
    for (const w of writes) if (w.kind === "DRAFT_MATRIX") has.matrices++;
    else if (w.kind === "DRAFT_MODEL") has.evaluationModels++;
    const base = { pack: pack.name, actor, provenance: pack.provenance };
    const named = (codes: (string | null | undefined)[], model: string, where: string) => {
      let missing = false;
      for (const c of new Set(codes.filter((x): x is string => !!x))) {
        if (!defined.has(`${model}:${c}`)) faults.push(`${where}: ${c} names no ${model} row of any pack in this run.`);
        if (!written.has(`${model}:${c}`)) missing = true;
      }
      return missing;
    };
    for (const m of pack.drafts?.matrices ?? []) {
      if (has.matrices > 0) {
        skip(m.label, "DRAFT_EXISTS");
        continue;
      }
      const offices = [...m.rules.flatMap((r) => [r.proposerCode, r.approverCode, r.committeeCode, ...r.recommenders.map((x) => x.roleCode)]), ...m.coreRouting.flatMap((l) => [l.approverCode, ...l.steps.map((x) => x.roleCode)])];
      if (named(offices, "AuthorityRole", `${pack.name} · ${m.label}`)) {
        skip(m.label, "REFERENCE_SKIPPED");
        continue;
      }
      const roles: Record<string, Role> = Object.fromEntries(
        writes.filter((w): w is Extract<PackWrite, { kind: "ROW" }> => w.kind === "ROW" && w.model === "AuthorityRole").map((w) => [w.code, w.values as unknown as Role]),
      );
      for (const l of m.coreRouting) for (const f of coreLevelFaults(l, roles)) faults.push(`${pack.name} · ${m.label} · core routing of ${l.approverCode}: ${f.fault} (${f.roleCode})`);
      for (const f of coreChainFaultsAcross(m.rules, m.coreRouting, roles)) faults.push(`${pack.name} · ${m.label} · ${f.rule.labelEn}: ${f.fault}${f.roleCode ? ` (${f.roleCode})` : ""}`);
      for (const f of boundaryFaultsAcross(m.rules, m.policy)) faults.push(`${pack.name} · ${m.label} · ${f.rule.labelEn}: ${f.fault}`);
      writes.push({ ...base, kind: "DRAFT_MATRIX", model: "AuthorityMatrix", label: m.label, draft: m, values: { effectiveFrom: LOAD_DAY }, source: m.source, requirement: m.requirement });
      has.matrices++;
    }
    // The models are one set, as a list is: none loads beside a model the organisation (or an earlier pack) already has.
    const modelsExist = has.evaluationModels > 0;
    for (const d of pack.drafts?.evaluationModels ?? []) {
      if (modelsExist) {
        skip(d.content.nameEn, "DRAFT_EXISTS");
        continue;
      }
      const where = `${pack.name} · ${d.content.nameEn}`;
      if (named(d.content.stages.map((s) => s.committeeCode), "Committee", where) || named(d.content.stages.map((s) => s.shortlistOfficeCode), "AuthorityRole", where)) {
        skip(d.content.nameEn, "REFERENCE_SKIPPED");
        continue;
      }
      writes.push({ ...base, kind: "DRAFT_MODEL", model: "EvaluationModel", label: d.content.nameEn, draft: d, values: {}, source: d.source, requirement: d.requirement });
    }
  }

  // A dated row takes the organisation's day, in the time zone it will have once this run is done.
  const today = todayIn(snap.now, (rows.Organisation?.timeZone as string | null | undefined) ?? null);
  for (const w of writes) {
    if (w.kind === "SWITCH_OFF") continue;
    for (const [c, v] of Object.entries(w.values)) {
      if (!isLoadDay(v)) continue;
      if (today == null) faults.push(`${w.kind === "ROW" ? w.listLabel : w.label}: a dated value needs the organisation's time zone.`);
      else (w.values as Record<string, unknown>)[c] = dayToDate(today);
    }
  }
  if (faults.length === 0) faults.push(...namedRowFaults(packs, snap.rows), ...valueFaults(writes, rows, snap.rows, snap.classes ?? {}));
  return faults.length > 0 ? { writes: [], skips, faults } : { writes, skips, faults };
}
