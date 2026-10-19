import Link from "next/link";

import { OwnerAttachments } from "@/components/attachments/owner-attachments";
import { FileIcon, UsersIcon } from "@/components/icons";
import { Badge, Chip } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/feedback";
import { MoreText } from "@/components/ui/more-text";
import { KeyValues } from "@/components/ui/stat";
import { exercisePurposes } from "@/lib/documents/targets";
import type { ExerciseEvidence } from "@/lib/documents/evidence";
import { formatDate } from "@/lib/format";
import { evidenceChip } from "@/lib/method/labels";
import type { evaluationContext, LoadedExercise } from "@/lib/method/repo";
import { DETAILS as DETAILS_PLACE } from "@/lib/tender-docs/conditions-labels";
import { capFirst } from "@/lib/tender-docs/frozen-view";
import type { ConditionsTab } from "@/lib/tender-docs/read-conditions";

import { ChooseTaxonomyDrawer, EditDetailsDrawer } from "../../editors";
import { AddRequirementDrawer, PermitDrawer, RemoveRequirementDrawer, RestrictionDrawer } from "../documents/conditions-editors";
import { Findings, NOT_SET as COND_NOT_SET, Registrations, Row, Value } from "../documents/conditions";

/**
 * Details & compliance, the first section of Scope and estimate (Sourcing Requirements v2: SR-05, ruling 8; O1, ruling 10).
 *
 * It holds what the Overview used to: who may bid (the registrations, the restriction, the permit), the exercise's own details, and now also
 * what the Overview's Contract card held that is a thing to do rather than a thing to read: the choice a classification asks for, the
 * justification dossier with its evidence, and the emergency coordination record. Everything is read by the page and handed in; nothing
 * here decides a rule.
 */

type Option = { value: string; label: string };

export interface DetailsProps {
  l: LoadedExercise;
  draft: boolean;
  /// The tender's conditions, and whether this exercise states them at all (an appointment with no tenderers does not).
  conditions: ConditionsTab | null;
  /// Who may be named person in charge (the active people, and the one named now even if since retired).
  people: Option[];
  /// Why the details (work code, person in charge) cannot change now, or null.
  detailsBlocker: string | null;
  config: Awaited<ReturnType<typeof evaluationContext>>["cfg"]["config"];
  /// What a draft is judged to be now; null once decided.
  live: { taxonomies: { taxonomyCode: string; state: string; valueCode: string | null; candidates: string[] }[] } | null;
  flags: { requiresJustification: boolean; requiresDossier: boolean; requiresCoordinationRecord: boolean; requiresFreshSourcing: boolean } | null;
  reasonName: string | null;
  evidence: ExerciseEvidence;
}

export function DetailsSection({ p }: { p: DetailsProps }) {
  return (
    <div className="flex flex-col gap-6">
      <ClassificationChoice p={p} />
      <DetailsCard p={p} />
      <DossierCard p={p} />
    </div>
  );
}

/// A classification the exercise's type and basis leave ambiguous asks for a choice (TAXONOMY_AMBIGUOUS): it is made here, where the Overview points to.
function ClassificationChoice({ p }: { p: DetailsProps }) {
  const ex = p.l.ex;
  const tax = (code: string) => p.config.taxonomies.find((t) => t.code === code);
  const ambiguous = p.draft && p.live ? p.live.taxonomies.filter((t) => t.state === "AMBIGUOUS") : [];
  if (ambiguous.length === 0) return null;
  return (
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
  );
}

/// The justification dossier and the emergency coordination record, with the evidence kept against the exercise: shown only for a method that asks for them.
function DossierCard({ p }: { p: DetailsProps }) {
  const { flags } = p;
  const ex = p.l.ex;
  if (!flags || !(flags.requiresJustification || flags.requiresDossier || flags.requiresCoordinationRecord)) return null;
  const rows: { label: string; value: React.ReactNode }[] = [
    ...(flags.requiresJustification || flags.requiresDossier ? [{ label: "Justification", value: ex.justificationText || "Not recorded" }] : []),
    ...(flags.requiresDossier
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
    ...(flags.requiresCoordinationRecord
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
  ];
  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<FileIcon size={17} />}
        title={flags.requiresDossier && flags.requiresCoordinationRecord ? "Justification dossier and coordination record" : flags.requiresCoordinationRecord ? "Emergency coordination record" : "Justification dossier"}
        subtitle="Change with Edit while a draft."
      />
      <CardBody className="flex flex-col gap-4">
        <KeyValues columns={2} items={rows} />
        <OwnerAttachments
          owner={{ kind: "exercise", id: ex.id }}
          title={flags.requiresDossier && flags.requiresCoordinationRecord ? "Dossier evidence and coordination scope" : flags.requiresDossier ? "Dossier evidence" : "Coordination meeting scope"}
          subtitle={flags.requiresDossier ? "Needs dossier evidence before approval." : "The scope document from the coordination meeting."}
          only={exercisePurposes(flags)}
          required={{ DOSSIER_EVIDENCE: flags.requiresDossier, COORDINATION_SCOPE: flags.requiresCoordinationRecord }}
        />
      </CardBody>
    </Card>
  );
}

function DetailsCard({ p }: { p: DetailsProps }) {
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
            Eligibility and details{" "}
            <span className="sr-only">The registrations, the restriction and the permit are fixed once the documents go for approval. The work code and the person in charge stay open until an award goes for approval.</span>
            <MoreText text="The registrations, the restriction and the permit are fixed once the documents go for approval. The work code and the person in charge stay open until an award goes for approval." label="When these can change" />
          </>
        }
        actions={live && live.edit.allowed ? <AddRequirementDrawer exerciseId={live.exerciseId} allowed={live.eligibility.noBodies ? { allowed: false, reason: live.eligibility.noBodies } : live.edit} bodies={live.eligibility.bodyOptions} groups={live.eligibility.groupOptions} typeTest={live.eligibility.typeTest} needs={live.eligibility.needOptions} /> : undefined}
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
          <p className="text-[13px] text-ink-3">No tender documents, so none to state.</p>
        ) : (
          <>
            <div>
              <p className="mb-2 text-[12px] font-semibold text-ink-3">Registrations bidders must hold</p>
              {live ? (
                live.eligibility.groups.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-line px-4 py-3 text-[13px] text-ink-2">
                    <Badge tone="warn">Not set</Badge> <span className="ml-1">No registration recorded.</span>
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
                {frozen ? `Frozen with version ${frozen.frozen.version}, judged ${frozen.frozen.judgedOn}.` : `Version ${before!.version} predates them.`}{" "}
                <Link href={`/sourcing/${ex.id}?tab=documents`}>Open the Tender documents</Link>
              </p>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}
