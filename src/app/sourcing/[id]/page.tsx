import { ActedBy } from "@/components/attribution";
import { routeActed } from "@/lib/auth/attribution-read";
import { exerciseEvidence } from "@/lib/documents/evidence";
import { historyEntityLabel } from "@/lib/audit/entity-labels";
import { DOCUMENT_ENTITY_LABEL } from "@/lib/documents/audit-view";
import { SCOPE_ENTITY_LABEL } from "@/lib/scope/audit-view";
import { attachmentFacts } from "@/lib/documents/repo";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AwardIcon, ClipboardIcon, ClockIcon, FileIcon, GlobeIcon, InboxIcon, RouteIcon, ScaleIcon, ShieldIcon, SlidersIcon, ToolsIcon, UsersIcon } from "@/components/icons";
import { RecordCrumb } from "@/components/shell/record-crumb";
import { Tabs } from "@/components/tabs";
import { ActBadge, actLabel, isMandatoryAct } from "@/components/ui/act";
import { EscalateDrawer } from "@/app/approvals/editors";
import { earlierSteps, returnTargetBeforeNext, type RejectionKind } from "@/lib/authority/rejection";
import { routeCoreText } from "@/lib/authority/core-routing-labels";
import { appliedText, CHOICE_WHY_TEXT, ifRejectedText, REJECTION_KIND_LABEL } from "@/lib/authority/rejection-labels";
import { Badge, Chip, SulitValue } from "@/components/ui/badge";
import { isSulitField } from "@/lib/sulit-fields";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { KeyValues } from "@/components/ui/stat";
import { fieldLabel } from "@/lib/audit/diff";
import { routeTone, stepTone } from "@/lib/ui/status-tone";
import { dayToDate } from "@/lib/dates";
import { formatDate, formatOrgDateTime, formatOrgDay } from "@/lib/format";
import { ACT_DONE_LABEL, ACT_LABEL } from "@/lib/labels";
import { exerciseRoutesOf, historyFieldHidden, historyRouteLabel, latestFirst, nameRequestFault, nameRouteForRequester, nameRouteLabel, nameRoutesOf, requesterHolding, resolveNameApproval, tenderingRoutesOf, windowChangeRoutesOf } from "@/lib/method/approval";
import { determinationDrift } from "@/lib/method/drift";
import { evaluateExercise } from "@/lib/method/evaluate";
import { dossierEvidenceMissing } from "@/lib/method/justification";
import { transitionFault } from "@/lib/method/exercise";
import {
  APPOINTMENT_STATE_TEXT,
  boundarySentence,
  CANCELLED_ASSUMPTION,
  TERM,
  DELIVERABLE_LABEL,
  DERIVATION_TEXT,
  EXERCISE_STATUS_LABEL,
  EXERCISE_STATUS_TONE,
  findingText,
  findingTextFor,
  findingsShownTo,
  NAME_STATE_TEXT,
  NOT_SET,
  PROPOSAL_STATE_LABEL,
  REGIME_LABEL,
  REGIME_SHORT,
  TAXONOMY_STATE_LABEL,
  TERMS_STATE_TEXT,
  TYPE_STATE_LABEL,
} from "@/lib/method/labels";
import { nameRequestProposalFault, proposalFaults, proposalView } from "@/lib/method/proposal";
import { draftOf, evaluationContext, exerciseHistory, loadExercise, type LoadedExercise } from "@/lib/method/repo";
import { determinationColumns, isBandSnapshot, isClassificationSnapshot } from "@/lib/method/snapshot";
import type { DeliverableKind, Finding, Regime } from "@/lib/method/types";
import { formatMoney, parseSen } from "@/lib/money";
import { pathTo } from "@/lib/organisation/structure";
import type { OrgUnit } from "@/lib/organisation/types";
import { db } from "@/lib/db";
import { loadDelegations, loadRoster } from "@/lib/people/load";
import { holdersFor } from "@/lib/requisition/holders";
import { instrumentFor } from "@/lib/award/instrument";
import { exerciseCancelBlockedBy } from "@/lib/award/status";
import { AWARD_STATUS_LABEL, AWARD_STATUS_TONE, awardFindingText, DOSSIER_EVIDENCE_NEEDED, INSTRUMENT_SHORT } from "@/lib/award/labels";
import { loadAwardPolicy } from "@/lib/award/repo";
import { ENTITY as TENDER_ENTITY } from "@/lib/tender-docs/audit-view";
import { awardOpenRefusal, evaluationFindings, exerciseOpenForAward } from "@/lib/award/gate";
import type { WindowGate } from "@/lib/window/gate";
import { WINDOW_ENTITIES } from "@/lib/window/audit-view";
import { BID_ENTITIES, BID_ENTITY_LABEL } from "@/lib/bids/audit-view";
import { OPENING_ENTITIES, OPENING_ENTITY_LABEL } from "@/lib/opening/audit-view";
import { EVALUATION_ENTITY_LABEL } from "@/lib/evaluation/audit-view";
import { bidFindingText } from "@/lib/bids/labels";
import { bidGate } from "@/lib/bids/repo";
import { openingGateFaults } from "@/lib/opening/award-gate";
import { loadOpeningGate } from "@/lib/opening/gate-read";
import { loadEvaluationGate } from "@/lib/evaluation/gate-read";
import { EVALUATION_SECTIONS, evaluationSectionOf, loadEvaluationTab } from "./evaluation/workspace";
import { openingFindingText } from "@/lib/opening/labels";
import { loadBids } from "./bids/workspace";
import { BIDS_SECTIONS, bidsSectionOf, loadOpening, loadSchedule } from "./opening/workspace";
import { PHASE_LABEL, PHASE_TONE } from "@/lib/window/labels";
import { closingVerb, isPublished } from "@/lib/window/phase";
import { readWindowGate } from "@/lib/window/repo";
import { nameListTab } from "@/lib/window/read";
import { exerciseMatters } from "@/lib/award/repo";
import { RouteSteps } from "./route-steps";
import { tenderingRouteLabel, trailLabel } from "@/lib/tender-docs/labels";
import { tenderingStepperSteps } from "@/lib/tender-docs/route-flow";
import { DETAILS_LOCKED_TEXT, detailsFault } from "@/lib/method/details";
import { exerciseFlow, flowShape } from "@/lib/method/lifecycle";
import { loadOverviewReads } from "@/lib/method/overview-read";
import { activeTabOf } from "@/lib/method/overview-tab";
import { windowPathOf } from "@/lib/window/publish";
import type { PackKind } from "@/lib/tender-docs/types";
import type { AwardStatus, InstrumentKind } from "@/lib/award/types";
import { DECISION_LABEL, DECIDER_FAULT_TEXT, OPERATOR_LABEL } from "@/lib/requisition/labels";

