import Link from "next/link";
import { notFound } from "next/navigation";

import { RecordCrumb } from "@/components/shell/record-crumb";
import { Callout } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { dayToDate, storedDay } from "@/lib/dates";
import { formOptions, loadRequisition } from "@/lib/requisition/repo";

import { RequisitionForm } from "../../requisition-form";

export const dynamic = "force-dynamic";

export default async function EditRequisitionPage(props: PageProps<"/requisitions/[id]/edit">) {
  const { id } = await props.params;
  const l = await loadRequisition(id);
  if (!l) notFound();
  const r = l.req;
  const options = await formOptions(l.org.id, l.org.today ? dayToDate(l.org.today) : new Date());
  return (
    <>
      <RecordCrumb label={r.reference} />
      <PageHeader eyebrow={<Link href={`/requisitions/${id}`}>{r.reference}</Link>} title={`Edit ${r.title}`} subtitle="Only a draft can be edited." />
      {r.status !== "DRAFT" ? (
        <Callout tone="warn" title="This requisition is no longer a draft">
          Its fields are fixed once it is endorsed. Return or reopen it to change them.
        </Callout>
      ) : (
        <>
          {r.endorsements.length > 0 && (
            <Callout tone="warn" className="mb-6" title="Saving withdraws the endorsements recorded">
              {r.endorsements.length === 1 ? "One endorsement was" : `${r.endorsements.length} endorsements were`} given to the draft as
              it stands. A change withdraws {r.endorsements.length === 1 ? "it" : "them"}, on the record, and the tiers endorse again.
            </Callout>
          )}
          <RequisitionForm
            mode="edit"
            id={id}
            options={options}
            cancelHref={`/requisitions/${id}`}
            values={{
              title: r.title,
              justification: r.justification,
              needStatement: r.needStatement,
              requestingUnitCode: r.requestingUnitCode,
              sectionUnitCode: r.sectionUnitCode ?? "",
              requestingPersonId: r.requestingPersonId,
              fundingRouteCode: r.fundingRouteCode ?? "",
              contractTypeCode: r.contractTypeCode ?? "",
              costCentreCode: r.costCentreCode,
              accountCode: r.accountCode,
              budgetCodeId: r.budgetCodeId ?? "",
              siteCode: r.siteCode ?? "",
              placeOfDelivery: r.placeOfDelivery,
              dateRequired: storedDay(r.dateRequired),
              estimatedValue: r.estimatedValue.toString(),
            }}
            initialLines={r.lines.map((x) => ({
                description: x.description,
                quantity: x.quantity?.toString() ?? "",
                unit: x.unit ?? "",
                estimatedUnitPrice: x.estimatedUnitPrice?.toString() ?? "",
                estimatedAmount: x.estimatedAmount.toString(),
              }))}
          />
        </>
      )}
    </>
  );
}
