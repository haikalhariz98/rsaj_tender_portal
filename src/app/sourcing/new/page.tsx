import Link from "next/link";

import { RecordCrumb } from "@/components/shell/record-crumb";

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
import { formatMoney, parseSen, senToDecimalString } from "@/lib/money";
import { remainingOf } from "@/lib/method/value";
import type { ExerciseStatus } from "@/lib/method/types";

/// An amount as it is typed: "62000", or "62000.50" where there are sen (UX 14).
const plainAmount = (sen: bigint) => senToDecimalString(sen).replace(/\.00$/, "");

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
    <>
    <RecordCrumb label="New exercise" />
    <PageHeader
      eyebrow={<Link href="/sourcing">Sourcing</Link>}
      title="New sourcing exercise"
      subtitle="Classified here: its value bands, method, contract type and basis. The sourcing itself runs outside the portal in this phase."
    />
    </>
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
    // Open to an exercise, or not and why (UX 7): only the first list can be chosen.
    const judged = reqs.map((q) => {
      const approved = approvedRouteOf(q);
      const remaining = remainingOf(approved, q.exercises.map((x, i) => ({ id: String(i), value: parseSen(x.estimatedValue.toString()), status: x.status as ExerciseStatus })));
      const fault = openFault({ status: q.status, sourcingPermitted: q.sourcingPermitted, approvedRoute: !!approved, remaining }, { today: org.today, methodsConfigured: true });
      return { q, approved, remaining, fault };
    });
    const row = (x: (typeof judged)[number], link: boolean): Row => ({
      id: x.q.id,
      search: `${x.q.reference} ${x.q.title}`,
      cells: {
        title: link ? { kind: "link", text: x.q.title, href: `/sourcing/new?requisition=${x.q.id}`, sub: x.q.reference } : { kind: "stack", title: x.q.title, sub: x.q.reference },
        approved: { kind: "text", text: x.approved ? formatMoney(x.approved.value) : "No approved route" },
        open: link
          ? { kind: "text", text: x.remaining != null ? `${formatMoney(x.remaining)} left` : "—" }
          : { kind: "chip", text: x.fault?.code === "FULLY_IN_EXERCISES" ? "Fully in exercises" : x.fault?.code === "SOURCING_NOT_PERMITTED" ? "Not procured by the organisation" : "Not open to an exercise", tone: "warn" },
      },
    });
    const open = judged.filter((x) => !x.fault || x.fault.code === "TIME_ZONE_UNSET");
    const closed = judged.filter((x) => x.fault && x.fault.code !== "TIME_ZONE_UNSET");
    const columns = (third: string) => [
      { key: "title", label: "Requisition", mobile: "primary" as const },
      { key: "approved", label: "Approved value", width: "150px", mobile: "meta" as const },
      { key: "open", label: third, width: "240px", mobile: "meta" as const },
    ];
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
            emptyTitle="No requisition is open to an exercise"
            emptyBody="An exercise is opened against an approved requisition with value left to put in one."
            rowAction={{ label: "Open exercise", hrefTemplate: "/sourcing/new?requisition={id}" }}
            rowOpens
            columns={columns("Left to put in an exercise")}
            rows={open.map((x) => row(x, true))}
          />
        </Card>
        {closed.length > 0 && (
          <Card className="mt-6 overflow-hidden">
            <CardHeader title="Not open to an exercise" subtitle="Approved, but fully held by live exercises, or on a funding route under which the organisation does not procure." divided={false} />
            <DataList flat selectable={false} exportName="closed-requisitions" searchPlaceholder="Search by title or reference" emptyTitle="None" emptyBody="" columns={columns("Why")} rows={closed.map((x) => row(x, false))} />
          </Card>
        )}
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
  const remaining = remainingOf(approved, l.req.exercises.map((x) => ({ id: x.id, value: parseSen(x.estimatedValue.toString()), status: x.status as ExerciseStatus })));
  const fault = openFault({ status: l.req.status, sourcingPermitted: l.req.sourcingPermitted, approvedRoute: !!approved, remaining }, { today: org.today, methodsConfigured: options.methods.length > 0 });
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
            approved: approved && remaining != null ? `The requisition's approval covers ${formatMoney(approved.value)}; ${formatMoney(remaining)} is left to put in an exercise.` : "",
          }}
          options={options}
          initial={{ title: l.req.title, estimatedValue: remaining != null && remaining > 0n ? plainAmount(remaining) : "", contractTypeCode: "" }}
          cancelHref={`/requisitions/${l.req.id}?tab=sourcing`}
        />
      )}
    </>
  );
}
