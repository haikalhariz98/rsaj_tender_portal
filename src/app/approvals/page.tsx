import { requestWorklist } from "@/app/_auth/worklist";
import { DataList, type Row } from "@/components/data-list";
import { InboxIcon, RouteIcon } from "@/components/icons";
import { Tabs } from "@/components/tabs";
import { Card, CardHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { LeadWithMore } from "@/components/ui/more-text";
import { PageHeader } from "@/components/ui/page-header";
import { StatusCounts } from "@/components/ui/status-counts";
import { ACT_LABEL } from "@/lib/labels";
import { myStepsOf, waitingForCount, WAITING_RULE_TEXT, type QueueItem } from "@/lib/approvals/queue";
import { ESCALATION_KIND_LABEL } from "@/lib/authority/escalation-labels";
import { dayToDate } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { REPORTING_LINE_NOT_SET } from "@/lib/people/reporting-lines";
import { BARRED_WORDS } from "@/lib/approvals/requester";
import { requireStaff } from "@/app/_auth/actor";
import { mayReadQueue } from "@/lib/auth/configuration-change";

import { ChangesQueue, queueCount } from "../configuration/changes/queue-panel";

import { MoveAwayButton } from "./move-away-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "My approvals" };

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
  // The settings-changes tab (NFR-SEC-004, FR-APR-020) is there only for those who may read the queue; its list is read only while the tab is open.
  const showQueue = mayReadQueue(actor.permissions);
  const queueTotal = showQueue ? await queueCount(actor) : 0;

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
      act: { kind: "text", text: ACT_LABEL[m.item.act] ?? "Unknown act" },
      waiting: waitingCell(m.item),
      why: {
        kind: "chips",
        items: [
          ...(m.barred ? [{ text: BARRED_WORDS[m.relation ?? "RAISED"], tone: "warn" as const }] : [{ text: "Waiting for you", tone: "brand" as const, nowrap: true }]),
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
      act: { kind: "text", text: ACT_LABEL[i.act] ?? "Unknown act" },
      waiting: waitingCell(i),
      why: {
        kind: "chips",
        items: [
          ...(i.escalation ? [{ text: ESCALATION_KIND_LABEL[i.escalation], tone: "warn" as const, nowrap: true }] : []),
          ...(i.noneAvailable ? [{ text: "Nobody able to act — escalate", tone: "err" as const, nowrap: true }] : []),
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
        divided={false}
      />
      {mineRows.length === 0 ? (
        <EmptyState title="Nothing is waiting for you." action={<ButtonLink href="/approvals?tab=office" size="sm" variant="secondary">See every open approval</ButtonLink>} />
      ) : (
        <DataList
          flat
          selectable={false}
          exportName="my-steps"
          searchPlaceholder="Search by request or office"
          emptyTitle="Nothing here"
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
        subtitle={<LeadWithMore lead="How waiting is counted" more={WAITING_RULE_TEXT} />}
        actions={<MoveAwayButton waiting={nobody} />}
        divided={false}
      />
      {rows.length === 0 ? (
        <EmptyState title="No approvals are open." action={<ButtonLink href="/requisitions" size="sm" variant="secondary">Go to requisitions</ButtonLink>} />
      ) : (
        <DataList
          flat
          selectable={false}
          exportName="my-approvals"
          searchPlaceholder="Search by request or office"
          emptyTitle="Nothing here"
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
        info={{
          title: "My approvals",
          text: "A step is yours when you hold its office or a delegation of it. Steps you raised are listed, not counted. Committees decide at the sitting. Told in your inbox.",
        }}
      />
      <StatusCounts
        label="Where approvals stand"
        className="mb-6"
        items={[
          { label: "For you", count: waiting, href: "/approvals?tab=mine", tone: "info", active: tab !== "office" && tab !== "changes" },
          { label: "Open", count: all.length, href: "/approvals?tab=office", active: tab === "office" },
          { label: "Escalated", count: escalated, href: "/approvals?tab=office", tone: "warn" },
          { label: "Need escalating", count: nobody, href: "/approvals?tab=office", tone: "err" },
        ]}
      />
      {w && !w.today && (
        <Callout tone="warn" className="mb-6" title="Time zone not set. Waiting days are not counted." />
      )}
      <Tabs
        initial={tab}
        label="Approvals"
        tabs={[
          { id: "mine", label: "My steps", count: waiting, panel: minePanel },
          { id: "office", label: "By office", count: all.length, panel: officePanel },
          ...(showQueue ? [{ id: "changes", label: "Settings changes", count: queueTotal, lazy: true, panel: tab === "changes" ? <ChangesQueue actor={actor} /> : null }] : []),
        ]}
      />
    </>
  );
}
