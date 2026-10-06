"use server";

import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import { diffFields } from "@/lib/audit/diff";
import type { Tx } from "@/lib/audit/record";
import { dayToDate, storedDay } from "@/lib/dates";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { exerciseOrg } from "@/lib/method/repo";
import { transactionTimedOut } from "@/lib/scope/tx-timeout";
import { SUPPLIER_ENTITY } from "@/lib/suppliers/audit-view";
import { routeState } from "@/lib/suppliers/blacklist";
import { asHeading, PERMISSION_MATTER, PERMISSION_REFUSED_DECIDED_BY, RELAXES_LABEL } from "@/lib/suppliers/labels";
import { linkAwardFaults, linkPartyFaults } from "@/lib/suppliers/link";
import { lockSupplierRow } from "@/lib/suppliers/lock";
import { grantFaults, specialPermissionFaults } from "@/lib/suppliers/permission";
import type { SupplierOrg } from "@/lib/suppliers/repo";
import { blocking, SPECIAL_PERMISSION_DOMAIN, type Finding } from "@/lib/suppliers/types";
import { splitValues } from "@/lib/ui/select-logic";
import { FormReader } from "@/lib/validate";

import { approvedOnOf, decideSupplierStep, openSupplierRoute } from "./routes";
import { activePerson, audit, CHANGED, notes, NO_ORG, refuse, Refusal, stampNow } from "./shared";
import { requireStaff, toAuditActor } from "@/app/_auth/actor";

/**
 * The register's acts that touch an exercise too (plan 6.15 §4.2, OD-9, FR-ADV-017): linking a party,
 * or a party-less award, to a supplier, and special permission. Lock order, one rule: the exercise side
 * first (requisition → exercise → window → party, award or permission) and the supplier row last, so a
 * supplier act (which never locks an exercise) cannot deadlock against these. Every link is an explicit
 * audited act, never inferred; a party's number that differs from the register's needs a reason.
 */

type ExerciseLocked = { org: SupplierOrg; ex: { id: string; reference: string } };

async function onExerciseSide(exerciseId: string, lockMiddle: (tx: Tx) => Promise<void>, supplierId: string | null, fn: (tx: Tx, l: ExerciseLocked) => Promise<FormState>, paths: string[]): Promise<FormState> {
  let result: FormState;
  try {
    result = await db.$transaction(
      async (tx) => {
        const org = await exerciseOrg(tx);
        if (!org) return NO_ORG;
        const ex0 = await tx.sourcingExercise.findFirst({ where: { id: exerciseId, organisationId: org.id }, select: { requisitionId: true } });
        if (!ex0) return { ok: false, message: "That exercise no longer exists." };
        if (ex0.requisitionId) await tx.$queryRaw`SELECT id FROM "Requisition" WHERE id = ${ex0.requisitionId} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM "SourcingExercise" WHERE id = ${exerciseId} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM "ExerciseWindow" WHERE "exerciseId" = ${exerciseId} FOR UPDATE`;
        await lockMiddle(tx);
        if (supplierId && !(await lockSupplierRow(tx, supplierId))) return { ok: false, message: "That supplier no longer exists." };
        const ex = await tx.sourcingExercise.findUniqueOrThrow({ where: { id: exerciseId }, select: { id: true, reference: true } });
        return fn(tx, { org, ex });
      },
      { timeout: 20_000, maxWait: 10_000 },
    );
  } catch (e) {
    if (e instanceof Refusal) return e.state;
    if (transactionTimedOut(e)) return { ok: false, message: "This took too long and nothing was saved. Try again." };
    throw e;
  }
  if (result.ok) for (const p of ["/suppliers", "/approvals", `/sourcing/${exerciseId}`, ...paths]) revalidatePath(p);
  return result;
}

const supplierWords = (s: { reference: string; registeredName: string }) => `${s.reference} · ${s.registeredName}`;

// ------------------------------------------------------------------ links (OD-9)

