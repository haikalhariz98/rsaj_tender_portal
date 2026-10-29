/**
 * What the final account and the close read of a contract (Phase 2 close-out stage C; plan closeout-plan.md §4.6, §4.7). Server-only, reads
 * only: the acts (on their locked transaction), the FINAL's issue hook, Finance's payment of it and the Final account and Close tabs all read
 * the same rows through here, and every judgement is the pure rules' (`finalAccountOf`, `finalPreconditionFaults`, `finalRouteFaults`,
 * `closureFaults`). Nothing is decided here.
 */

import type { Tx } from "@/lib/audit/record";
import { CORRECTIONS } from "@/lib/payment/correction";
import { KIND_WORDS } from "@/lib/certificate/labels";
import type { CertificateKind } from "@/lib/certificate/types";
import type { LoadedContract } from "@/lib/contract/repo";
import { db } from "@/lib/db";
import { scopeKey, type Scope } from "@/lib/lad/basis";
import { ladLines } from "@/lib/lad/scopes";
import { loadMatters, matterFactsOf } from "@/lib/matter/load";
import { matterApproved, type ContractMatterKind } from "@/lib/matter/matter";
import { matterLabel } from "@/lib/matter/write";
import { parseSen, senFromDecimal, senToDecimalString, type Sen } from "@/lib/money";
import { asCorrected } from "@/lib/payment/correction";
import { damagesOf, freePending, issuedAdjustmentsOf, issuedAdvances, issuedInterims, waiversToApplyOf, type PaymentRows } from "@/lib/payment/load";
import { eotClaimState } from "@/lib/time/claim-state";
import { commencedPending, standsApproved } from "@/lib/variation/application";
import { factsOf, loadVariations } from "@/lib/variation/load";
import { claimStateFactsOf } from "@/lib/time/view";

import { variationsOpenOf, type FinalAccountInput, type FinalInterim, type FinalJudged } from "./final-account";
import type { FinalBasis, Finding, KeyedFinalKind } from "./types";

type Baseline = NonNullable<ReturnType<typeof import("@/lib/payment/load").baselineOn>>;

export async function loadFinal(contractId: string, client: Tx = db) {
  const rows = await client.finalAccount.findMany({
    where: { contractId },
    include: {
      certificate: { select: { id: true, status: true, number: true, issueSnapshot: true, financePayment: { select: { id: true, ...CORRECTIONS } } } },
      finalLines: { orderBy: [{ recordedAt: "asc" }, { id: "asc" }] },
      packEntries: { include: { requirement: { select: { id: true, labelEn: true } }, projectDocument: { select: { id: true, title: true } }, person: { select: { name: true } } } },
      declarationDocument: { select: { id: true, title: true } },
      financeConfirmedBy: { select: { name: true } },
      person: { select: { name: true } },
    },
    orderBy: { recordedAt: "asc" },
  });
  return [...rows].reverse().find((r) => r.certificate.status !== "VOID") ?? null;
}
export type FinalRow = NonNullable<Awaited<ReturnType<typeof loadFinal>>>;

/// The configured close-out documents in force on `today` (not retired, or retired from a later day: an exclusive end), in their order.
export const loadRequirements = (organisationId: string, today: string | null, client: Tx = db) =>
  client.closeoutDocumentRequirement.findMany({ where: { organisationId, OR: [{ retiredOn: null }, ...(today ? [{ retiredOn: { gt: new Date(`${today}T00:00:00.000Z`) } }] : [])] }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });

const fig = (m: ReadonlyMap<string, string | null>, k: string): Sen => {
  const v = m.get(k);
  return v == null ? 0n : parseSen(v);
};
const sumKeys = (m: ReadonlyMap<string, string | null>, re: RegExp): Sen => [...m.keys()].filter((k) => re.test(k)).reduce((a, k) => a + fig(m, k), 0n);
const tiers = (r: { MAIN: string; NSC: string; NS: string } | undefined) => ({ MAIN: r ? parseSen(r.MAIN) : 0n, NSC: r ? parseSen(r.NSC) : 0n, NS: r ? parseSen(r.NS) : 0n });

