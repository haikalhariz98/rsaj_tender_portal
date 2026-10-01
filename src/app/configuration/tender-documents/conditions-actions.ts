"use server";

import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import { diffFields } from "@/lib/audit/diff";
import { writeAudit, type Tx } from "@/lib/audit/record";
import { db } from "@/lib/db";
import { storedDay } from "@/lib/dates";
import { ORGANISATION_CODE } from "@/lib/org";
import { clauseConfigFaults, nextBodyVersion } from "@/lib/tender-docs/clauses";
import { clauseConfigFaultText } from "@/lib/tender-docs/conditions-labels";
import { BODY_CONFIG_FAULT_TEXT, bodyConfigFaults } from "@/lib/tender-docs/config-conditions";
import { NOT_SET, yesNoNotSet } from "@/lib/tender-docs/labels";
import { FormReader } from "@/lib/validate";

/**
 * Configuration › Tender documents, increment 2: the registration bodies an exercise's
 * eligibility is drawn from (FR-DOC-005) and the clauses agreements carry (FR-DOC-011).
 * Nothing ships. Each write locks the organisation (a create) or the row, re-reads it, runs
 * the lib's check and writes with its before/after audit row in words, in one transaction.
 * A clause's text version rises when its words change, as a template's does; a frozen pack
 * keeps the version it was frozen with.
 */

const PROVENANCE = ["STATED", "OBSERVED", "ASSUMED"] as const;
const PROVENANCE_WORDS: Record<(typeof PROVENANCE)[number], string> = { STATED: "Stated", OBSERVED: "Observed", ASSUMED: "Assumed" };
const PATH = "/configuration/tender-documents";
const NO_ORG: FormState = { ok: false, message: "No organisation is configured. Run npm run setup before adding records." };
const GONE: FormState = { ok: false, message: "That record no longer exists. Reload the page." };
const TRI = ["yes", "no", "unset"] as const;
const tri = (v: string | null): boolean | null => (v === "yes" ? true : v === "no" ? false : null);

async function organisation() {
  return db.organisation.findUnique({ where: { code: ORGANISATION_CODE }, select: { id: true } });
}
const lockOrganisation = (tx: Tx, id: string) => tx.$queryRaw`SELECT id FROM "Organisation" WHERE id = ${id} FOR UPDATE`;
function done(): FormState {
  revalidatePath(PATH);
  revalidatePath("/sourcing");
  return { ok: true };
}

// ------------------------------------------------------------------ registration bodies

const bodyWords = (b: { code: string; labelEn: string; labelMs: string | null; qualifierLabelEn: string | null; governingSource: string; provenance: string; retiredOn?: Date | null }) => ({
  code: b.code,
  name: b.labelEn,
  nameInMalay: b.labelMs,
  statedWithIt: b.qualifierLabelEn ?? "Nothing",
  governingSource: b.governingSource || null,
  whereItComesFrom: PROVENANCE_WORDS[b.provenance as (typeof PROVENANCE)[number]] ?? NOT_SET,
  retiredOn: b.retiredOn ? storedDay(b.retiredOn) : null,
});

