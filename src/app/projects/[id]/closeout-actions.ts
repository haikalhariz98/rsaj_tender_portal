"use server";

import type { FormState } from "@/components/record-editor";
import type { Prisma } from "@/generated/prisma/client";
import { diffFields } from "@/lib/audit/diff";
import { writeAudit } from "@/lib/audit/record";
import { toSecond } from "@/lib/bids/lateness";
import { cpcLineFaults, cpcRaiseFaults, dlpOf } from "@/lib/closeout/completion";
import { defectActFaults, defectState, reportDefectFaults, type DefectAct } from "@/lib/closeout/defects";
import { closeoutRefusal, SECURITY_FORM_WORDS, SECURITY_KIND_WORDS } from "@/lib/closeout/labels";
import { cmgdIssuedOn, defectFactsOf, dlpOfRow, liveLadWindows, loadCloseout, openLineCount, releaseEventsOf } from "@/lib/closeout/load";
import { cmgdRaiseFaults, cmgdSnapshotOf } from "@/lib/closeout/making-good";
import { beforeCertificateFault, returnTriggerOf, securityReturnFaults, type SecurityReturnInput } from "@/lib/closeout/release";
import { scheduleRaiseFaults } from "@/lib/closeout/schedule";
import { advanceRecoupedOf, retentionOf } from "@/lib/closeout/view";
import type { Finding } from "@/lib/closeout/types";
import { refusalText } from "@/lib/certificate/fault-text";
import { noFormFault } from "@/lib/certificate/form-needs";
import type { ComputedSnapshot, FigureLine } from "@/lib/certificate/snapshot";
import type { CertificateKind } from "@/lib/certificate/types";
import { openCertificate } from "@/lib/certificate/write";
import { actStatusFault, type ContractAct } from "@/lib/contract/act-status";
import { withLockedContract } from "@/lib/contract/repo";
import type { ContractStatus } from "@/lib/contract/types";
import { dayPlus, dayToDate, storedDay } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { actCtx, type ActCtx, ActRefusal, afterAct, fieldError, NO_ZONE_STATE, recordedFor, tableRefusal, thrownState } from "@/lib/matter/act";
import { formatMoney, senFromDecimal } from "@/lib/money";
import { baselineOn, loadPayment } from "@/lib/payment/load";
import { capacityText } from "@/lib/supervision/authority";
import { FormReader } from "@/lib/validate";
import { toAuditActor, staffForAct } from "@/app/_auth/actor";
import { beginAct } from "@/app/_auth/act";
import type { AuditActor } from "@/lib/auth/types";
import type { OrgScope } from "@/lib/org-scope";

/**
 * Practical completion, its defect lines, the defects liability period, the Schedule of Defects, the certificate of making good defects and the
 * return of securities (Phase 2 close-out stage B; plan closeout-plan.md §4.2–4.5; ADR 0047). Every act reads the server's clock once on entry
 * (to the second), runs in `inContract` (the contract's chain locked in the canonical order, its family's row of the act × status table asked,
 * CANCELLED first, an unset time zone refused), locks its rows after the contract (the certificate, then the domain row, then the defect lines by
 * ascending id, then the security), re-reads them on the locked transaction, runs the pure rule again, writes, and audits before and after in the
 * same transaction. A refusal throws, so nothing is half-written. The certificates raise as drafts through the 6.14 engine and issue through
 * `KIND_ISSUE_HOOK`; a line's state is only ever its events (ADR 0047 D1).
 *
 * Who may act (ADR 0042 D2): the S.O. raises the certificates; the S.O. or a representative whose letter covers site observation records a
 * defect line and what happened to it; the S.O. or the Principal Representative returns a security, as for a retention release.
 */

