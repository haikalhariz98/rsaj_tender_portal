import { exerciseIsHidden, sulitExerciseGate } from "@/app/_auth/sulit";
import { RECOMMENDATION_FIELDS } from "@/lib/evaluation/recommendation-fields";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AwardIcon, CheckIcon, ClipboardIcon, ClockIcon, FileIcon, InboxIcon, RouteIcon, ShieldIcon, SlidersIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { RecordCrumb } from "@/components/shell/record-crumb";
import { Tabs } from "@/components/tabs";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { evaluateAward } from "@/lib/award/evaluate";
import { INDENT_READING, indentExpiryRaised } from "@/lib/award/indent";
import { AWARD_STATUS_LABEL, AWARD_STATUS_TONE, awardFindingTextFor, findingsForReader, DOCUMENT_LABEL, INSTRUMENT_LABEL, INSTRUMENT_SHORT, NON_COMMENCEMENT_LABEL, tenderTermText } from "@/lib/award/labels";
import { BASELINE_FIELDS, formDefaults, type BaselineField } from "@/lib/award/appendix-baseline";
import { conditionsOutstanding } from "@/lib/award/readiness";
import { loadOpeningGate } from "@/lib/opening/gate-read";
import { recallFault, RECALL_FAULT_TEXT } from "@/lib/approvals/recall";
import { committeeStandingOf } from "@/lib/approvals/recall-store";
import { awardFacts, awardHistory, exerciseMatters, loadAward } from "@/lib/award/repo";
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
import { db } from "@/lib/db";
import { AWARD_NOTE_ID, CancelAwardDrawer, CommencementDrawer, EditDetailsDrawer, EditTermsDrawer, IssueDrawer, RecordCommitmentDrawer, RecallAwardDrawer, SubmitAwardDrawer } from "@/app/awards/editors";
import { requireStaff } from "@/app/_auth/actor";
import { OverviewPanel } from "@/app/projects/[id]/award/overview-panel";
import { ApprovalPanel } from "@/app/projects/[id]/award/approval-panel";
import { InstrumentPanel } from "@/app/projects/[id]/award/instrument-panel";
import { DistributionPanel } from "@/app/projects/[id]/award/distribution-panel";
import { ReturnPanel } from "@/app/projects/[id]/award/return-panel";
import { ConditionsPanel } from "@/app/projects/[id]/award/conditions-panel";
import { SecuritiesPanel } from "@/app/projects/[id]/award/securities-panel";
import { HistoryPanel } from "@/app/projects/[id]/award/history-panel";
import { AwardRoutingSheetPanel } from "@/app/projects/[id]/award/routing-sheet-panel";
import { NonAwardPanel } from "./non-award-panel";
import { money, NOT_SET, yesNo, day, FaultList } from "@/app/projects/[id]/award/shared";

export const dynamic = "force-dynamic";

