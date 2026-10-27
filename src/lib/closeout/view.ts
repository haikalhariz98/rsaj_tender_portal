/**
 * What the close-out stage reads (Phase 2 close-out stage B; plan closeout-plan.md §3.2). Server-only, reads only, apart from the DLP notice,
 * which is written when the Completion tab is read, as the award's clocks are (once per offset: its key makes a second reading write nothing).
 * Every state and next line is the pure rules' (`closeoutNext`, `defectState`, `balanceEventOf`, `securityReturnFaults`); nothing is decided here.
 */

import { contractLabel, type LoadedContract } from "@/lib/contract/repo";
import { db } from "@/lib/db";
import { dayPlus } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { loadEventPlan } from "@/lib/award/clock-notices";
import { dlpEndingNotices } from "@/lib/inbox/notices";
import { writeNotices } from "@/lib/inbox/store";
import { senFromDecimal, type Sen } from "@/lib/money";
import { heldOnLatest, recoupedOf } from "@/lib/payment/assemble";
import { issuedInterims, loadPayment, loadPaymentConfig, releaseStateOf, type PaymentRows } from "@/lib/payment/load";
import type { Tiers } from "@/lib/payment/retention";

import { dlpOffsetsDue, DLP_EVENT_KEY } from "./dlp";
import { SECURITY_KIND_WORDS } from "./labels";
import { dlpOfRow, loadCloseout, openLineCount, releaseEventsOf } from "./load";
import { closeoutNext } from "./next";
import { securityReturnFaults, type SecurityReturnInput } from "./release";
import type { BalanceEvent, CloseoutFacts, Finding } from "./types";

const sum = (t: Tiers) => t.MAIN + t.NSC + t.NS;

/// Every advance a guarantee secures is fully recouped on issued interims (null: it secures none). Shared by the act and the screen.
export function advanceRecoupedOf(p: PaymentRows, securityId: string): boolean | null {
  const advances = p.advancePayments.filter((a) => a.security?.id === securityId && a.certificate.status === "ISSUED");
  if (!advances.length) return null;
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

export async function closeoutView(l: LoadedContract, today: string | null) {
  const [rows, p, cfg, securities] = await Promise.all([
    loadCloseout(l.contract.id),
    loadPayment(l.contract.id),
    loadPaymentConfig(l.org.id),
    db.securityInstrument.findMany({ where: { contractId: l.contract.id, status: { not: "REJECTED" } }, include: { release: { include: { certificate: { select: { id: true, number: true, kind: true } }, person: { select: { name: true } } } } }, orderBy: [{ lodgedOn: "asc" }, { id: "asc" }] }),
  ]);
  const events = releaseEventsOf(rows, cfg.policy);
  const retention = retentionOf(p);
  const judged = securities.map((s) => {
    const input: SecurityReturnInput = { kind: s.kind, form: s.form, status: s.status, returned: !!s.release, officialReceiptRef: "receipt given at the act", performanceEvent: events.performance, retentionEvent: events.retention, advanceRecouped: advanceRecoupedOf(p, s.id) };
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
    today: today ?? "9999-12-31",
  };
  return { rows, p, cfg, facts, next: closeoutNext(facts), events, retention, securities: judged };
}
export type CloseoutView = Awaited<ReturnType<typeof closeoutView>>;

/// The DLP notice (plan §4.3): who is told, and the offsets reached today written once each. Read only where the Completion tab is shown.
export async function dlpNotice(l: LoadedContract, v: CloseoutView, today: string | null) {
  const plan = await loadEventPlan(db, { organisationId: l.org.id, organisationCode: l.org.code, requestingUnitCode: l.req.requestingUnitCode, namedPartyId: null, today, eventKey: DLP_EVENT_KEY });
  const pc = v.rows.cpc;
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
