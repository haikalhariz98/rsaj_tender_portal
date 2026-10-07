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
import { partyRegister } from "@/lib/suppliers/standing-repo";

import { AwardForm } from "../award-form";
import { requireStaff } from "@/app/_auth/actor";

export const dynamic = "force-dynamic";

/// Open an award on an exercise in preparation (6.11), from the exercise's Award tab.
export default async function NewAwardPage(props: PageProps<"/awards/new">) {
  const actor = await requireStaff();
  const { exercise } = (await props.searchParams) as { exercise?: string };
  const l = exercise ? await loadExercise(actor.organisationId, exercise) : null;
  const header = (
    <>
      <RecordCrumb label="New award" />
      <PageHeader eyebrow={<Link href="/awards">Awards</Link>} title="New award" subtitle="Opened on an exercise in preparation; the exercise's band decides the instrument." />
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
  const evaluationBlock = evaluation.gate.applies ? evaluationFindings({ facts: evaluation.gate, awardeePartyId: null }) : [];
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
                <ButtonLink href={`/awards/${live.id}`} size="sm">Open the award</ButtonLink>
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
  const carried = opening.applies ? (evaluation.recommended ? opening.carried.filter((p) => p.id === evaluation.recommended!.party.id) : opening.carried) : null;
  const register = carried ? await partyRegister(carried.map((p) => p.id), org, formatDate) : new Map();
  const bands = isBandSnapshot(ex.bandSnapshot) ? ex.bandSnapshot : null;
  const facts = [
    { label: "Exercise", value: `${ex.reference} · ${ex.title}` },
    { label: "Method", value: method?.nameEn ?? "A method no longer configured" },
    { label: "Contract type", value: cfg.config.types.find((t) => t.code === ex.contractTypeCode)?.nameEn ?? "Not set" },
    { label: "Band", value: ex.regime ? REGIME_LABEL[ex.regime as Regime] : "Not determined" },
    { label: "Contract terms band", value: bands?.terms.label ?? (ex.termsState === "NONE_IN_REGIME" ? "Not applicable" : "Not set") },
    { label: "Estimate", value: formatMoney(parseSen(ex.estimatedValue.toString())) },
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
        valueHint={headroom == null ? "The requisition has no approved value on record, so nothing can be awarded against it." : `Up to ${formatMoney(headroom)}: what the requisition's approval covers${siblings.length ? ", less its other awards" : ""}. In ringgit, to at most two decimal places.`}
        dossier={dossierEvidenceMissing(method, { justificationReasonCode: ex.justificationReasonCode, dossierReference: ex.dossierReference, evidenceAttachments: dossierEvidence })}
        parties={carried ? carried.map((p) => { const r = register.get(p.id); return { ...p, register: r ? { supplier: r.supplier, words: r.standing.words.en, tone: r.standing.tone, warning: r.standing.warning?.en ?? null } : null }; }) : undefined}
        recommended={evaluation.gate.applies && evaluation.recommended ? { partyId: evaluation.recommended.party.id, name: evaluation.recommended.party.name, registrationNo: evaluation.recommended.party.registrationNo, address: evaluation.recommended.party.address, value: senToDecimalString(evaluation.recommended.price), valueText: formatMoney(evaluation.recommended.price), period: evaluation.recommended.period ? String(evaluation.recommended.period.value) : "", unit: evaluation.recommended.period?.unit ?? "", version: evaluation.version! } : undefined}
      />
    </>
  );
}
