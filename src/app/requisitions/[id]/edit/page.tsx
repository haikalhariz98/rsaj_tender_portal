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

export const metadata = { title: "Edit requisition" };
export const dynamic = "force-dynamic";

/// The way back to draft from where it stands, naming only actions that exist there.
function backToDraft(status: string): string {
  switch (status) {
    case "ENDORSED":
    case "REGISTERED":
    case "BUDGET_CHECKED":
    case "OVER_BUDGET":
      return "Return it as incomplete, then reopen as a draft.";
    case "RETURNED":
    case "RECALLED":
    case "REJECTED":
      return "Reopen it as a draft.";
    case "PENDING_APPROVAL":
      return "Recall it before anyone decides, then reopen as a draft.";
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
      <PageHeader title={`Edit ${r.title}`} />
      {r.status !== "DRAFT" ? (
        <Callout tone="warn" title="Fields are fixed once endorsed.">
          {backToDraft(r.status)}
        </Callout>
      ) : estimate.state === "WITHHELD" ? (
        <Callout tone="warn" title="Estimate is SULIT and closed to you">
          {estimate.words.en}
        </Callout>
      ) : (
        <>
          {r.endorsements.length > 0 && (
            <Callout tone="warn" className="mb-6" title={`Saving withdraws ${r.endorsements.length === 1 ? "the endorsement" : `${r.endorsements.length} endorsements`}. Tiers endorse again.`} />
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
