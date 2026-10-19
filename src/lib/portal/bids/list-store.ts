import type { Tx } from "@/lib/audit/record";
import type { SupplierActor } from "@/lib/auth/types";
import { dayIn, storedDay } from "@/lib/dates";
import { exerciseOrg } from "@/lib/method/repo";
import type { ExerciseStatus } from "@/lib/method/types";
import { instantText, isIssuedAward, isPublicOpportunity, opportunityState, type OpportunityState } from "@/lib/portal/public";
import { exercisePhase } from "./context-store";
import { noticeBody, noticeStands, SUPERSEDED_NOTICE_WORDS } from "./non-award";
import { partChips, type PartChip, type PartFacts } from "./part";
import { sortNotices, type PortalNotice } from "./notices";
import { windowFault } from "./signup";
import { supplierSees } from "./visibility";
import { inOrder } from "@/lib/series";

/**
 * What the My Bids list reads (Phase 4d): the exercises the signed-in supplier takes part in, with its own part in each, and the notices it is shown. Reads only, in the caller's client. Every read names the
 * SESSION's supplier and organisation, and a row is returned only for an exercise `supplierSees` allows (a public opportunity, or one the office linked a party of this supplier to).
 * "Takes part" is: a party of the supplier on the exercise, or anything the supplier did itself there (a sign-up, an acknowledgement, a request for the documents, an inspection of the documents).
 */

export interface MyExerciseRow {
  id: string;
  reference: string;
  title: string;
  state: OpportunityState;
  /// The closing as the organisation reads it, or null where none is set.
  closing: string | null;
  closingDay: string | null;
  chips: PartChip[];
  via: "PUBLIC" | "LINKED";
}

const ROW_STATUSES = ["ADVERTISED", "INVITED", "OPENING_IN_PROGRESS", "OPENED", "UNDER_EVALUATION", "EVALUATED", "CANCELLED"] as const;

export async function loadMyExercises(client: Tx, actor: Pick<SupplierActor, "supplierId" | "organisationId">, now: Date = new Date()): Promise<MyExerciseRow[]> {
  const org = await exerciseOrg(actor.organisationId, client);
  if (!org) return [];
  const own = { organisationId: actor.organisationId, supplierId: actor.supplierId };
  const [parties, signUps, requests, acks, inspections] = await inOrder(
    () => client.exerciseParty.findMany({ where: { organisationId: actor.organisationId, vendorId: actor.supplierId }, select: { id: true, exerciseId: true } }),
    () => client.siteEventRegistration.findMany({ where: own, select: { endedAt: true, event: { select: { cancelledAt: true, window: { select: { exerciseId: true } } } } } }),
    () => client.documentRequest.findMany({ where: own, select: { refusedAt: true, endedAt: true, window: { select: { exerciseId: true } } } }),
    () => client.addendumAcknowledgement.findMany({ where: own, select: { addendumId: true, addendum: { select: { window: { select: { exerciseId: true } } } } } }),
    () => client.tenderInspectionEvent.findMany({ where: own, select: { window: { select: { exerciseId: true } } }, distinct: ["windowId"] }));
  const partyIds = parties.map((p) => p.id);
  const ids = new Set<string>([...parties.map((p) => p.exerciseId), ...signUps.map((s) => s.event.window.exerciseId), ...requests.map((r) => r.window.exerciseId), ...acks.map((a) => a.addendum.window.exerciseId), ...inspections.map((i) => i.window.exerciseId)]);
  if (ids.size === 0) return [];

  const [exercises, sales, recipients, opened, notices] = await inOrder(
    () => client.sourcingExercise.findMany({
      where: { organisationId: actor.organisationId, id: { in: [...ids] }, status: { in: [...ROW_STATUSES] } },
      select: { id: true, reference: true, title: true, status: true, restricted: true, closingAt: true, awards: { select: { status: true } }, window: { select: { path: true, publishedAt: true, purchaseFromDay: true, purchaseCloseDay: true } } },
    }),
    () => partyIds.length ? client.documentSale.findMany({ where: { organisationId: actor.organisationId, partyId: { in: partyIds }, voidedAt: null }, select: { window: { select: { exerciseId: true } } } }) : Promise.resolve([]),
    () => partyIds.length ? client.addendumRecipient.findMany({ where: { organisationId: actor.organisationId, partyId: { in: partyIds }, addendum: { status: "ISSUED" } }, select: { addendumId: true, addendum: { select: { window: { select: { exerciseId: true } } } } } }) : Promise.resolve([]),
    () => partyIds.length ? client.openedBid.findMany({ where: { organisationId: actor.organisationId, partyId: { in: partyIds } }, select: { exerciseId: true }, distinct: ["exerciseId"] }) : Promise.resolve([]),
    () => partyIds.length ? client.nonAwardNotice.findMany({ where: { organisationId: actor.organisationId, partyId: { in: partyIds } }, select: { exerciseId: true, award: { select: { status: true } } } }) : Promise.resolve([]));

  const count = <T>(xs: readonly T[], of: (x: T) => string, id: string) => xs.filter((x) => of(x) === id).length;
  const acked = new Set(acks.map((a) => a.addendumId));
  const linked = new Set(parties.map((p) => p.exerciseId));
  const out: MyExerciseRow[] = [];
  for (const e of exercises) {
    const status = e.status as ExerciseStatus;
    const seen = supplierSees({
      publicOpportunity: isPublicOpportunity({ status, restricted: e.restricted, closingAt: e.closingAt, window: e.window ? { path: e.window.path, publishedAt: e.window.publishedAt } : null }),
      windowPublished: e.window?.publishedAt != null,
      linkedParty: linked.has(e.id),
    });
    if (!seen.seen) continue;
    const facts: PartFacts = {
      bought: count(sales, (s) => s.window.exerciseId, e.id) > 0,
      requested: requests.some((r) => r.window.exerciseId === e.id && r.refusedAt == null && r.endedAt == null),
      signUps: signUps.filter((s) => s.event.window.exerciseId === e.id && s.endedAt == null && s.event.cancelledAt == null).length,
      // Waiting only while it can still be acknowledged: after the closing, or once the exercise is cancelled, an addendum not acknowledged is no longer a thing to do.
      toAcknowledge: windowFault(exercisePhase(e, now, org.timeZone)) == null ? recipients.filter((r) => r.addendum.window.exerciseId === e.id && !acked.has(r.addendumId)).length : 0,
      opened: count(opened, (o) => o.exerciseId, e.id) > 0,
      // A notice counts while the award it was issued under stands.
      outcomeNotice: notices.some((n) => n.exerciseId === e.id && noticeStands(n.award.status)),
      inspected: count(inspections, (i) => i.window.exerciseId, e.id) > 0,
    };
    out.push({
      id: e.id,
      reference: e.reference,
      title: e.title,
      state: opportunityState({ status, closingAt: e.closingAt }, e.awards.some((a) => isIssuedAward(a.status)), now),
      closing: e.closingAt && status !== "CANCELLED" ? instantText(e.closingAt, org.timeZone) : null,
      closingDay: e.closingAt && org.timeZone ? dayIn(e.closingAt, org.timeZone) : null,
      chips: partChips(facts),
      via: seen.via,
    });
  }
  // The latest closing first; an exercise with none, last.
  return out.sort((a, b) => (b.closingDay ?? "").localeCompare(a.closingDay ?? "") || a.reference.localeCompare(b.reference));
}

