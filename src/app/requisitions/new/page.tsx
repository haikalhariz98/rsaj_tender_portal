import Link from "next/link";

import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { dayToDate } from "@/lib/dates";
import { formOptions, requisitionOrg } from "@/lib/requisition/repo";

import { RequisitionForm } from "../requisition-form";

export const dynamic = "force-dynamic";

export default async function NewRequisitionPage() {
  const org = await requisitionOrg();
  const options = org ? await formOptions(org.id, org.today ? dayToDate(org.today) : new Date()) : null;
  return (
    <>
      <PageHeader
        eyebrow={<Link href="/requisitions">Requisitions</Link>}
        title="New requisition"
        subtitle="Saved as a draft with its own reference; endorse, check and submit it from its record."
      />
      {!org || !options ? (
        <Card>
          <EmptyState title="No organisation is configured">Run the setup before raising a requisition.</EmptyState>
        </Card>
      ) : !org.today ? (
        <Callout
          tone="warn"
          title="The organisation's time zone is not set"
          action={
            <ButtonLink href="/configuration/organisation" size="sm">
              Set time zone
            </ButtonLink>
          }
        >
          A requisition is raised on the organisation&apos;s today, which is not assumed to be UTC. Set the zone first.
        </Callout>
      ) : (
        <RequisitionForm mode="new" options={options} cancelHref="/requisitions" />
      )}
    </>
  );
}
