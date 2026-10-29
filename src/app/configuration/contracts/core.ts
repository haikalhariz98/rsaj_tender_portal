import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import { diffFields } from "@/lib/audit/diff";
import { writeAudit, type Tx } from "@/lib/audit/record";
import { db } from "@/lib/db";
import { rowInForce, unitInForce } from "@/lib/contract/in-force";
import { storedDay } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { exerciseOrg } from "@/lib/method/repo";
import { FormReader } from "@/lib/validate";
import { requireStaff, toAuditActor } from "@/app/_auth/actor";
import type { AuditActor } from "@/lib/auth/types";

/**
 * Contract controls (6.12): how this organisation forms contracts. Every setting ships unset and every
 * list empty; saving an empty field clears it back to unset, which is recorded. Rows are retired, never
 * deleted. Each write is audited with its before and after in the same transaction. A contract already
 * in preparation keeps what was frozen for it.
 */

const PATH = "/configuration/contracts";
const NO_ORG: FormState = { ok: false, message: "No organisation is configured. Run npm run setup first." };
const PROVENANCE = ["STATED", "OBSERVED", "ASSUMED"] as const;

const done = (): FormState => {
  revalidatePath(PATH);
  revalidatePath("/projects");
  return { ok: true };
};

async function audit(tx: Tx, actor: AuditActor, orgId: string, entity: string, entityId: string, label: string, before: Record<string, unknown> | null, after: Record<string, unknown>, reason: string) {
  const changes = diffFields(before, after);
  if (before && changes.length === 0) return;
  await writeAudit(tx, { actor, organisationId: orgId, entity, entityId, entityLabel: label, reason }, before ? "UPDATE" : "CREATE", changes);
}

export async function saveContractPolicy(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const o = await exerciseOrg(actor.organisationId);
  if (!o) return NO_ORG;
  const r = new FormReader(data);
  const ratio = r.optionalText("frontLoadingRatio")?.trim() ?? null;
  if (ratio && (!/^\d{1,5}(\.\d{1,4})?$/.test(ratio) || Number(ratio) <= 0)) r.reject("frontLoadingRatio", "A multiple above nothing, to at most four places (1.5 lists rates above one and a half times the estimate's).");
  const v = {
    legalOfficeCode: r.optionalText("legalOfficeCode"),
    frontLoadingRatio: ratio || null,
    controlledCopyStampEn: r.optionalText("controlledCopyStampEn"),
    signatoryCond: r.optionalText("signatoryCond"),
    employerSigningRoleCode: r.optionalText("employerSigningRoleCode"),
    provenance: r.choice("provenance", "Provenance", PROVENANCE),
    notes: r.text("notes", "Notes", { max: 4000 }),
  };
  const reason = r.text("reason", "Reason", { max: 2000 });
  if (r.failed) return { ok: false, errors: r.errors };
  return db.$transaction(async (tx) => {
    // In force on the organisation's day (M-2): begun, and not ended.
    if (v.legalOfficeCode && !(o.today && unitInForce(v.legalOfficeCode, await tx.orgUnit.findMany({ where: { organisationId: o.id, code: v.legalOfficeCode }, select: { code: true, effectiveFrom: true, effectiveTo: true } }), o.today))) return { ok: false, errors: { legalOfficeCode: "That unit is not in the organisation's structure." } } as FormState;
    await tx.$queryRaw`SELECT id FROM "Organisation" WHERE id = ${o.id} FOR UPDATE`;
    // The office that signs for the employer is a configured office (NFR-SIG-001, ruling of 2026-10-07): one of this organisation's, never an invented code.
    if (v.employerSigningRoleCode && !(await tx.authorityRole.findFirst({ where: { organisationId: o.id, code: v.employerSigningRoleCode, isCommittee: false }, select: { id: true } }))) {
      return { ok: false, errors: { employerSigningRoleCode: "Choose one of the organisation's offices." } };
    }
    const before = await tx.contractPolicy.findUnique({ where: { organisationId: o.id } });
    const row = await tx.contractPolicy.upsert({ where: { organisationId: o.id }, update: v, create: { organisationId: o.id, ...v } });
    // The trail names the office, not its key.
    const officeName = async (code: string | null | undefined) => (code ? ((await tx.authorityRole.findFirst({ where: { organisationId: o.id, code }, select: { nameEn: true } }))?.nameEn ?? "An office no longer configured") : null);
    const { employerSigningRoleCode: beforeCode, ...beforeRest } = before ?? { employerSigningRoleCode: null };
    const { employerSigningRoleCode: afterCode, ...afterRest } = v;
    await audit(tx, toAuditActor(actor), o.id, "ContractPolicy", row.id, "Contract controls", before ? { ...beforeRest, frontLoadingRatio: before.frontLoadingRatio?.toString() ?? null, employerSigningOffice: await officeName(beforeCode) } : null, { ...afterRest, employerSigningOffice: await officeName(afterCode) }, reason);
    return done();
  });
}

