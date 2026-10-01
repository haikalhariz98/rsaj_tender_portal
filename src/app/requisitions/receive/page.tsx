import Link from "next/link";

import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { dayToDate } from "@/lib/dates";
import { formOptions, requisitionOrg } from "@/lib/requisition/repo";

import { RequisitionForm } from "../requisition-form";

export const dynamic = "force-dynamic";

/// A requisition approved in the finance system, typed in by hand (INT-01, ADR 0003).
export default async function ReceiveRequisitionPage() {
  const org = await requisitionOrg();
  const options = org ? await formOptions(org.id, org.today ? dayToDate(org.today) : new Date()) : null;
  return (
    <>
      <PageHeader
        eyebrow={<Link href="/requisitions">Requisitions</Link>}
        title="Receive from finance system"
        subtitle="A requisition approved in the finance system, recorded here so later work can link to it."
      />
      {!org || !options ? (
        <Card>
          <EmptyState title="No organisation is configured">Run the setup before receiving a requisition.</EmptyState>
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
          A received requisition is dated on the organisation&apos;s today, which is not assumed to be UTC. Set the zone first.
        </Callout>
      ) : (
        <RequisitionForm mode="receive" options={options} cancelHref="/requisitions" />
      )}
    </>
  );
}
