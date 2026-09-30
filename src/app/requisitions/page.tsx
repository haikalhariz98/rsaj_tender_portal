import { ClipboardIcon } from "@/components/icons";
import { DataList, type Row } from "@/components/data-list";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardFooter, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { formatDate } from "@/lib/format";
import { STATUS_LABEL, STATUS_TONE, VERDICT_LABEL, VERDICT_TONE } from "@/lib/requisition/labels";
import { listRequisitions, REQUISITIONS_PAGE } from "@/lib/requisition/repo";
import { splitStateLabel } from "@/lib/requisition/splitting";

export const dynamic = "force-dynamic";

const TONE = { neutral: undefined, brand: "brand", ok: "ok", warn: "warn", err: "err", info: "info" } as const;

/**
 * Requisitions: raised here, or received by hand from the finance system (ADR 0003).
 *
 * Not in the prototype, whose requisition screen is reachable from no route. Under
 * Work rather than Sourcing: a supervision-only requisition never becomes sourcing.
 */
export default async function RequisitionsPage() {
  const { org, rows, total, counts } = await listRequisitions();

  const list: Row[] = rows.map((r) => {
    const split = r.split ? splitStateLabel(r.split.state, !!r.split.overrideJustification) : { label: "Not assessed", tone: "neutral" as const };
    const erp = r.erpRequisitionNo ?? null;
    return {
      id: r.id,
      views: [
        ...(r.status === "PENDING_APPROVAL" ? ["pending"] : []),
        ...(r.status === "DRAFT" || r.status === "RETURNED" || r.status === "RECALLED" ? ["drafts"] : []),
        ...(r.status === "OVER_BUDGET" ? ["over"] : []),
      ],
      // A finance-system number finds the requisition, as its own reference does.
      search: [r.title, r.reference, r.erpRequisitionNo, r.erpNoteNo, r.unitName, r.routeName, STATUS_LABEL[r.status]].filter(Boolean).join(" "),
      sortKeys: { value: r.value, required: r.dateRequired.getTime(), title: r.title },
      cells: {
        title: { kind: "link", text: r.title, href: `/requisitions/${r.id}`, sub: erp ? `${erp} · ${r.reference}` : r.reference },
        department: { kind: "text", text: r.unitName },
        funding: r.routeName ? { kind: "text", text: r.routeName } : { kind: "text", text: "Not set", dim: true },
        value: { kind: "money", value: r.value },
        status: { kind: "badge", text: STATUS_LABEL[r.status], tone: TONE[STATUS_TONE[r.status]] },
        budget: r.verdict ? { kind: "chip", text: VERDICT_LABEL[r.verdict], tone: TONE[VERDICT_TONE[r.verdict]] } : { kind: "text", text: "Not checked", dim: true },
        split: { kind: "chip", text: split.label, tone: TONE[split.tone] },
        required: { kind: "text", text: formatDate(r.dateRequired) },
      },
    };
  });

  return (
    <>
      <PageHeader
        title="Requisitions"
        subtitle="Requests to spend: raised and endorsed here, or received from the finance system, checked against the budget and routed for approval."
        meta={[
          `${counts.open} open`,
          `${counts.pending} pending approval`,
          `${counts.overBudget} over budget`,
          `${counts.flagged} flagged as a possible split`,
        ]}
        actions={
          org ? (
            <>
              <ButtonLink href="/requisitions/receive" variant="secondary" size="md">
                Receive from finance system
              </ButtonLink>
              <ButtonLink href="/requisitions/new" variant="primary" size="md">
                New requisition
              </ButtonLink>
            </>
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
          emptyBody="Raise a requisition, or receive one approved in the finance system."
          views={[
            { id: "pending", label: "Pending approval" },
            { id: "drafts", label: "Drafts" },
            { id: "over", label: "Over budget" },
          ]}
          filters={[
            { key: "status", label: "Status" },
            { key: "department", label: "Department" },
          ]}
          rowAction={{ label: "Open", hrefTemplate: "/requisitions/{id}" }}
          rowOpens
          columns={[
            { key: "title", label: "Requisition", sortable: true },
            { key: "department", label: "Department", width: "13%", hideBelow: "lg" },
            { key: "funding", label: "Funding", width: "12%", hideBelow: "xl" },
            { key: "value", label: "Value", width: "120px", numeric: true, sortable: true },
            { key: "status", label: "Status", width: "140px", sortable: true },
            { key: "budget", label: "Budget", width: "130px", hideBelow: "md" },
            { key: "split", label: "Splitting", width: "170px", hideBelow: "lg" },
            { key: "required", label: "Required by", width: "112px", sortable: true, hideBelow: "xl" },
          ]}
          rows={list}
        />
        {total > rows.length && (
          <CardFooter className="text-[12.5px] text-ink-3">
            Showing the latest {REQUISITIONS_PAGE} of {total}. Search finds any of them by number.
          </CardFooter>
        )}
      </Card>
    </>
  );
}
