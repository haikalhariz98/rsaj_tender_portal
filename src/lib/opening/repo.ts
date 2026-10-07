/**
 * Everything an opening is judged with, loaded and mapped to the facts the pure rules read. Reads
 * only; every rule is beside this file. The actions read through `openingContext` inside their
 * transaction, after locking requisition → exercise → window → openings → envelopes → withdrawals →
 * box events → opened bids (`lock.ts`); the screens read through the same function, so a disabled
 * action and a refused one give the same reason.
 *
 * The company estimate's figure is never read here: `estimate.ts` (beside this file) is the one
 * place an opening reads it, through 6.2's `readSealedFigures`, in the finalising transaction.
 */

import type { Prisma } from "@/generated/prisma/client";
import type { Tx } from "@/lib/audit/record";
import { lockedAtOrAfterClosing } from "@/lib/bids/box";
import { loadBidRule, loadBoxEvents, loadEnvelopes, loadLateMatters, loadWithdrawals } from "@/lib/bids/repo";
import { POSITION_LABEL } from "@/lib/committee/labels";
import { alternatesOn, nonVotingMembersOn, votingSeatsOn, type Seat } from "@/lib/committee/sitting";
import { dayIn, dayToDate, storedDay } from "@/lib/dates";
import { db } from "@/lib/db";
import { isLive } from "@/lib/documents/evidence";
import type { ExerciseRow } from "@/lib/method/repo";
import { wholePathTo } from "@/lib/organisation/structure";
import type { OrgUnit } from "@/lib/organisation/types";
import { loadRoster, type RosterData } from "@/lib/people/load";
import { holdersOf } from "@/lib/people/roster";
import type { Provenance } from "@/lib/reference/types";
import { estimateFactsOf, loadEstimates, loadScopePolicy } from "@/lib/scope/repo";
import { windowGate } from "@/lib/window/gate";

import type { OpeningPolicySnapshot } from "./policy";
import { openingState, type OpeningState } from "./state";
import type { SeatHolder } from "./panel";
import type { InvitedCountReading } from "./types";

export const OPENING_INCLUDE = {
  committee: { select: { id: true, code: true, nameEn: true } },
  startedBy: { select: { id: true, name: true } },
  panelOverrideBy: { select: { id: true, name: true } },
  admissionDecision: { select: { id: true, bidEnvelopeId: true, meeting: { select: { reference: true } } } },
  sittings: { orderBy: { sittingNo: "asc" as const }, include: { recordedBy: { select: { name: true } } } },
  panel: { orderBy: { id: "asc" as const }, include: { person: { select: { id: true, name: true, orgUnitCode: true } } } },
  authorisations: { orderBy: [{ recordedAt: "asc" as const }, { id: "asc" as const }], include: { person: { select: { name: true } } } },
  bids: {
    orderBy: { listingNo: "asc" as const },
    include: {
      party: { select: { id: true, name: true, registrationNo: true } },
      envelope: { select: { id: true, sequence: true, receivedSource: true, channel: true, markings: true } },
      initials: { include: { person: { select: { name: true } } } },
      answers: true,
      parentOpenedBid: { select: { listingNo: true } },
    },
  },
  signatures: { include: { person: { select: { name: true } } } },
  copyExplanation: { include: { recordedBy: { select: { name: true } } } },
  attachments: { where: { purpose: "SIGNED_SCHEDULE" as const }, select: { id: true, detachedAt: true, version: { select: { withdrawnAt: true } } } },
} satisfies Prisma.OpeningInclude;

export async function loadOpenings(exerciseId: string, client: Tx = db) {
  return client.opening.findMany({ where: { exerciseId }, orderBy: { sequenceNo: "asc" }, include: OPENING_INCLUDE });
}
export type OpeningRow = Awaited<ReturnType<typeof loadOpenings>>[number];
export type OpenedBidRow = OpeningRow["bids"][number];

/// The rules' view of an opening row, on its exercise's status (a cancelled exercise records nothing more, review M-1).
export const stateOf = (o: OpeningRow, exerciseStatus: string): OpeningState =>
  openingState({ ...o, exerciseStatus }, o.sittings, o.authorisations, o.panel.map((p) => ({ personId: p.personId, present: p.present })));
export const panelOf = (o: OpeningRow) => o.panel.map((p) => ({ personId: p.personId, present: p.present }));
export const presentOf = (o: OpeningRow) => o.panel.filter((p) => p.present).map((p) => ({ personId: p.personId, name: p.person.name }));
export const liveScans = (o: Pick<OpeningRow, "attachments">) => o.attachments.filter(isLive).length;

export { openingPolicyFrozen, policyOf, summaryLabelsOf, type OpeningPolicySnapshot } from "./policy";