/// Every issued interim as the final account reads it, from its issued figures; FINAL_INTERIM_UNREADABLE names one whose deductions do not add up
/// to what it carried forward less what it paid (never guessed). The opening position (figures before the system) carries forward what it
/// certified, with no deductions on record.
export function finalInterimsOf(p: PaymentRows): { interims: FinalInterim[]; faults: Finding[] } {
  const faults: Finding[] = [];
  const interims = issuedInterims(p).map((x): FinalInterim => {
    const m = x.figures;
    const j = x.judgedUnder;
    const released = tiers(j?.released);
    const cf = fig(m, "carryForward");
    if (x.certificateId.startsWith("opening:")) return { certificateId: x.certificateId, number: null, carryForward: cf, recommended: cf, lad: { gross: 0n, waived: 0n, credit: 0n, rounding: 0n }, advance: { MAIN: 0n, NSC: 0n }, premiums: 0n, wages: 0n, nonCompliance: 0n, others: 0n, released };
    const scopes = j?.ladScopes;
    const waived = scopes ? scopes.reduce((a, s) => a + parseSen(s.waived), 0n) : fig(m, "ladWaived");
    const gross = scopes ? scopes.reduce((a, s) => a + parseSen(s.gross), 0n) : fig(m, "ladAmount") + waived;
    const out: FinalInterim = {
      certificateId: x.certificateId,
      number: p.interimValuations.find((v) => v.certificate?.id === x.certificateId)?.certificate?.number ?? null,
      carryForward: cf,
      recommended: fig(m, "recommended"),
      lad: { gross, waived, credit: fig(m, "ladCredit"), rounding: fig(m, "ladRounding") },
      advance: { MAIN: fig(m, "advanceMain"), NSC: fig(m, "advanceNsc") },
      premiums: fig(m, "premiums"),
      wages: fig(m, "wages"),
      nonCompliance: fig(m, "nonCompliance"),
      others: sumKeys(m, /^other\d+$/),
      released,
    };
    const ded = out.lad.gross - out.lad.waived - out.lad.credit + out.lad.rounding + out.advance.MAIN + out.advance.NSC + out.premiums + out.wages + out.nonCompliance + out.others;
    if (ded !== fig(m, "totalDeductions") || out.recommended !== cf - ded) faults.push({ code: "FINAL_INTERIM_UNREADABLE", level: "block", data: { number: out.number } });
    return out;
  });
  return { interims, faults };
}

/// What Finance's recorded payments on the interim and advance certificates add to, each at its latest correction (FR-FIN-004).
export function financePaidOf(p: PaymentRows): Sen {
  const paid = [...p.interimValuations.map((v) => (v.certificate?.status === "ISSUED" ? v.certificate.financePayment : null)), ...p.advancePayments.map((a) => (a.certificate.status === "ISSUED" ? a.certificate.financePayment : null))];
  return paid.reduce((a, x) => (x ? a + senFromDecimal(asCorrected(x).amount) : a), 0n);
}

