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

/// A code may be reused once the entry holding it is retired, so only entries still
/// in force count as taken.
function takenCodes(rows: { code: string; retiredOn: Date | null }[], except?: string): string[] {
  return rows
    .filter((r) => r.retiredOn == null && r.code !== except)
    .map((r) => r.code);
}

// ---------------------------------------------------------------- funding routes

function readFundingRoute(data: FormData, taken: string[], editing: boolean) {
  const r = new FormReader(data);
  const code = editing ? String(data.get("code") ?? "") : r.code("code", "Code", { taken });
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

  const parsed = readFundingRoute(data, takenCodes(existing, current?.code), Boolean(id));
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

function readSourcingMethod(data: FormData, taken: string[], editing: boolean) {
  const r = new FormReader(data);
  const code = editing ? String(data.get("code") ?? "") : r.code("code", "Code", { taken });
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

  const parsed = readSourcingMethod(data, takenCodes(existing, current?.code), Boolean(id));
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

  const r = new FormReader(data);
  const v = {
    code: id ? String(data.get("code") ?? "") : r.code("code", "Code", { taken: takenCodes(existing, current?.code) }),
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
export async function retireEntry(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;

  const entity = String(data.get("entity") ?? "");
  const id = String(data.get("id") ?? "");
  const reason = String(data.get("reason") ?? "").trim();
  if (!reason) return { ok: false, errors: { reason: "A reason is required." } };

  const table =
    entity === "FundingRoute"
      ? db.fundingRoute
      : entity === "SourcingMethod"
        ? db.sourcingMethod
        : entity === "ContractType"
          ? db.contractType
          : null;
  if (!table) return { ok: false, message: "Unknown record type." };

  const before = await (table as typeof db.contractType).findUnique({ where: { id } });
  if (!before) return { ok: false, message: "That record no longer exists." };

  const retiredOn = new Date();
  await auditedUpdate(
    { organisationId: orgId, entity, entityId: id, entityLabel: before.nameEn, reason },
    { retiredOn: before.retiredOn },
    { retiredOn },
    (tx) =>
      (
        tx[
          entity === "FundingRoute"
            ? "fundingRoute"
            : entity === "SourcingMethod"
              ? "sourcingMethod"
              : "contractType"
        ] as typeof db.contractType
      ).update({ where: { id }, data: { retiredOn } }),
  );

  revalidatePath(PATH);
  return { ok: true };
}