/// Add or change a registration body.
export async function saveRegistrationBody(_prev: FormState, data: FormData): Promise<FormState> {
  const org = await organisation();
  if (!org) return NO_ORG;
  const id = String(data.get("id") ?? "").trim() || undefined;
  const r = new FormReader(data);
  const v = {
    code: r.text("code", "Code", { required: true, max: 60 }),
    labelEn: r.text("labelEn", "Name", { required: true, max: 400 }),
    labelMs: r.optionalText("labelMs"),
    qualifierLabelEn: r.optionalText("qualifierLabelEn"),
    sortOrder: r.int("sortOrder", "Order", { min: 0 }) ?? 0,
    governingSource: r.text("governingSource", "Source", { max: 240 }),
    provenance: r.choice("provenance", "Where it comes from", PROVENANCE, { required: true }),
    notes: r.text("notes", "Notes", { max: 2000 }),
  };
  if (r.failed || !v.provenance) return { ok: false, errors: r.errors };
  const reason = String(data.get("reason") ?? "");
  return db.$transaction(async (tx): Promise<FormState> => {
    await lockOrganisation(tx, org.id);
    const others = await tx.registrationBody.findMany({ where: { organisationId: org.id }, select: { id: true, code: true } });
    const before = id ? await tx.registrationBody.findFirst({ where: { id, organisationId: org.id } }) : null;
    if (id && !before) return GONE;
    // The code is a key: it does not change once saved.
    const row = { ...v, code: before?.code ?? v.code, provenance: v.provenance! };
    const faults = bodyConfigFaults({ ...row, id }, others);
    if (faults.length) return { ok: false, errors: Object.fromEntries(faults.map((f) => [String(f.data?.field), BODY_CONFIG_FAULT_TEXT[f.code]])) };
    if (!before) {
      const created = await tx.registrationBody.create({ data: { organisationId: org.id, ...row } });
      await writeAudit(tx, { organisationId: org.id, entity: "RegistrationBody", entityId: created.id, entityLabel: `Registration body · ${row.labelEn}`, reason }, "CREATE", diffFields(null, bodyWords(created)));
    } else {
      const after = await tx.registrationBody.update({ where: { id: before.id }, data: row });
      const changes = diffFields(bodyWords(before), bodyWords(after));
      if (changes.length) await writeAudit(tx, { organisationId: org.id, entity: "RegistrationBody", entityId: before.id, entityLabel: `Registration body · ${row.labelEn}`, reason }, "UPDATE", changes);
    }
    return done();
  });
}

/// Retire a body from a day (an exercise cannot add it from then; one that requires it is told at submission), with the reason.
export async function retireRegistrationBody(_prev: FormState, data: FormData): Promise<FormState> {
  return setRetired("registrationBody", data);
}
export async function restoreRegistrationBody(_prev: FormState, data: FormData): Promise<FormState> {
  return setRetired("registrationBody", data, true);
}

// ------------------------------------------------------------------ clauses

const clauseWords = (c: { code: string; titleEn: string; titleMs: string | null; bodyVersion: number; mandatoryInAgreements: boolean | null; governingSource: string; provenance: string; retiredOn?: Date | null }) => ({
  code: c.code,
  title: c.titleEn,
  titleInMalay: c.titleMs,
  textVersion: c.bodyVersion,
  everyAgreementCarriesIt: yesNoNotSet(c.mandatoryInAgreements),
  governingSource: c.governingSource || null,
  whereItComesFrom: PROVENANCE_WORDS[c.provenance as (typeof PROVENANCE)[number]] ?? NOT_SET,
  retiredOn: c.retiredOn ? storedDay(c.retiredOn) : null,
});

