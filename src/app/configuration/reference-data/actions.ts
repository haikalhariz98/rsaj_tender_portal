"use server";

import { revalidatePath } from "next/cache";

import { auditedCreate, auditedUpdate } from "@/lib/audit/record";
import { db } from "@/lib/db";
import { ORGANISATION_CODE } from "@/lib/org";
import type { FormState } from "@/components/record-editor";
import { FormReader } from "@/lib/validate";
import { writeAudit } from "@/lib/audit/record";
import { diffFields, snapshotFields } from "@/lib/audit/diff";
import { DELIVERABLE_KINDS } from "@/lib/method/types";

const PROVENANCE = ["STATED", "OBSERVED", "ASSUMED"] as const;
const PATH = "/configuration/reference-data";

async function organisationId(): Promise<string | null> {
  const org = await db.organisation.findUnique({
    where: { code: ORGANISATION_CODE },
    select: { id: true },
  });
  return org?.id ?? null;
}

const NO_ORG: FormState = {
  ok: false,
  message: "No organisation is configured. Run npm run setup before adding records.",
};

/// Every code ever issued counts as taken, retired or not. The tables hold one row per
/// code, so a retired entry still owns its code — offering it again would pass here
/// and then fail at the database. A retired entry comes back by being restored.
function takenCodes(rows: { code: string }[]): string[] {
  return rows.map((r) => r.code);
}

// ---------------------------------------------------------------- funding routes

/// `storedCode` is the code of the entry being edited. A code is set once and the edit
/// drawer does not offer it, so an edit keeps the stored one.
function readFundingRoute(data: FormData, taken: string[], storedCode: string | undefined) {
  const r = new FormReader(data);
  const code = storedCode ?? r.code("code", "Code", { taken });
  const value = {
    code,
    nameEn: r.text("nameEn", "Name", { required: true, max: 120 }),
    nameMs: r.optionalText("nameMs"),
    organisationProcures: r.bool("organisationProcures"),
    routeDecidedExternally: r.bool("routeDecidedExternally"),
    supersedesAuthority: r.bool("supersedesAuthority"),
    requiresExternalAuthorityRef: r.bool("requiresExternalAuthorityRef"),
    externalAuthorityRefLabel: r.optionalText("externalAuthorityRefLabel"),
    approvalCommitsBudget: (() => {
      const c = r.choice("approvalCommitsBudget", "Approval commits the organisation's budget", ["yes", "no"] as const);
      return c == null ? null : c === "yes";
    })(),
    approvalCommitsBudgetProvenance: r.choice("approvalCommitsBudgetProvenance", "Where that comes from", PROVENANCE),
    trigger: r.text("trigger", "Triggered by", { max: 240 }),
    governingSource: r.text("governingSource", "Source", { max: 240 }),
    provenance: r.choice("provenance", "Provenance", PROVENANCE, { required: true }),
    notes: r.text("notes", "Notes", { max: 2000 }),
    sortOrder: r.int("sortOrder", "Order", { min: 0 }) ?? 0,
  };
  // A decided setting says where it came from, as every policy value does.
  if (value.approvalCommitsBudget != null && !value.approvalCommitsBudgetProvenance) {
    r.reject("approvalCommitsBudgetProvenance", "Say where this comes from.");
  }
  // A matter held for an external authority must be told what it is waiting for.
  if (value.requiresExternalAuthorityRef && !value.externalAuthorityRefLabel) {
    r.reject("externalAuthorityRefLabel", "Name the authority a matter on this route waits for, as it is shown on the requisition.");
  }
  // A route the organisation does not run cannot also be one whose route it chooses.
  if (!value.organisationProcures && value.routeDecidedExternally) {
    r.reject(
      "routeDecidedExternally",
      "A route the organisation does not procure under cannot also have its route set externally. Choose one.",
    );
  }
  return r.finish(value);
}