async function inContract(scope: OrgScope, actor: AuditActor, id: string, now: Date, family: ContractAct, fn: (c: ActCtx) => Promise<FormState>): Promise<FormState> {
  let result: FormState | null;
  try {
    result = await withLockedContract(scope.organisationId, id, async (tx, l) => {
      const refused = actStatusFault(family, l.contract.status as ContractStatus);
      if (refused) return tableRefusal(refused);
      const c = actCtx(tx, l, now, actor);
      return c ? fn(c) : NO_ZONE_STATE;
    });
  } catch (e) {
    return thrownState(e);
  }
  return afterAct(id, result);
}

const idOf = (data: FormData) => String(data.get("id") ?? "");
const refuse = (lead: string, fs: readonly Finding[]): never => {
  throw new ActRefusal({ ok: false, message: closeoutRefusal(lead, fs) });
};
const blocks = (fs: readonly Finding[]) => fs.filter((f) => f.level === "block");
const warnings = (fs: readonly Finding[]) => fs.filter((f) => f.level === "warn");
const audit = (c: ActCtx, entity: string, id: string, label: string, action: "CREATE" | "UPDATE" | "DELETE", changes: ReturnType<typeof diffFields>, reason = "") =>
  action === "UPDATE" && changes.length === 0 ? Promise.resolve() : writeAudit(c.tx, { actor: c.actor, organisationId: c.l.org.id, entity, entityId: id, entityLabel: label, reason }, action, changes);
const json = (v: unknown) => v as Prisma.InputJsonValue;

/// The form and routing sheet the kind prints on: refused where no form is set (TEMPLATE_NOT_SET, naming where it is chosen).
async function formOf(c: ActCtx, kind: CertificateKind): Promise<{ templateId: string; routingTypeId: string | null }> {
  const s = await c.tx.certificateKindSetting.findUnique({ where: { organisationId_kind: { organisationId: c.l.org.id, kind } }, select: { templateId: true, routingTypeId: true } });
  if (!s?.templateId) throw new ActRefusal({ ok: false, message: refusalText("Not raised:", [noFormFault(kind)]) });
  return { templateId: s.templateId, routingTypeId: s.routingTypeId };
}

const line = (key: string, labelEn: string, type: FigureLine["type"], value: string | null): FigureLine => ({ key, labelEn, type, value, overridable: false });
const snapshot = (today: string, rule: string, lines: FigureLine[]): ComputedSnapshot => ({ version: 1, computedOn: today, rule: { en: rule }, lines, totals: [], routingRatio: null });

/// The CPC that is not void, its certificate locked, then its record.
async function lockCpc(c: ActCtx) {
  const pre = await c.tx.practicalCompletion.findMany({ where: { contractId: c.l.contract.id, certificate: { status: { not: "VOID" } } }, select: { id: true, certificateId: true } });
  const live = pre.at(-1) ?? null;
  if (!live) return null;
  // The contract's lock serialises every act on its certificates; the domain row is locked after it.
  await c.tx.$queryRaw`SELECT id FROM "PracticalCompletion" WHERE id = ${live.id} FOR UPDATE`;
  return c.tx.practicalCompletion.findFirstOrThrow({ where: { id: live.id, organisationId: c.l.org.id }, include: { certificate: { select: { id: true, status: true, number: true } } } });
}

// ------------------------------------------------------------------ FR-CMP-004–007, 009: the certificate of practical completion

