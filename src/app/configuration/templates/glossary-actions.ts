"use server";

import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import { diffFields, snapshotFields } from "@/lib/audit/diff";
import { writeAudit, type Tx } from "@/lib/audit/record";
import { otherUsesOf, TEMPLATE_OTHER_USES } from "@/lib/certificate/config";
import { correctionFaults } from "@/lib/certificate/corrections";
import { certificateFaultWords } from "@/lib/certificate/fault-text";
import { aliasesInUseText, aliasesKeeping, removedAliases, termSaveFaults, type Term } from "@/lib/certificate/terms";
import { aliasInUse } from "@/lib/certificate/term-use";
import type { Finding } from "@/lib/certificate/types";
import { db } from "@/lib/db";
import { exerciseOrg } from "@/lib/method/repo";
import { fieldsNamed } from "@/lib/templates/merge";
import { splitValues } from "@/lib/ui/select-logic";
import { FormReader } from "@/lib/validate";
import { requireStaff, toAuditActor } from "@/app/_auth/actor";

/**
 * Typing corrections (FR-CRT-010) and terms with their aliases (FR-CRT-011), 6.14 increment 2. Both ship empty:
 * correcting a controlled form is the customer's document-control decision (§13.10), and the glossary is theirs.
 *
 * Every write runs in one transaction that first takes the organisation's row FOR UPDATE, as the other configuration
 * acts do (so two saves of the glossary or the corrections are judged one after the other against each other's
 * rows), then, for a correction, every form it names or named FOR UPDATE in
 * id order (so a certificate pinning one of those forms, which reads it FOR SHARE, sees the corrections before or
 * after the change, never half of it). Each is audited with its before and after in the same transaction; a
 * removal asks for a reason. Nothing here moves a form's version (the code and revision stay the form's, FR-CRT-010)
 * or reaches a certificate already pinned: the pin froze the corrections and terms it was signed under.
 */

const NO_ORG: FormState = { ok: false, message: "No organisation is configured. Run npm run setup first." };
const PROVENANCE = ["STATED", "OBSERVED", "ASSUMED"] as const;
const PATH = "/configuration/templates";
const USE_COUNTS = Object.fromEntries(Object.keys(TEMPLATE_OTHER_USES).map((k) => [k, true])) as Record<keyof typeof TEMPLATE_OTHER_USES, true>;
const words = (fs: readonly Finding[]) => fs.map((f) => certificateFaultWords(f).en).join(" ");

async function inGlossary(fn: (tx: Tx, orgId: string) => Promise<FormState>): Promise<FormState> {
  const o = await exerciseOrg();
  if (!o) return NO_ORG;
  const res = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Organisation" WHERE id = ${o.id} FOR UPDATE`;
    return fn(tx, o.id);
  });
  if (res.ok) revalidatePath(PATH);
  return res;
}

// ------------------------------------------------------------------ corrections