export async function saveFundingRoute(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;

  const id = String(data.get("id") ?? "");
  const existing = await db.fundingRoute.findMany({
    where: { organisationId: orgId },
    select: { id: true, code: true, retiredOn: true },
  });
  const current = id ? existing.find((e) => e.id === id) : undefined;
  if (id && !current) return { ok: false, message: "That funding route no longer exists." };

  const parsed = readFundingRoute(data, takenCodes(existing), current?.code);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };
  const v = parsed.value;

  const ctx = {
    organisationId: orgId,
    entity: "FundingRoute",
    entityLabel: v.nameEn,
    reason: String(data.get("reason") ?? ""),
  };

  if (!id) {
    await auditedCreate(ctx, v, (tx) =>
      tx.fundingRoute.create({ data: { organisationId: orgId, ...v, provenance: v.provenance! } }),
    );
  } else {
    const before = await db.fundingRoute.findUnique({ where: { id } });
    if (!before) return { ok: false, message: "That funding route no longer exists." };
    await auditedUpdate({ ...ctx, entityId: id }, before, v, (tx) =>
      tx.fundingRoute.update({ where: { id }, data: { ...v, provenance: v.provenance! } }),
    );
  }

  revalidatePath(PATH);
  return { ok: true };
}

// -------------------------------------------------------------- sourcing methods

/// `storedCode` is the code of the entry being edited. A code is set once and the edit
/// drawer does not offer it, so an edit keeps the stored one.
function readSourcingMethod(data: FormData, taken: string[], storedCode: string | undefined) {
  const r = new FormReader(data);
  const code = storedCode ?? r.code("code", "Code", { taken });
  const value = {
    code,
    nameEn: r.text("nameEn", "Name", { required: true, max: 120 }),
    nameMs: r.optionalText("nameMs"),
    availableInTender: r.bool("availableInTender"),
    availableInQuotation: r.bool("availableInQuotation"),
    availableBelow: r.bool("availableBelow"),
    requiresAdvertisement: r.bool("requiresAdvertisement"),
    invitesNamedSuppliers: r.bool("invitesNamedSuppliers"),
    requiresFreshSourcing: r.bool("requiresFreshSourcing"),
    awardInstrument: r.text("awardInstrument", "Award instrument", { max: 120 }),
    committeeCode: r.optionalText("committeeCode"),
    authorityMethodKey: r.optionalText("authorityMethodKey"),
    // What the method asks of an exercise (6.3).
    defaultInTender: r.bool("defaultInTender"),
    defaultInQuotation: r.bool("defaultInQuotation"),
    defaultBelow: r.bool("defaultBelow"),
    requiresJustification: r.bool("requiresJustification"),
    justificationPrompt: r.text("justificationPrompt", "What the justification must show", { max: 1000 }),
    requiresProposal: r.bool("requiresProposal"),
    requiresNameApproval: r.bool("requiresNameApproval"),
    restrictedAccess: r.bool("restrictedAccess"),
    requiresDossier: r.bool("requiresDossier"),
    requiresCoordinationRecord: r.bool("requiresCoordinationRecord"),
    dossierSeriesKey: r.optionalText("dossierSeriesKey"),
    governingSource: r.text("governingSource", "Source", { max: 240 }),
    provenance: r.choice("provenance", "Provenance", PROVENANCE, { required: true }),
    notes: r.text("notes", "Notes", { max: 2000 }),
    sortOrder: r.int("sortOrder", "Order", { min: 0 }) ?? 0,
  };
  // Banded for no regime means nothing will ever offer it. Refused at entry rather
  // than saved and flagged later.
  if (!value.availableInTender && !value.availableInQuotation && !value.availableBelow) {
    r.reject("availableInTender", "Choose at least one value band, or the method can never be used.");
  }
  // A method proposed in a band it cannot be used in would propose nothing usable.
  for (const [d, a, band] of [
    ["defaultInTender", "availableInTender", "tender"],
    ["defaultInQuotation", "availableInQuotation", "quotation"],
    ["defaultBelow", "availableBelow", "below the quotation floor"],
  ] as const) {
    if (value[d] && !value[a]) r.reject(d, `A method can be proposed ${band === "tender" || band === "quotation" ? `in the ${band} band` : band} only where it is available there.`);
  }
  if (value.requiresDossier && !value.dossierSeriesKey) r.reject("dossierSeriesKey", "A method that keeps a justification dossier needs the numbering series its references are issued from.");
  if (value.requiresProposal && !value.requiresNameApproval) r.reject("requiresNameApproval", "A proposal is reviewed on its way to approval of the name. Tick that the method needs the name approved, or untick the proposal.");
  return r.finish(value);
}

