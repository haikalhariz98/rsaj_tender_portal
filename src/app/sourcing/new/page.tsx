import Link from "next/link";

import { DataList, type Row } from "@/components/data-list";
import { ClipboardIcon } from "@/components/icons";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { dayToDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { openFault } from "@/lib/method/exercise";
import { exerciseFormOptions } from "@/lib/method/form-options";
import { findingText } from "@/lib/method/labels";
import { approvedRouteOf, exerciseOrg, loadRequisitionForSourcing } from "@/lib/method/repo";
import { addSen, formatSen, parseSen, senToDecimalString, subtractSen } from "@/lib/money";

import { ExerciseForm } from "../exercise-form";

export const dynamic = "force-dynamic";

/**
 * Open a sourcing exercise on an approved requisition (6.3, ruling R-6). Without a
 * requisition chosen, the approved ones that can take an exercise are listed.
 */
export default async function NewExercisePage(props: PageProps<"/sourcing/new">) {
  const { requisition } = (await props.searchParams) as { requisition?: string };
  const org = await exerciseOrg();
  const header = (
    <PageHeader
      eyebrow={<Link href="/sourcing">Sourcing</Link>}
      title="New sourcing exercise"
      subtitle="Classified here: its value bands, method, contract type and basis. The sourcing itself runs outside the portal in this phase."
    />
  );
  if (!org) {
    return (
      <>
        {header}
        <Card>
          <EmptyState title="No organisation is configured">Run the setup first.</EmptyState>
        </Card>
      </>
    );
  }

  if (!requisition) {
    const reqs = await db.requisition.findMany({
      where: { organisationId: org.id, status: { in: ["APPROVED", "SOURCING"] } },
      orderBy: { reference: "desc" },
      include: { approvalInstances: { select: { status: true, value: true, ruleKey: true, ruleLabel: true, checkedAgainstMatrix: true } }, exercises: { select: { estimatedValue: true, status: true } } },
    });
    const rows: Row[] = reqs.map((q) => {
      const approved = approvedRouteOf(q);
      const used = addSen(...q.exercises.filter((x) => x.status !== "CANCELLED").map((x) => parseSen(x.estimatedValue.toString())));
      return {
        id: q.id,
        search: `${q.reference} ${q.title}`,
        cells: {
          title: { kind: "link", text: q.title, href: `/sourcing/new?requisition=${q.id}`, sub: q.reference },
          approved: { kind: "text", text: approved ? formatSen(approved.value) : "No approved route" },
          open: { kind: "text", text: approved ? `${formatSen(subtractSen(approved.value, used))} not yet in an exercise` : "—" },
          sourcing: { kind: "chip", text: q.sourcingPermitted === false ? "The organisation does not procure" : "Sourcing permitted", tone: q.sourcingPermitted === false ? "warn" : "ok" },
        },
      };
    });
    return (
      <>
        {header}
        <Card className="overflow-hidden">
          <CardHeader icon={<ClipboardIcon size={17} />} title="Approved requisitions" subtitle="Choose the requisition the exercise is opened against." divided={false} />
          <DataList
            flat
            selectable={false}
            exportName="approved-requisitions"
            searchPlaceholder="Search by title or reference"
            emptyTitle="No approved requisitions"
            emptyBody="An exercise is opened against an approved requisition. Approve one first."
            rowAction={{ label: "Open exercise", hrefTemplate: "/sourcing/new?requisition={id}" }}
            rowOpens
            columns={[
              { key: "title", label: "Requisition", mobile: "primary" },
              { key: "approved", label: "Approved value", width: "150px", mobile: "meta" },
              { key: "open", label: "Not yet in an exercise", width: "220px", hideBelow: "lg", mobile: "meta" },
              { key: "sourcing", label: "Funding route", width: "230px", hideBelow: "md", mobile: "meta" },
            ]}
            rows={rows}
          />
        </Card>
      </>
    );
  }

  const l = await loadRequisitionForSourcing(requisition);
  if (!l) {
    return (
      <>
        {header}
        <Card>
          <EmptyState title="That requisition does not exist" action={<ButtonLink href="/sourcing/new">Choose another</ButtonLink>} />
        </Card>
      </>
    );
  }
  const on = org.today ? dayToDate(org.today) : new Date();
  const options = await exerciseFormOptions(org.id, on, l.req.fundingPosture);
  const approved = approvedRouteOf(l.req);
  const fault = openFault({ status: l.req.status, sourcingPermitted: l.req.sourcingPermitted, approvedRoute: !!approved }, { today: org.today, methodsConfigured: options.methods.length > 0 });
  const used = addSen(...l.req.exercises.filter((x) => x.status !== "CANCELLED").map((x) => parseSen(x.estimatedValue.toString())));
  return (
    <>
      {header}
      {fault ? (
        <Callout
          tone="warn"
          title="No exercise can be opened on this requisition"
          action={
            fault.code === "TIME_ZONE_UNSET" ? (
              <ButtonLink href="/configuration/organisation" size="sm">Set time zone</ButtonLink>
            ) : fault.code === "METHODS_NOT_SET" ? (
              <ButtonLink href="/configuration/reference-data" size="sm">Add sourcing methods</ButtonLink>
            ) : (
              <ButtonLink href={`/requisitions/${l.req.id}`} size="sm">Open the requisition</ButtonLink>
            )
          }
        >
          {findingText(fault)}
        </Callout>
      ) : (
        <ExerciseForm
          mode="new"
          requisition={{
            id: l.req.id,
            reference: l.req.reference,
            title: l.req.title,
            approved: approved ? `The requisition's approval covers ${formatSen(approved.value)}; ${formatSen(subtractSen(approved.value, used))} is not yet in an exercise.` : "",
          }}
          options={options}
          initial={{ title: l.req.title, estimatedValue: approved && subtractSen(approved.value, used) > 0n ? senToDecimalString(subtractSen(approved.value, used)) : "", contractTypeCode: "" }}
          cancelHref={`/requisitions/${l.req.id}?tab=sourcing`}
        />
      )}
    </>
  );
}