/// The final account's input, as the contract stands: the interims, the advances, the adjustments, the damages it charges itself (the days no
/// interim charged up to `today`, the credits now due, and the approved waivers it applies: those not yet applied, and those already applied
/// on `finalCertId` when it is read again at issue), the premiums the employer paid and nothing recovered, and the keyed lines.
export function finalInputOf(p: PaymentRows, baseline: Baseline, basis: FinalBasis, keyed: FinalAccountInput["keyed"], today: string, finalCertId: string | null) {
  const { interims, faults } = finalInterimsOf(p);
  const { apply, moved } = waiversToApplyOf(p, baseline, "NEXT_CERTIFICATE");
  const already = p.nonCompletions.flatMap((d) => d.waivers.filter((w) => finalCertId && w.appliedOnCertificateId === finalCertId).map((w) => ({ id: w.id, scopeKey: scopeKey(d.scope as Scope | null, d.sectionRef), amount: senFromDecimal(w.waived), label: w.matter.reference ?? "a waiver" })));
  const toApply = [...already, ...apply];
  const d = damagesOf(p, baseline, toApply);
  const lad = ladLines({ valuationDate: today, wholeDate: d.wholeDate, scopes: d.scopes, issued: d.issued, returned: d.returned, waiversApplied: d.waiversApplied, waiversToApply: d.waiversToApply });
  const letter = new Map(p.nonCompletions.flatMap((n) => n.waivers.map((w) => [w.id, w.waiverLetterRef || w.matter.reference || ""] as const)));
  const pending = freePending(p);
  const adjustments = issuedAdjustmentsOf(p);
  const advances = issuedAdvances(p).map((a) => ({ id: a.id, party: a.party as "MAIN" | "NSC", amount: a.amount }));
  const input: FinalAccountInput = {
    basis,
    originalSum: baseline.values.contractSum,
    adjustments,
    interims,
    advances,
    ladNow: { gross: lad.total.gross, waived: lad.total.waived, credit: lad.total.credit, waiverIds: toApply.map((w) => w.id), waiverRefs: toApply.map((w) => letter.get(w.id) ?? "").filter(Boolean) },
    pending: pending.map((x) => ({ id: x.id, amount: x.amount })),
    keyed,
  };
  const judged: FinalJudged = {
    version: 1,
    basis,
    interims: interims.map((x) => x.certificateId),
    advances: advances.map((a) => a.id),
    adjustments: adjustments.map((a) => a.id),
    releases: p.retentionReleases.map((r) => r.id),
    waivers: toApply.map((w) => w.id),
    pending: pending.map((x) => x.id),
    finalSum: senToDecimalString(baseline.values.contractSum + adjustments.reduce((a, x) => a + x.net, 0n)),
    less: senToDecimalString(interims.reduce((a, x) => a + x.carryForward, 0n)),
    ladNow: senToDecimalString(lad.total.gross - lad.total.waived - lad.total.credit),
  };
  return { input, judged, ladFaults: [...d.faults, ...lad.faults], unreadable: faults, moved, credits: lad.credits, applied: toApply };
}

/// The open work a final account or a close is refused for (§4.6, §4.7): certificates in progress, matters whose route is pending or not yet sent,
/// extensions of time not finished, and loss-and-expense not valued, decided or paid.
export async function openWorkOf(tx: Tx, l: LoadedContract, exceptCertificateId: string | null) {
  const matters = await loadMatters(l.contract.id, tx);
  const eotOpen: string[] = [];
  const lossOpen: string[] = [];
  const mattersOpen: string[] = [];
  for (const m of matters) {
    const kind = m.kind as ContractMatterKind;
    if (kind === "EOT" && m.eotClaim && !["GRANTED", "NOT_ENTITLED", "CLOSED"].includes(eotClaimState(claimStateFactsOf(m)))) eotOpen.push(matterLabel(l, m));
    if (!m.closedAt && !(kind === "PERIOD_EXTENSION" ? !!m.periodExtension?.agreements.some((a) => a.certificate.status === "ISSUED") : matterApproved(matterFactsOf(m)))) mattersOpen.push(matterLabel(l, m));
  }
  const losses = await tx.lossExpenseClaim.findMany({ where: { contractId: l.contract.id }, include: { matter: { include: { routes: { select: { id: true, status: true }, orderBy: [{ openedAt: "asc" }, { id: "asc" }] } } }, adjustmentLines: { select: { sumAdjustment: { select: { certificate: { select: { status: true } } } } } } }, orderBy: { recordedAt: "asc" } });
  for (const x of losses) {
    const label = x.matter?.reference ?? `the claim for ${senToDecimalString(senFromDecimal(x.claimed))}`;
    const approved = !!x.matter && !x.matter.closedAt && !!x.matter.approvedRouteId && x.matter.routes.at(-1)?.id === x.matter.approvedRouteId;
    if (x.valued == null || !x.matter) lossOpen.push(`${label} (not valued or not sent)`);
    else if (!x.matter.closedAt && !approved) lossOpen.push(`${label} (not decided)`);
    else if (approved && !x.adjustmentLines.some((a) => a.sumAdjustment.certificate.status === "ISSUED")) lossOpen.push(`${label} (approved, not on an issued adjustment)`);
  }
  const certs = await tx.certificate.findMany({ where: { contractId: l.contract.id, status: { in: ["DRAFT", "IN_ROUTING", "SIGNING"] }, ...(exceptCertificateId ? { id: { not: exceptCertificateId } } : {}) }, select: { kind: true, number: true }, orderBy: [{ openedAt: "asc" }, { id: "asc" }] });
  const inProgress = certs.map((c) => `${KIND_WORDS[c.kind as CertificateKind].en}${c.number ? ` ${c.number}` : " (in progress)"}`);
  return { eotOpen, lossOpen, mattersOpen, inProgress };
}