export async function saveSourcingMethod(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;

  const id = String(data.get("id") ?? "");
  const existing = await db.sourcingMethod.findMany({
    where: { organisationId: orgId },
    select: { id: true, code: true, retiredOn: true },
  });
  const current = id ? existing.find((e) => e.id === id) : undefined;
  if (id && !current) return { ok: false, message: "That sourcing method no longer exists." };

  const parsed = readSourcingMethod(data, takenCodes(existing), current?.code);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };
  const v = parsed.value;

  // One method proposed per band, or the regime proposes nothing (6.3 ruling R-12).
  const others = await db.sourcingMethod.findMany({ where: { organisationId: orgId, retiredOn: null, ...(id ? { NOT: { id } } : {}) } });
  for (const [flag, band] of [["defaultInTender", "tender"], ["defaultInQuotation", "quotation"], ["defaultBelow", "below-quotation"]] as const) {
    const clash = v[flag] ? others.find((o) => o[flag]) : null;
    if (clash) return { ok: false, errors: { [flag]: `${clash.nameEn} is already the method proposed in the ${band} band. Untick it there first.` } };
  }
  if (v.dossierSeriesKey) {
    const series = await db.numberingSeries.findFirst({ where: { organisationId: orgId, key: v.dossierSeriesKey }, select: { id: true } });
    if (!series) return { ok: false, errors: { dossierSeriesKey: "No numbering series has that key. Add it under Configuration, Numbering first." } };
  }

  const ctx = {
    organisationId: orgId,
    entity: "SourcingMethod",
    entityLabel: v.nameEn,
    reason: String(data.get("reason") ?? ""),
  };

  if (!id) {
    await auditedCreate(ctx, v, (tx) =>
      tx.sourcingMethod.create({ data: { organisationId: orgId, ...v, provenance: v.provenance! } }),
    );
  } else {
    const before = await db.sourcingMethod.findUnique({ where: { id } });
    if (!before) return { ok: false, message: "That sourcing method no longer exists." };
    await auditedUpdate({ ...ctx, entityId: id }, before, v, (tx) =>
      tx.sourcingMethod.update({ where: { id }, data: { ...v, provenance: v.provenance! } }),
    );
  }

  revalidatePath(PATH);
  return { ok: true };
}

// ---------------------------------------------------------------- contract types

export async function saveContractType(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;

  const id = String(data.get("id") ?? "");
  const existing = await db.contractType.findMany({
    where: { organisationId: orgId },
    select: { id: true, code: true, retiredOn: true },
  });
  const current = id ? existing.find((e) => e.id === id) : undefined;
  if (id && !current) return { ok: false, message: "That contract type no longer exists." };

  const r = new FormReader(data);
  const v = {
    // Set once; the edit drawer does not offer it, so an edit keeps the stored code.
    code: current ? current.code : r.code("code", "Code", { taken: takenCodes(existing) }),
    nameEn: r.text("nameEn", "Name", { required: true, max: 120 }),
    nameMs: r.optionalText("nameMs"),
    deliverableKind: r.choice("deliverableKind", "Default for", DELIVERABLE_KINDS),
    governingSource: r.text("governingSource", "Source", { max: 240 }),
    provenance: r.choice("provenance", "Provenance", PROVENANCE, { required: true }),
    notes: r.text("notes", "Notes", { max: 2000 }),
    sortOrder: r.int("sortOrder", "Order", { min: 0 }) ?? 0,
  };
  // One type in force per deliverable, or the deliverable test derives nothing.
  if (v.deliverableKind) {
    const clash = await db.contractType.findFirst({ where: { organisationId: orgId, deliverableKind: v.deliverableKind, retiredOn: null, ...(id ? { NOT: { id } } : {}) }, select: { nameEn: true } });
    if (clash) r.reject("deliverableKind", `${clash.nameEn} is already the default for this deliverable.`);
  }
  const parsed = r.finish(v);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  const ctx = {
    organisationId: orgId,
    entity: "ContractType",
    entityLabel: v.nameEn,
    reason: String(data.get("reason") ?? ""),
  };

  if (!id) {
    await auditedCreate(ctx, v, (tx) =>
      tx.contractType.create({ data: { organisationId: orgId, ...v, provenance: v.provenance! } }),
    );
  } else {
    const before = await db.contractType.findUnique({ where: { id } });
    if (!before) return { ok: false, message: "That contract type no longer exists." };
    await auditedUpdate({ ...ctx, entityId: id }, before, v, (tx) =>
      tx.contractType.update({ where: { id }, data: { ...v, provenance: v.provenance! } }),
    );
  }

  revalidatePath(PATH);
  return { ok: true };
}