/// The committee's panel rules as frozen on an opening (FR-OPN-002, FR-CTE-011).
export const panelSnapshot = (c: { panelSize: number | null; panelSizeProvenance: string | null; panelExclusionRule: boolean | null; panelExcludesUnitCode: string | null; panelExclusionProvenance: string | null } | null): OpeningPolicySnapshot["panel"] => ({
  size: c?.panelSize ?? null,
  sizeProvenance: (c?.panelSizeProvenance as Provenance | null) ?? null,
  exclusionRule: c?.panelExclusionRule ?? null,
  excludedUnitCode: c?.panelExcludesUnitCode ?? null,
  exclusionProvenance: (c?.panelExclusionProvenance as Provenance | null) ?? null,
});

/// The seats of a committee held on a day, each resolved to its one holder (vacant and contested seats hold nobody).
export function seatHolders(members: readonly (Seat & { seatLabel: string | null })[], roster: RosterData, on: Date): SeatHolder[] {
  // The seat in words: its office where held ex officio, its own label, or its position (never a code).
  const label = (id: string) => {
    const m = members.find((x) => x.id === id);
    return m?.seatLabel ?? (m ? POSITION_LABEL[m.position] : null);
  };
  const voting = votingSeatsOn(members, roster, on).filter((s) => s.personId).map((s) => ({ personId: s.personId!, committeeMemberId: s.seatId, seatLabel: s.officeLabel ?? label(s.seatId) ?? "Member" }));
  const alternates = alternatesOn(members, roster, on).filter((s) => s.personId).map((s) => ({ personId: s.personId!, committeeMemberId: s.seatId, seatLabel: `Alternate${s.officeLabel ? `, ${s.officeLabel}` : ""}` }));
  const secretaries = nonVotingMembersOn(members, roster, on).map((personId) => ({ personId, committeeMemberId: members.find((m) => m.position === "SECRETARY" && (m.personId === personId || m.seatRoleCode))?.id ?? "", seatLabel: "Secretary" }));
  const all = [...voting, ...alternates, ...secretaries];
  return all.filter((s, i) => all.findIndex((x) => x.personId === s.personId) === i);
}

/**
 * Everything an opening act or the Opening and Schedule sections read, for one exercise. `client`
 * is the transaction holding the locks, or the plain client for a screen.
 */
