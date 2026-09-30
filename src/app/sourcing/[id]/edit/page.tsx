import Link from "next/link";
import { notFound } from "next/navigation";

import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { dayToDate } from "@/lib/dates";
import { exerciseFormOptions } from "@/lib/method/form-options";
import { EXERCISE_STATUS_LABEL } from "@/lib/method/labels";
import { approvedRouteOf, loadExercise } from "@/lib/method/repo";
import { addSen, formatSen, parseSen, subtractSen } from "@/lib/money";

import { ExerciseForm } from "../../exercise-form";

export const dynamic = "force-dynamic";

export default async function EditExercisePage(props: PageProps<"/sourcing/[id]/edit">) {
  const { id } = await props.params;
  const l = await loadExercise(id);
  if (!l) notFound();
  const { ex, req, org } = l;
  const header = <PageHeader eyebrow={<Link href={`/sourcing/${ex.id}`}>{ex.reference}</Link>} title={`Edit ${ex.title}`} subtitle="A draft's value, method, scope, contract type and basis. The bands are judged again on save." />;
  if (ex.status !== "DRAFT") {
    return (
      <>
        {header}
        <Callout tone="info" title={`This exercise is ${EXERCISE_STATUS_LABEL[ex.status].toLowerCase()}`} action={<ButtonLink href={`/sourcing/${ex.id}`} size="sm">Back to the exercise</ButtonLink>}>
          Only a draft exercise can be edited.
        </Callout>
      </>
    );
  }
  const on = org.today ? dayToDate(org.today) : new Date();
  const options = await exerciseFormOptions(org.id, on, req.fundingPosture);
  const approved = approvedRouteOf(req);
  const others = addSen(...req.exercises.filter((x) => x.id !== ex.id && x.status !== "CANCELLED").map((x) => parseSen(x.estimatedValue.toString())));
  const s = (v: string | null | undefined) => v ?? "";
  return (
    <>
      {header}
      <ExerciseForm
        mode="edit"
        id={ex.id}
        requisition={{
          id: req.id,
          reference: req.reference,
          title: req.title,
          approved: approved ? `The requisition's approval covers ${formatSen(approved.value)}; its other live exercises hold ${formatSen(others)}, leaving ${formatSen(subtractSen(approved.value, others))}.` : "",
        }}
        options={options}
        initial={{
          title: ex.title,
          estimatedValue: ex.estimatedValue.toString(),
          sourcingMethodCode: ex.sourcingMethodCode,
          methodReason: ex.methodReason,
          externalRouteNote: ex.externalRouteNote,
          parentContractRef: s(ex.parentContractRef),
          contractTypeCode: ex.contractTypeState === "DERIVED" ? "" : s(ex.contractTypeCode),
          contractTypeOverrideReason: ex.contractTypeOverrideReason,
          overriddenByPersonId: s(ex.overriddenByPersonId),
          contractBasisCode: s(ex.contractBasisCode),
          justificationReasonCode: s(ex.justificationReasonCode),
          justificationText: ex.justificationText,
          evidenceNote: ex.evidenceNote,
          emergencyTrigger: ex.emergencyTrigger,
          coordinationMeetingOn: ex.coordinationMeetingOn ? ex.coordinationMeetingOn.toISOString().slice(0, 10) : "",
          coordinationAttendees: ex.coordinationAttendees,
          coordinationScopeNote: ex.coordinationScopeNote,
          bqReference: s(ex.bqReference),
        }}
        initialScope={ex.scopeParts.map((p) => ({ kind: p.deliverableKind, amount: p.amount.toString(), description: p.description }))}
        cancelHref={`/sourcing/${ex.id}`}
      />
    </>
  );
}
