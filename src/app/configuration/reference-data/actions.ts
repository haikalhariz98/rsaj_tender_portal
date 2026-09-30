"use server";

import { revalidatePath } from "next/cache";

import { auditedCreate, auditedUpdate } from "@/lib/audit/record";
import { db } from "@/lib/db";
import { ORGANISATION_CODE } from "@/lib/org";
import type { FormState } from "@/components/record-editor";
import { FormReader } from "@/lib/validate";

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
    trigger: r.text("trigger", "Triggered by", { max: 240 }),
    governingSource: r.text("governingSource", "Source", { max: 240 }),
    provenance: r.choice("provenance", "Provenance", PROVENANCE, { required: true }),
    notes: r.text("notes", "Notes", { max: 2000 }),
    sortOrder: r.int("sortOrder", "Order", { min: 0 }) ?? 0,
  };
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
    governingSource: r.text("governingSource", "Source", { max: 240 }),
    provenance: r.choice("provenance", "Provenance", PROVENANCE, { required: true }),
    notes: r.text("notes", "Notes", { max: 2000 }),
    sortOrder: r.int("sortOrder", "Order", { min: 0 }) ?? 0,
  };
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
