/**
 * The final account's server side (Phase 2 close-out stage C; plan closeout-plan.md §4.6, §4.7, CO-6): the certificate's figures, the send's
 * gate, the issue's re-judging, Finance's payment of the FINAL (the retention balance under FINAL_PAYMENT, in the same transaction), and the
 * close's facts. Server-only. Each runs inside the caller's locked transaction; every judgement is the pure rules'.
 */

import { diffFields } from "@/lib/audit/diff";
import { writeAudit, type Tx } from "@/lib/audit/record";
import type { ComputedSnapshot, FigureLine, FigureTotal } from "@/lib/certificate/snapshot";
import type { CertCtx } from "@/lib/certificate/write";
import { contractLabel, type LoadedContract } from "@/lib/contract/repo";
import { manualCloseout } from "@/lib/integration/closeout";
import { formatMoney, senFromDecimal, senToDecimalString, type Sen } from "@/lib/money";
import { heldOnLatest } from "@/lib/payment/assemble";
import { storedDay } from "@/lib/dates";
import { baselineOn, issuedInterims, loadPayment, releaseStateOf } from "@/lib/payment/load";
import { loadReport } from "@/lib/performance/load";
import { performanceNotFiled } from "@/lib/performance/report";

import { closureFaults, type ClosureFacts } from "./closure";
import { finalAccountOf, finalBasisMoved, finalPreconditionFaults, finalRouteFaults, type FinalAccount, type FinalJudged, type FinalSplit } from "./final-account";
import { declarationTakenUp, finalInputOf, finalSplitFor, financePaidOf, keyedOf, loadFinal, loadRequirements, openWorkOf, tierValueOf, unpaidCertificatesOf, variationsOpenNow, type FinalRow } from "./final-load";
import { SECURITY_KIND_WORDS } from "./labels";
import { loadCloseout, openLineCount, releaseEventsOf } from "./load";
import type { FinalBasis, Finding } from "./types";
import { retentionOf } from "./view";

/// The latest baseline version (the far day reads the one in force now, with every extension of time): the final account is judged on it.
const NOW_ON = "9999-12-31";
export const finalBaselineOf = (l: LoadedContract) => baselineOn(l, NOW_ON);

const money = (v: Sen) => senToDecimalString(v);

/// The certificate's figures: the final sum's two lines, each line of the blocks, and the totals recomputed from them (never keyed); then, where the
/// contract has nominated parties or assignees, what each is paid of the payment and the main contractor's share (ruling 4, as the interim prints them).
export function finalSnapshotOf(today: string, a: FinalAccount, split: FinalSplit | null): ComputedSnapshot {
  const m = (key: string, labelEn: string, v: Sen): FigureLine => ({ key, labelEn, type: "MONEY", value: money(v), overridable: false });
  const less = a.lines.filter((l) => l.block === "LESS").map((l, i) => m(`less${i + 1}`, l.label, l.amount));
  const deduct = a.lines.filter((l) => l.block === "DEDUCT").map((l, i) => m(`deduct${i + 1}`, l.label, l.amount));
  const t = (key: string, labelEn: string, terms: [string, 1 | -1][]): FigureTotal => ({ key, labelEn, terms: terms.map(([k, sign]) => ({ key: k, sign })) });
  return {
    version: 1,
    computedOn: today,
    rule: { en: "The final contract sum, less what was paid before, less the deductions" },
    lines: [
      m("originalSum", "Original contract sum", a.originalSum),
      m("netAdjustment", "Net adjustment of the contract sum (issued adjustments)", a.netAdjustment),
      ...less,
      ...deduct,
      ...(split?.lines.length ? [...split.lines.map((x, i) => m(`party${i + 1}`, `Paid to ${x.name}`, x.paid)), m("partyContractor", "Paid to the main contractor", split.contractor)] : []),
    ],
    // A block with no line has no total (a total is never empty): the payment reads the blocks that have one.
    totals: [
      t("finalSum", "Final contract sum", [["originalSum", 1], ["netAdjustment", 1]]),
      ...(less.length ? [t("less", "Less", less.map((x) => [x.key, 1]))] : []),
      ...(deduct.length ? [t("deduct", "Deduct", deduct.map((x) => [x.key, 1]))] : []),
      t("recommended", "Payment recommended", [["finalSum", 1], ...(less.length ? [["less", -1] as [string, -1]] : []), ...(deduct.length ? [["deduct", -1] as [string, -1]] : [])]),
    ],
    routingRatio: null,
  };
}