export async function raisePracticalCompletion(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const completionDate = r.date("completionDate", "Completion date", { required: true });
  const possessionTakenOn = r.date("possessionTakenOn", "Possession of the works taken on", { required: true });
  const inspectedOn = r.date("inspectedOn", "Joint inspection on", { required: true });
  const testReasons = r.text("testReasons", "Why the works are practically complete", { required: true, max: 4000 });
  const otherAttendees = r.text("otherAttendees", "Others who attended", { max: 1000 });
  const attendeeIds = data.getAll("attendeeIds").flatMap((v) => String(v).split("\n")).map((v) => v.trim()).filter(Boolean);
  if (r.failed || !completionDate || !possessionTakenOn || !inspectedOn) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "PracticalCompletion.person", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  return inContract(actor, toAuditActor(actor), idOf(data), now, "COMPLETION", async (c) => {
    const who = await recordedFor(c, act, { soOnly: true }, c.today);
    const baseline = baselineOn(c.l, c.today);
    if (!baseline) throw new ActRefusal({ ok: false, message: "Not raised: no baseline version is in force today." });
    const v = baseline.values;
    const live = await lockCpc(c);
    const type = c.l.ex.contractTypeCode ? await c.tx.contractType.findFirst({ where: { organisationId: c.l.org.id, code: c.l.ex.contractTypeCode }, select: { completionVariant: true } }) : null;
    const done = storedDay(completionDate);
    const fs = cpcRaiseFaults({ live: live ? { number: live.certificate.number } : null, completionDate: done, possessionDate: v.possessionDate, inspectedOn: storedDay(inspectedOn), testReasons, today: c.today, dlp: { applies: v.dlpApplies, months: v.dlpMonths }, sectional: v.sectionalCompletion === true || v.sections.length > 0, variant: type?.completionVariant ?? null, ladWindows: await liveLadWindows(c.l.contract.id, c.tx) });
    if (fs.length) refuse("Not raised:", fs);
    const form = await formOf(c, "PRACTICAL_COMPLETION");
    const people = attendeeIds.length ? await c.tx.person.findMany({ where: { id: { in: attendeeIds }, organisationId: c.l.org.id }, select: { id: true, name: true } }) : [];
    if (people.length !== new Set(attendeeIds).size) fieldError("attendeeIds", "Choose people on record.");
    const attendees = [...people.map((p) => p.name), ...otherAttendees.split(/[\n,;]/).map((x) => x.trim()).filter(Boolean)];
    const dlp = dlpOf(done, { applies: v.dlpApplies, months: v.dlpMonths });
    const computed = snapshot(c.today, "The completion date and the defects liability period from the contract's baseline, in calendar months.", [
      line("cpcCompletionDate", "Practical completion on", "DATE", done),
      line("cpcInspectedOn", "Joint inspection on", "DATE", storedDay(inspectedOn)),
      line("cpcDlp", "Defects liability period", "TEXT", dlp.applies === true ? `${v.dlpMonths} months, ending ${formatDate(dayPlus(dlp.endExclusive, -1))}` : "Does not apply"),
    ]);
    const certId = await openCertificate(c.tx, toAuditActor(actor), c.l, { kind: "PRACTICAL_COMPLETION", templateId: form.templateId, routingTypeId: form.routingTypeId, sectionId: null, computed }, c.now, c.today);
    const row = await c.tx.practicalCompletion.create({
      data: { organisationId: c.l.org.id, certificateId: certId, contractId: c.l.contract.id, completionDate, possessionTakenOn, inspectedOn, attendees, testReasons: testReasons.trim(), dlpMonths: dlp.applies === true ? v.dlpMonths : null, dlpStart: dlp.applies === true ? dayToDate(dlp.start) : null, dlpEnd: dlp.applies === true ? dayToDate(dlp.endExclusive) : null, personId: who.person.id, recordedAt: c.now },
    });
    await audit(c, "PracticalCompletion", row.id, `${c.label} · practical completion`, "CREATE", diffFields(null, { completionDate: done, possessionOfTheWorks: storedDay(possessionTakenOn), jointInspection: storedDay(inspectedOn), attended: attendees.join(", ") || null, whyComplete: testReasons.trim(), defectsLiabilityPeriod: dlp.applies === true ? `${formatDate(dlp.start)} to ${formatDate(dayPlus(dlp.endExclusive, -1))}` : "does not apply", raisedFor: who.person.name }));
    await act.write(c.tx, row.id, { roleCode: who.soRoleCode });
    return { ok: true };
  });
}

