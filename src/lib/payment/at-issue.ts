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

import { advancesMovedFaults } from "./advance";
import { readJudgedUnder } from "./assemble";
import { preExecutionFaults } from "./eligibility";
import { paymentRefusal } from "./labels";
import { preExecutionFacts } from "./load";
import type { Finding } from "./types";

/// The refusal's text where the certificate may not issue as `sequence`; null where it may.
export async function issueRefusal(tx: Tx, l: LoadedContract, cert: { id: string; kind: string }, sequence: number): Promise<string | null> {
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
  }
  return fs.length ? paymentRefusal("Not issued:", fs) : null;
}
