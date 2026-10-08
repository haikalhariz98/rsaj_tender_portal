import { requestWorklist } from "@/app/_auth/worklist";
import { DataList, type Row } from "@/components/data-list";
import { InboxIcon, RouteIcon } from "@/components/icons";
import { Tabs } from "@/components/tabs";
import { actLabel } from "@/components/ui/act";
import { Card, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { LeadWithMore } from "@/components/ui/more-text";
import { PageHeader } from "@/components/ui/page-header";
import { myStepsOf, waitingForCount, WAITING_RULE_TEXT, type QueueItem } from "@/lib/approvals/queue";
import { ESCALATION_KIND_LABEL } from "@/lib/authority/escalation-labels";
import { dayToDate } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { REPORTING_LINE_NOT_SET } from "@/lib/people/reporting-lines";
import { requireStaff } from "@/app/_auth/actor";

import { MoveAwayButton } from "./move-away-button";

export const dynamic = "force-dynamic";

/**
 * My approvals (FR-APR-010, FR-APR-018, ruling CO-7): the steps waiting for the person signed in, and every open route's next step under the office acting for it.
 *
 * Two tabs over one reading of the worklist (`loadWorklist`). My steps (`myStepsOf`) are the ones whose acting office the person holds, or holds a delegation
 * of; the shell's count is the length of the same list. By office is the whole of it, for whoever needs to see where an approval is stuck. Nobody is told by
 * email (email is not connected): what happens to a step, and what is told to whom, is in the staff inbox.
 */
export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const actor = await requireStaff();
  const { tab } = await searchParams;
  const w = await requestWorklist(actor);
  const all = w?.groups.flatMap((g) => g.items) ?? [];
  const mine = w ? myStepsOf(w.groups, actor.personId) : [];
  const waiting = waitingForCount(mine);

  const waitingCell = (i: QueueItem) => ({
    kind: "stack" as const,
    title: i.waitingDays == null ? "Not counted" : i.waitingDays === 1 ? "1 day" : `${i.waitingDays} days`,
    sub: `since ${formatDate(dayToDate(i.waitingSince))}`,
  });

  const mineRows: Row[] = mine.map((m) => ({
    id: m.item.stepId,
    views: [...(m.barred ? ["barred"] : []), ...(m.via === "DELEGATE" ? ["delegate"] : []), ...(m.item.escalation ? ["escalated"] : [])],
    search: [m.item.matterLabel, m.item.matterKindLabel, m.item.officeLabel].join(" "),
    sortKeys: { waiting: m.item.waitingDays ?? -1, office: m.item.officeLabel },
    cells: {
      matter: { kind: "link", text: m.item.matterLabel, href: m.item.href, sub: m.item.matterKindLabel },
      office: { kind: "stack", title: m.item.officeLabel, sub: m.via === "DELEGATE" ? "as the delegate of the office" : m.item.escalatedFrom ? `escalated from ${m.item.escalatedFrom}` : "as its holder" },
      act: { kind: "text", text: actLabel(m.item.act) },
      waiting: waitingCell(m.item),
      why: {
        kind: "chips",
        items: [
          ...(m.barred ? [{ text: "You raised it: you cannot decide it", tone: "warn" as const }] : [{ text: "Waiting for you", tone: "brand" as const, nowrap: true }]),
          ...(m.item.escalation ? [{ text: ESCALATION_KIND_LABEL[m.item.escalation], tone: "warn" as const, nowrap: true }] : []),
        ],
      },
    },
  }));

  const rows: Row[] = all.map((i) => ({
    id: i.stepId,
    views: [...(i.escalation ? ["escalated"] : []), ...(i.noneAvailable ? ["nobody"] : [])],
    search: [i.matterLabel, i.matterKindLabel, i.officeLabel, i.escalatedFrom ?? ""].join(" "),
    sortKeys: { waiting: i.waitingDays ?? -1, office: i.officeLabel },
    cells: {
      matter: { kind: "link", text: i.matterLabel, href: i.href, sub: i.matterKindLabel },
      office: { kind: "stack", title: i.officeLabel, sub: i.escalatedFrom ? `escalated from ${i.escalatedFrom}` : i.committee ? "a committee's decision" : undefined },
      act: { kind: "text", text: actLabel(i.act) },
      waiting: waitingCell(i),
      why: {
        kind: "chips",
        items: [
          ...(i.escalation ? [{ text: ESCALATION_KIND_LABEL[i.escalation], tone: "warn" as const, nowrap: true }] : []),
          ...(i.noneAvailable ? [{ text: "Nobody able to act", tone: "err" as const, nowrap: true }] : []),
          // The step stays where it is until the reporting line says who is above the holders, or an officer escalates it: said, not hidden.
          ...(i.noneAvailable && !w?.linesRecorded ? [{ text: `${REPORTING_LINE_NOT_SET}: the step stays put`, tone: "warn" as const, nowrap: true }] : []),
          ...(!i.escalation && !i.noneAvailable ? [{ text: i.committee ? "With the committee" : "With the office", tone: "brand" as const }] : []),
        ],
      },
    },
  }));
  const escalated = all.filter((i) => i.escalation).length;
  const nobody = all.filter((i) => i.noneAvailable).length;
  const COLUMNS = [
    { key: "matter", label: "Request", mobile: "primary" as const },
    { key: "office", label: "Waiting on", width: "160px", sortable: true, mobile: "meta" as const },
    { key: "act", label: "Action needed", width: "170px", hideBelow: "xl" as const },
    { key: "waiting", label: "Waiting for", width: "148px", sortable: true, mobile: "meta" as const },
    { key: "why", label: "Status", width: "250px", hideBelow: "md" as const, mobile: "meta" as const },
  ];

  const minePanel = (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<InboxIcon size={17} />}
        title="Waiting for you"
        subtitle={<LeadWithMore lead="The steps you can decide, oldest first." more="A step is yours when you hold the office acting for it, or hold a delegation of the whole office. A step you raised or sent is listed so it is not lost, and is not counted: you cannot decide it. A committee's step is decided at its sitting." />}
        divided={false}
      />
      {mineRows.length === 0 ? (
        <EmptyState title="Nothing is waiting for you">No open approval is waiting on an office you hold or hold a delegation of.</EmptyState>
      ) : (
        <DataList
          flat
          selectable={false}
          exportName="my-steps"
          searchPlaceholder="Search by request or office"
          emptyTitle="Nothing here"
          emptyBody="No step in this view."
          views={[
            { id: "delegate", label: "As a delegate" },
            { id: "escalated", label: "Escalated to me" },
            { id: "barred", label: "I raised it" },
          ]}
          rowOpens
          columns={COLUMNS}
          rows={mineRows}
        />
      )}
    </Card>
  );

  const officePanel = (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<RouteIcon size={17} />}
        title="By office"
        subtitle={<LeadWithMore lead="Grouped by the office acting for each step." more={`Filter by office, or narrow to what was escalated or has nobody able to act. ${WAITING_RULE_TEXT}`} />}
        actions={<MoveAwayButton waiting={nobody} />}
        divided={false}
      />
      {rows.length === 0 ? (
        <EmptyState title="Nothing awaits a decision">No approval route is open.</EmptyState>
      ) : (
        <DataList
          flat
          selectable={false}
          exportName="my-approvals"
          searchPlaceholder="Search by request or office"
          emptyTitle="Nothing here"
          emptyBody="No step in this view."
          views={[
            { id: "escalated", label: "Escalated" },
            { id: "nobody", label: "Nobody able to act" },
          ]}
          filters={[{ key: "office", label: "Waiting on" }]}
          rowOpens
          columns={COLUMNS}
          rows={rows}
        />
      )}
    </Card>
  );

  return (
    <>
      <PageHeader
        title="My approvals"
        subtitle={
          <LeadWithMore
            lead="The steps waiting for you, and every open approval's next step by the office that decides it."
            more="Nobody is told by email: email is not connected. What happens to a step, and who is told, appears in your inbox. A step whose office has nobody able to act is moved up where the reporting line says who is above the holders, and otherwise stays where it is and says why; it never passes down."
          />
        }
        meta={[`${waiting} waiting for you`, `${all.length} ${all.length === 1 ? "step" : "steps"} open`, `${escalated} escalated`, `${nobody} with nobody able to act`]}
      />
      {w && !w.today && (
        <Callout tone="warn" className="mb-6" title="The organisation's time zone is not set">
          How long each step has waited is counted on the organisation&apos;s day, which is not assumed to be UTC. The days are not counted until the zone is set.
        </Callout>
      )}
      <Tabs
        initial={tab}
        label="Approvals"
        tabs={[
          { id: "mine", label: "My steps", count: waiting, panel: minePanel },
          { id: "office", label: "By office", count: all.length, panel: officePanel },
        ]}
      />
    </>
  );
}
