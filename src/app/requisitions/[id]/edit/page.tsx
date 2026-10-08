import Link from "next/link";
import { notFound } from "next/navigation";

import { RecordCrumb } from "@/components/shell/record-crumb";
import { Callout } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { dayToDate, storedDay } from "@/lib/dates";
import { formOptions, loadRequisition } from "@/lib/requisition/repo";

import { RequisitionForm } from "../../requisition-form";
import { requireStaff } from "@/app/_auth/actor";
import { sulitGate } from "@/app/_auth/sulit";
import { fieldsOfScope } from "@/lib/sulit-fields";

export const dynamic = "force-dynamic";

/// The way back to draft from where it stands, naming only actions that exist there.
function backToDraft(status: string): string {
  switch (status) {
    case "ENDORSED":
    case "REGISTERED":
    case "BUDGET_CHECKED":
    case "OVER_BUDGET":
      return "To change them, return it as incomplete from the requisition, then reopen it as a draft.";
    case "RETURNED":
    case "RECALLED":
    case "REJECTED":
      return "To change them, reopen it as a draft from the requisition.";
    case "PENDING_APPROVAL":
      return "To change them, recall it from approval before anyone decides, then reopen it as a draft.";
    default:
      return "It can no longer be changed.";
  }
}

export default async function EditRequisitionPage(props: PageProps<"/requisitions/[id]/edit">) {
  const actor = await requireStaff();
  const { id } = await props.params;
  const l = await loadRequisition(actor.organisationId, id);
  if (!l) notFound();
  const r = l.req;
  // The form shows the department estimate, which is SULIT: whoever may not read it may not edit it (Phase 3b), and is told why.
  const estimate = await sulitGate(actor, { scope: "requisition", entity: "Requisition", id, label: r.reference }, fieldsOfScope("requisition"));
  const options = await formOptions(l.org.id, l.org.today ? dayToDate(l.org.today) : new Date());
  return (
    <>
      <RecordCrumb label={r.reference} />
      <PageHeader eyebrow={<Link href={`/requisitions/${id}`}>{r.reference}</Link>} title={`Edit ${r.title}`} subtitle="Only a draft can be edited." />
      {r.status !== "DRAFT" ? (
        <Callout tone="warn" title="This requisition is no longer a draft">
          Its fields are fixed once it is endorsed. {backToDraft(r.status)}
        </Callout>
      ) : estimate.state === "WITHHELD" ? (
        <Callout tone="warn" title="The department estimate is SULIT and is closed to you">
          Editing a requisition changes its estimate, so it is open only to those who may read it. {estimate.words.en}
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
