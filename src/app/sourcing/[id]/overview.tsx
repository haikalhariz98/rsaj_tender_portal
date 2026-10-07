import { ActedBy } from "@/components/attribution";
import Link from "next/link";

import { Accordion } from "@/components/accordion";
import { OwnerAttachments } from "@/components/attachments/owner-attachments";
import { ClipboardIcon, FileIcon, RouteIcon, UsersIcon } from "@/components/icons";
import { ActBadge, actLabel } from "@/components/ui/act";
import { Badge, Chip, SulitValue } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { MoreText } from "@/components/ui/more-text";
import { ProvenanceBadge } from "@/components/ui/provenance";
import { KeyValues, Stat } from "@/components/ui/stat";
import { Stepper, type StepperStep } from "@/components/ui/stepper";
import { exercisePurposes } from "@/lib/documents/targets";
import { resolutionText, supersession } from "@/lib/documents/supersession";
import { formatDate } from "@/lib/format";
import { disagreesAtBoundary } from "@/lib/method/bands";
import type { ExerciseEvidence } from "@/lib/documents/evidence";
import type { AttachmentFact } from "@/lib/documents/types";
import { CUTOFF_NOT_SET, NO_EVENTS_TEXT, type KeyDatesView } from "@/lib/method/key-dates";
import {
  APPOINTMENT_STATE_TEXT,
  BEHAVIOUR_LABEL,
  boundarySentence,
  DELIVERABLE_LABEL,
  DERIVATION_TEXT,
  evidenceChip,
  findingText,
  NOT_SET,
  REGIME_LABEL,
  TAXONOMY_STATE_LABEL,
  TERM,
  TERMS_STATE_TEXT,
  TYPE_STATE_LABEL,
} from "@/lib/method/labels";
import { behaviourProfile, type BehaviourValue } from "@/lib/method/profile";
import type { evaluationContext, LoadedExercise } from "@/lib/method/repo";
import { profileRows, type BandSnapshot, type ClassificationSnapshot, type RouteSnap } from "@/lib/method/snapshot";
import { ignoredMappingsText, ignoredPermitListMappings } from "@/lib/method/taxonomy";
import type { DeliverableKind, Finding } from "@/lib/method/types";
import { formatMoney, parseSen } from "@/lib/money";
import type { ConditionsTab } from "@/lib/tender-docs/read-conditions";
import { DETAILS as DETAILS_PLACE } from "@/lib/tender-docs/conditions-labels";
import { capFirst } from "@/lib/tender-docs/frozen-view";

import { ChooseTaxonomyDrawer, EditDetailsDrawer } from "../editors";
import { AddRequirementDrawer, PermitDrawer, RemoveRequirementDrawer, RestrictionDrawer } from "./documents/conditions-editors";
import { Findings, NOT_SET as COND_NOT_SET, Registrations, Row, Value } from "./documents/conditions";

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

function RouteList({ route }: { route: RouteSnap }) {
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
      {route.warnings.map((w) => (
        <Callout key={w.text} tone={tone(w.level)}>
          {w.text}
        </Callout>
      ))}
    </div>
  );
}

type Option = { value: string; label: string };

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
  /// The process flow and, where the exercise has a route for tendering, its steps (read-only here).
  flow: StepperStep[];
  tendering: StepperStep[] | null;
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
  evidence: ExerciseEvidence;
  evidenceFacts: AttachmentFact[];
  timeZone: string | null;
  /// The tender's conditions, and whether this exercise states them at all (an appointment with no tenderers does not).
  conditions: ConditionsTab | null;
  keyDates: KeyDatesView;
  /// Who may be named person in charge (the active people, and the one named now even if since retired).
  people: Option[];
  /// Why the details (work code, person in charge) cannot change now, or null.
  detailsBlocker: string | null;
}

