"use server";

import type { FormState } from "@/components/record-editor";
import type { Prisma } from "@/generated/prisma/client";
import { diffFields } from "@/lib/audit/diff";
import type { Tx } from "@/lib/audit/record";
import { dayToDate, storedDay, dayOrNull as day } from "@/lib/dates";
import { hiddenExerciseIds } from "@/lib/auth/sulit-store";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { SUPPLIER_ENTITY } from "@/lib/suppliers/audit-view";
import { CANCELLATION_REFERENCE_MAX, cancellationsOnFile, cancellationStoodUntil, judgedWhileCancelled, notRevisitedWords, openingJudgedOf, recordCancellationFaults, withdrawCancellationFaults, type OpeningJudged } from "@/lib/suppliers/cancellation";
import { nextOffenceNo, recordFaults, requestBlacklistFaults, requestLiftFaults, routeState, withdrawRequestFaults, type RequestFacts } from "@/lib/suppliers/blacklist";
import { documentStates } from "@/lib/suppliers/documents";
import { BLACKLIST_MATTER, REQUEST_KIND_LABEL, STANDING_REFUSED_DECIDED_BY, standingWords, withdrawnWords, withRestrictedOpeningsNote } from "@/lib/suppliers/labels";
import { reinstatementChecklist, reinstatementFaults, suspendFaults } from "@/lib/suppliers/reinstate";
import { documentFacts, typeFacts } from "@/lib/suppliers/repo";
import { standingEventFacts, standingOf, supplierPolicyOf } from "@/lib/suppliers/standing-repo";
import { blocking, SUPPLIER_BLACKLIST_DOMAIN } from "@/lib/suppliers/types";
import { splitValues } from "@/lib/ui/select-logic";
import { FormReader } from "@/lib/validate";

import { approvedOnOf, decideSupplierStep, openSupplierRoute } from "./routes";
import { activePerson, audit, CHANGED, GONE, inSupplier, label, refuse, Refusal, stampNow, type LockedSupplier } from "./shared";
import { toAuditActor, staffForAct } from "@/app/_auth/actor";
import { beginAct } from "@/app/_auth/act";
import type { AuditActor, StaffActor } from "@/lib/auth/types";
import { routeRequesterId } from "@/lib/approvals/requester";
import { inOrder } from "@/lib/series";

/**
 * A supplier's standing (FR-VND-010, FR-TRM-017, plan 6.15 §4.2, increment a2; FR-ADV-010 and 615-C2): suspended by an officer
 * with a reason from the list and the documents it is for; reinstated once each of those stands again,
 * with the checklist answered and a note; blacklisted, or its blacklisting lifted, only on a route on
 * `supplier_blacklist` (OD-8 A) and recorded once that route has approved it, the period computed then
 * from the policy and frozen. Suspension on lapse is derived on read (OD-7 A) and never written. Every
 * act locks the supplier row first (supplier-only path), then the request it changes; re-reads the
 * standing under the lock; audits in the same transaction; names its person "recorded on behalf of,
 * not signed". Events are append-only: the one update is the withdrawal of a registration cancelled recorded in error
 * (615-C2), which writes only its three withdrawal columns and keeps the row.
 */

/// The standing read under the lock, with the supplier's events, documents and requests.
async function lockedStanding(tx: Tx, l: LockedSupplier) {
  const today = l.org.today!;
  const policy = await supplierPolicyOf(l.org.id, tx);
  const st = (await standingOf(l.supplier.id, l.org.id, today, tx, policy))!;
  const [s, requests] = await inOrder(
    () => tx.supplier.findUniqueOrThrow({ where: { id: l.supplier.id, organisationId: l.org.id }, select: { registeredOn: true, documents: true, standingEvents: true } }),
    () => tx.standingRequest.findMany({ where: { supplierId: l.supplier.id }, include: { routes: { include: { steps: true } }, event: { select: { id: true } } } }));
  const requestFacts = (r: (typeof requests)[number]): RequestFacts => {
    const routes = r.routes.map((x) => ({ status: x.status, openedAt: x.createdAt.toISOString() }));
    const newest = [...r.routes].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    return { kind: r.kind, route: routeState(routes), approvedOn: approvedOnOf(newest), recorded: r.event != null, withdrawn: r.withdrawnAt != null };
  };
  return { policy, reading: st.reading, status: st.status, s, requests, requestFacts };
}

