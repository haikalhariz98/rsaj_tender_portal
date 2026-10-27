import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import { diffFields } from "@/lib/audit/diff";
import { writeAudit, type Tx } from "@/lib/audit/record";
import type { AuditActor } from "@/lib/auth/types";
import { storedDay } from "@/lib/dates";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { ELIGIBILITY_WORDS, eligibilityKey } from "@/lib/funding/labels";
import { exerciseOrg } from "@/lib/method/repo";
import { splitValues } from "@/lib/ui/select-logic";
import { FormReader } from "@/lib/validate";
import { requireStaff, toAuditActor } from "@/app/_auth/actor";

/**
 * Settings › Funding (ADR 0046, plan step 3): funding sources, project categories and impact measures. Every list ships empty; a code is
 * fixed once saved; rows are retired, never deleted, and retiring one leaves the records that name it as they are. Each write is audited
 * with its before and after, in words, in the same transaction. Proposed through `stageEdit` (`actions.ts`), so the two-person switch
 * covers them.
 */

const PATH = "/configuration/funding";
const NO_ORG: FormState = { ok: false, message: "No organisation is configured. Run npm run setup first." };
const PROVENANCE = ["STATED", "OBSERVED", "ASSUMED"] as const;
/// FS-4: the eligibility dropdown. Empty: not set.
const ELIGIBILITY = ["ANY", "ONLY"] as const;

const done = (): FormState => {
  revalidatePath(PATH);
  return { ok: true };
};

async function audit(tx: Tx, actor: AuditActor, orgId: string, entity: string, entityId: string, label: string, before: Record<string, unknown> | null, after: Record<string, unknown>, reason = "") {
  const changes = diffFields(before, after);
  if (before && changes.length === 0) return;
  await writeAudit(tx, { actor, organisationId: orgId, entity, entityId, entityLabel: label, reason }, before ? "UPDATE" : "CREATE", changes);
}

const eligibilityWords = (restricted: boolean | null) => ELIGIBILITY_WORDS[eligibilityKey(restricted)];

export async function saveFundingSource(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const o = await exerciseOrg(actor.organisationId);
  if (!o) return NO_ORG;
  const r = new FormReader(data);
  const id = r.optionalText("id");
  const code = id ? null : r.code("code", "Code");
  const eligibility = r.choice("eligibility", "Eligible categories", ELIGIBILITY);
  const picked = [...new Set(splitValues(data.get("eligibleCategoryCodes")))];
  const v = {
    nameEn: r.text("nameEn", "Name", { required: true, max: 240 }),
    envelope: r.money("envelope", "Envelope"),
    categoriesRestricted: eligibility == null ? null : eligibility === "ONLY",
    // Read only while restricted, so kept empty otherwise: a list nobody reads is not left to mislead.
    eligibleCategoryCodes: eligibility === "ONLY" ? picked : [],
    // A hidden field still posts: the basis of an eligibility that is not set is not kept.
    eligibilityProvenance: eligibility == null ? null : r.choice("eligibilityProvenance", "Source of the eligibility", PROVENANCE),
    provenance: r.choice("provenance", "Basis", PROVENANCE, { required: true }),
    governingSource: r.text("governingSource", "Source", { max: 400 }),
    notes: r.text("notes", "Notes", { max: 4000 }),
    sortOrder: r.int("sortOrder", "Order", { min: 0 }) ?? 0,
  };
  // FS-4: "only these" with nothing ticked would block every requisition.
  if (eligibility === "ONLY" && picked.length === 0) r.reject("eligibleCategoryCodes", "Choose at least one category, or choose Any category.");
  if (r.failed || !v.provenance) return { ok: false, errors: r.errors };
  return db.$transaction(async (tx) => {
    const categories = await tx.projectCategory.findMany({ where: { organisationId: o.id }, select: { code: true, nameEn: true } });
    if (v.eligibleCategoryCodes.some((c) => !categories.some((x) => x.code === c))) return { ok: false, errors: { eligibleCategoryCodes: "Choose from the organisation's project categories." } } as FormState;
    const words = (row: { nameEn: string; envelope: { toString(): string } | string | null; categoriesRestricted: boolean | null; eligibleCategoryCodes: string[]; eligibilityProvenance: string | null; provenance: string; governingSource: string; notes: string; sortOrder: number }) => ({
      nameEn: row.nameEn,
      envelope: row.envelope == null ? null : row.envelope.toString(),
      eligibility: eligibilityWords(row.categoriesRestricted),
      eligibleCategories: row.eligibleCategoryCodes.map((c) => categories.find((x) => x.code === c)?.nameEn ?? "A category no longer configured").join(", ") || null,
      eligibilityProvenance: row.eligibilityProvenance,
      provenance: row.provenance,
      governingSource: row.governingSource,
      notes: row.notes,
      sortOrder: row.sortOrder,
    });
    const data = { ...v, provenance: v.provenance! };
    if (id) {
      await tx.$queryRaw`SELECT id FROM "FundingSource" WHERE id = ${id} FOR UPDATE`;
      const before = await tx.fundingSource.findFirst({ where: { id, organisationId: o.id } });
      if (!before) return { ok: false, message: "That funding source no longer exists." } as FormState;
      await tx.fundingSource.update({ where: { id }, data });
      await audit(tx, toAuditActor(actor), o.id, "FundingSource", id, v.nameEn, words(before), words(data));
    } else {
      if (await tx.fundingSource.findFirst({ where: { organisationId: o.id, code: { equals: code!, mode: "insensitive" } }, select: { id: true } })) return { ok: false, errors: { code: "That code is already used." } } as FormState;
      const row = await tx.fundingSource.create({ data: { organisationId: o.id, code: code!, ...data } });
      await audit(tx, toAuditActor(actor), o.id, "FundingSource", row.id, v.nameEn, null, { code, ...words(data) });
    }
    return done();
  });
}

