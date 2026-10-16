import { Prisma } from "@/generated/prisma/client";
import type { Tx } from "@/lib/audit/record";
import type { FormState } from "@/components/record-editor";
import { diffFields } from "@/lib/audit/diff";

import { unopenedInTime } from "@/lib/bids/envelope-status";
import { storedDay } from "@/lib/dates";
import { moveExercise } from "@/lib/method/move";
import { parseSen, senToDecimalString } from "@/lib/money";
import { FormReader } from "@/lib/validate";
import { lockEvaluationRows } from "@/lib/evaluation/lock";
import { ceilingOf } from "@/lib/evaluation/repo";
import { openNewVersion } from "@/lib/evaluation/versions";
import { finaliseFields, OPENING_ENTITY } from "@/lib/opening/audit-view";
import { lockGap } from "@/lib/opening/box";
import { checklistFromSnapshot, unansweredItems } from "@/lib/opening/checklist";
import { DisclosureRefused, discloseAtFinalising } from "@/lib/opening/estimate";
import { type PaperCopy } from "@/lib/opening/estimate-copy";
import { finaliseFaults } from "@/lib/opening/finalise";
import { grandSummary } from "@/lib/opening/grand-summary";
import { freshInitials } from "@/lib/opening/initials";
import { openingFindingText } from "@/lib/opening/labels";
import { invitedCounts, policyOf, presentOf, stateOf, summaryLabelsOf, type OpeningContext, type OpeningPolicySnapshot, type OpeningRow } from "@/lib/opening/repo";
import { unpurchasedRecordAudit, unpurchasedRule, type LiveUnpurchased } from "@/lib/opening/unpurchased";
import { jadualTawaran, lateCount, type ScheduleRowInput } from "@/lib/opening/schedule";
import { blocking } from "@/lib/opening/types";
import { verdictDrift } from "@/lib/opening/verdict-drift";
import { consequenceFor, ineligibleOf } from "@/lib/suppliers/opening-hook";
import { activePerson, audit, label, Refusal, type LockedWindow } from "../window/shared";
import { toAuditActor } from "@/app/_auth/actor";
import type { PreparedAct } from "@/app/_auth/act";
import type { StaffActor } from "@/lib/auth/types";
import { priceRead } from "@/lib/opening/price";
import { openingContext } from "@/lib/opening/repo";
import { declaredWrite, filesToRelease } from "@/lib/opening/online-finalise";
import type { FinaliseMaterial } from "@/lib/opening/online-finalise-store";
import { formatMoney } from "@/lib/money";
import { periodText } from "@/lib/opening/labels";
import { GONE_OPENING, refuse } from "./in-opening";

/**
 * The finalising transaction's body, shared by the paper finalise (`finaliseOpening`) and the online one (`finaliseOnline`, step 15). Runs inside `inOpening`, under its locks. The paper path is
 * exactly what it was; the online path adds, in the order the triggers need: the faults, then the declared figures written to the offers (the first moment they are plain), the context read again,
 * the estimate, the snapshots built from the prices just written, `finalisedAt`, and last each opened file's data key released for the mover.
 */

export const openingOf = (c: OpeningContext, id: string) => c.openings.find((o) => o.id === id) ?? null;
export const openingLabel = (l: LockedWindow, o: Pick<OpeningRow, "kind" | "sequenceNo">) => label(l, o.kind === "MAIN" ? "Opening" : `Supplementary opening ${o.sequenceNo - 1}`);
/// The method's unpurchased-bid rule as it stands now (OD-4), for an opening that froze it unset.
export const liveUnpurchased = (c: OpeningContext): LiveUnpurchased => ({ consequence: c.method?.unpurchasedBidConsequence ?? null, provenance: (c.method?.unpurchasedProvenance as OpeningPolicySnapshot["unpurchased"]["provenance"]) ?? null });