const standingLabel = (l: LockedSupplier, what: string) => label(l.supplier, what);

// ------------------------------------------------------------------ suspension and reinstatement

/// Suspend a registered supplier (FR-VND-010): a reason from the list, the day, the documents it is for, an officer.
export async function suspendSupplier(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = stampNow();
  const supplierId = String(data.get("supplierId") ?? "");
  const r = new FormReader(data);
  const reasonId = r.optionalText("reasonId");
  const effective = r.date("effectiveOn", "Takes effect on", { required: true });
  const note = r.text("note", "Note", { max: 2000 });
  const flagged = splitValues(data.get("flaggedDocumentIds"));
  if (r.failed) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "StandingEvent.recordedBy", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  const personId = act.subjectPersonId;
  return inSupplier(actor, supplierId, async (tx, l) => {
    if (!l.org.today) return refuse([{ code: "TIME_ZONE_UNSET", level: "block" }]);
    const { reading, status, s } = await lockedStanding(tx, l);
    const reason = reasonId ? await tx.standingReason.findFirst({ where: { id: reasonId, organisationId: l.org.id } }) : null;
    const person = await activePerson(tx, l.org.id, personId);
    const effectiveOn = effective ? storedDay(effective) : null;
    const fs = suspendFaults({ reasonId, effectiveOn, personActive: !!person, flaggedDocumentIds: flagged }, { today: l.org.today, status, registeredOn: day(s.registeredOn), reading, reason: reason ? { appliesTo: reason.appliesTo, retiredOn: day(reason.retiredOn) } : null, documentIds: s.documents.map((d) => d.id) });
    if (blocking(fs).length) return refuse(fs);
    const flaggedLabels = s.documents.filter((d) => flagged.includes(d.id)).map((d) => `${d.typeLabelSnapshot}${d.reference ? ` ${d.reference}` : ""}`);
    const e = await tx.standingEvent.create({ data: { organisationId: l.org.id, supplierId, kind: "SUSPEND", reasonId: reason!.id, reasonSnapshot: reason!.nameEn, effectiveOn: dayToDate(effectiveOn!), flaggedDocumentIds: flagged, note, recordedByPersonId: person!.id, recordedAt: now } });
    await audit(tx, toAuditActor(actor), l.org.id, SUPPLIER_ENTITY.standingEvent, e.id, standingLabel(l, "Suspension"), "CREATE",
      diffFields(null, { standing: "Suspended", reason: reason!.nameEn, effectiveOn: effectiveOn!, flaggedDocuments: flaggedLabels.join(", ") || null, note: note || null, recordedBy: person!.name }), note);
    await act.write(tx, e.id);
    return { ok: true, message: `Suspended from ${formatDate(effectiveOn!)}. The notice to the supplier is shown, not sent.` };
  });
}

/// Reinstate a suspended supplier: each flagged document's type standing again, none lapsed, the checklist answered, a note.
export async function reinstateSupplier(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = stampNow();
  const supplierId = String(data.get("supplierId") ?? "");
  const r = new FormReader(data);
  const effective = r.date("effectiveOn", "Takes effect on", { required: true });
  const note = r.text("note", "Note", { max: 2000 });
  const checked = splitValues(data.get("checkedDocumentIds"));
  if (r.failed) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "StandingEvent.recordedBy", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  const personId = act.subjectPersonId;
  return inSupplier(actor, supplierId, async (tx, l) => {
    if (!l.org.today) return refuse([{ code: "TIME_ZONE_UNSET", level: "block" }]);
    const { reading, s } = await lockedStanding(tx, l);
    const types = await tx.supplierDocumentType.findMany({ where: { organisationId: l.org.id } });
    const docs = s.documents.map(documentFacts);
    const states = documentStates(types.map(typeFacts), docs, l.org.today);
    const checklist = reading.suspension ? reinstatementChecklist(reading.suspension, (docId) => {
      const d = docs.find((x) => x.id === docId);
      const st = d ? states.find((x) => x.type.id === d.typeId) : null;
      return d && st ? { typeLabel: st.type.label, state: st.state } : null;
    }) : [];
    const person = await activePerson(tx, l.org.id, personId);
    const effectiveOn = effective ? storedDay(effective) : null;
    const fs = reinstatementFaults({ checkedDocumentIds: checked, note, effectiveOn, personActive: !!person }, { today: l.org.today, reading, checklist });
    if (blocking(fs).length) return refuse(fs, "Not reinstated:");
    const susp = reading.suspension!;
    const answered = checklist.map((c) => ({ documentId: c.documentId, type: c.typeLabel, seenVerified: true }));
    const e = await tx.standingEvent.create({ data: { organisationId: l.org.id, supplierId, kind: "REINSTATE", effectiveOn: dayToDate(effectiveOn!), reinstatesEventId: susp.id, checklist: answered as unknown as Prisma.InputJsonValue, note, recordedByPersonId: person!.id, recordedAt: now } });
    await audit(tx, toAuditActor(actor), l.org.id, SUPPLIER_ENTITY.standingEvent, e.id, standingLabel(l, "Reinstatement"), "CREATE",
      diffFields(null, { standing: "Reinstated", effectiveOn: effectiveOn!, checklist: answered.map((a) => `${a.type}: seen verified`).join("; ") || "No document was flagged", note, recordedBy: person!.name }), note);
    await act.write(tx, e.id);
    return { ok: true, message: `Reinstated from ${formatDate(effectiveOn!)}. The notice to the supplier is shown, not sent.` };
  });
}

