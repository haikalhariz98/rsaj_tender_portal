import { editRegistry } from "@/app/_auth/stage";
import type { Row } from "@/components/data-list";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/feedback";
import { Card, CardHeader } from "@/components/ui/card";
import { loadChangesView, type ChangeRow } from "@/lib/auth/changes-view";
import { twoPersonOn } from "@/lib/auth/policy-store";
import { kindsReadBy } from "@/lib/auth/configuration-change";
import { editKindsReadBy } from "@/lib/auth/configuration-edit";
import { whatChanges } from "@/lib/auth/configuration-change-words";
import type { StaffActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { formatOrgDateTime } from "@/lib/format";

import { DecidedList, WaitingList, type QueueRow } from "./changes-list";

/**
 * The two-person queue (ADR 0034 D15, NFR-SEC-004, FR-APR-020), shown as a tab of My approvals: the changes one person has proposed and a different person decides.
 * Each is read in words (what changes, from what to what), with its age and who it waits for, so nothing waits without an owner. The second person applies it
 * with their password, or declines it with a reason; the proposer can only withdraw it. Where nobody else could decide a kind of change, the screen says a
 * second person is needed, and the product never fakes one. The caller has checked `mayReadQueue`.
 */

/// How many changes wait that this person may read: the tab's count, the same reading `loadChangesView` makes.
export async function queueCount(actor: StaffActor): Promise<number> {
  const kinds = [...kindsReadBy(actor.permissions), ...editKindsReadBy(actor.permissions)];
  return db.configurationChange.count({ where: { organisationId: actor.organisationId, status: "PROPOSED", OR: [{ kind: { in: kinds } }, { proposedByPersonId: actor.personId }] } });
}

export async function ChangesQueue({ actor }: { actor: StaffActor }) {
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
    return { id: c.id, facts: { title: c.title, subject: c.subject, lines: c.lines, reason: c.reason, proposedBy: c.proposedBy }, makesCode: c.makesCode, canDecide: c.canDecide, canApply: c.canApply, isYours: c.isYours, row };
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

  const stuck = view.waiting.filter((c) => c.waitingFor.length === 0).length;

  return (
    <>
      {!(await twoPersonOn(db, actor.organisationId)) && actor.permissions.has("configuration.issue") && <div className="mb-3"><Badge tone="neutral">Approval by another admin: off</Badge></div>}
      {stuck > 0 && (
        <Callout tone="warn" title={stuck === 1 ? "One change has nobody who could decide it" : `${stuck} changes have nobody who could decide them`} className="mb-5">
          Needs a second decider.
        </Callout>
      )}

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