// ------------------------------------------------------------ retire and restore

/**
 * Retiring is the delete.
 *
 * A matter already routed under an entry must keep rendering the entry it was run
 * under, so the row stays and stops being offered. A reason is required, because the
 * change is otherwise unattributable to anyone or anything.
 */
const TABLES = {
  FundingRoute: "fundingRoute",
  SourcingMethod: "sourcingMethod",
  ContractType: "contractType",
  JustificationReason: "justificationReason",
  ContractBasis: "contractBasis",
  ClassificationTaxonomy: "classificationTaxonomy",
} as const;

/// Retire or restore. The same three lists, the same shape, the opposite act.
async function setRetired(data: FormData, retire: boolean): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;

  const entity = String(data.get("entity") ?? "");
  const id = String(data.get("id") ?? "");
  const reason = String(data.get("reason") ?? "").trim();
  if (!reason) return { ok: false, errors: { reason: "A reason is required." } };

  const key = TABLES[entity as keyof typeof TABLES];
  if (!key) return { ok: false, message: "Unknown record type." };
  const table = db[key] as unknown as typeof db.contractType;

  const before = await table.findFirst({ where: { id, organisationId: orgId } });
  if (!before) return { ok: false, message: "That record no longer exists." };
  // Retiring twice would overwrite the date it first stopped being offered.
  if (retire && before.retiredOn) return { ok: false, message: "That entry is already retired." };
  if (!retire && !before.retiredOn) return { ok: false, message: "That entry is not retired." };

  const retiredOn = retire ? new Date() : null;
  await auditedUpdate(
    { organisationId: orgId, entity, entityId: id, entityLabel: before.nameEn, reason },
    { retiredOn: before.retiredOn },
    { retiredOn },
    (tx) => (tx[key] as unknown as typeof db.contractType).update({ where: { id }, data: { retiredOn } }),
  );

  revalidatePath(PATH);
  return { ok: true };
}

export async function retireEntry(_prev: FormState, data: FormData): Promise<FormState> {
  return setRetired(data, true);
}

/// Put a retired entry back on offer. It keeps its code, which is still its own.
export async function restoreEntry(_prev: FormState, data: FormData): Promise<FormState> {
  return setRetired(data, false);
}

// ---------------------------------------------------------- 6.3 classification

const tri = (r: FormReader, name: string, label: string) => {
  const c = r.choice(name, label, ["yes", "no"] as const);
  return c == null ? null : c === "yes";
};
const list = (raw: string) => raw.split(/[\n,]/).map((x) => x.trim()).filter(Boolean);

/**
 * The twelve behaviours of a contract type (FR-MTD-012). Each may be left unset, which
 * the screens say rather than reading it as "no".
 */
