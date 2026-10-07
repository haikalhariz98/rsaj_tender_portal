import { DataList, type Row } from "@/components/data-list";
import { RouteIcon } from "@/components/icons";
import { actLabel } from "@/components/ui/act";
import { Card, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { LeadWithMore } from "@/components/ui/more-text";
import { PageHeader } from "@/components/ui/page-header";
import { loadWorklist } from "@/lib/approvals/load";
import { WAITING_RULE_TEXT } from "@/lib/approvals/queue";
import { ESCALATION_KIND_LABEL } from "@/lib/authority/escalation-labels";
import { dayToDate } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { requireStaff } from "@/app/_auth/actor";

export const dynamic = "force-dynamic";

/**
 * My approvals (FR-APR-010, ruling CO-7): every open route's next step, under the
 * office acting for it — requisitions, approvals of the name and appointments. Not in
 * the prototype. Partly met: nobody signs in yet, so this is the office's list, shown
 * to everyone, and nobody is notified.
 */
export default async function ApprovalsPage() {
  const actor = await requireStaff();
  const w = await loadWorklist(actor);
  const all = w?.groups.flatMap((g) => g.items) ?? [];
  const rows: Row[] = all.map((i) => ({
    id: i.stepId,
    views: [...(i.escalation ? ["escalated"] : []), ...(i.noneAvailable ? ["nobody"] : [])],
    search: [i.matterLabel, i.matterKindLabel, i.officeLabel, i.escalatedFrom ?? ""].join(" "),
    sortKeys: { waiting: i.waitingDays ?? -1, office: i.officeLabel },
    cells: {
      matter: { kind: "link", text: i.matterLabel, href: i.href, sub: i.matterKindLabel },
      office: { kind: "stack", title: i.officeLabel, sub: i.escalatedFrom ? `escalated from ${i.escalatedFrom}` : i.committee ? "a committee's decision" : undefined },
      act: { kind: "text", text: actLabel(i.act) },
      waiting: { kind: "stack", title: i.waitingDays == null ? "Not counted" : i.waitingDays === 1 ? "1 day" : `${i.waitingDays} days`, sub: `since ${formatDate(dayToDate(i.waitingSince))}` },
      why: {
        kind: "chips",
        items: [
          ...(i.escalation ? [{ text: ESCALATION_KIND_LABEL[i.escalation], tone: "warn" as const, nowrap: true }] : []),
          ...(i.noneAvailable ? [{ text: "Nobody able to act — escalate", tone: "err" as const, nowrap: true }] : []),
          ...(!i.escalation && !i.noneAvailable ? [{ text: i.committee ? "With the committee" : "With the office", tone: "brand" as const }] : []),
        ],
      },
    },
  }));
  const escalated = all.filter((i) => i.escalation).length;
  const nobody = all.filter((i) => i.noneAvailable).length;

  return (
    <>
      <PageHeader
        title="My approvals"
        subtitle={
          <LeadWithMore
            lead="Every open approval's next step, grouped by the office that decides it."
            more="Until sign-in, this list is the same for everyone and nobody is notified when a step arrives. A step whose office has nobody able to act can be escalated from its record, with the reason; it never passes down."
          />
        }
        meta={[`${all.length} ${all.length === 1 ? "step" : "steps"} waiting`, `${w?.groups.length ?? 0} ${w?.groups.length === 1 ? "office" : "offices"}`, `${escalated} escalated`, `${nobody} with nobody able to act`]}
      />
      {w && !w.today && (
        <Callout tone="warn" className="mb-6" title="The organisation's time zone is not set">
          How long each step has waited is counted on the organisation&apos;s day, which is not assumed to be UTC. The days are not counted until the zone is set.
        </Callout>
      )}
      <Card className="overflow-hidden">
        <CardHeader icon={<RouteIcon size={17} />} title="By office" subtitle={<LeadWithMore lead="Grouped by the office acting for each step." more={`Filter by office, or narrow to what was escalated or has nobody able to act. ${WAITING_RULE_TEXT}`} />} divided={false} />
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
            columns={[
              { key: "matter", label: "Request", mobile: "primary" },
              { key: "office", label: "Waiting on", width: "160px", sortable: true, mobile: "meta" },
              { key: "act", label: "Action needed", width: "170px", hideBelow: "xl" },
              { key: "waiting", label: "Waiting for", width: "148px", sortable: true, mobile: "meta" },
              { key: "why", label: "Status", width: "250px", hideBelow: "md", mobile: "meta" },
            ]}
            rows={rows}
          />
        )}
      </Card>
    </>
  );
}