export async function saveCorrection(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const r = new FormReader(data);
  const id = r.optionalText("id");
  const fromText = r.text("fromText", "As misprinted", { required: true, max: 200 });
  const toText = r.text("toText", "As it should read", { required: true, max: 200 });
  const templateIds = [...new Set(splitValues(data.get("templateIds")))];
  const provenance = r.choice("provenance", "Where it came from", PROVENANCE, { required: true });
  const notes = r.text("notes", "Notes", { max: 2000 });
  if (r.failed || !provenance) return { ok: false, errors: r.errors };
  return inGlossary(async (tx, orgId) => {
    const all = await tx.textCorrection.findMany({ where: { organisationId: orgId }, include: { forms: { select: { templateId: true } } } });
    const before = id ? all.find((c) => c.id === id) : null;
    if (id && !before) return { ok: false, message: "That correction no longer exists." };
    // Every form it names, or named, is locked before anything is read from it.
    const touched = [...new Set([...templateIds, ...(before?.forms.map((f) => f.templateId) ?? [])])].sort();
    for (const t of touched) await tx.$queryRaw`SELECT id FROM "DocumentTemplate" WHERE id = ${t} FOR UPDATE`;
    const forms = await tx.documentTemplate.findMany({ where: { id: { in: templateIds }, organisationId: orgId }, select: { id: true, nameEn: true, _count: { select: USE_COUNTS } } });
    if (forms.length !== templateIds.length) return { ok: false, errors: { templateIds: "One of those forms no longer exists." } };
    // A correction applies to certificate forms only: another module's document renders its own text.
    const shared = forms.filter((f) => otherUsesOf(f._count as unknown as Record<string, number>).length > 0);
    if (shared.length) return { ok: false, errors: { templateIds: `${shared.map((f) => f.nameEn).join(", ")} ${shared.length === 1 ? "prints" : "print"} another module's documents, which render their own text: a correction applies to certificate forms only.` } };
    const fs = correctionFaults({ fromText, toText, templateIds }, all.filter((c) => c.id !== id).map((c) => ({ fromText: c.fromText, toText: c.toText, templateIds: c.forms.map((f) => f.templateId) })));
    if (fs.length) return { ok: false, message: words(fs) };
    const row = before
      ? await tx.textCorrection.update({ where: { id: before.id }, data: { fromText, toText, provenance, notes } })
      : await tx.textCorrection.create({ data: { organisationId: orgId, fromText, toText, provenance, notes } });
    const gone = (before?.forms.map((f) => f.templateId) ?? []).filter((t) => !templateIds.includes(t));
    const added = templateIds.filter((t) => !before?.forms.some((f) => f.templateId === t));
    if (gone.length) await tx.textCorrectionForm.deleteMany({ where: { correctionId: row.id, templateId: { in: gone } } });
    for (const t of added) await tx.textCorrectionForm.create({ data: { organisationId: orgId, correctionId: row.id, templateId: t } });
    const names = async (ids: readonly string[]) => (await tx.documentTemplate.findMany({ where: { id: { in: [...ids] } }, select: { nameEn: true }, orderBy: { nameEn: "asc" } })).map((t) => t.nameEn).join(", ");
    const changes = diffFields(before ? { asMisprinted: before.fromText, asItShouldRead: before.toText, appliesTo: await names(before.forms.map((f) => f.templateId)), provenance: before.provenance } : null, { asMisprinted: fromText, asItShouldRead: toText, appliesTo: await names(templateIds), provenance });
    if (changes.length) await writeAudit(tx, { actor: toAuditActor(actor), organisationId: orgId, entity: "TextCorrection", entityId: row.id, entityLabel: `Typing correction: ${fromText}`, reason: String(data.get("reason") ?? "").trim().slice(0, 2000) }, before ? "UPDATE" : "CREATE", changes);
    return { ok: true };
  });
}

export async function removeCorrection(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const id = String(data.get("id") ?? "");
  const reason = String(data.get("reason") ?? "").trim().slice(0, 2000);
  if (!reason) return { ok: false, errors: { reason: "Say why the correction is withdrawn." } };
  return inGlossary(async (tx, orgId) => {
    const row = await tx.textCorrection.findFirst({ where: { id, organisationId: orgId }, include: { forms: { include: { template: { select: { nameEn: true } } } } } });
    if (!row) return { ok: false, message: "That correction no longer exists." };
    for (const t of row.forms.map((f) => f.templateId).sort()) await tx.$queryRaw`SELECT id FROM "DocumentTemplate" WHERE id = ${t} FOR UPDATE`;
    await tx.textCorrection.delete({ where: { id: row.id } });
    await writeAudit(tx, { actor: toAuditActor(actor), organisationId: orgId, entity: "TextCorrection", entityId: row.id, entityLabel: `Typing correction: ${row.fromText}`, reason }, "DELETE", snapshotFields({ asMisprinted: row.fromText, asItShouldRead: row.toText, appliesTo: row.forms.map((f) => f.template.nameEn).sort().join(", ") }));
    return { ok: true };
  });
}

// ------------------------------------------------------------------ terms

const termWords = (t: Term) => ({ wordingEnglish: t.canonicalEn, wordingMalay: t.canonicalMs, aliases: t.aliases.length ? t.aliases.join("; ") : null });

