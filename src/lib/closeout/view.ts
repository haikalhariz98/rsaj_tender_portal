/**
 * What the close-out stage reads (Phase 2 close-out stage B; plan closeout-plan.md §3.2). Server-only, reads only, apart from the DLP notice,
 * which is written when the Completion tab is read, as the award's clocks are (once per offset: its key makes a second reading write nothing).
 * Every state and next line is the pure rules' (`closeoutNext`, `defectState`, `balanceEventOf`, `securityReturnFaults`); nothing is decided here.
 */

import type { Tx } from "@/lib/audit/record";
import { contractLabel, loadContract, type LoadedContract } from "@/lib/contract/repo";
import { db } from "@/lib/db";
import { dayPlus, dayToDate } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { loadEventPlan } from "@/lib/award/clock-notices";
import { dlpEndingNotices } from "@/lib/inbox/notices";
import { writeNotices } from "@/lib/inbox/store";
import { senFromDecimal, type Sen } from "@/lib/money";
import { heldOnLatest, recoupedOf } from "@/lib/payment/assemble";
import { issuedInterims, loadPayment, loadPaymentConfig, releaseStateOf, type PaymentRows } from "@/lib/payment/load";
import type { Tiers } from "@/lib/payment/retention";

import { dlpOffsetsDue, DLP_EVENT_KEY } from "./dlp";
import { closureFaults } from "./closure";
import { finalRouteFaults } from "./final-account";
import { loadFinal } from "./final-load";
import { closureFactsOf, finalRouteFactsOf } from "./final-write";
import { closeoutFaultText, SECURITY_KIND_WORDS } from "./labels";
import { defectState } from "./defects";
import { defectFactsOf, dlpOfRow, finalPaidOf, loadCloseout, openLineCount, releaseEventsOf, type CloseoutRows } from "./load";
import { cmgdFigureLines, cmgdSnapshotOf } from "./making-good";
import { closeoutNext } from "./next";
import { loadReport } from "@/lib/performance/load";
import { performanceState } from "@/lib/performance/report";
import { securityReturnFaults, type SecurityReturnInput } from "./release";
import type { BalanceEvent, CloseoutFacts, Finding } from "./types";

const sum = (t: Tiers) => t.MAIN + t.NSC + t.NS;

/// Every advance a guarantee secures is fully recouped on issued interims (null: it secures none). Shared by the act and the screen. Stage C: once the
/// final certificate is paid, what no interim recouped was recovered on it (its less block), so the advance is settled.
export function advanceRecoupedOf(p: PaymentRows, securityId: string, finalPaid = false): boolean | null {
  const advances = p.advancePayments.filter((a) => a.security?.id === securityId && a.certificate.status === "ISSUED");
  if (!advances.length) return null;
  if (finalPaid) return true;
  const issued = issuedInterims(p);
  return advances.every((a) => senFromDecimal(a.amount) - recoupedOf(issued, a.id) <= 0n);
}

/// The retention held on the latest issued interim, what the first release took, and the balance still to release. Ruling 1b (code review of
/// close-out stage B): what interims issued after the balance hold again (`sinceBalance`) is not zeroed; the final certificate pays it.
export function retentionOf(p: PaymentRows): { held: Sen; first: Sen; balance: Sen; balanceReleased: boolean; sinceBalance: Sen } {
  const h = heldOnLatest(issuedInterims(p));
  const rs = releaseStateOf(p);
  const held = h ? sum(h.held) : 0n;
  const first = sum(rs.firstReleased);
  const balance = rs.already.balance ? 0n : held - first;
  const b = p.retentionReleases.find((r) => r.kind === "RELEASED_BALANCE");
  const since = b ? held - first - (senFromDecimal(b.main) + senFromDecimal(b.nsc) + senFromDecimal(b.ns)) : 0n;
  return { held, first, balance: balance > 0n ? balance : 0n, balanceReleased: rs.already.balance, sinceBalance: since > 0n ? since : 0n };
}

/// What the CMGD prints, from what is held now (ruling 6): read at its raise, and again at its issue, which refuses if a figure moved (F5).
export async function cmgdFiguresNow(contractId: string, rows: CloseoutRows, client: Tx) {
  const [p, securities] = await Promise.all([loadPayment(contractId, client), client.securityInstrument.findMany({ where: { contractId, status: { not: "REJECTED" }, release: null }, orderBy: [{ lodgedOn: "asc" }, { id: "asc" }] })]);
  const snap = cmgdSnapshotOf({ securities: securities.map((s) => ({ kind: s.kind, form: s.form, reference: s.instrumentRef, value: senFromDecimal(s.value) })), retentionBalance: retentionOf(p).balance });
  const facts = defectFactsOf(rows);
  const withdrawn = facts.filter((d) => defectState(d.events).state === "WITHDRAWN").length;
  return { snap, withdrawn, lines: cmgdFigureLines(snap, { total: facts.length, withdrawn }) };
}

