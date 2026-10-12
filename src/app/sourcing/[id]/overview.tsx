import { ActedBy } from "@/components/attribution";
import Link from "next/link";
import type { ReactNode } from "react";

import { Accordion } from "@/components/accordion";
import { FileIcon, RouteIcon } from "@/components/icons";
import { ActBadge, actLabel } from "@/components/ui/act";
import { Chip, SulitValue } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { ProvenanceBadge } from "@/components/ui/provenance";
import { KeyValues, Stat } from "@/components/ui/stat";
import { Stepper, type StepperStep } from "@/components/ui/stepper";
import type { Sulit } from "@/lib/auth/sulit-access";
import { resolutionText, supersession } from "@/lib/documents/supersession";
import { formatDate } from "@/lib/format";
import { disagreesAtBoundary } from "@/lib/method/bands";
import type { AttachmentFact } from "@/lib/documents/types";
import {
  APPOINTMENT_STATE_TEXT,
  BEHAVIOUR_LABEL,
  boundarySentence,
  DELIVERABLE_LABEL,
  DERIVATION_TEXT,
  findingTextFor,
  NOT_SET,
  REGIME_LABEL,
  TAXONOMY_STATE_LABEL,
  TERM,
  TERMS_STATE_TEXT,
  TYPE_STATE_LABEL,
} from "@/lib/method/labels";
import { behaviourProfile, type BehaviourValue } from "@/lib/method/profile";
import type { evaluationContext, LoadedExercise } from "@/lib/method/repo";
import { isCoreNotCheckedNotice, profileRows, type BandSnapshot, type ClassificationSnapshot, type RouteSnap } from "@/lib/method/snapshot";
import { ignoredMappingsText, ignoredPermitListMappings } from "@/lib/method/taxonomy";
import type { DeliverableKind, Finding } from "@/lib/method/types";
import { formatMoney, parseSen } from "@/lib/money";


/**
 * The exercise's Overview (founder, 2026-10-05): the default tab, replacing Classification and
 * Contract type. Where it stands (the process flow, and the approval for tendering once there is
 * one), the contract in a few lines, the details and compliance a tender is held to, and its key
 * dates and person in charge. The rules behind the contract's answers sit behind "Rules used".
 * Everything is read by the page and handed in; nothing here decides a rule.
 */

export const money = (v: { toString(): string }) => formatMoney(parseSen(v.toString()));
/// A percentage to as many places as it has (up to four), so "above the threshold" is
/// visibly true: 50.0010%, not 50.00%.
export const pct = (v: string) => v.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
export const tone = (l: string) => (l === "block" || l === "err" ? "err" : l === "info" ? "info" : "warn") as "err" | "warn" | "info";
/// Where a rule or band sits at the boundary, in words; the disagreement is the lib's finding.
const boundarySide = (op: string | null | undefined, disagrees: boolean) => (!op ? "no edge at the boundary" : disagrees ? "the other side from its band — see the checks" : "the same side as its band");

const behaviourText = (v: BehaviourValue, officeName: (c: string) => string, key: string) => {
  if (v == null) return <span className="text-ink-4">{NOT_SET}</span>;
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) return key === "administratorRoleCodes" ? v.map(officeName).join(", ") : v.join(", ");
  return key === "claimsApprovalCommitteeCode" ? officeName(v) : v;
};

