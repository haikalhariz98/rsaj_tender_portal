import { ClipboardIcon, PlusIcon } from "@/components/icons";
import { DataList } from "@/components/data-list";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { StatusCounts } from "@/components/ui/status-counts";
import { listRequisitions, REQUISITION_VIEWS, type RequisitionView } from "@/lib/requisition/repo";
import { requireStaff } from "@/app/_auth/actor";
import { LIST_EXPORT_MAX_ROWS, listHref, parseListQuery, sortKeys } from "@/lib/list-query";
import { serverMode } from "@/components/server-list";

import { buildRequisitionRows } from "./rows";

export const metadata = { title: "Requisitions" };
export const dynamic = "force-dynamic";

/**
 * Requisitions raised in the portal. Receiving one typed in from the finance system was removed
 * (founder, 2026-10-04: not used); records received before then still show as received.
 *
 * Not in the prototype, whose requisition screen is reachable from no route. Under
 * Work rather than Sourcing: a supervision-only requisition never becomes sourcing.
 */
export default async function RequisitionsPage(props: PageProps<"/requisitions">) {
  const actor = await requireStaff();
  const q = parseListQuery((await props.searchParams) as Record<string, string | string[] | undefined>, REQUISITION_VIEWS, sortKeys("requisition"));
  const { org, rows, total, page, counts } = await listRequisitions(actor.organisationId, q);
  const list = await buildRequisitionRows(actor, rows, { forExport: false });
  const view = (v: RequisitionView | null) => listHref("/requisitions", { q: q.q, view: v, sort: q.sort, dir: q.dir, size: q.size });
  const over = total > LIST_EXPORT_MAX_ROWS;

  return (
    <>
      <PageHeader
        title="Requisitions"
        info={{ title: "Requisitions", text: "Requests to spend, checked and routed for approval. Search by reference or finance-system number." }}
        className="mb-4"
        actions={
          org ? (
            <ButtonLink href="/requisitions/new" variant="primary" size="md" icon={<PlusIcon size={16} />}>
              New requisition
            </ButtonLink>
          ) : undefined
        }
      />

      <StatusCounts
        label="Where requisitions stand"
        className="mb-6"
        items={[
          { label: "Open", count: counts.open, href: view(null), active: !q.view },
          { label: "Pending approval", count: counts.pending, href: view("pending"), tone: "info", active: q.view === "pending" },
          { label: "Drafts", count: counts.drafts, href: view("drafts"), active: q.view === "drafts" },
          { label: "Over budget", count: counts.overBudget, href: view("over"), tone: "warn", active: q.view === "over" },
        ]}
      />

      {org && !org.timeZone && (
        <Callout
          tone="warn"
          className="mb-6"
          title="Time zone not set. Requisitions cannot be recorded."
          action={
            <ButtonLink href="/configuration/organisation" size="sm">
              Set time zone
            </ButtonLink>
          }
        />
      )}

      <Card className="overflow-hidden">
        <CardHeader
          icon={<ClipboardIcon size={17} />}
          title="All requisitions"
          divided={false}
        />
        <DataList
          flat
          selectable={false}
          exportName="requisitions"
          searchPlaceholder="Search by title or number"
          emptyTitle="No requisitions yet"
          rowAction={{ label: "Open", hrefTemplate: "/requisitions/{id}" }}
          rowOpens
          columns={[
            { key: "title", label: "Requisition", mobile: "primary" },
            { key: "funding", label: "Funding", width: "16%", hideBelow: "2xl" },
            { key: "value", label: "Value", width: "120px", numeric: true, sulit: true, mobile: "meta" },
            { key: "status", label: "Status", width: "208px", mobile: "meta" },
            { key: "requester", label: "Requester and department", width: "20%", hideBelow: "md", mobile: "meta" },
            { key: "required", label: "Required by", width: "112px", hideBelow: "2xl", mobile: "meta" },
          ]}
          rows={list}
          server={serverMode("/requisitions", q, { total, page, sortColumns: { title: "title" }, exportBlocked: over ? "This view cannot be exported" : undefined })}
        />
      </Card>
    </>
  );
}