/**
 * The notices this supplier is shown, across its exercises (FR-ADV-012, 014, 015, 016, FR-AWD-010). The recipients are the office's: a party with a copy of an addendum (a later purchaser gets every issued addendum
 * "with the documents"), and a party that bought the documents or was invited, for a closing change that was applied and a cancellation that was applied. A notice of non-award is the one issued to the supplier's party.
 * Shown in the portal, not sent (INT-09). Reading one sets nothing the officers record.
 */
export async function loadMyNotices(client: Tx, actor: Pick<SupplierActor, "supplierId" | "organisationId">, now: Date = new Date()): Promise<PortalNotice[]> {
  const parties = await client.exerciseParty.findMany({
    where: { organisationId: actor.organisationId, vendorId: actor.supplierId },
    select: { id: true, exerciseId: true, exercise: { select: { reference: true, title: true, restricted: true, status: true, closingAt: true, window: { select: { publishedAt: true, purchaseFromDay: true, purchaseCloseDay: true } } } }, letters: { select: { id: true } }, sales: { where: { voidedAt: null }, select: { id: true } } },
  });
  // A party sees nothing of an exercise whose window was not published (a proposed invitee on a name route is not yet invited).
  const mine = parties.filter((p) => p.exercise.window?.publishedAt != null);
  if (mine.length === 0) return [];
  const partyIds = mine.map((p) => p.id);
  const byExercise = new Map(mine.map((p) => [p.exerciseId, p.exercise]));
  const notified = mine.filter((p) => p.sales.length > 0 || p.letters.length > 0).map((p) => p.exerciseId);

  const [recipients, acks, changes, cancellations, nonAward] = await inOrder(
    () => client.addendumRecipient.findMany({
      where: { organisationId: actor.organisationId, partyId: { in: partyIds }, addendum: { status: "ISSUED" } },
      select: { addendumId: true, addendum: { select: { number: true, title: true, whatChanged: true, issuedOn: true, window: { select: { exerciseId: true } } } } },
    }),
    () => client.addendumAcknowledgement.findMany({ where: { organisationId: actor.organisationId, supplierId: actor.supplierId }, select: { addendumId: true, acknowledgedOn: true } }),
    () => notified.length ? client.closingChange.findMany({ where: { organisationId: actor.organisationId, appliedAt: { not: null }, window: { exerciseId: { in: notified } } }, select: { id: true, kind: true, fromClosingAt: true, toClosingAt: true, appliedAt: true, window: { select: { exerciseId: true, exercise: { select: { id: true } } } } } }) : Promise.resolve([]),
    () => notified.length ? client.windowCancellation.findMany({ where: { organisationId: actor.organisationId, appliedAt: { not: null }, window: { exerciseId: { in: notified } } }, select: { id: true, feeRefund: true, appliedAt: true, window: { select: { exerciseId: true } } } }) : Promise.resolve([]),
    () => client.nonAwardNotice.findMany({ where: { organisationId: actor.organisationId, partyId: { in: partyIds } }, select: { id: true, exerciseId: true, outcomeText: true, reasonText: true, issuedOn: true, award: { select: { status: true } } } }));
  const org = await exerciseOrg(actor.organisationId, client);
  const tz = org?.timeZone ?? null;
  const ackOn = new Map(acks.map((a) => [a.addendumId, storedDay(a.acknowledgedOn)]));
  const ex = (id: string) => byExercise.get(id)!;
  const out: PortalNotice[] = [];
  const seenAddenda = new Set<string>();
  for (const r of recipients) {
    if (seenAddenda.has(r.addendumId)) continue;
    seenAddenda.add(r.addendumId);
    const exId = r.addendum.window.exerciseId;
    const e = byExercise.get(exId);
    if (!e || !r.addendum.issuedOn) continue;
    // Whether it can still be acknowledged is the window's phase, as the act reads it.
    const canAcknowledge = windowFault(exercisePhase(e, now, tz)) == null;
    out.push({ key: `addendum:${r.addendumId}`, kind: "ADDENDUM", exerciseId: exId, exerciseReference: e.reference, exerciseTitle: e.title, on: storedDay(r.addendum.issuedOn), title: `Addendum ${r.addendum.number ?? ""}: ${r.addendum.title}`.replace("Addendum :", "Addendum:"), body: r.addendum.whatChanged, addendum: { id: r.addendumId, acknowledgedOn: ackOn.get(r.addendumId) ?? null, canAcknowledge } });
  }
  for (const c of changes) {
    const exId = c.window.exerciseId;
    if (!byExercise.has(exId) || !c.appliedAt) continue;
    out.push({
      key: `closing:${c.id}`,
      kind: "CLOSING_CHANGED",
      exerciseId: exId,
      exerciseReference: ex(exId).reference,
      exerciseTitle: ex(exId).title,
      on: dayIn(c.appliedAt, tz),
      title: c.kind === "EXTENSION" ? "The closing was extended" : "The closing was corrected",
      // The officers' own reason is written for the approvers, not for tenderers, and is never shown here.
      body: `The closing moved from ${instantText(c.fromClosingAt, tz)} to ${instantText(c.toClosingAt, tz)}.`,
    });
  }
  for (const c of cancellations) {
    const exId = c.window.exerciseId;
    if (!byExercise.has(exId) || !c.appliedAt) continue;
    out.push({
      key: `cancelled:${c.id}`,
      kind: "EXERCISE_CANCELLED",
      exerciseId: exId,
      exerciseReference: ex(exId).reference,
      exerciseTitle: ex(exId).title,
      on: dayIn(c.appliedAt, tz),
      title: "The exercise was cancelled",
      // The officers' own reason is written for the approvers, not for tenderers, and is never shown here.
      body: `This exercise was cancelled. ${c.feeRefund ? "The document fee is refunded." : "The document fee is not refunded."}`,
    });
  }
  for (const n of nonAward) {
    if (!byExercise.has(n.exerciseId)) continue;
    // A notice stands with the award it was issued under: under one that was cancelled it is shown as superseded, in other words, and its own text is not repeated.
    const stands = noticeStands(n.award.status);
    out.push({ key: `outcome:${n.id}`, kind: "NON_AWARD", exerciseId: n.exerciseId, exerciseReference: ex(n.exerciseId).reference, exerciseTitle: ex(n.exerciseId).title, on: storedDay(n.issuedOn), title: stands ? "Notice of the outcome" : "Notice of the outcome (superseded)", body: stands ? noticeBody(n.outcomeText, n.reasonText) : SUPERSEDED_NOTICE_WORDS, ...(stands ? {} : { superseded: true }) });
  }
  return sortNotices(out);
}