/// FR-CMP-007: a line on the CPC's list, while it is a draft. The responsible party is always the contractor.
export async function addCpcDefect(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const description = r.text("description", "What the defect is", { required: true, max: 2000 });
  const location = r.text("location", "Where", { max: 400 });
  const dueOn = r.date("dueOn", "Made good by", { required: true });
  if (r.failed || !dueOn) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "DefectItem.reportedBy", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  return inContract(actor, toAuditActor(actor), idOf(data), now, "COMPLETION", async (c) => {
    const who = await recordedFor(c, act, { act: "OBSERVATION" }, c.today);
    const pc = await lockCpc(c);
    if (!pc) throw new ActRefusal({ ok: false, message: "Not added: raise the practical completion certificate first." });
    const fs = cpcLineFaults({ certificateStatus: pc.certificate.status, description, dueOn: storedDay(dueOn), completionDate: storedDay(pc.completionDate) });
    if (fs.length) refuse("Not added:", fs);
    const row = await c.tx.defectItem.create({ data: { organisationId: c.l.org.id, contractId: c.l.contract.id, source: "PRACTICAL_COMPLETION", practicalCompletionId: pc.id, description: description.trim(), location: location.trim(), dueOn, reportedByPersonId: who.person.id, recordedAt: c.now } });
    await audit(c, "DefectItem", row.id, `${c.label} · defect`, "CREATE", diffFields(null, { defect: description.trim(), where: location.trim() || null, madeGoodBy: storedDay(dueOn), onTheCertificate: "practical completion (draft)", recordedFor: who.person.name }));
    await act.write(c.tx, row.id, { roleCode: who.soRoleCode });
    return { ok: true };
  });
}

/// A line taken off the CPC's list while it is a draft (the trigger refuses it after).
export async function removeCpcDefect(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const defectId = String(data.get("defectId") ?? "");
  return inContract(actor, toAuditActor(actor), idOf(data), now, "COMPLETION", async (c) => {
    const pc = await lockCpc(c);
    if (!pc) throw new ActRefusal({ ok: false, message: "That defect is not on the certificate." });
    await c.tx.$queryRaw`SELECT id FROM "DefectItem" WHERE id = ${defectId} FOR UPDATE`;
    const d = await c.tx.defectItem.findFirst({ where: { id: defectId, practicalCompletionId: pc.id, organisationId: c.l.org.id } });
    if (!d) throw new ActRefusal({ ok: false, message: "That defect is not on the certificate." });
    if (pc.certificate.status !== "DRAFT") refuse("Not removed:", [{ code: "CPC_NOT_DRAFT", level: "block" }]);
    await c.tx.defectItem.deleteMany({ where: { id: d.id, organisationId: c.l.org.id } });
    await audit(c, "DefectItem", d.id, `${c.label} · defect`, "DELETE", diffFields({ defect: d.description, where: d.location || null, madeGoodBy: storedDay(d.dueOn) }, { defect: null, where: null, madeGoodBy: null }));
    return { ok: true };
  });
}

// ------------------------------------------------------------------ FR-CMP-011: defects during the period, and what happens to each line

export async function reportDefect(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const description = r.text("description", "What the defect is", { required: true, max: 2000 });
  const location = r.text("location", "Where", { max: 400 });
  const dueOn = r.date("dueOn", "Made good by", { required: true });
  if (r.failed || !dueOn) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "DefectItem.reportedBy", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  return inContract(actor, toAuditActor(actor), idOf(data), now, "DEFECTS", async (c) => {
    const who = await recordedFor(c, act, { act: "OBSERVATION" }, c.today);
    const rows = await loadCloseout(c.l.contract.id, c.tx);
    const fs = reportDefectFaults({ cpcIssued: rows.cpc?.certificate.status === "ISSUED", dlpApplies: !!rows.cpc?.dlpStart, scheduleIssued: rows.schedule?.certificate.status === "ISSUED", description, dueOn: storedDay(dueOn) });
    if (fs.length) refuse("Not recorded:", fs);
    const row = await c.tx.defectItem.create({ data: { organisationId: c.l.org.id, contractId: c.l.contract.id, source: "LIABILITY_PERIOD", description: description.trim(), location: location.trim(), dueOn, reportedByPersonId: who.person.id, recordedAt: c.now } });
    await audit(c, "DefectItem", row.id, `${c.label} · defect`, "CREATE", diffFields(null, { defect: description.trim(), where: location.trim() || null, madeGoodBy: storedDay(dueOn), reported: "during the defects liability period", recordedFor: who.person.name }));
    await act.write(c.tx, row.id, { roleCode: who.soRoleCode });
    return { ok: true };
  });
}

