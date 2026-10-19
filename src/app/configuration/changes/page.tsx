import { requireStaff } from "@/app/_auth/actor";
import { editRegistry } from "@/app/_auth/stage";
import type { Row } from "@/components/data-list";
import { Callout } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { loadChangesView, type ChangeRow } from "@/lib/auth/changes-view";
import { mayReadQueue } from "@/lib/auth/configuration-change";
import { formatOrgDateTime } from "@/lib/format";

import { Stat, Stats } from "../records-ui";
import { whatChanges } from "@/lib/auth/configuration-change-words";
import { DecidedList, WaitingList, type QueueRow } from "./changes-list";

export const dynamic = "force-dynamic";

/**
 * Changes awaiting a second person (ADR 0034 D15, Phase 2c): the queue of high-risk changes that one person has proposed and a different person decides.
 * Each is read in words (what changes, from what to what), with its age and who it waits for, so nothing waits without an owner. The second person applies it
 * with their password, or declines it with a reason; the proposer can only withdraw it. Where nobody else could decide a kind of change, the screen says a
 * second person is needed, and the product never fakes one.
 */
export default async function ChangesPage() {
  const actor = await requireStaff();
  // The queue names who is being made an administrator, whose account is getting a code and why, and which sign-in settings are changing: it is read by those who decide
  // a kind of change, and each reads the kinds they decide (`loadChangesView`).
  if (!mayReadQueue(actor.permissions)) {
    return (
      <>
        <PageHeader title="Changes awaiting a second person" info={{ title: "Changes awaiting a second person", text: "Proposed by one person, decided by a different one. Nothing is applied until then." }} />
        <Callout tone="warn" title="Only those who decide these changes read them">
          This queue is read by people who hold the permission to change the sign-in settings, to grant permissions to roles, or to manage sign-in accounts. Ask an administrator if a change is waiting on you.
        </Callout>
      </>
    );
  }
  const now = new Date();
  const zone = actor.organisationTimeZone;
  const view = await loadChangesView(actor, now, editRegistry);

  const since = (c: ChangeRow) => `${formatOrgDateTime(c.proposedAt, zone)}${c.waitingDays != null ? ` · ${c.waitingDays === 0 ? "today" : c.waitingDays === 1 ? "1 day" : `${c.waitingDays} days`}` : ""}`;
  const waiting: QueueRow[] = view.waiting.map((c) => {
    const what = whatChanges(c.lines);
    const row: Row = {
      id: c.id,
      search: [c.title, c.subject, c.proposedBy, c.reason, ...c.lines.flatMap((l) => [l.label, l.before, l.after])].filter(Boolean).join(" "),
      sortKeys: { proposed: c.proposedAt.getTime() },
      cells: {
        change: { kind: "stack", title: c.title, sub: c.subject ?? undefined },
        what: { kind: "stack", title: what.title, sub: what.sub },
        proposed: { kind: "person", name: c.proposedBy, sub: since(c) },
        waitingFor: c.waitingFor.length > 0 ? { kind: "stack", title: c.waitingFor.join(", ") } : { kind: "badge", text: "A second person is needed", tone: "warn" },
      },
      ...(c.isYours ? { note: "You proposed this, so you cannot decide it. You can withdraw it." } : {}),
    };
    return { id: c.id, facts: { title: c.title, subject: c.subject, lines: c.lines, reason: c.reason, proposedBy: c.proposedBy }, makesCode: c.makesCode, canDecide: c.canDecide, isYours: c.isYours, row };
  });
  const decided: Row[] = view.decided.map((c) => {
    const what = whatChanges(c.lines);
    return {
      id: c.id,
      search: [c.title, c.subject, c.proposedBy, c.decidedBy, c.statusWords, ...c.lines.flatMap((l) => [l.label, l.before, l.after])].filter(Boolean).join(" "),
      sortKeys: { decided: c.decidedAt?.getTime() ?? 0 },
      cells: {
        change: { kind: "stack", title: c.title, sub: c.subject ?? undefined },
        what: { kind: "stack", title: what.title, sub: what.sub },
        standing: { kind: "badge", text: c.statusWords, tone: c.status === "APPLIED" ? "ok" : c.status === "STALE" ? "warn" : "info" },
        decided: { kind: "person", name: c.decidedBy ?? "—", sub: [c.decidedAt ? formatOrgDateTime(c.decidedAt, zone) : null, c.decisionReason || null].filter(Boolean).join(" · ") || undefined },
      },
    };
  });

  const forYou = view.waiting.filter((c) => c.canDecide).length;
  const yours = view.waiting.filter((c) => c.isYours).length;
  const stuck = view.waiting.filter((c) => c.waitingFor.length === 0).length;

  return (
    <>
      <PageHeader title="Changes awaiting a second person" info={{ title: "Changes awaiting a second person", text: "Proposed by one person, decided by a different one. Nothing is applied until then." }} />

      {stuck > 0 && (
        <Callout tone="warn" title={stuck === 1 ? "One change has nobody who could decide it" : `${stuck} changes have nobody who could decide them`} className="mb-5">
          Each needs a second person who holds the permission that decides it, and who is not the person who proposed it. Until one exists the change waits, and the product does not approve it for them.
        </Callout>
      )}

      <Stats>
        <Stat label="Waiting for you" value={forYou} hint="You may apply or decline these" warn={forYou > 0} />
        <Stat label="Proposed by you" value={yours} hint="Another person decides these" />
        <Stat label="Waiting in all" value={view.waiting.length} hint="Proposed and not yet decided" />
      </Stats>

      <Card className="mb-6 overflow-hidden">
        <CardHeader
          title="Waiting"
          subtitle="No reminder rule is set"
          divided={false}
        />
        <WaitingList rows={waiting} />
      </Card>

      <Card className="overflow-hidden">
        <CardHeader title="Decided" subtitle="Latest fifty, all kept" divided={false} />
        <DecidedList rows={decided} />
      </Card>
    </>
  );
}