export default async function AwardPage(props: PageProps<"/awards/[id]">) {
  const actor = await requireStaff();
  const [{ id }, { tab }] = await Promise.all([props.params, props.searchParams as Promise<{ tab?: string }>]);
  const l = await loadAward(actor.organisationId, id);
  // FR-MTD-007: an award of a restricted exercise reads as gone to anyone not named on the exercise, and the attempt is logged.
  if (!l || (await exerciseIsHidden(actor, l.award.exerciseId))) notFound();
  const { award, ex, org } = l;
  const today = org.today;
  // 6.15a fix S-3: the linked supplier's standing, derived on the organisation's day; barred warns, never refuses.
  const vendorStanding = award.vendor && today ? await standingOf(award.vendor.id, org.id, today) : null;
  const awardee = vendorStanding ? awardStanding(vendorStanding.reading, formatDate) : null;
  const [f, history, matters, sittings] = await Promise.all([
    awardFacts(l),
    awardHistory(l),
    exerciseMatters(ex.id),
    // Sittings still open for tabling, for a committee step's "Table at a sitting".
    // The earliest that has not already passed.
    db.meeting.findMany({ where: { committee: { organisationId: org.id }, status: { in: ["SCHEDULED", "IN_PROGRESS"] }, ...(today ? { meetingDate: { gte: dayToDate(today) } } : {}) }, orderBy: [{ meetingDate: "asc" }, { id: "asc" }], select: { id: true, reference: true, meetingDate: true, committee: { select: { code: true } } } }),
  ]);
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
  // FR-APR-017: only the originator recalls, before any decision. The action asks the same rule again, and also whether the matter is on a committee's agenda.
  const openAppointment = award.approvalInstances.find((i) => i.status === "PENDING" && i.domain === "appointment") ?? null;
  const recallStanding = openAppointment ? await committeeStandingOf(db, { exerciseId: award.exerciseId }, openAppointment.domain, openAppointment.openedAt) : null;
  const awardRecallRule = openAppointment ? recallFault({ routeStatus: openAppointment.status, steps: openAppointment.steps, tabledAwaitingDecision: recallStanding?.awaiting ?? 0, committeeDecided: recallStanding?.decided ?? 0, originatorIds: openAppointment.submittedByPersonId ? [openAppointment.submittedByPersonId] : [], actorPersonId: actor.personId, reason: "asked" }) : null;
  const issueReady = status === "APPROVED" && ev.issueFaults.length === 0 && ev.signatory?.ok;
  const canRecordCommitment = ["APPROVED", "ISSUED", "ACCEPTED"].includes(status) && !award.erpCommitmentNo;
  const canCancel = cancellable(status, { returned: instrumentReturned(kind, award.awardReturn), commenced: !!award.commencedOn });
  const termsValues = {
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
  if (ev.appendix && editable(status).terms) {
    const d = formDefaults(ev.appendix.baseline, { ladAmount: award.ladAmount == null ? null : senFromDecimal(award.ladAmount), ladUnit: award.ladUnit, dlpMonths: award.dlpMonths, regulatedActivity: award.regulatedActivity }, { lad: award.ladDiffersReason, dlp: award.dlpDiffersReason, regulated: award.regulatedDiffersReason });
    if (d.ladAmount != null) Object.assign(termsValues, { ladAmount: senToDecimalString(d.ladAmount), ladUnit: d.ladUnit });
    if (d.dlpMonths != null) termsValues.dlpMonths = String(d.dlpMonths);
    if (d.regulatedActivity != null) termsValues.regulatedActivity = yesNo(d.regulatedActivity);
  }
  // 64-C4: what the frozen tender states for each term, in words; null without a frozen Appendix.
  const tenderTexts = ev.appendix ? (Object.fromEntries(BASELINE_FIELDS.map((k) => [k, tenderTermText(k, ev.appendix!.baseline)])) as Record<BaselineField, string | null>) : null;
  // 64-C4-b: the tender Appendix's insurance minimum for each kind, in words, for the form's hints.
  const minimumText = (k: InsuredKind) => {
    const m = appendixMinimum(k, ev.appendix?.baseline ?? null);
    return m == null ? null : formatMoney(m);
  };
  const insuranceMinimums = ev.appendix ? { works: minimumText("WORKS"), liability: minimumText("PUBLIC_LIABILITY"), wc: minimumText("WORKMENS_COMPENSATION") } : null;
  const routePreview = ev.route?.ok ? ev.route.chain.map((s) => `${f.issue?.matrix.roles[s.roleCode]?.nameEn ?? "An office no longer configured"} — ${ACT_LABEL[s.act]?.toLowerCase() ?? "acts"}${s.committeeCode ? ", as a committee decision" : ""}`) : [];
  const consequenceText = ev.consequence ? NON_COMMENCEMENT_LABEL[ev.consequence] : null;

  // 6.7 (C-7): the bidders the opening carried to evaluation, where the exercise's openings apply.
  const openingGate = edits.details ? await loadOpeningGate(l.ex.id) : null;
  // 6.8 (E-9): where the evaluation applies, the awardee is the recommended tenderer; it is the one offered.
  const evaluationGate = f.facts.exercise.evaluation ?? null;
  // Who is recommended, and at what price, is SULIT (FR-EVL-014): read by those the evaluation is open to. A reader it is closed to is offered every bidder carried to
  // evaluation, no pre-fill, no recommended figure and no "differs from the recommendation" mark; the act that saves the award refuses them too (Phase 3b).
  const recommendation = await sulitExerciseGate(actor, award.exerciseId, "evaluation", RECOMMENDATION_FIELDS);
  const recommendationShown = recommendation.state === "GRANTED";
  const recommendedParty = recommendationShown ? (evaluationGate?.facts.issued?.recommendedPartyId ?? null) : null;
  // 6.15a fix S-3: each bidder's supplier standing beside its name; a barred one warns, the award is not refused.
  const carried = openingGate?.applies ? openingGate.carried.filter((p) => !recommendedParty || p.id === recommendedParty) : null;
  const carriedRegister = carried ? await partyRegister(carried.map((p) => p.id), org, formatDate) : new Map();
  const carriedParties = carried ? carried.map((p) => ({ value: p.id, label: `${p.name} (${p.registrationNo})${carriedRegister.get(p.id) ? ` — ${carriedRegister.get(p.id)!.standing.words.en} on the register` : ""}` })) : undefined;
  const recommendedText = recommendationShown && evaluationGate?.facts.issued ? { valueText: formatMoney(evaluationGate.facts.issued.price) } : null;
  const actions = (
    <>
      {edits.details && (
        <EditDetailsDrawer
          id={award.id}
          values={{ awardeePartyId: award.awardeePartyId ?? "", awardeeName: award.awardeeName, awardeeRegistrationNo: award.awardeeRegistrationNo, awardeeAddress: award.awardeeAddress, awardedValue: award.awardedValue.toString(), completionPeriod: String(award.completionPeriod), completionUnit: award.completionUnit, recValueDiffersReason: award.recValueDiffersReason ?? "", recPeriodDiffersReason: award.recPeriodDiffersReason ?? "" }}
          parties={carriedParties}
          recommended={recommendedText}
        />
      )}
      {edits.terms && <EditTermsDrawer id={award.id} values={termsValues} regulatedLabel={policy.regulatedActivityLabel} asked={{ retention: ev.terms?.retentionAsked ?? null, dlp: ev.terms?.dlpAsked ?? null }} tender={tenderTexts} insuranceMinimums={insuranceMinimums} />}
      {status === "DRAFT" && <SubmitAwardDrawer id={award.id} blocker={submitBlocker} route={routePreview} />}
      {status === "PENDING_APPROVAL" && openAppointment && <RecallAwardDrawer id={award.id} blocker={awardRecallRule ? RECALL_FAULT_TEXT[awardRecallRule] : null} />}
      {canRecordCommitment && <RecordCommitmentDrawer id={award.id} indent={!loa} example={f.config.indentFormat?.example || null} today={today} />}
      {status === "APPROVED" && !(issueReady && ev.signatory?.ok) && (
        <Button size="sm" variant="primary" disabled aria-describedby={AWARD_NOTE_ID}>
          Issue
        </Button>
      )}
      {issueReady && ev.signatory?.ok && (
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
      )}
      {issued && !loa && !award.commencedOn && <CommencementDrawer id={award.id} today={today} />}
      {canCancel && <CancelAwardDrawer id={award.id} issued={status === "ISSUED"} consequence={ev.commencement?.state === "LATE" && consequenceText ? `Work has not commenced within the grace period: the consequence recorded is ${consequenceText.toLowerCase()}.` : null} />}
    </>
  );
  const issueShownCount = findingsForReader(ev.issueFaults, recommendationShown).length;
  const headerNote =
    status === "DRAFT" && submitBlocks.length ? (
      <span>
        <span className="font-semibold text-ink-2">Send for approval:</span> not yet — see what stops it, below.
      </span>
    ) : status === "APPROVED" && !issueReady ? (
      <span>
        <span className="font-semibold text-ink-2">Issue:</span> not yet — {issueShownCount === 1 ? "one thing below is" : `${issueShownCount} things below are`} not in place.
      </span>
    ) : null;

  // The exercise's estimate and the contractor's identity-card number are SULIT (NFR-SEC-002, FR-AWD-008): the award is an exercise's, so those named on the exercise and the roles
  // the organisation has chosen read them. One answer for the page, logged.
  const sulit = await sulitExerciseGate(actor, award.exerciseId, "exercise", ["estimatedValue", "icNumber"]);
  // ------------------------------------------------------------------- the tabs
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

  const tabs = [
    { id: "overview", label: "Overview", icon: <AwardIcon size={15} />, panel: <OverviewPanel sulit={sulit} l={l} ev={ev} awardee={awardee} recommendation={recommendationShown ? (f.facts.exercise.evaluation?.facts.issued ?? null) : null} methodName={methodName} typeName={typeName} policyLabel={policy.regulatedActivityLabel} validityDays={policy.indentValidityDays} expiredRule={!!f.config.indentExpiredRule} unitName={f.config.unitName} /> },
    {
      id: "approval",
      label: "Approval",
      icon: <RouteIcon size={15} />,
      panel: <ApprovalPanel l={l} ev={ev} awardee={awardee} suggestions={suggestions} today={today} matters={matters} sittings={sittings} roleName={(c) => f.issue?.matrix.roles[c]?.nameEn ?? "An office no longer configured"} />,
    },
    { id: "instrument", label: "Instrument", icon: <FileIcon size={15} />, count: issued ? award.documents.length : undefined, panel: <InstrumentPanel l={l} ev={ev} /> },
    {
      id: "distribution",
      label: "Distribution",
      icon: <InboxIcon size={15} />,
      panel: <DistributionPanel l={l} ev={ev} />,
    },
    { id: "return", label: "Return", icon: <ClipboardIcon size={15} />, panel: <ReturnPanel sulit={sulit} l={l} ret={ret} people={people} /> },
    // Phase 4d (FR-AWD-010, policy D7): the notices to the tenderers whose bid did not win. Read only while this tab is the one open.
    { id: "notices", label: "Notices to tenderers", icon: <InboxIcon size={15} />, lazy: true, panel: tab === "notices" ? <NonAwardPanel actor={actor} award={{ id: award.id, exerciseId: award.exerciseId, status: award.status, awardeePartyId: award.awardeePartyId }} /> : null },
    {
      id: "conditions",
      label: "Conditions",
      icon: <CheckIcon size={15} />,
      // What still stands between the award and signing, not how many are recorded.
      count: conditionsOutstanding(gate.items, award.conditions) || undefined,
      panel: (
        <ConditionsPanel
          l={l}
          gate={gate}
          kinds={f.config.conditionKinds.filter((k) => k.retiredOn == null).map((k) => ({ value: k.id, label: k.nameEn }))}
          today={today}
        />
      ),
    },
    {
      id: "securities",
      label: "Securities",
      icon: <ShieldIcon size={15} />,
      count: securities.length + policies.length,
      panel: <SecuritiesPanel l={l} ev={ev} f={f} requirements={requirements} people={people} today={today} termsValues={termsValues} />,
    },
    // 6.14 increment 1 (rulings condition): the pre-award routing sheet over the appointment route.
    { id: "routing", label: "Routing sheet", icon: <SlidersIcon size={15} />, lazy: true, panel: tab === "routing" ? <AwardRoutingSheetPanel l={l} people={people} today={today} /> : null },
    { id: "history", label: "History", icon: <ClockIcon size={15} />, count: history.total, panel: <HistoryPanel entries={history.entries} total={history.total} timeZone={org.timeZone} /> },
  ];

  return (
    <>
      <RecordCrumb label={award.reference} />
      <PageHeader
        eyebrow={<Link href="/awards">Awards</Link>}
        title={award.awardeeName}
        badge={
          <Badge tone={AWARD_STATUS_TONE[status]} dot>
            {AWARD_STATUS_LABEL[status]}
          </Badge>
        }
        subtitle={ex.title}
        meta={[
          <span key="ref" className="font-mono text-[12.5px]">{award.reference}</span>,
          <span key="for">for <Link href={`/sourcing/${ex.id}?tab=award`}>{ex.reference}</Link></span>,
          <span key="v" className="tabular-nums">{money(award.awardedValue)}</span>,
          INSTRUMENT_SHORT[kind],
          // Who signs: named once it is signed, the office until then; a cancelled award states neither.
          status === "CANCELLED" ? null : award.signatoryName ? `Signed by ${award.signatoryName}, ${award.signatoryRoleLabel ?? "office not recorded"}` : ev.signatory?.ok ? `To be signed by the ${ev.signatory.roleLabel}` : "Signatory not resolved",
          award.contract ? `Contract ${award.contract.number}` : status === "CANCELLED" ? null : "No contract number yet",
        ]}
        actions={actions}
        actionsNote={headerNote}
        actionsNoteId={AWARD_NOTE_ID}
      />

      <div className="mb-6 flex flex-col gap-3">
        {status === "CANCELLED" && (
          <Callout tone="info" title="Cancelled">
            {award.cancelReason || "No reason recorded."}
            {award.cancelConsequence && ` Consequence recorded: ${NON_COMMENCEMENT_LABEL[award.cancelConsequence].toLowerCase()}.`}
            {award.cancelConsequence === "CANCEL_AND_BLACKLIST" &&
              (award.standingRequests.length > 0
                ? " Blacklisting was asked for from this award, on the supplier's record."
                : award.vendor
                  ? <> Blacklisting is asked for on the supplier&apos;s record, where its route decides it: <Link href={`/suppliers/${award.vendor.id}?tab=standing&fromAward=${award.id}`}>ask for the blacklisting of {award.vendor.registeredName}</Link>.</>
                  : " Blacklisting is asked for on the supplier's record once the awardee is linked to the supplier register (from the supplier's record, Participation).")}
          </Callout>
        )}
        {awardee?.warning && status !== "CANCELLED" && (
          <Callout tone="warn" title="The awardee's supplier is barred on the register">
            {awardee.warning.en}
          </Callout>
        )}
        {!today && (
          <Callout tone="warn" title="The organisation's time zone is not set" action={<ButtonLink href="/configuration/organisation" size="sm">Set time zone</ButtonLink>}>
            Sending for approval, issuing and recording depend on today&apos;s date, which is not assumed to be UTC.
          </Callout>
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
        {ev.commencement?.state === "LATE" && status === "ISSUED" && (
          <Callout tone="err" title="Work has not commenced">
            The grace period ended on {formatDate(ev.commencement.deadline)}. The variant&apos;s consequence: {consequenceText ? consequenceText.toLowerCase() : "not set on the variant"}. Cancelling records it; a blacklisting is then asked for on the supplier&apos;s record, where its route decides it. Nothing is sent.
          </Callout>
        )}
        {ev.indent?.state === "EXPIRED" && issued && indentExpiryRaised(ev.indent, day(award.commencedOn), status) && (
          <Callout tone="err" title="The indent has expired">
            It expired on {formatDate(ev.indent.expiresOn)}. {f.config.indentExpiredRule ? `The rule “${f.config.indentExpiredRule.nameEn}” names who is to be told;` : "No notification rule names who is to be told;"} nothing is sent from the portal in this phase. {INDENT_READING}
          </Callout>
        )}
      </div>

      <Tabs initial={tab} label="Award" tabs={tabs} />
    </>
  );
}

// ------------------------------------------------------------------ overview
