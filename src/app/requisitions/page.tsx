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
import { ListFacets } from "@/components/list-facets";
import { db } from "@/lib/db";
import { codeFacet, facetChoices, rangeFacet, stageFacet } from "@/lib/list-facets";

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
  const view = (v: RequisitionView | null) => listHref("/requisitions", { ...q, view: v, page: 0 });
  const over = total > LIST_EXPORT_MAX_ROWS;
  // I-6: the dashboard's filters, as dropdowns; the day range shows only while the address carries one.
  const choices = await facetChoices(db, actor.organisationId);
  const facets = [
    codeFacet("/requisitions", q, "unit", "Department", "Any department", choices.units, "A unit no longer configured"),
    codeFacet("/requisitions", q, "route", "Funding route", "Any route", choices.routes, "A route no longer configured"),
    ...(choices.sources.length > 0 || q.source ? [codeFacet("/requisitions", q, "source", "Funding source", "Any source", choices.sources, "A source no longer configured")] : []),
    ...(q.stage === "awaiting" ? [stageFacet("/requisitions", q, "Stage", "Any stage", [{ value: "awaiting", label: "Awaiting award" }])] : []),
    rangeFacet("/requisitions", q, q.stage === "approved" ? "Raised and approved" : "Raised"),
  ].flatMap((f) => (f ? [f] : []));

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
          { label: "All", count: counts.all, href: view(null), active: !q.view },
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
          toolbarFilters={<ListFacets facets={facets} />}
          rows={list}
          server={serverMode("/requisitions", q, { total, page, sortColumns: { title: "title" }, exportHref: over ? undefined : listHref("/requisitions/export", { ...q, page: 0, size: undefined }), exportBlocked: over ? "This view cannot be exported" : undefined })}
        />
      </Card>
    </>
  );
}
