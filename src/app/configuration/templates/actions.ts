"use server";

import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import { diffFields } from "@/lib/audit/diff";
import { writeAudit } from "@/lib/audit/record";
import { db } from "@/lib/db";
import { renderTemplate } from "@/lib/award/merge";
import { fieldsNamed } from "@/lib/templates/merge";
import { templateFieldRefusals } from "@/lib/tender-docs/fields";
import { WINDOW_FIELD_KEYS } from "@/lib/window/fields";
import { EVALUATION_FIELD_KEYS } from "@/lib/evaluation/instrument";
import { ANY_CERTIFICATE_FIELD } from "@/lib/certificate/fields";
import { isTermField, termCodeOf } from "@/lib/certificate/terms";
import { FormReader } from "@/lib/validate";
import { requireStaff, toAuditActor } from "@/app/_auth/actor";
import type { OrgScope } from "@/lib/org-scope";

const PROVENANCE = ["STATED", "OBSERVED", "ASSUMED"] as const;
const PATH = "/configuration/templates";

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

export async function saveTemplate(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const orgId = await organisationId(actor);
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
  // A template serves an award's letters or a tender pack's parts (6.4): a field neither
  // fills is refused; each instrument re-checks its own whitelist when it is issued or frozen.
  // A configured clause may be cited as {{clause:code}} (FR-DOC-011, 6.4 increment 2).
  const clauseCodes = (await db.clauseText.findMany({ where: { organisationId: orgId }, select: { code: true } })).map((c) => c.code);
  // 6.14 increment 2 (FR-CRT-011): a term in the glossary may be cited as {{term:code}}; one not in it is refused, judged
  // inside the write's transaction under the organisation's lock (code review S-3), as removeTerm judges a citation.
  for (const k of ["bodyMs", "bodyEn"] as const) {
    const awardUnknown = new Set(v[k] ? renderTemplate(v[k]!, {}).unknown : []);
    // 6.5: the window's instruments (notice, letter of invitation, addendum) fill their own fields;
    // 6.8: so do the evaluation report and the Kertas Cadangan (each re-checks its own whitelist when frozen).
    // 6.14: a certificate's form fills the certificate's own fields (each certificate re-checks its kind's list when pinned and issued).
    const unknown = (v[k] ? templateFieldRefusals(fieldsNamed(v[k]), (f) => !awardUnknown.has(f) || WINDOW_FIELD_KEYS.has(f), clauseCodes) : []).filter((u) => !EVALUATION_FIELD_KEYS.has(u)).filter((u) => !ANY_CERTIFICATE_FIELD.has(u)).filter((u) => !isTermField(u));
    if (unknown.length) r.reject(k, `The portal does not fill ${unknown.map((u) => `{{${u}}}`).join(", ")}. Use the merge fields listed below.`);
  }
  if (v.bodyMs && v.bodyEn && !v.primaryLanguage) r.reject("primaryLanguage", "With text in both languages, say which is issued first.");

  const parsed = r.finish(v);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  const ctx = {
    actor: toAuditActor(actor),
    organisationId: orgId,
    entity: "DocumentTemplate",
    entityLabel: v.nameEn,
    reason: String(data.get("reason") ?? ""),
  };
  const write = { ...v, provenance: v.provenance! };

  // One transaction, in the configuration's lock order: the organisation's row, then the form (code review S-3). The
  // terms the text cites are read under the organisation's lock, which removeTerm also takes, so a term cannot be
  // removed between this check and this write.
  const res = await db.$transaction(async (tx): Promise<FormState> => {
    await tx.$queryRaw`SELECT id FROM "Organisation" WHERE id = ${orgId} FOR UPDATE`;
    const termCodes = new Set((await tx.term.findMany({ where: { organisationId: orgId }, select: { code: true } })).map((t) => t.code));
    const errors: Record<string, string> = {};
    for (const k of ["bodyMs", "bodyEn"] as const) {
      const missing = [...new Set(fieldsNamed(write[k]).filter(isTermField).map(termCodeOf))].filter((c) => !termCodes.has(c));
      if (missing.length) errors[k] = `The portal does not fill ${missing.map((c) => `{{term:${c}}}`).join(", ")}: no such term is in the glossary. Add it on the Terms tab, or use the merge fields listed below.`;
    }
    if (Object.keys(errors).length) return { ok: false, errors };
    if (!id) {
      const created = { ...write, bodyVersion: write.bodyMs || write.bodyEn ? 1 : 0 };
      const row = await tx.documentTemplate.create({ data: { organisationId: orgId, ...created } });
      await writeAudit(tx, { ...ctx, entityId: row.id }, "CREATE", diffFields(null, created));
      return { ok: true };
    }
    // The row is locked and re-read inside the write, so two saves never both take the
    // same next version: a changed body is a new version, which an issued document names.
    await tx.$queryRaw`SELECT id FROM "DocumentTemplate" WHERE id = ${id} FOR UPDATE`;
    const before = await tx.documentTemplate.findUnique({ where: { id } });
    if (!before) return { ok: false, message: "That template no longer exists." };
    const bodyChanged = (before.bodyMs ?? null) !== write.bodyMs || (before.bodyEn ?? null) !== write.bodyEn || (before.primaryLanguage ?? null) !== write.primaryLanguage;
    const versioned = { ...write, bodyVersion: bodyChanged ? before.bodyVersion + 1 : before.bodyVersion };
    await tx.documentTemplate.update({ where: { id }, data: versioned });
    const changes = diffFields(before, versioned);
    if (changes.length > 0) await writeAudit(tx, { ...ctx, entityId: id }, "UPDATE", changes);
    return { ok: true };
  });
  if (!res.ok) return res;

  revalidatePath(PATH);
  return { ok: true };
}