/// Ruling 8 (code review of close-out stage C): the contract's variations not on an issued adjustment, named, as `variationsOpenOf` reads them.
/// A closed variation was never approved (an approved one is not closed), so it is left out; on an issued adjustment means its order is on a
/// line of an ISSUED Certificate of Adjustment of Contract Sum.
export async function variationsOpenNow(tx: Tx, contractId: string): Promise<string[]> {
  const rows = await loadVariations(contractId, tx);
  return variationsOpenOf(
    rows
      .filter((v) => v.status !== "CLOSED")
      .map((v) => {
        const f = factsOf(v);
        return { reference: v.reference ?? "a variation not yet numbered", approved: standsApproved(f), commencedPending: commencedPending(f), adjusted: v.orders.some((o) => o.certificate.status === "ISSUED" && o.adjustmentLines.some((a) => a.sumAdjustment.certificate.status === "ISSUED")) };
      }),
  );
}

/// A STATUTORY_DECLARATION project document of the contract whose latest version is marked TAKEN_UP (FR-FIN-007).
export async function declarationTakenUp(tx: Tx, contractId: string, documentId: string | null): Promise<boolean> {
  if (!documentId) return false;
  const d = await tx.projectDocument.findFirst({ where: { id: documentId, contractId, kind: "STATUTORY_DECLARATION" }, select: { versions: { orderBy: { number: "desc" }, take: 1, select: { decisions: { select: { outcome: true } } } } } });
  return !!d?.versions[0]?.decisions.some((x) => x.outcome === "TAKEN_UP");
}

/// The keyed lines of a final account, as the rule reads them.
export const keyedOf = (fa: { finalLines: readonly { keyed: boolean; kind: string; label: string; amount: { toString(): string } }[] }) =>
  fa.finalLines.filter((x) => x.keyed).map((x) => ({ kind: x.kind as KeyedFinalKind, label: x.label, amount: senFromDecimal(x.amount) }));

/// The contract's STATUTORY_DECLARATION documents whose latest version is taken up, for the Final account's dropdown.
export async function takenUpDeclarations(organisationId: string, contractId: string, client: Tx = db): Promise<{ value: string; label: string }[]> {
  const docs = await client.projectDocument.findMany({ where: { contractId, organisationId, kind: "STATUTORY_DECLARATION" }, select: { id: true, title: true, versions: { orderBy: { number: "desc" }, take: 1, select: { decisions: { select: { outcome: true } } } } }, orderBy: { createdAt: "desc" } });
  return docs.filter((d) => d.versions[0]?.decisions.some((x) => x.outcome === "TAKEN_UP")).map((d) => ({ value: d.id, label: d.title }));
}
