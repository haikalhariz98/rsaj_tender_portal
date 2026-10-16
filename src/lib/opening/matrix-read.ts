/**
 * The SR-14 matrix of one opening, as the screen reads it (wave 3c plan §4.3; Sourcing Requirements v2 SR-14; rulings 22, 23, 24, 20c, 20cm). Reads only.
 *
 * It reads the opening through `openingContext`, the one read every screen and every act shares, so a disabled control and a refused act give the same reason. It then PICKS: the view holds
 * no price, period or declared field (the source scan `matrix-no-price.test.ts` holds this file to it). Online, before finalising, a reader who is not a named opening officer is given no bidder
 * name and no acknowledgement day (20c, 20cm: the day could be matched against the acknowledgement register to name the column) and no file; `namesAreHeld` decides it once, as `OffersRead` does.
 * An administrator is given no file and no act: every act and download is refused them.
 */

import { toSecond } from "@/lib/bids/lateness";
import { db } from "@/lib/db";
import { loadExercise } from "@/lib/method/repo";
import type { OnlineBidRules } from "@/lib/bids/online/types";

import { checklistFromSnapshot } from "./checklist";
import { markFaults } from "./finalise";
import { filedVersionOf } from "./filed-file-store";
import { NAMES_AT_FINALISING, VERDICT_LABEL } from "./labels";
import { columnStatus, columnTally, confirmationStands, confirmFaults, matrixActorFaults, tallyText, type CellFacts, type ColumnStatus, type ColumnTally } from "./matrix";
import { loadCellFacts } from "./matrix-store";
import { allowedOf, namesAreHeld, type Allowed } from "./read";
import { openingContext, panelOf, policyOf, presentOf, stateOf } from "./repo";
import { actFaults } from "./state";
import type { ChecklistAnswer, OpeningVerdict } from "./types";
import { verdictFaults } from "./verdict";
import { consequenceFor, ineligibleOf } from "@/lib/suppliers/opening-hook";

/// An online column whose bid has no digest on the roll frozen at the start says so, never a blank.
export const NO_RECEIPT_DIGEST_TEXT = "No receipt digest on the roll";

export interface MatrixCell extends CellFacts {
  answer: ChecklistAnswer | null;
  /// After finalising: each file's filed version and its plain SHA-256, null until the mover has filed it. Empty where the viewer is given no file.
  filed: { fileId: string; versionId: string | null; plainSha256: string | null }[];
}

export interface MatrixView {
  online: boolean;
  phase: "CHECKING" | "FINALISED";
  rows: { key: string; label: string; opened: boolean }[];
  columns: {
    openedBidId: string;
    listingNo: number;
    of: number;
    bidder: string;
    alternativeOf: number | null;
    receiptDigest: string | null;
    cells: MatrixCell[];
    tally: ColumnTally;
    tallyText: string;
    decision: { verdict: OpeningVerdict; label: string; reason: string } | null;
    pass: Allowed;
    reject: Allowed;
    confirmation: { status: ColumnStatus; confirmed: string[]; awaiting: string[]; stale: string[]; mine: Allowed | null };
    answer: Allowed;
  }[];
  viewerIsNamedOfficer: boolean;
  /// Step 5: the bidder's name and the acknowledgement day are held from this reader until finalising (20c, 20cm). Computed once here, so the screen says "held" and never "not acknowledged" for a day it was not given.
  namesHeld: boolean;
}

const digestsOf = (raw: unknown): Map<number, string> => {
  const out = new Map<number, string>();
  const entries = raw && typeof raw === "object" && Array.isArray((raw as { entries?: unknown }).entries) ? ((raw as { entries: unknown[] }).entries) : [];
  for (const e of entries) {
    const r = e as { sequence?: unknown; receiptDigest?: unknown };
    if (typeof r?.sequence === "number" && typeof r.receiptDigest === "string") out.set(r.sequence, r.receiptDigest);
  }
  return out;
};

