import { holderOf } from "@/lib/people/delegation";
import type { ReactNode } from "react";
import { hiddenExercises, sulitExerciseValues, sulitGate } from "@/app/_auth/sulit";
import { sulitHistoryValue } from "@/lib/auth/sulit-history";
import { through, type Sulit } from "@/lib/auth/sulit-access";
import { fieldsOfScope } from "@/lib/sulit-fields";
import Link from "next/link";
import { MISSING_BUDGET_CODE_TEXT, missingBudgetCode } from "@/lib/requisition/budget-code";
import { historyEntityLabel } from "@/lib/audit/entity-labels";
import { routedValue } from "@/lib/approvals/routed-value";
import { notFound } from "next/navigation";

import { ChartIcon, ClipboardIcon, ClockIcon, DownloadIcon, GlobeIcon, RouteIcon, ShieldIcon } from "@/components/icons";
import { RecordCrumb } from "@/components/shell/record-crumb";
import { Tabs } from "@/components/tabs";
import { ActBadge, actLabel, isMandatoryAct } from "@/components/ui/act";
import { EscalateDrawer } from "@/app/approvals/editors";
import { escalationText } from "@/lib/authority/escalation-labels";
import { absentOffices } from "@/lib/authority/absence";
import { Badge, Chip, SulitValue } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { MoreActions, MoreItem } from "@/components/ui/more-actions";
import { moreItemClass } from "@/components/ui/more-item-class";
import { RuleInfo } from "@/components/ui/rule-info";
import { headerMenu, primaryAction } from "@/lib/requisition/primary-action";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState, FindingNote } from "@/components/ui/feedback";
import { InfoChip } from "@/components/ui/info-chip";
import { MoreText } from "@/components/ui/more-text";
import { PageHeader } from "@/components/ui/page-header";
import { ProvenanceBadge } from "@/components/ui/provenance";
import { KeyValues, Stat } from "@/components/ui/stat";
import { Stepper } from "@/components/ui/stepper";
import { Accordion } from "@/components/accordion";
import { routeSteps } from "@/lib/approvals/route-steps";
import { recallFault, RECALL_FAULT_TEXT } from "@/lib/approvals/recall";
import { routeRequesterId } from "@/lib/approvals/requester";
import { committeeStandingOf } from "@/lib/approvals/recall-store";
import { CellStack, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { fieldLabel } from "@/lib/audit/diff";
import { routeTone, stepTone } from "@/lib/ui/status-tone";
import { issueDayFor, newerIssueNote, noIssueOnRaisedText } from "@/lib/authority/issue";
import { loadIssue, loadMatrixVersion, loadOverrideMatrix, loadPinnedRule } from "@/lib/authority/load";
import { MATTER_KIND_LABEL, OUTCOME_LABEL, SIGNED_MINUTES_LABEL, SIGNED_MINUTES_TONE, signedMinutesState } from "@/lib/committee/labels";
import { tablingQuery } from "@/lib/committee/table-prefill";
import { dayToDate, storedDay } from "@/lib/dates";
import { formatOrgDay, formatDate, formatRM, formatRouteBand } from "@/lib/format";
import { ACT_DONE_LABEL, ACT_LABEL, condLabel, routedOnLabel } from "@/lib/labels";
import { parseSen } from "@/lib/money";
import { pathTo } from "@/lib/organisation/structure";
import { loadDelegations, loadRoster } from "@/lib/people/load";
import { approvalCommitment, identityHolds, isStale, overBudgetDisposition, type BudgetSnapshot } from "@/lib/requisition/budget";
import { eligibleEndorsers, endorsementFaults, endorsersFor } from "@/lib/requisition/endorsement";
import { blocking, requisitionFaults } from "@/lib/requisition/fields";
import { fundingGate } from "@/lib/requisition/funding";
import { ableToAct, deciderFaults, holdersFor, NO_EARLIER_RECORDERS, requesterHoldsApprover } from "@/lib/requisition/holders";
import { earlierRecordersOf } from "@/lib/requisition/earlier-recorders";
import { requesterOnlySteps, requesterOnlyText } from "@/lib/authority/requester-only";
import {
  approvalRouteLabel,
  GATE_STATE_LABEL,
  GATE_STATE_TONE,
  gateOutcomeLabel,
  returnedAtApproval,
  trailRouteStatusLabel,
  undecidedStepText,
  UNPOSTED_TEXT,
  UNPOSTED_TITLE,
  DECIDER_FAULT_TEXT,
  DECISION_LABEL,
  endorsementFaultText,
  fieldFaultText,
  fundingFaultText,
  knownFieldName,
  OPERATOR_LABEL,
  POSTURE_LABEL,
  SOURCE_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  TIER_LABEL,
  transitionFaultText,
  VERDICT_LABEL,
  VERDICT_TONE,
} from "@/lib/requisition/labels";
import {
  draftOf,
  loadControls,
  loadLookups,
  loadPolicy,
  loadRequisition,
  num,
  gateMattersOf,
  recordOf,
  requisitionHistory,
  gatesForRequisition,
  type LoadedRequisition,
} from "@/lib/requisition/repo";
import { prRefusal } from "@/lib/requisition/pr-pdf-data";
import { resolveRequisitionRoute } from "@/lib/requisition/route";
import { returnedRouteCitationNotes } from "@/lib/requisition/committee-step";
import { choicesFor, earlierSteps, returnTargetBefore, type RejectionKind } from "@/lib/authority/rejection";
import { appliedText, CHOICE_WHY_SHORT, CHOICE_WHY_TEXT, ifRejectedText, REJECTION_KIND_LABEL } from "@/lib/authority/rejection-labels";
import { routeCoreText, stepOriginText } from "@/lib/authority/core-routing-labels";
import { SENT_BACK_LABEL, sentBackBy } from "@/lib/requisition/sent-back";
import { GATE_DOMAIN, gateOpenReason } from "@/lib/requisition/gate";
import { unpostedIntakeReason, type UnpostedReason } from "@/lib/requisition/budget";
import { SUCCESSOR_OPEN_TEXT, successorOpenFault, transitionFault } from "@/lib/requisition/status";
import { splitStateLabel } from "@/lib/requisition/splitting";
import type { OrgUnitKind } from "@/lib/requisition/types";

import {
  Blocked,
  CancelDrawer,
  ChangeFundingDrawer,
  ChangeFundingSourceDrawer,
  CheckBudgetDrawer,
  CheckGatesDrawer,
  CiteCommitteeDrawer,
  CiteGateDrawer,
  CloseWithoutSourcingDrawer,
  DecisionDrawer,
  HEADER_NOTE_ID,
  ExternalAuthorityDrawer,
  MarkEndorsed,
  RecallDrawer,
  RecordEndorsementDrawer,
  ReopenDrawer,
  WhereItGoesDrawer,
  ReturnDrawer,
  SubmitDrawer,
} from "../editors";

import { loadAttributions, routeActed } from "@/lib/auth/attribution-read";
import { db } from "@/lib/db";
import { loadSecurityPolicy } from "@/lib/auth/policy-store";
import { openFault } from "@/lib/method/exercise";
import { EXERCISE_STATUS_LABEL, EXERCISE_STATUS_TONE, findingText, REGIME_SHORT } from "@/lib/method/labels";
import type { ExerciseStatus, Regime } from "@/lib/method/types";
import { addSen, formatMoney } from "@/lib/money";
import { historyMoneyText, linesSubtitle } from "@/lib/requisition/money-text";
import { requireStaff } from "@/app/_auth/actor";
import { mayReadBudget } from "@/lib/insights/query";

export const metadata = { title: "Requisition" };
export const dynamic = "force-dynamic";

const TONE = { neutral: "neutral", brand: "brand", ok: "ok", warn: "warn", err: "err", info: "info" } as const;
const ORGANISATION_HREF = "/configuration/organisation";
const CONTROLS_HREF = "/configuration/requisitions";
const BUDGET_HREF = "/configuration/budget";
const REFERENCE_HREF = "/configuration/reference-data";
const PRE_SUBMIT = ["ENDORSED", "REGISTERED", "BUDGET_CHECKED", "OVER_BUDGET"];
const TERMINAL = ["CANCELLED", "CLOSED"];

const sen = (v: { toString(): string } | null) => (v == null ? null : parseSen(v.toString()));
const money = (v: { toString(): string } | null) => (v == null ? "Not recorded" : formatRM(num(v)));

export default async function RequisitionPage(props: PageProps<"/requisitions/[id]">) {
  const actor = await requireStaff();
  const [{ id }, { tab }] = await Promise.all([props.params, props.searchParams as Promise<{ tab?: string }>]);
  const l = await loadRequisition(actor.organisationId, id);
  if (!l) notFound();
  const r = l.req;
  const today = l.org.today;
  const on = today ? dayToDate(today) : new Date();

  // The department estimate is SULIT (NFR-SEC-002, ADR 0034 D14): a requisition keeps no list of who is named on it, so only the organisation-wide permission opens
  // it, and it is undecided until the organisation decides. One answer for the page, logged; everything made of the estimate (its lines, the commitment, the
  // balance it leaves) is held to it.
  const estimate = await sulitGate(actor, { scope: "requisition", entity: "Requisition", id, label: r.reference }, fieldsOfScope("requisition"));
  const rm = (text: string) => through(estimate, text);
  // FR-MTD-007: an exercise restricted to its named people is not listed to anyone else.
  const hiddenExerciseIds = await hiddenExercises(actor);
  const [policy, controls, { lookups, formats, costCentres, accountCodes, sites }, roster, delegations, history, everyExercise, methodCount] = await Promise.all([
    loadPolicy(l.org.id),
    loadControls(l.org.id),
    loadLookups(l.org.id),
    loadRoster(actor.organisationCode),
    loadDelegations(actor.organisationCode),
    requisitionHistory(l),
    db.sourcingExercise.findMany({ where: { requisitionId: id, organisationId: actor.organisationId }, orderBy: { createdAt: "asc" }, select: { id: true, reference: true, title: true, estimatedValue: true, status: true, regime: true, sourcingMethodCode: true } }),
    db.sourcingMethod.count({ where: { organisationId: l.org.id, OR: [{ retiredOn: null }, { retiredOn: { gt: new Date() } }] } }),
  ]);
  const methodNames = new Map((await db.sourcingMethod.findMany({ where: { organisationId: l.org.id }, select: { code: true, nameEn: true } })).map((m) => [m.code, m.nameEn]));
  // What is listed is what this reader may see; what is added up (to say whether another exercise may be opened) is every one of them.
  const exercises = everyExercise.filter((x) => !hiddenExerciseIds.includes(x.id));
  // Each exercise's estimate is SULIT: judged for this reader and logged (ADR 0034 D14). What is in live exercises and what is left are sums of them, so they are
  // shown only where every live exercise is listed to this reader with its figure; otherwise the sentence says they are not shown.
  const exerciseValues = await sulitExerciseValues(actor, exercises.map((x) => ({ id: x.id, reference: x.reference })), "estimatedValue", (xid) => formatMoney(parseSen(exercises.find((x) => x.id === xid)!.estimatedValue.toString())));
  const liveExercises = everyExercise.filter((x) => x.status !== "CANCELLED").length;
  const sumsShown = exercises.filter((x) => x.status !== "CANCELLED").length === liveExercises && exercises.every((x) => x.status === "CANCELLED" || exerciseValues.get(x.id)?.state === "GRANTED");
  const approvedRoute = l.req.approvalInstances.find((i) => i.status === "APPROVED") ?? null;
  const inExercises = addSen(...everyExercise.filter((x) => x.status !== "CANCELLED").map((x) => parseSen(x.estimatedValue.toString())));
  const remaining = approvedRoute ? routedValue(approvedRoute) - inExercises : null;
  const gateView = (await gatesForRequisition(id)) ?? { gates: [], finding: { code: "GATES_NOT_DETERMINED" as const, why: "NOT_CHECKED" as const } };
  const exerciseFault = openFault({ status: l.req.status, sourcingPermitted: l.req.sourcingPermitted, approvedRoute: !!approvedRoute, remaining }, { today: l.org.today, methodsConfigured: methodCount > 0, gate: gateView.finding });
  // Sittings still open for tabling a gate matter: the earliest that has not passed.
  const sittings = await db.meeting.findMany({
    where: { committee: { organisationId: l.org.id }, status: { in: ["SCHEDULED", "IN_PROGRESS"] }, ...(today ? { meetingDate: { gte: dayToDate(today) } } : {}) },
    orderBy: [{ meetingDate: "asc" }, { id: "asc" }],
    select: { id: true, committee: { select: { code: true } } },
  });

  // Names for codes: units by their latest name, business codes with their names.
  const unitName = (code: string | null) => {
    if (!code) return null;
    const rows = lookups.units.filter((u) => u.code === code).sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime());
    return rows[0]?.nameEn ?? "A unit no longer configured";
  };
  const named = (xs: { code: string; nameEn: string }[], code: string | null) =>
    code ? `${code} · ${xs.find((x) => x.code === code)?.nameEn ?? "no longer configured"}` : null;
  const personName = (pid: string | null) => (pid ? (lookups.people.find((p) => p.id === pid)?.name ?? "Not on record") : null);
  const route = lookups.fundingRoutes.find((x) => x.code === r.fundingRouteCode) ?? null;
  // ADR 0046 FS-6: once a live contract stands under the requisition, its source no longer moves here.
  const liveContracts = await db.contract.count({ where: { organisationId: l.org.id, status: { not: "CANCELLED" }, award: { exercise: { requisitionId: r.id } } } });
  const inUse = <T extends { retiredOn: Date | null }>(x: T) => x.retiredOn == null || x.retiredOn > on;
  const funding = {
    source: r.fundingSourceId ? (lookups.fundingSources.find((s) => s.id === r.fundingSourceId)?.nameEn ?? "A source no longer configured") : null,
    category: r.projectCategoryCode ? (lookups.projectCategories.find((c) => c.code === r.projectCategoryCode)?.nameEn ?? "A category no longer configured") : null,
    sources: lookups.fundingSources.filter(inUse).map((s) => ({ value: s.id, label: s.nameEn })),
    categories: lookups.projectCategories.filter(inUse).map((c) => ({ value: c.code, label: c.nameEn })),
    sourceLocked: liveContracts > 0,
  };
  const people = lookups.people.filter((p) => p.isActive).map((p) => ({ value: p.id, label: p.name }));

  // The pure checks the buttons are disabled on.
  const draft = draftOf(r);
  const allFieldFaults = requisitionFaults(draft, lookups, formats, on);
  const fieldFaults = blocking(allFieldFaults);
  const unit = r.sectionUnitCode || r.requestingUnitCode;
  const endorsements = r.endorsements.map((e) => ({ tier: e.tier as OrgUnitKind, unitCode: e.unitCode, personId: e.personId, endorsedOn: storedDay(e.endorsedOn) }));
  const eFaults = endorsementFaults(unit, policy.endorsementTiers, endorsements, lookups.units, today);
  const gate = fundingGate(route, { externalAuthorityRef: r.externalAuthorityRef }, on);
  const lastCheck = r.budgetChecks[0] ?? null;
  const inst = r.approvalInstances[0] ?? null;
  const open = inst?.status === "PENDING" ? inst : null;
  // The day the final step was decided, which is the day the commitment was written; read from the stored step, never worked out here.
  const approvedOn = inst?.status === "APPROVED" ? (inst.steps[inst.steps.length - 1]?.decidedOn ?? null) : null;
  // The band the route ran under, from the rule its pinned issue holds (FR-APR-019, R4).
  const pinnedRule = inst?.checkedAgainstMatrix ? await loadPinnedRule(inst) : null;
  const routeBand = inst && pinnedRule ? formatRouteBand({ min: pinnedRule.minValue, max: pinnedRule.maxValue }, { value: inst.boundaryValue, operator: inst.boundaryOperator }) : null;
  // A rejection that decided nothing waits for the officer's choice (FR-APR-016, CO-5);
  // one rejected before destinations existed is offered the same choice.
  const rejectingStep = r.status === "REJECTED" && inst?.status === "REJECTED" ? (inst.steps.find((s) => s.decision === "REJECTED") ?? null) : null;
  const awaitingChoice =
    rejectingStep && inst && !inst.rejectionApplied
      ? {
          offered: inst.rejectionChoices.length > 0 ? (inst.rejectionChoices as RejectionKind[]) : choicesFor(["RETURN_TO_ORIGINATOR", "RETURN_TO_STEP", "TERMINATE"], inst.steps, rejectingStep.sequence),
          why: (inst.rejectionChoiceWhy as keyof typeof CHOICE_WHY_TEXT | null) ?? "NOT_SET",
          steps: earlierSteps(inst.steps, rejectingStep.sequence).map((s) => ({ value: String(s.sequence), label: `${s.sequence}. ${s.roleLabel} · ${actLabel(s.act)}` })),
        }
      : null;

  const endorseBlock = transitionFault(r.status, "ENDORSED", {
    today,
    fieldFaults: fieldFaults.length,
    tiersSet: policy.endorsementTiers.length > 0,
    endorsementFaults: eFaults.length,
  });

  // Submission, as far as it can be judged before the lock: the same pure checks.
  const noBudgetCode = missingBudgetCode(r.status, r.budgetCodeId);
  let submitBlocker: string | null = null;
  let checkNeeded = false;
  let overBudget: { invocation: boolean; controlNotSet: boolean; auto: boolean; ifRechecked?: boolean } | null = null;
  let preview: ReturnType<typeof resolveRequisitionRoute> | null = null;
  let previewRoles: Record<string, { nameEn: string }> = {};
  let previewNote: string | null = null;
  let previewRefusal: string | null = null;
  if (PRE_SUBMIT.includes(r.status)) {
    const stale = lastCheck && today ? isStale(storedDay(lastCheck.asAt), policy.budgetRecheckDays, today) : false;
    if (!today) submitBlocker = transitionFaultText({ code: "TIME_ZONE_UNSET" });
    else if (noBudgetCode) submitBlocker = MISSING_BUDGET_CODE_TEXT[noBudgetCode];
    else if (fieldFaults.length > 0) submitBlocker = fieldFaultText(fieldFaults[0]);
    else if (gate.faults.length > 0) submitBlocker = fundingFaultText(gate.faults[0]);
    else if (!lastCheck) submitBlocker = "Run the budget check first.";
    else if (stale && controls.budgetCheckSource === "MANUAL_ERP_ENTRY") submitBlocker = "Last check is stale. Enter a fresh one.";
    checkNeeded = !lastCheck || (stale && controls.budgetCheckSource === "MANUAL_ERP_ENTRY");
    if (lastCheck) {
      const d = overBudgetDisposition(lastCheck.verdict, controls.availabilityCheck, false);
      if (!d.proceed && (d.fault === "NO_BUDGET" || d.fault === "AMBIGUOUS")) {
        submitBlocker ??= d.fault === "NO_BUDGET" ? "No budget on the budget code." : "Account is not the budget code's.";
      }
      if (lastCheck.verdict === "EXCEEDS") overBudget = { invocation: !d.proceed, controlNotSet: d.controlNotSet, auto: d.proceed };
      // A stale check is re-run on submission and may then find it over budget: offer
      // the invocation up front, so that refusal is never a dead end. It is ignored
      // unless the fresh check is over budget.
      else if (stale && controls.budgetCheckSource === "PORTAL_LEDGER" && controls.availabilityCheck !== "advisory") {
        overBudget = { invocation: true, controlNotSet: controls.availabilityCheck !== "blocking", auto: false, ifRechecked: true };
      }
    }
    // Routed under the issue in force on the day it was raised (FR-APR-020, ruling R2),
    // as submission will route it; who can act is read on today.
    const issueDay = issueDayFor("REQUISITION", { raisedOn: r.raisedOn, submittedOn: on });
    const dal = await loadIssue(actor.organisationCode, issueDay, undefined, null);
    if (!dal) submitBlocker ??= noIssueOnRaisedText(formatDate(issueDay));
    else {
      previewRoles = dal.matrix.roles;
      const override = gate.supersedesAuthority && r.fundingRouteCode ? await loadOverrideMatrix(actor.organisationCode, r.fundingRouteCode, issueDay) : null;
      previewNote =
        [
          newerIssueNote(dal, await loadMatrixVersion(actor.organisationCode, on), formatDate(issueDay)),
          override && r.fundingRouteCode ? newerIssueNote(override, await loadMatrixVersion(actor.organisationCode, on, r.fundingRouteCode), formatDate(issueDay)) : null,
        ]
          .filter((n) => n != null)
          .map((n) => n.messageEn)
          .join(" ") || null;
      const path = pathTo(lookups.units, unit, on).reverse().map((u) => u.code);
      // As submission will judge it: an office with nobody able to act reverts upward.
      const byId = new Map(roster.people.map((p) => [p.id, p]));
      const absentRoleCodes = today
        ? absentOffices(Object.keys(dal.matrix.roles).filter((c) => !dal.matrix.roles[c].isCommittee), (c) => holdersFor(c, path, roster, delegations, today), (pid) => !!byId.get(pid)?.isActive && !!byId.get(pid)?.isAvailable)
        : [];
      const q = { value: num(r.estimatedValue)!, overBudget: lastCheck?.verdict === "EXCEEDS", fundingRouteCode: r.fundingRouteCode, fundingSupersedesAuthority: gate.supersedesAuthority === true, absentRoleCodes };
      preview = resolveRequisitionRoute(dal.matrix, override, q);
      if (preview.resolution.approverCode && today && requesterHoldsApprover(preview.resolution.approverCode, r.requestingPersonId, path, roster, delegations, today)) {
        preview = resolveRequisitionRoute(dal.matrix, override, { ...q, actorRoleCode: preview.resolution.approverCode });
      }
      if (preview.faults.length > 0) submitBlocker ??= preview.faults[0].messageEn;
      // FR-APR-008 (ruling R1), as submission will judge it.
      if (today && preview.faults.length === 0) {
        const available = (pid: string) => !!byId.get(pid)?.isActive && !!byId.get(pid)?.isAvailable;
        const valueSen = parseSen(r.estimatedValue.toString());
        const onlyRequester = requesterOnlySteps(preview.resolution.chain, r.requestingPersonId, (c) => ableToAct(holdersFor(c, path, roster, delegations, today), r.requestingPersonId, valueSen, available));
        const office = (c: string) => (override?.matrix.roles[c] ?? dal.matrix.roles[c])?.nameEn ?? "an office no longer configured";
        if (onlyRequester.length > 0) {
          previewRefusal = onlyRequester.map((x) => requesterOnlyText(x, office(x.roleCode), "requisition", dal.matrix.policy.clauses?.selfApproval)).join(" ");
          submitBlocker ??= previewRefusal;
        }
      }
    }
  }

  const checkBlocker = !PRE_SUBMIT.includes(r.status)
    ? null
    : !today
      ? transitionFaultText({ code: "TIME_ZONE_UNSET" })
      : !controls.budgetCheckSource
        ? "Budget check source not set. Set it in Requisition controls."
        : noBudgetCode
          ? MISSING_BUDGET_CODE_TEXT[noBudgetCode]
          : null;

  // Say what is wrong, not how many things are: "the lines come to RM9,500, not
  // RM12,000" rather than "1 field needs attention".
  const endorseText = !endorseBlock
    ? null
    : endorseBlock.code === "FIELDS_INCOMPLETE" && fieldFaults.length > 0
      ? `${fieldFaultText(fieldFaults[0])}${fieldFaults.length > 1 ? ` And ${fieldFaults.length - 1} more on the Overview tab.` : ""}`
      : transitionFaultText(endorseBlock);

  // Who may decide a step, judged as the action judges it, so the drawer's list says
  // who is barred and why before anyone is chosen.
  const BARRED_WHY: Partial<Record<string, string>> = {
    ENDORSED_IT: "endorsed it",
    SELF_APPROVAL: "raised it",
    ALREADY_DISCHARGED_A_STEP: "decided another step",
    DECLARED_CONFLICT: "declared a conflict on this step",
    OVER_CEILING: "value over their delegation's ceiling",
    DELEGATION_NOT_PERMITTED: "a delegate, and this step cannot be delegated",
    INACTIVE: "recorded as having left",
  };
  // Who keyed the requisition, an endorsement or another step for someone else, step by step as the action reads them: they are barred as the person they keyed it for is.
  const earlierByStep = new Map(
    open
      ? await Promise.all(
          open.steps.map(async (s) => [s.id, await earlierRecordersOf(db, l.org.id, { requisitionId: r.id, otherStepIds: open.steps.filter((x) => x.id !== s.id && x.decidedByPersonId).map((x) => x.id) })] as const),
        )
      : [],
  );
  const deciderOptions = (step: { id: string; roleCode: string | null; actingRoleCode: string | null; declaredByPersonId: string | null; committeeCode: string | null; nonDelegable: boolean; decision: string }) => {
    const office = step.actingRoleCode ?? step.roleCode;
    if (!open || !today || !office) return { options: people, candidates: 0, eligible: 0, eligibleIds: [] as string[], barred: [] as string[] };
    const path = pathTo(lookups.units, unit, on).reverse().map((u) => u.code);
    const h = holdersFor(office, path, roster, delegations, today);
    const eligibleIds: string[] = [];
    const barredOpts: { value: string; label: string }[] = [];
    const barred: string[] = [];
    const labelled = new Map<string, string>();
    for (const pid of [...h.holderIds, ...h.delegates.map((d) => d.personId)]) {
      if (labelled.has(pid)) continue;
      const person = lookups.people.find((p) => p.id === pid) ?? null;
      const name = person?.name ?? "Not on record";
      const faults = deciderFaults(step, {
        today,
        holders: h,
        person,
        requesterId: routeRequesterId("REQUISITION", { requisitionRaiserId: r.requestingPersonId }) ?? "",
        earlier: earlierByStep.get(step.id) ?? NO_EARLIER_RECORDERS,
        endorserIds: [],
        endorsements: r.endorsements.map((e) => ({ personId: e.personId, unitCode: e.unitCode })),
        rootUnitCode: path[path.length - 1] ?? null,
        otherDeciderIds: open.steps.filter((s) => s.id !== step.id && s.decidedByPersonId).map((s) => s.decidedByPersonId!),
        declaredConflictIds: step.declaredByPersonId ? [step.declaredByPersonId] : [],
        earlierDone: true,
        decidedOn: today,
        openedOn: storedDay(open.openedAt),
        value: parseSen(r.estimatedValue.toString()),
      }).faults;
      const via = h.holderIds.includes(pid) ? null : h.delegates.find((d) => d.personId === pid);
      const role = via ? `delegate of ${personName(holderOf(via.delegation)) ?? "a holder no longer on record"}` : "holds the office";
      const why = faults.map((f) => BARRED_WHY[f]).filter(Boolean);
      if (why.length === 0) {
        eligibleIds.push(pid);
        labelled.set(pid, `${name} — ${role}`);
      } else {
        labelled.set(pid, `${name} — ${role}, cannot decide: ${why.join(", ")}`);
        barredOpts.push({ value: pid, label: labelled.get(pid)! });
        barred.push(`${name} (${why.join(", ")})`);
      }
    }
    const eligibleOpts = eligibleIds.map((pid) => ({ value: pid, label: labelled.get(pid)! }));
    const rest = people.filter((p) => !labelled.has(p.value));
    return { options: [...eligibleOpts, ...barredOpts, ...rest], candidates: labelled.size, eligible: eligibleIds.length, eligibleIds, barred };
  };

  const recallBlock = r.status === "PENDING_APPROVAL" ? transitionFault(r.status, "RECALLED", { today, anyStepDone: open?.steps.some((s) => s.decision !== "PENDING") ?? false }) : null;
  // FR-APR-017: only the originator recalls. The action asks the same rule again, and also whether the matter is on a committee's agenda.
  const requisitionStanding = r.status === "PENDING_APPROVAL" && open ? await committeeStandingOf(db, { requisitionId: r.id }, open.domain, open.openedAt) : null;
  const originatorIds = open ? [...new Set([r.requestingPersonId, open.submittedByPersonId].filter((x): x is string => !!x))] : [];
  const recallRule = r.status === "PENDING_APPROVAL" && open ? recallFault({ routeStatus: open.status, steps: open.steps, tabledAwaitingDecision: requisitionStanding?.awaiting ?? 0, committeeDecided: requisitionStanding?.decided ?? 0, originatorIds, actorPersonId: actor.personId, reason: "asked" }) : null;
  // Recall is drawn only for the people who could ever use it (FR-APR-017); the action asks the same rule again.
  const isOriginator = r.status === "PENDING_APPROVAL" && originatorIds.includes(actor.personId);
  const recallBlocker = recallBlock ? transitionFaultText(recallBlock) : recallRule ? RECALL_FAULT_TEXT[recallRule] : null;
  const locked = !["DRAFT"].includes(r.status);
  const sentBack = sentBackBy(r.status, r.approvalInstances, r.returnedOn);
  const erpFirst = r.erpRequisitionNo ? `${r.erpRequisitionNo} · ${r.reference}` : r.reference;

  // The header's one primary action, chosen by status and by what this viewer may do (plan 6.3); the rest sit in the menu.
  const pendingStep = open?.steps.find((s) => s.decision === "PENDING") ?? null;
  const plainStep = pendingStep && !pendingStep.committeeCode && pendingStep.roleCode ? pendingStep : null;
  const liveHere = exercises.filter((x) => x.status !== "CANCELLED");
  const kind = primaryAction({
    status: r.status,
    step: plainStep ? { committee: false } : pendingStep ? { committee: true } : null,
    viewerDecides: plainStep ? deciderOptions(plainStep).eligibleIds.includes(actor.personId) : false,
    viewerMayRecall: isOriginator && !recallBlocker,
    budgetCheckNeeded: checkNeeded,
    awaitingChoice: !!awaitingChoice,
    canSource: !exerciseFault,
    liveExercises: liveHere.length,
  });
  const decideBlocker = plainStep && !today ? DECIDER_FAULT_TEXT.TIME_ZONE_UNSET : null;
  const decider = (asPrimary: boolean, label?: string) =>
    plainStep ? (
      <DecisionDrawer paper={!asPrimary} id={r.id} stepId={plainStep.id} roleLabel={plainStep.actingRoleLabel ?? plainStep.roleLabel} act={ACT_LABEL[plainStep.act]} done={ACT_DONE_LABEL[plainStep.act] ?? "Done"} people={deciderOptions(plainStep).options} today={today} blocker={decideBlocker} label={label} menu={!asPrimary} />
    ) : null;
  const exerciseHref = liveHere.length === 1 ? `/sourcing/${liveHere[0].id}` : `/requisitions/${r.id}?tab=sourcing`;

  // Why the primary action is unavailable, stated once under the action row.
  const notes = (
    [
      ["Mark endorsed", kind === "endorse" ? endorseText : null],
      ["Check budget", kind === "check" ? (checkBlocker ?? (controls.budgetCheckSource ? null : "The budget check source is not set.")) : null],
      ["Submit for approval", kind === "submit" ? submitBlocker : null],
      ["Record decision", kind === "approve" ? decideBlocker : null],
    ] as [string, string | null][]
  ).filter((x): x is [string, string] => x[1] != null);
  // The same reason for two buttons (no time zone, say) is said once.
  const distinct = [...new Map(notes.map(([label, why]) => [why, label])).entries()];
  const headerNote =
    distinct.length === 0 ? null : (
      <span className="flex flex-col gap-0.5">
        {distinct.map(([why]) => (
          <span key={why}>
            <span className="font-semibold text-ink-2">
              {notes.filter((n) => n[1] === why).map((n) => n[0]).join(", ")}:
            </span>{" "}
            {why}
          </span>
        ))}
      </span>
    );

  const approver = plainStep ? (plainStep.actingRoleLabel ?? plainStep.roleLabel) : null;
  const why =
    kind === "approve" && inst?.checkedAgainstMatrix && inst.ruleLabel && approver ? (
      <RuleInfo label="Why this approver?" rule={`${approver} decides this step under ${inst.ruleLabel}${routeBand ? `, ${routeBand}` : ""}.`} clause={inst.ruleClause} />
    ) : null;
  const downloadable = prRefusal(r.status, !!approvedRoute) === null;
  const menuFor = headerMenu({
    kind,
    plainStep: !!plainStep,
    viewerMayRecordForOthers: actor.permissions.has("acts.recordOnBehalf"),
    paperSignaturesAllowed: plainStep ? (await loadSecurityPolicy(db, actor.organisationId))?.paperSignatureRecording === "ALLOWED" : false,
    viewerRaisedIt: actor.personId === r.requestingPersonId || actor.personId === open?.submittedByPersonId,
    viewerIsOriginator: isOriginator,
    recallUsable: !recallBlocker,
  });
  const inMenu = {
    edit: r.status === "DRAFT",
    check: PRE_SUBMIT.includes(r.status) && kind !== "check",
    ret: PRE_SUBMIT.includes(r.status),
    ...menuFor,
    cancel: ["DRAFT", "ENDORSED", "RETURNED", "REGISTERED", "BUDGET_CHECKED", "OVER_BUDGET"].includes(r.status),
    download: downloadable,
  };

  const actions = (
    <>
      {kind === "endorse" && <MarkEndorsed id={r.id} blocker={endorseText} source={controls.budgetCheckSource} />}
      {kind === "check" && <CheckBudgetDrawer id={r.id} source={controls.budgetCheckSource} blocker={checkBlocker} today={today} primary />}
      {kind === "submit" && <SubmitDrawer id={r.id} blocker={submitBlocker} overBudget={overBudget} />}
      {kind === "approve" && decider(true, ACT_LABEL[plainStep!.act])}
      {kind === "recall" && <RecallDrawer id={r.id} blocker={null} primary />}
      {kind === "reopen" && <ReopenDrawer id={r.id} />}
      {kind === "choose" && awaitingChoice && (
        <WhereItGoesDrawer id={r.id} kinds={awaitingChoice.offered.map((k) => ({ value: k, label: REJECTION_KIND_LABEL[k] }))} steps={awaitingChoice.steps} people={people} />
      )}
      {kind === "source" && (
        <ButtonLink href={`/sourcing/new?requisition=${r.id}`} variant="primary" size="sm">
          Start sourcing
        </ButtonLink>
      )}
      {kind === "exercise" && (
        <ButtonLink href={exerciseHref} variant="primary" size="sm">
          {liveHere.length === 1 ? "Open tender or quotation" : "Open sourcing"}
        </ButtonLink>
      )}
      {why}
      {Object.values(inMenu).some(Boolean) && (
        <MoreActions>
          {inMenu.edit && <MoreItem href={`/requisitions/${r.id}/edit`}>Edit</MoreItem>}
          {inMenu.check && <CheckBudgetDrawer id={r.id} source={controls.budgetCheckSource} blocker={checkBlocker} today={today} menu />}
          {/* Founder, 2026-10-06: returnable as incomplete until it is submitted, also after the budget check. */}
          {inMenu.ret && <ReturnDrawer id={r.id} people={people} today={today} />}
          {inMenu.record && decider(false, "Record a paper decision")}
          {inMenu.recall && <RecallDrawer id={r.id} blocker={recallBlocker} />}
          {inMenu.cancel && <CancelDrawer id={r.id} />}
          {/* Founder, 2026-10-05: the expenditure request form, once approved. A plain link: it is a file, not a page. */}
          {inMenu.download && (
            <a href={`/requisitions/${r.id}/pr.pdf`} download className={moreItemClass()}>
              <DownloadIcon size={15} />
              Download PR
            </a>
          )}
        </MoreActions>
      )}
    </>
  );

  return (
    <>
      <RecordCrumb label={r.reference} />
      <PageHeader
        title={r.title}
        badge={
          <>
            <Badge tone={sentBack ? "warn" : TONE[STATUS_TONE[r.status]]} dot>
              {sentBack ? SENT_BACK_LABEL : STATUS_LABEL[r.status]}
            </Badge>
            {r.origin === "EXTERNAL" && <InfoChip tone="info" detail="Numbers, budget figures and approval trail are stored as typed. The trail is not checked against the approval matrix.">From finance system</InfoChip>}
          </>
        }
        subtitle={
          r.status === "CANCELLED"
            ? r.cancelReason || "No reason recorded"
            : r.status === "CLOSED" && r.closedReason
              ? r.closedReason
              : `${unitName(r.requestingUnitCode)}${r.sectionUnitCode ? ` · ${unitName(r.sectionUnitCode)}` : ""} · raised by ${r.requestingPerson.name}`
        }
        meta={[
          // Founder, 2026-10-05: the reference in the header's own font, and the finance system's
          // number only once one is recorded (no "not recorded" placeholder).
          <span key="ref">{r.erpRequisitionNo ? erpFirst : r.reference}</span>,
          <SulitValue key="v" of={rm(formatRM(num(r.estimatedValue)))} />,
          `Required by ${formatDate(r.dateRequired)}`,
          route ? route.nameEn : "Funding route not set",
          ...(r.commitmentMovementId && inst?.status === "APPROVED" && approvedOn
            ? [
                <span key="commit" className="inline-flex items-center gap-1">
                  Committed <SulitValue of={rm(formatRM(num(r.estimatedValue)))} /> on {formatDate(approvedOn)}
                </span>,
              ]
            : []),
        ]}
        actions={actions}
        actionsNote={headerNote}
        actionsNoteId={HEADER_NOTE_ID}
      />

      {!TERMINAL.includes(r.status) && r.status !== "APPROVED" && !today && (
        <Callout
          tone="warn"
          className="mb-6"
          title="Time zone not set. Nothing can be recorded."
          action={
            <ButtonLink href={ORGANISATION_HREF} size="sm">
              Set time zone
            </ButtonLink>
          }
        />
      )}
      {r.status === "OVER_BUDGET" && inst?.status === "RECALLED" && returnedAtApproval(inst.warnings) && (
        <Callout tone="warn" className="mb-6" title="Returned at approval: budget no longer covers it">
          Submit again on the over-budget route.
          {returnedRouteCitationNotes({ returnedAtApproval: true, steps: inst.steps }).map((n) => (
            <span key={n} className="mt-1.5 block">
              {n}
            </span>
          ))}
        </Callout>
      )}
      {r.status === "REJECTED" && inst && (
        <Callout tone="err" className="mb-6" title={awaitingChoice ? "Rejected. The officer chooses where it goes." : "Rejected"}>
          {inst.rejectionReason ? `“${inst.rejectionReason}” ` : ""}
          {awaitingChoice ? (inst.rejectionChoices.length > 0 ? CHOICE_WHY_SHORT[awaitingChoice.why] : "No destination was recorded.") : null}
        </Callout>
      )}
      {sentBack && (
        <Callout
          tone="warn"
          className="mb-6"
          title={SENT_BACK_LABEL}
          action={
            <ButtonLink href={`/requisitions/${r.id}?tab=approval`} size="sm" variant="secondary">
              See the rejection
            </ButtonLink>
          }
        >
          {sentBack.reason ? `“${sentBack.reason}”` : "No reason recorded."} Change, endorse and submit again.
        </Callout>
      )}
      {r.status === "RETURNED" && (
        <Callout tone="warn" className="mb-6" title={`Returned to ${r.returnedTo?.name ?? "Not recorded"} on ${formatDate(r.returnedOn)}`}>
          {r.returnedReason || "No reason recorded."}
        </Callout>
      )}

      <Tabs
        initial={tab}
        label="Requisition"
        tabs={[
          {
            id: "overview",
            label: "Overview",
            icon: <ClipboardIcon size={15} />,
            panel: (
              <Overview
                estimate={estimate}
                l={l}
                facts={{
                  department: unitName(r.requestingUnitCode) ?? "Not set",
                  section: unitName(r.sectionUnitCode) ?? "None",
                  costCentre: named(costCentres, r.costCentreCode || null) ?? "Not set",
                  account: named(accountCodes, r.accountCode || null) ?? "Not set",
                  site: r.siteCode ? (sites.find((x) => x.code === r.siteCode)?.nameEn ?? "A site no longer configured") : "None",
                }}
                fieldNotes={allFieldFaults.map(fieldFaultText)}
                locked={locked}
                endorsement={{
                  tiers: policy.endorsementTiers,
                  endorsers: endorsersFor(unit, policy.endorsementTiers, lookups.units, on).map((x) => ({
                    tier: x.tier,
                    unit: x.unit?.nameEn ?? null,
                    head: personName(x.headPersonId),
                    fault: x.fault,
                  })),
                  faults: eFaults.map((f) => endorsementFaultText(f, (pid) => personName(pid) ?? "That person")),
                  canRecord: r.status === "DRAFT",
                  people,
                  // Founder, 2026-10-05: each tier offers only who heads its unit, from the day raised to today.
                  byTier: Object.fromEntries(
                    policy.endorsementTiers.map((t) => [
                      t,
                      eligibleEndorsers(unit, t, lookups.units, storedDay(r.raisedOn), today ?? storedDay(r.raisedOn), r.requestingPersonId)
                        .filter((pid) => lookups.people.some((x) => x.id === pid && x.isActive))
                        .map((pid) => ({ value: pid, label: personName(pid) ?? "Not on record" })),
                    ]),
                  ),
                  today,
                }}
              />
            ),
          },
          // Founder, 2026-10-05: the tabs follow the requisition's flow, overview, checks, approval, sourcing, history,
          // and the budget check sits with the other checks rather than on a tab of its own.
          {
            id: "checks",
            label: "Budget and checks",
            icon: <ShieldIcon size={15} />,
            count: r.budgetChecks.length,
            panel: (
              <div className="flex flex-col gap-6">
                <BudgetPanel
                estimate={estimate}
                  budgetReadable={mayReadBudget(actor)}
                  l={l}
                  unposted={
                    r.origin === "EXTERNAL" && !r.commitmentMovementId
                      ? unpostedIntakeReason(controls.budgetCheckSource, (route as { approvalCommitsBudget?: boolean | null } | null)?.approvalCommitsBudget ?? null)
                      : null
                  }
                  controls={controls}
                  recheckDays={policy.budgetRecheckDays}
                  checkAction={
                    !checkBlocker && controls.budgetCheckSource ? (
                      <CheckBudgetDrawer id={r.id} source={controls.budgetCheckSource} blocker={null} today={today} />
                    ) : undefined
                  }
                />
                <ChecksPanel
                  l={l}
                  gate={{ ...gate, faults: gate.faults.map(fundingFaultText) }}
                  route={
                    route
                      ? {
                          name: route.nameEn,
                          requires: route.requiresExternalAuthorityRef,
                          label: route.externalAuthorityRefLabel,
                          commitsBudget: (route as { approvalCommitsBudget?: boolean | null }).approvalCommitsBudget ?? null,
                        }
                      : null
                  }
                  routes={lookups.fundingRoutes.filter((x) => x.retiredOn == null || x.retiredOn > on).map((x) => ({ value: x.code, label: x.nameEn }))}
                  routeNameOf={(code) => lookups.fundingRoutes.find((x) => x.code === code)?.nameEn ?? null}
                  funding={funding}
                />
              </div>
            ),
          },
          {
            id: "approval",
            label: "Approval",
            icon: <RouteIcon size={15} />,
            panel: (
              <ApprovalPanel
                l={l}
                officeName={(code) => (code ? (roster.offices.find((o) => o.code === code)?.nameEn ?? "An office no longer configured") : null)}
                gates={
                  <GatesCard
                estimate={estimate}
                    l={l}
                    view={gateView}
                    exerciseBlock={exerciseFault && exerciseFault.code.startsWith("GATE") ? findingText(exerciseFault) : null}
                    tableHref={(committeeCode, subject, act) => {
                      const sitting = sittings.find((x) => x.committee.code === committeeCode);
                      return sitting
                        ? `/committees/${sitting.id}?${tablingQuery({ subject, domain: GATE_DOMAIN, act, matterKind: "REQUISITION", matterRef: r.reference, source: { kind: "requisition", id: r.id } })}`
                        : null;
                    }}
                  />
                }
                preview={preview}
                previewMatrixRoles={previewRoles}
                previewNote={previewNote}
                previewRefusal={previewRefusal}
                routeBand={routeBand}
                decide={(step) => {
                  if (!open || step.decision !== "PENDING") return null;
                  const earlierDone = open.steps.filter((s) => s.sequence < step.sequence).every((s) => s.decision === "DONE");
                  if (!earlierDone) return DECIDER_FAULT_TEXT.OUT_OF_ORDER;
                  if (!today) return DECIDER_FAULT_TEXT.TIME_ZONE_UNSET;
                  return null;
                }}
                suggestions={(step) => deciderOptions(step).options}
                stepFaultPreview={(step) => {
                  // Why the holders on file cannot decide it: the ruled conflicts, named early.
                  if (!open || !today || step.committeeCode || !step.roleCode) return null;
                  const d = deciderOptions(step);
                  if (d.candidates === 0) return "Nobody holds this office or a delegation of it.";
                  if (d.eligible > 0) return null;
                  return `Every holder is barred: ${d.barred.join("; ")}. Record a delegation.`;
                }}
              />
            ),
          },
          {
            id: "sourcing",
            label: "Sourcing",
            icon: <GlobeIcon size={15} />,
            count: exercises.length,
            panel: (
              <Card className="overflow-hidden">
                <CardHeader
                  icon={<GlobeIcon size={17} />}
                  title="Sourcing exercises"
                  subtitle={approvedRoute && remaining != null ? (sumsShown && estimate.state === "GRANTED" ? `Approved ${formatMoney(routedValue(approvedRoute))} · ${formatMoney(remaining)} left` : estimate.state === "WITHHELD" ? "Approved. Amounts are SULIT." : `Approved ${formatMoney(routedValue(approvedRoute))}. Remaining is SULIT.`) : undefined}
                  actions={
                    exerciseFault ? (
                      <Blocked label="New exercise" reason={findingText(exerciseFault)} />
                    ) : (
                      <ButtonLink href={`/sourcing/new?requisition=${r.id}`} variant="primary" size="sm">
                        New exercise
                      </ButtonLink>
                    )
                  }
                />
                {r.status === "SOURCING" && liveExercises === 0 && (
                  <div className="border-b border-line px-5 py-3 sm:px-6">
                    <Callout tone="warn" title="No live exercise">
                      Every exercise is cancelled. Open a new one.
                    </Callout>
                  </div>
                )}
                {exercises.length === 0 ? (
                  <EmptyState size="sm" title="No exercises" />
                ) : (
                  <ul className="divide-y divide-line/70">
                    {exercises.map((x) => (
                      <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 sm:px-6">
                        <span className="min-w-0">
                          <Link href={`/sourcing/${x.id}`} className="block font-semibold break-words">
                            {x.title}
                          </Link>
                          <span className="block text-[12.5px] text-ink-3">
                            <span className="font-mono">{x.reference}</span> · {methodNames.get(x.sourcingMethodCode) ?? "A method no longer configured"}
                            {x.regime ? ` · ${REGIME_SHORT[x.regime as Regime]}` : ""}
                          </span>
                        </span>
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-[13.5px] text-ink">{exerciseValues.get(x.id) ? <SulitValue of={exerciseValues.get(x.id)!} /> : null}</span>
                          <Badge tone={EXERCISE_STATUS_TONE[x.status as ExerciseStatus]}>{EXERCISE_STATUS_LABEL[x.status as ExerciseStatus]}</Badge>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
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
                entries={history.entries}
                total={history.total}
                timeZone={l.org.timeZone}
                labelFor={(field, value) => {
                  if (field === "requestingPersonId" || field === "returnedToPersonId") return personName(value) ?? "Not on record";
                  if (field === "requestingUnitCode" || field === "sectionUnitCode") return unitName(value) ?? "—";
                  if (field === "fundingRouteCode") return lookups.fundingRoutes.find((x) => x.code === value)?.nameEn ?? "A route no longer configured";
                  if (field === "fundingSourceId") return lookups.fundingSources.find((x) => x.id === value)?.nameEn ?? "A source no longer configured";
                  if (field === "projectCategoryCode") return lookups.projectCategories.find((x) => x.code === value)?.nameEn ?? "A category no longer configured";
                  if (field === "budgetCodeId") {
                    const b = lookups.budgetCodes.find((x) => x.id === value);
                    return b ? `${b.code} · ${b.descriptionEn}` : "A budget code no longer on file";
                  }
                  if (field === "siteCode") return sites.find((x) => x.code === value)?.nameEn ?? null;
                  if (field === "costCentreCode") return named(costCentres, value);
                  if (field === "accountCode") return named(accountCodes, value);
                  return null;
                }}
              />
            ),
          },
        ]}
      />
    </>
  );
}

// ------------------------------------------------------------------ overview

async function Overview({
  estimate,
  l,
  facts,
  fieldNotes,
  locked,
  endorsement,
}: {
  estimate: Sulit<true>;
  l: LoadedRequisition;
  facts: Record<"department" | "section" | "costCentre" | "account" | "site", string>;
  fieldNotes: string[];
  locked: boolean;
  endorsement: {
    tiers: OrgUnitKind[];
    endorsers: { tier: OrgUnitKind; unit: string | null; head: string | null; fault: string | null }[];
    faults: string[];
    canRecord: boolean;
    people: { value: string; label: string }[];
    byTier: Record<string, { value: string; label: string }[]>;
    today: string | null;
  };
}) {
  const rm = (text: string) => through(estimate, text);
  const r = l.req;
  // How each endorsement was recorded, signed or from paper, is read from its attribution (Phase 2b).
  const endorsed = await loadAttributions(db, l.org.id, [{ entity: "RequisitionEndorsement", slot: "person", ids: r.endorsements.map((e) => e.id) }]);
  const lineTotal = r.lines.reduce((n, x) => n + parseSen(x.estimatedAmount.toString()), 0n);
  return (
    <div className="flex flex-col gap-6">
      {!locked && fieldNotes.length > 0 && (
        <Callout tone="warn" title="Before it can leave draft">
          <ul className="list-disc pl-5">
            {fieldNotes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </Callout>
      )}
      <Card>
        <CardHeader icon={<ClipboardIcon size={17} />} title="The requisition" subtitle="As raised. Fixed once endorsed." />
        <CardBody className="flex flex-col gap-6">
          <KeyValues
            columns={3}
            items={[
              { label: "Reference", value: <span className="font-mono text-[13px]">{r.reference}</span> },
              // Founder, 2026-10-05: the finance system's numbers only where one was recorded before they were removed.
              ...(r.erpRequisitionNo ? [{ label: "Finance system requisition no.", value: <span className="font-mono text-[13px]">{r.erpRequisitionNo}</span> }] : []),
              ...(r.erpNoteNo ? [{ label: "Requisition note no.", value: <span className="font-mono text-[13px]">{r.erpNoteNo}</span> }] : []),
              { label: "Requesting department", value: facts.department },
              { label: "Section", value: facts.section },
              { label: "Requesting officer", value: r.requestingPerson.name },
              { label: "Cost centre", value: facts.costCentre },
              { label: "Account code", value: facts.account },
              { label: "Budget code", value: r.budgetCode ? `${r.budgetCode.code} · ${r.budgetCode.descriptionEn}` : <span className="text-ink-3">Not set</span> },
              { label: "Site", value: facts.site },
              { label: "Place of delivery", value: r.placeOfDelivery || <span className="text-ink-3">Not set</span> },
              { label: "Date required", value: formatDate(r.dateRequired) },
              { label: "Estimated value", value: <SulitValue of={rm(formatRM(num(r.estimatedValue)))} /> },
              { label: "Raised on", value: formatDate(r.raisedOn) },
              { label: "Entered", value: r.origin === "EXTERNAL" ? "Received by hand from the finance system" : "Raised in the portal" },
            ]}
          />
          <div className="grid gap-6 border-t border-line pt-6 md:grid-cols-2">
            <div className="min-w-0">
              <div className="text-[12px] font-semibold text-ink-3">Justification</div>
              <p className="mt-1 text-[14px] break-words whitespace-pre-line text-ink">{r.justification || <span className="text-ink-3">Not set</span>}</p>
            </div>
            {/* Founder, 2026-10-06: no longer asked for; one recorded before still shows. */}
            {r.needStatement && (
              <div className="min-w-0">
                <div className="text-[12px] font-semibold text-ink-3">Need statement</div>
                <p className="mt-1 text-[14px] break-words whitespace-pre-line text-ink">{r.needStatement}</p>
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader
          icon={<ClipboardIcon size={17} />}
          title="Line items"
          subtitle={estimate.state === "GRANTED" ? linesSubtitle(r.lines.length, lineTotal) : `${r.lines.length} ${r.lines.length === 1 ? "line" : "lines"}. Total is SULIT.`}
        />
        {r.lines.length === 0 ? (
          <EmptyState size="sm" title="No lines" />
        ) : (
          <Table minWidth={560}>
            <colgroup>
              <col style={{ width: 56 }} />
              <col />
              <col style={{ width: 110 }} />
              <col style={{ width: 130 }} />
              <col style={{ width: 140 }} />
            </colgroup>
            <THead>
              <Th>No.</Th>
              <Th>Description</Th>
              <Th numeric>Quantity</Th>
              <Th numeric>Unit price</Th>
              <Th numeric>Amount</Th>
            </THead>
            <tbody>
              {r.lines.map((x) => (
                <Tr key={x.id}>
                  <Td label="No." className="tabular-nums text-ink-3">{x.lineNo}</Td>
                  <Td label="Description">
                    <span className="block truncate" title={x.description}>
                      {x.description}
                    </span>
                  </Td>
                  <Td label="Quantity" numeric>{x.quantity == null ? "—" : `${Number(x.quantity.toString())}${x.unit ? ` ${x.unit}` : ""}`}</Td>
                  <Td label="Unit price" numeric>{x.estimatedUnitPrice == null ? "—" : <SulitValue of={rm(formatRM(num(x.estimatedUnitPrice)))} />}</Td>
                  <Td label="Amount" numeric className="font-semibold">
                    <SulitValue of={rm(formatRM(num(x.estimatedAmount)))} />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card className="overflow-hidden">
        <CardHeader
          icon={<ShieldIcon size={17} />}
          title="Endorsements"
          subtitle="Before submission"
          actions={
            // Offered while a tier is outstanding; once every tier has endorsed, the next
            // step is Mark endorsed, in the header.
            endorsement.canRecord && endorsement.tiers.some((t) => !r.endorsements.some((e) => e.tier === t)) ? (
              <RecordEndorsementDrawer
                id={r.id}
                tiers={endorsement.tiers.filter((t) => !r.endorsements.some((e) => e.tier === t)).map((t) => ({ value: t, label: TIER_LABEL[t] }))}
                byTier={endorsement.byTier}
                today={endorsement.today}
              />
            ) : undefined
          }
        />
        {endorsement.tiers.length === 0 ? (
          <CardBody>
            <Callout
              tone="warn"
              title="Endorsement tiers not set. Nothing can be submitted."
              action={
                <ButtonLink href={CONTROLS_HREF} size="sm">
                  Set tiers
                </ButtonLink>
              }
            />
          </CardBody>
        ) : (
          <Table minWidth={560}>
            <colgroup>
              <col style={{ width: "24%" }} />
              <col />
              <col style={{ width: "30%" }} />
            </colgroup>
            <THead>
              <Th>Tier</Th>
              <Th>Endorsed</Th>
              <Th>Endorser today</Th>
            </THead>
            <tbody>
              {endorsement.endorsers.map((x) => {
                const e = r.endorsements.find((y) => y.tier === x.tier);
                return (
                  <Tr key={x.tier}>
                    <Td label="Tier">
                      <CellStack title={TIER_LABEL[x.tier]} sub={x.unit ?? "No such unit on the path"} />
                    </Td>
                    <Td label="Endorsed">
                      {e ? (
                        <CellStack title={`${e.person.name} · ${formatDate(e.endorsedOn)}`} sub={e.note || endorsed.read({ entity: "RequisitionEndorsement", id: e.id, slot: "person" }, e.person.name).en} />
                      ) : (
                        <Badge tone="warn">Awaiting</Badge>
                      )}
                    </Td>
                    <Td label="Endorser today">
                      {x.fault === "TIER_NOT_ON_PATH" ? (
                        <Badge tone="err">Not on this path</Badge>
                      ) : x.fault === "NO_HEAD" ? (
                        <Badge tone="err">No head recorded</Badge>
                      ) : (
                        <span className="block truncate text-ink-2">{x.head}</span>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
        {endorsement.tiers.length > 0 && endorsement.faults.length > 0 && r.status === "DRAFT" && (
          <CardBody pad="tight" className="border-t border-line text-[13px] text-ink-3">
            {endorsement.faults.join(" ")}
          </CardBody>
        )}
      </Card>
    </div>
  );
}

// -------------------------------------------------------------------- budget

function BudgetPanel({
  estimate,
  budgetReadable,
  l,
  controls,
  recheckDays,
  checkAction,
  unposted,
}: {
  estimate: Sulit<true>;
  /// `mayReadBudget(actor)` (DB-3): without it the Budget page refuses the reader, so no link leads there.
  budgetReadable: boolean;
  l: LoadedRequisition;
  /// Why a received requisition has no ledger commitment, from the settings in force.
  unposted: UnpostedReason | null;
  /// The Check budget control, where it can be run from here.
  checkAction: React.ReactNode;
  controls: { availabilityCheck: string | null; commitOnApproval: boolean | null; budgetCheckSource: string | null };
  recheckDays: number | null;
}) {
  const rm = (text: string) => through(estimate, text);
  const r = l.req;
  const c = r.budgetChecks[0] ?? null;
  const identity =
    c &&
    identityHolds({
      source: c.source,
      actualBudget: sen(c.actualBudget),
      approvedAccount: sen(c.approvedAccount),
      balanceAsAt: sen(c.balanceAsAt),
    } as BudgetSnapshot);
  // Staleness matters only while a submission could re-run it; after submission the
  // route keeps the check it was judged under.
  const stale = c && l.org.today && PRE_SUBMIT.includes(r.status) ? isStale(storedDay(c.asAt), recheckDays, l.org.today) : false;
  const noCheck =
    r.origin === "EXTERNAL"
      ? { title: "No budget check entered" }
      : PRE_SUBMIT.includes(r.status)
        ? { title: "Not checked yet" }
        : ["DRAFT", "RETURNED"].includes(r.status)
          ? { title: "Not checked. Endorse first." }
          : { title: "No budget check recorded" };
  const settings: { label: string; value: React.ReactNode }[] = [
    {
      label: "Check source",
      value: controls.budgetCheckSource ? SOURCE_LABEL[controls.budgetCheckSource as keyof typeof SOURCE_LABEL] : <Badge tone="warn">Not set</Badge>,
    },
    {
      label: "Re-checked on submission after",
      value: recheckDays == null ? <InfoChip outline detail="A check never goes stale.">Not set</InfoChip> : `${recheckDays} days`,
    },
    {
      label: "Over budget",
      value:
        controls.availabilityCheck === "advisory"
          ? "Routes to over-budget approvers, with a warning"
          : controls.availabilityCheck === "blocking"
            ? "Held until the over-budget route is invoked"
            : <span className="inline-flex items-center gap-1.5">Held until invoked <InfoChip outline detail="The availability check is not set.">Not set</InfoChip></span>,
    },
    {
      label: "Commit on approval",
      value: controls.commitOnApproval == null ? <Badge tone="warn">Not set</Badge> : controls.commitOnApproval ? "Yes, on approval" : "No",
    },
  ];
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          icon={<ChartIcon size={17} />}
          title="Latest budget check"
          subtitle={c ? `${SOURCE_LABEL[c.source]} · as at ${formatDate(c.asAt)}` : undefined}
          actions={c ? <span className="inline-flex items-center gap-1"><MoreText label="Checked" text={`Checked ${formatOrgDay(c.checkedAt, l.org.timeZone)}`} /><Badge tone={TONE[VERDICT_TONE[c.verdict]]}>{VERDICT_LABEL[c.verdict]}</Badge></span> : undefined}
        />
        <CardBody className="flex flex-col gap-5">
          {r.origin === "EXTERNAL" && !r.commitmentMovementId && unposted && (
            unposted === "HELD_IN_FINANCE" || unposted === "ROUTE_OFF" ? (
              <div><InfoChip tone="info" detail={UNPOSTED_TEXT[unposted]}>{UNPOSTED_TITLE[unposted]}</InfoChip></div>
            ) : (
              <Callout tone="warn" title={UNPOSTED_TITLE[unposted]}>
                {UNPOSTED_TEXT[unposted]}
              </Callout>
            )
          )}
          {!c ? (
            <EmptyState size="sm" title={noCheck.title} action={PRE_SUBMIT.includes(r.status) ? checkAction : undefined} />
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Stat variant="inset" size="sm" tone="neutral" label="Actual budget" value={money(c.actualBudget)} />
                <Stat variant="inset" size="sm" tone="neutral" label="Balance as at" value={money(c.balanceAsAt)} hint={`As at ${formatDate(c.asAt)}`} />
                <Stat
                  variant="inset"
                  size="sm"
                  tone="neutral"
                  label={
                    <span className="inline-flex items-center gap-1.5">
                      Approved account <ProvenanceBadge value={c.approvedAccountProvenance} />
                      <MoreText text={`${c.source === "PORTAL_LEDGER" ? "Committed plus spent on the ledger, which assumes what the term means." : "As the finance system shows it. Its meaning there is not confirmed."} The verdict reads the balance alone.`} />
                    </span>
                  }
                  value={money(c.approvedAccount)}
                />
                <Stat variant="inset" size="sm" tone="neutral" label="Projected balance" value={<SulitValue of={rm(money(c.projectedBalance))} />} hint={estimate.state === "GRANTED" ? `After ${formatRM(num(c.requestedAmount))}` : "SULIT"} />
              </div>
              {c.outcome.includes("COST_CENTRE_OUTSIDE_OWNER") && (
                <Callout tone="warn">Cost centre unit is not the budget code&apos;s owner. Warning only.</Callout>
              )}
              {identity === false && (
                <Callout tone="err">Actual budget less approved account does not equal the balance. Report it.</Callout>
              )}
              {stale && <Callout tone="warn">Check is stale. It re-runs on submission.</Callout>}
            </>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          icon={<ShieldIcon size={17} />}
          title="Controls applied"
          subtitle="As configured today"
          actions={
            controls.budgetCheckSource && !budgetReadable ? undefined : (
              <ButtonLink href={controls.budgetCheckSource ? BUDGET_HREF : CONTROLS_HREF} size="sm" variant="ghost">
                Configure
              </ButtonLink>
            )
          }
        />
        <CardBody>
          <KeyValues columns={2} items={settings} />
        </CardBody>
      </Card>

      {r.budgetChecks.length > 1 && (
        <Card className="overflow-hidden">
          <CardHeader icon={<ClockIcon size={17} />} title="Earlier checks" />
          <Table minWidth={620}>
            <colgroup>
              <col style={{ width: "22%" }} />
              <col />
              <col style={{ width: "20%" }} />
              <col style={{ width: "20%" }} />
            </colgroup>
            <THead>
              <Th>Checked</Th>
              <Th>Source</Th>
              <Th numeric>Balance as at</Th>
              <Th>Verdict</Th>
            </THead>
            <tbody>
              {r.budgetChecks.slice(1).map((x) => (
                <Tr key={x.id}>
                  <Td label="Checked">{formatOrgDay(x.checkedAt, l.org.timeZone)}</Td>
                  <Td label="Source">
                    <span className="block truncate">{SOURCE_LABEL[x.source]}</span>
                  </Td>
                  <Td label="Balance as at" numeric>{money(x.balanceAsAt)}</Td>
                  <Td label="Verdict">
                    <Badge tone={TONE[VERDICT_TONE[x.verdict]]}>{VERDICT_LABEL[x.verdict]}</Badge>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ approval

type Step = LoadedRequisition["req"]["approvalInstances"][number]["steps"][number];

async function ApprovalPanel({
  l,
  gates,
  officeName,
  preview,
  previewMatrixRoles,
  decide,
  suggestions,
  stepFaultPreview,
  routeBand,
  previewNote,
  previewRefusal,
}: {
  /// Why this route would be refused at submission: a step only the requester could act for (R1).
  previewRefusal: string | null;
  /// Said on the preview where a newer issue is in force today than on the raised-on day.
  previewNote: string | null;
  l: LoadedRequisition;
  /// The submitted route's value band, written from its pinned rule; null: not recorded.
  routeBand: string | null;
  /// The committee gates card (FR-REQ-012), shown once the requisition is approved.
  gates: React.ReactNode;
  /// An office's name by its code, for a rejection destination's office.
  officeName: (code: string | null) => string | null;
  preview: ReturnType<typeof resolveRequisitionRoute> | null;
  previewMatrixRoles: Record<string, { nameEn: string }>;
  decide: (s: Step) => string | null;
  suggestions: (s: Step) => { value: string; label: string }[];
  stepFaultPreview: (s: Step) => string | null;
}) {
  const r = l.req;
  const [inst, ...earlier] = r.approvalInstances;
  const matters = r.committeeDecisions;
  // Who decided each step, signed or recorded from paper, is read from its attribution (Phase 2b): the screen never says it by itself.
  const acted = await routeActed(db, l.org.id, r.approvalInstances);

  if (!inst) {
    return (
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader icon={<RouteIcon size={17} />} title="Approval route"  />
          <CardBody className="flex flex-col gap-4">
            {preview ? (
              <>
                <p className="text-[13.5px] font-semibold text-ink-2">{previewRefusal ? "If submitted today: refused" : "If submitted today"}</p>
                {preview.resolution.chain.length > 0 ? (
                  <ol className="flex flex-col gap-2">
                    {preview.resolution.chain.map((s, i) => (
                      <li key={i} className="flex items-center gap-2 text-[13.5px]">
                        <ActBadge act={s.act} step={i + 1} />
                        <span className="font-semibold text-ink">{previewMatrixRoles[s.roleCode]?.nameEn ?? "An office no longer configured"}</span>
                        <span className="text-ink-3">{actLabel(s.act)}</span>
                      </li>
                    ))}
                  </ol>
                ) : null}
                {preview.faults.map((f) => (
                  <Callout key={f.messageEn} tone="err">
                    {f.messageEn}
                  </Callout>
                ))}
                {previewRefusal && <Callout tone="err">{previewRefusal}</Callout>}
                {previewNote && <Callout tone="warn">{previewNote}</Callout>}
                {preview.warnings.filter((w) => w.level !== "err").map((w) => (
                  <Callout key={w.messageEn} tone="warn">
                    {w.messageEn}
                  </Callout>
                ))}
              </>
            ) : (
              <EmptyState size="sm" title="Not submitted" />
            )}
          </CardBody>
        </Card>
        <CommitteeMatters l={l} />
      </div>
    );
  }

  const warnings = (inst.warnings as { code: string; level: string; messageEn: string }[]) ?? [];
  const open = inst.status === "PENDING";
  const openedOn = formatDate(inst.openedAt);

  return (
    <div className="flex flex-col gap-6">
      <Card className="overflow-hidden">
        <CardHeader
          icon={<RouteIcon size={17} />}
          title="Approval route"
          subtitle={
            inst.checkedAgainstMatrix
              ? `Opened ${openedOn} under ${inst.matrixLabel ?? "an issue no longer on file"}`
              : undefined
          }
          actions={<Badge tone={routeTone(inst.status)}>{approvalRouteLabel(inst.status, inst.warnings)}</Badge>}
        />
        <CardBody className="flex flex-col gap-5">
          {!inst.checkedAgainstMatrix && <Callout tone="warn" title="Route not checked against the approval matrix." />}
          {/* Founder, 2026-10-05: the route at a glance first, as a flow of steps; how it was chosen below, folded. */}
          <Stepper
            label="Approval steps"
            steps={routeSteps({
              status: inst.status,
              openedOn,
              steps: inst.steps.map((s) => ({
                id: s.id,
                label: s.roleLabel,
                actingLabel: s.actingRoleLabel,
                decision: s.decision,
                committee: !!s.committeeCode,
                decidedBy: s.committeeDecision ? (s.committeeDecision.meeting?.reference ?? null) : s.decidedByName,
                decidedOn: s.decidedOn ? formatDate(s.decidedOn) : null,
              })),
            })}
          />
          {inst.supersedesInstanceId && (
            <div><InfoChip tone="info" detail="The route before this one was rejected and returned to an earlier step. Earlier steps keep their decisions; the rest are decided again.">Continues a rejected route</InfoChip></div>
          )}
          {inst.status === "REJECTED" && inst.rejectionApplied && inst.rejectionSource && (
            <Callout tone="warn" title="Where the rejection sent it">
              {appliedText(inst.rejectionApplied as RejectionKind, inst.rejectionSource, officeName(inst.rejectionReturnToRoleCode), inst.rejectionChosenBy?.name ?? null, inst.rejectionChosenBy ? acted.chosen(inst.id, inst.rejectionChosenBy.name) : null)}
            </Callout>
          )}
          <Accordion title="How this route was chosen" meta={warnings.length > 0 ? `${warnings.length} ${warnings.length === 1 ? "note" : "notes"} to check` : undefined}>
          <div className="flex flex-col gap-5 p-5">
          {inst.checkedAgainstMatrix ? (
            <KeyValues
              columns={2}
              items={[
                { label: "Rule", value: inst.ruleLabel ? <span className="inline-flex items-center gap-1.5">{inst.ruleLabel}<RuleInfo rule={`The rule this route was chosen under: ${inst.ruleLabel}.`} clause={inst.ruleClause} /></span> : "Not recorded" },
                { label: "Chain beneath the approver", value: routeCoreText(inst, (c) => { const n = officeName(c) ?? "an office no longer configured"; return { en: n }; }).en },
                { label: "Routed on", value: routedOnLabel(inst.cond) },
                { label: "Value band", value: routeBand ?? "Band not recorded" },
                {
                  label: "At the boundary",
                  value: inst.boundaryOperator ? OPERATOR_LABEL[inst.boundaryOperator] : "Did not apply",
                },
                {
                  label: "Funder's rules",
                  value: inst.fundingOverrideApplied
                    ? `Superseded the matrix: ${inst.overrideMatrixLabel ?? "a rule set no longer on file"}`
                    : warnings.some((w) => w.code === "GOV_OVERRIDE")
                      ? "Supersede, but none applied. See warnings."
                      : "Did not apply",
                },
                {
                  label: "Over budget",
                  value:
                    inst.budgetVerdict === "EXCEEDS"
                      ? inst.overBudgetInvoked
                        ? `Invoked by the officer${inst.availabilityCheck == null ? " · control not set" : ""}`
                        : "Routed automatically, with a warning"
                      : "Within budget",
                },
              ]}
            />
          ) : (
            <div><InfoChip tone="warn" detail="Typed in from the finance system. The portal did not route it and does not vouch for it.">Typed trail</InfoChip></div>
          )}
          {warnings.length > 0 && (
            <ul className="flex flex-col gap-2">
              {warnings.map((w, i) => (
                <li key={i}>
                  <FindingNote level={w.level}>{w.messageEn}</FindingNote>
                </li>
              ))}
            </ul>
          )}
          </div>
          </Accordion>
        </CardBody>
        <ol className="divide-y divide-line/70 border-t border-line">
          {inst.steps.map((s, stepIndex) => {
            const committee = s.committeeDecision;
            const record = committee ? recordOf({ ...committee, meeting: committee.meeting }) : null;
            const blocker = open ? decide(s) : null;
            const barred = open && s.decision === "PENDING" && !blocker ? stepFaultPreview(s) : null;
            const citable = matters.filter((d) => d.meeting.committee.code === s.committeeCode && d.outcome !== "PENDING");
            return (
              <li key={s.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
                <div className="flex min-w-0 items-start gap-3">
                  <ActBadge act={s.act} step={stepIndex + 1} />
                  <div className="min-w-0">
                    <div className="font-semibold break-words text-ink">
                      {s.roleLabel} <span className="font-normal text-ink-3">· {actLabel(s.act)}</span>
                    </div>
                    {stepOriginText(inst, s) && <div className="text-[12.5px] text-ink-3">{stepOriginText(inst, s)}</div>}
                    {s.escalation && (
                      <div className="text-[12.5px] break-words text-amber-800">
                        {escalationText({ roleLabel: s.roleLabel, actingRoleLabel: s.actingRoleLabel, escalation: s.escalation, escalationReason: s.escalationReason, declaredByName: s.declaredBy?.name ?? null }, s.declaredBy ? acted.declared(s.id, s.declaredBy.name) : null)}
                      </div>
                    )}
                    {s.decision === "PENDING" ? (
                      <div className="text-[12.5px] text-ink-3">
                        {undecidedStepText(inst, !!s.committeeCode)}
                        {s.nonDelegable && " Cannot be delegated."}
                        {open && (
                          <span className="mt-0.5 block text-ink-2">
                            {ifRejectedText(
                              { snapshotAt: inst.rejectionSnapshotAt, kind: inst.rejectionKind as RejectionKind | null, returnToOffice: officeName(inst.rejectionReturnToRoleCode), provenance: inst.rejectionProvenance },
                              !!s.committeeCode,
                              returnTargetBefore(inst, s.sequence),
                            )}
                          </span>
                        )}
                      </div>
                    ) : s.carriedFromStepId ? (
                      <div className="text-[12.5px] text-ink-2">
                        {DECISION_LABEL[s.decision]} · {s.decidedByName ?? "Not recorded"} · {formatDate(s.decidedOn)} · carried from the earlier route
                      </div>
                    ) : committee && record ? (
                      <div className="text-[12.5px] text-ink-2">
                        {OUTCOME_LABEL[record.outcome]} by the {record.committee} at{" "}
                        <Link href={`/committees/${committee.meetingId}`}>{record.meetingReference}</Link> on {formatDate(record.decisionDate ?? record.meetingDate)}
                        {record.notApproved ? ` · ${record.notApproved.nameEn}` : ""}
                      </div>
                    ) : (
                      <div className="text-[12.5px] text-ink-2">
                        {DECISION_LABEL[s.decision]} · {acted.decided(s.id, s.decidedByName)} · {formatDate(s.decidedOn)}
                        {s.delegation
                          ? ` · under delegation from ${s.delegation.fromPerson.name} (${s.delegation.valueCeiling == null ? "no ceiling set" : `ceiling ${formatRM(num(s.delegation.valueCeiling))}`})`
                          : ""}
                        {s.reason ? ` · “${s.reason}”` : ""}
                      </div>
                    )}
                    {barred && <div className="mt-1 text-[12.5px] text-amber-800">{barred}</div>}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                  {s.decision !== "PENDING" && <Badge tone={stepTone(s.decision)}>{DECISION_LABEL[s.decision]}</Badge>}
                  {open && s.decision === "PENDING" && !s.committeeCode && s.roleCode && (
                    <EscalateDrawer stepId={s.id} office={s.actingRoleLabel ?? s.roleLabel} mandatory={isMandatoryAct(s.act)} people={suggestions(s)} />
                  )}
                  {open && s.decision === "PENDING" && s.committeeCode && (
                    <CiteCommitteeDrawer
                      id={r.id}
                      stepId={s.id}
                      committee={s.roleLabel}
                      decisions={citable.map((d) => ({ value: d.id, label: `${d.meeting.reference} · ${d.subject} · ${OUTCOME_LABEL[d.outcome]}` }))}
                      blocker={
                        blocker ??
                        (citable.length === 0
                          ? `No decided ${s.roleLabel} matter yet. Table it at a sitting.`
                          : null)
                      }
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </Card>

      {inst.status === "APPROVED" && gates}

      {inst.status === "APPROVED" && inst.checkedAgainstMatrix && (
        <div>
          {r.commitmentMovementId ? null : (
            <InfoChip
              tone="info"
              detail={{
                SETTING_NOT_SET: "Commit on approval was not set when it was approved.",
                SETTING_OFF: "Commit on approval is off.",
                ROUTE_NOT_SET: "Commitment was not set for this funding route when it was approved.",
                ROUTE_OFF: "This funding route does not commit the budget.",
                WRITE: "No commitment is on record.",
              }[approvalCommitment(inst.commitOnApproval, inst.routeCommitsBudget)]}
            >
              No commitment
            </InfoChip>
          )}
        </div>
      )}

      <CommitteeMatters l={l} />

      {earlier.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader icon={<ClockIcon size={17} />} title="Earlier routes" />
          <ul className="divide-y divide-line/70">
            {earlier.map((e) => {
              const returned = e.status === "RECALLED" && returnedAtApproval(e.warnings);
              const notes = returnedRouteCitationNotes({ returnedAtApproval: returned, steps: e.steps });
              return (
                <li key={e.id} className="flex flex-col gap-1.5 px-5 py-3 text-[13px] sm:px-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={returned ? "warn" : routeTone(e.status)}>{approvalRouteLabel(e.status, e.warnings)}</Badge>
                    <span className="text-ink-2">
                      Opened {formatDate(e.openedAt)} · {e.ruleLabel ?? "as received"} · {e.steps.map((s) => s.roleLabel).join(" → ")}
                    </span>
                  </div>
                  {notes.map((n) => (
                    <p key={n} className="text-[12.5px] text-ink-3">
                      {n}
                    </p>
                  ))}
                  {e.status === "REJECTED" && e.rejectionApplied && e.rejectionSource && (
                    <p className="text-[12.5px] text-ink-2">
                      {appliedText(
                        e.rejectionApplied as RejectionKind,
                        e.rejectionSource,
                        e.rejectionApplied === "RETURN_TO_STEP"
                          ? (r.approvalInstances.find((x) => x.supersedesInstanceId === e.id)?.steps.find((x) => !x.carriedFromStepId)?.roleLabel ?? officeName(e.rejectionReturnToRoleCode))
                          : null,
                        e.rejectionChosenBy?.name ?? null,
                        e.rejectionChosenBy ? acted.chosen(e.id, e.rejectionChosenBy.name) : null,
                      )}
                      {e.rejectionReason ? ` Reason: “${e.rejectionReason}”` : ""}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}

/**
 * The committee gates between approval and the first exercise (FR-REQ-012, ADR 0010).
 * Each gate's state is read from the sitting's record of the matters cited against it,
 * and the outcome is named in the committee's own words (ruling CO-2).
 */
function GatesCard({
  estimate,
  l,
  view,
  exerciseBlock,
  tableHref,
}: {
  estimate: Sulit<true>;
  l: LoadedRequisition;
  view: NonNullable<Awaited<ReturnType<typeof gatesForRequisition>>>;
  exerciseBlock: string | null;
  tableHref: (committeeCode: string, subject: string, act: string) => string | null;
}) {
  const r = l.req;
  const live = ["APPROVED", "SOURCING"].includes(r.status);
  const undetermined = view.finding.code === "GATES_NOT_DETERMINED";
  const ended = view.gates.some((g) => g.state === "ENDED");
  const notSetText = undetermined
    ? findingText({ code: "GATES_NOT_DETERMINED", level: "block", data: { why: view.finding.code === "GATES_NOT_DETERMINED" ? view.finding.why : null } })
    : null;
  const actions = (
    <>
      {live && undetermined && <CheckGatesDrawer id={r.id} blocker={l.org.today ? null : transitionFaultText({ code: "TIME_ZONE_UNSET" })} />}
      {r.status === "APPROVED" && ended && <CloseWithoutSourcingDrawer id={r.id} commitment={r.commitmentMovementId ? (estimate.state === "GRANTED" ? formatRM(num(r.estimatedValue)) : "its amount") : null} />}
    </>
  );
  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<ShieldIcon size={17} />}
        title="Committee gates"
        subtitle={<InfoChip tone="warn" detail="Between approval and the first sourcing exercise, outside the approval matrix. Placed here as an assumption, awaiting the customer's confirmation.">Assumed</InfoChip>}
        actions={actions}
      />
      {undetermined ? (
        <CardBody>
          <Callout
            tone="warn"
            title={r.status === "CLOSED" ? "Not determined" : "Not determined: no exercise can be opened"}
            action={
              view.finding.code === "GATES_NOT_DETERMINED" && view.finding.why !== "NOT_CHECKED" ? (
                <ButtonLink href={view.finding.why === "NOT_SET" ? REFERENCE_HREF : CONTROLS_HREF} size="sm">
                  {view.finding.why === "NOT_SET" ? "Set on the funding route" : "Add a gate rule"}
                </ButtonLink>
              ) : undefined
            }
          >
            {notSetText}
          </Callout>
        </CardBody>
      ) : view.gates.length === 0 ? (
        <EmptyState size="sm" title={r.gateRequired === false ? "Funding route has no gate" : "No gate at this value"} />
      ) : (
        <ul className="divide-y divide-line/70">
          {view.gates.map((g) => {
            const gate = r.gates.find((x) => x.id === g.id)!;
            const cited = gate.decisions;
            const decisive = g.decisive;
            const citable = r.committeeDecisions.filter(
              (d) => d.domain === GATE_DOMAIN && d.meeting.committee.code === gate.committeeCode && !d.requisitionGateId && !d.approvalStep && !d.withdrawnAt,
            );
            const open = live && (g.state === "AWAITING" || g.state === "RETURNED" || g.state === "OUTCOME_NOT_RECORDED");
            const reason = open ? gateOpenReason({ committeeLabel: gate.committeeLabel, matters: gateMattersOf(gate), citableCount: citable.length, formatDay: formatDate }) : null;
            const href = reason?.canTable ? tableHref(gate.committeeCode, gate.subjectEn, gate.act) : null;
            return (
              <li key={g.id} className="flex flex-col gap-3 px-5 py-4 sm:px-6">
                <div className="flex min-w-0 items-start gap-3">
                  <ActBadge act={gate.act} />
                  <div className="min-w-0">
                    <div className="font-semibold break-words text-ink">
                      {gate.committeeLabel} <span className="font-normal text-ink-3">· {gate.subjectEn}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-ink-3">
                      <span>{actLabel(gate.act)}</span>
                      <span>· rule</span>
                      <ProvenanceBadge value={gate.ruleProvenance} />
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:pl-9">
                  <Badge tone={TONE[GATE_STATE_TONE[g.state]]}>{GATE_STATE_LABEL[g.state]}</Badge>
                  {reason?.text && <span id={`gate-note-${g.id}`} className="min-w-0 flex-1 basis-56 text-[12.5px] text-ink-2">{reason.text}</span>}
                  {open && (
                    <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">
                      {citable.length === 0 ? (
                        <Blocked label="Cite the decision" reason={reason?.text ?? "No matter tabled for this gate."} noteId={`gate-note-${g.id}`} />
                      ) : (
                        <CiteGateDrawer
                          id={r.id}
                          gateId={g.id}
                          committee={gate.committeeLabel}
                          decisions={citable.map((d) => ({ value: d.id, label: `${d.meeting.reference} · ${d.subject} · ${OUTCOME_LABEL[d.outcome]}` }))}
                          blocker={null}
                        />
                      )}
                      {reason?.canTable && (href ? <ButtonLink href={href} size="sm" variant="secondary">Table at a sitting</ButtonLink> : <ButtonLink href="/committees" size="sm" variant="secondary">Schedule a sitting</ButtonLink>)}
                    </div>
                  )}
                </div>
                {cited.length === 0 ? (
                  <div className="text-[12.5px] text-ink-3 sm:pl-9">No matter cited yet</div>
                ) : (
                  <ul className="flex flex-col gap-2 text-[12.5px] text-ink-2 sm:pl-9">
                    {cited.map((d) => {
                      const rec = recordOf(d);
                      const minutes = signedMinutesState(d.meeting.status, d.meeting.attachments.length);
                      return (
                        <li key={d.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span>
                            <Link href={`/committees/${d.meetingId}`}>{d.meeting.reference}</Link> · {d.withdrawnAt ? "withdrawn from the agenda" : gateOutcomeLabel(rec, d.meeting.committee.carriedLabelEn)}
                            {rec ? ` · ${formatDate(rec.decisionDate ?? rec.meetingDate)}` : ""}
                            {decisive?.id === d.id ? " · decides the gate" : ""}
                          </span>
                          {rec && <Chip tone={SIGNED_MINUTES_TONE[minutes]}>{SIGNED_MINUTES_LABEL[minutes]}</Chip>}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {exerciseBlock && !undetermined && (
        <div className="border-t border-line px-5 py-3 text-[12.5px] text-ink-2 sm:px-6">{exerciseBlock}</div>
      )}
    </Card>
  );
}

/// Committee matters tabled against this requisition (FR-REQ-012), from decisionRecord() only.
function CommitteeMatters({ l }: { l: LoadedRequisition }) {
  const matters = l.req.committeeDecisions;
  if (matters.length === 0) return null;
  return (
    <Card className="overflow-hidden">
      <CardHeader icon={<ShieldIcon size={17} />} title="Committee matters" />
      <ul className="divide-y divide-line/70">
        {matters.map((d) => {
          const rec = recordOf(d);
          return (
            <li key={d.id} className="flex flex-wrap items-center gap-2 px-5 py-3 text-[13px] sm:px-6">
              <Badge tone={d.outcome === "CARRIED" ? "ok" : d.outcome === "PENDING" ? "brand" : "warn"}>{OUTCOME_LABEL[d.outcome]}</Badge>
              <span className="min-w-0 font-semibold break-words text-ink">{d.subject}</span>
              <span className="text-ink-3">
                {rec ? rec.committee : d.meeting.committee.nameEn} · <Link href={`/committees/${d.meetingId}`}>{d.meeting.reference}</Link>
                {d.matterKind ? ` · ${MATTER_KIND_LABEL[d.matterKind]}` : ""}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

// -------------------------------------------------------------------- checks

function ChecksPanel({
  l,
  gate,
  route,
  routes,
  routeNameOf,
  funding,
}: {
  l: LoadedRequisition;
  gate: { faults: string[]; posture: string | null; sourcingPermitted: boolean | null; supersedesAuthority: boolean | null };
  route: { name: string; requires: boolean | undefined; label: string | null | undefined; commitsBudget: boolean | null } | null;
  routes: { value: string; label: string }[];
  routeNameOf: (code: string) => string | null;
  funding: { source: string | null; category: string | null; sources: { value: string; label: string }[]; categories: { value: string; label: string }[]; sourceLocked: boolean };
}) {
  const r = l.req;
  const inst = r.approvalInstances[0] ?? null;
  const label = route?.label?.trim() || "External authority";
  const postureText =
    gate.posture === "RECORDS_ONLY"
      ? "No sourcing, evaluation or award"
      : gate.posture === "ROUTE_SET_EXTERNALLY"
        ? "Procures; an external body sets the route"
        : gate.posture === "PROCURES"
          ? "Procures and chooses how"
          : "Not set";
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          icon={<RouteIcon size={17} />}
          title="Funding gate"
        />
        <CardBody className="flex flex-col gap-4">
          <KeyValues
            columns={2}
            items={[
              { label: "Funding route", value: r.fundingRouteCode ? (routeNameOf(r.fundingRouteCode) ?? "A route no longer configured") : <Badge tone="warn">Not set</Badge> },
              { label: "Funding source", value: funding.source ?? <span className="text-ink-3">Not set</span> },
              ...(funding.categories.length > 0 || funding.category ? [{ label: "Project category", value: funding.category ?? <span className="text-ink-3">Not set</span> }] : []),
              { label: "What it means", value: postureText },
              {
                label: "Sourcing permitted",
                value:
                  r.sourcingPermitted == null ? (gate.sourcingPermitted == null ? "Not set" : `${gate.sourcingPermitted ? "Yes" : "No"} · fixed at submission`) : r.sourcingPermitted ? "Yes" : "No",
              },
              {
                label: route?.requires ? label : "External authority",
                value: route?.requires ? (r.externalAuthorityRef ? <span className="font-mono text-[13px]">{r.externalAuthorityRef}</span> : <Badge tone="warn">Not recorded</Badge>) : "Not required",
              },
            ]}
          />
          {inst?.status === "APPROVED" && inst.checkedAgainstMatrix && inst.fundingRouteCode !== r.fundingRouteCode && (
            <Callout tone="warn" title={`Route changed after approval: ${routeNameOf(inst.fundingRouteCode ?? "") ?? "a route no longer configured"}`}>
              Not re-routed{route && gate.supersedesAuthority ? ". Check if it needs approval again." : "."}
            </Callout>
          )}
          {gate.faults.length > 0 && !["APPROVED", "CANCELLED", "CLOSED"].includes(r.status) && (
            <Callout tone="warn">{gate.faults.join(" ")}</Callout>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {route?.requires && !["CANCELLED", "CLOSED"].includes(r.status) &&
              (successorOpenFault(r.approvalInstances) ? (
                <Blocked label={`Record ${label.toLowerCase()}`} reason={SUCCESSOR_OPEN_TEXT} />
              ) : (
                <ExternalAuthorityDrawer id={r.id} label={label} current={r.externalAuthorityRef} />
              ))}
            {!["DRAFT", "CANCELLED", "CLOSED", "FULFILLED", "PENDING_APPROVAL"].includes(r.status) && <ChangeFundingDrawer id={r.id} current={r.fundingRouteCode} routes={routes} />}
            {!["DRAFT", "CANCELLED", "CLOSED", "FULFILLED", "PENDING_APPROVAL"].includes(r.status) && !(funding.sourceLocked && (r.projectCategoryCode || funding.categories.length === 0)) && (
              <ChangeFundingSourceDrawer id={r.id} current={{ fundingSourceId: r.fundingSourceId, projectCategoryCode: r.projectCategoryCode }} sources={funding.sources} categories={funding.categories} sourceLocked={funding.sourceLocked} />
            )}
          </div>
        </CardBody>
      </Card>

    </div>
  );
}

// ------------------------------------------------------------------- history

const ENTITY_LABEL: Record<string, string> = {
  Requisition: "Requisition",
  RequisitionEndorsement: "Endorsement",
  RequisitionBudgetCheck: "Budget check",
  RequisitionSplitCheck: "Splitting check",
  ApprovalInstance: "Approval route",
  ApprovalStep: "Approval step",
};
const ACTION_LABEL = { CREATE: "Recorded", UPDATE: "Changed", DELETE: "Withdrawn" } as const;


function HistoryPanel({
  estimate,
  entries,
  total,
  labelFor,
  timeZone,
}: {
  estimate: Sulit<true>;
  entries: Awaited<ReturnType<typeof requisitionHistory>>["entries"];
  total: number;
  timeZone: string | null;
  /// The page's reading of stored codes and ids it can name.
  labelFor: (field: string, value: string) => string | null;
}) {
  type Entry = (typeof entries)[number];
  // The department estimate (a registered SULIT field) reads with the SULIT chip in the trail too.
  const chipped = (field: string, value: string | null, e: Entry): ReactNode => {
    const sulit = value ? sulitHistoryValue(field, "requisition", estimate, read(field, value, e)) : null;
    return sulit ? <SulitValue of={sulit} /> : read(field, value, e);
  };
  const read = (field: string, value: string | null, e: Entry): string => {
    if (value == null || value === "") return "—";
    const named = labelFor(field, value);
    if (named != null) return named;
    // A route's status: a budget return reads as one, never a bare "Recalled".
    if (e.entity === "ApprovalInstance" && field === "status") return trailRouteStatusLabel(value, e.changes);
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDate(value);
    if (field === "status") return STATUS_LABEL[value as keyof typeof STATUS_LABEL] ?? value;
    if (field === "verdict") return VERDICT_LABEL[value as keyof typeof VERDICT_LABEL] ?? value;
    if (field === "source") return SOURCE_LABEL[value as keyof typeof SOURCE_LABEL] ?? value;
    if (field === "decision") return DECISION_LABEL[value as keyof typeof DECISION_LABEL] ?? value;
    if (field === "tier") return TIER_LABEL[value as OrgUnitKind] ?? value;
    if (field === "splitState") return splitStateLabel(value as "CLEAR").label;
    if (field === "fundingPosture") return POSTURE_LABEL[value] ?? "Not recorded";
    if (field === "origin") return value === "EXTERNAL" ? "Received from the finance system" : "Raised in the portal";
    if (field === "act") return ACT_LABEL[value] ? actLabel(value) : value;
    if (field === "cond") return condLabel(value);
    const money = historyMoneyText(field, value);
    if (money != null) return money;
    if (value === "true" || value === "yes") return "Yes";
    if (value === "false" || value === "no") return "No";
    if (/Id$/.test(field)) return "Another record";
    return value;
  };
  // An id the page cannot name is plumbing, not a change anyone needs to read: the
  // named ones (people, the budget code) come through `labelFor`.
  const shown = (field: string, change: { before: string | null; after: string | null }) =>
    field !== "returnedAtApproval" && (!/Id$/.test(field) || [change.before, change.after].some((v) => v != null && v !== "" && labelFor(field, v) != null));
  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<ClockIcon size={17} />}
        title="History"
        subtitle={total > entries.length ? `Latest ${entries.length} of ${total} changes` : undefined}
        divided={entries.length === 0}
      />
      {entries.length === 0 ? (
        <EmptyState size="sm" title="No recorded changes" />
      ) : (
        <ul className="divide-y divide-line/70">
          {entries.map((e) => (
            <li key={e.id} className="flex flex-col gap-1.5 px-5 py-3 sm:px-6">
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                <Badge tone={e.action === "CREATE" ? "ok" : e.action === "DELETE" ? "err" : "info"}>{ACTION_LABEL[e.action]}</Badge>
                <span className="font-semibold text-ink">{ENTITY_LABEL[e.entity] ?? "Record"}</span>
                <span className="min-w-0 break-words text-ink-2">{historyEntityLabel(e.entity, e.entityLabel)}</span>
                <span className="flex-1" />
                <span className="text-[12px] text-ink-3">{formatOrgDay(e.at, timeZone)}</span>
              </div>
              {e.changes.length > 0 && (
                <ul className="text-[12.5px] break-words text-ink-3">
                  {e.changes.filter((ch) => shown(ch.field, ch)).map((ch) => (
                    <li key={ch.field}>
                      {knownFieldName(ch.field) ?? fieldLabel(ch.field)}: {e.action === "UPDATE" && <>{chipped(ch.field, ch.before, e)} → </>}
                      <span className="text-ink-2">{chipped(ch.field, e.action === "DELETE" ? ch.before : ch.after, e)}</span>
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

