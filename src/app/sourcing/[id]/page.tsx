import Link from "next/link";
import { notFound } from "next/navigation";

import { ClipboardIcon, ClockIcon, FileIcon, RouteIcon, ShieldIcon, SlidersIcon, UsersIcon } from "@/components/icons";
import { RecordCrumb } from "@/components/shell/record-crumb";
import { Tabs } from "@/components/tabs";
import { ActBadge } from "@/components/ui/act";
import { Badge, Chip } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { ProvenanceBadge } from "@/components/ui/provenance";
import { KeyValues, Stat } from "@/components/ui/stat";
import { fieldLabel } from "@/lib/audit/diff";
import { dayToDate } from "@/lib/dates";
import { formatDate, formatOrgDay } from "@/lib/format";
import { ACT_DONE_LABEL, ACT_LABEL } from "@/lib/labels";
import { latestFirst, nameRequestFault, nameRouteForRequester, nameRouteLabel, requesterHolding, resolveNameApproval } from "@/lib/method/approval";
import { disagreesAtBoundary } from "@/lib/method/bands";
import { determinationDrift } from "@/lib/method/drift";
import { evaluateExercise } from "@/lib/method/evaluate";
import { transitionFault } from "@/lib/method/exercise";
import {
  APPOINTMENT_STATE_TEXT,
  BEHAVIOUR_LABEL,
  boundarySentence,
  CANCELLED_ASSUMPTION,
  TERM,
  DELIVERABLE_LABEL,
  DERIVATION_TEXT,
  EXERCISE_STATUS_LABEL,
  EXERCISE_STATUS_TONE,
  findingText,
  NAME_STATE_TEXT,
  NOT_SET,
  PROPOSAL_STATE_LABEL,
  REGIME_LABEL,
  REGIME_SHORT,
  TAXONOMY_STATE_LABEL,
  TERMS_STATE_TEXT,
  TYPE_STATE_LABEL,
} from "@/lib/method/labels";
import { behaviourProfile, type BehaviourValue } from "@/lib/method/profile";
import { nameRequestProposalFault, proposalFaults, proposalView } from "@/lib/method/proposal";
import { draftOf, evaluationContext, exerciseHistory, loadExercise, type LoadedExercise } from "@/lib/method/repo";
import { determinationColumns, isBandSnapshot, isClassificationSnapshot, profileRows, type BandSnapshot, type ClassificationSnapshot, type RouteSnap } from "@/lib/method/snapshot";
import type { DeliverableKind, Finding, Regime } from "@/lib/method/types";
import { formatMoney, parseSen } from "@/lib/money";
import { ORGANISATION_CODE } from "@/lib/org";
import { pathTo } from "@/lib/organisation/structure";
import type { OrgUnit } from "@/lib/organisation/types";
import { db } from "@/lib/db";
import { loadDelegations, loadRoster } from "@/lib/people/load";
import { holdersFor } from "@/lib/requisition/holders";
import { DECISION_LABEL, DECIDER_FAULT_TEXT, OPERATOR_LABEL } from "@/lib/requisition/labels";

import {
  AddParticipantDrawer,
  CancelExerciseDrawer,
  ChooseTaxonomyDrawer,
  EXERCISE_NOTE_ID,
  MoveToPreparationDrawer,
  NameDecisionDrawer,
  ProposalAnswersDrawer,
  RemoveParticipantDrawer,
  RequestNameApprovalDrawer,
  ReviewProposalDrawer,
  SubmitProposalDrawer,
} from "../editors";

export const dynamic = "force-dynamic";

/// Where a rule or band sits at the boundary, in words; the disagreement is the lib's finding.
const boundarySide = (op: string | null | undefined, disagrees: boolean) => (!op ? "no edge at the boundary" : disagrees ? "the other side from its band — see the checks" : "the same side as its band");
const RESTRICTION_NOTE = "Restriction not enforced until sign-in";
const money = (v: { toString(): string }) => formatMoney(parseSen(v.toString()));
/// A percentage to as many places as it has (up to four), so "above the threshold" is
/// visibly true: 50.0010%, not 50.00%.
const pct = (v: string) => v.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
const tone = (l: string) => (l === "block" || l === "err" ? "err" : l === "info" ? "info" : "warn") as "err" | "warn" | "info";