export async function saveContractBehaviours(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;
  const id = String(data.get("id") ?? "");
  const before = await db.contractType.findFirst({ where: { id, organisationId: orgId } });
  if (!before) return { ok: false, message: "That contract type no longer exists." };
  const r = new FormReader(data);
  const v = {
    pricingBasis: r.optionalText("pricingBasis"),
    registrationTest: r.optionalText("registrationTest"),
    administratorRoleCodes: list(String(data.get("administratorRoleCodes") ?? "")),
    startRequiresSecurities: tri(r, "startRequiresSecurities", "Start of work"),
    eotInstrument: r.optionalText("eotInstrument"),
    completionInstrument: r.optionalText("completionInstrument"),
    defectsLiabilityApplies: tri(r, "defectsLiabilityApplies", "Defects liability"),
    makingGoodCertificate: tri(r, "makingGoodCertificate", "Making good"),
    nominationAllowed: tri(r, "nominationAllowed", "Nomination"),
    interimPaymentRule: r.optionalText("interimPaymentRule"),
    sumAdjustmentDrivers: list(String(data.get("sumAdjustmentDrivers") ?? "")),
    claimsApprovalCommitteeCode: r.optionalText("claimsApprovalCommitteeCode"),
  };
  const known = new Set((await db.authorityRole.findMany({ where: { organisationId: orgId }, select: { code: true } })).map((x) => x.code));
  const unknown = v.administratorRoleCodes.filter((c) => !known.has(c));
  if (unknown.length) r.reject("administratorRoleCodes", "Choose offices that are configured under Users & roles.");
  if (v.claimsApprovalCommitteeCode && !known.has(v.claimsApprovalCommitteeCode)) r.reject("claimsApprovalCommitteeCode", "Choose a body configured under Users & roles.");
  if (r.failed) return { ok: false, errors: r.errors };
  await auditedUpdate({ organisationId: orgId, entity: "ContractType", entityId: id, entityLabel: before.nameEn, reason: String(data.get("reason") ?? "") }, before, v, (tx) =>
    tx.contractType.update({ where: { id }, data: v }),
  );
  revalidatePath(PATH);
  return { ok: true };
}

/// A method's proposal item (FR-MTD-006), in the customer's words.
export async function saveChecklistItem(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;
  const id = String(data.get("id") ?? "");
  const methodId = String(data.get("sourcingMethodId") ?? "");
  const method = await db.sourcingMethod.findFirst({ where: { id: methodId, organisationId: orgId }, include: { checklistItems: true } });
  if (!method) return { ok: false, message: "That sourcing method no longer exists." };
  const before = id ? method.checklistItems.find((i) => i.id === id) : undefined;
  if (id && !before) return { ok: false, message: "That item no longer exists." };
  const r = new FormReader(data);
  const v = {
    key: before ? before.key : r.code("key", "Key", { taken: method.checklistItems.map((i) => i.key) }),
    labelEn: r.text("labelEn", "Item", { required: true, max: 400 }),
    labelMs: r.optionalText("labelMs"),
    required: r.bool("required"),
    sortOrder: r.int("sortOrder", "Order", { min: 0 }) ?? 0,
  };
  if (r.failed) return { ok: false, errors: r.errors };
  const ctx = { organisationId: orgId, entity: "MethodChecklistItem", entityLabel: `${method.nameEn} — ${v.labelEn}`, reason: String(data.get("reason") ?? "") };
  if (!before) await auditedCreate(ctx, v, (tx) => tx.methodChecklistItem.create({ data: { sourcingMethodId: method.id, ...v } }));
  else await auditedUpdate({ ...ctx, entityId: before.id }, before, v, (tx) => tx.methodChecklistItem.update({ where: { id: before.id }, data: v }));
  revalidatePath(PATH);
  return { ok: true };
}

export async function retireChecklistItem(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;
  const id = String(data.get("id") ?? "");
  const reason = String(data.get("reason") ?? "").trim();
  if (!reason) return { ok: false, errors: { reason: "A reason is required." } };
  const item = await db.methodChecklistItem.findFirst({ where: { id, sourcingMethod: { organisationId: orgId } }, include: { sourcingMethod: { select: { nameEn: true } } } });
  if (!item) return { ok: false, message: "That item no longer exists." };
  if (item.retiredOn) return { ok: false, message: "That item is already retired." };
  const retiredOn = new Date();
  await auditedUpdate({ organisationId: orgId, entity: "MethodChecklistItem", entityId: id, entityLabel: `${item.sourcingMethod.nameEn} — ${item.labelEn}`, reason }, { retiredOn: null }, { retiredOn }, (tx) =>
    tx.methodChecklistItem.update({ where: { id }, data: { retiredOn } }),
  );
  revalidatePath(PATH);
  return { ok: true };
}