// ------------------------------------------------------------------ blacklisting (OD-8 A)

/// Ask for a blacklisting: a reason from the list, an officer, and (from a cancelled award) the award. Opens its route.
export async function requestBlacklisting(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = stampNow();
  const supplierId = String(data.get("supplierId") ?? "");
  const r = new FormReader(data);
  const reasonId = r.optionalText("reasonId");
  const note = r.text("note", "Note", { max: 2000 });
  const sourceAwardId = r.optionalText("sourceAwardId");
  if (r.failed) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "StandingRequest.requestedBy", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  const personId = act.subjectPersonId;
  return inSupplier(actor, supplierId, async (tx, l) => {
    if (!l.org.today) return refuse([{ code: "TIME_ZONE_UNSET", level: "block" }]);
    const { reading, status, requests, requestFacts } = await lockedStanding(tx, l);
    const reason = reasonId ? await tx.standingReason.findFirst({ where: { id: reasonId, organisationId: l.org.id } }) : null;
    const person = await activePerson(tx, l.org.id, personId);
    const award = sourceAwardId ? await tx.award.findFirst({ where: { id: sourceAwardId, organisationId: l.org.id }, select: { id: true, reference: true, status: true, cancelConsequence: true, vendorId: true } }) : null;
    const fs = requestBlacklistFaults(
      { reasonId, personActive: !!person, sourceAward: sourceAwardId ? { cancelledForBlacklisting: award?.status === "CANCELLED" && award.cancelConsequence === "CANCEL_AND_BLACKLIST", vendorId: award?.vendorId ?? null } : null },
      { today: l.org.today, supplierId, status, standing: reading.standing, reason: reason ? { appliesTo: reason.appliesTo, retiredOn: day(reason.retiredOn) } : null, requests: requests.map(requestFacts) },
    );
    if (blocking(fs).length) return refuse(fs);
    const req = await tx.standingRequest.create({ data: { organisationId: l.org.id, supplierId, kind: "BLACKLIST", reasonId: reason!.id, reasonSnapshot: reason!.nameEn, note, sourceAwardId: award?.id ?? null, requestedByPersonId: person!.id, requestedAt: now } });
    await audit(tx, toAuditActor(actor), l.org.id, SUPPLIER_ENTITY.standingRequest, req.id, standingLabel(l, "Blacklisting asked for"), "CREATE",
      diffFields(null, { askedFor: REQUEST_KIND_LABEL.BLACKLIST.en, reason: reason!.nameEn, note: note || null, fromAward: award?.reference ?? null, askedBy: person!.name }), note);
    await act.write(tx, req.id);
    const opened = await openSupplierRoute(tx, toAuditActor(actor), l.org, { domain: SUPPLIER_BLACKLIST_DOMAIN, cond: "BLACKLIST", owner: { standingRequestId: req.id }, requester: person!, what: BLACKLIST_MATTER, routeLabel: standingLabel(l, "Blacklisting route"), matter: `Blacklisting of ${l.supplier.registeredName}`, ifRefused: STANDING_REFUSED_DECIDED_BY, now });
    if (!opened.ok) throw new Refusal(opened.state);
    return { ok: true, message: "Asked for, and sent on its route. It is recorded once the route approves it." };
  });
}