export async function saveProjectCategory(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const o = await exerciseOrg(actor.organisationId);
  if (!o) return NO_ORG;
  const r = new FormReader(data);
  const id = r.optionalText("id");
  const code = id ? null : r.code("code", "Code");
  const v = {
    nameEn: r.text("nameEn", "Name", { required: true, max: 240 }),
    provenance: r.choice("provenance", "Basis", PROVENANCE, { required: true }),
    governingSource: r.text("governingSource", "Source", { max: 400 }),
    sortOrder: r.int("sortOrder", "Order", { min: 0 }) ?? 0,
  };
  if (r.failed || !v.provenance) return { ok: false, errors: r.errors };
  const row = { ...v, provenance: v.provenance };
  return db.$transaction(async (tx) => {
    if (id) {
      await tx.$queryRaw`SELECT id FROM "ProjectCategory" WHERE id = ${id} FOR UPDATE`;
      const before = await tx.projectCategory.findFirst({ where: { id, organisationId: o.id }, select: { nameEn: true, provenance: true, governingSource: true, sortOrder: true } });
      if (!before) return { ok: false, message: "That category no longer exists." } as FormState;
      await tx.projectCategory.update({ where: { id }, data: row });
      await audit(tx, toAuditActor(actor), o.id, "ProjectCategory", id, v.nameEn, before, row);
    } else {
      if (await tx.projectCategory.findFirst({ where: { organisationId: o.id, code: { equals: code!, mode: "insensitive" } }, select: { id: true } })) return { ok: false, errors: { code: "That code is already used." } } as FormState;
      const made = await tx.projectCategory.create({ data: { organisationId: o.id, code: code!, ...row } });
      await audit(tx, toAuditActor(actor), o.id, "ProjectCategory", made.id, v.nameEn, null, { code, ...row });
    }
    return done();
  });
}

