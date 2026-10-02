"use server";

import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import { diffFields, snapshotFields } from "@/lib/audit/diff";
import { writeAudit, type Tx } from "@/lib/audit/record";
import { blockFaults, configFaultText, distributionFaultsOf } from "@/lib/certificate/config";
import { BLOCK_KIND_WORDS, CONDITION_WORDS, OFFICE_RULE_WORDS } from "@/lib/certificate/labels";
import { blockOf, rowOf } from "@/lib/certificate/repo";
import { DISTRIBUTION_CONDITIONS, SIGNATURE_BLOCK_KINDS, SIGNATURE_OFFICE_RULES, type Block, type DistributionRow } from "@/lib/certificate/types";
import { db } from "@/lib/db";
import { exerciseOrg } from "@/lib/method/repo";
import { FormReader } from "@/lib/validate";

/**
 * A form's signature blocks and distribution list (6.14 increment 1, FR-CRT-001, 004, 006). Ships empty
 * (OD-5 A): the customer's printed order and recipients are configuration. Each write locks the template,
 * re-reads its rows, judges the row against the others and is audited with its before and after in the same
 * transaction; a removal asks for a reason. A certificate pins the form at its first signature, so nothing
 * here moves a certificate already signing.
 */

const NO_ORG: FormState = { ok: false, message: "No organisation is configured. Run npm run setup first." };
const PROVENANCE = ["STATED", "OBSERVED", "ASSUMED"] as const;
const triState = (r: FormReader, name: string, label: string) => {
  const v = r.choice(name, label, ["yes", "no"] as const);
  return v == null ? null : v === "yes";
};
const yes = (b: boolean | null) => (b == null ? "not decided" : b ? "yes" : "no");

