/**
 * What an interim certificate is judged on at issue (6.13 Part A step 3: FR-PAY-014 as ruled: "checked at issue on
 * the allocated sequence under the contract lock, warning at open"). Server-only: called by the certificate core's
 * issue, inside the last signature's transaction, after the sequence is allocated under the contract's lock.
 *
 * - The sequence allocated must be the one its figures were worked out for (previously certified, the advance's
 *   recoupment and the minimum all read it): another issued meanwhile refuses it (void and raise it again).
 * - Before the contract is signed, only certificates up to the limit frozen when it was raised, and only with the
 *   letter returned, the bond and every policy verified, every policy's premium receipt and the PERKESO number
 *   recorded, as the registers stand now.
 * Any other kind: nothing here.
 */

import type { Tx } from "@/lib/audit/record";
import type { LoadedContract } from "@/lib/contract/repo";
import { formatMoney, senFromDecimal } from "@/lib/money";

import { advanceIssueFaults, advancesMovedFaults } from "./advance";
import { readJudgedUnder } from "./assemble";
import { preExecutionFaults } from "./eligibility";
import { paymentRefusal } from "./labels";
import { baselineOn, basisNamesOf, inProgressSequenceOf, issuedAdjustmentsOf, ladBasisOf, loadPayment, nextInterimSequence, preExecutionFacts } from "./load";
import { ladBasisMoved } from "@/lib/lad/frozen";
import { adjustmentsMovedFaults } from "./variation-check";
import type { Finding } from "./types";

/// The refusal's text where the certificate may not issue as `sequence`; null where it may.
export async function issueRefusal(tx: Tx, l: LoadedContract, cert: { id: string; kind: string }, sequence: number, today?: string): Promise<string | null> {
  if (cert.kind === "ADVANCE_PAYMENT") {
    // Residual MUST 3: no row on or before the interim sequence issued or in progress.
    const adv = await tx.advancePayment.findUnique({ where: { certificateId: cert.id }, select: { schedule: { select: { sequence: true, amount: true } } } });
    if (!adv) return null;
    const p = await loadPayment(l.contract.id, tx);
    const fs = advanceIssueFaults(adv.schedule.map((r) => ({ sequence: r.sequence, amount: senFromDecimal(r.amount) })), nextInterimSequence(p) - 1, inProgressSequenceOf(p));
    return fs.length ? paymentRefusal("Not issued:", fs) : null;
  }
  if (cert.kind !== "INTERIM_PAYMENT") return null;
  const v = await tx.interimValuation.findUnique({ where: { certificateId: cert.id }, select: { judgedUnder: true } });
  const j = readJudgedUnder(v?.judgedUnder);
  const fs: Finding[] = [];
  if (!j) fs.push({ code: "SEQUENCE_MOVED", level: "block", data: { expected: null, allocated: sequence } });
  else if (j.sequence !== sequence) fs.push({ code: "SEQUENCE_MOVED", level: "block", data: { expected: j.sequence, allocated: sequence } });
  else {
    fs.push(...preExecutionFaults(sequence, { ...(await preExecutionFacts(l, tx)), limit: j.preExecution.limit }, "block"));
    // The advances its recoupment was worked out from must still be the issued set (code review run 2, item 2).
    const issued = await tx.advancePayment.findMany({ where: { contractId: l.contract.id, certificate: { is: { status: "ISSUED" } } }, select: { id: true, party: true, amount: true, contractParty: { select: { name: true } } } });
    fs.push(...advancesMovedFaults(j.advancesRead ?? [], issued.map((a) => ({ id: a.id, label: `the advance to ${a.party === "MAIN" ? "the main contractor" : (a.contractParty?.name ?? "a nominated sub-contractor")} of ${formatMoney(senFromDecimal(a.amount))}` }))));
    // 6.13 Part A step 4 (FR-PAD-003): the issued adjustments of the contract sum its new sum was read from must still
    // be the issued set (one issued since would leave this certificate on the earlier sum).
    const p = await loadPayment(l.contract.id, tx);
    const adjusted = issuedAdjustmentsOf(p);
    fs.push(...adjustmentsMovedFaults(j.adjustmentsRead ?? [], adjusted.map((a) => a.id)));
    // 6.13 Part B run 1b (ADR 0030 §6; plan B6's both-orders table, flagged against Part A, stricter): the damages basis
    // it was raised on must still stand (an EOT issued, a decision replaced or superseded, a waiver approved, a date or a
    // rate segment moved since refuses it, naming each). A certificate raised before run 1b froze none: not judged.
    // The act's own day (the stamp read once at its entry), passed by the core's issue.
    const baseline = today ? baselineOn(l, today) : null;
    if (j.ladBasis && baseline) {
      const now = { ...ladBasisOf(p, baseline), waiversApplied: j.ladBasis.waiversApplied };
      fs.push(...ladBasisMoved(j.ladBasis, now, basisNamesOf(p, baseline)));
    }
  }
  return fs.length ? paymentRefusal("Not issued:", fs) : null;
}

/// The highest interim sequence the contract's opening position covers (BD-613-41: the core allocates the next one
/// after it), or 0. Any other kind: 0.
export async function sequenceFloor(tx: Tx, l: LoadedContract, kind: string): Promise<number> {
  if (kind !== "INTERIM_PAYMENT") return 0;
  const o = await tx.openingPosition.findUnique({ where: { contractId: l.contract.id }, select: { lastSequence: true } });
  return o?.lastSequence ?? 0;
}
