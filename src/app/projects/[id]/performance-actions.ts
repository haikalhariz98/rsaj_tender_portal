"use server";

import type { FormState } from "@/components/record-editor";
import type { Prisma } from "@/generated/prisma/client";
import { diffFields } from "@/lib/audit/diff";
import { writeAudit } from "@/lib/audit/record";
import { toSecond } from "@/lib/bids/lateness";
import { loadCloseout } from "@/lib/closeout/load";
import { actStatusFault } from "@/lib/contract/act-status";
import { withLockedContract } from "@/lib/contract/repo";
import type { ContractStatus } from "@/lib/contract/types";
import { fixedToDecimalString } from "@/lib/evaluation/fixed";
import { actCtx, type ActCtx, ActRefusal, afterAct, NO_ZONE_STATE, recordedFor, tableRefusal, thrownState } from "@/lib/matter/act";
import type { Finding } from "@/lib/performance/form";
import { performanceRefusal, totalText } from "@/lib/performance/labels";
import { formSnapshotOf, issuedFormFor, snapshotOfForm } from "@/lib/performance/load";
import { editFaults, openFaults, verifyFaults } from "@/lib/performance/report";
import { gradeOf, reportTotal, scoreFaults } from "@/lib/performance/score";
import { capacityText } from "@/lib/supervision/authority";
import { toAuditActor, staffForAct } from "@/app/_auth/actor";
import { beginAct } from "@/app/_auth/act";
import type { AuditActor } from "@/lib/auth/types";
import type { OrgScope } from "@/lib/org-scope";

/**
 * The contractor performance report (Phase 2 close-out stage D; plan closeout-plan.md §4.8; ADR 0047 D6; rulings 10, 12, 17). One report per
 * contract, opened once the CMGD is issued (or the CPC where no defects liability period applies) on the contract type's one issued form, which it
 * pins with its snapshot; scored; assessed by the S.O. or the Principal Representative, which fixes the scores and writes the total and grade; then
 * verified by a different signed-in person, which files it. Each act reads the server's clock once, runs under the contract's lock (its family
 * PERFORMANCE_REPORT asked, CANCELLED first), locks the report after the contract, re-reads it, runs the pure rule again, writes, and audits before
 * and after in the same transaction. Every person on it is the signed-in person's own act, never recorded from paper (act slots), so the second
 * person is real. The verifier's office rule is deferred (plan §9).
 */

