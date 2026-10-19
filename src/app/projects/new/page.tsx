import { exerciseIsHidden, sulitExerciseGate, sulitGate } from "@/app/_auth/sulit";
import { RECOMMENDATION_FIELDS } from "@/lib/evaluation/recommendation-fields";
import Link from "next/link";

import { RecordCrumb } from "@/components/shell/record-crumb";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { awardOpenRefusal, evaluationFindings, exerciseOpenForAward } from "@/lib/award/gate";
import { loadEvaluationGate } from "@/lib/evaluation/gate-read";
import { readWindowGate } from "@/lib/window/repo";
import { openingGateFaults } from "@/lib/opening/award-gate";
import { loadOpeningGate } from "@/lib/opening/gate-read";
import { openingFindingText } from "@/lib/opening/labels";
import { INSTRUMENT_LABEL, awardFindingText } from "@/lib/award/labels";
import { awardHeadroom, instrumentFor } from "@/lib/award/instrument";
import { frozenTenderOf, loadAwardPolicy } from "@/lib/award/repo";
import { LIVE_STATUSES } from "@/lib/award/status";
import { db } from "@/lib/db";
import { exerciseEvidence } from "@/lib/documents/evidence";
import { attachmentFacts } from "@/lib/documents/repo";
import { dossierEvidenceMissing } from "@/lib/method/justification";
import { REGIME_LABEL } from "@/lib/method/labels";
import { approvedRouteOf, loadExercise, loadMethodConfig } from "@/lib/method/repo";
import { isBandSnapshot } from "@/lib/method/snapshot";
import type { Regime } from "@/lib/method/types";
import { formatMoney, parseSen, senFromDecimal, senToDecimalString } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { caseHref } from "@/lib/contract/links";
import { partyRegister } from "@/lib/suppliers/standing-repo";

import { AwardForm } from "./award-form";
import { requireStaff } from "@/app/_auth/actor";

export const dynamic = "force-dynamic";