export async function saveDocumentPart(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const o = await exerciseOrg(actor.organisationId);
  if (!o) return NO_ORG;
  const r = new FormReader(data);
  const id = r.optionalText("id");
  const v = {
    contractBasisCode: r.text("contractBasisCode", "Contract basis", { required: true }),
    labelEn: r.text("labelEn", "Part", { required: true, max: 240 }),
    printedNumber: r.text("printedNumber", "Printed number", { max: 20 }),
    provenance: r.choice("provenance", "Provenance", PROVENANCE, { required: true }),
    sortOrder: r.int("sortOrder", "Order", { min: 0 }) ?? 0,
    notes: r.text("notes", "Notes", { max: 4000 }),
  };
  const code = id ? null : r.code("code", "Code");
  if (r.failed || !v.provenance) return { ok: false, errors: r.errors };
  return db.$transaction(async (tx) => {
    if (!(await tx.contractBasis.findFirst({ where: { organisationId: o.id, code: v.contractBasisCode }, select: { id: true } }))) return { ok: false, errors: { contractBasisCode: "That basis is not configured." } } as FormState;
    if (id) {
      const before = await tx.contractDocumentPart.findFirst({ where: { id, organisationId: o.id } });
      if (!before) return { ok: false, message: "That part no longer exists." } as FormState;
      await tx.contractDocumentPart.update({ where: { id, organisationId: actor.organisationId }, data: { ...v, provenance: v.provenance! } });
      await audit(tx, toAuditActor(actor), o.id, "ContractDocumentPart", id, v.labelEn, before, v, "");
    } else {
      if (await tx.contractDocumentPart.findFirst({ where: { organisationId: o.id, contractBasisCode: v.contractBasisCode, code: code! }, select: { id: true } })) return { ok: false, errors: { code: "That code is already used for this basis." } } as FormState;
      const row = await tx.contractDocumentPart.create({ data: { organisationId: o.id, code: code!, ...v, provenance: v.provenance! } });
      await audit(tx, toAuditActor(actor), o.id, "ContractDocumentPart", row.id, v.labelEn, null, { code, ...v }, "");
    }
    return done();
  });
}

export async function saveCopyRecipient(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const o = await exerciseOrg(actor.organisationId);
  if (!o) return NO_ORG;
  const r = new FormReader(data);
  const id = r.optionalText("id");
  const v = {
    nameEn: r.text("nameEn", "Recipient", { required: true, max: 240 }),
    copyForm: r.text("copyForm", "What they receive", { max: 400 }),
    mandatory: r.bool("mandatory"),
    onlyWithConsultingEngineer: r.bool("onlyWithConsultingEngineer"),
    provenance: r.choice("provenance", "Provenance", PROVENANCE, { required: true }),
    sortOrder: r.int("sortOrder", "Order", { min: 0 }) ?? 0,
    notes: r.text("notes", "Notes", { max: 4000 }),
  };
  const code = id ? null : r.code("code", "Code");
  if (r.failed || !v.provenance) return { ok: false, errors: r.errors };
  return db.$transaction(async (tx) => {
    if (id) {
      const before = await tx.controlledCopyRecipient.findFirst({ where: { id, organisationId: o.id } });
      if (!before) return { ok: false, message: "That recipient no longer exists." } as FormState;
      await tx.controlledCopyRecipient.update({ where: { id, organisationId: actor.organisationId }, data: { ...v, provenance: v.provenance! } });
      await audit(tx, toAuditActor(actor), o.id, "ControlledCopyRecipient", id, v.nameEn, before, v, "");
    } else {
      if (await tx.controlledCopyRecipient.findFirst({ where: { organisationId: o.id, code: code! }, select: { id: true } })) return { ok: false, errors: { code: "That code is already used." } } as FormState;
      const row = await tx.controlledCopyRecipient.create({ data: { organisationId: o.id, code: code!, ...v, provenance: v.provenance! } });
      await audit(tx, toAuditActor(actor), o.id, "ControlledCopyRecipient", row.id, v.nameEn, null, { code, ...v }, "");
    }
    return done();
  });
}

