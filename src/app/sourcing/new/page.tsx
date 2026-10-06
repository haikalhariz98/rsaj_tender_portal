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
import { gatesForRequisition } from "@/lib/requisition/repo";
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
import { requireStaff } from "@/app/_auth/actor";

export const dynamic = "force-dynamic";

/**
 * Open a sourcing exercise on an approved requisition (6.3, ruling R-6). Without a
 * requisition chosen, the approved ones that can take an exercise are listed.
 */
export default async function NewExercisePage(props: PageProps<"/sourcing/new">) {
  await requireStaff();
  const { requisition } = (await props.searchParams) as { requisition?: string };
  const org = await exerciseOrg();
  const header = (
    <>
    <RecordCrumb label="New exercise" />
    <PageHeader
      eyebrow={<Link href="/sourcing">Sourcing</Link>}
      title="New sourcing exercise"
      subtitle="Value band, method, contract type and basis; the rest follows on its record."
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
    // Whether an exercise can be opened on each (UX 7).
    const judged = await Promise.all(reqs.map(async (q) => {
      const approved = approvedRouteOf(q);
      const remaining = remainingOf(approved, q.exercises.map((x, i) => ({ id: String(i), value: parseSen(x.estimatedValue.toString()), status: x.status as ExerciseStatus })));
      const gate = (await gatesForRequisition(q.id))?.finding ?? { code: "GATES_NOT_DETERMINED" as const, why: "NOT_CHECKED" as const };
      const fault = openFault({ status: q.status, sourcingPermitted: q.sourcingPermitted, approvedRoute: !!approved, remaining }, { today: org.today, methodsConfigured: true, gate });
      return { q, approved, remaining, fault };
    }));
    // Founder, 2026-10-05: only the requisitions an exercise can be opened on are listed.
    const row = (x: (typeof judged)[number]): Row => ({
      id: x.q.id,
      search: `${x.q.reference} ${x.q.title}`,
      cells: {
        title: { kind: "link", text: x.q.title, href: `/sourcing/new?requisition=${x.q.id}`, sub: x.q.reference },
        approved: { kind: "text", text: x.approved ? formatMoney(x.approved.value) : "No approved route" },
        open: { kind: "text", text: x.remaining != null ? formatMoney(x.remaining) : "—" },
      },
    });
    const open = judged.filter((x) => !x.fault || x.fault.code === "TIME_ZONE_UNSET");
    const columns = (third: string) => [
      { key: "title", label: "Requisition", mobile: "primary" as const },
      { key: "approved", label: "Approved value", width: "150px", sulit: true, mobile: "meta" as const },
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
            emptyBody="An exercise is opened against an approved requisition with value still to source."
            rowAction={{ label: "Open exercise", hrefTemplate: "/sourcing/new?requisition={id}" }}
            rowOpens
            columns={columns("Still to source")}
            rows={open.map(row)}
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
  const remaining = remainingOf(approved, l.req.exercises.map((x) => ({ id: x.id, value: parseSen(x.estimatedValue.toString()), status: x.status as ExerciseStatus })));
  const gate = (await gatesForRequisition(l.req.id))?.finding ?? { code: "GATES_NOT_DETERMINED" as const, why: "NOT_CHECKED" as const };
  const fault = openFault({ status: l.req.status, sourcingPermitted: l.req.sourcingPermitted, approvedRoute: !!approved, remaining }, { today: org.today, methodsConfigured: options.methods.length > 0, gate });
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
            // Founder, 2026-10-05: said only where part of the requisition is already in another exercise.
            approved: approved && remaining != null && remaining < approved.value ? `${formatMoney(approved.value - remaining)} of this requisition is already in other exercises; ${formatMoney(remaining)} is still to source.` : "",
          }}
          options={options}
          initial={{ title: l.req.title, estimatedValue: remaining != null && remaining > 0n ? plainAmount(remaining) : "", contractTypeCode: "" }}
          cancelHref={`/requisitions/${l.req.id}?tab=sourcing`}
        />
      )}
    </>
  );
}
