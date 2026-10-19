import Link from "next/link";

import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { dayToDate } from "@/lib/dates";
import { formOptions, requisitionOrg } from "@/lib/requisition/repo";

import { RequisitionForm } from "../requisition-form";
import { requireStaff } from "@/app/_auth/actor";

export const dynamic = "force-dynamic";

export default async function NewRequisitionPage() {
  const actor = await requireStaff();
  const org = await requisitionOrg(actor.organisationId);
  const options = org ? await formOptions(org.id, org.today ? dayToDate(org.today) : new Date()) : null;
  return (
    <>
      <PageHeader
        eyebrow={<Link href="/requisitions">Requisitions</Link>}
        title="New requisition"
      />
      {!org || !options ? (
        <Card>
          <EmptyState title="No organisation set up" />
        </Card>
      ) : !org.today ? (
        <Callout
          tone="warn"
          title="Time zone not set. Set it to raise a requisition."
          action={
            <ButtonLink href="/configuration/organisation" size="sm">
              Set time zone
            </ButtonLink>
          }
        />
      ) : (
        <RequisitionForm mode="new" options={options} cancelHref="/requisitions" />
      )}
    </>
  );
}