/// The final account as it stands now, for a live row (the keyed lines it holds, the basis it froze), with the waivers already applied on it, and
/// its split (ruling 4) in what it was judged under.
export async function finalNow(tx: Tx, l: LoadedContract, fa: Pick<FinalRow, "previousBasis" | "finalLines" | "certificateId" | "partyLines">, completionDate: string) {
  const baseline = finalBaselineOf(l);
  if (!baseline) return null;
  const p = await loadPayment(l.contract.id, tx);
  const r = finalInputOf(p, baseline, fa.previousBasis as FinalBasis, keyedOf(fa), completionDate, fa.certificateId);
  const account = finalAccountOf(r.input);
  const split = await finalSplitFor(tx, l.org.id, p, fa, account.recommended);
  return { ...r, judged: { ...r.judged, ...split.judged }, p, account, split };
}

/// What sending the FINAL for approval needs (§4.6; ruling 17), as the contract stands.
export async function finalRouteFactsOf(tx: Tx, l: LoadedContract, fa: FinalRow, today: string | null) {
  const [requirements, report, p, variationsOpen] = await Promise.all([loadRequirements(l.org.id, today, tx), loadReport(l.contract.id, tx), loadPayment(l.contract.id, tx), variationsOpenNow(tx, l.contract.id)]);
  const met = new Set(fa.packEntries.map((e) => e.requirementId));
  const split = await finalSplitFor(tx, l.org.id, p, fa, senFromDecimal(fa.recommended));
  return {
    pack: requirements.map((r) => ({ label: r.labelEn, met: met.has(r.id) })),
    declarationTakenUp: await declarationTakenUp(tx, l.contract.id, fa.declarationDocumentId),
    financeConfirmed: fa.financeConfirmedTotal == null ? null : senFromDecimal(fa.financeConfirmedTotal),
    financePaid: financePaidOf(p),
    performance: performanceNotFiled(report),
    variationsOpen,
    split: split.faults,
  };
}

/// FINAL only: refused before its route opens while the pack, the declaration, Finance's confirmation or the performance report is missing.
export async function finalSendFaults(tx: Tx, l: LoadedContract, certificateId: string, today: string): Promise<Finding[]> {
  await tx.$queryRaw`SELECT id FROM "FinalAccount" WHERE "certificateId" = ${certificateId} FOR UPDATE`;
  const fa = await loadFinal(l.contract.id, tx);
  if (!fa || fa.certificateId !== certificateId) return [{ code: "FINAL_ACCOUNT_MISSING", level: "block" }];
  return finalRouteFaults(await finalRouteFactsOf(tx, l, fa, today));
}

/// FINAL_BASIS_MOVED at issue: the account read again on the locked rows, against what it was judged under at its raise.
export async function finalMovedFaults(tx: Tx, l: LoadedContract, fa: FinalRow, completionDate: string): Promise<Finding[]> {
  const now = await finalNow(tx, l, fa, completionDate);
  if (!now) return [{ code: "FINAL_BASIS_MOVED", level: "block", data: { items: "the contract's baseline" } }];
  if (now.unreadable.length) return now.unreadable;
  const moved = finalBasisMoved(fa.judgedUnder as unknown as FinalJudged, now.judged);
  if (moved.length) return moved;
  // Ruling 4: the split refuses at issue as at the send (a party recorded since, or the remainder rule unset since).
  if (now.split.faults.length) return now.split.faults;
  return now.account.recommended === senFromDecimal(fa.recommended) ? [] : [{ code: "FINAL_BASIS_MOVED", level: "block", data: { items: "the payment recommended" } }];
}