const EVENT_OF: Readonly<Record<DefectAct, "REPORTED_RECTIFIED" | "MADE_GOOD" | "RETURNED" | "WITHDRAWN">> = { REPORT_RECTIFIED: "REPORTED_RECTIFIED", ACCEPT: "MADE_GOOD", RETURN: "RETURNED", WITHDRAW: "WITHDRAWN" };
const EVENT_WORDS: Readonly<Record<DefectAct, string>> = { REPORT_RECTIFIED: "reported rectified", ACCEPT: "made good", RETURN: "returned: not made good", WITHDRAW: "withdrawn" };

/// One act on a line, by an officer: an event appended, never the line changed (ADR 0047 D1). Its family is DEFECTS.
async function onDefect(actor: Extract<Awaited<ReturnType<typeof staffForAct>>, { ok: true }>["actor"], data: FormData, which: DefectAct): Promise<FormState> {
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const defectId = r.text("defectId", "Defect", { required: true });
  const on = r.date("on", "On", { required: true });
  const note = r.text("note", which === "WITHDRAW" ? "Why it is withdrawn" : which === "RETURN" ? "Why it is not made good" : "Note", { required: which === "WITHDRAW" || which === "RETURN", max: 2000 });
  const evidenceId = r.optionalText("evidenceDocumentId");
  if (r.failed || !on) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "DefectEvent.person", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  return inContract(actor, toAuditActor(actor), idOf(data), now, "DEFECTS", async (c) => {
    const who = await recordedFor(c, act, { act: "OBSERVATION" }, storedDay(on));
    await c.tx.$queryRaw`SELECT id FROM "DefectItem" WHERE id = ${defectId} AND "contractId" = ${c.l.contract.id} FOR UPDATE`;
    const rows = await loadCloseout(c.l.contract.id, c.tx);
    const d = defectFactsOf(rows).find((x) => x.id === defectId);
    if (!d) throw new ActRefusal({ ok: false, message: "That defect is not on this contract." });
    const fs = defectActFaults(which, defectState(d.events).state, { note, on: storedDay(on), today: c.today });
    if (fs.length) refuse("Not recorded:", fs);
    const evidence = evidenceId ? await c.tx.projectDocument.findFirst({ where: { id: evidenceId, contractId: c.l.contract.id, organisationId: c.l.org.id }, select: { id: true, title: true } }) : null;
    if (evidenceId && !evidence) fieldError("evidenceDocumentId", "That document is not on this contract.");
    const row = await c.tx.defectEvent.create({ data: { organisationId: c.l.org.id, defectId: d.id, kind: EVENT_OF[which], on, note: note.trim(), evidenceDocumentId: evidence?.id ?? null, personId: who.person.id, recordedAt: c.now } });
    await audit(c, "DefectEvent", row.id, `${c.label} · defect: ${d.description.slice(0, 80)}`, "CREATE", diffFields(null, { defect: EVENT_WORDS[which], on: storedDay(on), note: note.trim() || null, evidence: evidence?.title ?? null, recordedFor: `${who.person.name}, ${capacityText(who.capacity, who.soLabel)}` }));
    await act.write(c.tx, row.id, { roleCode: who.soRoleCode });
    return { ok: true };
  });
}