/// Link an exercise's party to the register's supplier. Its awards with that party follow, in the same transaction.
export async function linkPartyToSupplier(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const r = new FormReader(data);
  const partyId = r.text("partyId", "Party", { required: true });
  const supplierId = r.text("supplierId", "Supplier", { required: true });
  const reason = r.text("reason", "Why they are the same company", { max: 1000 });
  const personId = r.text("personId", "Linked by", { required: true });
  if (r.failed) return { ok: false, errors: r.errors };
  const p0 = await db.exerciseParty.findUnique({ where: { id: partyId }, select: { exerciseId: true } });
  if (!p0) return { ok: false, message: "That party no longer exists." };
  return onExerciseSide(p0.exerciseId, async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ExerciseParty" WHERE id = ${partyId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "Award" WHERE "awardeePartyId" = ${partyId} FOR UPDATE`;
  }, supplierId, async (tx, l) => {
    const party = await tx.exerciseParty.findUniqueOrThrow({ where: { id: partyId }, select: { id: true, name: true, registrationNo: true, vendorId: true, awards: { select: { id: true, reference: true, vendorId: true, awardeePartyId: true } } } });
    const supplier = await tx.supplier.findFirst({ where: { id: supplierId, organisationId: l.org.id }, select: { id: true, reference: true, registeredName: true, registrationNo: true, status: true } });
    const person = await activePerson(tx, l.org.id, personId);
    if (!person) return { ok: false, errors: { personId: "Name the officer (an active person)." } };
    // fix R-12: the exercise's other parties, read with the exercise locked, so two links cannot race.
    const others = await tx.exerciseParty.findMany({ where: { exerciseId: l.ex.id, NOT: { id: party.id } }, select: { name: true, vendorId: true } });
    const fs = linkPartyFaults(party, supplier, reason, others);
    if (blocking(fs).length) return refuseLink(fs);
    await tx.exerciseParty.update({ where: { id: party.id }, data: { vendorId: supplier!.id } });
    const differs = fs.find((f) => f.code === "NUMBER_DIFFERS");
    await audit(tx, toAuditActor(actor), l.org.id, SUPPLIER_ENTITY.party, party.id, `${l.ex.reference} · Party ${party.name}`, "UPDATE",
      diffFields({ supplier: null }, { supplier: supplierWords(supplier!), numberDiffers: differs ? `${differs.data!.recorded} recorded, ${differs.data!.register} on the register` : null, linkReason: reason || null, linkedBy: person.name, recordedOnBehalf: "not signed" }), reason);
    // The party's awards follow its link (the party is authoritative); one that disagreed is refused, never moved.
    for (const a of party.awards) {
      if (a.vendorId && a.vendorId !== supplier!.id) throw new Refusal({ ok: false, message: `Nothing was saved: award ${a.reference} already names another supplier, against its party's link.` });
      if (a.vendorId === supplier!.id) continue;
      await tx.award.update({ where: { id: a.id }, data: { vendorId: supplier!.id } });
      await audit(tx, toAuditActor(actor), l.org.id, SUPPLIER_ENTITY.award, a.id, `${a.reference} · Awardee's supplier`, "UPDATE", diffFields({ supplier: null }, { supplier: supplierWords(supplier!), linkedBy: `${person.name}, through the awardee party's link` }));
    }
    const n = notes(fs);
    return { ok: true, message: `Linked to ${supplierWords(supplier!)}.${party.awards.length ? ` Its award${party.awards.length === 1 ? "" : "s"} follow${party.awards.length === 1 ? "s" : ""} the link.` : ""}${n ? ` ${n}` : ""}` };
  }, [`/suppliers/${supplierId}`]);
}

