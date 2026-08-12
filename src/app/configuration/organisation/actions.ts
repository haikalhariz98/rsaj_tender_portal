"use server";

import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import { auditedCreate, auditedUpdate } from "@/lib/audit/record";
import { db } from "@/lib/db";
import { ORGANISATION_CODE } from "@/lib/org";
import { checkPeriod, FormReader } from "@/lib/validate";

const PATH = "/configuration/organisation";

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

const KINDS = ["COMPANY", "DIVISION", "DEPARTMENT", "SECTION"] as const;
type Kind = (typeof KINDS)[number];

// --------------------------------------------------------------------- org units

/**
 * Save a unit.
 *
 * A company's form carries registration, tax, telephone, financial year, address and
 * licence; a department's carries none of them. Both write to the same nullable
 * columns, so reading those keys unconditionally would blank a company's details the
 * moment somebody edited a department — silently, because nothing on a nullable
 * column complains. Only what the form posted is written.
 */
export async function saveOrgUnit(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;

  const editingCode = String(data.get("id") ?? "");
  const r = new FormReader(data);

  const kindRaw = String(data.get("kind") ?? "");
  const kind = (KINDS as readonly string[]).includes(kindRaw) ? (kindRaw as Kind) : null;
  if (!kind) return { ok: false, errors: { kind: "Choose which tier this unit is." } };

  const existing = await db.orgUnit.findMany({
    where: { organisationId: orgId },
    select: { id: true, code: true, kind: true },
  });
  const current = editingCode ? existing.find((u) => u.code === editingCode) : undefined;
  if (editingCode && !current) return { ok: false, message: "That unit no longer exists." };

  const code = current
    ? current.code
    : r.code("code", "Code", { taken: existing.map((u) => u.code) });

  const parentCode = r.optionalText("parentCode");
  if (parentCode && parentCode === code) {
    r.reject("parentCode", "A unit cannot sit under itself.");
  }

  const common = {
    nameEn: r.text("nameEn", "Name (EN)", { required: true, max: 160 }),
    nameMs: r.optionalText("nameMs"),
    headPersonId: r.optionalText("headPersonId"),
  };

  // The company block, only where the form actually carried it.
  const companyOnly = data.has("registrationNumber")
    ? {
        registrationNumber: r.optionalText("registrationNumber"),
        taxReference: r.optionalText("taxReference"),
        telephone: r.optionalText("telephone"),
        financialYearStart: r.optionalText("financialYearStart"),
        address: r.optionalText("address") ?? "",
        operatingLicence: r.optionalText("operatingLicence"),
      }
    : {};

  const fy = "financialYearStart" in companyOnly ? companyOnly.financialYearStart : null;
  if (fy && !/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(fy)) {
    r.reject("financialYearStart", "Write it as MM-DD — 01-01 for a calendar year.");
  }

  if (common.headPersonId) {
    const person = await db.person.findFirst({
      where: { id: common.headPersonId, organisationId: orgId },
      select: { id: true },
    });
    if (!person) r.reject("headPersonId", "That person is no longer on record.");
  }

  const v = { ...common, ...companyOnly };
  const parsed = r.finish(v);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  const ctx = {
    organisationId: orgId,
    entity: "OrgUnit",
    entityLabel: common.nameEn,
    reason: String(data.get("reason") ?? ""),
  };

  if (!current) {
    const effectiveFrom = r.date("effectiveFrom", "In force from", { required: true });
    if (!effectiveFrom) return { ok: false, errors: { effectiveFrom: "In force from is required." } };
    const row = { organisationId: orgId, code, kind, parentCode, effectiveFrom, ...v };
    await auditedCreate(ctx, row, (tx) => tx.orgUnit.create({ data: row }));
  } else {
    const before = await db.orgUnit.findUnique({ where: { id: current.id } });
    if (!before) return { ok: false, message: "That unit no longer exists." };
    await auditedUpdate({ ...ctx, entityId: current.id }, before, v, (tx) =>
      tx.orgUnit.update({ where: { id: current.id }, data: v }),
    );
  }

  revalidatePath(PATH);
  return { ok: true };
}

