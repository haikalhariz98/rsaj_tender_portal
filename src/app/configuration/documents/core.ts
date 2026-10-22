import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import { diffFields } from "@/lib/audit/diff";
import { auditedCreate, writeAudit } from "@/lib/audit/record";
import { classClassificationFault } from "@/lib/documents/classification";
import { policyView } from "@/lib/documents/audit-view";
import { projectClassFault } from "@/lib/documents/project-class";
import { documentFaultText } from "@/lib/documents/labels";
import { megabytesToBytes, policyFaults } from "@/lib/documents/policy";
import { DISPOSAL_METHODS, RETENTION_TRIGGERS, SECURITY_CLASSES } from "@/lib/documents/types";
import { db } from "@/lib/db";
import { FormReader } from "@/lib/validate";
import { splitValues } from "@/lib/ui/select-logic";
import { requireStaff, toAuditActor } from "@/app/_auth/actor";
import type { OrgScope } from "@/lib/org-scope";

const PROVENANCE = ["STATED", "OBSERVED", "ASSUMED"] as const;
const PATH = "/configuration/documents";

async function organisationId(scope: OrgScope): Promise<string | null> {
  const org = await db.organisation.findUnique({
    where: { id: scope.organisationId },
    select: { id: true },
  });
  return org?.id ?? null;
}

const NO_ORG: FormState = {
  ok: false,
  message: "No organisation is configured. Run npm run setup before adding records.",
};

export async function saveDocumentClass(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const orgId = await organisationId(actor);
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
    actor: toAuditActor(actor),
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
    // On the locked row: a set classification is never unset, and is not lowered by one
    // person (BD-DS-11 as ruled). Unchanged is no change: the editor posts it back.
    const refused = await db.$transaction(async (tx): Promise<FormState | null> => {
      await tx.$queryRaw`SELECT id FROM "DocumentClass" WHERE id = ${id} FOR UPDATE`;
      const before = await tx.documentClass.findUnique({ where: { id, organisationId: actor.organisationId } });
      if (!before) return { ok: false, message: "That class no longer exists." };
      if (present.has("classification")) {
        const faults = classClassificationFault(before.classification, classification ?? null);
        if (faults.length) return { ok: false, errors: { classification: faults.map(documentFaultText).join(" ") } };
      }
      await tx.documentClass.update({ where: { id, organisationId: actor.organisationId }, data: write });
      const changes = diffFields(before, v);
      if (changes.length) await writeAudit(tx, { ...ctx, entityId: id }, "UPDATE", changes);
      return null;
    });
    if (refused) return refused;
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
  const actor = await requireStaff();
  const orgId = await organisationId(actor);
  if (!orgId) return NO_ORG;
  const r = new FormReader(data);
  // The form posts the chosen types as one newline-joined value (see RecordEditor "tokens"); a direct post may repeat the field.
  const allowedMediaTypes = [...new Set(data.getAll("allowedMediaTypes").flatMap((v) => splitValues(v)))];
  const mb = r.optionalText("maxMegabytes");
  const maxBytes = mb ? megabytesToBytes(mb) : null;
  if (mb && maxBytes == null) r.reject("maxMegabytes", "Give the largest file in megabytes, above zero, to at most three decimal places.");
  for (const f of policyFaults({ allowedMediaTypes, maxBytes: maxBytes?.toString() ?? null })) r.reject(f.code === "SIZE_INVALID" ? "maxMegabytes" : "allowedMediaTypes", documentFaultText(f));
  const provenance = r.choice("provenance", "Provenance", PROVENANCE, { required: true });
  const notes = r.text("notes", "Notes", { max: 2000 });
  // Step 15: the class a filed online bid file takes. Left empty it is not set, and an online opening cannot be finalised. It must be a SULIT class of this organisation: a bid file was sealed until its opening.
  const classChoice = r.optionalText("onlineBidFileClassId") ?? "";
  const bidClass = classChoice ? await db.documentClass.findFirst({ where: { id: classChoice, organisationId: orgId }, select: { id: true, nameEn: true, classification: true } }) : null;
  if (classChoice && !bidClass) r.reject("onlineBidFileClassId", "Choose one of this organisation's document classes.");
  else if (bidClass && bidClass.classification !== "SULIT") r.reject("onlineBidFileClassId", "A bid file was sealed until the opening, so its class must be classified SULIT. Choose a SULIT class, or set that class's classification first.");
  // The class a project's files take (simple Project workspace, step 3). Read only when posted, so a proposal staged before the field existed never blanks it when decided.
  const projectPosted = new Set([...data.keys()]).has("projectDocumentClassId");
  const projectChoice = projectPosted ? (r.optionalText("projectDocumentClassId") ?? "") : "";
  const projectClass = projectChoice ? await db.documentClass.findFirst({ where: { id: projectChoice, organisationId: orgId }, select: { id: true, nameEn: true, classification: true } }) : null;
  if (projectChoice) {
    const fault = projectClassFault(projectClass);
    if (fault) r.reject("projectDocumentClassId", fault);
  }
  if (r.failed || !provenance) return { ok: false, errors: r.errors };
  const onlineBidFileClassId = bidClass?.id ?? null;
  const projectWrite = projectPosted ? { projectDocumentClassId: projectClass?.id ?? null } : {};
  const reason = String(data.get("reason") ?? "");
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Organisation" WHERE id = ${orgId} FOR UPDATE`;
    const names = { onlineBidFileClass: { select: { nameEn: true } }, projectDocumentClass: { select: { nameEn: true } } } as const;
    const before = await tx.documentStorePolicy.findUnique({ where: { organisationId: orgId }, include: names });
    const row = await tx.documentStorePolicy.upsert({
      where: { organisationId: orgId },
      create: { organisationId: orgId, allowedMediaTypes, maxBytes, onlineBidFileClassId, ...projectWrite, provenance, notes },
      update: { allowedMediaTypes, maxBytes, onlineBidFileClassId, ...projectWrite, provenance, notes },
      include: names,
    });
    const changes = diffFields(policyView(before, before?.onlineBidFileClass?.nameEn ?? null, before?.projectDocumentClass?.nameEn ?? null), policyView(row, bidClass?.nameEn ?? null, row.projectDocumentClass?.nameEn ?? null));
    if (!before || changes.length) await writeAudit(tx, { actor: toAuditActor(actor), organisationId: orgId, entity: "DocumentStorePolicy", entityId: row.id, entityLabel: "Upload rules", reason }, before ? "UPDATE" : "CREATE", changes);
  });
  revalidatePath(PATH);
  return { ok: true };
}

