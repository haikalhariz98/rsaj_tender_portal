import Link from "next/link";

import { RecordCrumb } from "@/components/shell/record-crumb";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { INSTRUMENT_LABEL, awardFindingText } from "@/lib/award/labels";
import { awardHeadroom, instrumentFor } from "@/lib/award/instrument";
import { loadAwardPolicy } from "@/lib/award/repo";
import { LIVE_STATUSES } from "@/lib/award/status";
import { db } from "@/lib/db";
import { REGIME_LABEL } from "@/lib/method/labels";
import { approvedRouteOf, loadExercise, loadMethodConfig } from "@/lib/method/repo";
import { isBandSnapshot } from "@/lib/method/snapshot";
import type { Regime } from "@/lib/method/types";
import { formatMoney, parseSen, senFromDecimal } from "@/lib/money";

import { AwardForm } from "../award-form";

export const dynamic = "force-dynamic";

/// Open an award on an exercise in preparation (6.11), from the exercise's Award tab.
export default async function NewAwardPage(props: PageProps<"/awards/new">) {
  const { exercise } = (await props.searchParams) as { exercise?: string };
  const l = exercise ? await loadExercise(exercise) : null;
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
  const [policy, cfg, live, siblings] = await Promise.all([
    loadAwardPolicy(org.id),
    loadMethodConfig(org.id),
    db.award.findFirst({ where: { exerciseId: ex.id, status: { in: [...LIVE_STATUSES] } }, select: { id: true, reference: true } }),
    db.award.findMany({ where: { exercise: { requisitionId: l.req.id }, status: { in: [...LIVE_STATUSES] } }, select: { awardedValue: true } }),
  ]);
  const headroom = awardHeadroom(approvedRouteOf(l.req)?.value ?? null, siblings.map((s) => senFromDecimal(s.awardedValue)));
  const method = cfg.config.methods.find((m) => m.code === ex.sourcingMethodCode) ?? null;
  const instrument = instrumentFor(ex.regime, policy);
  const blocker = ex.status !== "DOCUMENTS_IN_PREPARATION" ? "An award is opened only on an exercise in preparation." : live ? `This exercise already has a live award, ${live.reference}.` : "fault" in instrument ? awardFindingText({ code: instrument.fault, level: "block", data: { regime: instrument.regime } }) : null;
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
  const bands = isBandSnapshot(ex.bandSnapshot) ? ex.bandSnapshot : null;
  const facts = [
    { label: "Exercise", value: `${ex.reference} · ${ex.title}` },
    { label: "Method", value: method?.nameEn ?? "A method no longer configured" },
    { label: "Contract type", value: cfg.config.types.find((t) => t.code === ex.contractTypeCode)?.nameEn ?? "Not set" },
    { label: "Band", value: ex.regime ? REGIME_LABEL[ex.regime as Regime] : "Not determined" },
    { label: "Contract terms band", value: bands?.terms.label ?? (ex.termsState === "NONE_IN_REGIME" ? "Not applicable" : "Not set") },
    { label: "Estimate", value: formatMoney(parseSen(ex.estimatedValue.toString())) },
    { label: "Instrument", value: "kind" in instrument ? INSTRUMENT_LABEL[instrument.kind] : "Not set" },
  ];
  return (
    <>
      {header}
      <AwardForm
        exercise={{ id: ex.id, facts }}
        cancelHref={`/sourcing/${ex.id}?tab=award`}
        valueHint={headroom == null ? "The requisition has no approved value on record, so nothing can be awarded against it." : `Up to ${formatMoney(headroom)}: what the requisition's approval covers${siblings.length ? ", less its other awards" : ""}. In ringgit, to at most two decimal places.`}
        dossier={!!method?.requiresDossier}
      />
    </>
  );
}