import {
  AddParticipantDrawer,
  CancelExerciseDrawer,
  CiteNameDecisionDrawer,
  EXERCISE_NOTE_ID,
  MoveToPreparationDrawer,
  NameChoiceDrawer,
  NameDecisionDrawer,
  ProposalAnswersDrawer,
  RemoveParticipantDrawer,
  RequestNameApprovalDrawer,
  ReviewProposalDrawer,
  SubmitProposalDrawer,
} from "../editors";
import { DocumentsWorkspace } from "./documents/workspace";
import { invitationSectionOf, invitationSectionsFor, loadInvitation } from "./window/workspace";
import { scopeSectionFacts } from "@/lib/scope/read";
import { ALL_SCOPE_SECTIONS, scopeSectionOf, visibleScopeSections } from "@/lib/scope/sections";
import { ScopeWorkspace } from "./scope/workspace";
import { money, OverviewPanel, pct, tone } from "./overview";
import type { ReactNode } from "react";
import { requireStaff } from "@/app/_auth/actor";
import { exerciseIsHidden, sulitExerciseValue } from "@/app/_auth/sulit";
import { sulitWithheld, type Sulit } from "@/lib/auth/sulit-access";
import { estimateCustodyForHistory } from "@/lib/opening/read";
import { namingOthersRefusal } from "@/lib/auth/sulit-store";

export const dynamic = "force-dynamic";

const flagsNeedName = (code: string, methods: { code: string; requiresNameApproval: boolean }[]) => methods.find((m) => m.code === code)?.requiresNameApproval ?? false;

