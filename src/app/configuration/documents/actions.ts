"use server";

import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import { diffFields } from "@/lib/audit/diff";
import { auditedCreate, auditedUpdate, writeAudit } from "@/lib/audit/record";
import { policyView } from "@/lib/documents/audit-view";
import { documentFaultText } from "@/lib/documents/labels";
import { megabytesToBytes, policyFaults } from "@/lib/documents/policy";
import { DISPOSAL_METHODS, RETENTION_TRIGGERS, SECURITY_CLASSES } from "@/lib/documents/types";
import { db } from "@/lib/db";
import { ORGANISATION_CODE } from "@/lib/org";
import { FormReader } from "@/lib/validate";

const PROVENANCE = ["STATED", "OBSERVED", "ASSUMED"] as const;
const PATH = "/configuration/documents";

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

export async function saveDocumentClass(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;

  const id = String(data.get("id") ?? "");
  const existing = await db.documentClass.findMany({
    where: { organisationId: orgId },
    select: { id: true, code: true },
  });
  const current = id ? existing.find((e) => e.id === id) : undefined;
  if (id && !current) return { ok: false, message: "That document class no longer exists." };

  const r = new FormReader(data);
  // The code is set once and never edited: records elsewhere join on it. The edit
  // drawer does not offer it, so it is read from the stored record — the form has no
  // such field, and writing its absence would blank the thing everything points at.
  const code = current
    ? current.code
    : r.code("code", "Code", { taken: existing.map((e) => e.code) });

  // Left empty deliberately: an unset retention period is not a period of zero, and
  // the portal must never dispose of a record because nobody said how long to keep it.
  const retentionMonths = r.int("retentionMonths", "Retention", { min: 1 });

  // The class's classification, retention trigger, disposal method and authority (plan
  // §2). Written only where the form carries them, so an editor that does not show them
  // never blanks them. Each ships unset and reads "Not set".
  const present = new Set([...data.keys()]);
  const classification = r.choice("classification", "Classification", SECURITY_CLASSES);
  const retentionTrigger = r.choice("retentionTrigger", "Retention starts", RETENTION_TRIGGERS);
  const disposalMethod = r.choice("disposalMethod", "Disposal", DISPOSAL_METHODS);
  const disposalAuthorityRoleCode = r.optionalText("disposalAuthorityRoleCode");
  if (disposalAuthorityRoleCode) {
    const office = await db.authorityRole.findFirst({ where: { organisationId: orgId, code: disposalAuthorityRoleCode, isCommittee: false }, select: { id: true } });
    if (!office) r.reject("disposalAuthorityRoleCode", "That is not an office. Choose one from Users & roles.");
  }
  const lifecycle = {
    ...(present.has("classification") ? { classification } : {}),
    ...(present.has("retentionTrigger") ? { retentionTrigger } : {}),
    ...(present.has("disposalMethod") ? { disposalMethod } : {}),
    ...(present.has("disposalAuthorityRoleCode") ? { disposalAuthorityRoleCode } : {}),
  };

  const v = {
    code,
    ...lifecycle,
    nameEn: r.text("nameEn", "Name", { required: true, max: 160 }),
    nameMs: r.optionalText("nameMs"),
    retentionMonths,
    controlledCopy: r.bool("controlledCopy"),
    releaseNeedsApproval: r.bool("releaseNeedsApproval"),
    provenance: r.choice("provenance", "Provenance", PROVENANCE, { required: true }),
    notes: r.text("notes", "Notes", { max: 2000 }),
    sortOrder: r.int("sortOrder", "Order", { min: 0 }) ?? 0,
  };

  const parsed = r.finish(v);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  const ctx = {
    organisationId: orgId,
    entity: "DocumentClass",
    entityLabel: v.nameEn,
    reason: String(data.get("reason") ?? ""),
  };
  const write = { ...v, provenance: v.provenance! };

  if (!id) {
    await auditedCreate(ctx, v, (tx) =>
      tx.documentClass.create({ data: { organisationId: orgId, ...write } }),
    );
  } else {
    const before = await db.documentClass.findUnique({ where: { id } });
    if (!before) return { ok: false, message: "That class no longer exists." };
    await auditedUpdate({ ...ctx, entityId: id }, before, v, (tx) =>
      tx.documentClass.update({ where: { id }, data: write }),
    );
  }

  revalidatePath(PATH);
  return { ok: true };
}

/**
 * The organisation's upload rules (OD-3): which recognisable types are allowed and the
 * largest file, in megabytes as typed. Either may be left unset — that is how the policy
 * ships — and uploads are then refused naming it. One row per organisation, audited
 * before and after in the same transaction.
 */
export async function saveStorePolicy(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;
  const r = new FormReader(data);
  const allowedMediaTypes = [...new Set(data.getAll("allowedMediaTypes").map(String).map((x) => x.trim()).filter(Boolean))];
  const mb = r.optionalText("maxMegabytes");
  const maxBytes = mb ? megabytesToBytes(mb) : null;
  if (mb && maxBytes == null) r.reject("maxMegabytes", "Give the largest file in megabytes, above zero, to at most three decimal places.");
  for (const f of policyFaults({ allowedMediaTypes, maxBytes: maxBytes?.toString() ?? null })) r.reject(f.code === "SIZE_INVALID" ? "maxMegabytes" : "allowedMediaTypes", documentFaultText(f));
  const provenance = r.choice("provenance", "Provenance", PROVENANCE, { required: true });
  const notes = r.text("notes", "Notes", { max: 2000 });
  if (r.failed || !provenance) return { ok: false, errors: r.errors };
  const reason = String(data.get("reason") ?? "");
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Organisation" WHERE id = ${orgId} FOR UPDATE`;
    const before = await tx.documentStorePolicy.findUnique({ where: { organisationId: orgId } });
    const row = await tx.documentStorePolicy.upsert({
      where: { organisationId: orgId },
      create: { organisationId: orgId, allowedMediaTypes, maxBytes, provenance, notes },
      update: { allowedMediaTypes, maxBytes, provenance, notes },
    });
    const changes = diffFields(policyView(before), policyView(row));
    if (!before || changes.length) await writeAudit(tx, { organisationId: orgId, entity: "DocumentStorePolicy", entityId: row.id, entityLabel: "Upload rules", reason }, before ? "UPDATE" : "CREATE", changes);
  });
  revalidatePath(PATH);
  return { ok: true };
}