/**
 * Lower a document class's classification (BD-DS-11, Phase 5a): its own act, with its own drawer and a reason, decided by a second person, so that one person alone cannot
 * release a whole class of documents to a wider readership. Only a set classification lowered to a lower one is judged this way (`classClassificationFault`); documents already
 * filed keep the classification they took when they were filed. Locks the class's row and writes the classification with its audit row.
 */
export async function lowerClassClassification(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const orgId = await organisationId(actor);
  if (!orgId) return NO_ORG;
  const id = String(data.get("id") ?? "");
  const r = new FormReader(data);
  const classification = r.choice("classification", "Classification", SECURITY_CLASSES, { required: true });
  const reason = r.text("reason", "Why", { required: true, max: 2000 });
  if (r.failed) return { ok: false, errors: r.errors };
  return db.$transaction(async (tx): Promise<FormState> => {
    await tx.$queryRaw`SELECT id FROM "DocumentClass" WHERE id = ${id} FOR UPDATE`;
    const before = await tx.documentClass.findFirst({ where: { id, organisationId: orgId } });
    if (!before) return { ok: false, message: "That class no longer exists." };
    const faults = classClassificationFault(before.classification, classification ?? null, { viaSecondPerson: true });
    if (faults.length) return { ok: false, errors: { classification: faults.map(documentFaultText).join(" ") } };
    await tx.documentClass.update({ where: { id, organisationId: actor.organisationId }, data: { classification } });
    await writeAudit(tx, { actor: toAuditActor(actor), organisationId: orgId, entity: "DocumentClass", entityId: id, entityLabel: before.nameEn, reason: `Classification lowered: ${reason}` }, "UPDATE", diffFields({ classification: before.classification }, { classification }));
    revalidatePath(PATH);
    return { ok: true };
  });
}