/// Null: no such opening on this exercise (or the exercise is not one of this organisation's).
export async function openingMatrix(organisationId: string, exerciseId: string, openingId: string, viewer: { personId: string | null; administrator: boolean }): Promise<MatrixView | null> {
  const l = await loadExercise(organisationId, exerciseId);
  if (!l) return null;
  const c = await openingContext({ org: l.org, ex: l.ex }, db, toSecond(new Date()));
  const o = c.openings.find((x) => x.id === openingId);
  if (!o) return null;
  const online = l.ex.submissionChannel === "ONLINE";
  const finalised = o.finalisedAt != null;
  const state = stateOf(o, l.ex.status);
  const panel = panelOf(o);
  const officers = presentOf(o).map((p) => ({ personId: p.personId, name: p.name }));
  // Who counts as a named officer: online, the exercise's roster; on paper, a present member of this opening's panel.
  const roster = online ? await db.exerciseOpeningOfficer.findMany({ where: { exerciseId, organisationId, endedAt: null }, select: { personId: true } }) : [];
  const viewerIsNamedOfficer = !viewer.administrator && viewer.personId != null && (online ? roster.some((r) => r.personId === viewer.personId) : officers.some((p) => p.personId === viewer.personId));
  const hideNames = online && !(viewer.personId != null && roster.some((r) => r.personId === viewer.personId));
  const held = namesAreHeld(hideNames, o);
  const checklist = checklistFromSnapshot(o.checklistSnapshot);
  const snap = policyOf(o.policySnapshot);
  const ineligibleConsequence = consequenceFor(o.policySnapshot, c.supplierPolicy?.ineligibleBidConsequence ?? null);
  const unpurchased = snap.unpurchased.consequence ?? c.method?.unpurchasedBidConsequence ?? null;

  const cells = await loadCellFacts(db, { organisationId, exerciseId, online, items: checklist.items, rules: l.ex.onlineBidRules, envelopeIds: o.bids.map((b) => b.envelopeId) });
  // A row is flagged when the rules frozen at publication mark its part as opened at the opening.
  const rules = (l.ex.onlineBidRules as OnlineBidRules | null)?.parts ?? [];
  const openedCodes = new Set<string>();
  if (online && rules.length > 0) for (const p of await db.tenderPackPart.findMany({ where: { organisationId, id: { in: rules.filter((r) => r.openingCheck).map((r) => r.packPartId) } }, select: { partCode: true } })) openedCodes.add(p.partCode);
  const digests = digestsOf(o.receiptRoll);
  // A file is offered to a reader who may act on it: before finalising only a named officer; after, anyone but an administrator (the version route then applies the SULIT entitlement).
  const mayHaveFiles = !viewer.administrator && (finalised || viewerIsNamedOfficer);

  const columns = await Promise.all(
    o.bids.map(async (b) => {
      const answers = new Map(b.answers.map((a) => [a.itemKey, a.answer]));
      const tally = columnTally(checklist.items, answers);
      const status = columnStatus({ online, tally, verdict: b.verdict, bid: b, officers, confirmations: b.initials });
      const j = { saleFinding: b.saleFinding, restrictionFinding: b.restrictionFinding, isAlternative: b.isAlternative, alternativeStatus: b.alternativeStatus, ineligible: ineligibleOf(b.eligibilityFinding) };
      const policy = { completenessEliminates: snap.completeness.eliminates, unpurchased, ineligible: ineligibleConsequence };
      const actor = viewer.personId ?? "";
      const ids = officers.map((p) => p.personId);
      const decide = (verdict: OpeningVerdict): Allowed =>
        allowedOf([...matrixActorFaults({ online, act: "DECIDE", administrator: viewer.administrator, actorPersonId: actor, subjectPersonId: actor, officers: ids }), ...verdictFaults({ state, sameOpening: true, bid: j, checklist, answers, policy, verdict, reason: "-" })]);
      const mine: Allowed | null =
        viewer.personId == null || !ids.includes(viewer.personId)
          ? null
          : allowedOf([
              ...matrixActorFaults({ online, act: "CONFIRM", administrator: viewer.administrator, actorPersonId: actor, subjectPersonId: actor, officers: ids }),
              ...markFaults({ state, panel, personId: viewer.personId, already: b.initials.some((i) => i.personId === viewer.personId && confirmationStands(online, b, i)), sameOpening: true }),
              ...confirmFaults({ tally, verdict: b.verdict }),
            ]);
      const filedByFile = new Map<string, { versionId: string; sha256: string } | null>();
      const mine0 = cells.get(b.envelopeId) ?? [];
      if (finalised && mayHaveFiles) for (const f of mine0.flatMap((x) => x.fileIds)) filedByFile.set(f, await filedVersionOf(organisationId, f));
      return {
        openedBidId: b.id,
        listingNo: b.listingNo,
        of: o.bids.length,
        bidder: held ? NAMES_AT_FINALISING : b.bidderNameAsRead,
        alternativeOf: b.isAlternative ? (b.parentOpenedBid?.listingNo ?? null) : null,
        receiptDigest: online ? (digests.get(b.envelope.sequence) ?? null) : null,
        cells: mine0.map((x): MatrixCell => ({
          ...x,
          fileIds: mayHaveFiles ? x.fileIds : [],
          acknowledgedOn: held ? null : x.acknowledgedOn,
          answer: answers.get(x.itemKey) ?? null,
          filed: mayHaveFiles && finalised ? x.fileIds.map((fileId) => ({ fileId, versionId: filedByFile.get(fileId)?.versionId ?? null, plainSha256: filedByFile.get(fileId)?.sha256 ?? null })) : [],
        })),
        tally,
        tallyText: tallyText(tally),
        decision: b.verdict ? { verdict: b.verdict, label: VERDICT_LABEL[b.verdict], reason: b.verdictReason } : null,
        pass: decide("PASS"),
        reject: decide("REJECT"),
        confirmation: { status: status.status, confirmed: status.confirmed.map((x) => x.name), awaiting: status.awaiting.map((x) => x.name), stale: status.stale.map((x) => x.name), mine },
        answer: allowedOf([...matrixActorFaults({ online, act: "ANSWER", administrator: viewer.administrator, actorPersonId: actor, subjectPersonId: actor, officers: ids }), ...actFaults(state)]),
      };
    }),
  );

  return {
    online,
    phase: finalised ? "FINALISED" : "CHECKING",
    rows: checklist.items.map((it) => ({ key: it.key, label: it.label, opened: online && it.source === "PART" && openedCodes.has(it.key) })),
    columns,
    viewerIsNamedOfficer,
    namesHeld: held,
  };
}
