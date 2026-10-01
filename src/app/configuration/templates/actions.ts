"use server";

import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import { diffFields } from "@/lib/audit/diff";
import { auditedCreate, writeAudit } from "@/lib/audit/record";
import { db } from "@/lib/db";
import { ORGANISATION_CODE } from "@/lib/org";
import { renderTemplate } from "@/lib/award/merge";
import { FormReader } from "@/lib/validate";

const PROVENANCE = ["STATED", "OBSERVED", "ASSUMED"] as const;
const PATH = "/configuration/templates";

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

export async function saveTemplate(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;

  const id = String(data.get("id") ?? "");
  const existing = await db.documentTemplate.findMany({
    where: { organisationId: orgId },
    select: { id: true, code: true },
  });
  const current = id ? existing.find((e) => e.id === id) : undefined;
  if (id && !current) return { ok: false, message: "That template no longer exists." };

  const r = new FormReader(data);
  // The code is set once and never edited: records elsewhere join on it. The edit
  // drawer does not offer it, so it is read from the stored record — the form has no
  // such field, and writing its absence would blank the thing everything points at.
  const code = current
    ? current.code
    : r.code("code", "Code", { taken: existing.map((e) => e.code) });

  const documentClassId = r.optionalText("documentClassId");
  if (documentClassId) {
    const cls = await db.documentClass.findFirst({
      where: { id: documentClassId, organisationId: orgId },
      select: { id: true },
    });
    if (!cls) r.reject("documentClassId", "That document class no longer exists.");
  }

  const v = {
    code,
    nameEn: r.text("nameEn", "Name", { required: true, max: 160 }),
    nameMs: r.optionalText("nameMs"),
    formCode: r.text("formCode", "Form code", { max: 60 }),
    revisionDate: r.date("revisionDate", "Revision date"),
    bilingual: r.bool("bilingual"),
    documentClassId,
    provenance: r.choice("provenance", "Provenance", PROVENANCE, { required: true }),
    notes: r.text("notes", "Notes", { max: 2000 }),
    sortOrder: r.int("sortOrder", "Order", { min: 0 }) ?? 0,
    // The body (ADR 0008): plain text with whitelisted merge fields. Empty is not configured.
    bodyMs: r.text("bodyMs", "Text (Malay)", { max: 40000 }) || null,
    bodyEn: r.text("bodyEn", "Text (English)", { max: 40000 }) || null,
    primaryLanguage: r.choice("primaryLanguage", "Issued first in", ["MS", "EN"] as const),
  };
  // Every merge field a body names must be one the portal fills: an unknown one is
  // refused here, where it can be put right, rather than at issue.
  for (const k of ["bodyMs", "bodyEn"] as const) {
    const unknown = v[k] ? renderTemplate(v[k]!, {}).unknown : [];
    if (unknown.length) r.reject(k, `The portal does not fill ${unknown.map((u) => `{{${u}}}`).join(", ")}. Use the merge fields listed below.`);
  }
  if (v.bodyMs && v.bodyEn && !v.primaryLanguage) r.reject("primaryLanguage", "With text in both languages, say which is issued first.");

  const parsed = r.finish(v);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  const ctx = {
    organisationId: orgId,
    entity: "DocumentTemplate",
    entityLabel: v.nameEn,
    reason: String(data.get("reason") ?? ""),
  };
  const write = { ...v, provenance: v.provenance! };

  if (!id) {
    const created = { ...write, bodyVersion: write.bodyMs || write.bodyEn ? 1 : 0 };
    await auditedCreate(ctx, created, (tx) =>
      tx.documentTemplate.create({ data: { organisationId: orgId, ...created } }),
    );
  } else {
    // The row is locked and re-read inside the write, so two saves never both take the
    // same next version: a changed body is a new version, which an issued document names.
    const gone = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "DocumentTemplate" WHERE id = ${id} FOR UPDATE`;
      const before = await tx.documentTemplate.findUnique({ where: { id } });
      if (!before) return true;
      const bodyChanged = (before.bodyMs ?? null) !== write.bodyMs || (before.bodyEn ?? null) !== write.bodyEn || (before.primaryLanguage ?? null) !== write.primaryLanguage;
      const versioned = { ...write, bodyVersion: bodyChanged ? before.bodyVersion + 1 : before.bodyVersion };
      await tx.documentTemplate.update({ where: { id }, data: versioned });
      const changes = diffFields(before, versioned);
      if (changes.length > 0) await writeAudit(tx, { ...ctx, entityId: id }, "UPDATE", changes);
      return false;
    });
    if (gone) return { ok: false, message: "That template no longer exists." };
  }

  revalidatePath(PATH);
  return { ok: true };
}