export async function saveTerm(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const r = new FormReader(data);
  const id = r.optionalText("id");
  const codeIn = r.optionalText("code");
  const canonicalEn = r.optionalText("canonicalEn");
  const canonicalMs = r.optionalText("canonicalMs");
  const aliasText = String(data.get("aliases") ?? "");
  const aliases = aliasText.split(/\r?\n/).map((a) => a.trim()).filter((a) => a !== "");
  if (canonicalEn && canonicalEn.length > 200) r.reject("canonicalEn", "The wording must be 200 characters or fewer.");
  if (canonicalMs && canonicalMs.length > 200) r.reject("canonicalMs", "The wording must be 200 characters or fewer.");
  if (aliases.some((a) => a.length > 200)) r.reject("aliases", "Each alias must be 200 characters or fewer.");
  const provenance = r.choice("provenance", "Where it came from", PROVENANCE, { required: true });
  const notes = r.text("notes", "Notes", { max: 2000 });
  if (r.failed || !provenance) return { ok: false, errors: r.errors };
  return inGlossary(async (tx, orgId) => {
    const all = await tx.term.findMany({ where: { organisationId: orgId }, include: { aliases: { orderBy: { alias: "asc" } } } });
    const before = id ? all.find((t) => t.id === id) : null;
    if (id && !before) return { ok: false, message: "That term no longer exists." };
    // The code is set once: a form's text cites the term by it.
    const code = before ? before.code : (codeIn ?? "");
    // BD-614-33 as ruled: a replaced wording stays as an alias of the same term (refused below if another term has it).
    const term: Term = { code, canonicalEn, canonicalMs, aliases: aliasesKeeping(before ? { canonicalEn: before.canonicalEn, canonicalMs: before.canonicalMs } : null, { code, canonicalEn, canonicalMs, aliases }) };
    const others = all.filter((t) => t.id !== id).map((t): Term => ({ code: t.code, canonicalEn: t.canonicalEn, canonicalMs: t.canonicalMs, aliases: t.aliases.map((a) => a.alias) }));
    const fs = termSaveFaults(term, others);
    if (fs.length) return { ok: false, message: words(fs) };
    // BD-614-33 as ruled: removing an alias an issued certificate's frozen text still says warns, and asks for a reason.
    // Residual S-2: capped as removeTerm caps it; a wording promoted to the canonical one is not removed.
    const reason = String(data.get("reason") ?? "").trim().slice(0, 2000);
    const removed = removedAliases(before?.aliases.map((a) => a.alias) ?? [], term);
    if (removed.length && !reason) {
      // Residual consider: matched in the database by whole words, only the numbers read, capped with "and N more".
      const inUse: Awaited<ReturnType<typeof aliasInUse>>[] = [];
      for (const a of removed) {
        const u = await aliasInUse(tx, orgId, a);
        if (u.total > 0) inUse.push(u);
      }
      if (inUse.length) return { ok: false, errors: { reason: aliasesInUseText(inUse) } };
    }
    const row = before
      ? await tx.term.update({ where: { id: before.id }, data: { canonicalEn, canonicalMs, provenance, notes } })
      : await tx.term.create({ data: { organisationId: orgId, code, canonicalEn, canonicalMs, provenance, notes } });
    const had = before?.aliases.map((a) => a.alias) ?? [];
    const gone = had.filter((a) => !term.aliases.includes(a));
    if (gone.length) await tx.termAlias.deleteMany({ where: { termId: row.id, alias: { in: gone } } });
    for (const a of term.aliases.filter((x) => !had.includes(x))) await tx.termAlias.create({ data: { organisationId: orgId, termId: row.id, alias: a } });
    const prior: Term | null = before ? { code: before.code, canonicalEn: before.canonicalEn, canonicalMs: before.canonicalMs, aliases: had } : null;
    const changes = diffFields(prior ? { ...termWords(prior), provenance: before!.provenance } : null, { ...termWords(term), provenance });
    if (changes.length) await writeAudit(tx, { actor: toAuditActor(actor), organisationId: orgId, entity: "Term", entityId: row.id, entityLabel: `Term: ${canonicalEn ?? canonicalMs}`, reason }, before ? "UPDATE" : "CREATE", changes);
    return { ok: true };
  });
}

export async function removeTerm(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const id = String(data.get("id") ?? "");
  const reason = String(data.get("reason") ?? "").trim().slice(0, 2000);
  if (!reason) return { ok: false, errors: { reason: "Say why the term comes out of the glossary." } };
  return inGlossary(async (tx, orgId) => {
    const row = await tx.term.findFirst({ where: { id, organisationId: orgId }, include: { aliases: { orderBy: { alias: "asc" } } } });
    if (!row) return { ok: false, message: "That term no longer exists." };
    // A form whose text cites it would print nothing there: refused while one does, naming them (as a template's save
    // refuses a term not in the glossary).
    const citing = (await tx.documentTemplate.findMany({ where: { organisationId: orgId, OR: [{ bodyEn: { contains: `term:${row.code}` } }, { bodyMs: { contains: `term:${row.code}` } }] }, select: { nameEn: true, bodyEn: true, bodyMs: true } })).filter((t) => [...fieldsNamed(t.bodyEn), ...fieldsNamed(t.bodyMs)].includes(`term:${row.code}`));
    if (citing.length) return { ok: false, message: `The text of ${citing.map((t) => t.nameEn).join(", ")} cites this term. Take it out of the text under Templates first.` };
    await tx.term.delete({ where: { id: row.id } });
    await writeAudit(tx, { actor: toAuditActor(actor), organisationId: orgId, entity: "Term", entityId: row.id, entityLabel: `Term: ${row.canonicalEn ?? row.canonicalMs}`, reason }, "DELETE", snapshotFields(termWords({ code: row.code, canonicalEn: row.canonicalEn, canonicalMs: row.canonicalMs, aliases: row.aliases.map((a) => a.alias) })));
    return { ok: true };
  });
}