/// Phase 2 close-out stage C (FR-FIN-008, CO-8, ruling 8): a document the final account's pack needs besides the contract's own certificates.
export async function saveCloseoutDocument(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const o = await exerciseOrg(actor.organisationId);
  if (!o) return NO_ORG;
  const r = new FormReader(data);
  const id = r.optionalText("id");
  const v = {
    labelEn: r.text("labelEn", "Document", { required: true, max: 240 }),
    provenance: r.choice("provenance", "Provenance", PROVENANCE, { required: true }),
    source: r.text("source", "Source", { max: 400 }),
    sortOrder: r.int("sortOrder", "Order", { min: 0 }) ?? 0,
  };
  if (r.failed || !v.provenance) return { ok: false, errors: r.errors };
  return db.$transaction(async (tx) => {
    if (id) {
      const before = await tx.closeoutDocumentRequirement.findFirst({ where: { id, organisationId: o.id } });
      if (!before) return { ok: false, message: "That document no longer exists." } as FormState;
      await tx.closeoutDocumentRequirement.update({ where: { id, organisationId: actor.organisationId }, data: { ...v, provenance: v.provenance! } });
      await audit(tx, toAuditActor(actor), o.id, "CloseoutDocumentRequirement", id, v.labelEn, { labelEn: before.labelEn, provenance: before.provenance, source: before.source, sortOrder: before.sortOrder }, v, "");
    } else {
      const row = await tx.closeoutDocumentRequirement.create({ data: { organisationId: o.id, ...v, provenance: v.provenance! } });
      await audit(tx, toAuditActor(actor), o.id, "CloseoutDocumentRequirement", row.id, v.labelEn, null, v, "");
    }
    return done();
  });
}

const RETIRABLE = { ContractDocumentPart: "contractDocumentPart", ControlledCopyRecipient: "controlledCopyRecipient", CloseoutDocumentRequirement: "closeoutDocumentRequirement" } as const;

export async function retireContractRow(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const o = await exerciseOrg(actor.organisationId);
  if (!o) return NO_ORG;
  const entity = String(data.get("entity") ?? "") as keyof typeof RETIRABLE;
  const id = String(data.get("id") ?? "");
  const reason = String(data.get("reason") ?? "").trim();
  const r = new FormReader(data);
  const on = r.date("retiredOn", "Retired from", { required: true });
  if (!reason) r.reject("reason", "A reason is required.");
  if (!(entity in RETIRABLE)) return { ok: false, message: "That list cannot be changed here." };
  if (r.failed || !on) return { ok: false, errors: r.errors };
  return db.$transaction(async (tx) => {
    // The row first (its own lock), then read it: two retirements of one row cannot both pass.
    if (entity === "ContractDocumentPart") await tx.$queryRaw`SELECT id FROM "ContractDocumentPart" WHERE id = ${id} FOR UPDATE`;
    else if (entity === "CloseoutDocumentRequirement") await tx.$queryRaw`SELECT id FROM "CloseoutDocumentRequirement" WHERE id = ${id} FOR UPDATE`;
    else await tx.$queryRaw`SELECT id FROM "ControlledCopyRecipient" WHERE id = ${id} FOR UPDATE`;
    const model = (tx as unknown as Record<string, { findFirst: (a: object) => Promise<{ id: string; retiredOn: Date | null; labelEn?: string; nameEn?: string } | null>; update: (a: object) => Promise<unknown> }>)[RETIRABLE[entity]];
    const before = await model.findFirst({ where: { id, organisationId: o.id } });
    if (!before) return { ok: false, message: "That row no longer exists." } as FormState;
    // R-6: the day is a "from" day, judged against the organisation's day with an exclusive end (rowInForce).
    if (before.retiredOn) return { ok: false, message: `It is already retired from ${formatDate(storedDay(before.retiredOn))}.` } as FormState;
    await model.update({ where: { id }, data: { retiredOn: on } });
    await writeAudit(tx, { actor: toAuditActor(actor), organisationId: o.id, entity, entityId: id, entityLabel: before.labelEn ?? before.nameEn ?? "Row", reason }, "UPDATE", diffFields({ retiredOn: null }, { retiredOn: storedDay(on), inForceToday: o.today ? (rowInForce({ retiredOn: on }, o.today) ? "yes: retired from a later day" : "no") : null }));
    return done();
  });
}