export function OverviewPanel(p: OverviewProps) {
  const ex = p.l.ex;
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader icon={<RouteIcon size={17} />} title="Process flow" subtitle="Where this exercise stands." />
        <CardBody>
          <Stepper label="Process flow" steps={p.flow} />
        </CardBody>
      </Card>

      {p.tendering && (
        <Card>
          <CardHeader
            icon={<RouteIcon size={17} />}
            title="Approval for tendering"
            subtitle="Decided on the Tender documents tab."
            actions={
              <ButtonLink href={`/sourcing/${ex.id}?tab=documents`} variant="secondary" size="sm">
                Open in Tender documents
              </ButtonLink>
            }
          />
          <CardBody>
            <Stepper label="Approval for tendering" steps={p.tendering} />
          </CardBody>
        </Card>
      )}

      <ContractCard p={p} />
      <DetailsCard p={p} />
      <KeyDatesCard p={p} />
    </div>
  );
}

// ------------------------------------------------------------------- contract

function ContractCard({ p }: { p: OverviewProps }) {
  const { l, decided, bands, live, config, flags } = p;
  const ex = l.ex;
  const req = l.req;
  const state = (decided?.contractType.state ?? ex.contractTypeState) as keyof typeof TYPE_STATE_LABEL | null;
  const derivationState = (decided?.contractType.derivationState ?? live?.derivation.state ?? ex.derivationState) as keyof typeof DERIVATION_TEXT | null;
  const derivedName = decided?.contractType.derivedName ?? p.typeName(live?.derivation.code ?? ex.derivedContractTypeCode);
  const basis = decided?.basis ?? config.bases.find((b) => b.code === ex.contractBasisCode) ?? null;
  const overridden = !!state && state !== "DERIVED";
  const tax = (code: string) => config.taxonomies.find((t) => t.code === code);
  const ambiguous = p.draft && live ? live.taxonomies.filter((t) => t.state === "AMBIGUOUS") : [];
  const methodOverridden = !!ex.proposedMethodCode && ex.proposedMethodCode !== ex.sourcingMethodCode;
  const { blocking, others } = judgeFindings(p);
  // The checks sit behind "Rules used": the closed accordion still says how many there are.
  const checksMeta = blocking.length > 0 ? `${blocking.length} to put right` : others.length > 0 ? `${others.length} ${others.length === 1 ? "check" : "checks"}` : undefined;

  return (
    <Card>
      <CardHeader
        icon={<FileIcon size={17} />}
        title="Contract"
        subtitle="What is being bought, and how it is approved."
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
            { label: "Estimated value", value: <SulitValue>{money(ex.estimatedValue)}</SulitValue> },
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
            ...(flags?.requiresJustification || flags?.requiresDossier ? [{ label: "Justification", value: ex.justificationText || "Not recorded" }] : []),
            ...(flags?.requiresDossier
              ? [
                  { label: "Reason", value: p.reasonName ?? "Not recorded" },
                  { label: "Dossier reference", value: ex.dossierReference ? <span className="font-mono text-[13px]">{ex.dossierReference}</span> : "Numbered when it moves into preparation" },
                  {
                    label: "Supporting evidence",
                    value: (
                      <span className="flex flex-col items-start gap-1">
                        <span>{ex.evidenceNote || "No note"}</span>
                        <Chip tone={evidenceChip(p.evidence.dossier, "dossier").tone}>{evidenceChip(p.evidence.dossier, "dossier").text}</Chip>
                      </span>
                    ),
                  },
                ]
              : []),
            ...(flags?.requiresCoordinationRecord
              ? [
                  { label: "Emergency trigger", value: ex.emergencyTrigger || "Not recorded" },
                  { label: "Coordination meeting", value: ex.coordinationMeetingOn ? formatDate(ex.coordinationMeetingOn) : "Not recorded" },
                  { label: "Attended by", value: ex.coordinationAttendees || "Not recorded" },
                  {
                    label: "Scope fixed",
                    value: (
                      <span className="flex flex-col items-start gap-1">
                        <span>{ex.coordinationScopeNote || "No note"}</span>
                        <Chip tone={evidenceChip(p.evidence.scope, "scope").tone}>{evidenceChip(p.evidence.scope, "scope").text}</Chip>
                      </span>
                    ),
                  },
                  { label: "Bill of quantities", value: ex.bqReference ?? "Not recorded" },
                ]
              : []),
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
                  <span className="tabular-nums text-ink">{money(s.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-line pt-4">
          <p className="mb-2 text-[12px] font-semibold text-ink-3">Who approves the appointment</p>
          {p.bands ? <RouteList route={p.bands.appointment} /> : <p className="text-[13.5px] text-ink-2">Not determined: the bands are determined when the exercise is saved under an issue of the limits in force.</p>}
        </div>

        {/* FR-MTD-003: a value exactly on a boundary is said on the card itself, with where the ruling comes from. */}
        {bands?.boundary.onBoundary && (
          <Callout tone="info" title="The value is on a boundary">
            <span className="flex flex-col items-start gap-1">
              <span>{boundarySentence(bands.boundary.operator, String(bands.boundary.value), bands.boundary.provenance)}</span>
              <ProvenanceBadge value={bands.boundary.provenance} />
              {bands.boundary.source && <span className="text-[12.5px]">{bands.boundary.source}</span>}
            </span>
          </Callout>
        )}

        {ambiguous.length > 0 && (
          <Callout tone="warn" title={ambiguous.length === 1 ? "A classification needs a choice" : `${ambiguous.length} classifications need a choice`}>
            <ul className="mt-1 flex flex-col gap-2">
              {ambiguous.map((t) => {
                const tx = tax(t.taxonomyCode);
                const valueName = (c: string) => tx?.values.find((v) => v.code === c)?.nameEn ?? "A value no longer configured";
                return (
                  <li key={t.taxonomyCode} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0 break-words">
                      <span className="font-semibold">{tx?.nameEn ?? "A classification no longer configured"}</span>: {t.candidates.map(valueName).join(" or ")}
                    </span>
                    {tx && <ChooseTaxonomyDrawer id={ex.id} taxonomyCode={t.taxonomyCode} taxonomy={tx.nameEn} candidates={t.candidates.map((c) => ({ value: c, label: valueName(c) }))} />}
                  </li>
                );
              })}
            </ul>
          </Callout>
        )}

        {flags && (flags.requiresDossier || flags.requiresCoordinationRecord) && (
          <OwnerAttachments
            owner={{ kind: "exercise", id: ex.id }}
            title={flags.requiresDossier && flags.requiresCoordinationRecord ? "Dossier evidence and coordination scope" : flags.requiresDossier ? "Dossier evidence" : "Coordination meeting scope"}
            subtitle={flags.requiresDossier ? "Kept against the exercise. A direct appointment is sent for approval only with its dossier evidence attached." : "Kept against the exercise: the document that fixed the scope at the coordination meeting."}
            only={exercisePurposes(flags)}
            required={{ DOSSIER_EVIDENCE: flags.requiresDossier, COORDINATION_SCOPE: flags.requiresCoordinationRecord }}
          />
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
            {bands.boundary.onBoundary && (
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
              {findingText(f)}
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

// ------------------------------------------------------- details & compliance

function DetailsCard({ p }: { p: OverviewProps }) {
  const ex = p.l.ex;
  const c = p.conditions;
  const live = c?.mode === "live" ? c : null;
  const frozen = c?.mode === "frozen" ? c : null;
  const before = c?.mode === "before" ? c : null;
  return (
    <Card id="conditions" className="scroll-mt-24 overflow-hidden">
      <CardHeader
        icon={<UsersIcon size={17} />}
        title="Details & compliance"
        subtitle={
          <>
            Who may bid, and the exercise&apos;s own details.{" "}
            <span className="sr-only">The registrations, the restriction and the permit are fixed once the documents go for approval. The work code and the person in charge stay open until an award goes for approval.</span>
            <MoreText text="The registrations, the restriction and the permit are fixed once the documents go for approval. The work code and the person in charge stay open until an award goes for approval." label="When these can change" />
          </>
        }
        actions={live && live.edit.allowed ? <AddRequirementDrawer exerciseId={live.exerciseId} allowed={live.eligibility.noBodies ? { allowed: false, reason: live.eligibility.noBodies } : live.edit} bodies={live.eligibility.bodyOptions} groups={live.eligibility.groupOptions} typeTest={live.eligibility.typeTest} /> : undefined}
      />
      <CardBody className="flex flex-col gap-5">
        <ul className="divide-y divide-line/70 rounded-2xl border border-line">
          <Row
            title="Title"
            value={<span className="break-words">{ex.title}</span>}
            action={
              p.draft ? (
                <ButtonLink href={`/sourcing/${ex.id}/edit`} variant="ghost" size="sm" aria-label="Edit the title">
                  Edit
                </ButtonLink>
              ) : undefined
            }
          />
          <Row
            title="Work code"
            value={ex.workCode ? <span className="break-words">{ex.workCode}</span> : <Badge tone="warn">Not recorded</Badge>}
            action={<EditDetailsDrawer id={ex.id} people={p.people} personInChargeId={ex.personInChargeId} workCode={ex.workCode} blocker={p.detailsBlocker} what="work code" />}
          />
        </ul>

        {c == null ? (
          <p className="text-[13px] text-ink-3">This exercise issues no tender documents, so there are no registrations, restriction or permit to state.</p>
        ) : (
          <>
            <div>
              <p className="mb-2 text-[12px] font-semibold text-ink-3">Registrations bidders must hold</p>
              {live ? (
                live.eligibility.groups.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-line px-4 py-3 text-[13px] text-ink-2">
                    <Badge tone="warn">Not set</Badge> <span className="ml-1">No registration is recorded, so the notice has no eligibility block.</span>
                  </p>
                ) : (
                  <ul className="divide-y divide-line/70 rounded-2xl border border-line">
                    {live.eligibility.groups.map((g) => (
                      <li key={g.number} className="flex flex-col gap-1.5 px-4 py-3">
                        <span className="text-[12px] font-semibold text-ink-3">{g.heading}</span>
                        <ul className="flex flex-col gap-1.5">
                          {g.items.map((r) => (
                            <li key={r.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                              <span className="min-w-0 text-[13.5px] break-words text-ink">
                                <span className="font-semibold">{capFirst(r.body)}</span>
                                {r.qualifiers && <span className="text-ink-2"> · {r.qualifiers}</span>}
                              </span>
                              <RemoveRequirementDrawer exerciseId={live.exerciseId} id={r.id} label={capFirst(r.body)} allowed={live.edit} />
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                )
              ) : frozen ? (
                <Registrations groups={frozen.frozen.groups.map((g) => ({ ...g, items: g.items }))} />
              ) : before ? (
                <Registrations groups={before.groups} />
              ) : null}
              {live && (
                <p className="mt-2 text-[12.5px] text-ink-3">
                  The notice states each registration must be valid from the day tendering starts to the closing day: the days proposed when the documents are submitted. The contract type&apos;s registration test: {live.eligibility.typeTest}.
                </p>
              )}
            </div>
            <ul className="divide-y divide-line/70 rounded-2xl border border-line">
              {live ? (
                <>
                  <Row title={live.restriction.question} value={<Value v={live.restriction.answer} />} action={live.edit.allowed ? <RestrictionDrawer exerciseId={live.exerciseId} question={live.restriction.question} raw={live.restriction.raw} allowed={live.edit} /> : undefined}>
                    {live.restriction.answer === "Yes" && (
                      <span className="text-[12.5px] break-words text-ink-3">
                        Stamped on every generated document: {live.restriction.stampEn === COND_NOT_SET ? "English wording not set" : `“${live.restriction.stampEn}”`}
                        {live.restriction.stampMs !== COND_NOT_SET ? ` · “${live.restriction.stampMs}”` : ""}
                      </span>
                    )}
                  </Row>
                  <Row title="Needs the regulator's permit" value={<Value v={live.permit.answer} />} action={live.edit.allowed ? <PermitDrawer exerciseId={live.exerciseId} raw={live.permit.raw} rawPermit={live.permit.rawPermit} options={live.permit.options} list={live.permit.list} allowed={live.edit} /> : undefined}>
                    {live.permit.permit != null && <span className="text-[12.5px] text-ink-3">Permit type: {live.permit.permit === COND_NOT_SET ? "not chosen" : live.permit.permit}</span>}
                  </Row>
                </>
              ) : (
                (() => {
                  const r = frozen ? frozen.frozen : before!;
                  return (
                    <>
                      <Row title={r.restriction.question} value={<Value v={r.restriction.answer} />} />
                      <Row title="Needs the regulator's permit" value={<Value v={r.permit.answer} />}>
                        {r.permit.type != null && <span className="text-[12.5px] text-ink-3">Permit type: {r.permit.type === COND_NOT_SET ? "not chosen" : r.permit.type}</span>}
                      </Row>
                    </>
                  );
                })()
              )}
            </ul>
            {live && !live.edit.allowed && <p className="text-[12.5px] text-ink-3">{live.edit.reason}</p>}
            {/* Where these findings say "on the Overview tab", this is it: they say "here". Founder, 2026-10-05:
                what blocks approval is not listed (the rows above already say "Not set", and the submit refuses
                with the reasons); only warnings and notes show. */}
            {live && live.edit.allowed && <Findings items={[...live.eligibility.findings, ...live.restriction.findings, ...live.permit.findings].filter((f) => f.level !== "block").map((f) => ({ ...f, text: f.text.split(DETAILS_PLACE).join("here") }))} />}
            {(frozen || before) && (
              <p className="text-[12.5px] text-ink-3">
                {frozen ? `As frozen with version ${frozen.frozen.version}, judged ${frozen.frozen.judgedOn}. They change only in a new version, after a return.` : `Version ${before!.version} was frozen before they were recorded with it.`}{" "}
                <Link href={`/sourcing/${ex.id}?tab=documents`}>Open the Tender documents</Link>
              </p>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}

// ------------------------------------------------- key dates & person in charge

function KeyDatesCard({ p }: { p: OverviewProps }) {
  const ex = p.l.ex;
  const k = p.keyDates;
  const dateValue = (d: { state: string; label: string | null; text: string }) =>
    d.label ? (
      <span>
        <span className="font-semibold">{d.label}</span> {d.text}
      </span>
    ) : (
      <span className="text-ink-3">{d.text}</span>
    );
  const pic = ex.personInCharge;
  return (
    <Card className="overflow-hidden">
      <CardHeader icon={<ClipboardIcon size={17} />} title="Key dates & person in charge" subtitle="When tendering starts and closes, and who is looking after it." />
      <CardBody>
        <ul className="divide-y divide-line/70 rounded-2xl border border-line">
          {k.start.state === "NOT_APPLICABLE" ? (
            <Row title="Tendering window" value={<span className="text-ink-3">{k.start.text}</span>}>
              <span className="text-[12.5px] text-ink-3">This exercise issues no tender documents, so there is no start, closing or briefing to set.</span>
            </Row>
          ) : (
            <>
              <Row title="Tendering starts" value={dateValue(k.start)} />
              <Row title="Closing" value={dateValue(k.closing)}>
                <span className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-3">
                  Organisation&apos;s usual closing time:{" "}
                  {k.cutoff.text ? (
                    <>
                      <span className="text-ink-2">{k.cutoff.text}</span>
                      <ProvenanceBadge value={k.cutoff.provenance} />
                    </>
                  ) : (
                    <>
                      <Badge tone="warn">{CUTOFF_NOT_SET}</Badge>
                      <Link href="/configuration/invitation">Set it under Invitation controls</Link>
                    </>
                  )}
                </span>
              </Row>
              <Row title="Briefing and site visits">
                {k.events.length === 0 ? (
                  <span className="text-[13px] text-ink-2">
                    {NO_EVENTS_TEXT}
                    {k.canSchedule && (
                      <>
                        . <Link href={`/sourcing/${ex.id}?tab=invitation&section=briefing`}>Schedule one under Invitation, Briefing</Link>
                      </>
                    )}
                  </span>
                ) : (
                  <ul className="flex flex-col gap-1 text-[13.5px] text-ink">
                    {k.events.map((e) => (
                      <li key={e.id} className="break-words">
                        {e.text}
                      </li>
                    ))}
                  </ul>
                )}
              </Row>
            </>
          )}
          <Row
            title="Person in charge"
            value={pic ? <span className="break-words">{pic.isActive ? pic.name : `${pic.name} (no longer active)`}</span> : <Badge tone="warn">Not recorded</Badge>}
            action={<EditDetailsDrawer id={ex.id} people={p.people} personInChargeId={ex.personInChargeId} workCode={ex.workCode} blocker={p.detailsBlocker} what="person in charge" />}
          />
          <Row title="Requested by" value={<span className="break-words">{p.l.req.requestingPerson?.name ?? "Not recorded"}</span>}>
            <span className="text-[12.5px] text-ink-3">Named on the requisition, who asked for it; not necessarily who looks after the exercise.</span>
          </Row>
        </ul>
      </CardBody>
    </Card>
  );
}