/// Ask for a blacklisting in effect to be lifted, saying why. Opens its route.
export async function requestBlacklistLift(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = stampNow();
  const supplierId = String(data.get("supplierId") ?? "");
  const r = new FormReader(data);
  const note = r.text("note", "Why", { max: 2000 });
  if (r.failed) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "StandingRequest.requestedBy", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  const personId = act.subjectPersonId;
  return inSupplier(actor, supplierId, async (tx, l) => {
    if (!l.org.today) return refuse([{ code: "TIME_ZONE_UNSET", level: "block" }]);
    const { reading, requests, requestFacts } = await lockedStanding(tx, l);
    const person = await activePerson(tx, l.org.id, personId);
    const fs = requestLiftFaults({ note, personActive: !!person }, { today: l.org.today, standing: reading.standing, requests: requests.map(requestFacts) });
    if (blocking(fs).length) return refuse(fs);
    const b = reading.blacklist!;
    const req = await tx.standingRequest.create({ data: { organisationId: l.org.id, supplierId, kind: "BLACKLIST_LIFT", reasonSnapshot: b.reasonLabel, liftsEventId: b.id, note, requestedByPersonId: person!.id, requestedAt: now } });
    await audit(tx, toAuditActor(actor), l.org.id, SUPPLIER_ENTITY.standingRequest, req.id, standingLabel(l, "Lifting asked for"), "CREATE",
      diffFields(null, { askedFor: REQUEST_KIND_LABEL.BLACKLIST_LIFT.en, lifts: `the blacklisting from ${formatDate(b.effectiveOn)} (${b.reasonLabel})`, note, askedBy: person!.name }), note);
    await act.write(tx, req.id);
    const opened = await openSupplierRoute(tx, toAuditActor(actor), l.org, { domain: SUPPLIER_BLACKLIST_DOMAIN, cond: "BLACKLIST_LIFT", owner: { standingRequestId: req.id }, requester: person!, what: BLACKLIST_MATTER, routeLabel: standingLabel(l, "Blacklisting lift route"), matter: `Lifting the blacklisting of ${l.supplier.registeredName}`, ifRefused: STANDING_REFUSED_DECIDED_BY, now });
    if (!opened.ok) throw new Refusal(opened.state);
    return { ok: true, message: "Asked for, and sent on its route. The lifting is recorded once the route approves it." };
  });
}