/// Add or change a clause. Its words are literal (no merge field); a change to them raises its text version.
export async function saveClause(_prev: FormState, data: FormData): Promise<FormState> {
  const org = await organisation();
  if (!org) return NO_ORG;
  const id = String(data.get("id") ?? "").trim() || undefined;
  const r = new FormReader(data);
  const v = {
    code: r.text("code", "Code", { required: true, max: 60 }),
    titleEn: r.text("titleEn", "Title", { required: true, max: 400 }),
    titleMs: r.optionalText("titleMs"),
    bodyEn: r.text("bodyEn", "Text (English)", { required: true, max: 40000 }),
    bodyMs: r.text("bodyMs", "Text (Malay)", { max: 40000 }) || null,
    mandatoryInAgreements: tri(r.choice("mandatoryInAgreements", "Every agreement carries it", TRI, { required: true })),
    sortOrder: r.int("sortOrder", "Order", { min: 0 }) ?? 0,
    governingSource: r.text("governingSource", "Source", { max: 240 }),
    provenance: r.choice("provenance", "Where it comes from", PROVENANCE, { required: true }),
    notes: r.text("notes", "Notes", { max: 2000 }),
  };
  if (r.failed) return { ok: false, errors: r.errors };
  const reason = String(data.get("reason") ?? "");
  return db.$transaction(async (tx): Promise<FormState> => {
    await lockOrganisation(tx, org.id);
    const others = await tx.clauseText.findMany({ where: { organisationId: org.id }, select: { id: true, code: true } });
    const before = id ? await tx.clauseText.findFirst({ where: { id, organisationId: org.id } }) : null;
    if (id && !before) return GONE;
    const row = { ...v, code: before?.code ?? v.code, provenance: v.provenance! };
    const faults = clauseConfigFaults({ ...row, id }, others);
    if (faults.length) return { ok: false, errors: Object.fromEntries(faults.map((f) => [String(f.data?.field), clauseConfigFaultText(f)])) };
    const bodyVersion = nextBodyVersion(before, row);
    if (!before) {
      const created = await tx.clauseText.create({ data: { organisationId: org.id, ...row, bodyVersion } });
      await writeAudit(tx, { organisationId: org.id, entity: "ClauseText", entityId: created.id, entityLabel: `Clause · ${row.titleEn}`, reason }, "CREATE", diffFields(null, clauseWords(created)));
    } else {
      const after = await tx.clauseText.update({ where: { id: before.id }, data: { ...row, bodyVersion } });
      const changes = diffFields(clauseWords(before), { ...clauseWords(after), ...(bodyVersion !== before.bodyVersion ? { textChanged: "yes" } : {}) });
      if (changes.length) await writeAudit(tx, { organisationId: org.id, entity: "ClauseText", entityId: before.id, entityLabel: `Clause · ${row.titleEn}`, reason }, "UPDATE", changes);
    }
    return done();
  });
}

export async function retireClause(_prev: FormState, data: FormData): Promise<FormState> {
  return setRetired("clauseText", data);
}
export async function restoreClause(_prev: FormState, data: FormData): Promise<FormState> {
  return setRetired("clauseText", data, true);
}

// ------------------------------------------------------------------ retiring

async function setRetired(model: "registrationBody" | "clauseText", data: FormData, restore = false): Promise<FormState> {
  const org = await organisation();
  if (!org) return NO_ORG;
  const id = String(data.get("id") ?? "");
  const r = new FormReader(data);
  const on = restore ? null : r.date("retiredOn", "Retired from", { required: true });
  const reason = r.text("reason", "Reason", { required: true, max: 2000 });
  if (r.failed || (!restore && !on)) return { ok: false, errors: r.errors };
  const entity = model === "registrationBody" ? "RegistrationBody" : "ClauseText";
  return db.$transaction(async (tx): Promise<FormState> => {
    if (model === "registrationBody") await tx.$queryRaw`SELECT id FROM "RegistrationBody" WHERE id = ${id} FOR UPDATE`;
    else await tx.$queryRaw`SELECT id FROM "ClauseText" WHERE id = ${id} FOR UPDATE`;
    const before =
      model === "registrationBody"
        ? await tx.registrationBody.findFirst({ where: { id, organisationId: org.id }, select: { labelEn: true, retiredOn: true } }).then((b) => (b ? { label: `Registration body · ${b.labelEn}`, retiredOn: b.retiredOn } : null))
        : await tx.clauseText.findFirst({ where: { id, organisationId: org.id }, select: { titleEn: true, retiredOn: true } }).then((c) => (c ? { label: `Clause · ${c.titleEn}`, retiredOn: c.retiredOn } : null));
    if (!before) return GONE;
    if (model === "registrationBody") await tx.registrationBody.update({ where: { id }, data: { retiredOn: on } });
    else await tx.clauseText.update({ where: { id }, data: { retiredOn: on } });
    await writeAudit(tx, { organisationId: org.id, entity, entityId: id, entityLabel: before.label, reason }, "UPDATE", diffFields({ retiredOn: before.retiredOn ? storedDay(before.retiredOn) : null }, { retiredOn: on ? storedDay(on) : null }));
    return done();
  });
}