/// A reason a direct appointment may be justified by (FR-MTD-009).
export async function saveJustificationReason(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;
  const id = String(data.get("id") ?? "");
  const existing = await db.justificationReason.findMany({ where: { organisationId: orgId } });
  const before = id ? existing.find((e) => e.id === id) : undefined;
  if (id && !before) return { ok: false, message: "That reason no longer exists." };
  const r = new FormReader(data);
  const v = {
    code: before ? before.code : r.code("code", "Code", { taken: takenCodes(existing) }),
    nameEn: r.text("nameEn", "Reason", { required: true, max: 240 }),
    nameMs: r.optionalText("nameMs"),
    sourcingMethodCode: r.optionalText("sourcingMethodCode"),
    governingSource: r.text("governingSource", "Source", { max: 240 }),
    provenance: r.choice("provenance", "Provenance", PROVENANCE, { required: true }),
    sortOrder: r.int("sortOrder", "Order", { min: 0 }) ?? 0,
  };
  if (v.sourcingMethodCode && !(await db.sourcingMethod.findFirst({ where: { organisationId: orgId, code: v.sourcingMethodCode } }))) r.reject("sourcingMethodCode", "That method no longer exists.");
  if (r.failed) return { ok: false, errors: r.errors };
  const ctx = { organisationId: orgId, entity: "JustificationReason", entityLabel: v.nameEn, reason: String(data.get("reason") ?? "") };
  const row = { ...v, provenance: v.provenance! };
  if (!before) await auditedCreate(ctx, row, (tx) => tx.justificationReason.create({ data: { organisationId: orgId, ...row } }));
  else await auditedUpdate({ ...ctx, entityId: before.id }, before, row, (tx) => tx.justificationReason.update({ where: { id: before.id }, data: row }));
  revalidatePath(PATH);
  return { ok: true };
}

/// A contract basis (FR-MTD-013). Always chosen by the officer (6.3 ruling R-9).
export async function saveContractBasis(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;
  const id = String(data.get("id") ?? "");
  const existing = await db.contractBasis.findMany({ where: { organisationId: orgId } });
  const before = id ? existing.find((e) => e.id === id) : undefined;
  if (id && !before) return { ok: false, message: "That basis no longer exists." };
  const r = new FormReader(data);
  const v = {
    code: before ? before.code : r.code("code", "Code", { taken: takenCodes(existing) }),
    nameEn: r.text("nameEn", "Name", { required: true, max: 120 }),
    nameMs: r.optionalText("nameMs"),
    standardFormLabel: r.optionalText("standardFormLabel"),
    governingSource: r.text("governingSource", "Source", { max: 240 }),
    provenance: r.choice("provenance", "Provenance", PROVENANCE, { required: true }),
    notes: r.text("notes", "Notes", { max: 2000 }),
    sortOrder: r.int("sortOrder", "Order", { min: 0 }) ?? 0,
  };
  if (r.failed) return { ok: false, errors: r.errors };
  const ctx = { organisationId: orgId, entity: "ContractBasis", entityLabel: v.nameEn, reason: String(data.get("reason") ?? "") };
  const row = { ...v, provenance: v.provenance! };
  if (!before) await auditedCreate(ctx, row, (tx) => tx.contractBasis.create({ data: { organisationId: orgId, ...row } }));
  else await auditedUpdate({ ...ctx, entityId: before.id }, before, row, (tx) => tx.contractBasis.update({ where: { id: before.id }, data: row }));
  revalidatePath(PATH);
  return { ok: true };
}

