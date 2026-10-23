import type { ReactNode } from "react";
import Link from "next/link";

import { sulitExerciseGate } from "@/app/_auth/sulit";
import { Button, ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/feedback";
import { InfoChip } from "@/components/ui/info-chip";
import { ClockTold } from "./clock-told";
import { evaluateAward } from "@/lib/award/evaluate";
import { INDENT_READING_DETAIL, indentExpiryRaised } from "@/lib/award/indent";
import { awardFindingTextFor, findingsForReader, DOCUMENT_LABEL, INSTRUMENT_LABEL, NON_COMMENCEMENT_LABEL, tenderTermText } from "@/lib/award/labels";
import { BASELINE_FIELDS, formDefaults, type BaselineField } from "@/lib/award/appendix-baseline";
import { loadOpeningGate } from "@/lib/opening/gate-read";
import { recallFault, RECALL_FAULT_TEXT } from "@/lib/approvals/recall";
import { committeeStandingOf } from "@/lib/approvals/recall-store";
import { awardFacts, awardHistory, exerciseMatters, type LoadedAward } from "@/lib/award/repo";
import { instrumentReturned, type ReturnRecord } from "@/lib/award/stage-two";
import { cancellable, editable } from "@/lib/award/status";
import type { AwardStatus, InstrumentKind } from "@/lib/award/types";
import { dayToDate } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { awardStanding } from "@/lib/suppliers/award-standing";
import { partyRegister, standingOf } from "@/lib/suppliers/standing-repo";
import { ACT_LABEL } from "@/lib/labels";
import { formatMoney, senFromDecimal, senToDecimalString } from "@/lib/money";
import { awardReadiness } from "@/lib/award/gate-read";
import { appendixMinimum, type InsuredKind } from "@/lib/award/insurance-terms";
import { applicableRequirements } from "@/lib/securities/insurance";
import { RECOMMENDATION_FIELDS } from "@/lib/evaluation/recommendation-fields";
import { conditionsOutstanding } from "@/lib/award/readiness";
import { db } from "@/lib/db";
import { AWARD_NOTE_ID, CancelAwardDrawer, CommencementDrawer, EditDetailsDrawer, EditTermsDrawer, IssueDrawer, RecordCommitmentDrawer, RecallAwardDrawer, SubmitAwardDrawer } from "@/app/awards/editors";
import type { StaffActor } from "@/lib/auth/types";
import { actStatusFault } from "@/lib/contract/act-status";
import type { AwardStepFacts, BeforeSigningFacts } from "@/lib/contract/case-steps";
import type { ContractStatus } from "@/lib/contract/types";

import { OverviewPanel } from "./overview-panel";
import { ApprovalPanel } from "./approval-panel";
import { InstrumentPanel } from "./instrument-panel";
import { DistributionPanel } from "./distribution-panel";
import { ReturnPanel } from "./return-panel";
import { ConditionsPanel } from "./conditions-panel";
import { SecuritiesPanel } from "./securities-panel";
import { HistoryPanel } from "./history-panel";
import { AwardRoutingSheetPanel } from "./routing-sheet-panel";
import { NOT_SET, yesNo, day, FaultList } from "./shared";
import { loadClockPlan } from "@/lib/award/clock-notices";
import { clockPlanChips, clockPlanWords, type ClockChips, type ClockKind } from "@/lib/inbox/clock-plan";

/// The award's panels, by the tab id they have on /awards/[id] (the case page maps them to stages, C-2).
export type AwardPanelId = "overview" | "approval" | "instrument" | "distribution" | "return" | "conditions" | "securities" | "routing" | "history";

/**
 * Everything the award's screen is made of, computed once and read by the case page (`/awards/[id]` now redirects to it) (Award and Contract
 * Requirements v2, C-2, C-3; design note 0004 C5). It moves what `awards/[id]/page.tsx` computed, unchanged; the two pages differ
 * only in how they lay it out.
 *
 * Nothing is read that the asked-for parts do not need (GN-01): the history only with `tab` "history", the committee
 * matters and sittings only for the Approval tab, the opening gate, the recommendation and the standing of the awardee only for
 * the header and the tabs that show them.
 *
 * The two SULIT answers are the award's own: `sulit` (the exercise's estimate and the identity-card number) and
 * `recommendation` (who is recommended and at what price, FR-EVL-014). The contract's gate is never passed in here.
 */
export interface AwardFinish {
  /// The header's drawers and the notes under it; null unless asked for.
  /// `fallback` is the one primary button when the step offers no action of its own (a blocked Send or Issue, with its reason in `headerNote`); `menu` holds the rest (plan 6.6).
  chrome: { fallback: ReactNode; menu: ReactNode; headerNote: ReactNode; callouts: ReactNode } | null;
  /// One panel at a time: the caller asks only for the one it shows.
  panel: (id: AwardPanelId, opts?: { termsReadOnly?: boolean }) => ReactNode;
  /// The number beside a counted tab; `history` only when the history was read.
  counts: { instrument: number | undefined; conditions: number | undefined; securities: number; history: number | null };
}

export interface AwardView {
  status: AwardStatus;
  kind: InstrumentKind;
  issued: boolean;
  ev: ReturnType<typeof evaluateAward>;
  f: Awaited<ReturnType<typeof awardFacts>>;
  /// The facts the case's step bar reads, each the condition today's screen uses (ADR 0037 F0-2).
  stepFacts: AwardStepFacts;
  /// Before signing's facts; null while there is no Contract row (lodging only after issue, R-4).
  before: BeforeSigningFacts | null;
  /// The award's main acts, as today's header offers them. Only the ones whose drawer is in the header.
  main: { SEND_FOR_APPROVAL?: ReactNode; ISSUE?: ReactNode; RECORD_COMMENCEMENT?: ReactNode };
  /// The award's own warnings (cancelled, barred supplier, late commencement, expired indent) for every stage of the case.
  caseCallouts: () => Promise<ReactNode>;
  /// The clocks running late today, by the conditions of the two callouts: each is told to staff once (FR-AWD-006, FR-AWD-009; C13).
  lateClocks: { kind: ClockKind; day: string; dayWords: string }[];
  /// Who each late clock is told to today and the words that say so (AC-42): the notification rule's offices and the requester. Read once, however many callers ask.
  clockTellings: () => Promise<{ kind: ClockKind; day: string; dayWords: string; recipientIds: string[]; words: string; told: ClockChips }[]>;
  /// The parts that depend on which tab is open, read once the page knows which that is.
  finish: (q: { tab: AwardPanelId | "none"; chrome: boolean }) => Promise<AwardFinish>;
}

export async function buildAwardView({ actor, l }: { actor: StaffActor; l: LoadedAward }): Promise<AwardView> {
  const { award, ex, org } = l;
  const today = org.today;
  const f = await awardFacts(l);
  const ev = evaluateAward(f.facts);
  const status = award.status as AwardStatus;
  const kind = award.instrumentKind as InstrumentKind;
  const loa = kind === "LETTER_OF_ACCEPTANCE";
  const edits = editable(status);
  const people = f.roster.people.filter((p) => p.isActive).map((p) => ({ value: p.id, label: p.name }));
  const policy = f.config.policy;
  const methodName = f.method?.nameEn ?? "A method no longer configured";
  const typeName = f.contractType?.nameEn ?? (ex.contractTypeCode ? "A type no longer configured" : NOT_SET);
  const issued = status === "ISSUED" || status === "ACCEPTED";

  // Step suggestions: holders of the office for the requisition's unit and their delegates first.
  const suggestions = (roleCode: string | null) => {
    if (!roleCode || !today) return people;
    const h = f.holdersOf(roleCode);
    const first = [...h.holderIds, ...h.delegates.map((d) => d.personId)];
    const top = people.filter((p) => first.includes(p.value)).map((p) => ({ ...p, label: `${p.label} — ${h.holderIds.includes(p.value) ? "holds the office" : "delegate"}` }));
    return [...top, ...people.filter((p) => !first.includes(p.value))];
  };

  // ------------------------------------------------------------------- actions
  const submitBlocks = ev.submitFaults.filter((x) => x.level === "block");
  const submitBlocker = status === "DRAFT" && submitBlocks.length ? "See what stops it, below." : null;
  const issueReady = status === "APPROVED" && ev.issueFaults.length === 0 && ev.signatory?.ok;
  const consequenceText = ev.consequence ? NON_COMMENCEMENT_LABEL[ev.consequence] : null;
  const routePreview = ev.route?.ok ? ev.route.chain.map((s) => `${f.issue?.matrix.roles[s.roleCode]?.nameEn ?? "An office no longer configured"} — ${ACT_LABEL[s.act]?.toLowerCase() ?? "acts"}${s.committeeCode ? ", as a committee decision" : ""}`) : [];

  // The exercise's estimate and the contractor's identity-card number are SULIT (NFR-SEC-002, FR-AWD-008): the award is an exercise's, so those named on the exercise and the roles
  // the organisation has chosen read them. One answer for the page, logged. Every reading is logged (allowed or refused), so it is asked only where a figure is shown or a
  // decision rests on it: the case page's other stages read none of it (C-3: the gates are unchanged, and a read that never reached a screen is not written).
  let exerciseAnswer: Awaited<ReturnType<typeof sulitExerciseGate>> | null = null;
  const exerciseGate = async () => (exerciseAnswer ??= await sulitExerciseGate(actor, award.exerciseId, "exercise", ["estimatedValue", "icNumber"]));

  const main: AwardView["main"] = {};
  if (status === "DRAFT") main.SEND_FOR_APPROVAL = <SubmitAwardDrawer id={award.id} blocker={submitBlocker} route={routePreview} />;
  if (issueReady && ev.signatory?.ok) {
    main.ISSUE = (
      <IssueDrawer
        id={award.id}
        signatory={ev.signatory.roleLabel}
        people={suggestions(ev.signatory.roleCode)}
        today={today}
        summary={[
          ["Instrument", INSTRUMENT_LABEL[kind]],
          ["Documents", ev.documents.map((d) => DOCUMENT_LABEL[d.kind]).join(", ")],
          ["Contract number", "fault" in ev.contractNumber ? NOT_SET : ev.contractNumber.source === "SERIES" ? "The next in its contract type's series" : `The indent's own number, ${ev.contractNumber.number}`],
          ["Copies to", "rows" in ev.distribution ? ev.distribution.rows.map((r) => r.recipientName).join(", ") : NOT_SET],
          ["Case handed to", f.config.unitName(policy.postContractUnitCode) ?? "Sections not set: recorded without them"],
        ]}
      />
    );
  }
  const commencementOffered = issued && !loa && !award.commencedOn;
  if (commencementOffered) main.RECORD_COMMENCEMENT = <CommencementDrawer id={award.id} today={today} />;

  // The step bar's facts (design note 0004 §6.1, F0-1, F0-2): each one the condition the screen above and the panels below use.
  const stepFacts: AwardStepFacts = {
    status,
    instrumentKind: kind,
    submitBlocks,
    issueReady: !!(issueReady && ev.signatory?.ok),
    issueFaults: ev.issueFaults,
    // Copies not yet sent, while the distribution panel offers its drawer (ISSUED or ACCEPTED): the drawer is also offered on a sent row, to correct it.
    despatchOpen: issued ? award.distributions.filter((r) => !r.despatchedOn).length : 0,
    // return-panel.tsx: the Return drawer is offered ISSUED or ACCEPTED, to a reader the award's gate grants. The step bar reads it only while ISSUED (an accepted award's
    // Award step is done whatever it says), so the gate is asked only then.
    returnOffered: status === "ISSUED" && (await exerciseGate()).state === "GRANTED",
    returned: instrumentReturned(kind, award.awardReturn),
    commencement: ev.commencement ?? null,
    commencementOffered,
  };

  let tellings: ReturnType<AwardView["clockTellings"]> | null = null;
  const clockTellings: AwardView["clockTellings"] = () =>
    (tellings ??= (async () => {
      const out: Awaited<ReturnType<AwardView["clockTellings"]>> = [];
      for (const c of lateClocks) {
        const plan = await loadClockPlan({ organisationId: org.id, organisationCode: actor.organisationCode, requestingUnitCode: l.req.requestingUnitCode, requesterId: l.req.requestingPersonId, today, kind: c.kind });
        const names = new Map((await db.authorityRole.findMany({ where: { organisationId: org.id, code: { in: plan.emptyOffices } }, select: { code: true, nameEn: true } })).map((r) => [r.code, r.nameEn] as const));
        const officeName = (code: string) => names.get(code) ?? "an office no longer configured";
        out.push({ ...c, recipientIds: plan.recipientIds, words: clockPlanWords(c.kind, plan, officeName, { restricted: ex.restricted }), told: clockPlanChips(c.kind, plan, officeName, { restricted: ex.restricted }) });
      }
      return out;
    })());

  /// The warnings about the award itself, shown on every stage of the case to a reader who sees the whole case (FR-AWD-006, FR-AWD-009, FR-AWD-008): cancelled, barred supplier,
  /// late commencement and an expired indent. They need no SULIT figure. The Award stage's header adds the others (`finish`'s chrome).
  async function caseCallouts(): Promise<ReactNode> {
    // 6.15a fix S-3: the linked supplier's standing, derived on the organisation's day; barred warns, never refuses.
    const vendorStanding = award.vendor && today ? await standingOf(award.vendor.id, org.id, today) : null;
    const awardee = vendorStanding ? awardStanding(vendorStanding.reading, formatDate) : null;
    const told = new Map((await clockTellings()).map((c) => [c.kind, c.told] as const));
    return (
      <>
      {status === "CANCELLED" && (
        <Callout tone="warn" title="Cancelled">
          {award.cancelReason || "No reason recorded."}
          {award.cancelConsequence && ` Consequence: ${NON_COMMENCEMENT_LABEL[award.cancelConsequence].toLowerCase()}.`}
          {award.cancelConsequence === "CANCEL_AND_BLACKLIST" &&
            (award.standingRequests.length > 0
              ? " Blacklisting was asked for."
              : award.vendor
                ? <> <Link href={`/suppliers/${award.vendor.id}?tab=standing&fromAward=${award.id}`}>Ask for the blacklisting of {award.vendor.registeredName}</Link>.</>
                : " Link the awardee to the register.")}
        </Callout>
      )}
      {awardee?.warning && status !== "CANCELLED" && (
        <Callout tone="warn" title="Awardee's supplier is barred">
          {awardee.warning.en}
        </Callout>
      )}
      {ev.commencement?.state === "LATE" && status === "ISSUED" && (
        <Callout tone="err" title="Work has not commenced">
          Grace ended {formatDate(ev.commencement.deadline)}. Consequence: {consequenceText ? `${consequenceText.toLowerCase()}.` : <Badge tone="warn">Not set</Badge>}
          <ClockTold told={told.get("COMMENCEMENT_LATE")} />
        </Callout>
      )}
      {ev.indent?.state === "EXPIRED" && issued && indentExpiryRaised(ev.indent, day(award.commencedOn), status) && (
        <Callout tone="err" title={`Indent expired ${formatDate(ev.indent.expiresOn)}`}>
          <ClockTold told={told.get("INDENT_EXPIRED")}>
            <InfoChip tone="warn" detail={INDENT_READING_DETAIL}>Assumed</InfoChip>
          </ClockTold>
        </Callout>
      )}
      </>
    );
  }

  const lateClocks: AwardView["lateClocks"] = [];
  if (ev.commencement?.state === "LATE" && status === "ISSUED") lateClocks.push({ kind: "COMMENCEMENT_LATE", day: ev.commencement.deadline, dayWords: formatDate(ev.commencement.deadline) });
  if (ev.indent?.state === "EXPIRED" && issued && indentExpiryRaised(ev.indent, day(award.commencedOn), status)) lateClocks.push({ kind: "INDENT_EXPIRED", day: ev.indent.expiresOn, dayWords: formatDate(ev.indent.expiresOn) });

  /// The parts that depend on which tab is open: asked once the page knows (it needs the steps, which need the facts above).
  async function finish({ tab, chrome }: { tab: AwardPanelId | "none"; chrome: boolean }): Promise<AwardFinish> {
    const want = (...ids: AwardPanelId[]) => ids.includes(tab as AwardPanelId);
    // Which SULIT answers the asked-for parts show: the header's notes and drawers, the Overview and the Return panel read the exercise's; the header and the Overview read
    // who is recommended (FR-EVL-014: a reader it is closed to is offered every bidder carried to evaluation, no pre-fill, no recommended figure and no "differs from the
    // recommendation" mark; the act that saves the award refuses them too, Phase 3b).
    const exerciseAsked = chrome || want("overview", "return") ? await exerciseGate() : null;
    const recommendation = chrome || want("overview") ? await sulitExerciseGate(actor, award.exerciseId, "evaluation", RECOMMENDATION_FIELDS) : null;
    const recommendationShown = recommendation?.state === "GRANTED";
    // Read only by the parts that asked for it above (the header, the Overview, the Return panel); the page asks `finish` for no other.
    const sulit = exerciseAsked as NonNullable<typeof exerciseAsked>;
    // 6.15a fix S-3: the linked supplier's standing, derived on the organisation's day; barred warns, never refuses.
    const needsAwardee = want("overview", "approval");
    const vendorStanding = needsAwardee && award.vendor && today ? await standingOf(award.vendor.id, org.id, today) : null;
    const awardee = vendorStanding ? awardStanding(vendorStanding.reading, formatDate) : null;

    const [history, matters, sittings] = await Promise.all([
      want("history") ? awardHistory(l) : Promise.resolve(null),
      want("approval") ? exerciseMatters(ex.id) : Promise.resolve([]),
      // Sittings still open for tabling, for a committee step's "Table at a sitting".
      // The earliest that has not already passed.
      want("approval")
        ? db.meeting.findMany({ where: { committee: { organisationId: org.id }, status: { in: ["SCHEDULED", "IN_PROGRESS"] }, ...(today ? { meetingDate: { gte: dayToDate(today) } } : {}) }, orderBy: [{ meetingDate: "asc" }, { id: "asc" }], select: { id: true, reference: true, meetingDate: true, committee: { select: { code: true } } } })
        : Promise.resolve([]),
    ]);

    let chromeParts: AwardFinish["chrome"] = null;
    if (chrome) {
      const canRecordCommitment = ["APPROVED", "ISSUED", "ACCEPTED"].includes(status) && !award.erpCommitmentNo;
      const canCancel = cancellable(status, { returned: instrumentReturned(kind, award.awardReturn), commenced: !!award.commencedOn });
      // FR-APR-017: only the originator recalls, before any decision. The action asks the same rule again, and also whether the matter is on a committee's agenda.
      const openAppointment = award.approvalInstances.find((i) => i.status === "PENDING" && i.domain === "appointment") ?? null;
      const recallStanding = openAppointment ? await committeeStandingOf(db, { exerciseId: award.exerciseId }, openAppointment.domain, openAppointment.openedAt) : null;
      const awardRecallRule = openAppointment ? recallFault({ routeStatus: openAppointment.status, steps: openAppointment.steps, tabledAwaitingDecision: recallStanding?.awaiting ?? 0, committeeDecided: recallStanding?.decided ?? 0, originatorIds: openAppointment.submittedByPersonId ? [openAppointment.submittedByPersonId] : [], actorPersonId: actor.personId, reason: "asked" }) : null;
      const termsValues = termsValuesOf(l, ev);
      // 64-C4: what the frozen tender states for each term, in words; null without a frozen Appendix.
      const tenderTexts = ev.appendix ? (Object.fromEntries(BASELINE_FIELDS.map((k) => [k, tenderTermText(k, ev.appendix!.baseline)])) as Record<BaselineField, string | null>) : null;
      // 64-C4-b: the tender Appendix's insurance minimum for each kind, in words, for the form's hints.
      const minimumText = (k: InsuredKind) => {
        const m = appendixMinimum(k, ev.appendix?.baseline ?? null);
        return m == null ? null : formatMoney(m);
      };
      const insuranceMinimums = ev.appendix ? { works: minimumText("WORKS"), liability: minimumText("PUBLIC_LIABILITY"), wc: minimumText("WORKMENS_COMPENSATION") } : null;
      // 6.7 (C-7): the bidders the opening carried to evaluation, where the exercise's openings apply.
      const openingGate = edits.details ? await loadOpeningGate(l.ex.id) : null;
      // 6.8 (E-9): where the evaluation applies, the awardee is the recommended tenderer; it is the one offered.
      const evaluationGate = f.facts.exercise.evaluation ?? null;
      const recommendedParty = recommendationShown ? (evaluationGate?.facts.issued?.recommendedPartyId ?? null) : null;
      // 6.15a fix S-3: each bidder's supplier standing beside its name; a barred one warns, the award is not refused.
      const carried = openingGate?.applies ? openingGate.carried.filter((p) => !recommendedParty || p.id === recommendedParty) : null;
      const carriedRegister = carried ? await partyRegister(carried.map((p) => p.id), org, formatDate) : new Map();
      const carriedParties = carried ? carried.map((p) => ({ value: p.id, label: `${p.name} (${p.registrationNo})${carriedRegister.get(p.id) ? ` — ${carriedRegister.get(p.id)!.standing.words.en} on the register` : ""}` })) : undefined;
      const recommendedText = recommendationShown && evaluationGate?.facts.issued ? { valueText: formatMoney(evaluationGate.facts.issued.price) } : null;
      const menu = (
        <>
          {edits.details && (
            <EditDetailsDrawer
              menu
              id={award.id}
              values={{ awardeePartyId: award.awardeePartyId ?? "", awardeeName: award.awardeeName, awardeeRegistrationNo: award.awardeeRegistrationNo, awardeeAddress: award.awardeeAddress, awardedValue: award.awardedValue.toString(), completionPeriod: String(award.completionPeriod), completionUnit: award.completionUnit, recValueDiffersReason: award.recValueDiffersReason ?? "", recPeriodDiffersReason: award.recPeriodDiffersReason ?? "" }}
              parties={carriedParties}
              recommended={recommendedText}
            />
          )}
          {edits.terms && <EditTermsDrawer menu id={award.id} values={termsValues} regulatedLabel={policy.regulatedActivityLabel} asked={{ retention: ev.terms?.retentionAsked ?? null, dlp: ev.terms?.dlpAsked ?? null }} tender={tenderTexts} insuranceMinimums={insuranceMinimums} />}
          {status === "PENDING_APPROVAL" && openAppointment && <RecallAwardDrawer menu id={award.id} blocker={awardRecallRule ? RECALL_FAULT_TEXT[awardRecallRule] : null} />}
          {canRecordCommitment && <RecordCommitmentDrawer menu id={award.id} indent={!loa} example={f.config.indentFormat?.example || null} today={today} />}
          {status === "ISSUED" && !loa && !award.commencedOn && <CommencementDrawer menu id={award.id} today={today} />}
          {canCancel && <CancelAwardDrawer menu id={award.id} issued={status === "ISSUED"} consequence={ev.commencement?.state === "LATE" && consequenceText ? `Work has not commenced within the grace period: the consequence recorded is ${consequenceText.toLowerCase()}.` : null} />}
        </>
      );
      const fallback =
        status === "DRAFT" ? (
          main.SEND_FOR_APPROVAL
        ) : status === "APPROVED" && !(issueReady && ev.signatory?.ok) ? (
          <Button size="sm" variant="primary" disabled aria-describedby={AWARD_NOTE_ID}>
            Issue
          </Button>
        ) : null;
      const issueShownCount = findingsForReader(ev.issueFaults, recommendationShown).length;
      const headerNote =
        status === "DRAFT" && submitBlocks.length ? (
          <span>
            <span className="font-semibold text-ink-2">Send for approval:</span> blocked, see below.
          </span>
        ) : status === "APPROVED" && !issueReady ? (
          <span>
            <span className="font-semibold text-ink-2">Issue:</span> blocked, {issueShownCount === 1 ? "one thing" : `${issueShownCount} things`} below.
          </span>
        ) : null;
      const callouts = (
        <>
          {!today && (
            <Callout tone="warn" title="Time zone not set. Dates cannot be judged." action={<ButtonLink href="/configuration/organisation" size="sm">Set time zone</ButtonLink>} />
          )}
          {status === "DRAFT" && submitBlocks.length > 0 && (
            <Callout tone="warn" title="Before it can go for approval">
              <FaultList faults={submitBlocks} figures={sulit.state === "GRANTED"} recommendation={recommendationShown} />
            </Callout>
          )}
          {status === "APPROVED" && ev.issueFaults.length > 0 && (
            <Callout tone="warn" title="Not ready to issue">
              <FaultList faults={ev.issueFaults} figures={sulit.state === "GRANTED"} recommendation={recommendationShown} />
            </Callout>
          )}
          {findingsForReader(ev.valueFaults.filter((x) => x.level === "warn"), recommendationShown).map((x, i) => (
            <Callout key={i} tone="warn">{awardFindingTextFor(x, sulit.state === "GRANTED", recommendationShown)}</Callout>
          ))}
        </>
      );
      const hasMenu = edits.details || edits.terms || (status === "PENDING_APPROVAL" && !!openAppointment) || canRecordCommitment || (status === "ISSUED" && !loa && !award.commencedOn) || canCancel;
      chromeParts = { fallback, menu: hasMenu ? menu : null, headerNote, callouts };
    }

    // ------------------------------------------------------------------- the panels
    const ret: ReturnRecord | null = award.awardReturn
      ? {
          signedLetterReceivedOn: day(award.awardReturn.signedLetterReceivedOn),
          declarationReceivedOn: day(award.awardReturn.declarationReceivedOn),
          authorisationReceivedOn: day(award.awardReturn.authorisationReceivedOn),
          signatoryName: award.awardReturn.signatoryName,
          icNumber: award.awardReturn.icNumber,
          occupation: award.awardReturn.occupation,
          address: award.awardReturn.address,
          capacity: award.awardReturn.capacity,
          contractorSigned: award.awardReturn.contractorSigned,
          stampAffixed: award.awardReturn.stampAffixed,
          witnessName: award.awardReturn.witnessName,
          witnessSigned: award.awardReturn.witnessSigned,
        }
      : null;
    const requirements = applicableRequirements(f.config.requirements, ex.contractTypeCode);
    // OD-5: before acceptance the return counts with its scans; an accepted award is not re-judged.
    // 6.12: the one reading the award and its contract share, with the recorded uncovered-wages check.
    const gate = awardReadiness(award, ev.requiredBond, requirements, ev.appendix?.baseline ?? null);
    const securities = award.contract?.securities ?? [];
    const policies = award.contract?.policies ?? [];

    const panel = (id: AwardPanelId, opts?: { termsReadOnly?: boolean }): ReactNode => {
      switch (id) {
        case "overview":
          return <OverviewPanel sulit={sulit} l={l} ev={ev} awardee={awardee} recommendation={recommendationShown ? (f.facts.exercise.evaluation?.facts.issued ?? null) : null} methodName={methodName} typeName={typeName} policyLabel={policy.regulatedActivityLabel} validityDays={policy.indentValidityDays} expiredRule={f.config.indentExpiredRule ? (f.config.indentExpiredRule.isActive ? "ON" : "OFF") : "NONE"} unitName={f.config.unitName} />;
        case "approval":
          return <ApprovalPanel l={l} ev={ev} awardee={awardee} suggestions={suggestions} today={today} matters={matters} sittings={sittings} roleName={(c) => f.issue?.matrix.roles[c]?.nameEn ?? "An office no longer configured"} />;
        case "instrument":
          return <InstrumentPanel l={l} ev={ev} />;
        case "distribution":
          return <DistributionPanel l={l} ev={ev} />;
        case "return":
          return <ReturnPanel sulit={sulit} l={l} ret={ret} people={people} />;
        case "conditions":
          return <ConditionsPanel l={l} gate={gate} kinds={f.config.conditionKinds.filter((k) => k.retiredOn == null).map((k) => ({ value: k.id, label: k.nameEn }))} today={today} />;
        case "securities":
          return <SecuritiesPanel l={l} ev={ev} f={f} requirements={requirements} people={people} today={today} termsValues={termsValuesOf(l, ev)} termsReadOnly={opts?.termsReadOnly} />;
        case "routing":
          return <AwardRoutingSheetPanel l={l} people={people} today={today} />;
        case "history":
          return history ? <HistoryPanel entries={history.entries} total={history.total} timeZone={org.timeZone} /> : null;
      }
    };

    return {
      chrome: chromeParts,
      panel,
      counts: {
        instrument: issued ? award.documents.length : undefined,
        // What still stands between the award and signing, not how many are recorded.
        conditions: conditionsOutstanding(gate.items, award.conditions) || undefined,
        securities: securities.length + policies.length,
        history: history?.total ?? null,
      },
    };
  }

  const c = award.contract;
  const before: BeforeSigningFacts | null = c
    ? {
        readiness: awardReadiness(award, ev.requiredBond, applicableRequirements(f.config.requirements, ex.contractTypeCode), ev.appendix?.baseline ?? null),
        securitiesToVerify: [...c.securities, ...c.policies].filter((x) => x.status === "LODGED").length,
        // securities-panel.tsx `open`: the register's acts ask FORMATION's row.
        lodgeOffered: !actStatusFault("FORMATION", c.status as ContractStatus),
      }
    : null;

  return { status, kind, issued, ev, f, stepFacts, main, before, caseCallouts, lateClocks, clockTellings, finish };
}

/// The award's recorded terms as the terms form and the securities panel read them, with the tender's pre-fill on a first save (64-C4).
function termsValuesOf(l: LoadedAward, ev: ReturnType<typeof evaluateAward>) {
  const { award } = l;
  const termsValues: Record<string, string | boolean | null> = {
    startDate: day(award.startDate),
    regulatedActivity: yesNo(award.regulatedActivity),
    bondRequired: yesNo(award.bondRequired),
    bondNotRequiredReason: award.bondNotRequiredReason,
    bondBasis: award.bondBasis,
    bondPercent: award.bondPercent?.toString() ?? null,
    bondBasisAmount: award.bondBasisAmount?.toString() ?? null,
    bondValidityExtraMonths: award.bondValidityExtraMonths == null ? null : String(award.bondValidityExtraMonths),
    bondBasisProvenance: award.bondBasisProvenance,
    bondBasisNote: award.bondBasisNote,
    ladAmount: award.ladAmount?.toString() ?? null,
    ladUnit: award.ladUnit,
    retentionPercent: award.retentionPercent?.toString() ?? null,
    retentionCapPercent: award.retentionCapPercent?.toString() ?? null,
    dlpMonths: award.dlpMonths == null ? null : String(award.dlpMonths),
    termsProvenance: award.termsProvenance,
    wcBasis: award.wcBasis,
    worksSumInsured: award.worksSumInsured?.toString() ?? null,
    liabilitySumInsured: award.liabilitySumInsured?.toString() ?? null,
    wcSumInsured: award.wcSumInsured?.toString() ?? null,
    ladDiffersReason: award.ladDiffersReason,
    dlpDiffersReason: award.dlpDiffersReason,
    regulatedDiffersReason: award.regulatedDiffersReason,
    worksInsuredDiffersReason: award.worksInsuredDiffersReason,
    liabilityInsuredDiffersReason: award.liabilityInsuredDiffersReason,
    wcInsuredDiffersReason: award.wcInsuredDiffersReason,
  };
  // 64-C4: an award opened before its terms were pre-filled is offered the tender's on its first save.
  if (ev.appendix && editable(award.status as AwardStatus).terms) {
    const d = formDefaults(ev.appendix.baseline, { ladAmount: award.ladAmount == null ? null : senFromDecimal(award.ladAmount), ladUnit: award.ladUnit, dlpMonths: award.dlpMonths, regulatedActivity: award.regulatedActivity }, { lad: award.ladDiffersReason, dlp: award.dlpDiffersReason, regulated: award.regulatedDiffersReason });
    if (d.ladAmount != null) Object.assign(termsValues, { ladAmount: senToDecimalString(d.ladAmount), ladUnit: d.ladUnit });
    if (d.dlpMonths != null) termsValues.dlpMonths = String(d.dlpMonths);
    if (d.regulatedActivity != null) termsValues.regulatedActivity = yesNo(d.regulatedActivity);
  }
  return termsValues;
}