/// The contractor's report of a line rectified, recorded by an officer from the contractor's paper (the contractor's own is the portal's).
export async function reportDefectRectified(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  return onDefect(txGuard.actor, data, "REPORT_RECTIFIED");
}
export async function acceptDefect(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  return onDefect(txGuard.actor, data, "ACCEPT");
}
export async function returnDefect(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  return onDefect(txGuard.actor, data, "RETURN");
}
export async function withdrawDefect(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  return onDefect(txGuard.actor, data, "WITHDRAW");
}

// ------------------------------------------------------------------ FR-CMP-013: the Schedule of Defects

export async function raiseDefectSchedule(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const rectifyBy = r.date("rectifyBy", "Made good by", { required: true });
  if (r.failed || !rectifyBy) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "DefectSchedule.person", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  return inContract(actor, toAuditActor(actor), idOf(data), now, "DEFECTS", async (c) => {
    const who = await recordedFor(c, act, { soOnly: true }, c.today);
    await c.tx.$queryRaw`SELECT id FROM "DefectItem" WHERE "contractId" = ${c.l.contract.id} ORDER BY id FOR UPDATE`;
    const rows = await loadCloseout(c.l.contract.id, c.tx);
    const clock = await c.tx.contractClockRule.findUnique({ where: { organisationId_clock: { organisationId: c.l.org.id, clock: "DEFECTS_RECTIFICATION" } }, select: { length: true, unit: true } });
    const open = openLineCount(rows);
    const fs = scheduleRaiseFaults({ cpcIssued: rows.cpc?.certificate.status === "ISSUED", dlp: rows.cpc ? dlpOfRow(rows.cpc) : null, today: c.today, open, live: rows.schedule ? { number: rows.schedule.certificate.number } : null, rectifyBy: storedDay(rectifyBy), limit: clock });
    if (blocks(fs).length) refuse("Not raised:", blocks(fs));
    const form = await formOf(c, "SCHEDULE_OF_DEFECTS");
    const computed = snapshot(c.today, "The defects still open, to be made good by the day stated.", [line("sodRectifyBy", "Made good by", "DATE", storedDay(rectifyBy)), line("sodOpen", "Defects listed", "TEXT", String(open))]);
    const certId = await openCertificate(c.tx, toAuditActor(actor), c.l, { kind: "SCHEDULE_OF_DEFECTS", templateId: form.templateId, routingTypeId: form.routingTypeId, sectionId: null, computed }, c.now, c.today);
    const row = await c.tx.defectSchedule.create({ data: { organisationId: c.l.org.id, certificateId: certId, contractId: c.l.contract.id, rectifyBy, personId: who.person.id, recordedAt: c.now } });
    await audit(c, "DefectSchedule", row.id, `${c.label} · schedule of defects`, "CREATE", diffFields(null, { madeGoodBy: storedDay(rectifyBy), defectsOpen: open, longestPeriod: clock ? "checked" : "not set, so not checked", raisedFor: who.person.name }));
    await act.write(c.tx, row.id, { roleCode: who.soRoleCode });
    const warned = warnings(fs);
    return { ok: true, message: warned.length ? closeoutRefusal("Raised.", warned) : undefined };
  });
}

// ------------------------------------------------------------------ FR-CMP-015, 018: the certificate of making good defects

/// What the contract holds today (ruling 6): its securities not returned and not rejected, and the retention balance still held.
async function heldOf(c: ActCtx) {
  const [p, securities] = await Promise.all([loadPayment(c.l.contract.id, c.tx), c.tx.securityInstrument.findMany({ where: { contractId: c.l.contract.id, status: { not: "REJECTED" }, release: null }, orderBy: [{ lodgedOn: "asc" }, { id: "asc" }] })]);
  return { p, securities, balance: retentionOf(p).balance };
}