function RouteList({ route, hideCoreNotice = false }: { route: RouteSnap; hideCoreNotice?: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      {route.chain.length > 0 ? (
        <ol className="flex flex-col gap-1.5">
          {route.chain.map((s, i) => (
            <li key={i} className="flex min-w-0 items-center gap-2 text-[13.5px]">
              <ActBadge act={s.act} />
              <span className="min-w-0 font-semibold break-words text-ink">{s.role}</span>
              <span className="text-ink-3">{actLabel(s.act)}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-[13.5px] text-ink-2">{APPOINTMENT_STATE_TEXT[route.state as keyof typeof APPOINTMENT_STATE_TEXT] ?? "Not resolved"}</p>
      )}
      {route.ruleLabel && <p className="text-[12.5px] break-words text-ink-3">{`${route.ruleLabel}${route.clause ? ` · ${route.clause}` : ""}${route.overrideLabel ? ` · funder's rule set “${route.overrideLabel}”` : ""}`}</p>}
      {route.warnings.filter((w) => !(hideCoreNotice && isCoreNotCheckedNotice(w))).map((w) => (
        <Callout key={w.text} tone={tone(w.level)}>
          {w.text}
        </Callout>
      ))}
    </div>
  );
}

/// A check recorded with the exercise is a statement about the day it was recorded: where
/// a live attachment has since satisfied it, it reads as history, not as a warning.
function judgeFindings(p: Pick<OverviewProps, "l" | "live" | "findings" | "evidenceFacts">) {
  const ex = p.l.ex;
  const judged = !p.live && ex.determinedAt ? supersession(p.findings, p.evidenceFacts, ex.determinedAt) : p.findings.map((finding) => ({ finding, superseded: null }));
  const standing = judged.filter((j) => !j.superseded).map((j) => j.finding);
  return { blocking: standing.filter((f) => f.level === "block"), others: standing.filter((f) => f.level !== "block"), superseded: judged.flatMap((j) => (j.superseded ? [j.superseded] : [])) };
}

export interface OverviewProps {
  l: LoadedExercise;
  /// The department estimate as this reader may see it: the figure, or "SULIT · withheld" with the reason (Phase 3a).
  estimate: Sulit<string>;
  /// The one process flow. The approval track for tendering lives on the Tender documents tab (SR-03).
  flow: StepperStep[];
  decided: ClassificationSnapshot | null;
  bands: BandSnapshot | null;
  /// What a draft is judged to be now, where it is a draft; null once decided.
  live: { derivation: { state: string; code: string | null; sharePct: string | null }; type: { state: string | null; code: string | null }; taxonomies: { taxonomyCode: string; state: string; valueCode: string | null; candidates: string[] }[] } | null;
  findings: Finding[];
  config: Awaited<ReturnType<typeof evaluationContext>>["cfg"]["config"];
  /// The list the tender-documents policy keeps as its permit list (64-C1): never a classification.
  permitList: { code: string; nameEn: string } | null;
  typeName: (c: string | null) => string | null;
  methodName: string;
  flags: { requiresJustification: boolean; requiresDossier: boolean; requiresCoordinationRecord: boolean; requiresFreshSourcing: boolean } | null;
  reasonName: string | null;
  overriddenBy: string | null;
  requesterType: string | null;
  draft: boolean;
  officeName: (code: string) => string;
  evidenceFacts: AttachmentFact[];
  timeZone: string | null;
}

export function OverviewPanel(p: OverviewProps) {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader icon={<RouteIcon size={17} />} title="Process flow" subtitle="Where this exercise stands." />
        <CardBody>
          <Stepper label="Process flow" steps={p.flow} />
        </CardBody>
      </Card>

      <RequisitionSummaryCard p={p} />
    </div>
  );
}

// ------------------------------------------------------------------- contract

function RequisitionSummaryCard({ p }: { p: OverviewProps }) {
  const { l, decided, bands, live, config, flags } = p;
  const ex = l.ex;
  const req = l.req;
  const state = (decided?.contractType.state ?? ex.contractTypeState) as keyof typeof TYPE_STATE_LABEL | null;
  const derivationState = (decided?.contractType.derivationState ?? live?.derivation.state ?? ex.derivationState) as keyof typeof DERIVATION_TEXT | null;
  const derivedName = decided?.contractType.derivedName ?? p.typeName(live?.derivation.code ?? ex.derivedContractTypeCode);
  const basis = decided?.basis ?? config.bases.find((b) => b.code === ex.contractBasisCode) ?? null;
  const overridden = !!state && state !== "DERIVED";
  const methodOverridden = !!ex.proposedMethodCode && ex.proposedMethodCode !== ex.sourcingMethodCode;
  const { blocking, others } = judgeFindings(p);
  // The checks sit behind "Rules used": the closed accordion still says how many there are.
  const checksMeta = blocking.length > 0 ? `${blocking.length} to put right` : others.length > 0 ? `${others.length} ${others.length === 1 ? "check" : "checks"}` : undefined;

  return (
    <Card>
      <CardHeader
        icon={<FileIcon size={17} />}
        title="Requisition summary"
        subtitle="What is being bought, and how it is approved. Read only: the details are kept under Scope and estimate."
        actions={
          p.draft ? (
            <ButtonLink href={`/sourcing/${ex.id}/edit`} variant="secondary" size="sm">
              Change method, type or basis
            </ButtonLink>
          ) : undefined
        }
      />
      <CardBody className="flex flex-col gap-5">
        <KeyValues
          columns={2}
          items={[
            { label: "Requisition", value: <Link href={`/requisitions/${req.id}`}>{req.reference}</Link> },
            { label: "Method", value: methodOverridden ? `${p.methodName} · overridden` : ex.proposedMethodCode ? `${p.methodName} · as proposed` : p.methodName },
            { label: "Estimated value", value: <SulitValue of={p.estimate} /> },
            {
              label: "Contract type",
              value: (
                <span className="flex flex-col items-start gap-0.5">
                  <span>{decided?.contractType.nameEn ?? p.typeName(ex.contractTypeCode) ?? NOT_SET}</span>
                  {overridden && <span className="text-[12.5px] text-ink-3">{`Worked out from what is delivered: ${derivationState === "DERIVED" ? (derivedName ?? NOT_SET) : derivationState ? DERIVATION_TEXT[derivationState] : NOT_SET}`}</span>}
                  {overridden && <span className="text-[12.5px] text-ink-3">{`${TYPE_STATE_LABEL[state!]} · ${ex.contractTypeOverrideReason || "no reason recorded"}`}{p.overriddenBy ? <> · <ActedBy entity="SourcingExercise" id={ex.id} slot="overriddenBy" name={p.overriddenBy} /></> : null}</span>}
                  {!state && <span className="text-[12.5px] text-ink-3">Choose or derive one before documents go into preparation.</span>}
                </span>
              ),
            },
            { label: "Contract basis", value: basis ? `${basis.nameEn}${basis.standardFormLabel ? ` · ${basis.standardFormLabel}` : ""}` : "Not chosen: required before documents go into preparation" },
            ...(ex.methodReason ? [{ label: "Why this method", value: ex.methodReason }] : []),
            ...(ex.externalRouteNote ? [{ label: "What the external body decided", value: ex.externalRouteNote }] : []),
            ...(flags && !flags.requiresFreshSourcing ? [{ label: "Parent contract", value: <span className="flex flex-col items-start gap-1"><span>{ex.parentContractRef ?? "Not recorded"}</span><Chip tone="warn">Capacity not tracked</Chip></span> }] : []),
          ]}
        />

        <div className="border-t border-line pt-4">
          <p className="mb-2 text-[12px] font-semibold text-ink-3">What is delivered</p>
          {ex.scopeParts.length === 0 ? (
            <p className="text-[13.5px] text-ink-2">Not chosen yet: no contract type can be derived until it is.</p>
          ) : (
            <ul className="flex flex-col gap-1.5 text-[13.5px]">
              {ex.scopeParts.map((s) => (
                <li key={s.id} className="flex flex-wrap justify-between gap-2">
                  <span className="min-w-0 break-words text-ink-2">
                    {DELIVERABLE_LABEL[s.deliverableKind as DeliverableKind]}
                    {s.description ? ` · ${s.description}` : ""}
                  </span>
                  {/* The parts add up to the estimate exactly (the scope check refuses otherwise), so a reader who may not read the estimate is not shown them. */}
                  <span className="tabular-nums text-ink">{p.estimate.state === "WITHHELD" ? <SulitValue of={p.estimate as Sulit<ReactNode>} /> : money(s.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-line pt-4">
          <p className="mb-2 text-[12px] font-semibold text-ink-3">Who approves the appointment</p>
          {p.bands ? <RouteList route={p.bands.appointment} hideCoreNotice /> : <p className="text-[13.5px] text-ink-2">Not determined: the bands are determined when the exercise is saved under an issue of the limits in force.</p>}
        </div>

        {/* FR-MTD-003: a value exactly on a boundary is said on the card itself, with where the ruling comes from. */}
        {/* Not said to a reader who may not read the estimate: the boundary is configuration, so "exactly on it" is the estimate. */}
        {bands?.boundary.onBoundary && p.estimate.state !== "WITHHELD" && (
          <Callout tone="info" title="The value is on a boundary">
            <span className="flex flex-col items-start gap-1">
              <span>{boundarySentence(bands.boundary.operator, String(bands.boundary.value), bands.boundary.provenance)}</span>
              <ProvenanceBadge value={bands.boundary.provenance} />
              {bands.boundary.source && <span className="text-[12.5px]">{bands.boundary.source}</span>}
            </span>
          </Callout>
        )}

        <Accordion title="Rules used" meta={checksMeta}>
          <RulesUsed p={p} />
        </Accordion>
      </CardBody>
    </Card>
  );
}

/// What the contract's answers were judged by: the band families, the type's behaviours, the other
/// classifications and the checks recorded with the exercise. Kept behind "Rules used" (founder, 2026-10-05).
function RulesUsed({ p }: { p: OverviewProps }) {
  const { l, decided, bands, live, config, permitList } = p;
  const ex = l.ex;
  const type = config.types.find((t) => t.code === ex.contractTypeCode) ?? null;
  // Once decided, the record's values and office names; before, the type in force (review #6).
  const profile = profileRows(decided, type ? behaviourProfile(type) : null, p.officeName);
  const tax = (code: string) => config.taxonomies.find((t) => t.code === code);
  // 64-C1: mappings set up before the permit list was refused as a classification are ignored by
  // derivation; the live view says so rather than staying silent. A decided record renders as recorded.
  const liveType = live?.type.code ?? ex.contractTypeCode;
  const ignored = !decided && permitList && liveType ? ignoredPermitListMappings(config.mappings, permitList.code, liveType) : [];
  const { blocking, others, superseded } = judgeFindings(p);

  return (
    <div className="flex flex-col gap-6 px-5 py-5">
      <section aria-label="Three band families" className="flex flex-col gap-4">
        <h4 className="text-[13px] font-bold text-ink">Three band families</h4>
        {bands ? (
          <>
            <p className="text-[12.5px] text-ink-3">{`Determined ${formatDate(ex.determinedAt)} under ${bands.matrixLabel}.`}</p>
            <div className="grid gap-4 md:grid-cols-3">
              <Stat variant="inset" size="sm" tone="neutral" label="Requisition band" value={<span className="text-[17px] whitespace-normal">{ex.requisitionRuleLabel ?? "Not checked"}</span>} hint={ex.requisitionRuleLabel ? "The rule the requisition was approved under." : "The requisition's approval was received from outside and not checked against the approval matrix."} />
              <Stat variant="inset" size="sm" tone="neutral" label="Method band" value={<span className="text-[17px] whitespace-normal">{REGIME_LABEL[bands.regime]}</span>} hint={bands.proposed.method ? `Proposed: ${bands.proposed.method}.` : "No single method is proposed in this regime."} />
              <Stat
                variant="inset"
                size="sm"
                tone="neutral"
                label="Contract terms band"
                value={<span className={bands.terms.label ? "text-[17px] whitespace-normal" : "text-[17px] whitespace-normal text-ink-4"}>{bands.terms.label ?? (bands.terms.state === "NONE_IN_REGIME" ? "Not applicable" : NOT_SET)}</span>}
                hint={
                  bands.terms.label
                    ? `Retention: ${bands.terms.retentionApplies == null ? "not set" : bands.terms.retentionApplies ? "applies" : "does not apply"}. Defects liability: ${bands.terms.defectsLiabilityApplies == null ? "not set" : bands.terms.defectsLiabilityApplies ? "applies" : "does not apply"}.`
                    : bands.terms.state === "NOT_SET" || bands.terms.state === "NO_BAND_FOR_VALUE"
                      ? <>{TERMS_STATE_TEXT[bands.terms.state as keyof typeof TERMS_STATE_TEXT]} <Link href="/configuration/approval-matrix">Set them on the approval matrix</Link>.</>
                      : TERMS_STATE_TEXT[bands.terms.state as keyof typeof TERMS_STATE_TEXT]
                }
              />
            </div>
            {bands.boundary.onBoundary && p.estimate.state !== "WITHHELD" && (
              <p className="text-[12.5px] text-ink-3">
                On the boundary: appointment rule {boundarySide(bands.appointment.boundaryOperator, disagreesAtBoundary(ex.bandWarnings as never, "rule"))}; terms band {boundarySide(bands.terms.boundaryOperator, disagreesAtBoundary(ex.bandWarnings as never, "terms"))}.
              </p>
            )}
          </>
        ) : (
          <p className="text-[13.5px] text-ink-2">Not determined: the bands are determined when the exercise is saved under an issue of the limits in force.</p>
        )}
      </section>

      <section aria-label="How the contract type was reached" className="flex flex-col gap-3 border-t border-line pt-5">
        <h4 className="text-[13px] font-bold text-ink">How the contract type was reached</h4>
        <KeyValues
          columns={2}
          items={[
            { label: "Largest deliverable's share", value: ex.dominantSharePct && Number(ex.dominantSharePct.toString()) < 100 ? `${pct(ex.dominantSharePct.toString())}%` : "One deliverable" },
            {
              label: TERM.mixedThreshold,
              value: decided ? (decided.policy.dominanceSharePct ? `Above ${pct(decided.policy.dominanceSharePct)}% · as recorded` : "Not set: no default for mixed scope") : config.policy.dominanceSharePct ? `Above ${pct(config.policy.dominanceSharePct)}%` : "Not set: no default for mixed scope",
            },
            { label: "Requester's indication", value: p.requesterType ?? "None" },
          ]}
        />
      </section>

      <section aria-label="What the type drives" className="flex flex-col gap-3 border-t border-line pt-5">
        <h4 className="text-[13px] font-bold text-ink">What the type drives</h4>
        <p className="text-[12.5px] text-ink-3">{decided ? "As recorded when it moved into preparation." : "Enforced where each behaviour lives, in later modules."}</p>
        {profile ? (
          <>
            <KeyValues columns={2} items={profile.map((b) => ({ label: BEHAVIOUR_LABEL[b.key], value: behaviourText(b.value, b.offices, b.key) }))} />
            {!decided && type && profile.some((b) => b.value == null) && (
              <p className="text-[13px] text-ink-2">
                {profile.filter((b) => b.value == null).length} of 12 behaviours are not set for {type.nameEn}.{" "}
                <Link href="/configuration/reference-data">Set them under Reference data, Contract types, Behaviours of {type.nameEn}</Link>.
              </p>
            )}
          </>
        ) : (
          <EmptyState size="sm" title="No contract type yet">Choose or derive one to see its behaviours.</EmptyState>
        )}
      </section>

      <section aria-label="Other classifications" className="flex flex-col gap-3 border-t border-line pt-5">
        <h4 className="text-[13px] font-bold text-ink">Other classifications</h4>
        <p className="text-[12.5px] text-ink-3">Derived from the type and basis rather than asked again. The basis itself is always chosen.</p>
        {ignored.length > 0 && permitList && (
          <Callout tone="warn" action={<ButtonLink href="/configuration/reference-data" size="sm">Open Reference data</ButtonLink>}>
            {ignoredMappingsText(ignored.length, permitList.nameEn)}
          </Callout>
        )}
        {decided ? (
          <ul className="divide-y divide-line/70 rounded-2xl border border-line">
            {decided.taxonomies.map((t) => (
              <li key={t.taxonomy} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <span className="text-[13.5px] font-semibold text-ink">{t.taxonomy}</span>
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-[13.5px] text-ink-2">{t.value ?? "—"}</span>
                  <Chip tone={t.state === "NOT_MAPPED" ? "warn" : t.state === "CHOSEN" ? "info" : "ok"}>{TAXONOMY_STATE_LABEL[t.state]}</Chip>
                </span>
              </li>
            ))}
          </ul>
        ) : live && live.taxonomies.length > 0 ? (
          <ul className="divide-y divide-line/70 rounded-2xl border border-line">
            {live.taxonomies.map((t) => {
              const tx = tax(t.taxonomyCode);
              const valueName = (c: string) => tx?.values.find((v) => v.code === c)?.nameEn ?? "A value no longer configured";
              return (
                <li key={t.taxonomyCode} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <span className="text-[13.5px] font-semibold text-ink">{tx?.nameEn ?? "A classification no longer configured"}</span>
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[13.5px] text-ink-2">{t.valueCode ? valueName(t.valueCode) : t.state === "AMBIGUOUS" ? t.candidates.map(valueName).join(" or ") : "—"}</span>
                    <Chip tone={t.state === "AMBIGUOUS" || t.state === "NOT_MAPPED" ? "warn" : t.state === "CHOSEN" ? "info" : "ok"}>{TAXONOMY_STATE_LABEL[t.state as keyof typeof TAXONOMY_STATE_LABEL]}</Chip>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState size="sm" title="No classifications configured">Other classifications and their mappings are set under Reference data.</EmptyState>
        )}
      </section>

      {(blocking.length > 0 || others.length > 0 || superseded.length > 0) && (
        <section aria-label="Checks" className="flex flex-col gap-2 border-t border-line pt-5">
          <h4 className="text-[13px] font-bold text-ink">{live ? "Checks, as they stand today" : ex.determinedAt ? `Checks, as recorded on ${formatDate(ex.determinedAt)}` : "Checks, as recorded"}</h4>
          <p className="text-[12.5px] text-ink-3">{blocking.length ? "What must be put right before documents go into preparation, and what is recorded with it." : "Recorded with the exercise."}</p>
          {[...blocking, ...others].map((f, i) => (
            <Callout key={i} tone={tone(f.level)}>
              {findingTextFor(f, p.estimate.state === "WITHHELD")}
            </Callout>
          ))}
          {superseded.map((r) => (
            <Callout key={r.subject} tone="neutral">
              {resolutionText(r, p.timeZone)}
            </Callout>
          ))}
        </section>
      )}
    </div>
  );
}
