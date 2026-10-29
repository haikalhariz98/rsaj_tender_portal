/**
 * What close-out reads of a contract (Phase 2 close-out stage B). Server-only, reads only: the acts, the issue hooks, the Completion and Defects
 * tabs and the contractor's Defects tab all read the same rows, and every state is the pure rules' (`defectState`, `balanceEventOf`).
 *
 * A line on a void CPC's list is not a line of the contract (the certificate never issued): it is left out everywhere lines are counted or listed.
 */

import type { Tx } from "@/lib/audit/record";
import { CORRECTIONS } from "@/lib/payment/correction";
import { dayOrNull as day, storedDay } from "@/lib/dates";
import { db } from "@/lib/db";
import { liveDecisionsByScope } from "@/lib/lad/basis";
import type { Scope } from "@/lib/time/types";

import { defectState, isOpenLine } from "./defects";
import { balanceEventOf } from "./release";
import type { BalanceEvent, DefectFact, Dlp, ReleaseEvent } from "./types";

const certSelect = { id: true, status: true, number: true, kind: true, issueSnapshot: true } as const;

export async function loadCloseout(contractId: string, client: Tx = db) {
  const [completions, schedules, makingGoods, lines, finals] = await Promise.all([
    client.practicalCompletion.findMany({ where: { contractId }, include: { certificate: { select: certSelect }, person: { select: { name: true } } }, orderBy: { recordedAt: "asc" } }),
    client.defectSchedule.findMany({ where: { contractId }, include: { certificate: { select: certSelect } }, orderBy: { recordedAt: "asc" } }),
    client.makingGood.findMany({ where: { contractId }, include: { certificate: { select: certSelect } }, orderBy: { recordedAt: "asc" } }),
    client.defectItem.findMany({
      where: { contractId, OR: [{ practicalCompletionId: null }, { practicalCompletion: { certificate: { status: { not: "VOID" } } } }] },
      include: { events: { include: { person: { select: { name: true } }, evidenceDocument: { select: { id: true, title: true } } }, orderBy: [{ recordedAt: "asc" }, { id: "asc" }] }, reportedBy: { select: { name: true } } },
      orderBy: [{ recordedAt: "asc" }, { id: "asc" }],
    }),
    // Stage C: the final certificate, and whether Finance's payment of it is recorded (the FINAL_PAYMENT event).
    client.finalAccount.findMany({ where: { contractId }, select: { id: true, certificate: { select: { ...certSelect, financePayment: { select: { id: true, ...CORRECTIONS } } } } }, orderBy: { recordedAt: "asc" } }),
  ]);
  const live = <T extends { certificate: { status: string } }>(rows: readonly T[]) => [...rows].reverse().find((r) => r.certificate.status !== "VOID") ?? null;
  const cpc = live(completions);
  const schedule = live(schedules);
  const cmgd = live(makingGoods);
  const final = live(finals);
  return { completions, schedules, makingGoods, lines, cpc, schedule, cmgd, final };
}
export type CloseoutRows = Awaited<ReturnType<typeof loadCloseout>>;

/// The DLP frozen on a CPC row.
export const dlpOfRow = (pc: { dlpStart: Date | null; dlpEnd: Date | null }): Dlp => (pc.dlpStart && pc.dlpEnd ? { applies: true, start: storedDay(pc.dlpStart), endExclusive: storedDay(pc.dlpEnd) } : { applies: false });

/// The contract's lines as the rules read them.
export const defectFactsOf = (rows: CloseoutRows): DefectFact[] =>
  rows.lines.map((d) => ({
    id: d.id,
    source: d.source,
    description: d.description,
    location: d.location,
    dueOn: storedDay(d.dueOn),
    events: d.events.map((e) => ({ kind: e.kind, on: storedDay(e.on), note: e.note, at: e.recordedAt.toISOString() })),
  }));

/// Lines neither made good nor withdrawn.
export const openLineCount = (rows: CloseoutRows): number => defectFactsOf(rows).filter((d) => isOpenLine(defectState(d.events).state)).length;

/// The live damages decisions charging LAD, each with its window's first day not charged (null: still running), for the CPC's raise and issue.
export async function liveLadWindows(contractId: string, client: Tx = db): Promise<{ until: string | null }[]> {
  const rows = await client.nonCompletion.findMany({ where: { contractId }, select: { id: true, scope: true, sectionRef: true, replacesId: true, outcome: true, windowUntil: true, certificate: { select: { status: true } } }, orderBy: [{ decidedOn: "asc" }, { recordedAt: "asc" }] });
  const live = liveDecisionsByScope(rows.map((r) => ({ ...r, scope: r.scope as Scope | null, certificateStatus: r.certificate?.status ?? null })));
  return [...live.values()].filter((d) => d.outcome === "LAD_APPLIES").map((d) => ({ until: day(d.windowUntil) }));
}

/// Where the retention balance's and the performance bond's events stand on this contract (CO-6): the switches read with the CPC's frozen DLP
/// (none: MAKING_GOOD reads as FINAL_PAYMENT), the CMGD and its final inspection, and (stage C) Finance's payment of the final certificate.
export function releaseEventsOf(rows: CloseoutRows, policy: { retentionBalanceReleaseAt: string | null; performanceBondReleaseAt: string | null } | null): { retention: BalanceEvent; performance: BalanceEvent } {
  const cpcIssued = rows.cpc?.certificate.status === "ISSUED";
  const facts = { dlpApplies: cpcIssued ? !!rows.cpc!.dlpStart : true, cmgdIssued: rows.cmgd?.certificate.status === "ISSUED", finalInspectionRecorded: !!rows.cmgd?.finalInspectionOn, finalPaid: finalPaidOf(rows) };
  return { retention: balanceEventOf((policy?.retentionBalanceReleaseAt ?? null) as ReleaseEvent | null, facts), performance: balanceEventOf((policy?.performanceBondReleaseAt ?? null) as ReleaseEvent | null, facts) };
}

/// The issued CMGD's issue day (null: not issued), which a release or return it authorises is not dated before (F4).
export const cmgdIssuedOn = (rows: CloseoutRows): string | null => (rows.cmgd?.certificate.status === "ISSUED" ? ((rows.cmgd.certificate.issueSnapshot as { issuedOn?: string } | null)?.issuedOn ?? null) : null);

/// The issued schedule's day to make good by, for the overdue reading.
export const scheduleRectifyBy = (rows: CloseoutRows): string | null => (rows.schedule?.certificate.status === "ISSUED" ? day(rows.schedule.rectifyBy) : null);

/// Stage C: the final certificate is issued and Finance's payment of it is recorded.
export const finalPaidOf = (rows: CloseoutRows): boolean => rows.final?.certificate.status === "ISSUED" && !!rows.final.certificate.financePayment;