export async function raiseMakingGood(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const madeGoodOn = r.date("madeGoodOn", "Defects made good on", { required: true });
  const finalInspectionOn = r.date("finalInspectionOn", "Final defects inspection on", { required: true });
  if (r.failed || !madeGoodOn || !finalInspectionOn) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "MakingGood.person", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  return inContract(actor, toAuditActor(actor), idOf(data), now, "MAKING_GOOD", async (c) => {
    const who = await recordedFor(c, act, { soOnly: true }, c.today);
    await c.tx.$queryRaw`SELECT id FROM "DefectItem" WHERE "contractId" = ${c.l.contract.id} ORDER BY id FOR UPDATE`;
    const rows = await loadCloseout(c.l.contract.id, c.tx);
    const fs = cmgdRaiseFaults({ cpcIssued: rows.cpc?.certificate.status === "ISSUED", dlp: rows.cpc ? dlpOfRow(rows.cpc) : null, today: c.today, open: openLineCount(rows), live: rows.cmgd ? { number: rows.cmgd.certificate.number } : null, madeGoodOn: storedDay(madeGoodOn), finalInspectionOn: storedDay(finalInspectionOn) });
    if (fs.length) refuse("Not raised:", fs);
    const form = await formOf(c, "MAKING_GOOD_DEFECTS");
    const h = await heldOf(c);
    const snap = cmgdSnapshotOf({ securities: h.securities.map((s) => ({ kind: s.kind, form: s.form, reference: s.instrumentRef, value: senFromDecimal(s.value) })), retentionBalance: h.balance });
    const facts = defectFactsOf(rows);
    const withdrawn = facts.filter((d) => defectState(d.events).state === "WITHDRAWN").length;
    // Ruling 6 (FR-CMP-015): the certificate's own figures carry the bond's value, the balance and each security's number.
    const computed = snapshot(c.today, "The defects made good, and what is held against the contract as the certificate is raised.", [
      line("cmgdMadeGoodOn", "Defects made good on", "DATE", storedDay(madeGoodOn)),
      line("cmgdFinalInspectionOn", "Final defects inspection on", "DATE", storedDay(finalInspectionOn)),
      line("cmgdDefects", "Defects", "TEXT", `${facts.length - withdrawn} made good${withdrawn ? `, ${withdrawn} withdrawn, not made good` : ""}`),
      line("cmgdPerformanceBond", "Performance bond", "MONEY", snap.performanceBond?.value ?? null),
      line("cmgdRetentionBalance", "Retention balance held", "MONEY", snap.retentionBalance),
      line("cmgdSecurities", "Securities held (guarantee or receipt numbers)", "TEXT", snap.securities.map((s) => `${SECURITY_KIND_WORDS[s.kind] ?? s.kind}: ${s.reference || "no number"}`).join("; ") || "None"),
    ]);
    const certId = await openCertificate(c.tx, toAuditActor(actor), c.l, { kind: "MAKING_GOOD_DEFECTS", templateId: form.templateId, routingTypeId: form.routingTypeId, sectionId: null, computed }, c.now, c.today);
    const row = await c.tx.makingGood.create({ data: { organisationId: c.l.org.id, certificateId: certId, contractId: c.l.contract.id, madeGoodOn, finalInspectionOn, snapshot: json(snap), personId: who.person.id, recordedAt: c.now } });
    await audit(c, "MakingGood", row.id, `${c.label} · making good of defects`, "CREATE", diffFields(null, { madeGoodOn: storedDay(madeGoodOn), finalInspection: storedDay(finalInspectionOn), withdrawnNotMadeGood: withdrawn || null, performanceBond: snap.performanceBond ? formatMoney(senFromDecimal(snap.performanceBond.value)) : null, retentionBalance: formatMoney(h.balance), raisedFor: who.person.name }));
    await act.write(c.tx, row.id, { roleCode: who.soRoleCode });
    return { ok: true };
  });
}