export interface OnlineFinalise {
  material: FinaliseMaterial;
  /// Told the first blocking code of a refusal judged here, so the caller can write it to the access log.
  onFault?: (code: string) => void;
}

export async function finaliseInTransaction(
  tx: Tx,
  l: LockedWindow,
  ctx: OpeningContext,
  i: { actor: StaffActor; act: PreparedAct; now: Date; openingId: string; personId: string | null; paperChoice: string; paperRaw: string; data: FormData; online: OnlineFinalise | null },
): Promise<FormState> {
  const { actor, act, now, openingId, personId, paperChoice, paperRaw, data, online } = i;
  const paperAnswered = paperChoice === "notInBox" || (paperChoice === "figure" && paperRaw.trim() !== "");
  {
    let c = ctx;
    let o = openingOf(c, openingId);
    if (!o) return GONE_OPENING;
    const person = await activePerson(tx, l.org.id, personId);
    const state = stateOf(o, l.ex.status);
    const snap = policyOf(o.policySnapshot);
    const checklist = checklistFromSnapshot(o.checklistSnapshot);
    const unpurchased = unpurchasedRule(snap, liveUnpurchased(c), now, person?.name ?? "");
    const ineligible = consequenceFor(o.policySnapshot, c.supplierPolicy?.ineligibleBidConsequence ?? null);
    const anyIneligible = o.bids.some((b) => ineligibleOf(b.eligibilityFinding));
    // 6.15a fix R-6, residual 5: each recorded verdict judged again under the rules about to be frozen (one function, shared with the screen).
    const drift = verdictDrift(o.bids, { checklist, completenessEliminates: snap.completeness.eliminates, unpurchased: unpurchased.consequence, ineligible });
    // Online, the copy is the one sealed at the lodgement, read before this transaction (`material.estimate`); on paper it is the figure typed from the box.
    const estimate = { required: snap.estimate.requires === true, lodged: o.kind === "MAIN" && c.estimate?.state === "LODGED", paperAnswered: online ? online.material.estimate !== null : paperAnswered };
    const unopened = unopenedInTime(c.envelopes);
    const admissionId = o.admissionDecision?.bidEnvelopeId ?? null;
    const admitted = admissionId ? c.envelopes.find((e) => e.id === admissionId) : null;
    const fs = finaliseFaults({
      state,
      bids: o.bids.map((b) => ({ listingNo: b.listingNo, initials: freshInitials(b, b.initials).map((i) => i.personId), unanswered: unansweredItems(checklist.items, new Map(b.answers.map((a) => [a.itemKey, a.answer]))).length, verdict: b.verdict, unpurchased: b.saleFinding !== "LIVE_SALE" })),
      // Online, every named officer is the panel: all of them sign (20t), and none is absent from a roster the key was split across.
      present: online ? o.panel.map((p) => ({ personId: p.personId, name: p.person.name })) : presentOf(o),
      signed: o.signatures.map((s) => s.personId),
      pages: o.schedulePages,
      checklist,
      withdrawals: o.kind === "MAIN" ? c.withdrawals.map((w) => ({ id: w.id, envelopeId: w.envelopeId, unmatchedFinding: w.unmatchedFinding })) : [],
      unopened,
      admittedOpened: admitted?.status === "OPENED",
      completenessEliminates: snap.completeness.eliminates,
      unpurchased: unpurchased.consequence,
      // 6.15a (OD-6 A): unset blocks only where a linked bidder was found not eligible.
      ineligible: { consequence: ineligible, anyFound: anyIneligible, disagreements: drift.setting },
      noLongerStands: drift.noLongerStands,
      // R-4: the reading frozen at the start, never today's configuration.
      invitedReading: snap.invited.reading,
      estimate,
      personActive: !!person,
      online: !!online,
    });
    if (blocking(fs).length) online?.onFault?.(blocking(fs)[0].code);
    if (blocking(fs).length) return refuse(fs);
    // Online, in the order the triggers need (ADR 0036 D10): the declared figures first, the first moment they are plain in the database. The offers are the ones whose files were checked before
    // this transaction, and the context is read again under the locks so the snapshots below are built from the prices just written, never from the context loaded before them.
    if (online) {
      const offers = new Map(o.bids.map((x) => [x.envelopeId, x.listingNo] as const));
      const same = offers.size === online.material.offers.size && [...offers.keys()].every((k) => online.material.offers.has(k) && online.material.declared.has(k));
      if (!same) return { ok: false, message: `Nothing was finalised: ${openingFindingText({ code: "ONLINE_STATE_CHANGED", level: "block" })}` };
      for (const bid of o.bids) {
        const d = online.material.declared.get(bid.envelopeId)!;
        const w = declaredWrite(d);
        await tx.openedBid.update({ where: { id: bid.id, organisationId: actor.organisationId }, data: w });
        await audit(tx, toAuditActor(actor), l.org.id, OPENING_ENTITY.bid, bid.id, label(l, `Offer ${bid.listingNo}`), "UPDATE", diffFields({ openingPrice: null, completionPeriod: null }, { openingPrice: formatMoney(parseSen(w.priceAsRead)), completionPeriod: periodText({ value: w.completionPeriod, unit: w.completionUnit }) }));
      }
      c = await openingContext(l, tx, now);
      o = openingOf(c, openingId);
      if (!o) return GONE_OPENING;
    }
    // Every other check passed: only now is the paper's figure read.
    let paper: PaperCopy | null = null;
    if (online) {
      if (estimate.lodged && online.material.estimate) paper = { figure: online.material.estimate.figure };
    } else if (estimate.lodged && paperAnswered) {
      if (paperChoice === "notInBox") paper = { notInBox: true };
      else {
        const r = new FormReader(data);
        const figure = r.money("paperFigure", "The figure on the paper copy", { required: true });
        if (!figure) return { ok: false, errors: r.errors };
        paper = { figure: parseSen(figure) };
      }
    }
    let disclosed: Awaited<ReturnType<typeof discloseAtFinalising>> | null = null;
    if (o.kind === "MAIN" && c.estimateFacts && c.estimate?.state === "LODGED") {
      try {
        disclosed = await discloseAtFinalising(tx, toAuditActor(actor), { organisationId: l.org.id, reference: l.ex.reference, facts: c.estimateFacts, at: now, person: person!, act, paper, benchmarkLabelEn: c.scopePolicy.benchmarkLabelEn });
      } catch (e) {
        // R-1: thrown as a Refusal, so anything written in this transaction rolls back with it.
        if (e instanceof DisclosureRefused) throw new Refusal({ ok: false, message: "Nothing was saved: the company estimate could not be disclosed as it stands. Check its state on the Scope and estimate tab." });
        throw e;
      }
    }
    // The schedule: every offer read up to this opening, in opening order (OD-5 versions).
    const rows: ScheduleRowInput[] = c.openings.filter((x) => x.sequenceNo <= o.sequenceNo).flatMap((x) => x.bids.map((b) => ({ listingNo: b.listingNo, bidderName: b.bidderNameAsRead, registrationClass: b.registrationClassAsRead, registrationStatus: b.registrationStatusAsRead, price: parseSen(priceRead(b).toString()), period: b.completionPeriod != null && b.completionUnit ? { value: b.completionPeriod, unit: b.completionUnit } : null, isAlternative: b.isAlternative, parentListingNo: b.parentOpenedBid?.listingNo ?? null, openingSequence: x.sequenceNo })));
    const mainSchedule = o.kind === "SUPPLEMENTARY" ? c.main?.scheduleSnapshot : null;
    const priorBenchmark = mainSchedule && typeof mainSchedule === "object" && !Array.isArray(mainSchedule) ? ((mainSchedule as Record<string, unknown>).benchmark as { sealed: false; label: string | null; companyEstimate: string } | { notRequired: true } | undefined) : undefined;
    const benchmark = disclosed?.benchmark ? { sealed: false as const, label: disclosed.benchmark.label, value: disclosed.benchmark.value } : priorBenchmark && "companyEstimate" in priorBenchmark ? { sealed: false as const, label: priorBenchmark.label, value: parseSen(priorBenchmark.companyEstimate) } : { notRequired: true as const };
    const gap = c.main?.lockGapSeconds != null && o.kind === "MAIN" && c.main.boxLockedAt && l.ex.closingAt ? lockGap(l.ex.closingAt, c.main.boxLockedAt) : null;
    const { schedule } = jadualTawaran({ version: o.sequenceNo, title: l.ex.title, reference: l.ex.reference, startDay: l.ex.tenderingStartOn ? storedDay(l.ex.tenderingStartOn) : null, closing: l.ex.closingAt, invited: { reading: snap.invited.reading, ...invitedCounts(c) }, lateCount: lateCount(c.envelopes), pages: o.schedulePages, rows, benchmark, lockGap: gap });
    const verdicts = new Map(c.openings.filter((x) => x.sequenceNo <= o.sequenceNo).flatMap((x) => x.bids.map((b) => [b.id, b.verdict] as const)));
    const summary = grandSummary({ finalised: true, bids: c.openings.filter((x) => x.sequenceNo <= o.sequenceNo).flatMap((x) => x.bids.map((b) => ({ listingNo: b.listingNo, bidderName: b.bidderNameAsRead, price: parseSen(priceRead(b).toString()), verdict: verdicts.get(b.id) ?? null }))), labels: summaryLabelsOf(snap) });
    // After the disclosure's writes: thrown, so they roll back (R-1, R-7).
    if (!("summary" in summary)) throw new Refusal(refuse([summary.fault]));
    const lodged = disclosed?.lodged ?? null;
    // R-4: the unpurchased rule is recorded at finalising only where an offer needs it, audited with it.
    const recordRule = unpurchased.record && o.bids.some((b) => b.saleFinding !== "LIVE_SALE") ? unpurchased.record : null;
    // 6.15a (OD-6 A): the register's consequence is frozen on the opening at finalising, where a bid needed it.
    const base = (recordRule ?? o.policySnapshot) as Record<string, unknown> | null;
    const frozenSnapshot = anyIneligible && base ? { ...base, ineligible: { consequence: ineligible, provenance: c.supplierPolicy?.ineligibleProvenance ?? null, recordedAt: now.toISOString(), recordedBy: person!.name } } : recordRule;
    await tx.opening.update({
      where: { id: o.id, organisationId: actor.organisationId },
      data: {
        finalisedAt: now,
        scheduleSnapshot: { ...schedule, invitedReadingProvenance: snap.invited.provenance } as unknown as Prisma.InputJsonValue,
        grandSummarySnapshot: summary.summary as unknown as Prisma.InputJsonValue,
        faultsSnapshot: fs.filter((f) => f.level !== "block") as unknown as Prisma.InputJsonValue,
        ...(frozenSnapshot ? { policySnapshot: frozenSnapshot as unknown as Prisma.InputJsonValue } : {}),
        // Online, the "copy" is the one lodged sealed for the officers: it is compared with the retained lodged version as the paper copy is, and kept in the same column.
        estimatePaperAmount: disclosed?.paper != null ? senToDecimalString(disclosed.paper) : null,
        estimateLodgedAmount: disclosed && disclosed.check ? senToDecimalString(lodged!) : null,
        estimateCopyCheck: disclosed?.check ?? null,
      },
    });
    if (recordRule) {
      const a = unpurchasedRecordAudit(unpurchased.consequence!, now, person!.name, l.org.timeZone);
      await audit(tx, toAuditActor(actor), l.org.id, OPENING_ENTITY.opening, o.id, openingLabel(l, o), "UPDATE", diffFields(a.before, a.after));
    }
    if (anyIneligible) {
      await audit(tx, toAuditActor(actor), l.org.id, OPENING_ENTITY.opening, o.id, openingLabel(l, o), "UPDATE", diffFields({ ineligibleBidder: null }, { ineligibleBidder: ineligible === "ELIMINATE" ? "Eliminated at the opening (the supplier register's policy, frozen at finalising)" : "Reported to the committee (the supplier register's policy, frozen at finalising)" }));
    }
    await audit(tx, toAuditActor(actor), l.org.id, OPENING_ENTITY.opening, o.id, openingLabel(l, o), "UPDATE", diffFields({ finalised: null }, finaliseFields({ at: now, by: person!.name, pages: o.schedulePages!, rows: schedule.rows.length, copy: disclosed?.check ?? null, paper: disclosed?.paper ?? null, lodged, disclosed: !!disclosed }, l.org.timeZone)));
    // Online, last: each opened file's data key is released for the mover, which the trigger allows only now that `finalisedAt` is set in this transaction.
    let released = 0;
    if (online) {
      const mine = o.bids.map((x) => x.envelopeId);
      const files = await tx.onlineBidFile.findMany({ where: { organisationId: l.org.id, exerciseId: l.ex.id, part: { onlineBid: { envelopeId: { in: mine }, status: "OPENED" } } }, select: { id: true } });
      const ids = filesToRelease([{ fileIds: files.map((f) => f.id) }]);
      for (const id of ids) {
        const dek = online.material.deks.get(id);
        if (!dek) throw new Refusal({ ok: false, message: `Nothing was finalised: ${openingFindingText({ code: "ONLINE_STATE_CHANGED", level: "block" })}` });
        await tx.onlineBidFile.update({ where: { id, organisationId: l.org.id }, data: { releasedDek: new Uint8Array(dek) } });
        released++;
      }
      await audit(tx, toAuditActor(actor), l.org.id, OPENING_ENTITY.opening, o.id, openingLabel(l, o), "UPDATE", diffFields({ filesReleasedToTheStore: null }, { filesReleasedToTheStore: `${released} file${released === 1 ? "" : "s"}` }));
    }
    if (o.kind === "MAIN") {
      await moveExercise(tx, l.ex, "OPENED", { today: l.org.today, via: "OPENING_FINALISED", finaliseFaults: 0 });
      await audit(tx, toAuditActor(actor), l.org.id, "SourcingExercise", l.ex.id, `${l.ex.reference} · ${l.ex.title}`, "UPDATE", diffFields({ status: l.ex.status }, { status: "OPENED" }));
    }
    // 6.8 E-7: a supplementary opening finalised once an evaluation version exists opens version n+1 in
    // this transaction, superseding the one in force; the evaluations are locked after the opened bids.
    let reopened: number | null = null;
    if (o.kind === "SUPPLEMENTARY") {
      await lockEvaluationRows(tx, l.ex.id);
      reopened = await openNewVersion(tx, toAuditActor(actor), { organisationId: l.org.id, exercise: { id: l.ex.id, reference: l.ex.reference, title: l.ex.title, status: l.ex.status }, ceiling: ceilingOf(l.ex), today: l.org.today, timeZone: l.org.timeZone, now }, { trigger: "SUPPLEMENTARY_OPENING", openingId: o.id, personId: person!.id, act });
    }
    const again = reopened ? ` Evaluation version ${reopened} is opened with the late ${o.bids.length === 1 ? "offer" : "offers"}; every stage is submitted again.` : "";
    const copy = disclosed?.check === "MISMATCH" || disclosed?.check === "NOT_IN_BOX" ? " The estimate's paper copy is recorded as a finding to explain on the Schedule section." : "";
    return { ok: true, message: online ? `Finalised. Each price is now read, and ${released} file${released === 1 ? " is" : "s are"} being filed in the document store. Attach the signed schedule's scan on the Schedule section.${copy}${again}` : `Finalised. Attach the signed schedule's scan on the Schedule section.${copy}${again}` };
  }
}