export async function closeoutView(l: LoadedContract, today: string | null) {
  const [rows, p, cfg, securities, report] = await Promise.all([
    loadCloseout(l.contract.id),
    loadPayment(l.contract.id),
    loadPaymentConfig(l.org.id),
    db.securityInstrument.findMany({ where: { contractId: l.contract.id, status: { not: "REJECTED" } }, include: { release: { include: { certificate: { select: { id: true, number: true, kind: true } }, person: { select: { name: true } } } } }, orderBy: [{ lodgedOn: "asc" }, { id: "asc" }] }),
    loadReport(l.contract.id),
  ]);
  const events = releaseEventsOf(rows, cfg.policy);
  // Stage C: the final account, what its send still needs, and the close's checklist.
  const [final, close] = await Promise.all([loadFinal(l.contract.id), closureFactsOf(db, l)]);
  const routeFaults = final?.certificate.status === "DRAFT" ? finalRouteFaults(await finalRouteFactsOf(db, l, final, today)) : [];
  const closeFaults = closureFaults(close.facts);
  const retention = retentionOf(p);
  const judged = securities.map((s) => {
    const input: SecurityReturnInput = { kind: s.kind, form: s.form, status: s.status, returned: !!s.release, officialReceiptRef: "receipt given at the act", performanceEvent: events.performance, retentionEvent: events.retention, advanceRecouped: advanceRecoupedOf(p, s.id, finalPaidOf(rows)) };
    const faults: Finding[] = securityReturnFaults(input);
    return { s, faults, returnable: faults.length === 0, label: `${SECURITY_KIND_WORDS[s.kind] ?? "Security"}${s.instrumentRef ? ` ${s.instrumentRef}` : ""}` };
  });
  const facts: CloseoutFacts = {
    status: l.contract.status,
    cpc: rows.cpc ? { id: rows.cpc.certificate.id, status: rows.cpc.certificate.status as "DRAFT", dlp: dlpOfRow(rows.cpc) } : null,
    schedule: rows.schedule ? { id: rows.schedule.certificate.id, status: rows.schedule.certificate.status as "DRAFT", rectifyBy: rows.schedule.rectifyBy.toISOString().slice(0, 10) } : null,
    cmgd: rows.cmgd ? { id: rows.cmgd.certificate.id, status: rows.cmgd.certificate.status as "DRAFT" } : null,
    defects: { open: openLineCount(rows) },
    retention: { balanceDue: retention.balance > 0n, event: events.retention },
    securities: judged.filter((x) => !x.s.release).map((x) => ({ id: x.s.id, label: x.label, returnable: x.returnable })),
    performance: performanceState(report),
    supply: close.facts.supply,
    final: final ? { id: final.certificateId, status: final.certificate.status as "DRAFT", paid: !!final.certificate.financePayment, firstMissing: routeFaults[0] ? closeoutFaultText(routeFaults[0]) : null } : null,
    closeBlocked: closeFaults[0] ? closeoutFaultText(closeFaults[0]) : null,
    today: today ?? "9999-12-31",
  };
  return { rows, p, cfg, facts, next: closeoutNext(facts), events, retention, securities: judged, report, final, close, closeFaults, routeFaults };
}
export type CloseoutView = Awaited<ReturnType<typeof closeoutView>>;

/// The DLP notice (plan §4.3): who is told, and the offset reached today written once. Read where the Completion tab is shown, and by `dlpSweep`.
export const dlpNotice = (l: LoadedContract, v: CloseoutView, today: string | null) => dlpNoticeFor(l, v.rows.cpc, today);

/**
 * F9 (code review of close-out stage B): the DLP reminders go out without anyone opening the contract. Each contract of the organisation whose CPC
 * is issued and whose period is still running is told its offset reached today, as the Completion tab tells it; run where the inbox is read.
 */
export async function dlpSweep(organisationId: string, today: string | null): Promise<void> {
  if (!today) return;
  const running = await db.practicalCompletion.findMany({ where: { organisationId, dlpEnd: { gt: dayToDate(today) }, certificate: { status: "ISSUED" } }, select: { contractId: true } });
  for (const { contractId } of running) {
    const l = await loadContract(organisationId, contractId);
    if (l) await dlpNoticeFor(l, (await loadCloseout(contractId)).cpc, today);
  }
}

async function dlpNoticeFor(l: LoadedContract, pc: CloseoutRows["cpc"], today: string | null) {
  const plan = await loadEventPlan(db, { organisationId: l.org.id, organisationCode: l.org.code, requestingUnitCode: l.req.requestingUnitCode, namedPartyId: null, today, eventKey: DLP_EVENT_KEY });
  if (!pc || pc.certificate.status !== "ISSUED" || !today) return plan;
  const dlp = dlpOfRow(pc);
  if (dlp.applies !== true || plan.state !== "RULE_SET") return plan;
  const rule = await db.notificationRule.findFirst({ where: { organisationId: l.org.id, eventKey: DLP_EVENT_KEY }, select: { reminderOffsetDays: true } });
  const due = dlpOffsetsDue(dlp.endExclusive, today, rule?.reminderOffsetDays ?? []);
  if (due.length && plan.recipientIds.length) {
    const label = contractLabel({ number: l.contract.number, award: { awardeeName: l.award.awardeeName } });
    await db.$transaction(async (tx) => {
      for (const offset of due) await writeNotices(tx, l.org.id, null, dlpEndingNotices({ practicalCompletionId: pc.id, contractId: l.contract.id, contractLabel: label, endsWords: formatDate(dayPlus(dlp.endExclusive, -1)), offset, recipients: plan.recipientIds }));
    });
  }
  return plan;
}

export type { BalanceEvent };