export default async function ExercisePage(props: PageProps<"/sourcing/[id]">) {
  const actor = await requireStaff();
  const [{ id }, { tab: asked, section }] = await Promise.all([props.params, props.searchParams as Promise<{ tab?: string; section?: string }>]);
  // FR-MTD-007: a restricted exercise the reader is not named on reads as one that does not exist, and the attempt is logged.
  if (await exerciseIsHidden(actor, id)) notFound();
  const l = await loadExercise(actor.organisationId, id);
  if (!l) notFound();
  const { ex, req, org } = l;
  // The department estimate is SULIT: judged for this reader, once, and the access logged (ADR 0034 D14). Everything on the page that shows the
  // figure takes this, so a withheld value is never read from `ex` below.
  const estimate = await sulitExerciseValue(actor, { id: ex.id, reference: ex.reference }, "estimatedValue", () => money(ex.estimatedValue));
  // X-9 (6.5): the award gate reads the window's phase now and any pending change.
  const windowGateNow = await readWindowGate(ex, org.timeZone);
  const today = org.today;
  const on = today ? dayToDate(today) : new Date();
  const draft = ex.status === "DRAFT";

  const [{ issue, cfg, ctx }, history, people, roster, delegations, units, awards, awardPolicy] = await Promise.all([
    evaluationContext(org, req, ex),
    exerciseHistory(l),
    db.person.findMany({ where: { organisationId: org.id }, orderBy: { name: "asc" }, select: { id: true, name: true, isActive: true } }),
    loadRoster(actor.organisationCode),
    loadDelegations(actor.organisationCode),
    db.orgUnit.findMany({ where: { organisationId: org.id } }),
    db.award.findMany({ where: { exerciseId: ex.id }, orderBy: { createdAt: "desc" }, select: { id: true, reference: true, awardeeName: true, awardedValue: true, status: true, instrumentKind: true, cancelReason: true, contract: { select: { number: true } } } }),
    loadAwardPolicy(org.id),
  ]);
  // FR-EST-008: finalising an opening writes the disclosed company estimate (and the paper copy's figure) into the trail, under this exercise's reference, so
  // they are in this History. They are judged by the estimate's custody exactly as the opening's schedule judges them, and the access is logged; nothing is asked
  // (and nothing logged) where no row carries one. An estimate that is void, or none, is not in anyone's custody.
  const custodyRows = history.entries.some((e) => e.changes.some((c) => CUSTODY_FIELDS.has(c.field) && (c.before || c.after)));
  const custody: Sulit<string> | null = custodyRows ? await estimateCustodyForHistory(actor, ex.id) : null;
  // Naming a person opens the exercise's classified figures to them, so the control is offered only to someone who may use it (`namingRefusal`).
  const namingBlock = await namingOthersRefusal(db, actor, ex.id);
  // Dossier evidence and the scope document, as the document store counts them.
  const evidenceFacts = await attachmentFacts({ kind: "exercise", id: ex.id }, db, ["DOSSIER_EVIDENCE", "COORDINATION_SCOPE"]);
  const evidence = exerciseEvidence(evidenceFacts);
  const config = cfg.config;
  const method = config.methods.find((m) => m.code === ex.sourcingMethodCode) ?? null;
  const decided = isClassificationSnapshot(ex.classificationSnapshot) ? ex.classificationSnapshot : null;
  const bands = isBandSnapshot(ex.bandSnapshot) ? ex.bandSnapshot : null;
  // A draft is judged now, as its next save would be; a decided exercise renders from its record.
  const ev = draft && ctx ? evaluateExercise(draftOf(ex), ctx) : null;
  const flags = decided?.method.flags ?? method ?? null;
  // Founder, 2026-10-05: Classification and Contract type are one Overview now; their old addresses still open it.
  // The Overview is also the tab for an address that names none, or one this exercise has no tab for.
  const tab = activeTabOf(asked, ["overview", "scope", "documents", "invitation", "bids", "evaluation", ...(flags?.requiresProposal ? ["proposal"] : []), ...(flags?.requiresNameApproval ? ["name"] : []), "award", "access", "history"]);
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
          packKind: method?.documentPackKind ?? null,
        }),
      ]
    : [];
  const items = (cfg.checklist[ex.sourcingMethodCode] ?? []).filter((i) => i.retiredOn == null || i.retiredOn > on);
  const pFaults = method?.requiresProposal ? proposalFaults(items, ex.proposalAnswers, on) : [];
  const proposal = proposalView(ex.proposalState, ex.proposalRecord, items, ex.proposalAnswers, on);
  const nameRoutes = nameRoutesOf(ex.approvalInstances);
  const openName = nameRoutes.find((i) => i.status === "PENDING") ?? null;
  const approvedName = nameRoutes.find((i) => i.status === "APPROVED") ?? null;
  const live = ex.status !== "CANCELLED";
  // The route as the request would make it: with the requester's own offices escalated,
  // or refused, and refused where they alone could act for a step (FR-APR-008, R1).
  const unitPath = pathTo(units as unknown as OrgUnit[], req.sectionUnitCode || req.requestingUnitCode, on).reverse().map((u) => u.code);
  const nameRoute =
    live && ctx && method?.requiresNameApproval
      ? today
        ? nameRouteForRequester(ctx.funder, method, Number(ex.estimatedValue.toString()), requesterHolding((code) => holdersFor(code, unitPath, roster, delegations, today), req.requestingPersonId, parseSen(ex.estimatedValue.toString()), (pid) => roster.people.some((p) => p.id === pid && p.isActive && p.isAvailable)))
        : { ...resolveNameApproval(ctx.funder, method, Number(ex.estimatedValue.toString())), refusal: null }
      : null;
  // Step suggestions: holders of the office for the requisition's unit and their delegates first.
  const suggestions = (roleCode: string | null) => {
    if (!roleCode || !today) return activePeople;
    const h = holdersFor(roleCode, unitPath, roster, delegations, today);
    const first = [...h.holderIds, ...h.delegates.map((d) => d.personId)];
    const top = activePeople.filter((p) => first.includes(p.value)).map((p) => ({ ...p, label: `${p.label} — ${h.holderIds.includes(p.value) ? "holds the office" : "delegate"}` }));
    return [...top, ...activePeople.filter((p) => !first.includes(p.value))];
  };


  // 6.5: the Invitation tab is read one section at a time, and only while it is the tab being looked at.
  // Its header acts (publish, extend, record a sale...) come with it, so they are never judged for another tab.
  const published = isPublished(ex.status);
  // The name tab's own reads (the invitee list beside the approved one, the committee's matters to cite), only for that tab.
  const [nameList, nameMatters] = tab === "name" && flagsNeedName(ex.sourcingMethodCode, cfg.config.methods) ? await Promise.all([nameListTab(actor.organisationId, ex.id), exerciseMatters(ex.id)]) : [null, []];
  // 6.6, 6.7: the Bids and opening tab, read one section at a time and only while it is the tab being looked at; its header acts come with it.
  const bidsSection = bidsSectionOf(section);
  const bids = tab !== "bids" ? null : bidsSection === "opening" ? await loadOpening(actor, ex.id) : bidsSection === "schedule" ? await loadSchedule(actor, ex.id) : await loadBids(actor, ex.id, ex.status);
  // 6.8: the Evaluation tab, read one section at a time and only while it is the tab being looked at; its header acts come with it.
  const evaluationSection = evaluationSectionOf(section);
  const evaluation = tab === "evaluation" ? await loadEvaluationTab(actor, ex.id, evaluationSection) : null;
  // 6.6 (X-9): what the register asks of an award, for the Award tab (only on an exercise published through 6.5).
  const bidAward = tab === "award" ? await bidGate(ex.id) : null;
  // 6.7 (C-8): what the openings ask of an award, for the Award tab (only on an exercise published through 6.5).
  const openingAward = tab === "award" ? openingGateFaults(await loadOpeningGate(ex.id)).map(openingFindingText) : [];
  // 6.8 (E-9, flagged): the evaluation's gate, before an award is opened.
  const evaluationAward = tab === "award" ? await (async () => {
    const g = await loadEvaluationGate(ex.id);
    return g.gate.applies ? evaluationFindings({ facts: g.gate, awardeePartyId: null }).map(awardFindingText) : [];
  })() : [];
  // Founder, 2026-10-05: the Overview, read only while it is the tab being looked at (its own reads: the
  // tender conditions, the pack's proposed dates, the window's briefings and the organisation's closing time).
  const overviewPack = draft ? (method?.documentPackKind ?? null) : ex.packKindSnapshot;
  const noPack = flowShape(ex.status, overviewPack, !!ex.preparedAt) === "NO_PACK";
  const inv =
    tab === "invitation"
      ? await loadInvitation(actor, invitationSectionOf(section), { exerciseId: ex.id, reference: ex.reference, status: ex.status, noPack, today, timeZone: org.timeZone, routes: latestFirst(windowChangeRoutesOf(ex.approvalInstances)), people: activePeople, suggestions })
      : null;

  // Asked in draft or in preparation, and again after a refusal or withdrawal (ruling on BD-4).
  const canAskName = live && !!method?.requiresNameApproval && !openName && !approvedName;
  const nameBlocker = !canAskName
    ? null
    : (() => {
        const rf = nameRequestFault(ex.status, method, nameRoutes, today);
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
  const prepBlocker = prepList.length ? prepList.map((f) => findingTextFor(f, estimate.state === "WITHHELD")).join(" ") : null;
  // Where a blocker has a place it is put right, the note links there (UX 15).
  const FIX_AT: Record<string, { href: string; label: string }> = {
    BASIS_NOT_SET: { href: `/sourcing/${ex.id}/edit`, label: "Choose a basis" },
    TYPE_NOT_SET: { href: `/sourcing/${ex.id}/edit`, label: "Choose a type" },
    METHOD_NOT_SET: { href: `/sourcing/${ex.id}/edit`, label: "Choose a method" },
    TAXONOMY_AMBIGUOUS: { href: `/sourcing/${ex.id}?tab=overview`, label: "Choose it" },
    PROPOSAL_NOT_REVIEWED: { href: `/sourcing/${ex.id}?tab=proposal`, label: "Open the Proposal tab" },
    JUSTIFICATION_REQUIRED: { href: `/sourcing/${ex.id}/edit`, label: "Edit the justification" },
    REASON_REQUIRED: { href: `/sourcing/${ex.id}/edit`, label: "Choose a reason" },
    COORDINATION_RECORD_REQUIRED: { href: `/sourcing/${ex.id}/edit`, label: "Record the meeting" },
    DETERMINATION_CHANGED: { href: `/sourcing/${ex.id}/edit`, label: "Edit and save" },
    REASONS_NOT_SET: { href: "/configuration/reference-data", label: "Reference data" },
  };

  // The same rule the cancel action enforces: a live award stands on the exercise.
  const liveAward = exerciseCancelBlockedBy(awards);
  // A published exercise is cancelled on its approval route, asked for from the Invitation tab (FR-ADV-016).
  const cancelBlocker = liveAward ? `award ${liveAward.reference} stands on this exercise — cancel the award first.` : published ? "A published exercise is cancelled from the Invitation tab: it goes to approval with a reason and an answer on the fees." : null;
  const unavailable: [string, string | null][] = [
    ["Submit proposal", draft && method?.requiresProposal && ex.proposalState === "DRAFT" ? submitBlocker : null],
    ["Request name approval", canAskName ? nameBlocker : null],
    ["Move to preparation", draft ? prepBlocker : null],
    ["Cancel exercise", ex.status !== "CANCELLED" && !(published && inv?.cancel) ? cancelBlocker : null],
    ...(inv?.notes ?? []).map(([label, why]) => [label, why] as [string, string | null]),
    ...(bids?.notes ?? []).map(([label, why]) => [label, why] as [string, string | null]),
    ...(evaluation?.notes ?? []).map(([label, why]) => [label, why] as [string, string | null]),
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
                    {findingTextFor(f, estimate.state === "WITHHELD")}
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
              ...(ev?.bands.boundary.onBoundary && estimate.state !== "WITHHELD" ? [["At the boundary", boundarySentence(ev.bands.boundary.operator, String(ev.bands.boundary.boundaryValue), ev.bands.boundary.provenance)] as [string, string]] : []),
            ],
            notes: [
              ...(method?.requiresDossier ? ["The justification dossier is numbered now."] : []),
              ...(openName ? ["The name approval in progress stays open: it gates invitation, not preparation."] : method?.requiresNameApproval && !approvedName ? ["The name has not been sent for approval yet; it can be requested in preparation."] : []),
              ...(ex.restricted ? ["Restricted: only the people named on it can see it."] : []),
              ...(req.status === "APPROVED" ? [`This is the requisition's first exercise to move: ${req.reference} goes into sourcing.`] : []),
            ],
          }}
        />
      )}
      {inv?.actions}
      {bids?.actions}
      {evaluation?.actions}
      {ex.status !== "CANCELLED" && (published && inv?.cancel ? inv.cancel : <CancelExerciseDrawer id={ex.id} blocker={cancelBlocker} />)}
    </>
  );

  const restricted = ex.restricted;
  // Only the scope tab's own strip is drawn from this, so it is read only while that tab is the one looked at.
  const scopeSections = tab === "scope" ? visibleScopeSections(await scopeSectionFacts(actor.organisationId, ex.id)) : ALL_SCOPE_SECTIONS;
  const scopeSection = scopeSectionOf(section, scopeSections);
  const overview = tab === "overview" ? await loadOverviewReads(ex, ex.closingAt, org, { kind: overviewPack, noPack }) : null;
  const detailsRefused = detailsFault({ status: ex.status, awards });
  const tenderingRoute = latestFirst(tenderingRoutesOf(ex.approvalInstances))[0] ?? null;
  const cancelledEntry = ex.status === "CANCELLED" ? history.entries.find((e) => e.entity === "SourcingExercise" && e.changes.some((c) => c.field === "status" && c.after === "CANCELLED")) : null;
  const tabs = [
    {
      id: "overview",
      label: "Overview",
      icon: <SlidersIcon size={15} />,
      // Read only while it is the tab being looked at: selecting it from another tab asks the server for it.
      lazy: true,
      panel:
        overview == null ? null : (
          <OverviewPanel
            l={l}
            estimate={estimate}
            flow={exerciseFlow({
              status: ex.status,
              packKind: overviewPack,
              path: overview.windowPath ?? windowPathOf(method),
              windowPhase: windowGateNow.phase,
              routes: tenderingRoutesOf(ex.approvalInstances),
              awards,
              on: {
                prepared: ex.preparedAt ? formatOrgDay(ex.preparedAt, org.timeZone) : null,
                approvedForTendering: ex.approvedForTenderingAt ? formatOrgDay(ex.approvedForTenderingAt, org.timeZone) : null,
                published: overview.publishedAt ? formatOrgDay(overview.publishedAt, org.timeZone) : null,
                closing: ex.closingAt ? formatOrgDateTime(ex.closingAt, org.timeZone) : null,
                opened: overview.openedAt ? formatOrgDay(overview.openedAt, org.timeZone) : null,
                reportIssued: overview.reportIssuedAt ? formatOrgDay(overview.reportIssuedAt, org.timeZone) : null,
                cancelled: cancelledEntry ? formatOrgDay(cancelledEntry.at, org.timeZone) : null,
              },
            })}
            tendering={tenderingRoute ? tenderingStepperSteps(tenderingRoute) : null}
            decided={decided}
            bands={bands}
            live={ev ? { derivation: ev.derivation, type: ev.type, taxonomies: ev.taxonomies } : null}
            findings={findingsShownTo(ev ? ev.findings : ((ex.bandWarnings as unknown as Finding[]) ?? []), estimate.state === "WITHHELD")}
            config={config}
            permitList={cfg.permitList}
            typeName={typeName}
            methodName={methodName}
            flags={flags}
            reasonName={decided ? (decided.justification?.reasonName ?? null) : (config.reasons.find((r) => r.code === ex.justificationReasonCode)?.nameEn ?? null)}
            overriddenBy={ex.overriddenBy?.name ?? null}
            requesterType={typeName(req.contractTypeCode)}
            draft={draft}
            officeName={(c) => roster.offices.find((o) => o.code === c)?.nameEn ?? issue?.matrix.roles[c]?.nameEn ?? "An office no longer configured"}
            evidence={evidence}
            evidenceFacts={evidenceFacts}
            timeZone={org.timeZone}
            conditions={overview.conditions}
            keyDates={overview.keyDates}
            // The person named now stays on the list even if since retired, so the drawer shows who it is.
            people={people.filter((x) => x.isActive || x.id === ex.personInChargeId).map((x) => ({ value: x.id, label: x.isActive ? x.name : `${x.name} (no longer active)` }))}
            detailsBlocker={detailsRefused ? DETAILS_LOCKED_TEXT[detailsRefused] : null}
          />
        ),
    },
    {
      id: "scope",
      label: "Scope and estimate",
      icon: <ToolsIcon size={15} />,
      sections: [...scopeSections],
      section: scopeSection,
      // Read only while it is the tab being looked at, and only for the section named.
      panel: tab === "scope" ? <ScopeWorkspace exerciseId={ex.id} section={scopeSection} /> : null,
    },
    {
      id: "documents",
      label: "Tender documents",
      icon: <FileIcon size={15} />,
      // Read only while it is the tab being looked at.
      lazy: true,
      panel: tab === "documents" ? <DocumentsWorkspace exerciseId={ex.id} today={today} routes={latestFirst(tenderingRoutesOf(ex.approvalInstances))} /> : null,
    },
    {
      id: "invitation",
      label: "Invitation",
      icon: <GlobeIcon size={15} />,
      sections: invitationSectionsFor(ex.status),
      section: invitationSectionOf(section),
      // Without sections (before approval for tendering) the panel is still the server's, so selecting the tab asks for it.
      lazy: !invitationSectionsFor(ex.status),
      // Read only while it is the tab being looked at, and only for the section named.
      panel: inv?.panel ?? null,
    },
    {
      id: "bids",
      label: "Bids and opening",
      sections: [...BIDS_SECTIONS],
      section: bidsSection,
      icon: <InboxIcon size={15} />,
      // Read only while it is the tab being looked at, and only for the section named.
      panel: bids?.panel ?? null,
    },
    {
      id: "evaluation",
      label: "Evaluation",
      sections: [...EVALUATION_SECTIONS],
      section: evaluationSection,
      icon: <ScaleIcon size={15} />,
      // Read only while it is the tab being looked at, and only for the section named.
      panel: evaluation?.panel ?? null,
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
                        { label: "Reviewed by", value: ex.proposalReviewer ? <ActedBy entity="SourcingExercise" id={ex.id} slot="proposalReviewer" name={ex.proposalReviewer.name} /> : "Not recorded" },
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
                current={openName ?? latestFirst(nameRoutes)[0] ?? null}
                preview={nameRoute && nameRoute.nameState === "RESOLVED" && !nameRoute.refusal ? nameRoute.chain.map((s) => ({ role: issue?.matrix.roles[s.roleCode]?.nameEn ?? "An office no longer configured", act: s.act })) : null}
                previewText={nameRoute && nameRoute.nameState !== "RESOLVED" ? NAME_STATE_TEXT[nameRoute.nameState] : (nameRoute?.refusal ?? null)}
                suggestions={suggestions}
                today={today}
                people={roster.people.filter((p) => p.isActive).map((p) => ({ value: p.id, label: p.name }))}
                officeName={(code) => (code ? (roster.offices.find((o) => o.code === code)?.nameEn ?? "An office no longer configured") : null)}
                list={nameList}
                matters={nameMatters}
              />
            ),
          },
        ]
      : []),
    {
      id: "award",
      label: "Award",
      icon: <AwardIcon size={15} />,
      count: awards.length || undefined,
      panel: (
        <AwardTab
          exerciseId={ex.id}
          status={ex.status}
          packKind={ex.packKindSnapshot}
          window={windowGateNow}
          awards={awards}
          // Whether an award can be opened here at all, and whether it could then go for approval.
          opening={(() => {
            const i = instrumentFor(ex.regime, awardPolicy);
            return "fault" in i ? awardFindingText({ code: i.fault, level: "block", data: { regime: i.regime } }) : null;
          })()}
          dossier={dossierEvidenceMissing(flags, { justificationReasonCode: ex.justificationReasonCode, dossierReference: ex.dossierReference, evidenceAttachments: evidence.dossier })}
          bidFaults={bidAward?.published ? [bidAward.lateFault, bidAward.validityFault].filter((f) => f != null).map((f) => bidFindingText(f!)) : []}
          openingFaults={ex.status === "OPENED" || ex.status === "UNDER_EVALUATION" || ex.status === "EVALUATED" ? openingAward : []}
          evaluationFaults={ex.status === "OPENED" || ex.status === "UNDER_EVALUATION" || ex.status === "EVALUATED" ? evaluationAward : []}
        />
      ),
    },
    {
      id: "access",
      label: "Access",
      icon: <ShieldIcon size={15} />,
      count: ex.participants.length,
      panel: (
        <Card className="overflow-hidden">
          <CardHeader icon={<UsersIcon size={17} />} title="Named participants" subtitle={restricted ? "Restricted by its method: only the people named on it can see it." : "Not restricted by its method."} actions={ex.status !== "CANCELLED" && !namingBlock ? <AddParticipantDrawer id={ex.id} people={activePeople.filter((p) => !ex.participants.some((x) => x.personId === p.value))} /> : undefined} />
          <CardBody className="flex flex-col gap-4">
            {namingBlock && ex.status !== "CANCELLED" && (
              <Callout tone="info" title="Naming people here is for the people named on it">
                {namingBlock}
              </Callout>
            )}
            {restricted && (
              <Callout tone="warn" title="Restricted to the people named on it">
                This exercise is hidden from everyone else: it is left out of the lists, the counts, the search and the dashboard, and opening it by its address says it does not exist. Each time someone is turned away, or reads a classified figure on it, the portal logs it. Besides the people named here, it is open to the person in charge, the proposal&apos;s reviewer and the members of its evaluation team and opening panel. Anyone who must approve a route for it or sit on its committee has to be named here too: holding the office does not open it.
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
          estimate={estimate}
          custody={custody}
          entries={history.entries}
          total={history.total}
          timeZone={org.timeZone}
          personName={personName}
          typeName={typeName}
          methodName={(c) => config.methods.find((m) => m.code === c)?.nameEn ?? "A method no longer configured"}
          basisName={(c) => config.bases.find((b) => b.code === c)?.nameEn ?? null}
          reasonName={(c) => config.reasons.find((r) => r.code === c)?.nameEn ?? null}
          tenderingRouteIds={new Set(tenderingRoutesOf(ex.approvalInstances).map((i) => i.id))}
          routeDomains={new Map(exerciseRoutesOf(ex.approvalInstances).flatMap((i) => [[i.id, i.domain] as const, ...i.steps.map((s) => [s.id, i.domain] as const)]))}
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
            {published && (
              <Badge tone={PHASE_TONE[windowGateNow.phase]}>{PHASE_LABEL[windowGateNow.phase]}</Badge>
            )}
            {restricted && <Badge tone="warn">Restricted to its named people</Badge>}
          </>
        }
        meta={[
          <span key="ref" className="font-mono text-[12.5px]">{ex.reference}</span>,
          <span key="for">for <Link href={`/requisitions/${req.id}?tab=sourcing`}>{req.reference}</Link></span>,
          <SulitValue key="v" of={estimate} />,
          methodName,
          decided?.contractType.nameEn ?? typeName(ex.contractTypeCode) ?? "Contract type not set",
          ex.regime ? REGIME_SHORT[ex.regime as Regime] : "Regime not determined",
          ...(ex.closingAt ? [<span key="closing">{`${closingVerb(windowGateNow.phase)} ${formatOrgDateTime(ex.closingAt, org.timeZone)}`}</span>] : []),
        ]}
        actions={actions}
        actionsNote={headerNote}
        actionsNoteId={EXERCISE_NOTE_ID}
      />

      <div className="mb-6 flex flex-col gap-3">
        {ex.status === "CANCELLED" && (
          <Callout tone="info" title="Cancelled">
            {ex.cancelReason || "No reason recorded."} {CANCELLED_ASSUMPTION}
          </Callout>
        )}
        {ex.classificationLockedAt && (
          <Callout tone="info" title="Classification locked by its award">
            Since {formatOrgDay(ex.classificationLockedAt, org.timeZone)} the contract type is fixed: it changes only by a controlled change, which arrives with the post-award modules.
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

      <Tabs initial={tab} label="Exercise" tabs={tabs} dense />
    </>
  );
}

// --------------------------------------------------------------------- award

function AwardTab({ exerciseId, status, packKind, window, awards, opening, dossier, bidFaults, openingFaults, evaluationFaults }: { exerciseId: string; status: string; packKind: PackKind | null; window: WindowGate; opening: string | null; dossier: boolean; bidFaults: string[]; openingFaults: string[]; evaluationFaults: string[]; awards: { id: string; reference: string; awardeeName: string; awardedValue: { toString(): string }; status: string; instrumentKind: string; cancelReason: string; contract: { number: string } | null }[] }) {
  const live = awards.find((a) => a.status !== "CANCELLED") ?? null;
  const cancelled = awards.filter((a) => a.status === "CANCELLED");
  return (
    <div className="flex flex-col gap-6">
      {/* 6.6 (X-9): what the envelope register asks before the award is sent or issued. */}
      {bidFaults.length > 0 && (
        <Callout tone="warn" title="The bids received hold the award back" action={<ButtonLink href={`/sourcing/${exerciseId}?tab=bids&section=received`} size="sm" variant="secondary">Open the bids received</ButtonLink>}>
          {bidFaults.join(" ")} The award is not sent for approval or issued until then.
        </Callout>
      )}
      {/* 6.7 (C-8): what the openings ask before the award is opened, sent or issued. */}
      {openingFaults.length > 0 && (
        <Callout tone="warn" title="The opening holds the award back" action={<ButtonLink href={`/sourcing/${exerciseId}?tab=bids&section=schedule`} size="sm" variant="secondary">Open the schedule</ButtonLink>}>
          {openingFaults.join(" ")}
        </Callout>
      )}
      {evaluationFaults.length > 0 && !live && (
        <Callout tone="warn" title="The evaluation holds the award back" action={<ButtonLink href={`/sourcing/${exerciseId}?tab=evaluation`} size="sm" variant="secondary">Open the evaluation</ButtonLink>}>
          {evaluationFaults.join(" ")}
        </Callout>
      )}
      <Card>
        <CardHeader icon={<AwardIcon size={17} />} title="The award" subtitle={live ? "Its approval, instrument, return and securities are on the award's own record." : exerciseOpenForAward(status, packKind, window) ? "The exercise is open for an award." : awardOpenRefusal(packKind, status, window)} />
        <CardBody>
          {live ? (
            <div className="flex flex-col gap-4">
              <KeyValues
                columns={2}
                items={[
                  { label: "Awardee", value: <Link href={`/awards/${live.id}`}>{live.awardeeName}</Link> },
                  { label: "Reference", value: <span className="font-mono text-[13px]">{live.reference}</span> },
                  { label: "Awarded value", value: <span className="tabular-nums">{money(live.awardedValue)}</span> },
                  { label: "Instrument", value: INSTRUMENT_SHORT[live.instrumentKind as InstrumentKind] },
                  { label: "Status", value: <Badge tone={AWARD_STATUS_TONE[live.status as AwardStatus]}>{AWARD_STATUS_LABEL[live.status as AwardStatus]}</Badge> },
                  { label: "Contract", value: live.contract ? <span className="font-mono text-[13px]">{live.contract.number}</span> : "Numbered when the instrument is issued" },
                ]}
              />
              <div>
                <ButtonLink href={`/awards/${live.id}`} variant="secondary" size="sm">Open the award</ButtonLink>
              </div>
            </div>
          ) : !exerciseOpenForAward(status, packKind, window) ? (
            <EmptyState size="sm" title="Not awarded">{status === "CANCELLED" ? "The exercise is cancelled." : status === "DRAFT" ? "The exercise must move into preparation first." : awardOpenRefusal(packKind, status, window)}</EmptyState>
          ) : opening || evaluationFaults.length ? (
            <EmptyState size="sm" title="No award is opened here" action={<Button size="sm" variant="primary" disabled aria-describedby="award-start-note">Start the award</Button>}>
              <span id="award-start-note">{opening ?? evaluationFaults.join(" ")}</span>
            </EmptyState>
          ) : (
            <div className="flex flex-col gap-4">
              {dossier && (
                <Callout tone="warn" title={DOSSIER_EVIDENCE_NEEDED.title}>
                  {DOSSIER_EVIDENCE_NEEDED.body}
                </Callout>
              )}
              <EmptyState size="sm" title="Not awarded yet" action={<ButtonLink href={`/awards/new?exercise=${exerciseId}`} size="sm" variant="primary">Start the award</ButtonLink>}>
                {dossier ? DOSSIER_EVIDENCE_NEEDED.short : "Record the awardee and the awarded value; the award is then sent for the appointment's approval."}
              </EmptyState>
            </div>
          )}
        </CardBody>
      </Card>
      {cancelled.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader icon={<ClockIcon size={17} />} title="Cancelled awards" subtitle="Kept on record." />
          <ul className="divide-y divide-line/70">
            {cancelled.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 px-5 py-3 text-[13px] sm:px-6">
                <Link href={`/awards/${a.id}`} className="font-semibold">{a.awardeeName}</Link>
                <span className="min-w-0 break-words text-ink-3">{`${a.reference} · ${a.cancelReason || "no reason recorded"}`}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

// ------------------------------------------------------------- name approval

async function NamePanel({
  l,
  current,
  preview,
  previewText,
  suggestions,
  today,
  people,
  officeName,
  list,
  matters,
}: {
  list: Awaited<ReturnType<typeof nameListTab>>;
  matters: Awaited<ReturnType<typeof exerciseMatters>>;
  people: { value: string; label: string }[];
  officeName: (code: string | null) => string | null;
  l: LoadedExercise;
  current: LoadedExercise["ex"]["approvalInstances"][number] | null;
  preview: { role: string; act: string }[] | null;
  previewText: string | null;
  suggestions: (roleCode: string | null) => { value: string; label: string }[];
  today: string | null;
}) {
  const ex = l.ex;
  const inst = current;
  const earlier = latestFirst(nameRoutesOf(ex.approvalInstances)).filter((i) => i.id !== current?.id);
  // Where the officer sent a refused route is read from the route's attribution (Phase 2b).
  const chosenBy = await routeActed(db, l.org.id, nameRoutesOf(ex.approvalInstances));
  return (
    <div className="flex flex-col gap-6">
      <Callout tone="info" title="The name is approved for a list, and invitation is held to it">
        The letters of invitation go only to the contractors on the list the name was approved for. Changing the list withdraws the approval until the name is asked for again, and once the exercise is invited the list is frozen. Where the route has a committee step, it is discharged by citing the committee&apos;s decision.
      </Callout>
      {list && list.invited && (
        <Card className="overflow-hidden">
          <CardHeader icon={<UsersIcon size={17} />} title="The invitee list" subtitle={list.frozen ? "Frozen: the exercise is invited." : list.route ? `${list.route.label}. ${list.route.state}` : "Proposed on the Invitation tab. The name is asked for with this list."} actions={<Link href={`/sourcing/${ex.id}?tab=invitation&section=window`} className="text-[13px] font-semibold">Open the Invitation tab</Link>} />
          <CardBody className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="mb-2 text-[12px] font-semibold text-ink-3">As it stands</p>
              {list.proposed.length === 0 ? <p className="text-[13.5px] text-ink-3">Nobody is proposed yet.</p> : (
                <ul className="flex flex-col gap-1.5 text-[13.5px]">
                  {list.proposed.map((p) => (
                    <li key={p.registrationNo} className="flex flex-wrap items-center gap-2"><span className="font-semibold text-ink">{p.name}</span><span className="text-ink-3">{p.registrationNo}</span>{p.onRoute === false && <Chip tone="warn">Not on the approved list</Chip>}</li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="mb-2 text-[12px] font-semibold text-ink-3">As the name was asked for</p>
              {list.asked.length === 0 ? <p className="text-[13.5px] text-ink-3">{list.route ? "No list was recorded with this route: it approves no names, so it is asked for again with the list." : "Not asked for yet."}</p> : (
                <ul className="flex flex-col gap-1.5 text-[13.5px]">
                  {list.asked.map((p) => (
                    <li key={p.registrationNo} className="flex flex-wrap items-center gap-2"><span className="font-semibold text-ink">{p.name}</span><span className="text-ink-3">{p.registrationNo}</span>{!p.stillProposed && <Chip tone="warn">No longer proposed</Chip>}</li>
                  ))}
                </ul>
              )}
            </div>
          </CardBody>
        </Card>
      )}
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
                      <span className="text-ink-3">{actLabel(s.act)}</span>
                    </li>
                  ))}
                </ol>
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
            subtitle={`Requested ${formatDate(inst.openedAt)} under ${inst.matrixLabel ?? "an issue no longer on file"}: ${inst.ruleLabel ?? "a rule no longer on file"} · ${inst.ruleClause || "clause not recorded"}.`}
            actions={<Badge tone={routeTone(inst.status)}>{nameRouteLabel(inst.status, inst.warnings)}</Badge>}
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
          {inst.status === "PENDING" && (
            <p className="border-t border-line px-5 py-2.5 text-[12.5px] text-ink-3 sm:px-6">
              Steps are decided in order: each waits for the one before it.{" "}
              {ifRejectedText({ snapshotAt: inst.rejectionSnapshotAt, kind: inst.rejectionKind as RejectionKind | null, returnToOffice: officeName(inst.rejectionReturnToRoleCode), provenance: inst.rejectionProvenance }, false, returnTargetBeforeNext(inst))}
              {inst.supersedesInstanceId ? " This route continues a refused one from an earlier step; the steps before it keep their decisions." : ""}
            </p>
          )}
          {inst.status === "REJECTED" && (() => {
            const rejecting = inst.steps.find((x) => x.decision === "REJECTED");
            if (inst.rejectionApplied && inst.rejectionSource) {
              return (
                <div className="border-t border-line px-5 py-3 sm:px-6">
                  <Callout tone="warn" title="Where the refusal sent it">
                    {appliedText(inst.rejectionApplied as RejectionKind, inst.rejectionSource, officeName(inst.rejectionReturnToRoleCode), inst.rejectionChosenBy?.name ?? null, inst.rejectionChosenBy ? chosenBy.chosen(inst.id, inst.rejectionChosenBy.name) : null)}
                  </Callout>
                </div>
              );
            }
            if (inst.rejectionChoices.length > 0 && rejecting) {
              return (
                <div className="border-t border-line px-5 py-3 sm:px-6">
                  <Callout
                    tone="warn"
                    title="Where the refused name goes next is the officer's choice"
                    action={
                      <NameChoiceDrawer
                        id={ex.id}
                        kinds={(inst.rejectionChoices as RejectionKind[]).map((k) => ({ value: k, label: REJECTION_KIND_LABEL[k] }))}
                        steps={earlierSteps(inst.steps, rejecting.sequence).map((x) => ({ value: String(x.sequence), label: `${x.sequence}. ${x.roleLabel} · ${actLabel(x.act)}` }))}
                        people={people}
                      />
                    }
                  >
                    {CHOICE_WHY_TEXT[(inst.rejectionChoiceWhy as keyof typeof CHOICE_WHY_TEXT | null) ?? "NOT_SET"]}
                  </Callout>
                </div>
              );
            }
            return null;
          })()}
          {inst.checkedAgainstMatrix && (
            <p className="border-t border-line px-5 py-2.5 text-[12.5px] break-words text-ink-3 sm:px-6">
              Chain beneath the approver: {routeCoreText(inst, (c) => { const n = officeName(c) ?? "an office no longer configured"; return { en: n, ms: n }; }).en}
            </p>
          )}
          <RouteSteps
            inst={inst}
            stepLabel={(x) => DECISION_LABEL[x]}
            stepTone={stepTone}
            decided={(s) => {
              if (!s.committeeCode) return null;
              const m = matters.find((x) => x.id === s.committeeDecisionId);
              return (
                <>
                  {DECISION_LABEL[s.decision]} · {s.decidedByName ?? "The committee"} · the committee&apos;s decision
                  {m ? <>, <Link href={`/committees/${m.meetingId}`}>{m.meeting.reference}</Link>: {m.subject}</> : ", cited from its sitting"} · {formatDate(s.decidedOn)}
                </>
              );
            }}
            action={(s, { earlierDone }) => {
              const blocker = inst.status !== "PENDING" || s.decision !== "PENDING" ? null : !today ? DECIDER_FAULT_TEXT.TIME_ZONE_UNSET : null;
              const open = inst.status === "PENDING" && s.decision === "PENDING" && earlierDone;
              const cited = new Set(nameRoutesOf(ex.approvalInstances).flatMap((i) => i.steps.map((x) => x.committeeDecisionId)).filter(Boolean));
              const offered = matters
                .filter((m) => m.domain === "name_approval" && m.meeting.committee.code === s.committeeCode && !cited.has(m.id))
                .map((m) => ({ value: m.id, label: `${m.meeting.reference} · ${m.subject} · ${m.outcome === "PENDING" ? "not decided yet" : m.outcome === "CARRIED" ? "carried" : m.outcome === "DEFERRED" ? "deferred" : "not carried"}${m.outcome === "PENDING" ? " — cannot be cited until decided" : ""}`, disabled: m.outcome === "PENDING" }));
              return (
                <>
                  {inst.status === "PENDING" && s.decision === "PENDING" && !s.committeeCode && s.roleCode && (
                    <EscalateDrawer stepId={s.id} office={s.actingRoleLabel ?? s.roleLabel} mandatory={isMandatoryAct(s.act)} people={suggestions(s.actingRoleCode ?? s.roleCode)} />
                  )}
                  {open && s.committeeCode && <CiteNameDecisionDrawer id={ex.id} stepId={s.id} committee={s.roleLabel} matters={offered} />}
                  {open && !s.committeeCode && <NameDecisionDrawer id={ex.id} stepId={s.id} roleLabel={s.roleLabel} act={ACT_LABEL[s.act]} done={ACT_DONE_LABEL[s.act] ?? "Done"} people={suggestions(s.actingRoleCode ?? s.roleCode)} today={today} blocker={blocker} />}
                </>
              );
            }}
          />
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
                  Requested {formatDate(e.openedAt)} · {e.steps.map((s) => s.roleLabel).join(" → ")}
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
  // Attachments and the documents behind them (document store).
  ...DOCUMENT_ENTITY_LABEL,
  // 6.2: the bill, panel, estimate, their exports and scope matters, labelled with the exercise.
  ...SCOPE_ENTITY_LABEL,
  // 6.4: the pack, its parts and the Appendix; their values are already in words.
  [TENDER_ENTITY.pack]: "Tender documents",
  [TENDER_ENTITY.part]: "Tender document part",
  [TENDER_ENTITY.document]: "Frozen text",
  [TENDER_ENTITY.appendix]: "Appendix",
  [TENDER_ENTITY.variationLimit]: "Variation limit",
  [TENDER_ENTITY.section]: "Appendix section",
  // 6.6: the envelope register, withdrawals, the tender box and validity extensions (67-C2).
  ...BID_ENTITY_LABEL,
  // 6.7: the opening; every value is already in words (a price as read and the disclosed estimate chip as SULIT).
  ...OPENING_ENTITY_LABEL,
  // 6.8: the evaluation; every value is already in words (its figures chip as SULIT by their registered keys).
  ...EVALUATION_ENTITY_LABEL,
  // 6.5: the invitation window; every value is already in words.
  ExerciseWindow: "Invitation window",
  WindowFeeLine: "Fee basis",
  PublicationRecord: "Publication",
  ExerciseParty: "Contractor",
  InvitationLetter: "Letter of invitation",
  DocumentSale: "Sale of the documents",
  SiteEvent: "Briefing or site visit",
  SiteEventAttendance: "Attendance",
  Addendum: "Addendum",
  AddendumRecipient: "Addendum copy",
  ClosingChange: "Closing change",
  WindowCancellation: "Cancellation",
  WindowNotice: "Notice of a change",
  SourcingExercise: "Exercise",
  ExerciseScopePart: "Scope",
  ExerciseProposalAnswer: "Proposal item",
  ExerciseTaxonomyValue: "Classification",
  ExerciseParticipant: "Participant",
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
  // Founder, 2026-10-05: audited as the person's name, and the work code as written.
  personInCharge: "Person in charge",
  workCode: "Work code",
};
const MONEY = new Set(["estimatedValue", "amount", "boundaryValue"]);
/// The History's fields that carry the disclosed company estimate (an opening's finalising writes both).
const CUSTODY_FIELDS: ReadonlySet<string> = new Set(["companyEstimate", "estimatePaperCopy"]);

function HistoryPanel({
  estimate,
  custody,
  entries,
  total,
  timeZone,
  personName,
  typeName,
  methodName,
  basisName,
  reasonName,
  tenderingRouteIds,
  routeDomains,
}: {
  /// The department estimate as this reader may see it: its changes in the trail are shown, or withheld, as the figure is (Phase 3a).
  estimate: Sulit<string>;
  /// The reader's standing with the disclosed company estimate (FR-EST-008), judged as the opening's schedule judges it. Null where no row carries the figure.
  custody: Sulit<string> | null;
  entries: Awaited<ReturnType<typeof exerciseHistory>>["entries"];
  total: number;
  timeZone: string | null;
  personName: (id: string | null) => string | null;
  typeName: (c: string | null) => string | null;
  methodName: (c: string) => string;
  basisName: (c: string) => string | null;
  reasonName: (c: string) => string | null;
  /// The exercise's Approval for Tendering routes: a rejection there reads "Returned for amendment" (Q-3).
  tenderingRouteIds: ReadonlySet<string>;
  /// Each route's and each step's id to its route's domain, so the History names them by it.
  routeDomains: ReadonlyMap<string, string>;
}) {
  // The department estimate (a registered SULIT field) reads with the SULIT chip in the trail too.
  // The estimate itself is judged for this reader (`estimate`); any other registered field keeps the chip until its module rolls out (3b).
  const chipped = (field: string, value: string | null, entityId: string, entity: string) => {
    // A scope part's amount is a share of the estimate and the parts add up to it exactly: it is judged as the estimate is.
    const isEstimate = field === "estimatedValue" || (field === "amount" && entity === "ExerciseScopePart");
    if ((!isSulitField(field) && !isEstimate) || !value) return read(field, value, entityId, entity);
    // The disclosed company estimate and the paper copy's figure are judged by custody, never by the exercise's own access.
    if (CUSTODY_FIELDS.has(field)) return custody && custody.state === "GRANTED" ? <SulitValue of={{ ...custody, value: read(field, value, entityId, entity) }} /> : <SulitValue of={(custody ?? sulitWithheld<ReactNode>("NOT_IN_CUSTODY", "exercise")) as Sulit<ReactNode>} />;
    if (isEstimate) return estimate.state === "GRANTED" ? <SulitValue of={{ ...estimate, value: read(field, value, entityId, entity) }} /> : <SulitValue of={estimate as Sulit<ReactNode>} />;
    return <SulitValue>{read(field, value, entityId, entity)}</SulitValue>;
  };
  const read = (field: string, value: string | null, entityId: string, entity: string): string => {
    if (value == null || value === "") return "—";
    // A window row's values are written in words already (an addendum's "Draft", a sale's "yes"): never read as a stored code.
    if (WINDOW_ENTITIES.includes(entity) || BID_ENTITIES.includes(entity) || OPENING_ENTITIES.includes(entity)) return value === "yes" ? "Yes" : value === "no" ? "No" : /^\d{4}-\d{2}-\d{2}$/.test(value) ? formatDate(value) : value;
    if (field === "status" && tenderingRouteIds.has(entityId)) return tenderingRouteLabel(value, null);
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
  // The work code is free text the officer wrote, not a configuration key: it is shown as written.
  const NAMED_KEYS = new Set(["sourcingMethodCode", "proposedMethodCode", "contractTypeCode", "derivedContractTypeCode", "contractBasisCode", "justificationReasonCode", "workCode"]);
  const shown = (field: string, ch: { before: string | null; after: string | null }, action: string, entityId: string) =>
    (!/(Code|Key)$/.test(field) || NAMED_KEYS.has(field)) &&
    (!/Id$/.test(field) || field === "overriddenByPersonId" || field === "proposalReviewerPersonId") &&
    !historyFieldHidden(routeDomains.get(entityId), field) &&
    // "On the boundary" with the boundary (configuration) is the estimate to the sen: not shown to a reader who may not read it.
    !(field === "onBoundary" && estimate.state === "WITHHELD") &&
    // A creation lists what it was given, not every empty field.
    (action !== "CREATE" || (ch.after != null && ch.after !== "" && ch.after !== "false")) &&
    (action !== "UPDATE" || ch.before !== ch.after);
  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<ClockIcon size={17} />}
        title="History"
        subtitle={total > entries.length ? `Showing the latest ${entries.length} of ${total} changes. Each change names who made it; any from before sign-in is not attributed.` : "Every change to this exercise and what is under it. Each change names who made it; any from before sign-in is not attributed."}
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
                <span className="font-semibold text-ink">{routeDomains.has(e.entityId) ? historyRouteLabel(routeDomains.get(e.entityId)!, e.entity === "ApprovalStep" ? "step" : "route") : (ENTITY_LABEL[e.entity] ?? "Record")}</span>
                <span className="min-w-0 break-words text-ink-2">{trailLabel(historyEntityLabel(e.entity, e.entityLabel))}</span>
                <span className="flex-1" />
                <span className="text-[12px] text-ink-3">{formatOrgDay(e.at, timeZone)}</span>
              </div>
              {e.changes.length > 0 && (
                <ul className="text-[12.5px] break-words text-ink-3">
                  {e.changes.filter((ch) => shown(ch.field, ch, e.action, e.entityId)).map((ch) => (
                    <li key={ch.field}>
                      {FIELD_NAME[ch.field] ?? fieldLabel(ch.field)}: {e.action === "UPDATE" && <>{chipped(ch.field, ch.before, e.entityId, e.entity)} → </>}
                      <span className="text-ink-2">{chipped(ch.field, e.action === "DELETE" ? ch.before : ch.after, e.entityId, e.entity)}</span>
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