/// Link an award with no awardee party (Phase 1's awards) to the register's supplier.
export async function linkAwardToSupplier(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const r = new FormReader(data);
  const awardId = r.text("awardId", "Award", { required: true });
  const supplierId = r.text("supplierId", "Supplier", { required: true });
  const reason = r.text("reason", "Why they are the same company", { max: 1000 });
  const personId = r.text("personId", "Linked by", { required: true });
  if (r.failed) return { ok: false, errors: r.errors };
  const a0 = await db.award.findUnique({ where: { id: awardId }, select: { exerciseId: true } });
  if (!a0) return { ok: false, message: "That award no longer exists." };
  return onExerciseSide(a0.exerciseId, async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Award" WHERE id = ${awardId} FOR UPDATE`;
  }, supplierId, async (tx, l) => {
    const award = await tx.award.findUniqueOrThrow({ where: { id: awardId }, select: { id: true, reference: true, awardeePartyId: true, awardeeRegistrationNo: true, vendorId: true } });
    const supplier = await tx.supplier.findFirst({ where: { id: supplierId, organisationId: l.org.id }, select: { id: true, reference: true, registeredName: true, registrationNo: true, status: true } });
    const person = await activePerson(tx, l.org.id, personId);
    if (!person) return { ok: false, errors: { personId: "Name the officer (an active person)." } };
    const fs = linkAwardFaults(award, supplier, reason);
    if (blocking(fs).length) return refuseLink(fs);
    await tx.award.update({ where: { id: award.id }, data: { vendorId: supplier!.id } });
    const differs = fs.find((f) => f.code === "NUMBER_DIFFERS");
    await audit(tx, toAuditActor(actor), l.org.id, SUPPLIER_ENTITY.award, award.id, `${award.reference} · Awardee's supplier`, "UPDATE",
      diffFields({ supplier: null }, { supplier: supplierWords(supplier!), numberDiffers: differs ? `${differs.data!.recorded} recorded, ${differs.data!.register} on the register` : null, linkReason: reason || null, linkedBy: person.name, recordedOnBehalf: "not signed" }), reason);
    const n = notes(fs);
    return { ok: true, message: `Linked to ${supplierWords(supplier!)}.${n ? ` ${n}` : ""}` };
  }, [`/suppliers/${supplierId}`, `/awards/${awardId}`]);
}

function refuseLink(fs: readonly Finding[]): FormState {
  const reasonFault = fs.find((f) => f.code === "NUMBER_DIFFERS_REASON_REQUIRED");
  const rest = blocking(fs).filter((f) => f !== reasonFault);
  const base = rest.length ? refuse(rest) : { ok: false as const };
  return reasonFault ? { ...base, errors: { reason: refuse([reasonFault], "").message!.trim() } } : base;
}

// ------------------------------------------------------------------ special permission (FR-ADV-017)

/**
 * Record a special permission for a party linked to the register: the requirement and what it relaxes,
 * who grants it, both confirmations. With no approval inside the organisation it is granted now, on the
 * day given; with one, it waits for its route on `special_permission`.
 */