// ------------------------------------------------------------------ cost centres

export async function saveCostCentre(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;

  const editingCode = String(data.get("id") ?? "");
  const r = new FormReader(data);

  const existing = await db.costCentre.findMany({
    where: { organisationId: orgId },
    select: { id: true, code: true },
  });
  const current = editingCode ? existing.find((c) => c.code === editingCode) : undefined;
  if (editingCode && !current) return { ok: false, message: "That cost centre no longer exists." };

  const code = current
    ? current.code
    : r.code("code", "Code", { taken: existing.map((c) => c.code) });

  const effectiveFrom = r.date("effectiveFrom", "In force from", { required: true });
  const effectiveTo = r.date("effectiveTo", "Closed from");
  checkPeriod(r, effectiveFrom, effectiveTo);

  const v = {
    nameEn: r.text("nameEn", "Name", { required: true, max: 160 }),
    orgUnitCode: r.optionalText("orgUnitCode"),
    siteCode: r.optionalText("siteCode"),
    activity: r.optionalText("activity") ?? "",
    ownerPersonId: r.optionalText("ownerPersonId"),
    effectiveFrom: effectiveFrom!,
    effectiveTo,
  };

  const parsed = r.finish(v);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  const ctx = {
    organisationId: orgId,
    entity: "CostCentre",
    entityLabel: code,
    reason: String(data.get("reason") ?? ""),
  };

  if (!current) {
    const row = { organisationId: orgId, code, ...v };
    await auditedCreate(ctx, row, (tx) => tx.costCentre.create({ data: row }));
  } else {
    const before = await db.costCentre.findUnique({ where: { id: current.id } });
    if (!before) return { ok: false, message: "That cost centre no longer exists." };
    await auditedUpdate({ ...ctx, entityId: current.id }, before, v, (tx) =>
      tx.costCentre.update({ where: { id: current.id }, data: v }),
    );
  }

  revalidatePath(PATH);
  return { ok: true };
}

// -------------------------------------------------------------------------- sites

export async function saveSite(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;

  const editingCode = String(data.get("id") ?? "");
  const r = new FormReader(data);

  const existing = await db.site.findMany({
    where: { organisationId: orgId },
    select: { id: true, code: true },
  });
  const current = editingCode ? existing.find((s) => s.code === editingCode) : undefined;
  if (editingCode && !current) return { ok: false, message: "That site no longer exists." };

  const code = current
    ? current.code
    : r.code("code", "Code", { taken: existing.map((s) => s.code) });

  const effectiveFrom = r.date("effectiveFrom", "In force from", { required: true });
  const effectiveTo = r.date("effectiveTo", "Closed from");
  checkPeriod(r, effectiveFrom, effectiveTo);

  const v = {
    nameEn: r.text("nameEn", "Site", { required: true, max: 160 }),
    kind: r.optionalText("kind") ?? "",
    town: r.optionalText("town") ?? "",
    district: r.optionalText("district") ?? "",
    orgUnitCode: r.optionalText("orgUnitCode"),
    address: r.optionalText("address") ?? "",
    effectiveFrom: effectiveFrom!,
    effectiveTo,
  };

  const parsed = r.finish(v);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  const ctx = {
    organisationId: orgId,
    entity: "Site",
    entityLabel: v.nameEn,
    reason: String(data.get("reason") ?? ""),
  };

  if (!current) {
    const row = { organisationId: orgId, code, ...v };
    await auditedCreate(ctx, row, (tx) => tx.site.create({ data: row }));
  } else {
    const before = await db.site.findUnique({ where: { id: current.id } });
    if (!before) return { ok: false, message: "That site no longer exists." };
    await auditedUpdate({ ...ctx, entityId: current.id }, before, v, (tx) =>
      tx.site.update({ where: { id: current.id }, data: v }),
    );
  }

  revalidatePath(PATH);
  return { ok: true };
}