/// A named Person's decision on a step of a blacklisting (or lift) route. Approving the last step approves the route; the event is recorded after.
export async function decideStandingStep(_prev: FormState, data: FormData): Promise<FormState> {
  const holderGuard = await staffForAct("HOLDER_CHECKED");
  if (!holderGuard.ok) return holderGuard.state;
  const actor = holderGuard.actor;
  const now = stampNow();
  const r = new FormReader(data);
  const stepId = r.text("stepId", "Step", { required: true });
  const decision = r.choice("decision", "Decision", ["DONE", "REJECTED"] as const, { required: true });
  r.date("decidedOn", "Decided on");
  const reason = r.text("reason", "Reason", { max: 2000 });
  if (decision === "REJECTED" && !reason) r.reject("reason", "Say why it is refused.");
  if (r.failed || !decision) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "ApprovalStep.decidedBy", { personField: "personId", dateField: "decidedOn" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  const on = dayToDate(act.day!);
  const found = await db.approvalStep.findUnique({ where: { id: stepId, instance: { organisationId: actor.organisationId } }, select: { instance: { select: { standingRequestId: true, standingRequest: { select: { supplierId: true } } } } } });
  const requestId = found?.instance.standingRequestId ?? null;
  const supplierId = found?.instance.standingRequest?.supplierId ?? null;
  if (!requestId || !supplierId) return { ok: false, message: "That step is not on a supplier's blacklisting route." };
  return inSupplier(actor, supplierId, async (tx, l) => {
    await tx.$queryRaw`SELECT id FROM "StandingRequest" WHERE id = ${requestId} FOR UPDATE`;
    const req = await tx.standingRequest.findUniqueOrThrow({ where: { id: requestId, organisationId: actor.organisationId }, include: { routes: { where: { status: "PENDING" }, include: { steps: { orderBy: { sequence: "asc" } } } } } });
    const full = req.routes.find((x) => x.steps.some((s) => s.id === stepId));
    if (!full) return { ok: false, message: "That step is not on a route awaiting a decision." };
    const res = await decideSupplierStep(tx, toAuditActor(actor), l.org, full, stepId, { decision, act, document: { entity: "StandingRequest", id: req.id }, decidedOn: on, reason, requesterId: routeRequesterId("STANDING_REQUEST", { requestRaiserId: req.requestedByPersonId }) ?? "", routeLabel: standingLabel(l, req.kind === "BLACKLIST" ? "Blacklisting route" : "Blacklisting lift route"), refusedGoesTo: STANDING_REFUSED_DECIDED_BY, now });
    if ("refused" in res) return res.refused;
    if (res.outcome === "REJECTED") return { ok: true, message: "Refused on its route: nothing is recorded. It may be asked for again." };
    if (res.outcome === "APPROVED") return { ok: true, message: `Approved on its route. Record the ${req.kind === "BLACKLIST" ? "blacklisting" : "lifting"} on the supplier's Standing tab, with the day it takes effect.` };
    return { ok: true };
  });
}

async function recordFromRequest(scope: StaffActor, actor: AuditActor, data: FormData, kind: "BLACKLIST" | "BLACKLIST_LIFT"): Promise<FormState> {
  const now = stampNow();
  const r = new FormReader(data);
  const requestId = r.text("requestId", "Request", { required: true });
  const effective = r.date("effectiveOn", "Takes effect on", { required: true });
  if (r.failed) return { ok: false, errors: r.errors };
  const begun = await beginAct(scope, data, "StandingEvent.recordedBy", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  const personId = act.subjectPersonId;
  const found = await db.standingRequest.findUnique({ where: { id: requestId, organisationId: scope.organisationId }, select: { supplierId: true } });
  if (!found) return GONE;
  return inSupplier(scope, found.supplierId, async (tx, l) => {
    if (!l.org.today) return refuse([{ code: "TIME_ZONE_UNSET", level: "block" }]);
    await tx.$queryRaw`SELECT id FROM "StandingRequest" WHERE id = ${requestId} FOR UPDATE`;
    const { policy, reading, s, requests, requestFacts } = await lockedStanding(tx, l);
    const req = requests.find((x) => x.id === requestId);
    if (!req || req.kind !== kind) return { ok: false, message: "That request is not one this records." };
    const person = await activePerson(tx, l.org.id, personId);
    const effectiveOn = effective ? storedDay(effective) : null;
    const offenceNo = nextOffenceNo(s.standingEvents.map(standingEventFacts));
    const { faults, period } = recordFaults({ effectiveOn, personActive: !!person }, { today: l.org.today, request: requestFacts(req), standing: reading.standing, offenceNo, months: policy.blacklistFirstOffenceMonths });
    if (blocking(faults).length) return refuse(faults, "Not recorded:");
    if (kind === "BLACKLIST") {
      const ends = period?.kind === "ENDS" ? period : null;
      const e = await tx.standingEvent.create({ data: { organisationId: l.org.id, supplierId: l.supplier.id, kind: "BLACKLIST", reasonId: req.reasonId, reasonSnapshot: req.reasonSnapshot, effectiveOn: dayToDate(effectiveOn!), endsOn: ends ? dayToDate(ends.endsOn) : null, offenceNo, periodMonths: ends?.months ?? null, requestId: req.id, note: req.note, recordedByPersonId: person!.id, recordedAt: now } });
      await audit(tx, actor, l.org.id, SUPPLIER_ENTITY.standingEvent, e.id, standingLabel(l, "Blacklisting"), "CREATE",
        diffFields(null, { standing: "Blacklisted", reason: req.reasonSnapshot, effectiveOn: effectiveOn!, offence: offenceNo === 1 ? "First offence" : `Offence ${offenceNo}`, period: ends ? `${ends.months} months` : "Until further notice", lastBlacklistedDay: ends?.lastDay ?? null, endsOn: ends?.endsOn ?? null, recordedBy: person!.name }));
      await act.write(tx, e.id);
      return { ok: true, message: ends ? `Blacklisted from ${formatDate(effectiveOn!)} (first offence, ${ends.months} months): last blacklisted day ${formatDate(ends.lastDay)} · free from ${formatDate(ends.endsOn)}. The notice is shown, not sent.` : `Blacklisted from ${formatDate(effectiveOn!)}, until further notice. The notice is shown, not sent.` };
    }
    const lifted = reading.blacklist!;
    if (req.liftsEventId !== lifted.id) return { ok: false, message: "The blacklisting this lift asked to end is no longer the one in effect. Ask again." };
    const e = await tx.standingEvent.create({ data: { organisationId: l.org.id, supplierId: l.supplier.id, kind: "BLACKLIST_LIFT", reasonSnapshot: req.reasonSnapshot, effectiveOn: dayToDate(effectiveOn!), liftsEventId: lifted.id, requestId: req.id, note: req.note, recordedByPersonId: person!.id, recordedAt: now } });
    await audit(tx, actor, l.org.id, SUPPLIER_ENTITY.standingEvent, e.id, standingLabel(l, "Blacklisting lifted"), "CREATE",
      diffFields({ standing: standingWords(reading).en }, { standing: "Blacklisting lifted", effectiveOn: effectiveOn!, lifts: `the blacklisting from ${formatDate(lifted.effectiveOn)}`, note: req.note, recordedBy: person!.name }));
    await act.write(tx, e.id);
    return { ok: true, message: `The blacklisting is lifted from ${formatDate(effectiveOn!)}. The notice is shown, not sent.` };
  });
}

/// Record a blacklisting its route approved (FR-TRM-017): the period from the policy now, frozen on the event.
export async function recordBlacklisting(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  return recordFromRequest(actor, toAuditActor(actor), data, "BLACKLIST");
}

/// Record the lifting of a blacklisting its route approved.
export async function liftBlacklisting(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  return recordFromRequest(actor, toAuditActor(actor), data, "BLACKLIST_LIFT");
}

/**
 * Withdraw a blacklisting request, or a lift's, with the reason (fix R-7): one its route approved but that
 * can no longer be recorded, or one whose route never opened. It is closed, never recorded, and no longer
 * holds the supplier open, so another may be asked for. Audited; recorded on the officer's behalf, not signed.
 */
export async function withdrawStandingRequest(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = stampNow();
  const requestId = String(data.get("requestId") ?? "");
  const r = new FormReader(data);
  const reason = String(data.get("reason") ?? "").trim();
  if (r.failed) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "StandingRequest.withdrawnBy", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  const personId = act.subjectPersonId;
  const found = await db.standingRequest.findUnique({ where: { id: requestId, organisationId: actor.organisationId }, select: { supplierId: true } });
  if (!found) return GONE;
  return inSupplier(actor, found.supplierId, async (tx, l) => {
    if (!l.org.today) return refuse([{ code: "TIME_ZONE_UNSET", level: "block" }]);
    await tx.$queryRaw`SELECT id FROM "StandingRequest" WHERE id = ${requestId} FOR UPDATE`;
    const { requests, requestFacts } = await lockedStanding(tx, l);
    const req = requests.find((x) => x.id === requestId);
    if (!req) return GONE;
    const person = await activePerson(tx, l.org.id, personId);
    const fs = withdrawRequestFaults({ reason, personActive: !!person }, { today: l.org.today, request: requestFacts(req) });
    if (blocking(fs).length) {
      const reasonFault = fs.find((f) => f.code === "WITHDRAW_REASON_REQUIRED");
      const rest = blocking(fs).filter((f) => f !== reasonFault);
      return rest.length ? refuse(rest, "Not withdrawn:") : { ok: false, errors: { reason: refuse([reasonFault!], "").message!.trim() } };
    }
    const moved = await tx.standingRequest.updateMany({ where: { id: req.id, withdrawnAt: null, event: null }, data: { withdrawnAt: now, withdrawnReason: reason, withdrawnByPersonId: person!.id } });
    if (moved.count !== 1) throw new Refusal(CHANGED);
    await audit(tx, toAuditActor(actor), l.org.id, SUPPLIER_ENTITY.standingRequest, req.id, standingLabel(l, req.kind === "BLACKLIST" ? "Blacklisting asked for" : "Lifting asked for"), "UPDATE",
      diffFields({ withdrawn: null }, { withdrawn: "Withdrawn: not recorded", withdrawnBy: person!.name }), reason);
    await act.write(tx, req.id);
    return { ok: true, message: "Withdrawn. Nothing is recorded from it; another may be asked for." };
  });
}

// ------------------------------------------------------------------ a registration cancelled (615-C2, BD-613-91)

/**
 * Record a registration body's cancellation of the supplier's registration (FR-ADV-010; ADR 0019 Amendment 1): a fact, with
 * the body (its label frozen), the body's reference and the day it takes effect. No route. The only writer of
 * REGISTRATION_CANCELLED (cancellation-scan.test.ts). The body's notice is attached on the record afterwards.
 */
export async function recordRegistrationCancelled(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = stampNow();
  const supplierId = String(data.get("supplierId") ?? "");
  const r = new FormReader(data);
  const bodyId = r.optionalText("cancellingBodyId");
  const reference = r.text("externalReference", "The body's reference", { required: true, max: CANCELLATION_REFERENCE_MAX });
  const effective = r.date("effectiveOn", "Takes effect on", { required: true });
  const note = r.text("note", "Note", { max: 2000 });
  if (r.failed) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "StandingEvent.recordedBy", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  const personId = act.subjectPersonId;
  return inSupplier(actor, supplierId, async (tx, l) => {
    if (!l.org.today) return refuse([{ code: "TIME_ZONE_UNSET", level: "block" }]);
    const { reading, status, s } = await lockedStanding(tx, l);
    const body = bodyId ? await tx.registrationBody.findFirst({ where: { id: bodyId, organisationId: l.org.id }, select: { id: true, labelEn: true } }) : null;
    const person = await activePerson(tx, l.org.id, personId);
    const effectiveOn = effective ? storedDay(effective) : null;
    const fs = recordCancellationFaults({ bodyId, reference, effectiveOn, personActive: !!person }, { today: l.org.today, status, registeredOn: day(s.registeredOn), reading, bodyConfigured: bodyId ? !!body : null });
    if (blocking(fs).length) return refuse(fs, "Not recorded:");
    const ref = reference.trim();
    const e = await tx.standingEvent.create({ data: { organisationId: l.org.id, supplierId, kind: "REGISTRATION_CANCELLED", cancellingBodyId: body!.id, bodyLabelSnapshot: body!.labelEn, externalReference: ref, cancelsRegistrationOn: s.registeredOn!, effectiveOn: dayToDate(effectiveOn!), note, recordedByPersonId: person!.id, recordedAt: now } });
    await audit(tx, toAuditActor(actor), l.org.id, SUPPLIER_ENTITY.standingEvent, e.id, standingLabel(l, "Registration cancelled"), "CREATE",
      diffFields(null, { standing: "Registration cancelled", cancelledBy: body!.labelEn, bodyReference: ref, effectiveOn: effectiveOn!, note: note || null, recordedBy: person!.name }), note);
    await act.write(tx, e.id);
    return { ok: true, message: `Recorded: the registration is cancelled from ${formatDate(effectiveOn!)}, by ${body!.labelEn} (${ref}). Attach the body's notice on the record. The notice to the supplier is shown, not sent.` };
  });
}

/// S-4: each bid opened for a party linked to this supplier, with the register's finding frozen on it.
/// `hidden`: the restricted exercises the reader may not see (FR-MTD-007); a bid opened on one is left out, as the supplier's page leaves out the participation.
async function openingsJudged(client: Tx, supplierId: string, hidden: readonly string[]): Promise<OpeningJudged[]> {
  const bids = await client.openedBid.findMany({ where: { party: { vendorId: supplierId, ...(hidden.length ? { exerciseId: { notIn: [...hidden] } } : {}) } }, select: { listingNo: true, eligibilityFinding: true, verdict: true, party: { select: { exercise: { select: { reference: true } } } } } });
  return bids.flatMap((b) => openingJudgedOf(b.party.exercise.reference, b) ?? []);
}

/**
 * Withdraw a registration cancelled that was recorded in error (615-C2, BD-613-91): with the reason and the officer, audited;
 * the row is kept and shown withdrawn, and the standing rule reads it as never recorded. A cancellation that stood is not
 * withdrawn: the supplier registers again.
 */
export async function withdrawRegistrationCancelled(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = stampNow();
  const eventId = String(data.get("eventId") ?? "");
  const r = new FormReader(data);
  const reason = String(data.get("reason") ?? "").trim();
  if (r.failed) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "StandingEvent.withdrawnBy", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  const personId = act.subjectPersonId;
  const found = await db.standingEvent.findUnique({ where: { id: eventId, organisationId: actor.organisationId }, select: { supplierId: true } });
  if (!found) return GONE;
  return inSupplier(actor, found.supplierId, async (tx, l) => {
    if (!l.org.today) return refuse([{ code: "TIME_ZONE_UNSET", level: "block" }]);
    await tx.$queryRaw`SELECT id FROM "StandingEvent" WHERE id = ${eventId} FOR UPDATE`;
    const ev = await tx.standingEvent.findFirst({ where: { id: eventId, supplierId: l.supplier.id, organisationId: actor.organisationId }, select: { id: true, kind: true, withdrawnAt: true, effectiveOn: true, bodyLabelSnapshot: true, externalReference: true } });
    const { reading, s: file } = await lockedStanding(tx, l);
    const person = await activePerson(tx, l.org.id, personId);
    const fs = withdrawCancellationFaults({ reason, personActive: !!person }, { today: l.org.today, event: ev ? { kind: ev.kind, withdrawn: ev.withdrawnAt != null } : null });
    if (blocking(fs).length) {
      const reasonFault = fs.find((f) => f.code === "CANCELLATION_WITHDRAW_REASON_REQUIRED");
      const rest = blocking(fs).filter((f) => f !== reasonFault);
      return rest.length ? refuse(rest, "Not withdrawn:") : { ok: false, errors: { reason: refuse([reasonFault!], "").message!.trim() } };
    }
    const moved = await tx.standingEvent.updateMany({ where: { id: ev!.id, kind: "REGISTRATION_CANCELLED", withdrawnAt: null }, data: { withdrawnAt: now, withdrawnReason: reason, withdrawnByPersonId: person!.id } });
    if (moved.count !== 1) throw new Refusal(CHANGED);
    // S-2 (Run 0 fix round): the standing re-read in this transaction after the update, so the audit holds the real after
    // value; where the standing did not change (a suspension or blacklisting still ranks above, or the cancellation had
    // already ended) the field is left out rather than written as an empty change.
    const after = (await lockedStanding(tx, l)).reading;
    const [was, standingAfter] = [standingWords(reading).en, standingWords(after).en];
    const nowWords = was !== standingAfter ? standingWords(after) : null;
    // S-4: the openings that judged the supplier cancelled while the record stood are named, and not revisited. C1: only
    // while it stood, up to the supplier registering again or the next live cancellation (the panel bounds it alike).
    const hidden = await hiddenExerciseIds(tx, actor);
    const judged = judgedWhileCancelled(await openingsJudged(tx, l.supplier.id, hidden), storedDay(ev!.effectiveOn), cancellationStoodUntil({ id: ev!.id, effectiveOn: storedDay(ev!.effectiveOn) }, cancellationsOnFile(file.standingEvents), day(file.registeredOn)));
    const notRevisited = hidden.length ? withRestrictedOpeningsNote(notRevisitedWords(judged)) : notRevisitedWords(judged);
    await audit(tx, toAuditActor(actor), l.org.id, SUPPLIER_ENTITY.standingEvent, ev!.id, standingLabel(l, "Registration cancelled"), "UPDATE",
      diffFields({ withdrawn: null, ...(was !== standingAfter ? { standing: was } : {}) }, { withdrawn: `Withdrawn: recorded in error (the cancellation by ${ev!.bodyLabelSnapshot}, ${ev!.externalReference}, from ${formatDate(storedDay(ev!.effectiveOn))})`, ...(was !== standingAfter ? { standing: standingAfter } : {}), withdrawnBy: person!.name, notRevisited: notRevisited.en }), reason);
    await act.write(tx, ev!.id);
    return { ok: true, message: withdrawnWords(nowWords, notRevisited).en };
  });
}