export async function openingContext(l: { org: { id: string; code: string; timeZone: string | null; today: string | null }; ex: ExerciseRow }, client: Tx = db, now = new Date()) {
  const { org, ex } = l;
  // One after the other: inside a transaction the client is one connection.
  const window = await client.exerciseWindow.findUnique({
    where: { exerciseId: ex.id },
    select: { id: true, path: true, publishedAt: true, policySnapshot: true, alternativesPermitted: true, purchaseFromDay: true, purchaseCloseDay: true, sales: { orderBy: { createdAt: "asc" }, select: { id: true, partyId: true, voidedAt: true, restrictionCertSighted: true, restrictionCertValidUntil: true } }, letters: { select: { partyId: true } }, addenda: { where: { status: "ISSUED" }, orderBy: { number: "asc" }, select: { number: true, title: true } } },
  });
  const gate = windowGate(ex, window, now, org.timeZone);
  const bidRule = await loadBidRule(window, org.id, ex.sourcingMethodCode, client);
  const method = await client.sourcingMethod.findFirst({ where: { organisationId: org.id, code: ex.sourcingMethodCode }, select: { nameEn: true, openingCommitteeCode: true, openingCommitteeProvenance: true, unpurchasedBidConsequence: true, unpurchasedProvenance: true, requiresCompanyEstimate: true, requiresCompanyEstimateProvenance: true } });
  const events = await loadBoxEvents(ex.id, client);
  const envelopes = await loadEnvelopes(ex.id, client);
  const withdrawals = await loadWithdrawals(ex.id, client);
  const lateMatters = await loadLateMatters(ex.id, client);
  const openings = await loadOpenings(ex.id, client);
  const parties = await client.exerciseParty.findMany({ where: { exerciseId: ex.id }, orderBy: { name: "asc" }, select: { id: true, name: true, registrationNo: true, source: true, vendorId: true } });
  // 6.15a (OD-6 A): what follows from a linked bidder found not eligible, as the register's policy stands now.
  const supplierPolicy = await client.supplierPolicy.findUnique({ where: { organisationId: org.id }, select: { ineligibleBidConsequence: true, ineligibleProvenance: true } });
  const pack = await client.tenderPack.findFirst({ where: { exerciseId: ex.id, status: "APPROVED" }, orderBy: { versionNo: "desc" }, select: { versionNo: true, parts: { orderBy: { sortOrder: "asc" }, select: { partCode: true, labelSnapshot: true, role: true, mandatory: true, returnedByBidder: true, sortOrder: true } } } });
  const estimates = await loadEstimates(ex.id, client);
  const estimate = estimates.find((e) => e.state !== "VOID") ?? null;
  const scopePolicy = await loadScopePolicy(org.id, client);
  const openingPolicy = await client.openingPolicy.findUnique({ where: { organisationId: org.id } });
  const committee = method?.openingCommitteeCode ? await client.committee.findFirst({ where: { organisationId: org.id, code: method.openingCommitteeCode, retiredOn: null }, include: { members: true } }) : null;
  // Review R-3: a supplementary opening is the main opening's committee, whatever the method names now.
  const mainRow = openings.find((o) => o.kind === "MAIN") ?? null;
  const mainCommittee = mainRow ? await client.committee.findFirst({ where: { organisationId: org.id, id: mainRow.committeeId }, include: { members: true } }) : null;
  const units = (await client.orgUnit.findMany({ where: { organisationId: org.id } })) as unknown as OrgUnit[];
  const roster = await loadRoster(org.code, client);

  // R-5: no time zone, no day: nothing is read "on" a UTC instant instead (no seats, no unit path, no office held).
  const on = org.today ? dayToDate(org.today) : null;
  const closingDay = ex.closingAt && org.timeZone ? dayIn(ex.closingAt, org.timeZone) : null;
  const lockEvent = events.filter((e) => e.kind === "LOCKED").at(-1) ?? null;
  const main = openings.find((o) => o.kind === "MAIN") ?? null;
  return {
    org,
    ex,
    now,
    on,
    closingDay,
    window,
    path: (window?.path ?? "ADVERTISED") as "ADVERTISED" | "INVITED",
    gate,
    bidRule,
    method,
    events,
    lockEvent,
    boxLocked: lockedAtOrAfterClosing(events, ex.closingAt),
    envelopes,
    withdrawals,
    lateMatters,
    openings,
    main,
    parties,
    sales: (window?.sales ?? []).map((s) => ({ partyId: s.partyId, voided: s.voidedAt != null, certSighted: s.restrictionCertSighted, certValidUntil: s.restrictionCertValidUntil ? storedDay(s.restrictionCertValidUntil) : null })),
    invitedPartyIds: new Set((window?.letters ?? []).map((x) => x.partyId)),
    addenda: (window?.addenda ?? []).filter((a) => a.number != null).map((a) => ({ number: a.number!, title: a.title })),
    pack,
    estimate,
    estimateFacts: estimate ? estimateFactsOf(estimate) : null,
    scopePolicy,
    openingPolicy,
    supplierPolicy,
    committee,
    seats: committee && on ? seatHolders(committee.members, roster, on) : [],
    /// The main opening's committee (R-3), with its panel rules as they stand now (BD-67-11) and its seats on the day.
    mainCommittee,
    mainSeats: mainCommittee && on ? seatHolders(mainCommittee.members, roster, on) : [],
    roster,
    /// 67-C5: the whole path or none — a unit under one not in force on the day is not in the structure, and the independence rule blocks.
    unitPath: (code: string) => (on ? wholePathTo(units, code, on).map((u) => u.code) : []),
    unitCodes: new Set(units.map((u) => u.code)),
    holdsOffice: (personId: string, roleCode: string | null) => !!roleCode && !!on && holdersOf(roster, roleCode, on).some((p) => p.id === personId),
  };
}
export type OpeningContext = Awaited<ReturnType<typeof openingContext>>;

/// The parties carried to evaluation from the openings, and what the award gate reads (C-7, C-8).
export function gateFacts(c: Pick<OpeningContext, "window" | "ex" | "openings" | "lateMatters" | "envelopes">) {
  return {
    applies: c.window?.publishedAt != null && (c.ex.packKindSnapshot === "TENDER" || c.ex.packKindSnapshot === "QUOTATION"),
    openings: c.openings.map((o) => ({ kind: o.kind, sequenceNo: o.sequenceNo, finalised: o.finalisedAt != null, liveScans: liveScans(o), copyCheck: o.estimateCopyCheck, explained: o.copyExplanation != null, admittedEnvelopeId: o.admissionDecision?.bidEnvelopeId ?? null })),
    admittedEnvelopeIds: c.envelopes.filter((e) => e.late && e.kind !== "COMPANY_ESTIMATE").filter((e) => c.lateMatters.some((m) => m.bidEnvelopeId === e.id && !m.withdrawn && m.outcome === "CARRIED")).map((e) => e.id),
    carriedPartyIds: new Set(c.openings.filter((o) => o.finalisedAt).flatMap((o) => o.bids.filter((b) => b.verdict === "PASS").map((b) => b.partyId))),
  };
}

/// The invited count's two readings (OD-9): bidders holding a live sale, and bidders sent a letter.
export function invitedCounts(c: Pick<OpeningContext, "sales" | "invitedPartyIds">) {
  return { purchasers: new Set(c.sales.filter((s) => !s.voided).map((s) => s.partyId)).size, invitees: c.invitedPartyIds.size };
}

export type { InvitedCountReading };
