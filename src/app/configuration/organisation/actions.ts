"use server";

import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import { diffFields } from "@/lib/audit/diff";
import { auditedCreate, auditedDelete, auditedUpdate, writeAudit } from "@/lib/audit/record";
import { isTimeZone } from "@/lib/dates";
import { db } from "@/lib/db";
import { inForceOn } from "@/lib/effective";
import { DETAIL_FIELDS, detailsFaults, normaliseDetails, type DetailField } from "@/lib/organisation/details";
import { inspectLogo, LOGO_MAX_BYTES, logoFaultText } from "@/lib/organisation/logo";
import { placementFault } from "@/lib/organisation/structure";
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
    select: { id: true, code: true, kind: true, effectiveFrom: true, effectiveTo: true },
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

  // Where it sits is set when it is created. The parent has to exist and be in force,
  // and be a shallower tier: every rule that looks up "the Head of Department" walks
  // up this tree, and a section above a department would send it the wrong way.
  if (!current) {
    const parent = parentCode
      ? existing.find((u) => u.code === parentCode && inForceOn(u, new Date()))
      : null;
    if (parentCode && !parent) {
      r.reject("parentCode", "That unit is not in force. Choose one that is.");
    } else {
      const fault = placementFault(kind, parent?.kind ?? null);
      if (fault === "COMPANY_UNDER_SOMETHING") {
        r.reject("parentCode", "A company stands on its own; it does not sit under another unit.");
      } else if (fault === "NEEDS_A_PARENT") {
        r.reject("parentCode", "Choose the unit this one sits under.");
      } else if (fault === "NOT_DEEPER_THAN_PARENT") {
        r.reject("parentCode", "It must sit under a unit of a higher tier.");
      }
    }
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

// -------------------------------------------------------------------- time zone

/**
 * Set the organisation's time zone: the zone "today" is judged in — whether a vote
 * sheet is dated in the future, the day a matter is tabled. An IANA name, checked
 * against the runtime. Clearing it leaves it unset, which is not UTC: sittings then
 * cannot start, table or vote until it is set again.
 */
export async function saveTimeZone(_prev: FormState, data: FormData): Promise<FormState> {
  const org = await db.organisation.findUnique({ where: { code: ORGANISATION_CODE } });
  if (!org) return NO_ORG;
  const r = new FormReader(data);
  const timeZone = r.optionalText("timeZone");
  if (timeZone && !isTimeZone(timeZone)) {
    r.reject("timeZone", "Not a time zone name. Use the IANA form, for example Asia/Kuala_Lumpur.");
  }
  const parsed = r.finish({ timeZone });
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  await auditedUpdate(
    { organisationId: org.id, entity: "Organisation", entityId: org.id, entityLabel: org.name, reason: String(data.get("reason") ?? "") },
    { timeZone: org.timeZone },
    { timeZone },
    (tx) => tx.organisation.update({ where: { id: org.id }, data: { timeZone } }),
  );
  revalidatePath(PATH);
  return { ok: true };
}

// ---------------------------------------------------------------------- details

/// The name, logo and details are in the shell on every screen, so a save refreshes the
/// root layout and not only this page.
function refreshEverywhere() {
  revalidatePath("/", "layout");
  revalidatePath(PATH);
}

/**
 * Save the organisation's identity details. The legal name is the only required field.
 * The change is audited, before and after, in the same transaction as the write. Issued
 * documents keep the details they were issued with: nothing here reaches them.
 */
export async function saveDetails(_prev: FormState, data: FormData): Promise<FormState> {
  const org = await db.organisation.findUnique({ where: { code: ORGANISATION_CODE } });
  if (!org) return NO_ORG;

  const input = Object.fromEntries(DETAIL_FIELDS.map((f) => [f, String(data.get(f) ?? "")])) as Record<DetailField, string>;
  const faults = detailsFaults(input);
  if (Object.keys(faults).length > 0) return { ok: false, errors: faults as Record<string, string> };

  const after = normaliseDetails(input);
  const before = Object.fromEntries(DETAIL_FIELDS.map((f) => [f, org[f]]));
  const { changed } = await auditedUpdate(
    { organisationId: org.id, entity: "Organisation", entityId: org.id, entityLabel: org.name, reason: String(data.get("reason") ?? "") },
    before,
    after,
    (tx) => tx.organisation.update({ where: { id: org.id }, data: after }),
  );
  refreshEverywhere();
  return { ok: true, message: changed ? "Saved. The new details show across the portal now." : "Nothing changed." };
}

// ------------------------------------------------------------------------- logo

const MEDIA_LABEL = { "image/png": "PNG", "image/jpeg": "JPEG", "image/webp": "WebP" } as const;

/// How a logo reads in the trail: its fingerprint, type, size and dimensions, never its bytes.
function logoFacts(l: { sha256: string; mediaType: string; sizeBytes: number; width: number; height: number }) {
  return {
    fingerprint: l.sha256,
    type: MEDIA_LABEL[l.mediaType as keyof typeof MEDIA_LABEL] ?? "Image",
    size: `${Math.ceil(l.sizeBytes / 1024)} KB`,
    dimensions: `${l.width} × ${l.height}`,
  };
}

/// Replace the logo. Only PNG, JPEG or WebP, judged by the file's bytes, up to 512 KB.
export async function uploadLogo(_prev: FormState, data: FormData): Promise<FormState> {
  const org = await db.organisation.findUnique({ where: { code: ORGANISATION_CODE }, select: { id: true, name: true } });
  if (!org) return NO_ORG;

  const file = data.get("logo");
  if (!(file instanceof File) || file.size === 0) return { ok: false, errors: { logo: logoFaultText("EMPTY", 0) } };
  // Refused on the declared size before the bytes are read into memory.
  if (file.size > LOGO_MAX_BYTES) return { ok: false, errors: { logo: logoFaultText("TOO_LARGE", file.size) } };

  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = inspectLogo(bytes);
  if (!check.ok) return { ok: false, errors: { logo: logoFaultText(check.fault, check.sizeBytes) } };

  const outcome = await db.$transaction(async (tx) => {
    const prior = await tx.organisationLogo.findUnique({ where: { organisationId: org.id }, select: { sha256: true, mediaType: true, sizeBytes: true, width: true, height: true } });
    if (prior?.sha256 === check.sha256) return "SAME" as const;
    const row = {
      bytes: Buffer.from(bytes),
      mediaType: check.mediaType,
      sizeBytes: check.sizeBytes,
      sha256: check.sha256,
      width: check.width,
      height: check.height,
      uploadedAt: new Date(),
    };
    const saved = await tx.organisationLogo.upsert({
      where: { organisationId: org.id },
      create: { organisationId: org.id, ...row },
      update: row,
      select: { id: true },
    });
    await writeAudit(
      tx,
      { organisationId: org.id, entity: "OrganisationLogo", entityId: saved.id, entityLabel: org.name },
      prior ? "UPDATE" : "CREATE",
      diffFields(prior ? logoFacts(prior) : null, logoFacts(check)),
    );
    return "SAVED" as const;
  });

  if (outcome === "SAVED") refreshEverywhere();
  return { ok: true, message: outcome === "SAVED" ? "Saved. The new logo shows across the portal now." : "That is already the logo." };
}

/// Remove the logo; the product mark is shown again. A reason is required.
export async function removeLogo(_prev: FormState, data: FormData): Promise<FormState> {
  const org = await db.organisation.findUnique({ where: { code: ORGANISATION_CODE }, select: { id: true, name: true } });
  if (!org) return NO_ORG;
  const reason = String(data.get("reason") ?? "").trim();
  if (!reason) return { ok: false, errors: { reason: "Say why the logo is being removed." } };
  const logo = await db.organisationLogo.findUnique({ where: { organisationId: org.id }, select: { id: true, sha256: true, mediaType: true, sizeBytes: true, width: true, height: true } });
  if (!logo) return { ok: false, message: "There is no logo to remove." };

  await auditedDelete(
    { organisationId: org.id, entity: "OrganisationLogo", entityId: logo.id, entityLabel: org.name, reason },
    logoFacts(logo),
    (tx) => tx.organisationLogo.delete({ where: { id: logo.id } }),
  );
  refreshEverywhere();
  return { ok: true };
}
