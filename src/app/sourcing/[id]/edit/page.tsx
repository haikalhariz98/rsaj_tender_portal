import Link from "next/link";

import { RecordCrumb } from "@/components/shell/record-crumb";
import { notFound } from "next/navigation";

import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { dayToDate } from "@/lib/dates";
import { exerciseFormOptions } from "@/lib/method/form-options";
import { EXERCISE_STATUS_LABEL } from "@/lib/method/labels";
import { approvedRouteOf, loadExercise } from "@/lib/method/repo";
import { addSen, formatMoney, parseSen, subtractSen } from "@/lib/money";

import { ExerciseForm } from "../../exercise-form";
import { requireStaff } from "@/app/_auth/actor";
import { exerciseIsHidden, sulitExerciseValue, sulitGate } from "@/app/_auth/sulit";

export const dynamic = "force-dynamic";

export default async function EditExercisePage(props: PageProps<"/sourcing/[id]/edit">) {
  const actor = await requireStaff();
  const { id } = await props.params;
  // FR-MTD-007: an exercise restricted to its named people reads as one that does not exist to anyone else, and the attempt is logged.
  if (await exerciseIsHidden(actor, id)) notFound();
  const l = await loadExercise(actor.organisationId, id);
  if (!l) notFound();
  const { ex, req, org } = l;
  const header = (
    <>
      <RecordCrumb label={ex.reference} />
      <PageHeader eyebrow={<Link href={`/sourcing/${ex.id}`}>{ex.reference}</Link>} title={`Edit ${ex.title}`} subtitle="A draft's value, method, scope, contract type and basis; bands are judged again on save." />
    </>
  );
  if (ex.status !== "DRAFT") {
    return (
      <>
        {header}
        <Callout tone="warn" title={`This exercise is ${EXERCISE_STATUS_LABEL[ex.status].toLowerCase()}`} action={<ButtonLink href={`/sourcing/${ex.id}`} size="sm">Back to the exercise</ButtonLink>}>
          Only a draft exercise can be edited.
        </Callout>
      </>
    );
  }
  // The form carries the estimate, the scope's amounts and the requisition's headroom, all made of a SULIT figure: a reader who may not read the
  // estimate (ADR 0034 D14) is told so, and no form is built for them (Phase 3a). Reading is the least a change needs.
  const estimate = await sulitExerciseValue(actor, { id: ex.id, reference: ex.reference }, "estimatedValue", true);
  if (estimate.state === "WITHHELD") {
    return (
      <>
        {header}
        <Callout tone="warn" title="This exercise's value is SULIT and withheld from you" action={<ButtonLink href={`/sourcing/${ex.id}`} size="sm">Back to the exercise</ButtonLink>}>
          {estimate.words.en} The edit form shows the estimate and the amounts made from it, so it is not offered to someone who may not read them.
        </Callout>
      </>
    );
  }
  const on = org.today ? dayToDate(org.today) : new Date();
  const options = await exerciseFormOptions(org.id, on, req.fundingPosture);
  const approved = approvedRouteOf(req);
  // What the requisition's approval covers is the requisition's department estimate, judged by the requisition's own answer, not the exercise's (Phase 3b).
  const reqEstimate = await sulitGate(actor, { scope: "requisition", entity: "Requisition", id: req.id, label: req.reference }, ["estimatedValue"]);
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
          approved: reqEstimate.state === "WITHHELD" ? "What the requisition's approval covers, and what its other exercises leave, are made of the department estimate, which is closed to you." : approved ? `The requisition's approval covers ${formatMoney(approved.value)}; its other live exercises hold ${formatMoney(others)}, leaving ${formatMoney(subtractSen(approved.value, others))}.` : "",
        }}
        options={options}
        initial={{
          title: ex.title,
          estimatedValue: ex.estimatedValue.toString().replace(/\.0+$/, ""),
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