export async function recordSpecialPermission(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const now = stampNow();
  const r = new FormReader(data);
  const partyId = r.text("partyId", "Party", { required: true });
  const requirementId = r.optionalText("requirementId");
  const relaxes = r.choice("relaxes", "What it relaxes", ["GRADE", "FIELD_CODE"] as const);
  const internal = r.choice("internalApproval", "Approved inside the organisation too", ["yes", "no"] as const, { required: true });
  const personId = r.text("personId", "Recorded by", { required: true });
  const granted = r.date("grantedOn", "Granted on");
  const note = r.text("note", "Note", { max: 2000 });
  const bodies = splitValues(data.get("grantingBodyIds"));
  const existingClassConfirmed = data.get("existingClassConfirmed") === "on" || data.get("existingClassConfirmed") === "true";
  const goodRecordConfirmed = data.get("goodRecordConfirmed") === "on" || data.get("goodRecordConfirmed") === "true";
  if (r.failed || !internal) return { ok: false, errors: r.errors };
  const internalApproval = internal === "yes";
  const p0 = await db.exerciseParty.findUnique({ where: { id: partyId }, select: { exerciseId: true, vendorId: true } });
  if (!p0) return { ok: false, message: "That party no longer exists." };
  return onExerciseSide(p0.exerciseId, async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ExerciseParty" WHERE id = ${partyId} FOR UPDATE`;
  }, p0.vendorId, async (tx, l) => {
    if (!l.org.today) return refuse([{ code: "TIME_ZONE_UNSET", level: "block" }]);
    const party = await tx.exerciseParty.findUniqueOrThrow({ where: { id: partyId }, select: { id: true, name: true, vendorId: true, specialPermissions: { select: { requirementId: true, relaxes: true, grantedOn: true, routes: { select: { status: true, createdAt: true } } } } } });
    if (!party.vendorId) return { ok: false, message: "Link the party to the register first: a special permission is read by its eligibility." };
    const [w, reqs, bodyRows, person] = await Promise.all([
      tx.exerciseWindow.findUnique({ where: { exerciseId: l.ex.id }, select: { specialPermissionOffered: true } }),
      tx.exerciseRegistrationRequirement.findMany({ where: { exerciseId: l.ex.id }, select: { id: true, bodyLabelSnapshot: true, qualifiers: true } }),
      tx.registrationBody.findMany({ where: { organisationId: l.org.id, retiredOn: null }, select: { id: true, labelEn: true } }),
      activePerson(tx, l.org.id, personId),
    ]);
    const fs = specialPermissionFaults({ requirementId, relaxes, grantingBodyIds: bodies, internalApproval, existingClassConfirmed, goodRecordConfirmed, personActive: !!person }, { today: l.org.today, offered: w?.specialPermissionOffered ?? null, requirementIds: reqs.map((x) => x.id), bodyIds: bodyRows.map((b) => b.id), existing: party.specialPermissions.map((p) => ({ requirementId: p.requirementId, relaxes: p.relaxes, granted: p.grantedOn != null, route: routeState(p.routes.map((x) => ({ status: x.status, openedAt: x.createdAt.toISOString() }))) })) });
    const grantedOn = granted ? storedDay(granted) : null;
    const grant = internalApproval ? [] : grantFaults({ grantedOn, personActive: !!person }, { today: l.org.today, offered: w?.specialPermissionOffered ?? null, granted: false, internalApproval: false, route: "NONE", approvedOn: null }).filter((f) => f.code.startsWith("GRANTED"));
    if (blocking([...fs, ...grant]).length) return refuse([...fs, ...grant]);
    const req = reqs.find((x) => x.id === requirementId)!;
    const reqLabel = `${asHeading(req.bodyLabelSnapshot)}${req.qualifiers.trim() ? ` (${req.qualifiers.trim()})` : ""}`;
    const grantingBodyLabels = bodies.map((b) => bodyRows.find((x) => x.id === b)!.labelEn);
    const perm = await tx.specialPermission.create({
      data: {
        organisationId: l.org.id, exerciseId: l.ex.id, partyId: party.id, requirementId: req.id, requirementLabelSnapshot: reqLabel, relaxes: relaxes!, grantingBodyIds: bodies, grantingBodyLabels, internalApproval, existingClassConfirmed, goodRecordConfirmed, note, requestedByPersonId: person!.id, requestedAt: now,
        ...(internalApproval ? {} : { grantedOn: dayToDate(grantedOn!), grantedByPersonId: person!.id, grantedAt: now }),
      },
    });
    const permLabel = `${l.ex.reference} · Special permission for ${party.name}`;
    await audit(tx, toAuditActor(actor), l.org.id, SUPPLIER_ENTITY.permission, perm.id, permLabel, "CREATE",
      diffFields(null, { requirement: reqLabel, relaxes: RELAXES_LABEL[relaxes!].en, grantedByBodies: grantingBodyLabels.join(", ") || null, internalApproval: internalApproval ? "Yes, on its route" : "No", existingClassConfirmed: "Confirmed", goodRecordConfirmed: "Confirmed", note: note || null, grantedOn: grantedOn, recordedBy: person!.name, recordedOnBehalf: "not signed" }), note);
    if (!internalApproval) return { ok: true, message: `Granted on ${formatDate(grantedOn!)}. ${RELAXES_LABEL[relaxes!].en} passes by special permission for this requirement.` };
    const opened = await openSupplierRoute(tx, toAuditActor(actor), l.org, { domain: SPECIAL_PERMISSION_DOMAIN, cond: null, owner: { specialPermissionId: perm.id }, requester: person!, what: PERMISSION_MATTER, routeLabel: `${permLabel} · route`, matter: `Special permission for ${party.name} on ${l.ex.reference}`, ifRefused: PERMISSION_REFUSED_DECIDED_BY, now });
    if (!opened.ok) throw new Refusal(opened.state);
    return { ok: true, message: "Recorded and sent on its route. It is granted once the route approves it." };
  }, p0.vendorId ? [`/suppliers/${p0.vendorId}`] : []);
}

