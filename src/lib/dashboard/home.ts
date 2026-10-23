/**
 * What Home shows that is the signed-in person's own (step 6.2): the "Needs you" list and the small figures' subtitles. Pure.
 *
 * No amount is carried here, so nothing on Home is SULIT. "Overdue" is not judged: there is no configured target to call a wait overdue against (ruling R5),
 * so a row says how long it has waited and the oldest come first.
 */
import type { MyStep } from "@/lib/approvals/queue";

export interface NeedsYouRow {
  key: string;
  title: string;
  /// What kind of thing it is, as a person reads it ("Requisition", "Committee matter").
  kind: string;
  /// Who or what it waits on: the office for an approval step, the committee for a matter.
  waitingOn: string;
  /// Whole days waited; null while no time zone is set.
  days: number | null;
  href: string;
  action: string;
}

/// A committee matter still pending, as the dashboard loader reads it.
export interface CommitteeMatter {
  decisionId: string;
  committeeCode: string;
  committeeName: string;
  subject: string;
  meetingId: string;
  waitingDays: number;
}

/// My approval steps (not those I am barred from), then the committee matters of the committees I sit on. Each group is oldest first.
export function needsYou(mine: readonly MyStep[], matters: readonly CommitteeMatter[], myCommittees: ReadonlySet<string>): NeedsYouRow[] {
  const steps: NeedsYouRow[] = mine
    .filter((m) => !m.barred)
    .map((m) => ({ key: `step:${m.item.stepId}`, title: m.item.matterLabel, kind: m.item.matterKindLabel, waitingOn: m.item.officeLabel, days: m.item.waitingDays, href: m.item.href, action: "Decide" }));
  const sittings: NeedsYouRow[] = matters
    .filter((q) => myCommittees.has(q.committeeCode))
    .sort((a, b) => b.waitingDays - a.waitingDays)
    .map((q) => ({ key: `matter:${q.decisionId}`, title: q.subject, kind: "Committee matter", waitingOn: q.committeeName, days: q.waitingDays, href: `/committees/${q.meetingId}`, action: "Open" }));
  return [...steps, ...sittings];
}

/// "today", "1 day", "3 days"; nothing where the wait is not counted.
export const waitedLabel = (days: number | null): string | null => (days == null ? null : days === 0 ? "today" : `${days} ${days === 1 ? "day" : "days"}`);

/// "2 approved · 1 sent back": the parts that are not nought, joined. Empty when all are.
export function nonZeroParts(parts: readonly [count: number, label: string][]): string {
  return parts.filter(([n]) => n > 0).map(([n, l]) => `${n} ${l}`).join(" · ");
}