export async function saveImpactMeasure(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const o = await exerciseOrg(actor.organisationId);
  if (!o) return NO_ORG;
  const r = new FormReader(data);
  const id = r.optionalText("id");
  const code = id ? null : r.code("code", "Code");
  const v = {
    nameEn: r.text("nameEn", "Name", { required: true, max: 240 }),
    unit: r.text("unit", "Unit", { required: true, max: 40 }),
    provenance: r.choice("provenance", "Basis", PROVENANCE, { required: true }),
    governingSource: r.text("governingSource", "Source", { max: 400 }),
    sortOrder: r.int("sortOrder", "Order", { min: 0 }) ?? 0,
  };
  if (r.failed || !v.provenance) return { ok: false, errors: r.errors };
  const row = { ...v, provenance: v.provenance };
  return db.$transaction(async (tx) => {
    if (id) {
      await tx.$queryRaw`SELECT id FROM "ImpactMeasure" WHERE id = ${id} FOR UPDATE`;
      const before = await tx.impactMeasure.findFirst({ where: { id, organisationId: o.id }, select: { nameEn: true, unit: true, provenance: true, governingSource: true, sortOrder: true } });
      if (!before) return { ok: false, message: "That measure no longer exists." } as FormState;
      await tx.impactMeasure.update({ where: { id }, data: row });
      await audit(tx, toAuditActor(actor), o.id, "ImpactMeasure", id, v.nameEn, before, row);
    } else {
      if (await tx.impactMeasure.findFirst({ where: { organisationId: o.id, code: { equals: code!, mode: "insensitive" } }, select: { id: true } })) return { ok: false, errors: { code: "That code is already used." } } as FormState;
      const made = await tx.impactMeasure.create({ data: { organisationId: o.id, code: code!, ...row } });
      await audit(tx, toAuditActor(actor), o.id, "ImpactMeasure", made.id, v.nameEn, null, { code, ...row });
    }
    return done();
  });
}

const RETIRABLE = ["FundingSource", "ProjectCategory", "ImpactMeasure"] as const;
type Retirable = (typeof RETIRABLE)[number];

/// Retire (a day given) or restore (none given) a row of one of the three lists, with a reason. The records that name it are not touched.
export async function setFundingRowRetired(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const o = await exerciseOrg(actor.organisationId);
  if (!o) return NO_ORG;
  const r = new FormReader(data);
  const entity = r.choice("entity", "List", RETIRABLE, { required: true });
  const id = r.text("id", "Row", { required: true });
  const restore = r.bool("restore");
  const on = restore ? null : r.date("retiredOn", "No longer used from", { required: true });
  const reason = r.text("reason", "Reason", { required: true, max: 2000 });
  if (r.failed || !entity) return { ok: false, errors: r.errors };
  return db.$transaction(async (tx) => {
    const before = await lockRow(tx, entity, id, o.id);
    if (!before) return { ok: false, message: "That row no longer exists." } as FormState;
    if (restore && !before.retiredOn) return { ok: false, message: "It is in use." } as FormState;
    if (!restore && before.retiredOn) return { ok: false, message: `It is already no longer used from ${formatDate(storedDay(before.retiredOn))}.` } as FormState;
    await setRetired(tx, entity, id, on);
    await writeAudit(tx, { actor: toAuditActor(actor), organisationId: o.id, entity, entityId: id, entityLabel: before.nameEn, reason }, "UPDATE", diffFields({ retiredOn: before.retiredOn ? storedDay(before.retiredOn) : null }, { retiredOn: on ? storedDay(on) : null }));
    return done();
  });
}

async function lockRow(tx: Tx, entity: Retirable, id: string, organisationId: string): Promise<{ nameEn: string; retiredOn: Date | null } | null> {
  const select = { nameEn: true, retiredOn: true } as const;
  if (entity === "FundingSource") {
    await tx.$queryRaw`SELECT id FROM "FundingSource" WHERE id = ${id} FOR UPDATE`;
    return tx.fundingSource.findFirst({ where: { id, organisationId }, select });
  }
  if (entity === "ProjectCategory") {
    await tx.$queryRaw`SELECT id FROM "ProjectCategory" WHERE id = ${id} FOR UPDATE`;
    return tx.projectCategory.findFirst({ where: { id, organisationId }, select });
  }
  await tx.$queryRaw`SELECT id FROM "ImpactMeasure" WHERE id = ${id} FOR UPDATE`;
  return tx.impactMeasure.findFirst({ where: { id, organisationId }, select });
}

async function setRetired(tx: Tx, entity: Retirable, id: string, retiredOn: Date | null) {
  if (entity === "FundingSource") await tx.fundingSource.update({ where: { id }, data: { retiredOn } });
  else if (entity === "ProjectCategory") await tx.projectCategory.update({ where: { id }, data: { retiredOn } });
  else await tx.impactMeasure.update({ where: { id }, data: { retiredOn } });
}