/// A named Person's decision on a step of a special permission's route.
export async function decidePermissionStep(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const now = stampNow();
  const r = new FormReader(data);
  const stepId = r.text("stepId", "Step", { required: true });
  const decision = r.choice("decision", "Decision", ["DONE", "REJECTED"] as const, { required: true });
  const personId = r.text("personId", "Decided by", { required: true });
  const on = r.date("decidedOn", "Decided on", { required: true });
  const reason = r.text("reason", "Reason", { max: 2000 });
  if (decision === "REJECTED" && !reason) r.reject("reason", "Say why it is refused.");
  if (r.failed || !decision || !on) return { ok: false, errors: r.errors };
  const found = await db.approvalStep.findUnique({ where: { id: stepId }, select: { instance: { select: { specialPermission: { select: { id: true, exerciseId: true, party: { select: { vendorId: true } } } } } } } });
  const perm0 = found?.instance.specialPermission;
  if (!perm0) return { ok: false, message: "That step is not on a special permission's route." };
  return onExerciseSide(perm0.exerciseId, async (tx) => {
    await tx.$queryRaw`SELECT id FROM "SpecialPermission" WHERE id = ${perm0.id} FOR UPDATE`;
  }, null, async (tx, l) => {
    const perm = await tx.specialPermission.findUniqueOrThrow({ where: { id: perm0.id }, include: { party: { select: { name: true } }, routes: { where: { status: "PENDING" }, include: { steps: { orderBy: { sequence: "asc" } } } } } });
    const full = perm.routes.find((x) => x.steps.some((s) => s.id === stepId));
    if (!full) return { ok: false, message: "That step is not on a route awaiting a decision." };
    const res = await decideSupplierStep(tx, toAuditActor(actor), l.org, full, stepId, { decision, personId, decidedOn: on, reason, requesterId: perm.requestedByPersonId, routeLabel: `${l.ex.reference} · Special permission for ${perm.party.name} · route`, refusedGoesTo: PERMISSION_REFUSED_DECIDED_BY, now });
    if ("refused" in res) return res.refused;
    if (res.outcome === "REJECTED") return { ok: true, message: "Refused on its route: the permission is not granted." };
    if (res.outcome === "APPROVED") return { ok: true, message: "Approved on its route. Record the day it was granted." };
    return { ok: true };
  }, perm0.party.vendorId ? [`/suppliers/${perm0.party.vendorId}`] : []);
}

/// Grant a special permission its internal route approved, on the day given.
export async function grantSpecialPermission(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const now = stampNow();
  const r = new FormReader(data);
  const permissionId = r.text("permissionId", "Permission", { required: true });
  const granted = r.date("grantedOn", "Granted on", { required: true });
  const personId = r.text("personId", "Recorded by", { required: true });
  if (r.failed) return { ok: false, errors: r.errors };
  const p0 = await db.specialPermission.findUnique({ where: { id: permissionId }, select: { exerciseId: true, partyId: true, party: { select: { vendorId: true } } } });
  if (!p0) return { ok: false, message: "That permission no longer exists." };
  return onExerciseSide(p0.exerciseId, async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ExerciseParty" WHERE id = ${p0.partyId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "SpecialPermission" WHERE id = ${permissionId} FOR UPDATE`;
  }, p0.party.vendorId, async (tx, l) => {
    const perm = await tx.specialPermission.findUniqueOrThrow({ where: { id: permissionId }, include: { party: { select: { name: true } }, routes: { include: { steps: true } } } });
    const w = await tx.exerciseWindow.findUnique({ where: { exerciseId: l.ex.id }, select: { specialPermissionOffered: true } });
    const person = await activePerson(tx, l.org.id, personId);
    const newest = [...perm.routes].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    const grantedOn = granted ? storedDay(granted) : null;
    const fs = grantFaults({ grantedOn, personActive: !!person }, { today: l.org.today, offered: w?.specialPermissionOffered ?? null, granted: perm.grantedOn != null, internalApproval: perm.internalApproval, route: routeState(perm.routes.map((x) => ({ status: x.status, openedAt: x.createdAt.toISOString() }))), approvedOn: approvedOnOf(newest) });
    if (blocking(fs).length) return refuse(fs, "Not granted:");
    const moved = await tx.specialPermission.updateMany({ where: { id: perm.id, grantedOn: null }, data: { grantedOn: dayToDate(grantedOn!), grantedByPersonId: person!.id, grantedAt: now } });
    if (moved.count !== 1) throw new Refusal(CHANGED);
    await audit(tx, toAuditActor(actor), l.org.id, SUPPLIER_ENTITY.permission, perm.id, `${l.ex.reference} · Special permission for ${perm.party.name}`, "UPDATE",
      diffFields({ grantedOn: null }, { grantedOn: grantedOn!, grantedBy: person!.name, recordedOnBehalf: "not signed" }));
    return { ok: true, message: `Granted on ${formatDate(grantedOn!)}.` };
  }, p0.party.vendorId ? [`/suppliers/${p0.party.vendorId}`] : []);
}