/**
 * CO-6 (ruling 11): Finance's payment of the FINAL certificate. Where the retention balance's event is the final payment (set so, or MAKING_GOOD on a
 * contract with no defects liability period) and the balance is not yet released, its ledger row is written now, in the same transaction, once:
 * the final certificate paid it. A tier the earlier releases took past what was held (ruling 1c) was recovered on the final, so it records nothing.
 */
export async function afterFinalPayment(c: CertCtx, paidOn: string, personId: string): Promise<void> {
  const l = c.l;
  const [rows, p, policy] = await Promise.all([loadCloseout(l.contract.id, c.tx), loadPayment(l.contract.id, c.tx), c.tx.postAwardPolicy.findUnique({ where: { organisationId: l.org.id }, select: { retentionBalanceReleaseAt: true, performanceBondReleaseAt: true } })]);
  // Read inside the payment's transaction: the payment row is written, so the event reads as reached.
  const event = releaseEventsOf(rows, policy).retention;
  if (event.state !== "REACHED" || event.event !== "FINAL_PAYMENT") return;
  const rs = releaseStateOf(p);
  if (rs.already.balance) return;
  const held = heldOnLatest(issuedInterims(p));
  if (!held || held.certificateId.startsWith("opening:")) return;
  const tier = (t: "MAIN" | "NSC" | "NS") => {
    const v = held.held[t] - rs.firstReleased[t];
    return v > 0n ? v : 0n;
  };
  const a = { MAIN: tier("MAIN"), NSC: tier("NSC"), NS: tier("NS") };
  if (a.MAIN + a.NSC + a.NS === 0n) return;
  const row = await c.tx.retentionRelease.create({
    data: { organisationId: l.org.id, contractId: l.contract.id, kind: "RELEASED_BALANCE", main: money(a.MAIN), nsc: money(a.NSC), ns: money(a.NS), heldMain: money(held.held.MAIN), heldNsc: money(held.held.NSC), heldNs: money(held.held.NS), pct: null, pctProvenance: null, basisCertificateId: l.cert.id, handoverId: null, releasedOn: new Date(`${paidOn}T00:00:00.000Z`), personId, note: "Paid on the final certificate.", recordedAt: c.now },
  });
  await writeAudit(c.tx, { actor: c.actor, organisationId: l.org.id, entity: "RetentionRelease", entityId: row.id, entityLabel: `${contractLabel({ number: l.contract.number, award: { awardeeName: l.award.awardeeName } })} · retention balance`, reason: "" }, "CREATE", diffFields(null, { release: "Retention balance", releasedMainContractor: formatMoney(a.MAIN), releasedNominatedSubcontractors: formatMoney(a.NSC), releasedNominatedSuppliers: formatMoney(a.NS), paidThrough: `the final certificate ${l.cert.number ?? ""}`.trim(), releasedOn: paidOn }));
  await manualCloseout.retentionReleased({ contractNumber: l.contract.number, what: "retention balance, paid on the final certificate", amount: money(a.MAIN + a.NSC + a.NS) });
}

