import { ClipboardIcon, PlusIcon } from "@/components/icons";
import { DataList, type Row } from "@/components/data-list";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardFooter, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { formatDate } from "@/lib/format";
import { STATUS_LABEL, STATUS_ORDER, STATUS_TONE } from "@/lib/requisition/labels";
import { listRequisitions, REQUISITIONS_PAGE } from "@/lib/requisition/repo";
import { SENT_BACK_LABEL } from "@/lib/requisition/sent-back";

export const dynamic = "force-dynamic";

const TONE = { neutral: undefined, brand: "brand", ok: "ok", warn: "warn", err: "err", info: "info" } as const;

/**
 * Requisitions raised in the portal. Receiving one typed in from the finance system was removed
 * (founder, 2026-10-04: not used); records received before then still show as received.
 *
 * Not in the prototype, whose requisition screen is reachable from no route. Under
 * Work rather than Sourcing: a supervision-only requisition never becomes sourcing.
 */
export default async function RequisitionsPage() {
  const { org, rows, total, counts } = await listRequisitions();

  const list: Row[] = rows.map((r) => {
    const erp = r.erpRequisitionNo ?? null;
    const statusText = r.sentBack ? SENT_BACK_LABEL : STATUS_LABEL[r.status];
    const statusTone = r.sentBack ? "warn" : STATUS_TONE[r.status];
    return {
      id: r.id,
      views: [
        ...(r.status === "PENDING_APPROVAL" ? ["pending"] : []),
        ...(r.status === "DRAFT" || r.status === "RETURNED" || r.status === "RECALLED" ? ["drafts"] : []),
        ...(r.status === "OVER_BUDGET" ? ["over"] : []),
      ],
      // A finance-system number finds the requisition, as its own reference does.
      search: [r.title, r.reference, r.erpRequisitionNo, r.erpNoteNo, r.requesterName, r.unitName, r.routeName, statusText].filter(Boolean).join(" "),
      sortKeys: { value: r.estimatedValue, required: r.dateRequired.getTime(), title: r.title },
      cells: {
        title: { kind: "link", text: r.title, href: `/requisitions/${r.id}`, sub: erp ? `${erp} · ${r.reference}` : r.reference },
        funding: { kind: "text", text: r.routeName ?? "Funding route not set" },
        value: { kind: "money", value: r.estimatedValue },
        status: { kind: "badge", text: statusText, tone: TONE[statusTone] },
        // Founder, 2026-10-04: who asked, and for which department, in place of the checks
        // column. The budget and splitting checks stay on the requisition's own Checks tab.
        requester: { kind: "stack", title: r.requesterName, sub: r.unitName },
        required: { kind: "text", text: formatDate(r.dateRequired) },
      },
    };
  });

  return (
    <>
      <PageHeader
        title="Requisitions"
        subtitle="Requests to spend, raised here, checked and routed for approval."
        meta={[
          `${counts.open} open`,
          `${counts.pending} pending approval`,
          `${counts.overBudget} over budget`,
          `${counts.flagged} possible ${counts.flagged === 1 ? "split" : "splits"} awaiting justification`,
        ]}
        actions={
          org ? (
            <ButtonLink href="/requisitions/new" variant="primary" size="md" icon={<PlusIcon size={16} />}>
              New requisition
            </ButtonLink>
          ) : undefined
        }
      />

      {org && !org.timeZone && (
        <Callout
          tone="warn"
          className="mb-6"
          title="The organisation's time zone is not set"
          action={
            <ButtonLink href="/configuration/organisation" size="sm">
              Set time zone
            </ButtonLink>
          }
        >
          Raising, endorsing, submitting and deciding a requisition all depend on today&apos;s date, which is not assumed
          to be UTC. Until the zone is set, none of them can be recorded.
        </Callout>
      )}

      <Card className="overflow-hidden">
        <CardHeader
          icon={<ClipboardIcon size={17} />}
          title="All requisitions"
          subtitle="Newest first. Search finds a requisition by its reference or its finance-system numbers."
          divided={false}
        />
        <DataList
          flat
          selectable={false}
          exportName="requisitions"
          searchPlaceholder="Search by title or number"
          emptyTitle="No requisitions yet"
          emptyBody="Raise a requisition to start."
          views={[
            { id: "pending", label: "Pending approval" },
            { id: "drafts", label: "Drafts" },
            { id: "over", label: "Over budget" },
          ]}
          filters={[{ key: "status", label: "Status", order: [SENT_BACK_LABEL, ...STATUS_ORDER.map((s) => STATUS_LABEL[s])] }]}
          rowAction={{ label: "Open", hrefTemplate: "/requisitions/{id}" }}
          rowOpens
          columns={[
            { key: "title", label: "Requisition", sortable: true, mobile: "primary" },
            { key: "funding", label: "Funding", width: "16%", hideBelow: "2xl" },
            { key: "value", label: "Value", width: "120px", numeric: true, sortable: true, sulit: true, mobile: "meta" },
            { key: "status", label: "Status", width: "208px", sortable: true, mobile: "meta" },
            { key: "requester", label: "Requester and department", width: "20%", hideBelow: "md", mobile: "meta" },
            { key: "required", label: "Required by", width: "112px", sortable: true, hideBelow: "2xl", mobile: "meta" },
          ]}
          rows={list}
        />
        {total > rows.length && (
          <CardFooter className="text-[12.5px] text-ink-3">
            Showing the latest {REQUISITIONS_PAGE} of {total}.
          </CardFooter>
        )}
      </Card>
    </>
  );
}