async function onTemplate(templateId: string, fn: (tx: Tx, t: { id: string; organisationId: string; nameEn: string }) => Promise<FormState>): Promise<FormState> {
  const o = await exerciseOrg();
  if (!o) return NO_ORG;
  const res = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "DocumentTemplate" WHERE id = ${templateId} FOR UPDATE`;
    const t = await tx.documentTemplate.findFirst({ where: { id: templateId, organisationId: o.id }, select: { id: true, organisationId: true, nameEn: true } });
    if (!t) return { ok: false, message: "That template no longer exists." } as FormState;
    return fn(tx, t);
  });
  if (res.ok) {
    revalidatePath("/configuration/templates");
    revalidatePath(`/configuration/templates/${templateId}`);
  }
  return res;
}

const blockWords = (b: Block) => ({ order: b.blockOrder, label: b.labelEn, labelMalay: b.labelMs, signs: `${BLOCK_KIND_WORDS[b.blockKind].en}, by ${OFFICE_RULE_WORDS[b.officeRule].en.toLowerCase()}`, datesTheCertificate: b.datesCertificate ? "yes" : "no", delegateMaySign: yes(b.delegable), carriesAnAnswer: b.carriesDecision ? "yes" : "no", refusalRecorded: b.refusalAllowed ? "yes" : "no" });

export async function saveSignatureBlock(_prev: FormState, data: FormData): Promise<FormState> {
  const r = new FormReader(data);
  const templateId = r.text("templateId", "Template", { required: true });
  const id = r.optionalText("id");
  const v: Block = {
    blockOrder: r.int("blockOrder", "Place in the printed order", { min: 1, required: true }) ?? 0,
    blockKind: r.choice("blockKind", "What the block is for", SIGNATURE_BLOCK_KINDS, { required: true }) ?? "SUPPORTING",
    labelEn: r.text("labelEn", "Label", { required: true, max: 200 }),
    labelMs: r.optionalText("labelMs"),
    datesCertificate: r.bool("datesCertificate"),
    officeRule: r.choice("officeRule", "Who signs it", SIGNATURE_OFFICE_RULES, { required: true }) ?? "NAMED_OFFICE",
    officeCode: r.optionalText("officeCode"),
    delegable: triState(r, "delegable", "Whether a delegate may sign"),
    carriesDecision: r.bool("carriesDecision"),
    refusalAllowed: r.bool("refusalAllowed"),
  };
  const provenance = r.choice("provenance", "Where it came from", PROVENANCE, { required: true });
  const notes = r.text("notes", "Notes", { max: 2000 });
  if (v.officeRule !== "NAMED_OFFICE") v.officeCode = null;
  if (r.failed || !provenance) return { ok: false, errors: r.errors };
  return onTemplate(templateId, async (tx, t) => {
    const rows = await tx.formSignatureBlock.findMany({ where: { templateId: t.id } });
    const before = id ? rows.find((x) => x.id === id) : null;
    if (id && !before) return { ok: false, message: "That block is no longer on this form." };
    const offices = new Set((await tx.authorityRole.findMany({ where: { organisationId: t.organisationId, isCommittee: false }, select: { code: true } })).map((x) => x.code));
    const fs = blockFaults(v, rows.filter((x) => x.id !== id).map(blockOf), offices);
    if (fs.length) return { ok: false, message: configFaultText(fs) };
    const write = { ...v, provenance, notes };
    const row = before ? await tx.formSignatureBlock.update({ where: { id: before.id }, data: write }) : await tx.formSignatureBlock.create({ data: { organisationId: t.organisationId, templateId: t.id, ...write } });
    const changes = diffFields(before ? { ...blockWords(blockOf(before)), provenance: before.provenance } : null, { ...blockWords(v), provenance });
    if (changes.length) await writeAudit(tx, { organisationId: t.organisationId, entity: "FormSignatureBlock", entityId: row.id, entityLabel: `${t.nameEn} · ${v.labelEn}`, reason: String(data.get("reason") ?? "") }, before ? "UPDATE" : "CREATE", changes);
    return { ok: true };
  });
}

export async function removeSignatureBlock(_prev: FormState, data: FormData): Promise<FormState> {
  const templateId = String(data.get("templateId") ?? "");
  const id = String(data.get("id") ?? "");
  const reason = String(data.get("reason") ?? "").trim().slice(0, 2000);
  if (!reason) return { ok: false, errors: { reason: "Say why the block comes off the form." } };
  return onTemplate(templateId, async (tx, t) => {
    const row = await tx.formSignatureBlock.findFirst({ where: { id, templateId: t.id } });
    if (!row) return { ok: false, message: "That block is no longer on this form." };
    await tx.formSignatureBlock.delete({ where: { id: row.id } });
    await writeAudit(tx, { organisationId: t.organisationId, entity: "FormSignatureBlock", entityId: row.id, entityLabel: `${t.nameEn} · ${row.labelEn}`, reason }, "DELETE", snapshotFields(blockWords(blockOf(row))));
    return { ok: true };
  });
}

const rowWords = (d: DistributionRow) => ({ recipient: d.labelEn, recipientMalay: d.labelMs, mandatory: d.mandatory ? "yes" : "no", acknowledgementAsked: d.ackRequired ? "yes" : "no", sentWhen: CONDITION_WORDS[d.condition].en, theOriginal: d.isOriginal ? "yes" : "no", order: d.sortOrder });

export async function saveDistributionRow(_prev: FormState, data: FormData): Promise<FormState> {
  const r = new FormReader(data);
  const templateId = r.text("templateId", "Template", { required: true });
  const id = r.optionalText("id");
  const mandatory = triState(r, "mandatory", "Mandatory");
  const ack = triState(r, "ackRequired", "Acknowledgement asked for");
  const original = triState(r, "isOriginal", "Receives the original");
  const v = {
    recipientCode: r.text("recipientCode", "Code", { required: true, max: 60 }).trim(),
    labelEn: r.text("labelEn", "Recipient", { required: true, max: 200 }),
    labelMs: r.optionalText("labelMs"),
    condition: r.choice("condition", "Sent", DISTRIBUTION_CONDITIONS, { required: true }) ?? "NONE",
    sortOrder: r.int("sortOrder", "Order", { min: 0 }) ?? 0,
  };
  if (mandatory == null) r.reject("mandatory", "Say whether the copy is mandatory: there is no default.");
  if (ack == null) r.reject("ackRequired", "Say whether its acknowledgement is asked for.");
  if (original == null) r.reject("isOriginal", "Say whether this recipient receives the original.");
  const provenance = r.choice("provenance", "Where it came from", PROVENANCE, { required: true });
  const notes = r.text("notes", "Notes", { max: 2000 });
  if (r.failed || !provenance) return { ok: false, errors: r.errors };
  const row: DistributionRow = { ...v, mandatory: mandatory!, ackRequired: ack!, isOriginal: original! };
  return onTemplate(templateId, async (tx, t) => {
    const rows = await tx.formDistribution.findMany({ where: { templateId: t.id } });
    const before = id ? rows.find((x) => x.id === id) : null;
    if (id && !before) return { ok: false, message: "That recipient is no longer on this form." };
    const fs = distributionFaultsOf(row, rows.filter((x) => x.id !== id).map(rowOf));
    if (fs.length) return { ok: false, message: configFaultText(fs) };
    const write = { ...row, provenance, notes };
    const saved = before ? await tx.formDistribution.update({ where: { id: before.id }, data: write }) : await tx.formDistribution.create({ data: { organisationId: t.organisationId, templateId: t.id, ...write } });
    const changes = diffFields(before ? { ...rowWords(rowOf(before)), provenance: before.provenance } : null, { ...rowWords(row), provenance });
    if (changes.length) await writeAudit(tx, { organisationId: t.organisationId, entity: "FormDistribution", entityId: saved.id, entityLabel: `${t.nameEn} · ${row.labelEn}`, reason: String(data.get("reason") ?? "") }, before ? "UPDATE" : "CREATE", changes);
    return { ok: true };
  });
}

export async function removeDistributionRow(_prev: FormState, data: FormData): Promise<FormState> {
  const templateId = String(data.get("templateId") ?? "");
  const id = String(data.get("id") ?? "");
  const reason = String(data.get("reason") ?? "").trim().slice(0, 2000);
  if (!reason) return { ok: false, errors: { reason: "Say why the recipient comes off the list." } };
  return onTemplate(templateId, async (tx, t) => {
    const row = await tx.formDistribution.findFirst({ where: { id, templateId: t.id } });
    if (!row) return { ok: false, message: "That recipient is no longer on this form." };
    await tx.formDistribution.delete({ where: { id: row.id } });
    await writeAudit(tx, { organisationId: t.organisationId, entity: "FormDistribution", entityId: row.id, entityLabel: `${t.nameEn} · ${row.labelEn}`, reason }, "DELETE", snapshotFields(rowWords(rowOf(row))));
    return { ok: true };
  });
}