export default async function ExercisePage(props: PageProps<"/sourcing/[id]">) {
  const [{ id }, { tab }] = await Promise.all([props.params, props.searchParams as Promise<{ tab?: string }>]);
  const l = await loadExercise(id);
  if (!l) notFound();
  const { ex, req, org } = l;
  const today = org.today;
  const on = today ? dayToDate(today) : new Date();
  const draft = ex.status === "DRAFT";

  const [{ issue, cfg, ctx }, history, people, roster, delegations, units] = await Promise.all([
    evaluationContext(org, req, ex),
    exerciseHistory(l),
    db.person.findMany({ where: { organisationId: org.id }, orderBy: { name: "asc" }, select: { id: true, name: true, isActive: true } }),
    loadRoster(ORGANISATION_CODE),
    loadDelegations(ORGANISATION_CODE),
    db.orgUnit.findMany({ where: { organisationId: org.id } }),
  ]);
  const config = cfg.config;
  const method = config.methods.find((m) => m.code === ex.sourcingMethodCode) ?? null;
  const decided = isClassificationSnapshot(ex.classificationSnapshot) ? ex.classificationSnapshot : null;
  const bands = isBandSnapshot(ex.bandSnapshot) ? ex.bandSnapshot : null;
  // A draft is judged now, as its next save would be; a decided exercise renders from its record.
  const ev = draft && ctx ? evaluateExercise(draftOf(ex), ctx) : null;
  const flags = decided?.method.flags ?? method ?? null;
  const methodName = decided?.method.nameEn ?? method?.nameEn ?? "A method no longer configured";
  const typeName = (code: string | null) => (code ? (config.types.find((t) => t.code === code)?.nameEn ?? "A type no longer configured") : null);
  const personName = (pid: string | null) => (pid ? (people.find((p) => p.id === pid)?.name ?? "Not on record") : null);
  const activePeople = people.filter((p) => p.isActive).map((p) => ({ value: p.id, label: p.name }));

  // ------------------------------------------------------------- what blocks
  const blocking = ev ? ev.findings.filter((f) => f.level === "block") : [];
  const prepFaults: Finding[] = draft
    ? [
        ...transitionFault(ex.status, "DOCUMENTS_IN_PREPARATION", {
          today,
          methodSet: !!method,
          typeSet: !!ev?.type.code && !!ev.type.state,
          basisSet: !!ex.contractBasisCode,
          proposalRequired: method?.requiresProposal ?? false,
          proposalState: ex.proposalState,
          ambiguousTaxonomies: ev?.taxonomies.filter((t) => t.state === "AMBIGUOUS").length ?? 0,
          blockingFaults: blocking.length,
        }),
      ]
    : [];
  const items = (cfg.checklist[ex.sourcingMethodCode] ?? []).filter((i) => i.retiredOn == null || i.retiredOn > on);
  const pFaults = method?.requiresProposal ? proposalFaults(items, ex.proposalAnswers, on) : [];
  const proposal = proposalView(ex.proposalState, ex.proposalRecord, items, ex.proposalAnswers, on);
  const openName = ex.approvalInstances.find((i) => i.status === "PENDING") ?? null;
  const approvedName = ex.approvalInstances.find((i) => i.status === "APPROVED") ?? null;
  const live = ex.status !== "CANCELLED";
  // The route as the request would make it: with the requester's own offices escalated,
  // or refused, and a step only they hold warned of (review #5; 6.3 re-review).
  const unitPath = pathTo(units as unknown as OrgUnit[], req.sectionUnitCode || req.requestingUnitCode, on).reverse().map((u) => u.code);
  const nameRoute =
    live && ctx && method?.requiresNameApproval
      ? today
        ? nameRouteForRequester(ctx.funder, method, Number(ex.estimatedValue.toString()), requesterHolding((code) => holdersFor(code, unitPath, roster, delegations, today), req.requestingPersonId))
        : { ...resolveNameApproval(ctx.funder, method, Number(ex.estimatedValue.toString())), refusal: null }
      : null;
  const requesterNotes = (nameRoute?.warnings ?? []).filter((w) => (w.code as string) === "REQUESTER_HOLDS_STEP").map((w) => w.messageEn);
  // Asked in draft or in preparation, and again after a refusal or withdrawal (ruling on BD-4).
  const canAskName = live && !!method?.requiresNameApproval && !openName && !approvedName;
  const nameBlocker = !canAskName
    ? null
    : (() => {
        const rf = nameRequestFault(ex.status, method, ex.approvalInstances, today);
        if (rf) return findingText(rf);
        const pf = nameRequestProposalFault(method!.requiresProposal, ex.proposalState);
        if (pf) return findingText(pf);
        if (nameRoute && nameRoute.nameState !== "RESOLVED") return NAME_STATE_TEXT[nameRoute.nameState];
        if (nameRoute?.refusal) return nameRoute.refusal;
        return null;
      })();
  const submitBlocker = !today ? findingText({ code: "TIME_ZONE_UNSET", level: "block" }) : pFaults.length ? `${pFaults.map(findingText).join(" ")} Edit the proposal first.` : null;
  // The move refuses where the configuration now judges the exercise differently from
  // its last save (review #2, BD-16): said here, before the button is pressed.
  const drift = draft && ev && issue ? determinationDrift(ex, determinationColumns(ev, issue, (c) => config.methods.find((m) => m.code === c)?.nameEn ?? "A method no longer configured", on)) : [];
  const prepList = [...(prepFaults.length ? [...prepFaults.filter((f) => f.code !== "BLOCKING_FAULTS"), ...blocking] : []), ...drift];
  const prepBlocker = prepList.length ? prepList.map(findingText).join(" ") : null;
  // Where a blocker has a place it is put right, the note links there (UX 15).
  const FIX_AT: Record<string, { href: string; label: string }> = {
    BASIS_NOT_SET: { href: `/sourcing/${ex.id}/edit`, label: "Choose a basis" },
    TYPE_NOT_SET: { href: `/sourcing/${ex.id}/edit`, label: "Choose a type" },
    METHOD_NOT_SET: { href: `/sourcing/${ex.id}/edit`, label: "Choose a method" },
    TAXONOMY_AMBIGUOUS: { href: `/sourcing/${ex.id}?tab=contract`, label: "Choose it" },
    PROPOSAL_NOT_REVIEWED: { href: `/sourcing/${ex.id}?tab=proposal`, label: "Open the Proposal tab" },
    JUSTIFICATION_REQUIRED: { href: `/sourcing/${ex.id}/edit`, label: "Edit the justification" },
    REASON_REQUIRED: { href: `/sourcing/${ex.id}/edit`, label: "Choose a reason" },
    COORDINATION_RECORD_REQUIRED: { href: `/sourcing/${ex.id}/edit`, label: "Record the meeting" },
    DETERMINATION_CHANGED: { href: `/sourcing/${ex.id}/edit`, label: "Edit and save" },
    REASONS_NOT_SET: { href: "/configuration/reference-data", label: "Reference data" },
  };

  const unavailable: [string, string | null][] = [
    ["Submit proposal", draft && method?.requiresProposal && ex.proposalState === "DRAFT" ? submitBlocker : null],
    ["Request name approval", canAskName ? nameBlocker : null],
    ["Move to preparation", draft ? prepBlocker : null],
  ];
  const notes = unavailable.filter((x): x is [string, string] => x[1] != null);
  const headerNote =
    notes.length === 0 ? null : (
      <span className="flex flex-col gap-0.5">
        {notes.map(([label, why]) => (
          <span key={label}>
            <span className="font-semibold text-ink-2">{label}:</span>{" "}
            {label === "Move to preparation"
              ? prepList.map((f, i) => (
                  <span key={i}>
                    {findingText(f)}
                    {FIX_AT[f.code] && (
                      <>
                        {" "}
                        <Link href={FIX_AT[f.code].href}>{FIX_AT[f.code].label}</Link>
                      </>
                    )}{" "}
                  </span>
                ))
              : why}
          </span>
        ))}
      </span>
    );

  const actions = (
    <>
      {draft && (
        <ButtonLink href={`/sourcing/${ex.id}/edit`} variant="secondary" size="sm">
          Edit
        </ButtonLink>
      )}
      {draft && method?.requiresProposal && ex.proposalState === "DRAFT" && <SubmitProposalDrawer id={ex.id} blocker={submitBlocker} />}
      {draft && method?.requiresProposal && ex.proposalState === "SUBMITTED" && <ReviewProposalDrawer id={ex.id} people={activePeople} today={today} />}
      {canAskName && <RequestNameApprovalDrawer id={ex.id} blocker={nameBlocker} />}
      {draft && (
        <MoveToPreparationDrawer
          id={ex.id}
          blocker={prepBlocker}
          summary={{
            fixed: [
              ["Method", methodName],
              ["Contract type", ev?.type.code ? (typeName(ev.type.code) ?? NOT_SET) : NOT_SET],
              ["Contract basis", config.bases.find((b) => b.code === ex.contractBasisCode)?.nameEn ?? NOT_SET],
              ["Requisition band", ex.requisitionRuleLabel ?? "Not checked"],
              ["Method band", ev ? REGIME_LABEL[ev.bands.regime] : NOT_SET],
              ["Contract terms band", ev?.bands.terms.band?.labelEn ?? (ev ? TERMS_STATE_TEXT[ev.bands.terms.state] : NOT_SET)],
              ...(ev?.bands.boundary.onBoundary ? [["At the boundary", boundarySentence(ev.bands.boundary.operator, String(ev.bands.boundary.boundaryValue), ev.bands.boundary.provenance)] as [string, string]] : []),
            ],
            notes: [
              ...(method?.requiresDossier ? ["The justification dossier is numbered now."] : []),
              ...(openName ? ["The name approval in progress stays open: it gates invitation, not preparation."] : method?.requiresNameApproval && !approvedName ? ["The name has not been sent for approval yet; it can be requested in preparation."] : []),
              ...(ex.restricted ? [`Restricted to the named participants — ${RESTRICTION_NOTE.toLowerCase()}.`] : []),
              ...(req.status === "APPROVED" ? [`This is the requisition's first exercise to move: ${req.reference} goes into sourcing.`] : []),
            ],
          }}
        />
      )}
      {ex.status !== "CANCELLED" && <CancelExerciseDrawer id={ex.id} />}
    </>
  );

  // Step suggestions: holders of the office for the requisition's unit and their delegates first.
  const suggestions = (roleCode: string | null) => {
    if (!roleCode || !today) return activePeople;
    const h = holdersFor(roleCode, unitPath, roster, delegations, today);
    const first = [...h.holderIds, ...h.delegates.map((d) => d.personId)];
    const top = activePeople.filter((p) => first.includes(p.value)).map((p) => ({ ...p, label: `${p.label} — ${h.holderIds.includes(p.value) ? "holds the office" : "delegate"}` }));
    return [...top, ...activePeople.filter((p) => !first.includes(p.value))];
  };

  const restricted = ex.restricted;
  const tabs = [
    {
      id: "classification",
      label: "Classification",
      icon: <SlidersIcon size={15} />,
      panel: <ClassificationPanel l={l} bands={bands} findings={ev ? ev.findings : ((ex.bandWarnings as unknown as Finding[]) ?? [])} live={!!ev} methodName={methodName} flags={flags} reasonName={decided ? (decided.justification?.reasonName ?? null) : (config.reasons.find((r) => r.code === ex.justificationReasonCode)?.nameEn ?? null)} />,
    },
    {
      id: "contract",
      label: "Contract type",
      icon: <FileIcon size={15} />,
      panel: (
        <ContractPanel
          l={l}
          decided={decided}
          live={ev ? { derivation: ev.derivation, type: ev.type, taxonomies: ev.taxonomies } : null}
          config={config}
          typeName={typeName}
          overriddenBy={ex.overriddenBy?.name ?? null}
          requesterType={typeName(req.contractTypeCode)}
          draft={draft}
          officeName={(c) => roster.offices.find((o) => o.code === c)?.nameEn ?? issue?.matrix.roles[c]?.nameEn ?? "An office no longer configured"}
        />
      ),
    },
    ...(flags?.requiresProposal
      ? [
          {
            id: "proposal",
            label: "Proposal",
            icon: <ClipboardIcon size={15} />,
            panel: (
              <Card className="overflow-hidden">
                <CardHeader
                  icon={<ClipboardIcon size={17} />}
                  title="Proposal"
                  subtitle={proposal.fromRecord ? "As submitted." : "The items the method asks for."}
                  actions={draft && ex.proposalState === "DRAFT" && items.length > 0 ? (
                    <span className="flex items-center gap-2">
                      <Badge tone="brand">{PROPOSAL_STATE_LABEL.DRAFT}</Badge>
                      <ProposalAnswersDrawer id={ex.id} items={items.map((i) => ({ key: i.key, label: i.labelEn, required: i.required }))} answers={Object.fromEntries(ex.proposalAnswers.map((a) => [a.itemKey, a.text]))} />
                    </span>
                  ) : ex.proposalState ? <Badge tone={ex.proposalState === "REVIEWED" ? "ok" : "info"}>{PROPOSAL_STATE_LABEL[ex.proposalState]}</Badge> : undefined}
                />
                {proposal.rows.length === 0 ? (
                  <EmptyState size="sm" title="No proposal items are configured" action={<ButtonLink href="/configuration/reference-data" size="sm">Add them</ButtonLink>}>
                    This method asks for a proposal, but no items are set for it.
                  </EmptyState>
                ) : (
                  <>
                    {ex.proposalState && ex.proposalState !== "DRAFT" && (
                      <p className="border-b border-line px-5 py-2.5 text-[12.5px] text-ink-3 sm:px-6">
                        {proposal.fromRecord ? "As submitted: the items and answers as they stood then." : "Submitted before the portal kept a copy of the items: shown with the items in force today."}
                      </p>
                    )}
                    <ol className="divide-y divide-line/70">
                      {proposal.rows.map((i) => (
                        <li key={i.key} className="flex flex-col gap-1 px-5 py-3 sm:px-6">
                          <span className="text-[13px] font-semibold text-ink">
                            {i.label} {!i.required && <span className="font-normal text-ink-3">· optional</span>}
                          </span>
                          <span className={i.answer.trim() ? "text-[13.5px] break-words whitespace-pre-line text-ink-2" : i.required ? "text-[13px] text-amber-800" : "text-[13px] text-ink-3"}>{i.answer.trim() ? i.answer : i.required ? "Empty: required before it can be submitted" : "Not answered"}</span>
                        </li>
                      ))}
                    </ol>
                  </>
                )}
                {(ex.proposalReviewer || ex.proposalReviewComment) && (
                  <CardBody className="border-t border-line">
                    <KeyValues
                      columns={2}
                      items={[
                        { label: "Reviewed by", value: ex.proposalReviewer ? `${ex.proposalReviewer.name} · recorded on behalf of, not signed` : "Not recorded" },
                        { label: "Reviewed on", value: formatDate(ex.proposalReviewedOn) },
                        { label: "Comment", value: ex.proposalReviewComment || "None" },
                      ]}
                    />
                  </CardBody>
                )}
              </Card>
            ),
          },
        ]
      : []),
    ...(flags?.requiresNameApproval
      ? [
          {
            id: "name",
            label: TERM.nameApproval,
            icon: <RouteIcon size={15} />,
            panel: (
              <NamePanel
                l={l}
                current={openName ?? latestFirst(ex.approvalInstances)[0] ?? null}
                preview={nameRoute && nameRoute.nameState === "RESOLVED" && !nameRoute.refusal ? nameRoute.chain.map((s) => ({ role: issue?.matrix.roles[s.roleCode]?.nameEn ?? "An office no longer configured", act: s.act })) : null}
                previewText={nameRoute && nameRoute.nameState !== "RESOLVED" ? NAME_STATE_TEXT[nameRoute.nameState] : (nameRoute?.refusal ?? null)}
                previewNotes={requesterNotes}
                suggestions={suggestions}
                today={today}
              />
            ),
          },
        ]
      : []),
    {
      id: "access",
      label: "Access",
      icon: <ShieldIcon size={15} />,
      count: ex.participants.length,
      panel: (
        <Card className="overflow-hidden">
          <CardHeader icon={<UsersIcon size={17} />} title="Named participants" subtitle={restricted ? `Restricted by its method. ${RESTRICTION_NOTE}.` : "Not restricted by its method."} actions={ex.status !== "CANCELLED" ? <AddParticipantDrawer id={ex.id} people={activePeople.filter((p) => !ex.participants.some((x) => x.personId === p.value))} /> : undefined} />
          <CardBody className="flex flex-col gap-4">
            {restricted && (
              <Callout tone="warn" title={RESTRICTION_NOTE}>
                Information on this exercise is classified. Nobody signs in yet, so the portal cannot hide it from people outside this list, nor log who looks at it. The list is recorded so that both attach when sign-in arrives.
              </Callout>
            )}
            {ex.participants.length === 0 ? (
              <EmptyState size="sm" title="Nobody named">
                {restricted ? "Name who may see it." : "Participants may still be named."}
              </EmptyState>
            ) : (
              <ul className="divide-y divide-line/70 rounded-2xl border border-line">
                {ex.participants.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                    <span className="min-w-0">
                      <span className="block text-[13.5px] font-semibold break-words text-ink">{p.person.name}</span>
                      <span className="block text-[12.5px] text-ink-3">{p.capacity || "Capacity not recorded"}</span>
                    </span>
                    {ex.status !== "CANCELLED" && <RemoveParticipantDrawer id={ex.id} participantId={p.id} name={p.person.name} />}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      ),
    },
    {
      id: "history",
      label: "History",
      icon: <ClockIcon size={15} />,
      count: history.total,
      panel: (
        <HistoryPanel
          entries={history.entries}
          total={history.total}
          timeZone={org.timeZone}
          personName={personName}
          typeName={typeName}
          methodName={(c) => config.methods.find((m) => m.code === c)?.nameEn ?? "A method no longer configured"}
          basisName={(c) => config.bases.find((b) => b.code === c)?.nameEn ?? null}
          reasonName={(c) => config.reasons.find((r) => r.code === c)?.nameEn ?? null}
        />
      ),
    },
  ];

  return (
    <>
      <RecordCrumb label={ex.reference} />
      <PageHeader
        eyebrow={<Link href="/sourcing">Sourcing</Link>}
        title={ex.title}
        badge={
          <>
            <Badge tone={EXERCISE_STATUS_TONE[ex.status]} dot>
              {EXERCISE_STATUS_LABEL[ex.status]}
            </Badge>
            {restricted && <Badge tone="warn">{`Restricted · ${RESTRICTION_NOTE.toLowerCase()}`}</Badge>}
          </>
        }
        subtitle={
          <>
            <span className="font-mono text-[12.5px]">{ex.reference}</span> · for <Link href={`/requisitions/${req.id}?tab=sourcing`}>{req.reference}</Link>
          </>
        }
        meta={[
          <span key="v" className="tabular-nums">{money(ex.estimatedValue)}</span>,
          methodName,
          decided?.contractType.nameEn ?? typeName(ex.contractTypeCode) ?? "Contract type not set",
          ex.regime ? REGIME_SHORT[ex.regime as Regime] : "Regime not determined",
        ]}
        actions={actions}
        actionsNote={headerNote}
        actionsNoteId={EXERCISE_NOTE_ID}
      />

      <div className="mb-6 flex flex-col gap-3">
        {ex.status !== "CANCELLED" && (
          <Callout tone="info" title="Sourcing runs outside the portal in this phase">
            The exercise is classified here — bands, method, contract type and basis. Documents, invitation, bids and evaluation are recorded outside the portal until the sourcing window is built.
          </Callout>
        )}
        {ex.status === "CANCELLED" && (
          <Callout tone="info" title="Cancelled">
            {ex.cancelReason || "No reason recorded."} {CANCELLED_ASSUMPTION}
          </Callout>
        )}
        {draft && !today && (
          <Callout tone="warn" title="The organisation's time zone is not set" action={<ButtonLink href="/configuration/organisation" size="sm">Set time zone</ButtonLink>}>
            Saving, reviewing and moving the exercise depend on today&apos;s date, which is not assumed to be UTC.
          </Callout>
        )}
        {draft && !issue && (
          <Callout tone="warn" title="No approval matrix is in force" action={<ButtonLink href="/configuration/approval-matrix" size="sm">Open the approval matrix</ButtonLink>}>
            The bands cannot be judged until an issue of the limits is in force.
          </Callout>
        )}
      </div>

      <Tabs initial={tab} label="Exercise" tabs={tabs} />
    </>
  );
}

// ------------------------------------------------------------ classification

function RouteList({ route }: { route: RouteSnap }) {
  return (
    <div className="flex flex-col gap-2">
      {route.chain.length > 0 ? (
        <ol className="flex flex-col gap-1.5">
          {route.chain.map((s, i) => (
            <li key={i} className="flex min-w-0 items-center gap-2 text-[13.5px]">
              <ActBadge act={s.act} />
              <span className="min-w-0 font-semibold break-words text-ink">{s.role}</span>
              <span className="text-ink-3">{ACT_LABEL[s.act] ?? "Acts"}</span>
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

function ClassificationPanel({
  l,
  bands,
  findings,
  live,
  methodName,
  flags,
  reasonName,
}: {
  l: LoadedExercise;
  bands: BandSnapshot | null;
  findings: Finding[];
  live: boolean;
  methodName: string;
  flags: { requiresJustification: boolean; requiresDossier: boolean; requiresCoordinationRecord: boolean; requiresFreshSourcing: boolean } | null;
  reasonName: string | null;
}) {
  const ex = l.ex;
  if (!bands) {
    return (
      <Card>
        <EmptyState title="Not determined">The bands are determined when the exercise is saved under an issue of the limits in force.</EmptyState>
      </Card>
    );
  }
  const blocking = findings.filter((f) => f.level === "block");
  const others = findings.filter((f) => f.level !== "block");
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader icon={<SlidersIcon size={17} />} title="Three band families" subtitle={`Determined ${formatDate(ex.determinedAt)} under ${bands.matrixLabel}.`} />
        <CardBody className="flex flex-col gap-6">
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
          <KeyValues
            columns={2}
            className="border-t border-line pt-6"
            items={[
              { label: "Value", value: <span className="tabular-nums">{money(ex.estimatedValue)}</span> },
              ...(bands.boundary.onBoundary
                ? [
                    {
                      label: "At the boundary",
                      value: (
                        <span className="flex flex-col items-start gap-1">
                          <span>{boundarySentence(bands.boundary.operator, String(bands.boundary.value), bands.boundary.provenance)}</span>
                          <ProvenanceBadge value={bands.boundary.provenance} />
                          {bands.boundary.source && <span className="text-[12.5px] text-ink-3">{bands.boundary.source}</span>}
                          <span className="text-[12.5px] text-ink-3">
                            Appointment rule: {boundarySide(bands.appointment.boundaryOperator, disagreesAtBoundary(ex.bandWarnings as never, "rule"))}. Terms band:{" "}
                            {boundarySide(bands.terms.boundaryOperator, disagreesAtBoundary(ex.bandWarnings as never, "terms"))}.
                          </span>
                        </span>
                      ),
                    },
                  ]
                : []),
            ]}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader icon={<RouteIcon size={17} />} title="Method and who approves the appointment" subtitle={methodName} />
        <CardBody className="flex flex-col gap-5">
          <KeyValues
            columns={2}
            items={[
              { label: "Method", value: ex.proposedMethodCode && ex.proposedMethodCode !== ex.sourcingMethodCode ? `${methodName} · overridden` : ex.proposedMethodCode ? `${methodName} · as proposed` : methodName },
              ...(ex.methodReason ? [{ label: "Why this method", value: ex.methodReason }] : []),
              ...(ex.externalRouteNote ? [{ label: "What the external body decided", value: ex.externalRouteNote }] : []),
              ...(flags?.requiresJustification || flags?.requiresDossier ? [{ label: "Justification", value: ex.justificationText || "Not recorded" }] : []),
              ...(flags?.requiresDossier
                ? [
                    { label: "Reason", value: reasonName ?? "Not recorded" },
                    { label: "Dossier reference", value: ex.dossierReference ? <span className="font-mono text-[13px]">{ex.dossierReference}</span> : "Numbered when it moves into preparation" },
                    { label: "Supporting evidence", value: <span className="flex flex-col gap-1"><span>{ex.evidenceNote || "No note"}</span><Chip tone="warn">Not attached</Chip></span> },
                  ]
                : []),
              ...(flags?.requiresCoordinationRecord
                ? [
                    { label: "Emergency trigger", value: ex.emergencyTrigger || "Not recorded" },
                    { label: "Coordination meeting", value: ex.coordinationMeetingOn ? formatDate(ex.coordinationMeetingOn) : "Not recorded" },
                    { label: "Attended by", value: ex.coordinationAttendees || "Not recorded" },
                    { label: "Scope fixed", value: <span className="flex flex-col gap-1"><span>{ex.coordinationScopeNote || "No note"}</span><Chip tone="warn">Scope document not attached</Chip></span> },
                    { label: "Bill of quantities", value: ex.bqReference ?? "Not recorded" },
                  ]
                : []),
              ...(flags && !flags.requiresFreshSourcing ? [{ label: "Parent contract", value: <span className="flex flex-col gap-1"><span>{ex.parentContractRef ?? "Not recorded"}</span><Chip tone="warn">Capacity not tracked</Chip></span> }] : []),
            ]}
          />
          <div className="border-t border-line pt-5">
            <p className="mb-2 text-[12px] font-semibold text-ink-3">Approval of the appointment</p>
            <RouteList route={bands.appointment} />
          </div>
        </CardBody>
      </Card>

      {(blocking.length > 0 || others.length > 0) && (
        <Card>
          <CardHeader icon={<ShieldIcon size={17} />} title={live ? "Checks, as they stand today" : "Checks, as recorded"} subtitle={blocking.length ? "What must be put right before documents go into preparation, and what is recorded with it." : "Recorded with the exercise."} />
          <CardBody className="flex flex-col gap-2">
            {[...blocking, ...others].map((f, i) => (
              <Callout key={i} tone={tone(f.level)}>
                {findingText(f)}
              </Callout>
            ))}
          </CardBody>
        </Card>
      )}
    </div>
  );
}

// ------------------------------------------------------------- contract type

const behaviourText = (v: BehaviourValue, officeName: (c: string) => string, key: string) => {
  if (v == null) return <span className="text-ink-4">{NOT_SET}</span>;
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) return key === "administratorRoleCodes" ? v.map(officeName).join(", ") : v.join(", ");
  return key === "claimsApprovalCommitteeCode" ? officeName(v) : v;
};

function ContractPanel({
  l,
  decided,
  live,
  config,
  typeName,
  overriddenBy,
  requesterType,
  draft,
  officeName,
}: {
  l: LoadedExercise;
  decided: ClassificationSnapshot | null;
  live: { derivation: { state: string; code: string | null; sharePct: string | null }; type: { state: string | null; code: string | null }; taxonomies: { taxonomyCode: string; state: string; valueCode: string | null; candidates: string[] }[] } | null;
  config: Awaited<ReturnType<typeof evaluationContext>>["cfg"]["config"];
  typeName: (c: string | null) => string | null;
  overriddenBy: string | null;
  requesterType: string | null;
  draft: boolean;
  officeName: (code: string) => string;
}) {
  const ex = l.ex;
  const type = config.types.find((t) => t.code === ex.contractTypeCode) ?? null;
  // Once decided, the record's values and office names; before, the type in force (review #6).
  const profile = profileRows(decided, type ? behaviourProfile(type) : null, officeName);
  const state = (decided?.contractType.state ?? ex.contractTypeState) as keyof typeof TYPE_STATE_LABEL | null;
  const derivationState = (decided?.contractType.derivationState ?? live?.derivation.state ?? ex.derivationState) as keyof typeof DERIVATION_TEXT | null;
  const derivedName = decided?.contractType.derivedName ?? typeName(live?.derivation.code ?? ex.derivedContractTypeCode);
  const basis = decided?.basis ?? config.bases.find((b) => b.code === ex.contractBasisCode) ?? null;
  const tax = (code: string) => config.taxonomies.find((t) => t.code === code);
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader icon={<FileIcon size={17} />} title="Contract type" subtitle={state ? TYPE_STATE_LABEL[state] : NOT_SET} />
        <CardBody className="flex flex-col gap-5">
          <KeyValues
            columns={2}
            items={[
              { label: "Contract type", value: decided?.contractType.nameEn ?? typeName(ex.contractTypeCode) ?? NOT_SET },
              { label: "Derived from the scope", value: derivationState === "DERIVED" ? (derivedName ?? NOT_SET) : derivationState ? DERIVATION_TEXT[derivationState] : NOT_SET },
              ...(state && state !== "DERIVED" ? [{ label: "Why this type", value: ex.contractTypeOverrideReason || "Not recorded" }, { label: "Decided by", value: overriddenBy ? `${overriddenBy} · recorded on behalf of, not signed` : "Not recorded" }] : []),
              { label: "Largest deliverable's share", value: ex.dominantSharePct && Number(ex.dominantSharePct.toString()) < 100 ? `${pct(ex.dominantSharePct.toString())}%` : "One deliverable" },
              {
                label: TERM.mixedThreshold,
                value: decided ? (decided.policy.dominanceSharePct ? `Above ${pct(decided.policy.dominanceSharePct)}% · as recorded` : "Not set: no default for mixed scope") : config.policy.dominanceSharePct ? `Above ${pct(config.policy.dominanceSharePct)}%` : "Not set: no default for mixed scope",
              },
              { label: "Requester's indication", value: requesterType ?? "None" },
              { label: "Contract basis", value: basis ? `${basis.nameEn}${basis.standardFormLabel ? ` · ${basis.standardFormLabel}` : ""}` : "Not chosen: required before documents go into preparation" },
            ]}
          />
          {ex.scopeParts.length > 0 && (
            <ul className="flex flex-col gap-1.5 border-t border-line pt-4 text-[13px]">
              {ex.scopeParts.map((p) => (
                <li key={p.id} className="flex flex-wrap justify-between gap-2">
                  <span className="min-w-0 break-words text-ink-2">
                    {DELIVERABLE_LABEL[p.deliverableKind as DeliverableKind]}
                    {p.description ? ` · ${p.description}` : ""}
                  </span>
                  <span className="tabular-nums text-ink">{money(p.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader icon={<SlidersIcon size={17} />} title="What the type drives" subtitle={decided ? "As recorded when it moved into preparation." : "Enforced where each behaviour lives, in later modules."} />
        <CardBody>
          {profile ? (
            <div className="flex flex-col gap-4">
              <KeyValues columns={2} items={profile.map((b) => ({ label: BEHAVIOUR_LABEL[b.key], value: behaviourText(b.value, b.offices, b.key) }))} />
              {!decided && type && profile.some((b) => b.value == null) && (
                <p className="border-t border-line pt-4 text-[13px] text-ink-2">
                  {profile.filter((b) => b.value == null).length} of 12 behaviours are not set for {type.nameEn}.{" "}
                  <Link href="/configuration/reference-data">Set them under Reference data, Contract types, Behaviours of {type.nameEn}</Link>.
                </p>
              )}
            </div>
          ) : (
            <EmptyState size="sm" title="No contract type yet">Choose or derive one to see its behaviours.</EmptyState>
          )}
        </CardBody>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader icon={<ClipboardIcon size={17} />} title="Other classifications" subtitle="Derived from the type and basis rather than asked again. The basis itself is always chosen." />
        {decided ? (
          <ul className="divide-y divide-line/70">
            {decided.taxonomies.map((t) => (
              <li key={t.taxonomy} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 sm:px-6">
                <span className="text-[13.5px] font-semibold text-ink">{t.taxonomy}</span>
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-[13.5px] text-ink-2">{t.value ?? "—"}</span>
                  <Chip tone={t.state === "NOT_MAPPED" ? "warn" : t.state === "CHOSEN" ? "info" : "ok"}>{TAXONOMY_STATE_LABEL[t.state]}</Chip>
                </span>
              </li>
            ))}
          </ul>
        ) : live && live.taxonomies.length > 0 ? (
          <ul className="divide-y divide-line/70">
            {live.taxonomies.map((t) => {
              const tx = tax(t.taxonomyCode);
              const valueName = (c: string) => tx?.values.find((v) => v.code === c)?.nameEn ?? "A value no longer configured";
              return (
                <li key={t.taxonomyCode} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 sm:px-6">
                  <span className="text-[13.5px] font-semibold text-ink">{tx?.nameEn ?? "A classification no longer configured"}</span>
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[13.5px] text-ink-2">{t.valueCode ? valueName(t.valueCode) : t.state === "AMBIGUOUS" ? t.candidates.map(valueName).join(" or ") : "—"}</span>
                    <Chip tone={t.state === "AMBIGUOUS" || t.state === "NOT_MAPPED" ? "warn" : t.state === "CHOSEN" ? "info" : "ok"}>{TAXONOMY_STATE_LABEL[t.state as keyof typeof TAXONOMY_STATE_LABEL]}</Chip>
                    {draft && t.state === "AMBIGUOUS" && tx && <ChooseTaxonomyDrawer id={ex.id} taxonomyCode={t.taxonomyCode} taxonomy={tx.nameEn} candidates={t.candidates.map((c) => ({ value: c, label: valueName(c) }))} />}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState size="sm" title="No classifications configured">Other classifications and their mappings are set under Reference data.</EmptyState>
        )}
      </Card>
    </div>
  );
}

// ------------------------------------------------------------- name approval

function NamePanel({
  l,
  current,
  preview,
  previewText,
  previewNotes,
  suggestions,
  today,
}: {
  l: LoadedExercise;
  current: LoadedExercise["ex"]["approvalInstances"][number] | null;
  preview: { role: string; act: string }[] | null;
  previewText: string | null;
  /// Said before the route exists: a step only the requester holds (REQUESTER_HOLDS_STEP).
  previewNotes: string[];
  suggestions: (roleCode: string | null) => { value: string; label: string }[];
  today: string | null;
}) {
  const ex = l.ex;
  const inst = current;
  const earlier = latestFirst(ex.approvalInstances).filter((i) => i.id !== current?.id);
  return (
    <div className="flex flex-col gap-6">
      <Callout tone="info" title="Name approval recorded; not enforced in this phase">
        Invitation happens outside the portal in this phase, so the portal records the name approval but cannot hold an invitation back until it is given.
      </Callout>
      {!inst ? (
        <Card>
          <CardHeader icon={<RouteIcon size={17} />} title={TERM.nameApproval} subtitle="Not requested yet." />
          <CardBody className="flex flex-col gap-3">
            {preview ? (
              <>
                <p className="text-[13.5px] text-ink-2">If it were requested today, the approval matrix would route it:</p>
                <ol className="flex flex-col gap-1.5">
                  {preview.map((s, i) => (
                    <li key={i} className="flex items-center gap-2 text-[13.5px]">
                      <ActBadge act={s.act} />
                      <span className="font-semibold text-ink">{s.role}</span>
                      <span className="text-ink-3">{ACT_LABEL[s.act]}</span>
                    </li>
                  ))}
                </ol>
                {previewNotes.map((n) => (
                  <Callout key={n} tone="warn">{n}</Callout>
                ))}
              </>
            ) : (
              <p className="text-[13.5px] text-ink-2">{previewText ?? "Requested once the exercise is ready."}</p>
            )}
          </CardBody>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <CardHeader
            icon={<RouteIcon size={17} />}
            title={TERM.nameApproval}
            subtitle={`Requested ${formatOrgDay(inst.openedAt, l.org.timeZone)} under ${inst.matrixLabel ?? "an issue no longer on file"}.`}
            actions={<Badge tone={inst.status === "APPROVED" ? "ok" : inst.status === "PENDING" ? "brand" : "warn"}>{nameRouteLabel(inst.status, inst.warnings)}</Badge>}
          />
          {((inst.warnings as { level: string; messageEn: string }[]) ?? []).length > 0 && (
            <CardBody className="flex flex-col gap-2">
              {(inst.warnings as { level: string; messageEn: string }[]).map((w, i) => (
                <Callout key={i} tone={tone(w.level)}>
                  {w.messageEn}
                </Callout>
              ))}
            </CardBody>
          )}
          {inst.status === "PENDING" && <p className="border-t border-line px-5 py-2.5 text-[12.5px] text-ink-3 sm:px-6">Steps are decided in order: each waits for the one before it.</p>}
          <ol className="divide-y divide-line/70 border-t border-line">
            {inst.steps.map((s) => {
              const earlierDone = inst.steps.filter((x) => x.sequence < s.sequence).every((x) => x.decision === "DONE");
              const blocker = inst.status !== "PENDING" || s.decision !== "PENDING" ? null : !today ? DECIDER_FAULT_TEXT.TIME_ZONE_UNSET : null;
              return (
                <li key={s.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
                  <div className="flex min-w-0 items-start gap-3">
                    <ActBadge act={s.act} />
                    <div className="min-w-0">
                      <div className="font-semibold break-words text-ink">
                        {s.roleLabel} <span className="font-normal text-ink-3">· {ACT_LABEL[s.act]}</span>
                      </div>
                      <div className="text-[12.5px] text-ink-2">
                        {s.decision === "PENDING"
                          ? inst.status === "PENDING"
                            ? `${earlierDone ? "Awaiting a decision." : "Waits for the step before."}${s.nonDelegable ? " Cannot be delegated." : ""}`
                            : "Not decided: the route closed."
                          : `${DECISION_LABEL[s.decision]} · ${s.decidedByName ?? "Not recorded"} · recorded on behalf of, not signed · ${formatDate(s.decidedOn)}${s.delegation ? ` · under delegation from ${s.delegation.fromPerson.name}` : ""}${s.reason ? ` · “${s.reason}”` : ""}`}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                    {s.decision !== "PENDING" && <Badge tone={s.decision === "DONE" ? "ok" : "err"}>{DECISION_LABEL[s.decision]}</Badge>}
                    {inst.status === "PENDING" && s.decision === "PENDING" && earlierDone && (
                      <NameDecisionDrawer id={ex.id} stepId={s.id} roleLabel={s.roleLabel} act={ACT_LABEL[s.act]} done={ACT_DONE_LABEL[s.act] ?? "Done"} people={suggestions(s.roleCode)} today={today} blocker={blocker} />
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>
      )}
      {earlier.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader icon={<ClockIcon size={17} />} title="Earlier routes" subtitle="Kept on record." />
          <ul className="divide-y divide-line/70">
            {earlier.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2 px-5 py-3 text-[13px] sm:px-6">
                <Badge tone="neutral">{nameRouteLabel(e.status, e.warnings)}</Badge>
                <span className="text-ink-2">
                  Requested {formatOrgDay(e.openedAt, l.org.timeZone)} · {e.steps.map((s) => s.roleLabel).join(" → ")}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

// ------------------------------------------------------------------- history

const ENTITY_LABEL: Record<string, string> = {
  SourcingExercise: "Exercise",
  ExerciseScopePart: "Scope",
  ExerciseProposalAnswer: "Proposal item",
  ExerciseTaxonomyValue: "Classification",
  ExerciseParticipant: "Participant",
  ApprovalInstance: "Name approval",
  ApprovalStep: "Name approval step",
  Requisition: "Requisition",
};
const ACTION_LABEL = { CREATE: "Created", UPDATE: "Changed", DELETE: "Removed" } as const;
const FIELD_NAME: Record<string, string> = {
  sourcingMethodCode: "Method",
  proposedMethodCode: "Proposed method",
  contractTypeCode: "Contract type",
  derivedContractTypeCode: "Derived type",
  contractBasisCode: "Contract basis",
  estimatedValue: "Value",
  regime: "Method band",
  termsState: "Terms band",
  termsBandKey: "Terms set",
  appointmentRuleKey: "Appointment rule",
  appointmentState: "Appointment route",
  boundaryOperator: "Boundary rule",
  boundaryValue: "Where the bands meet",
  approvalMatrixIssue: "Approval matrix issue",
  onBoundary: "On the boundary",
  boundaryRuled: "Boundary ruled",
  boundaryProvenance: "Boundary ruling",
  derivationState: "Derivation",
  contractTypeState: "How the type was reached",
  deliverableKind: "Delivers",
  proposalState: "Proposal",
  justificationReasonCode: "Reason",
  requisitionRuleKey: "Requisition rule",
  taxonomy: "Classification",
  pick: "How it was reached",
  dominantSharePct: "Largest deliverable's share",
  appointmentRule: "Rule that approves the appointment",
  termsBand: "Contract terms band",
  classificationRecorded: "Classification recorded",
  proposalReviewComment: "Review comment",
  methodReason: "Why this method",
  contractTypeOverrideReason: "Why this type",
  overriddenByPersonId: "Type decided by",
  reviewedBy: "Reviewed by",
  recordedOnBehalf: "Recorded",
};
const MONEY = new Set(["estimatedValue", "amount", "boundaryValue"]);

function HistoryPanel({
  entries,
  total,
  timeZone,
  personName,
  typeName,
  methodName,
  basisName,
  reasonName,
}: {
  entries: Awaited<ReturnType<typeof exerciseHistory>>["entries"];
  total: number;
  timeZone: string | null;
  personName: (id: string | null) => string | null;
  typeName: (c: string | null) => string | null;
  methodName: (c: string) => string;
  basisName: (c: string) => string | null;
  reasonName: (c: string) => string | null;
}) {
  const read = (field: string, value: string | null): string => {
    if (value == null || value === "") return "—";
    if (field === "dominantSharePct") return Number(value) >= 100 ? "One deliverable" : `${pct(value)}%`;
    if (field === "contractBasisCode") return basisName(value) ?? "A basis no longer configured";
    if (field === "justificationReasonCode") return reasonName(value) ?? "A reason no longer configured";
    if (field === "recordedOnBehalf") return "on behalf of, not signed";
    if (field === "status") return EXERCISE_STATUS_LABEL[value as keyof typeof EXERCISE_STATUS_LABEL] ?? (value === "SOURCING" ? "Sourcing" : value === "APPROVED" ? "Approved" : nameRouteLabel(value, null));
    if (field === "sourcingMethodCode" || field === "proposedMethodCode") return methodName(value);
    if (field === "contractTypeCode" || field === "derivedContractTypeCode") return typeName(value) ?? "—";
    if (field === "regime") return REGIME_LABEL[value as Regime] ?? "—";
    if (field === "deliverableKind") return DELIVERABLE_LABEL[value as DeliverableKind] ?? "—";
    if (field === "proposalState") return PROPOSAL_STATE_LABEL[value as keyof typeof PROPOSAL_STATE_LABEL] ?? "—";
    if (field === "contractTypeState") return TYPE_STATE_LABEL[value as keyof typeof TYPE_STATE_LABEL] ?? "—";
    if (field === "derivationState") return DERIVATION_TEXT[value as keyof typeof DERIVATION_TEXT] ?? "—";
    if (field === "termsState") return value === "APPLIES" ? "Applies" : (TERMS_STATE_TEXT[value as keyof typeof TERMS_STATE_TEXT] ?? "—");
    if (field === "appointmentState") return APPOINTMENT_STATE_TEXT[value as keyof typeof APPOINTMENT_STATE_TEXT] ?? "—";
    if (field === "boundaryOperator") return OPERATOR_LABEL[value as "GT"] ?? "—";
    if (field === "boundaryProvenance") return value === "STATED" ? "Stated" : value === "OBSERVED" ? "Observed" : "Assumed";
    if (field === "pick") return TAXONOMY_STATE_LABEL[value as "DERIVED"] ?? "—";
    if (field === "decision") return DECISION_LABEL[value as keyof typeof DECISION_LABEL] ?? "—";
    if (field === "overriddenByPersonId" || field === "proposalReviewerPersonId") return personName(value) ?? "—";
    if (MONEY.has(field) && /^-?\d+(\.\d+)?$/.test(value)) return formatMoney(parseSen(value));
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return formatDate(value);
    if (value === "true" || value === "yes") return "Yes";
    if (value === "false" || value === "no") return "No";
    return value;
  };
  // Keys the page cannot name are configuration: left out, as are ids (UX 4).
  const NAMED_KEYS = new Set(["sourcingMethodCode", "proposedMethodCode", "contractTypeCode", "derivedContractTypeCode", "contractBasisCode", "justificationReasonCode"]);
  const shown = (field: string, ch: { before: string | null; after: string | null }, action: string) =>
    (!/(Code|Key)$/.test(field) || NAMED_KEYS.has(field)) &&
    (!/Id$/.test(field) || field === "overriddenByPersonId" || field === "proposalReviewerPersonId") &&
    // A creation lists what it was given, not every empty field.
    (action !== "CREATE" || (ch.after != null && ch.after !== "" && ch.after !== "false")) &&
    (action !== "UPDATE" || ch.before !== ch.after);
  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<ClockIcon size={17} />}
        title="History"
        subtitle={total > entries.length ? `Showing the latest ${entries.length} of ${total} changes. Nobody is signed in, so no change is attributed.` : "Every change to this exercise and what is under it. Nobody is signed in, so no change is attributed."}
        divided={entries.length === 0}
      />
      {entries.length === 0 ? (
        <EmptyState size="sm" title="No recorded changes">
          Changes made through the portal appear here. Records loaded directly have no trail.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line/70">
          {entries.map((e) => (
            <li key={e.id} className="flex flex-col gap-1.5 px-5 py-3 sm:px-6">
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                <Badge tone={e.action === "CREATE" ? "ok" : e.action === "DELETE" ? "err" : "info"}>{ACTION_LABEL[e.action]}</Badge>
                <span className="font-semibold text-ink">{ENTITY_LABEL[e.entity] ?? "Record"}</span>
                <span className="min-w-0 truncate text-ink-2">{e.entityLabel}</span>
                <span className="flex-1" />
                <span className="text-[12px] text-ink-3">{formatOrgDay(e.at, timeZone)}</span>
              </div>
              {e.changes.length > 0 && (
                <ul className="text-[12.5px] break-words text-ink-3">
                  {e.changes.filter((ch) => shown(ch.field, ch, e.action)).map((ch) => (
                    <li key={ch.field}>
                      {FIELD_NAME[ch.field] ?? fieldLabel(ch.field)}: {e.action === "UPDATE" && <>{read(ch.field, ch.before)} → </>}
                      <span className="text-ink-2">{read(ch.field, e.action === "DELETE" ? ch.before : ch.after)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {e.reason && <p className="text-[12.5px] text-ink-3">Reason: {e.reason}</p>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