/// Another classification a contract carries (FR-MTD-014), with its values.
export async function saveTaxonomy(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;
  const id = String(data.get("id") ?? "");
  const existing = await db.classificationTaxonomy.findMany({ where: { organisationId: orgId } });
  const before = id ? existing.find((e) => e.id === id) : undefined;
  if (id && !before) return { ok: false, message: "That classification no longer exists." };
  const r = new FormReader(data);
  const v = {
    code: before ? before.code : r.code("code", "Code", { taken: takenCodes(existing) }),
    nameEn: r.text("nameEn", "Name", { required: true, max: 120 }),
    nameMs: r.optionalText("nameMs"),
    governingSource: r.text("governingSource", "Source", { max: 240 }),
    provenance: r.choice("provenance", "Provenance", PROVENANCE, { required: true }),
    sortOrder: r.int("sortOrder", "Order", { min: 0 }) ?? 0,
  };
  if (r.failed) return { ok: false, errors: r.errors };
  const ctx = { organisationId: orgId, entity: "ClassificationTaxonomy", entityLabel: v.nameEn, reason: String(data.get("reason") ?? "") };
  const row = { ...v, provenance: v.provenance! };
  if (!before) await auditedCreate(ctx, row, (tx) => tx.classificationTaxonomy.create({ data: { organisationId: orgId, ...row } }));
  else await auditedUpdate({ ...ctx, entityId: before.id }, before, row, (tx) => tx.classificationTaxonomy.update({ where: { id: before.id }, data: row }));
  revalidatePath(PATH);
  return { ok: true };
}

export async function saveTaxonomyValue(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;
  const taxonomyId = String(data.get("taxonomyId") ?? "");
  const id = String(data.get("id") ?? "");
  const tax = await db.classificationTaxonomy.findFirst({ where: { id: taxonomyId, organisationId: orgId }, include: { values: true } });
  if (!tax) return { ok: false, message: "That classification no longer exists." };
  const before = id ? tax.values.find((x) => x.id === id) : undefined;
  if (id && !before) return { ok: false, message: "That value no longer exists." };
  const r = new FormReader(data);
  const v = {
    code: before ? before.code : r.code("code", "Code", { taken: takenCodes(tax.values) }),
    nameEn: r.text("nameEn", "Value", { required: true, max: 200 }),
    nameMs: r.optionalText("nameMs"),
    sortOrder: r.int("sortOrder", "Order", { min: 0 }) ?? 0,
    retiredOn: r.bool("retired") ? (before?.retiredOn ?? new Date()) : null,
  };
  if (r.failed) return { ok: false, errors: r.errors };
  const ctx = { organisationId: orgId, entity: "TaxonomyValue", entityLabel: `${tax.nameEn} — ${v.nameEn}`, reason: String(data.get("reason") ?? "") };
  if (!before) await auditedCreate(ctx, v, (tx) => tx.taxonomyValue.create({ data: { taxonomyId, ...v } }));
  else await auditedUpdate({ ...ctx, entityId: before.id }, before, v, (tx) => tx.taxonomyValue.update({ where: { id: before.id }, data: v }));
  revalidatePath(PATH);
  return { ok: true };
}