// ------------------------------------------------------------------ CO-7, FR-CMP-015, 016: returning a security

export async function returnSecurity(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const securityId = r.text("securityId", "Security", { required: true });
  const returnedOn = r.date("returnedOn", "Returned on", { required: true });
  const receipt = r.text("officialReceiptRef", "Official receipt reference", { max: 120 });
  const note = r.text("note", "Note", { max: 2000 });
  if (r.failed || !returnedOn) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "SecurityRelease.person", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  return inContract(actor, toAuditActor(actor), idOf(data), now, "SECURITY_RELEASE", async (c) => {
    if (storedDay(returnedOn) > c.today) refuse("Not returned:", [{ code: "DAY_IN_FUTURE", level: "block", data: { day: storedDay(returnedOn) } }]);
    const rows = await loadCloseout(c.l.contract.id, c.tx);
    await c.tx.$queryRaw`SELECT id FROM "SecurityInstrument" WHERE id = ${securityId} AND "contractId" = ${c.l.contract.id} FOR UPDATE`;
    const s = await c.tx.securityInstrument.findFirst({ where: { id: securityId, contractId: c.l.contract.id, contract: { organisationId: c.l.org.id } }, include: { release: { select: { id: true } } } });
    if (!s) throw new ActRefusal({ ok: false, message: "That security is not on this contract." });
    const policy = await c.tx.postAwardPolicy.findUnique({ where: { organisationId: c.l.org.id }, select: { retentionBalanceReleaseAt: true, performanceBondReleaseAt: true } });
    const events = releaseEventsOf(rows, policy);
    const input: SecurityReturnInput = { kind: s.kind, form: s.form, status: s.status, returned: !!s.release, officialReceiptRef: receipt, performanceEvent: events.performance, retentionEvent: events.retention, advanceRecouped: advanceRecoupedOf(await loadPayment(c.l.contract.id, c.tx), s.id) };
    const fs = securityReturnFaults(input);
    if (fs.length) refuse("Not returned:", fs);
    const trigger = returnTriggerOf(input)!;
    // F4: a return the CMGD authorises is not dated before the CMGD's issue.
    const early = trigger === "MAKING_GOOD" ? beforeCertificateFault(storedDay(returnedOn), cmgdIssuedOn(rows)) : null;
    if (early) refuse("Not returned:", [early]);
    // Ruling 16: no route of its own; the certificate that authorised it is named (the CMGD at MAKING_GOOD; the final certificate arrives with stage C).
    const certificateId = trigger === "MAKING_GOOD" && rows.cmgd?.certificate.status === "ISSUED" ? rows.cmgd.certificate.id : null;
    const who = await recordedFor(c, act, { principalOrSo: true }, storedDay(returnedOn));
    const row = await c.tx.securityRelease.create({ data: { organisationId: c.l.org.id, securityId: s.id, contractId: c.l.contract.id, trigger, certificateId, returnedOn, officialReceiptRef: receipt.trim(), personId: who.person.id, note: note.trim(), recordedAt: c.now } });
    const label = `${SECURITY_KIND_WORDS[s.kind]} ${s.instrumentRef || ""}`.trim();
    await audit(c, "SecurityRelease", row.id, `${c.label} · ${label}`, "CREATE", diffFields(null, { returned: `${label} (${SECURITY_FORM_WORDS[s.form]}), ${formatMoney(senFromDecimal(s.value))}`, returnedOn: storedDay(returnedOn), authorisedBy: certificateId ? `the certificate of making good defects ${rows.cmgd?.certificate.number ?? ""}`.trim() : trigger === "ADVANCE_RECOUPED" ? "the advance fully recouped" : null, officialReceipt: receipt.trim() || null, recordedFor: `${who.person.name}, ${capacityText(who.capacity, who.soLabel)}` }), note.trim());
    await act.write(c.tx, row.id, { roleCode: who.soRoleCode });
    return { ok: true };
  });
}