async function inContract(scope: OrgScope, actor: AuditActor, id: string, now: Date, fn: (c: ActCtx) => Promise<FormState>): Promise<FormState> {
  let result: FormState | null;
  try {
    result = await withLockedContract(scope.organisationId, id, async (tx, l) => {
      const refused = actStatusFault("PERFORMANCE_REPORT", l.contract.status as ContractStatus);
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
  throw new ActRefusal({ ok: false, message: performanceRefusal(lead, fs) });
};
const audit = (c: ActCtx, id: string, action: "CREATE" | "UPDATE", changes: ReturnType<typeof diffFields>) =>
  action === "UPDATE" && changes.length === 0 ? Promise.resolve() : writeAudit(c.tx, { actor: c.actor, organisationId: c.l.org.id, entity: "PerformanceReport", entityId: id, entityLabel: `${c.label} · contractor performance`, reason: "" }, action, changes);

/// The contract's report, locked after the contract, then re-read.
async function lockReport(c: ActCtx) {
  await c.tx.$queryRaw`SELECT id FROM "PerformanceReport" WHERE "contractId" = ${c.l.contract.id} FOR UPDATE`;
  const r = await c.tx.performanceReport.findFirst({ where: { contractId: c.l.contract.id, organisationId: c.l.org.id }, include: { scores: { orderBy: { criterionOrder: "asc" } } } });
  if (!r) throw new ActRefusal({ ok: false, message: "This contract has no performance report yet." });
  return r;
}

export async function openPerformanceReport(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const begun = await beginAct(actor, data, "PerformanceReport.person", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  return inContract(actor, toAuditActor(actor), idOf(data), now, async (c) => {
    const who = await recordedFor(c, act, { principalOrSo: true }, c.today);
    const rows = await loadCloseout(c.l.contract.id, c.tx);
    const code = c.l.ex.contractTypeCode;
    const [form, type, live] = await Promise.all([
      issuedFormFor(c.l.org.id, code, c.tx),
      code ? c.tx.contractType.findFirst({ where: { organisationId: c.l.org.id, code }, select: { nameEn: true } }) : Promise.resolve(null),
      c.tx.performanceReport.findUnique({ where: { contractId: c.l.contract.id }, select: { id: true } }),
    ]);
    const fs = openFaults({ cpcIssued: rows.cpc?.certificate.status === "ISSUED", dlpApplies: !!rows.cpc?.dlpStart, cmgdIssued: rows.cmgd?.certificate.status === "ISSUED", formIssued: !!form, typeName: type?.nameEn ?? null, live: !!live });
    if (fs.length) refuse("Not opened:", fs);
    const snap = snapshotOfForm(form!);
    const row = await c.tx.performanceReport.create({ data: { organisationId: c.l.org.id, contractId: c.l.contract.id, supplierId: c.l.award.vendorId ?? null, formId: form!.id, formSnapshot: snap as unknown as Prisma.InputJsonValue, personId: who.person.id, recordedAt: c.now } });
    await audit(c, row.id, "CREATE", diffFields(null, { form: `${snap.name}, version ${snap.version}`, criteria: snap.criteria.length, scoresFrom1To: snap.scaleMax, supplier: c.l.award.vendorId ? c.l.award.awardeeName : "not linked to the supplier register", openedBy: `${who.person.name}, ${capacityText(who.capacity, who.soLabel)}` }));
    await act.write(c.tx, row.id, { roleCode: who.soRoleCode });
    return { ok: true };
  });
}

/// One score per criterion (1 to the form's top) and a note, before assessment. Fields `score_<order>` and `note_<order>`.
export async function savePerformanceScores(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  return inContract(actor, toAuditActor(actor), idOf(data), now, async (c) => {
    const r = await lockReport(c);
    const ef = editFaults(r);
    if (ef.length) refuse("Not saved:", ef);
    const snap = formSnapshotOf(r);
    const errors: Record<string, string> = {};
    const next = new Map<number, { score: number; note: string }>();
    for (const k of snap.criteria) {
      const raw = String(data.get(`score_${k.order}`) ?? "").trim();
      if (!raw) continue;
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 1 || n > snap.scaleMax) errors[`score_${k.order}`] = `1 to ${snap.scaleMax}.`;
      else next.set(k.order, { score: n, note: String(data.get(`note_${k.order}`) ?? "").trim().slice(0, 2000) });
    }
    if (Object.keys(errors).length) throw new ActRefusal({ ok: false, errors });
    const before = Object.fromEntries(r.scores.map((s) => [`criterion${s.criterionOrder}`, `${s.score}${s.note ? ` (${s.note})` : ""}`]));
    for (const [order, v] of next) {
      await c.tx.performanceScore.upsert({ where: { reportId_criterionOrder: { reportId: r.id, criterionOrder: order } }, create: { organisationId: c.l.org.id, reportId: r.id, criterionOrder: order, score: v.score, note: v.note }, update: { score: v.score, note: v.note } });
    }
    const after = { ...before, ...Object.fromEntries([...next].map(([o, v]) => [`criterion${o}`, `${v.score}${v.note ? ` (${v.note})` : ""}`])) };
    await audit(c, r.id, "UPDATE", diffFields(before, after));
    return { ok: true };
  });
}

/// Assess: every criterion scored and in scale; the total and the grade written from the pinned form; the scores fixed from here on.
export async function assessPerformanceReport(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const begun = await beginAct(actor, data, "PerformanceReport.assessedBy", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  return inContract(actor, toAuditActor(actor), idOf(data), now, async (c) => {
    const who = await recordedFor(c, act, { principalOrSo: true }, c.today);
    const r = await lockReport(c);
    const snap = formSnapshotOf(r);
    const scores = new Map(r.scores.map((s) => [s.criterionOrder, s.score]));
    const fs = [...editFaults(r), ...scoreFaults(snap, scores)];
    if (fs.length) refuse("Not assessed:", fs);
    const total = reportTotal(snap, scores);
    const grade = gradeOf(total, snap.bands);
    if ("code" in grade) refuse("Not assessed:", [grade]);
    const label = (grade as { label: string }).label;
    await c.tx.performanceReport.update({ where: { id: r.id, organisationId: c.l.org.id }, data: { scoreTotal: fixedToDecimalString(total), gradeLabel: label, assessedByPersonId: who.person.id, assessedAt: c.now } });
    // The total and the grade are SULIT (supplier scope): the trail's field names are the registered ones, so its gate reads them.
    await audit(c, r.id, "UPDATE", diffFields({ scoreTotal: null, gradeLabel: null, assessedBy: null }, { scoreTotal: totalText(total), gradeLabel: label, assessedBy: who.person.name }));
    await act.write(c.tx, r.id, { roleCode: who.soRoleCode });
    return { ok: true };
  });
}

/// Verify, which files it: by a signed-in person other than the assessor (CHECK and act).
export async function verifyPerformanceReport(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const begun = await beginAct(actor, data, "PerformanceReport.verifiedBy", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  return inContract(actor, toAuditActor(actor), idOf(data), now, async (c) => {
    const r = await lockReport(c);
    const fs = verifyFaults(r, act.subjectPersonId);
    if (fs.length) refuse("Not verified:", fs);
    const person = await c.tx.person.findFirstOrThrow({ where: { id: act.subjectPersonId, organisationId: c.l.org.id }, select: { name: true } });
    await c.tx.performanceReport.update({ where: { id: r.id, organisationId: c.l.org.id }, data: { verifiedByPersonId: act.subjectPersonId, verifiedAt: c.now } });
    await audit(c, r.id, "UPDATE", diffFields({ verifiedBy: null }, { verifiedBy: person.name, filed: c.today }));
    await act.write(c.tx, r.id);
    return { ok: true };
  });
}