/// A contract type's value in a classification, optionally only when the basis or
/// another classification's value says so (FR-MTD-014).
export async function saveTaxonomyMapping(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;
  const r = new FormReader(data);
  const v = {
    contractTypeCode: r.text("contractTypeCode", "Contract type", { required: true }),
    taxonomyCode: r.text("taxonomyCode", "Classification", { required: true }),
    valueCode: r.text("valueCode", "Value", { required: true }),
    whenBasisCode: r.optionalText("whenBasisCode"),
    whenTaxonomyCode: r.optionalText("whenTaxonomyCode"),
    whenValueCode: r.optionalText("whenValueCode"),
    governingSource: r.text("governingSource", "Source", { max: 240 }),
    provenance: r.choice("provenance", "Provenance", PROVENANCE, { required: true }),
  };
  if (r.failed) return { ok: false, errors: r.errors };
  const [type, tax, basis] = await Promise.all([
    db.contractType.findFirst({ where: { organisationId: orgId, code: v.contractTypeCode } }),
    db.classificationTaxonomy.findFirst({ where: { organisationId: orgId, code: v.taxonomyCode }, include: { values: true } }),
    v.whenBasisCode ? db.contractBasis.findFirst({ where: { organisationId: orgId, code: v.whenBasisCode } }) : Promise.resolve(null),
  ]);
  if (!type) r.reject("contractTypeCode", "That contract type no longer exists.");
  if (!tax) r.reject("taxonomyCode", "That classification no longer exists.");
  else if (!tax.values.some((x) => x.code === v.valueCode)) r.reject("valueCode", "Choose a value of that classification.");
  if (v.whenBasisCode && !basis) r.reject("whenBasisCode", "That basis no longer exists.");
  if ((v.whenTaxonomyCode == null) !== (v.whenValueCode == null)) r.reject("whenValueCode", "A condition on another classification needs both the classification and its value.");
  if (v.whenTaxonomyCode === v.taxonomyCode) r.reject("whenTaxonomyCode", "A classification cannot be conditioned on itself.");
  if (r.failed) return { ok: false, errors: r.errors };
  const row = { ...v, provenance: v.provenance! };
  await auditedCreate({ organisationId: orgId, entity: "TaxonomyMapping", entityLabel: `${type!.nameEn} — ${tax!.nameEn}`, reason: String(data.get("reason") ?? "") }, row, (tx) =>
    tx.taxonomyMapping.create({ data: { organisationId: orgId, ...row } }),
  );
  revalidatePath(PATH);
  return { ok: true };
}

export async function removeTaxonomyMapping(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;
  const id = String(data.get("id") ?? "");
  const reason = String(data.get("reason") ?? "").trim();
  if (!reason) return { ok: false, errors: { reason: "A reason is required." } };
  const row = await db.taxonomyMapping.findFirst({ where: { id, organisationId: orgId } });
  if (!row) return { ok: false, message: "That mapping no longer exists." };
  await db.$transaction(async (tx) => {
    await tx.taxonomyMapping.delete({ where: { id } });
    await writeAudit(tx, { organisationId: orgId, entity: "TaxonomyMapping", entityId: id, entityLabel: `${row.contractTypeCode} — ${row.taxonomyCode}`, reason }, "DELETE", snapshotFields(row));
  });
  revalidatePath(PATH);
  return { ok: true };
}

/**
 * How mixed scope is classified (FR-MTD-011, ruling R-11). Unset is its own answer: no
 * default for mixed scope. A set threshold says where it comes from.
 */
export async function saveClassificationPolicy(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;
  const r = new FormReader(data);
  const raw = String(data.get("dominanceSharePct") ?? "").trim();
  let pct: string | null = null;
  if (raw) {
    if (!/^\d{1,3}(\.\d{1,4})?$/.test(raw) || Number(raw) < 50 || Number(raw) >= 100) r.reject("dominanceSharePct", "A share of at least 50 and below 100 percent, to at most four decimal places.");
    else pct = raw;
  }
  const provenance = r.choice("provenance", "Where this comes from", PROVENANCE);
  if (pct && !provenance) r.reject("provenance", "Say where this comes from.");
  const notes = r.text("notes", "Notes", { max: 2000 });
  if (r.failed) return { ok: false, errors: r.errors };
  const before = await db.classificationPolicy.findUnique({ where: { organisationId: orgId } });
  const v = { dominanceSharePct: pct, provenance: pct ? provenance : null, notes };
  await db.$transaction(async (tx) => {
    const row = await tx.classificationPolicy.upsert({ where: { organisationId: orgId }, create: { organisationId: orgId, ...v }, update: v });
    const changes = diffFields(before ? { ...before, dominanceSharePct: before.dominanceSharePct?.toString() ?? null } : null, v);
    if (!before || changes.length) await writeAudit(tx, { organisationId: orgId, entity: "ClassificationPolicy", entityId: row.id, entityLabel: "Mixed-scope classification", reason: String(data.get("reason") ?? "") }, before ? "UPDATE" : "CREATE", changes);
  });
  revalidatePath(PATH);
  return { ok: true };
}