/// Open an award on an exercise in preparation (6.11), from the exercise's Award tab.
export default async function NewAwardPage(props: PageProps<"/projects/new">) {
  const actor = await requireStaff();
  const { exercise } = (await props.searchParams) as { exercise?: string };
  // FR-MTD-007: an exercise restricted to its named people reads as one that does not exist to anyone else.
  const l = exercise && !(await exerciseIsHidden(actor, exercise)) ? await loadExercise(actor.organisationId, exercise) : null;
  const header = (
    <>
      <RecordCrumb label="New award" />
      <PageHeader eyebrow={<Link href="/projects">Contracts</Link>} title="New award" subtitle="Opened on an exercise in preparation; the exercise's band decides the instrument." />
    </>
  );
  if (!l) {
    return (
      <>
        {header}
        <Card>
          <EmptyState title="Start from the exercise" action={<ButtonLink href="/sourcing" size="sm">Open Sourcing</ButtonLink>}>
            An award is opened from an exercise&apos;s Award tab, once the exercise is in preparation.
          </EmptyState>
        </Card>
      </>
    );
  }
  const { ex, org } = l;
  const [policy, cfg, live, siblings, tender] = await Promise.all([
    loadAwardPolicy(org.id),
    loadMethodConfig(org.id),
    db.award.findFirst({ where: { exerciseId: ex.id, status: { in: [...LIVE_STATUSES] } }, select: { id: true, reference: true } }),
    db.award.findMany({ where: { exercise: { requisitionId: l.req.id }, status: { in: [...LIVE_STATUSES] } }, select: { awardedValue: true } }),
    frozenTenderOf(ex.id, org.timeZone),
  ]);
  // What the requisition's approval covers is the requisition's department estimate, judged by the requisition's own answer (Phase 3b).
  const reqEstimate = await sulitGate(actor, { scope: "requisition", entity: "Requisition", id: l.req.id, label: l.req.reference }, ["estimatedValue"]);
  const headroom = awardHeadroom(approvedRouteOf(l.req)?.value ?? null, siblings.map((s) => senFromDecimal(s.awardedValue)));
  const method = cfg.config.methods.find((m) => m.code === ex.sourcingMethodCode) ?? null;
  // The dossier's evidence as the document store counts it: the note shows only while there is none.
  const dossierEvidence = method?.requiresDossier ? exerciseEvidence(await attachmentFacts({ kind: "exercise", id: ex.id }, undefined, ["DOSSIER_EVIDENCE"])).dossier : 0;
  const instrument = instrumentFor(ex.regime, policy);
  // X-9 (6.5): the window's phase and any pending change, read now.
  const gate = await readWindowGate(ex, org.timeZone);
  // 6.7 (C-7, C-8): the openings' checks; the awardee is chosen from the bidders carried to evaluation.
  const opening = await loadOpeningGate(ex.id);
  const openingBlock = openingGateFaults(opening);
  // 6.8 (E-9, flagged): Evaluated, its report standing; the award is pre-filled from the recommendation.
  const evaluation = await loadEvaluationGate(ex.id);
  const evaluationBlock = evaluation.gate.applies ? evaluationFindings({ facts: evaluation.gate }) : [];
  const blocker = !exerciseOpenForAward(ex.status, ex.packKindSnapshot, gate) ? awardOpenRefusal(ex.packKindSnapshot, ex.status, gate) : openingBlock.length ? openingBlock.map(openingFindingText).join(" ") : evaluationBlock.length ? evaluationBlock.map(awardFindingText).join(" ") : live ? `This exercise already has a live award, ${live.reference}.` : "fault" in instrument ? awardFindingText({ code: instrument.fault, level: "block", data: { regime: instrument.regime } }) : null;
  if (blocker) {
    return (
      <>
        {header}
        <Card>
          <EmptyState
            title="No award can be opened here"
            action={
              live ? (
                <ButtonLink href={caseHref({ awardId: live.id, contractId: null })} size="sm">Open the award</ButtonLink>
              ) : (
                <span className="flex flex-wrap justify-center gap-2">
                  <ButtonLink href={`/sourcing/${ex.id}?tab=award`} size="sm">Back to the exercise</ButtonLink>
                  {"fault" in instrument && instrument.fault === "INSTRUMENT_NOT_SET" && <ButtonLink href="/configuration/awards" size="sm" variant="ghost">Award controls</ButtonLink>}
                </span>
              )
            }
          >
            {blocker}
          </EmptyState>
        </Card>
      </>
    );
  }
  // 6.15a fix S-3: each bidder's linked supplier and its standing today; a barred one is warned of, not refused.
  // Who is recommended, and at what price, is SULIT (FR-EVL-014): offered, pre-filled and used to narrow the choice only for a reader the evaluation is open to. For one it is closed to
  // every bidder carried to evaluation is offered, nothing is pre-filled, and the act that opens the award refuses them (Phase 3b).
  const recommendation = await sulitExerciseGate(actor, ex.id, "evaluation", RECOMMENDATION_FIELDS);
  const recommended = recommendation.state === "GRANTED" ? evaluation.recommended : null;
  const carried = opening.applies ? (recommended ? opening.carried.filter((p) => p.id === recommended.party.id) : opening.carried) : null;
  const register = carried ? await partyRegister(carried.map((p) => p.id), org, formatDate) : new Map();
  const bands = isBandSnapshot(ex.bandSnapshot) ? ex.bandSnapshot : null;
  // The exercise's estimate is SULIT: read by the people named on the exercise and the roles the organisation has chosen, and withheld from the rest with the reason (logged).
  const estimate = await sulitExerciseGate(actor, ex.id, "exercise", ["estimatedValue"]);
  const facts = [
    { label: "Exercise", value: `${ex.reference} · ${ex.title}` },
    { label: "Method", value: method?.nameEn ?? "A method no longer configured" },
    { label: "Contract type", value: cfg.config.types.find((t) => t.code === ex.contractTypeCode)?.nameEn ?? "Not set" },
    { label: "Band", value: ex.regime ? REGIME_LABEL[ex.regime as Regime] : "Not determined" },
    { label: "Contract terms band", value: bands?.terms.label ?? (ex.termsState === "NONE_IN_REGIME" ? "Not applicable" : "Not set") },
    { label: "Estimate", value: estimate.state === "GRANTED" ? formatMoney(parseSen(ex.estimatedValue.toString())) : `SULIT · withheld. ${estimate.words.en}` },
    { label: "Instrument", value: "kind" in instrument ? INSTRUMENT_LABEL[instrument.kind] : "Not set" },
    // 64-C4 (6.4 Q-1 B): the terms open as the frozen tender Appendix states them.
    ...(tender ? [{ label: "Letter's terms", value: `Opened from the tender Appendix (documents version ${tender.packVersion}); a percentage is worked out on the awarded value` }] : []),
  ];
  return (
    <>
      {header}
      <AwardForm
        exercise={{ id: ex.id, facts }}
        cancelHref={`/sourcing/${ex.id}?tab=award`}
        valueHint={headroom == null ? "The requisition has no approved value on record, so nothing can be awarded against it." : reqEstimate.state === "WITHHELD" ? "What the requisition's approval covers is made of the department estimate, which is closed to you, so the most that can be awarded is not stated. In ringgit, to at most two decimal places." : `Up to ${formatMoney(headroom)}: what the requisition's approval covers${siblings.length ? ", less its other awards" : ""}. In ringgit, to at most two decimal places.`}
        dossier={dossierEvidenceMissing(method, { justificationReasonCode: ex.justificationReasonCode, dossierReference: ex.dossierReference, evidenceAttachments: dossierEvidence })}
        parties={carried ? carried.map((p) => { const r = register.get(p.id); return { ...p, register: r ? { supplier: r.supplier, words: r.standing.words.en, tone: r.standing.tone, warning: r.standing.warning?.en ?? null } : null }; }) : undefined}
        recommended={evaluation.gate.applies && recommended ? { partyId: recommended.party.id, name: recommended.party.name, registrationNo: recommended.party.registrationNo, address: recommended.party.address, value: senToDecimalString(recommended.price), valueText: formatMoney(recommended.price), period: recommended.period ? String(recommended.period.value) : "", unit: recommended.period?.unit ?? "", version: evaluation.version! } : undefined}
      />
    </>
  );
}