/// The close's facts (§4.7), as the contract stands; `supply` from the contract type's payment route.
export async function closureFactsOf(tx: Tx, l: LoadedContract): Promise<{ facts: ClosureFacts; dgb: string[]; lossOpen: string[] }> {
  const [rows, p, report, fa, securities, type] = await Promise.all([
    loadCloseout(l.contract.id, tx),
    loadPayment(l.contract.id, tx),
    loadReport(l.contract.id, tx),
    loadFinal(l.contract.id, tx),
    tx.securityInstrument.findMany({ where: { contractId: l.contract.id, status: { not: "REJECTED" }, release: null }, select: { kind: true, instrumentRef: true }, orderBy: [{ lodgedOn: "asc" }, { id: "asc" }] }),
    l.ex.contractTypeCode ? tx.contractType.findFirst({ where: { organisationId: l.org.id, code: l.ex.contractTypeCode }, select: { paymentRoute: true } }) : null,
  ]);
  const work = await openWorkOf(tx, l, null);
  const unpaid = await unpaidCertificatesOf(tx, l.contract.id);
  const label = (s: { kind: string; instrumentRef: string | null }) => `${SECURITY_KIND_WORDS[s.kind] ?? "Security"}${s.instrumentRef ? ` ${s.instrumentRef}` : ""}`;
  const ret = retentionOf(p);
  return {
    facts: {
      supply: type?.paymentRoute === "DELIVERY_ORDER_INVOICE",
      finalIssued: fa?.certificate.status === "ISSUED",
      unpaid,
      certificatesInProgress: work.inProgress,
      mattersOpen: work.mattersOpen,
      defectsOpen: openLineCount(rows),
      retentionHeld: ret.balanceReleased ? 0n : ret.balance,
      securitiesHeld: securities.filter((s) => s.kind !== "DESIGN_GUARANTEE_BOND").map(label),
      performance: performanceNotFiled(report),
    },
    dgb: securities.filter((s) => s.kind === "DESIGN_GUARANTEE_BOND").map(label),
    lossOpen: work.lossOpen,
  };
}

export const closeFaultsOf = async (tx: Tx, l: LoadedContract) => closureFaults((await closureFactsOf(tx, l)).facts);

/**
 * What raising the final account reads (§4.6's table), on `tx`: the preconditions' refusals, and (where they pass) the account it would raise with
 * no keyed line yet. The act calls it on its locked transaction; the Final account tab calls it to offer the raise or say why not.
 */
export async function finalRaiseCheckOf(tx: Tx, l: LoadedContract) {
  const [rows, p, policy, work, variationsOpen] = await Promise.all([
    loadCloseout(l.contract.id, tx),
    loadPayment(l.contract.id, tx),
    tx.postAwardPolicy.findUnique({ where: { organisationId: l.org.id }, select: { finalPreviousBasis: true, ladWaiverApplication: true } }),
    openWorkOf(tx, l, null),
    variationsOpenNow(tx, l.contract.id),
  ]);
  const baseline = finalBaselineOf(l);
  const basis = (policy?.finalPreviousBasis ?? null) as FinalBasis | null;
  const cpcIssued = rows.cpc?.certificate.status === "ISSUED";
  const completion = cpcIssued ? storedDay(rows.cpc!.completionDate) : null;
  const r = basis && completion && baseline ? finalInputOf(p, baseline, basis, [], completion, null) : null;
  const unapplied = p.nonCompletions.flatMap((d) => d.waivers.filter((w) => !w.appliedOnCertificateId && !w.matter.closedAt && w.matter.approvedRouteId != null));
  const faults = finalPreconditionFaults({
    cpcIssued,
    dlpApplies: cpcIssued ? !!rows.cpc!.dlpStart : null,
    cmgdIssued: rows.cmgd?.certificate.status === "ISSUED",
    inProgress: work.inProgress,
    valuationOpen: p.interimValuations.some((v) => v.status === "OPEN"),
    eotOpen: work.eotOpen,
    lossExpenseOpen: work.lossOpen,
    basis,
    waiversUnapplied: unapplied.length,
    waiverSetting: policy?.ladWaiverApplication ?? null,
    waiversMoved: policy?.ladWaiverApplication ? (r?.moved ?? []).map((m) => String(m.data?.waiver ?? "a waiver")) : [],
    live: rows.final ? { number: rows.final.certificate.number } : null,
    tierValue: tierValueOf(p),
    liveKinds: p.contractParties.filter((x) => !x.retiredOn).map((x) => x.kind),
    variationsOpen,
  });
  // An interim whose figures do not add up is never read on a guess: it refuses the raise by name.
  const all = [...faults, ...(r?.unreadable ?? [])];
  return { faults: all, r, p, basis, account: r && !all.length ? finalAccountOf(r.input) : null };
}
