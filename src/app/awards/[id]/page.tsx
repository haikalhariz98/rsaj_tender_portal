import { actStatusFault } from "@/lib/contract/act-status";
import type { ContractStatus } from "@/lib/contract/types";
import Link from "next/link";
import { historyEntityLabel } from "@/lib/audit/entity-labels";
import { DOCUMENT_ENTITY_LABEL } from "@/lib/documents/audit-view";
import { notFound } from "next/navigation";

import { AwardIcon, CheckIcon, ClipboardIcon, ClockIcon, FileIcon, InboxIcon, PrinterIcon, RouteIcon, ShieldIcon, SlidersIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { OwnerAttachments } from "@/components/attachments/owner-attachments";
import { RecordCrumb } from "@/components/shell/record-crumb";
import { Tabs } from "@/components/tabs";
import { ActBadge, actLabel, isMandatoryAct } from "@/components/ui/act";
import { EscalateDrawer } from "@/app/approvals/editors";
import { escalationText } from "@/lib/authority/escalation-labels";
import { Badge, Chip } from "@/components/ui/badge";
import { recommendationDifferences } from "@/lib/evaluation/award-gate";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { ProvenanceBadge } from "@/components/ui/provenance";
import { KeyValues, Stat } from "@/components/ui/stat";
import { fieldLabel, foldPeriodChanges } from "@/lib/audit/diff";
import { routeTone, stepTone } from "@/lib/ui/status-tone";
import { CONTRACT_YEAR_WORDS, contractYearReading } from "@/lib/contract/issue-year";
import { distributionComplete } from "@/lib/award/distribution";
import { evaluateAward, type AwardEvaluation } from "@/lib/award/evaluate";
import { INDENT_READING, indentExpiryRaised } from "@/lib/award/indent";
import {
  ACCEPTANCE_FAULT_LABEL,
  AWARD_STATUS_LABEL,
  AWARD_STATUS_TONE,
  awardFindingText,
  BOND_BASIS_LABEL,
  COMMITMENT_KIND_LABEL,
  CONTRACT_STATUS_LABEL,
  DELIVERY_LABEL,
  DOCUMENT_LABEL,
  DOCUMENT_SLUG,
  FIX_AT,
  INSTRUMENT_LABEL,
  INSTRUMENT_SHORT,
  INSURANCE_KIND_LABEL,
  LANGUAGE_LABEL,
  NON_COMMENCEMENT_LABEL,
  noReasonText,
  periodText,
  REGISTER_STATUS_LABEL,
  REGISTER_STATUS_TONE,
  RETURN_ITEM_LABEL,
  RETURN_SLOT_LABEL,
  returnScansText,
  SECURITY_FORM_LABEL,
  SECURITY_KIND_LABEL,
  WC_BASIS_LABEL,
  WAITING_FOR_PAPER,
  WC_CHECK_LABEL,
  DIFFERS_TEXT,
  tenderTermText,
} from "@/lib/award/labels";
import { BASELINE_FIELDS, formDefaults, type BaselineField } from "@/lib/award/appendix-baseline";
import { formatPct } from "@/lib/tender-docs/percent";
import { mergeFieldLabel } from "@/lib/award/fields";
import { conditionsOutstanding, readinessGate } from "@/lib/award/readiness";
import { loadOpeningGate } from "@/lib/opening/gate-read";
import { awardFacts, awardHistory, exerciseMatters, latestRoute, loadAward, matterRecord, type LoadedAward } from "@/lib/award/repo";
import { acceptancePageFaults, instrumentReturned, RETURN_SCANS, returnState, scansAwaitingPaper, scansMissing, scansRequired, type ReturnRecord } from "@/lib/award/stage-two";
import { isLive } from "@/lib/documents/evidence";
import { cancellable, editable } from "@/lib/award/status";
import { absentFrom } from "@/lib/award/appointment";
import type { AwardStatus, Finding, InstrumentKind } from "@/lib/award/types";
import { dayToDate, storedDay } from "@/lib/dates";
import { APPOINTMENT_DOMAIN } from "@/lib/method/types";
import { formatDate, formatOrgDay } from "@/lib/format";
import { awardStanding, type AwardStanding } from "@/lib/suppliers/award-standing";
import { partyRegister, standingOf } from "@/lib/suppliers/standing-repo";
import { ACT_DONE_LABEL, ACT_LABEL } from "@/lib/labels";
import { boundarySentence, REGIME_LABEL } from "@/lib/method/labels";
import type { Regime } from "@/lib/method/types";
import { formatMoney, parseSen, senFromDecimal, senToDecimalString } from "@/lib/money";
import { DECISION_LABEL } from "@/lib/requisition/labels";
import { earlierSteps, returnTargetBeforeNext, type RejectionKind } from "@/lib/authority/rejection";
import { routeCoreText, stepOriginText } from "@/lib/authority/core-routing-labels";
import { appliedText, CHOICE_WHY_TEXT, ifRejectedText, REJECTION_KIND_LABEL } from "@/lib/authority/rejection-labels";
import { derivedAnnualValue } from "@/lib/securities/bond";
import { expiryAlert } from "@/lib/securities/expiry";
import { awardReadiness, awardSumsOf } from "@/lib/award/gate-read";
import { appendixMinimum, governingSum, INSURED_KINDS, type Governing, type InsuredKind } from "@/lib/award/insurance-terms";
import { AWARD_TERM_WORDS, type AwardTerm } from "@/lib/contract/award-correction";
import { ReadinessGateList } from "@/components/contract/readiness-gate";
import { applicableRequirements, derivedLimit, wcSumCheck } from "@/lib/securities/insurance";
import { db } from "@/lib/db";
import { tablingQuery } from "@/lib/committee/table-prefill";

import { AwardRoutingSheetPanel } from "./routing-sheet-panel";
import {
  AddConditionDrawer,
  AWARD_NOTE_ID,
  AwardChoiceDrawer,
  CancelAwardDrawer,
  CiteDecisionDrawer,
  CommencementDrawer,
  DecideStepDrawer,
  DespatchDrawer,
  EditDetailsDrawer,
  EditTermsDrawer,
  IssueDrawer,
  LodgePolicyDrawer,
  LodgeSecurityDrawer,
  RecordCommitmentDrawer,
  ReturnDrawer,
  ReviewDrawer,
  SatisfyConditionDrawer,
  SubmitAwardDrawer,
} from "../editors";

export const dynamic = "force-dynamic";

const money = (v: { toString(): string } | null | undefined) => (v == null ? null : formatMoney(parseSen(v.toString())));
const pct = (v: { toString(): string } | null | undefined) => (v == null ? null : `${v.toString().replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "")}%`);
const NOT_SET = "Not set";
const notSet = (what = NOT_SET) => <span className="text-ink-4">{what}</span>;
const yesNo = (v: boolean | null) => (v == null ? null : v ? "yes" : "no");
const day = (d: Date | null | undefined) => (d ? storedDay(d) : null);
const tone = (l: string) => (l === "block" || l === "err" ? "err" : l === "info" ? "info" : "warn") as "err" | "warn" | "info";

function FaultList({ faults }: { faults: readonly Finding[] }) {
  return (
    <ul className="flex list-disc flex-col gap-1 pl-5">
      {faults.map((f, i) => (
        <li key={i}>
          {awardFindingText(f)}
          {FIX_AT[f.code] && (
            <>
              {" "}
              <Link href={FIX_AT[f.code].href}>{FIX_AT[f.code].label}</Link>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

export default async function AwardPage(props: PageProps<"/awards/[id]">) {
  const [{ id }, { tab }] = await Promise.all([props.params, props.searchParams as Promise<{ tab?: string }>]);
  const l = await loadAward(id);
  if (!l) notFound();
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
  const recommendedParty = evaluationGate?.facts.issued?.recommendedPartyId ?? null;
  // 6.15a fix S-3: each bidder's supplier standing beside its name; a barred one warns, the award is not refused.
  const carried = openingGate?.applies ? openingGate.carried.filter((p) => !recommendedParty || p.id === recommendedParty) : null;
  const carriedRegister = carried ? await partyRegister(carried.map((p) => p.id), org, formatDate) : new Map();
  const carriedParties = carried ? carried.map((p) => ({ value: p.id, label: `${p.name} (${p.registrationNo})${carriedRegister.get(p.id) ? ` — ${carriedRegister.get(p.id)!.standing.words.en} on the register` : ""}` })) : undefined;
  const recommendedText = evaluationGate?.facts.issued ? { valueText: formatMoney(evaluationGate.facts.issued.price) } : null;
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
  const headerNote =
    status === "DRAFT" && submitBlocks.length ? (
      <span>
        <span className="font-semibold text-ink-2">Send for approval:</span> not yet — see what stops it, below.
      </span>
    ) : status === "APPROVED" && !issueReady ? (
      <span>
        <span className="font-semibold text-ink-2">Issue:</span> not yet — {ev.issueFaults.length === 1 ? "one thing below is" : `${ev.issueFaults.length} things below are`} not in place.
      </span>
    ) : null;

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
    { id: "overview", label: "Overview", icon: <AwardIcon size={15} />, panel: <OverviewPanel l={l} ev={ev} awardee={awardee} recommendation={f.facts.exercise.evaluation?.facts.issued ?? null} methodName={methodName} typeName={typeName} policyLabel={policy.regulatedActivityLabel} validityDays={policy.indentValidityDays} expiredRule={!!f.config.indentExpiredRule} unitName={f.config.unitName} /> },
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
    { id: "return", label: "Return", icon: <ClipboardIcon size={15} />, panel: <ReturnPanel l={l} ret={ret} people={people} /> },
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
            <FaultList faults={submitBlocks} />
          </Callout>
        )}
        {status === "APPROVED" && ev.issueFaults.length > 0 && (
          <Callout tone="warn" title="Not ready to issue">
            <FaultList faults={ev.issueFaults} />
          </Callout>
        )}
        {ev.valueFaults.filter((x) => x.level === "warn").map((x, i) => (
          <Callout key={i} tone="warn">{awardFindingText(x)}</Callout>
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

/**
 * 64-C4 (6.4 Q-1 B): a term with what the frozen tender states beside it, and, where the
 * award states it otherwise, "differs from the tender Appendix" with the reason recorded
 * (or that none is, and issue waits for one). Without a frozen Appendix: the term alone.
 */
function AgainstTender({ ev, field, issued, children }: { ev: AwardEvaluation; field: BaselineField; issued: boolean; children: React.ReactNode }) {
  const said = ev.appendix ? tenderTermText(field, ev.appendix.baseline) : null;
  if (!ev.appendix || said == null) return <>{children}</>;
  const diff = ev.appendix.differences.find((d) => d.field === field);
  return (
    <span className="flex flex-col items-start gap-1">
      <span>{children}</span>
      <span className="text-[12.5px] break-words text-ink-3">{`${field === "regulated" ? "The tender answered" : "The tender Appendix states"}: ${said}`}</span>
      {diff && <Chip tone={diff.reason ? "info" : "warn"}>{DIFFERS_TEXT[field]}</Chip>}
      {diff && <span className="text-[12.5px] break-words text-ink-3">{diff.reason ? `Why: ${diff.reason}` : noReasonText(issued)}</span>}
    </span>
  );
}

/// 6.8 (E-9): a figure against the evaluation's recommendation: "differs from the recommendation", with the recommended figure and the reason.
function FromRecommendation({ differs, reason, recommended, children }: { differs: boolean; reason: string | null; recommended: string | null; children: React.ReactNode }) {
  if (!recommended || !differs) return <>{children}</>;
  return (
    <span className="flex flex-col items-start gap-1">
      <span className="flex flex-wrap items-center gap-2">{children}<Badge tone="warn">Differs from the recommendation</Badge></span>
      <span className="text-[12.5px] text-ink-3">Recommended: {recommended}. {reason ? `Why: ${reason}` : "No reason recorded yet."}</span>
    </span>
  );
}

/// The insurance the tender Appendix states: carried to the contract, not restated by the award.
/// 64-C4-b: the sum insured that governs a kind, with its source; the award's figure below the Appendix's shows both.
function GoverningSum({ g, reason, issued }: { g: Governing; reason: string | null; issued: boolean }) {
  if (g.state === "NOT_STATED") return notSet("Not stated by the award or a tender Appendix: not compared");
  if (g.state === "APPENDIX") return <span>{formatMoney(g.sen)} <span className="text-ink-3">· from the tender Appendix (the award states none)</span></span>;
  // BD-613-2 ruling: a figure other than the one the Appendix governs, above or below, is a difference: both figures, and its reason.
  const differs = g.appendix != null && g.sen !== g.appendix;
  return (
    <span className="flex flex-col items-start gap-1">
      <span>{formatMoney(g.sen)} <span className="text-ink-3">· the award&apos;s own figure, which governs</span></span>
      {differs && <Chip tone={reason ? "info" : "warn"}>{`Differs from the tender Appendix's ${formatMoney(g.appendix!)}${g.belowAppendix ? " (below it)" : " (above it)"}`}</Chip>}
      {differs && <span className="text-[12.5px] text-ink-3">{reason ? `Why: ${reason}` : noReasonText(issued)}</span>}
    </span>
  );
}

function tenderInsurance(b: NonNullable<AwardEvaluation["appendix"]>["baseline"]) {
  const m = (x: bigint | null) => (x == null ? notSet() : formatMoney(x));
  const u = b.insurance.worksUplift;
  return [
    { label: "Works insurance beyond the price, from the tender Appendix", value: u ? (u.kind === "PERCENT" ? `${formatMoney(u.sen)} (${formatPct(u.pct)} of the awarded sum)` : formatMoney(u.sen)) : notSet() },
    { label: "Third-party and workmen's compensation minimums, from the tender Appendix", value: <span>{m(b.insurance.tplMinimum)} · {m(b.insurance.wcMinimum)}</span> },
    { label: "Permitted insurance excess, from the tender Appendix", value: m(b.insurance.insuranceExcess) },
    ...(b.sectional ? [{ label: "Sections", value: "Each section's damages are the tender Appendix's, as frozen." }] : []),
  ];
}

function OverviewPanel({ l, ev, awardee, recommendation, methodName, typeName, policyLabel, validityDays, expiredRule, unitName }: { l: LoadedAward; ev: AwardEvaluation; awardee: AwardStanding | null; recommendation: { price: bigint; period: { value: number; unit: "DAYS" | "WEEKS" | "MONTHS" } | null } | null; methodName: string; typeName: string; policyLabel: string | null; validityDays: number | null; expiredRule: boolean; unitName: (code: string | null) => string | null }) {
  const { award, ex, req } = l;
  const kind = award.instrumentKind as InstrumentKind;
  const c = award.contract;
  const handover = c?.ownershipEvents[0] ?? null;
  const indent = ev.indent;
  // 6.8 (E-9): each figure that differs from the evaluation's recommendation says so, with its reason.
  const differs = recommendation ? recommendationDifferences({ value: senFromDecimal(award.awardedValue), period: { value: award.completionPeriod, unit: award.completionUnit as "DAYS" | "WEEKS" | "MONTHS" } }, recommendation) : [];
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader icon={<AwardIcon size={17} />} title="The award" subtitle={`${INSTRUMENT_LABEL[kind]}. The band, method and contract type are the exercise's, shown as it records them.`} />
        <CardBody>
          <KeyValues
            columns={2}
            items={[
              { label: "Exercise", value: <Link href={`/sourcing/${ex.id}`}>{`${ex.reference} · ${ex.title}`}</Link> },
              { label: "Requisition", value: <Link href={`/requisitions/${req.id}`}>{req.reference}</Link> },
              { label: "Method", value: methodName },
              { label: "Contract type", value: typeName },
              { label: "Band", value: ex.regime ? REGIME_LABEL[ex.regime as Regime] : notSet("Not determined") },
              ...(ex.onBoundary && ex.boundaryOperator ? [{ label: "At the boundary", value: boundarySentence(ex.boundaryOperator, ex.boundaryValue?.toString() ?? null, (ex.boundaryProvenance ?? "ASSUMED") as "ASSUMED") }] : []),
              { label: "Awardee", value: <span className="flex flex-col"><span>{award.awardeeName}</span><span className="text-[12.5px] text-ink-3">{award.awardeeRegistrationNo || "Registration number not recorded"}</span></span> },
              { label: "Address", value: award.awardeeAddress || notSet("Not recorded") },
              // 6.15a (OD-9): the link to the register, made by an explicit act on the supplier's record.
              { label: "On the supplier register", value: award.vendor ? <Link href={`/suppliers/${award.vendor.id}`}>{`${award.vendor.reference} · ${award.vendor.registeredName}`}</Link> : notSet(award.awardeePartyId ? "Not linked: link the awardee party from the supplier's record" : "Not linked: link the award from the supplier's record") },
              // 6.15a fix S-3: its standing, as the register derives it today; a barred supplier is warned of, not refused.
              ...(award.vendor ? [{ label: "Standing on the register", value: awardee ? <span className="flex flex-col items-start gap-1"><Badge tone={awardee.tone} dot>{awardee.words.en}</Badge>{awardee.warning && <span className="text-[12.5px] break-words text-amber-900">{awardee.warning.en}</span>}</span> : notSet("Not read: the organisation's time zone is not set") }] : []),
              { label: "Awarded value", value: <FromRecommendation differs={differs.includes("value")} reason={award.recValueDiffersReason} recommended={recommendation ? formatMoney(recommendation.price) : null}><span className="tabular-nums">{money(award.awardedValue)}</span></FromRecommendation> },
              { label: "Exercise's estimate", value: <span className="tabular-nums">{money(ex.estimatedValue)}</span> },
              { label: "Completion period", value: <FromRecommendation differs={differs.includes("period")} reason={award.recPeriodDiffersReason} recommended={recommendation?.period ? periodText(recommendation.period.value, recommendation.period.unit) : recommendation ? "No period stated" : null}>{periodText(award.completionPeriod, award.completionUnit)}</FromRecommendation> },
              { label: "Stated start date", value: award.startDate ? formatDate(award.startDate) : notSet() },
              { label: "Completion", value: ev.completion ? formatDate(ev.completion) : notSet("Not known until the start date is set") },
              { label: policyLabel ? `${policyLabel}?` : "The regulated activity?", value: <AgainstTender ev={ev} field="regulated" issued={award.issuedAt != null}>{award.regulatedActivity == null ? notSet("Not answered") : award.regulatedActivity ? "Yes" : "No"}</AgainstTender> },
            ]}
          />
        </CardBody>
      </Card>
      <Card>
        <CardHeader icon={<FileIcon size={17} />} title="Contract and commitment" subtitle="The contract number is given when the instrument is issued. The commitment number comes from the finance system and is typed in here." />
        <CardBody>
          <KeyValues
            columns={2}
            items={[
              {
                label: "Contract number",
                value: c ? (
                  <span className="flex flex-col items-start gap-1">
                    <span className="font-mono text-[13px]">{c.number}</span>
                    <Chip tone={c.status === "CANCELLED" ? "warn" : "ok"}>{CONTRACT_STATUS_LABEL[c.status]}</Chip>
                    {/* 6.12 S-1/S-5: the issue year from the organisation's day of issue, only for a series number. */}
                    {contractYearReading(c).seriesNumber && <span className="text-[12.5px] text-ink-3">{CONTRACT_YEAR_WORDS.series(contractYearReading(c).issueYear).en}</span>}
                    <Link href={`/projects/${c.id}`} className="text-[13px] font-semibold">Open the contract</Link>
                  </span>
                ) : "fault" in ev.contractNumber ? notSet(awardFindingText({ code: ev.contractNumber.fault, level: "block" })) : ev.contractNumber.source === "SERIES" ? "Drawn from its contract type's series on issue" : "The indent's own number, on issue",
              },
              { label: "Contract sum", value: c ? <span className="tabular-nums">{money(c.contractSum)}</span> : notSet("On issue") },
              {
                label: "Case handed over",
                value: handover ? `${formatDate(handover.on)}${handover.fromUnitCode || handover.toUnitCode ? ` · from ${unitName(handover.fromUnitCode) ?? "a section not set"} to ${unitName(handover.toUnitCode) ?? "a section not set"}` : " · sections not set"}` : notSet("On issue"),
              },
              {
                label: "Commitment number",
                value: award.erpCommitmentNo ? (
                  <span className="flex flex-col">
                    <span className="font-mono text-[13px]">{award.erpCommitmentNo}</span>
                    <span className="text-[12.5px] text-ink-3">{`${award.erpCommitmentKind ? `The ${COMMITMENT_KIND_LABEL[award.erpCommitmentKind].toLowerCase()}'s` : "The finance system's"} · typed in by an officer${ev.indentFormatOk === null ? " · no format set, so not checked" : ""}`}</span>
                  </span>
                ) : (
                  notSet("Not recorded")
                ),
              },
              ...(kind === "WORK_INDENT"
                ? [
                    {
                      label: "Indent validity",
                      value: !indent || indent.state === "NOT_RECEIVED" ? notSet("Runs from the indent's receipt") : indent.state === "NOT_SET" ? notSet("Validity not set") : award.commencedOn && day(award.commencedOn)! <= indent.expiresOn ? (
                        `Used — work commenced ${formatDate(award.commencedOn)}, before it expired on ${formatDate(indent.expiresOn)}`
                      ) : (
                        <span className="flex flex-col items-start gap-1">
                          <span>{`${indent.state === "EXPIRED" ? "Expired" : "Valid"} · expires ${formatDate(indent.expiresOn)} (${validityDays} days from receipt)`}</span>
                          <span className="text-[12.5px] text-ink-3">{INDENT_READING}{indent.state === "EXPIRED" && !expiredRule ? " No notification rule names who is told." : ""}</span>
                        </span>
                      ),
                    },
                    {
                      label: "Commencement",
                      value: !ev.commencement ? notSet() : ev.commencement.state === "COMMENCED" ? `Commenced ${formatDate(ev.commencement.on)}` : ev.commencement.state === "NO_START_DATE" ? notSet("No start date") : ev.commencement.state === "NOT_SET" ? notSet("Grace period not set") : ev.commencement.state === "LATE" ? <Chip tone="err">{`Not commenced by ${formatDate(ev.commencement.deadline)}`}</Chip> : `Due to start by ${formatDate(ev.commencement.deadline)}`,
                    },
                  ]
                : []),
            ]}
          />
        </CardBody>
      </Card>
      <Card>
        <CardHeader
          icon={<SlidersIcon size={17} />}
          title="The letter's terms"
          subtitle={ev.appendix ? `Opened from the tender Appendix (documents version ${ev.appendix.baseline.packVersion}). A term stated otherwise needs a reason.` : "Per award, with where they came from. Never defaulted."}
          actions={award.termsProvenance ? <ProvenanceBadge value={award.termsProvenance} /> : undefined}
        />
        <CardBody>
          {award.termCorrections.length > 0 && (
            <Callout tone="info" title="Recorded terms corrected after issue" className="mb-4">
              {`${award.termCorrections.map((x) => `${AWARD_TERM_WORDS[x.term as AwardTerm].en} corrected from ${x.beforeText} to ${x.afterText} on ${formatDate(x.recordedOn)} (${x.reason})`).join("; ")}. Each was recorded wrongly from the signed letter and corrected on the contract's Baseline tab, which wrote a new baseline version; the issued letter is unchanged and shows the terms as issued.`}
            </Callout>
          )}
          <KeyValues
            columns={2}
            items={[
              { label: "Liquidated damages", value: <AgainstTender ev={ev} field="lad" issued={award.issuedAt != null}>{award.ladAmount ? `${money(award.ladAmount)}${award.ladUnit ? ` ${award.ladUnit}` : ""}` : notSet()}</AgainstTender> },
              { label: "Workmen's compensation", value: award.wcBasis ? WC_BASIS_LABEL[award.wcBasis] : notSet("How it is calculated is not set — set it in Edit terms") },
              { label: "Retention", value: award.retentionPercent ? `${pct(award.retentionPercent)}${award.retentionCapPercent ? `, limited to ${pct(award.retentionCapPercent)} of the sum` : ""}` : ev.terms?.retentionAsked === false ? "Not asked by its terms band" : notSet() },
              { label: "Defects liability period", value: <AgainstTender ev={ev} field="dlp" issued={award.issuedAt != null}>{award.dlpMonths != null ? (award.dlpMonths === 0 && ev.appendix ? "None" : periodText(award.dlpMonths, "MONTHS")) : ev.terms?.dlpAsked === false ? "Not asked by its terms band" : notSet()}</AgainstTender> },
              { label: "Terms band", value: ex.termsBandKey ? (l.ex.bandSnapshot as { terms?: { label?: string } } | null)?.terms?.label ?? "As recorded on the exercise" : ex.termsState === "NONE_IN_REGIME" ? "Not applicable in this band" : notSet() },
              { label: "Appointment-letter variant", value: kind === "LETTER_OF_ACCEPTANCE" ? "Not applicable" : award.variantName ?? (ev.variant?.state === "SELECTED" ? ev.variant.variant.nameEn : notSet(ev.variant ? awardFindingText({ code: ev.variant.state === "NONE" ? "VARIANT_NONE" : ev.variant.state === "AMBIGUOUS" ? "VARIANT_AMBIGUOUS" : "TERMS_NOT_SET", level: "block" }) : NOT_SET)) },
              { label: "If work does not commence", value: kind === "LETTER_OF_ACCEPTANCE" ? "Not applicable" : ev.consequence ? NON_COMMENCEMENT_LABEL[ev.consequence] : notSet() },
              ...INSURED_KINDS.map((k) => ({ label: `${INSURANCE_KIND_LABEL[k]}, sum insured`, value: <GoverningSum g={governingSum(k, awardSumsOf(award)[k], ev.appendix?.baseline ?? null)} reason={{ WORKS: award.worksInsuredDiffersReason, PUBLIC_LIABILITY: award.liabilityInsuredDiffersReason, WORKMENS_COMPENSATION: award.wcInsuredDiffersReason }[k]} issued={award.issuedAt != null} /> })),
              ...(ev.appendix ? tenderInsurance(ev.appendix.baseline) : []),
            ]}
          />
        </CardBody>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ approval

function ApprovalPanel({
  l,
  ev,
  awardee,
  suggestions,
  today,
  matters,
  sittings,
  roleName,
}: {
  l: LoadedAward;
  ev: AwardEvaluation;
  awardee: AwardStanding | null;
  suggestions: (c: string | null) => { value: string; label: string }[];
  today: string | null;
  matters: Awaited<ReturnType<typeof exerciseMatters>>;
  sittings: { id: string; reference: string; meetingDate: Date; committee: { code: string } }[];
  roleName: (code: string) => string;
}) {
  const { award, ex } = l;
  const status = award.status as AwardStatus;
  const inst = latestRoute(award);
  const earlier = award.approvalInstances.filter((i) => i.id !== inst?.id);
  const cited = new Set(award.approvalInstances.flatMap((i) => i.steps.map((s) => s.committeeDecisionId)).filter(Boolean));
  const sig = ev.signatory;
  const cb = ev.committee;
  const ab = ev.approver;
  const OUTCOME = { PENDING: "not decided yet", CARRIED: "carried", DEFERRED: "deferred", NOT_CARRIED: "not carried" } as const;
  // BD-2: the offices the route treated as absent, named from its own warnings.
  const absent = absentFrom((inst ? (inst.warnings as { code?: string; from?: string }[]) : ev.route?.ok ? ev.route.warnings : null) ?? []);
  const absentLine = absent.length > 0 && (
    <p className="text-[13px] break-words text-ink-2">
      <span className="font-semibold">Treated as absent{inst ? " when it was sent" : " today"}:</span> {absent.map(roleName).join(", ")}. Nobody holding the office, nor a delegate of it, was available, so its authority went upward.
    </p>
  );
  const amountText = (a: { toString(): string } | null) => (a == null ? "the decision states no amount" : `at ${money(a)}`);
  const lastCommitteeStep = inst ? [...inst.steps].reverse().find((s) => s.committeeCode) : undefined;
  return (
    <div className="flex flex-col gap-6">
      {!inst ? (
        <Card>
          <CardHeader icon={<RouteIcon size={17} />} title="Who approves the appointment" subtitle={status === "CANCELLED" ? "No route was resolved." : "Resolved when the award is sent for approval, for the awarded value, under the approval matrix then in force."} />
          <CardBody className="flex flex-col gap-3">
            {status === "CANCELLED" ? (
              <p className="text-[13.5px] text-ink-2">Cancelled before it was sent for approval — no route was resolved, and nobody was asked to approve it.</p>
            ) : ev.route?.ok ? (
              <>
                <p className="text-[13.5px] text-ink-2">If it were sent today, it would go:</p>
                <ol className="flex flex-col gap-1.5">
                  {ev.route.chain.map((s, i) => (
                    <li key={i} className="flex min-w-0 items-center gap-2 text-[13.5px]">
                      <ActBadge act={s.act} step={i + 1} />
                      <span className="min-w-0 font-semibold break-words text-ink">{roleName(s.roleCode)}</span>
                      <span className="text-ink-3">{actLabel(s.act)}{s.committeeCode ? ", as a committee decision" : ""}</span>
                    </li>
                  ))}
                </ol>
                <p className="text-[12.5px] break-words text-ink-3">{`${ev.route.ruleLabel}${ev.route.clause ? ` · ${ev.route.clause}` : ""}`}</p>
                {absentLine}
                {ev.route.warnings.map((w, i) => (
                  <Callout key={i} tone={tone(w.level)}>{w.messageEn}</Callout>
                ))}
              </>
            ) : ev.route ? (
              <Callout tone="warn">{awardFindingText({ code: ev.route.fault, level: "block", data: { messages: ev.route.messages.join(" ") || null } })}</Callout>
            ) : (
              <Callout tone="warn">{awardFindingText({ code: "NO_ISSUE_IN_FORCE", level: "block" })}</Callout>
            )}
          </CardBody>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <CardHeader
            icon={<RouteIcon size={17} />}
            title="Approval of the appointment"
            subtitle={`Sent ${formatDate(inst.openedAt)} under ${inst.matrixLabel ?? "an issue no longer on file"}: ${inst.ruleLabel ?? "a rule no longer on file"} · ${inst.ruleClause || "clause not recorded"}.`}
            actions={<Badge tone={routeTone(inst.status)}>{inst.status === "APPROVED" ? "Approved" : inst.status === "PENDING" ? "In progress" : inst.status === "REJECTED" ? "Refused" : "Withdrawn"}</Badge>}
          />
          {(absentLine || ((inst.warnings as { level: string; messageEn: string }[]) ?? []).length > 0) && (
            <CardBody className="flex flex-col gap-2">
              {absentLine}
              {((inst.warnings as { level: string; messageEn: string }[]) ?? []).map((w, i) => (
                <Callout key={i} tone={tone(w.level)}>{w.messageEn}</Callout>
              ))}
            </CardBody>
          )}
          {inst.status === "PENDING" && awardee?.warning && (
            <div className="border-t border-line px-5 py-3 sm:px-6">
              <Callout tone="warn" title="Before a step is decided: the awardee's supplier is barred on the register">{awardee.warning.en}</Callout>
            </div>
          )}
          {inst.status === "PENDING" && (
            <p className="border-t border-line px-5 py-2.5 text-[12.5px] text-ink-3 sm:px-6">
              Steps are decided in order. A committee&apos;s step is discharged by citing its decision on this exercise.{" "}
              {ifRejectedText({ snapshotAt: inst.rejectionSnapshotAt, kind: inst.rejectionKind as RejectionKind | null, returnToOffice: inst.rejectionReturnToRoleCode ? roleName(inst.rejectionReturnToRoleCode) : null, provenance: inst.rejectionProvenance }, false, returnTargetBeforeNext(inst))}
              {inst.supersedesInstanceId ? " This route continues a refused one from an earlier step; the steps before it keep their decisions." : ""}
            </p>
          )}
          {inst.status === "REJECTED" && (() => {
            const rejecting = inst.steps.find((x) => x.decision === "REJECTED");
            if (inst.rejectionApplied && inst.rejectionSource) {
              return (
                <div className="border-t border-line px-5 py-3 sm:px-6">
                  <Callout tone="warn" title="Where the refusal sent it">
                    {appliedText(inst.rejectionApplied as RejectionKind, inst.rejectionSource, inst.rejectionReturnToRoleCode ? roleName(inst.rejectionReturnToRoleCode) : null, inst.rejectionChosenBy?.name ?? null)}
                  </Callout>
                </div>
              );
            }
            if (inst.rejectionChoices.length > 0 && rejecting && status === "PENDING_APPROVAL") {
              return (
                <div className="border-t border-line px-5 py-3 sm:px-6">
                  <Callout
                    tone="warn"
                    title="Where the refused appointment goes next is the officer's choice"
                    action={
                      <AwardChoiceDrawer
                        id={award.id}
                        kinds={(inst.rejectionChoices as RejectionKind[]).map((k) => ({ value: k, label: REJECTION_KIND_LABEL[k] }))}
                        steps={earlierSteps(inst.steps, rejecting.sequence).map((x) => ({ value: String(x.sequence), label: `${x.sequence}. ${x.roleLabel} · ${actLabel(x.act)}` }))}
                        people={suggestions(null)}
                      />
                    }
                  >
                    {CHOICE_WHY_TEXT[(inst.rejectionChoiceWhy as keyof typeof CHOICE_WHY_TEXT | null) ?? "NOT_SET"]} The award stays pending approval until the choice is recorded, or it is cancelled.
                  </Callout>
                </div>
              );
            }
            return null;
          })()}
          {inst.checkedAgainstMatrix && (
            <p className="border-t border-line px-5 py-2.5 text-[12.5px] break-words text-ink-3 sm:px-6">
              Chain beneath the approver: {routeCoreText(inst, (c) => { const n = roleName(c); return { en: n, ms: n }; }).en}
            </p>
          )}
          <ol className="divide-y divide-line/70 border-t border-line">
            {inst.steps.map((s, stepIndex) => {
              const earlierDone = inst.steps.filter((x) => x.sequence < s.sequence).every((x) => x.decision === "DONE");
              const citedRecord = s.committeeDecision ? matterRecord(s.committeeDecision) : null;
              const open = inst.status === "PENDING" && s.decision === "PENDING" && earlierDone;
              const mine = matters.filter((m) => m.meeting.committee.code === s.committeeCode && !cited.has(m.id));
              const offered = mine.map((m) => ({
                value: m.id,
                label: `${m.meeting.reference} · ${m.subject} · ${OUTCOME[m.outcome]}${m.outcome === "PENDING" ? " — cannot be cited until decided" : ""}`,
                disabled: m.outcome === "PENDING",
              }));
              // Nothing tabled that could still discharge the step: offer to table it, filled in.
              const needsTabling = !mine.some((m) => m.outcome === "PENDING" || m.outcome === "CARRIED" || m.outcome === "DEFERRED");
              const sitting = sittings.find((x) => x.committee.code === s.committeeCode);
              const tableHref = sitting
                ? `/committees/${sitting.id}?${tablingQuery({ subject: `Appointment of ${award.awardeeName} for ${ex.title}`, domain: APPOINTMENT_DOMAIN, act: s.act, matterKind: "EXERCISE", matterRef: ex.reference, source: { kind: "award", id: award.id } })}`
                : null;
              return (
                <li key={s.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
                  <div className="flex min-w-0 items-start gap-3">
                    <ActBadge act={s.act} step={stepIndex + 1} />
                    <div className="min-w-0">
                      <div className="font-semibold break-words text-ink">
                        {s.roleLabel} <span className="font-normal text-ink-3">· {actLabel(s.act)}{s.committeeCode ? ", as a committee decision" : ""}</span>
                      </div>
                      {stepOriginText(inst, s) && <div className="text-[12.5px] text-ink-3">{stepOriginText(inst, s)}</div>}
                      {s.escalation && (
                        <div className="text-[12.5px] break-words text-amber-800">
                          {escalationText({ roleLabel: s.roleLabel, actingRoleLabel: s.actingRoleLabel, escalation: s.escalation, escalationReason: s.escalationReason, declaredByName: s.declaredBy?.name ?? null })}
                        </div>
                      )}
                      <div className="text-[12.5px] break-words text-ink-2">
                        {s.decision === "PENDING"
                          ? inst.status === "PENDING"
                            ? `${earlierDone ? "Awaiting a decision." : "Waits for the step before."}${s.nonDelegable ? " Cannot be delegated." : ""}`
                            : "Not decided: the route closed."
                          : s.carriedFromStepId
                            ? `${DECISION_LABEL[s.decision]} · ${s.decidedByName ?? "Not recorded"} · ${formatDate(s.decidedOn)} · decided on the earlier route and carried onto this one`
                            : s.committeeCode && citedRecord?.record
                            ? `${DECISION_LABEL[s.decision]} · ${citedRecord.record.committee} at ${citedRecord.record.meetingReference}, ${formatDate(citedRecord.record.decisionDate ?? citedRecord.record.meetingDate)} · ${amountText(s.committeeDecision?.amount ?? null)} · ${citedRecord.minuted ? "minuted" : "not yet minuted"}`
                            : `${DECISION_LABEL[s.decision]} · ${s.decidedByName ?? "Not recorded"} · recorded on behalf of, not signed · ${formatDate(s.decidedOn)} · received ${s.receivedOn ? formatDate(s.receivedOn) : "not recorded"}${s.delegation ? ` · under delegation from ${s.delegation.fromPerson.name}` : ""}${s.reason ? ` · “${s.reason}”` : ""}`}
                      </div>
                      {open && s.committeeCode && needsTabling && (
                        <div className="mt-1 text-[12.5px] break-words text-ink-3">
                          {sitting ? `Not tabled yet. The ${s.roleLabel}'s next open sitting is ${sitting.reference}, ${formatDate(sitting.meetingDate)}.` : `Not tabled yet, and no sitting of the ${s.roleLabel} is scheduled.`}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                    {s.decision !== "PENDING" && <Badge tone={stepTone(s.decision)}>{DECISION_LABEL[s.decision]}</Badge>}
                    {open && s.committeeCode && needsTabling && (tableHref ? <ButtonLink href={tableHref} size="sm" variant="secondary">Table at a sitting</ButtonLink> : <ButtonLink href="/committees" size="sm" variant="secondary">Schedule a sitting</ButtonLink>)}
                    {inst.status === "PENDING" && s.decision === "PENDING" && !s.committeeCode && s.roleCode && (
                      <EscalateDrawer stepId={s.id} office={s.actingRoleLabel ?? s.roleLabel} mandatory={isMandatoryAct(s.act)} people={suggestions(s.actingRoleCode ?? s.roleCode)} />
                    )}
                    {open && (s.committeeCode ? (
                      <CiteDecisionDrawer id={award.id} stepId={s.id} committee={s.roleLabel} matters={offered} />
                    ) : (
                      <DecideStepDrawer id={award.id} stepId={s.id} roleLabel={s.roleLabel} act={ACT_LABEL[s.act] ?? "Acts"} done={ACT_DONE_LABEL[s.act] ?? "Done"} people={suggestions(s.actingRoleCode ?? s.roleCode)} today={today} />
                    ))}
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>
      )}

      <Card>
        <CardHeader icon={<ClipboardIcon size={17} />} title="Routing sheet" subtitle="The committee's part and the approver's, taken from the committee's decision and the route as recorded. They are fixed into the covering memo when it is issued." />
        <CardBody className="grid gap-5 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <p className="text-[12px] font-semibold text-ink-3">Committee</p>
            {cb?.state === "DECIDED" ? (
              <KeyValues
                items={[
                  { label: "Committee", value: cb.committee },
                  { label: "Sitting", value: `${cb.meetingReference}, ${formatDate(cb.meetingDate)}` },
                  { label: "Outcome", value: cb.outcome === "CARRIED" ? "Carried" : cb.outcome === "DEFERRED" ? "Deferred" : "Not carried" },
                  { label: "Amount", value: lastCommitteeStep?.committeeDecision ? (lastCommitteeStep.committeeDecision.amount == null ? "The decision states no amount" : money(lastCommitteeStep.committeeDecision.amount)) : notSet("Not recorded") },
                  { label: "Decided on", value: cb.decisionDate ? formatDate(cb.decisionDate) : notSet("Not recorded") },
                  { label: "Minutes", value: cb.minuted ? "Minuted" : "Not yet minuted — the decision stands on the record" },
                ]}
              />
            ) : (
              <p className="text-[13.5px] text-ink-3">{cb ? "Not decided yet." : status === "CANCELLED" && !inst ? "No route, so no committee." : "The route has no committee step."}</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-[12px] font-semibold text-ink-3">Approver</p>
            {ab ? (
              <KeyValues
                items={[
                  { label: "Office", value: ab.roleLabel },
                  { label: "Received on", value: ab.receivedOn ? formatDate(ab.receivedOn) : notSet("Not recorded") },
                  { label: "Approved by", value: ab.approverName ? `${ab.approverName} · recorded on behalf of, not signed` : notSet("Not decided yet") },
                  { label: "Approved on", value: ab.decidedOn ? formatDate(ab.decidedOn) : notSet("Not decided yet") },
                ]}
              />
            ) : (
              <p className="text-[13.5px] text-ink-3">{inst ? "The route's approval is a committee's." : status === "CANCELLED" ? "No route, so no approver." : "Resolved when the award is sent for approval."}</p>
            )}
          </div>
        </CardBody>
      </Card>

      {status !== "CANCELLED" || award.signatoryName ? (
        <Card>
          <CardHeader icon={<FileIcon size={17} />} title="Who signs the instrument" subtitle="Set by the signatory rules on the approval matrix for this instrument and value. If no rule fits, two rules fit, or the rule is a known gap, nobody may sign until the matrix is corrected." />
          <CardBody>
            {award.signatoryName ? (
              <KeyValues
                columns={2}
                items={[
                  { label: "Signed by", value: `${award.signatoryName} · recorded on behalf of, not signed` },
                  { label: "Office", value: award.signatoryRoleLabel ?? "Not recorded" },
                  { label: "Signed on", value: formatDate(award.signedOn) },
                  { label: "Rule", value: award.signatoryRuleLabel ?? "Not recorded" },
                ]}
              />
            ) : sig?.ok ? (
              <KeyValues
                columns={2}
                items={[
                  { label: "To be signed by", value: `The ${sig.roleLabel}` },
                  { label: "Rule", value: `${sig.ruleLabel}${sig.clause ? ` · ${sig.clause}` : ""}` },
                  { label: "Recommended by", value: sig.recommenders.length ? sig.recommenders.map((r) => r.roleLabel).join(", ") : "No recommendation in the rule" },
                  { label: "Delegation", value: sig.delegable ? "A delegate of the office may sign" : "Only a holder of the office may sign" },
                ]}
              />
            ) : (
              <Callout tone="warn">
                {awardFindingText({ code: sig?.ok === false ? sig.fault : "NO_ISSUE_IN_FORCE", level: "block" })} <Link href="/configuration/approval-matrix">Approval matrix</Link>
              </Callout>
            )}
          </CardBody>
        </Card>
      ) : null}

      {earlier.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader icon={<ClockIcon size={17} />} title="Earlier routes" subtitle="Kept on record." />
          <ul className="divide-y divide-line/70">
            {earlier.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2 px-5 py-3 text-[13px] sm:px-6">
                <Badge tone={routeTone(e.status)}>{e.status === "REJECTED" ? "Refused" : e.status === "RECALLED" ? "Withdrawn" : e.status === "APPROVED" ? "Approved" : "In progress"}</Badge>
                <span className="min-w-0 break-words text-ink-2">
                  Sent {formatDate(e.openedAt)} · {e.steps.map((s) => s.roleLabel).join(" → ")}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- instrument

function InstrumentPanel({ l, ev }: { l: LoadedAward; ev: AwardEvaluation }) {
  const { award } = l;
  const issued = award.documents.length > 0;
  return (
    <div className="flex flex-col gap-6">
      <Callout tone="info" title={issued ? "As issued" : "Generated when issued"}>
        {issued
          ? "Each document is printed from the text frozen when it was issued, never from today's template. It is the portal's text of the instrument, not the controlled printed form: print it, have it signed on paper, and record what comes back."
          : "The documents are generated from the configured templates and frozen when the instrument is issued. Until then a preview shows how they read today, marked as a draft."}
      </Callout>
      <Card className="overflow-hidden">
        <CardHeader icon={<FileIcon size={17} />} title="Documents" subtitle={INSTRUMENT_LABEL[award.instrumentKind as InstrumentKind]} />
        <ul className="divide-y divide-line/70">
          {issued
            ? award.documents.map((d) => (
                <li key={d.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                  <div className="min-w-0">
                    <div className="font-semibold break-words text-ink">{DOCUMENT_LABEL[d.kind]}</div>
                    <div className="text-[12.5px] break-words text-ink-3">{`${d.templateName}${d.templateFormCode ? ` · form ${d.templateFormCode}` : ""}${d.templateRevisionDate ? `, revised ${formatDate(d.templateRevisionDate)}` : ""} · text version ${d.templateBodyVersion} · ${LANGUAGE_LABEL[d.language]} · frozen ${formatOrgDay(d.frozenAt, l.org.timeZone)}`}</div>
                  </div>
                  <ButtonLink href={`/awards/${award.id}/print/${DOCUMENT_SLUG[d.kind]}`} variant="secondary" size="sm" icon={<PrinterIcon size={15} />}>
                    Print
                  </ButtonLink>
                </li>
              ))
            : ev.documents.map((d) => (
                <li key={d.kind} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
                  <div className="min-w-0">
                    <div className="font-semibold break-words text-ink">{DOCUMENT_LABEL[d.kind]}</div>
                    <div className="text-[12.5px] break-words text-ink-3">
                      {d.state === "TEMPLATE_NOT_SET"
                        ? "No template is set for it."
                        : d.state === "NO_TEXT"
                          ? `“${d.templateName}” has no text configured.`
                          : d.state === "NO_LANGUAGE"
                            ? `“${d.templateName}” has text in both languages and no language set to issue first.`
                            : `${d.templateName} · ${LANGUAGE_LABEL[d.language!]}${d.missing.length ? ` · not yet recorded: ${d.missing.map((k) => mergeFieldLabel(k).toLowerCase()).join(", ")}` : " · every field it names is filled"}`}
                    </div>
                  </div>
                  {d.state === "OK" && (
                    <ButtonLink href={`/awards/${award.id}/print/${DOCUMENT_SLUG[d.kind]}`} variant="secondary" size="sm" icon={<PrinterIcon size={15} />}>
                      Preview
                    </ButtonLink>
                  )}
                </li>
              ))}
        </ul>
      </Card>
    </div>
  );
}

// -------------------------------------------------------------- distribution

function DistributionPanel({ l, ev }: { l: LoadedAward; ev: AwardEvaluation }) {
  const { award } = l;
  const rows = award.distributions;
  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader icon={<InboxIcon size={17} />} title="Distribution" subtitle="Drawn from the configured recipients when the instrument is issued, with the awardee's own copy." />
        <CardBody>
          {"rows" in ev.distribution ? (
            <ul className="flex list-disc flex-col gap-1 pl-5 text-[13.5px] text-ink-2">
              {ev.distribution.rows.map((r) => (
                <li key={r.recipientName}>{r.isAwardee ? `${r.recipientName} (the awardee)` : r.recipientName}</li>
              ))}
            </ul>
          ) : (
            <Callout tone="warn">
              {awardFindingText({ code: ev.distribution.fault, level: "block" })} {FIX_AT[ev.distribution.fault] && <Link href={FIX_AT[ev.distribution.fault].href}>{FIX_AT[ev.distribution.fault].label}</Link>}
            </Callout>
          )}
        </CardBody>
      </Card>
    );
  }
  const done = distributionComplete(rows);
  const open = award.status === "ISSUED" || award.status === "ACCEPTED";
  return (
    <Card className="overflow-hidden">
      <CardHeader icon={<InboxIcon size={17} />} title="Distribution" subtitle={done.complete ? "Every mandatory copy has gone." : `${done.sent} of ${done.total} sent · ${done.outstanding} mandatory still to go. Nothing is sent from the portal: each copy's despatch is recorded here.`} actions={<Badge tone={done.complete ? "ok" : "warn"}>{done.complete ? "Complete" : "Outstanding"}</Badge>} />
      <ul className="divide-y divide-line/70">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-col gap-2 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="min-w-0">
              <div className="font-semibold break-words text-ink">
                {r.recipientName} {r.isAwardee && <span className="font-normal text-ink-3">· the awardee</span>} {!r.mandatory && <span className="font-normal text-ink-3">· optional</span>}
              </div>
              <div className="text-[12.5px] break-words text-ink-3">
                {r.despatchedOn
                  ? `${r.method ? DELIVERY_LABEL[r.method] : "Sent"} ${formatDate(r.despatchedOn)}${r.consignmentRef ? ` · ${r.consignmentRef}` : ""} · ${r.acknowledgedOn ? `acknowledged ${formatDate(r.acknowledgedOn)}` : "not acknowledged"}`
                  : "Not sent"}
              </div>
            </div>
            {open && <DespatchDrawer id={award.id} row={{ id: r.id, name: r.recipientName, values: { method: r.method, consignmentRef: r.consignmentRef, despatchedOn: day(r.despatchedOn), acknowledgedOn: day(r.acknowledgedOn), note: r.note } }} />}
          </li>
        ))}
      </ul>
    </Card>
  );
}

// -------------------------------------------------------------------- return

function ReturnPanel({ l, ret, people }: { l: LoadedAward; ret: ReturnRecord | null; people: { value: string; label: string }[] }) {
  const { award } = l;
  // OD-5: the return counts with its scans, except for an award accepted before they were required.
  const scansAreRequired = scansRequired(award.status, award.returnScanSnapshot != null);
  return (
    <div className="flex flex-col gap-6">
      <ReturnRecordCard l={l} ret={ret} people={people} />
      <OwnerAttachments
        owner={{ kind: "award", id: award.id }}
        title="Scans of what came back"
        subtitle="Each returned item counts toward the return, and toward acceptance, only with its signed scan attached."
        required={Object.fromEntries(RETURN_SCANS[award.instrumentKind as InstrumentKind].map((p) => [p, scansAreRequired]))}
        labels={RETURN_SLOT_LABEL}
        statuses={ret && award.awardReturn ? Object.fromEntries(scansAwaitingPaper(award.instrumentKind as InstrumentKind, ret).map((p) => [p, { text: WAITING_FOR_PAPER, tone: "neutral" as const }])) : undefined}
      />
    </div>
  );
}

function ReturnRecordCard({ l, ret, people }: { l: LoadedAward; ret: ReturnRecord | null; people: { value: string; label: string }[] }) {
  const { award } = l;
  const loa = award.instrumentKind === "LETTER_OF_ACCEPTANCE";
  if (!ret || !award.awardReturn) {
    return (
      <Card>
        <EmptyState title="Nothing to return yet">
          {loa ? "Once the Letter of Acceptance is issued, the awardee returns it signed with the successful bidder's declaration and a letter of authorisation." : "Once the appointment letter is issued, the contractor returns its acceptance page complete."}
        </EmptyState>
      </Card>
    );
  }
  const r = award.awardReturn;
  const state = returnState(ret);
  const kind = award.instrumentKind as InstrumentKind;
  const scans = { required: scansRequired(award.status, award.returnScanSnapshot != null), attached: new Set(award.attachments.filter((a) => isLive(a)).map((a) => a.purpose as string)) };
  const scanLine = returnScansText({ required: scans.required, missing: scansMissing(kind, ret, scans.attached), attached: award.attachments.filter((a) => (RETURN_SCANS[kind] as readonly string[]).includes(a.purpose) && isLive(a)).length });
  const page = acceptancePageFaults(ret);
  const tri = (v: boolean | null) => (v == null ? notSet("Not recorded") : v ? "Yes" : "No — recorded as not done");
  return (
    <Card>
      <CardHeader
        icon={<ClipboardIcon size={17} />}
        title={loa ? "What came back (integrity pact, second stage)" : "The acceptance page"}
        subtitle={loa ? (state.complete ? "All three documents are back." : `Still to come: ${state.missing.map((m) => RETURN_ITEM_LABEL[m]).join(", ")}.`) : page.length === 0 ? "Every field is recorded." : `Still to record: ${page.map((x) => ACCEPTANCE_FAULT_LABEL[x]).join(", ")}.`}
        actions={award.status === "ISSUED" || award.status === "ACCEPTED" ? <ReturnDrawer id={award.id} loa={loa} people={people} correcting={award.status === "ACCEPTED"} values={{ ...ret, contractorSigned: yesNo(ret.contractorSigned), stampAffixed: yesNo(ret.stampAffixed), witnessSigned: yesNo(ret.witnessSigned), receivedByPersonId: r.receivedByPersonId, whereHeld: r.whereHeld }} /> : undefined}
      />
      <CardBody className="flex flex-col gap-5">
        {loa ? (
          <KeyValues
            columns={3}
            items={[
              { label: "Signed letter", value: ret.signedLetterReceivedOn ? `Received ${formatDate(ret.signedLetterReceivedOn)}` : notSet("Not received") },
              { label: "Successful bidder's declaration", value: ret.declarationReceivedOn ? `Received ${formatDate(ret.declarationReceivedOn)}` : notSet("Not received") },
              { label: "Letter of authorisation", value: ret.authorisationReceivedOn ? `Received ${formatDate(ret.authorisationReceivedOn)}` : notSet("Not received") },
            ]}
          />
        ) : (
          <>
            <Callout tone="info">The identity card number is shown in full here only; everywhere else it is masked. Masking is not access control: who may see the number is enforced once sign-in exists.</Callout>
            <KeyValues
              columns={2}
              items={[
                { label: "Acceptance page received", value: ret.signedLetterReceivedOn ? `Received ${formatDate(ret.signedLetterReceivedOn)}` : notSet("Not received") },
                { label: "Contractor's signatory", value: ret.signatoryName || notSet("Not recorded") },
                { label: "Identity card number", value: ret.icNumber ? <span className="font-mono text-[13px]">{ret.icNumber}</span> : notSet("Not recorded") },
                { label: "Occupation", value: ret.occupation || notSet("Not recorded") },
                { label: "Address", value: ret.address || notSet("Not recorded") },
                { label: "Signed in the capacity of", value: ret.capacity || notSet("Not recorded") },
                { label: "Contractor signed", value: tri(ret.contractorSigned) },
                { label: "Company stamp affixed", value: tri(ret.stampAffixed) },
                { label: "Witness", value: ret.witnessName || notSet("Not recorded") },
                { label: "Witness signed", value: tri(ret.witnessSigned) },
              ]}
            />
          </>
        )}
        <KeyValues
          columns={2}
          className="border-t border-line pt-5"
          items={[
            { label: "Received by", value: r.receivedBy ? `${r.receivedBy.name} · recorded on behalf of, not signed` : notSet("Not recorded") },
            { label: "Originals held at", value: r.whereHeld || notSet("Not recorded") },
          ]}
        />
        <Callout tone={scanLine.tone}>
          <span className="font-semibold">Scans. </span>
          {scanLine.text}
        </Callout>
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------- conditions

function ConditionsPanel({ l, gate, kinds, today }: { l: LoadedAward; gate: ReturnType<typeof readinessGate>; kinds: { value: string; label: string }[]; today: string | null }) {
  const { award } = l;
  const open = award.status !== "CANCELLED";
  return (
    <div className="flex flex-col gap-6">
      <Card className="overflow-hidden">
        <CardHeader icon={<ShieldIcon size={17} />} title="Conditions precedent to signing" subtitle="All three, cumulatively, before the contract may be signed. Preparation continues while the gate is red; the signatures are recorded on the contract." actions={<Badge tone={gate.ready ? "ok" : "warn"}>{gate.ready ? "Ready" : "Not ready"}</Badge>} />
        <ReadinessGateList items={gate.items} bondNotRequiredReason={award.bondNotRequiredReason} />
      </Card>
      <Card className="overflow-hidden">
        <CardHeader icon={<CheckIcon size={17} />} title="Before work starts" subtitle="The customer's conditions precedent, each with the day it is needed by. A delay in one marked so gives no extension of time." actions={open ? <AddConditionDrawer id={award.id} kinds={kinds} /> : undefined} divided={award.conditions.length > 0} />
        {award.conditions.length === 0 ? (
          <EmptyState size="sm" title="None recorded">Add the conditions that apply to this award.</EmptyState>
        ) : (
          <ul className="divide-y divide-line/70">
            {award.conditions.map((c) => (
              <li key={c.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-semibold break-words text-ink">{c.kindName}</span>
                  <span className="block text-[12.5px] break-words text-ink-3">
                    {[c.reference || null, c.requiredBy ? `needed by ${formatDate(c.requiredBy)}` : "no day set", c.satisfiedOn ? `met ${formatDate(c.satisfiedOn)}` : "not met", c.excludesEot ? "a delay gives no extension of time" : null].filter(Boolean).join(" · ")}
                  </span>
                </span>
                {open && !c.satisfiedOn && <SatisfyConditionDrawer id={award.id} conditionId={c.id} name={c.kindName} today={today} />}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- securities

function SecuritiesPanel({
  l,
  ev,
  f,
  requirements,
  people,
  today,
  termsValues,
}: {
  l: LoadedAward;
  ev: AwardEvaluation;
  f: Awaited<ReturnType<typeof awardFacts>>;
  requirements: ReturnType<typeof applicableRequirements>;
  people: { value: string; label: string }[];
  today: string | null;
  termsValues: Record<string, string | boolean | null>;
}) {
  const { award } = l;
  const c = award.contract;
  // Review S3: the register's acts ask FORMATION's row (cancelled, terminated and closed keep it as it was).
  const open = !!c && !actStatusFault("FORMATION", c.status as ContractStatus);
  const issuers = f.config.issuers.filter((i) => i.retiredOn == null).map((i) => ({ value: i.id, label: i.name }));
  const months = award.completionUnit === "MONTHS" ? award.completionPeriod : null;
  const derived = derivedAnnualValue(senFromDecimal(award.awardedValue), months);
  const pl = derivedLimit(f.config.bands, senFromDecimal(award.awardedValue), today ? new Date(`${today}T00:00:00Z`) : undefined);
  const offsets = f.config.expiryOffsets;
  const alert = (d: Date | null) => {
    if (!today) return null;
    const a = expiryAlert(day(d), offsets, today);
    return a.state === "EXPIRED" ? <Chip tone="err">{`Expired ${a.daysAgo} days ago`}</Chip> : a.state === "DUE" ? <Chip tone="warn">{`Expires in ${a.daysLeft} days`}</Chip> : a.state === "NO_EXPIRY" ? <Chip tone="warn">No expiry recorded</Chip> : null;
  };
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader icon={<ShieldIcon size={17} />} title="The performance bond" subtitle="Decided for this contract: what it is a percentage of, the percentage and how long it must run. Never filled in for you." actions={editable(award.status as AwardStatus).terms ? <EditTermsDrawer id={award.id} values={termsValues} regulatedLabel={f.config.policy.regulatedActivityLabel} asked={{ retention: ev.terms?.retentionAsked ?? null, dlp: ev.terms?.dlpAsked ?? null }} label="Edit bond" tender={ev.appendix ? Object.fromEntries(BASELINE_FIELDS.map((k) => [k, tenderTermText(k, ev.appendix!.baseline)])) as Record<BaselineField, string | null> : null} /> : undefined} />
        <CardBody className="flex flex-col gap-5">
          {ev.appendix && <p className="text-[13px] text-ink-2">The tender Appendix states no bond terms, so there is nothing to compare: the bond is decided for this contract.</p>}
          {award.bondRequired == null ? (
            <Callout tone="warn" title="Not decided">Whether this contract needs a performance bond is not decided. Nothing is assumed.</Callout>
          ) : award.bondRequired === false ? (
            <Callout tone="info" title="No bond required">{award.bondNotRequiredReason || "The reason is not recorded."} {award.bondBasisProvenance && <ProvenanceBadge value={award.bondBasisProvenance} />}</Callout>
          ) : ev.requiredBond.state === "NOT_SET" ? (
            <Callout tone="warn" title="Bond basis not set">The procedure and the observed award pack give different bases. Choose what this contract&apos;s bond is a percentage of, and the percentage.</Callout>
          ) : null}
          {award.bondRequired !== false && (
          <div className="grid gap-4 md:grid-cols-3">
            <Stat variant="inset" size="sm" tone="neutral" label="Required amount" value={ev.requiredBond.state === "SET" ? formatMoney(ev.requiredBond.amount) : null} hint={award.bondBasis ? `${BOND_BASIS_LABEL[award.bondBasis]}${award.bondPercent ? `, ${pct(award.bondPercent)}` : ""}` : "Basis not set"} />
            <Stat variant="inset" size="sm" tone="neutral" label="One-year value, as entered" value={award.bondBasisAmount && award.bondBasis === "ANNUAL_VALUE" ? money(award.bondBasisAmount) : null} hint={derived ? `Derived from the sum and period: ${formatMoney(derived)}. For comparison only.` : "No derived figure: the period is not in months."} />
            <Stat variant="inset" size="sm" tone="neutral" label="Must run until" value={ev.bondUntil ? formatDate(ev.bondUntil) : null} hint={award.bondValidityExtraMonths != null ? `Completion plus ${award.bondValidityExtraMonths} months.` : "Months past completion not set."} />
          </div>
          )}
          {award.bondBasisProvenance && award.bondRequired && (
            <p className="text-[12.5px] text-ink-3">
              Where the basis came from: <ProvenanceBadge value={award.bondBasisProvenance} /> {award.bondBasisNote}
            </p>
          )}
        </CardBody>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader icon={<ShieldIcon size={17} />} title="Securities lodged" subtitle={c ? `On contract ${c.number}. Verified only against the approved issuers list${offsets.length ? `; expiry reminders at ${offsets.join(", ")} days, shown and not sent` : "; no expiry reminders are set"}.` : "Lodged on the contract, which exists once the instrument is issued."} actions={open ? <LodgeSecurityDrawer id={award.id} issuers={issuers} today={today} /> : undefined} divided={(c?.securities.length ?? 0) > 0} />
        {!c || c.securities.length === 0 ? (
          <EmptyState size="sm" title="None lodged">{c ? "Lodge the performance bond when it is handed in." : "Nothing can be lodged before issue."}</EmptyState>
        ) : (
          <ul className="divide-y divide-line/70">
            {c.securities.map((s) => (
              <li key={s.id} className="flex flex-col gap-2 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-semibold break-words text-ink">{`${SECURITY_KIND_LABEL[s.kind]} · ${SECURITY_FORM_LABEL[s.form]} · ${money(s.value)}`}</span>
                  <span className="block text-[12.5px] break-words text-ink-3">
                    {[s.issuer?.name ?? `${s.issuerNameAsWritten || "Issuer"} (not on the approved list)`, s.instrumentRef || null, s.expiresOn ? `expires ${formatDate(s.expiresOn)}` : "no expiry recorded", s.status === "REJECTED" ? `rejected: ${s.rejectedReason}` : s.verifiedBy ? `checked by ${s.verifiedBy.name}, ${formatDate(s.verifiedOn)}` : null].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="flex shrink-0 flex-wrap items-center gap-2">
                  {s.status !== "REJECTED" && alert(s.expiresOn)}
                  <Chip tone={REGISTER_STATUS_TONE[s.status]}>{REGISTER_STATUS_LABEL[s.status]}</Chip>
                  {open && s.status === "LODGED" && <ReviewDrawer id={award.id} targetId={s.id} kind="security" name={SECURITY_KIND_LABEL[s.kind]} people={people} today={today} />}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="overflow-hidden">
        <CardHeader
          icon={<ShieldIcon size={17} />}
          title="Insurance"
          subtitle={requirements.length ? `Required for this contract: ${requirements.map((r) => r.nameEn).join(", ")}.${requirements.some((r) => r.kind === "WORKMENS_COMPENSATION") ? ` How workmen's compensation is calculated: ${award.wcBasis ? WC_BASIS_LABEL[award.wcBasis].toLowerCase() : "not set — set it in Edit terms"}.` : ""}` : "No insurance requirements are configured, so what must be verified is not known."}
          actions={open ? <LodgePolicyDrawer id={award.id} issuers={issuers} today={today} tenderUplift={ev.appendix?.baseline.insurance.worksUplift ? formatMoney(ev.appendix.baseline.insurance.worksUplift.sen) : null} /> : undefined}
          divided={(c?.policies.length ?? 0) > 0 || true}
        />
        <CardBody className="flex flex-col gap-2 border-b border-line">
          <p className="text-[13px] text-ink-2">
            Public liability limit from the bands:{" "}
            {pl.state === "SET" ? <span className="font-semibold text-ink">{formatMoney(pl.limit)}</span> : pl.state === "NOT_SET" ? <span className="text-ink-4">bands not set</span> : pl.state === "NO_BAND" ? <span className="text-rose-700">the contract price falls between the bands — refused, not placed</span> : <span className="text-rose-700">the contract price falls in two bands</span>}
            {pl.state !== "SET" && (
              <>
                {" "}
                <Link href="/configuration/awards">Award controls</Link>
              </>
            )}
          </p>
        </CardBody>
        {!c || c.policies.length === 0 ? (
          <EmptyState size="sm" title="None lodged">{c ? "Lodge each required policy when it is handed in." : "Nothing can be lodged before issue."}</EmptyState>
        ) : (
          <ul className="divide-y divide-line/70">
            {c.policies.map((p) => (
              <li key={p.id} className="flex flex-col gap-2 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-semibold break-words text-ink">{`${INSURANCE_KIND_LABEL[p.kind]}${p.substitutesFor ? ` in place of the ${INSURANCE_KIND_LABEL[p.substitutesFor].toLowerCase()}` : ""} · ${money(p.sumInsured)}`}</span>
                  <span className="block text-[12.5px] break-words text-ink-3">
                    {[p.issuer?.name ?? `${p.issuerNameAsWritten || "Insurer"} (not on the approved list)`, p.policyNo || null, `${formatDate(p.periodStart)} to ${formatDate(p.periodEnd)}`, p.kind === "WORKMENS_COMPENSATION" ? WC_CHECK_LABEL[wcSumCheck(award.wcBasis)].toLowerCase() : null, p.kind === "WORKMENS_COMPENSATION" && p.wcCheckedOn ? `wages check recorded ${formatDate(p.wcCheckedOn)}, not judged` : null, p.status === "REJECTED" ? `rejected: ${p.rejectedReason}` : p.verifiedBy ? `checked by ${p.verifiedBy.name}, ${formatDate(p.verifiedOn)}` : null].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="flex shrink-0 flex-wrap items-center gap-2">
                  {p.status !== "REJECTED" && alert(p.periodEnd)}
                  <Chip tone={REGISTER_STATUS_TONE[p.status]}>{REGISTER_STATUS_LABEL[p.status]}</Chip>
                  {open && p.status === "LODGED" && <ReviewDrawer id={award.id} targetId={p.id} kind="policy" name={INSURANCE_KIND_LABEL[p.kind]} people={people} today={today} />}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------- history

const ENTITY_LABEL: Record<string, string> = {
  // Attachments and the documents behind them (document store).
  ...DOCUMENT_ENTITY_LABEL,
  Award: "Award",
  ApprovalInstance: "Approval route",
  ApprovalStep: "Approval step",
  Contract: "Contract",
  CaseOwnershipEvent: "Handover",
  AwardDistribution: "Copy",
  AwardDocument: "Document",
  AwardReturn: "Return",
  AwardCondition: "Condition",
  SecurityInstrument: "Security",
  InsurancePolicy: "Insurance policy",
  // 6.14: the pre-award routing sheet and its checks.
  AwardRoutingSheet: "Routing sheet",
  RoutingCheck: "Routing check",
};
const ACTION_LABEL = { CREATE: "Created", UPDATE: "Changed", DELETE: "Removed" } as const;
const FIELD_NAME: Record<string, string> = {
  awardeeName: "Awardee",
  awardeeRegistrationNo: "Registration number",
  awardeeAddress: "Address",
  awardedValue: "Awarded value",
  completionPeriod: "Completion period",
  instrumentKind: "Instrument",
  instrument: "Instrument",
  startDate: "Start date",
  regulatedActivity: "Regulated activity",
  bondRequired: "Bond required",
  bondNotRequiredReason: "Why no bond",
  bondBasis: "Bond basis",
  bondPercent: "Bond percentage",
  bondBasisAmount: "One-year value or stated amount",
  bondValidityExtraMonths: "Months past completion",
  bondBasisProvenance: "Where the bond decision came from",
  termsProvenance: "Where the terms came from",
  ladAmount: "Liquidated damages",
  retentionPercent: "Retention",
  retentionCapPercent: "Retention limit",
  dlpMonths: "Defects liability, months",
  wcBasis: "Workmen's compensation basis",
  worksSumInsured: "Works insurance, sum insured",
  liabilitySumInsured: "Public liability insurance, sum insured",
  wcSumInsured: "Workmen's compensation insurance, sum insured",
  ladDiffersReason: "Why the liquidated damages differ from the tender Appendix",
  dlpDiffersReason: "Why the defects liability period differs from the tender Appendix",
  regulatedDiffersReason: "Why the regulated-activity answer differs from the tender's",
  worksInsuredDiffersReason: "Why the works sum insured differs from the tender Appendix",
  liabilityInsuredDiffersReason: "Why the public liability sum insured differs from the tender Appendix",
  wcInsuredDiffersReason: "Why the workmen's compensation sum insured differs from the tender Appendix",
  termsFrom: "Terms opened from",
  erpCommitmentNo: "Commitment number",
  erpCommitmentKind: "It is",
  indentReceivedOn: "Indent received",
  icNumber: "Identity card number",
  yearReading: "Year in the number",
  from: "From",
  to: "To",
  numberSource: "Numbered from",
  numberedOn: "Numbered on",
  contractSum: "Contract sum",
  textVersion: "Text version",
  formCode: "Form",
  frozen: "Text fixed",
  recordedOnBehalf: "Recorded",
  classificationLockedAt: "Classification locked",
};
const MONEY_FIELDS = new Set(["awardedValue", "bondBasisAmount", "ladAmount", "value", "sumInsured", "contractSum", "requiredValue", "appendixAmount", "requiredLimit", "worksSumInsured", "liabilitySumInsured", "wcSumInsured"]);
/// A status reads by what it is the status of: a route is "Approved", an award "Approved, not issued".
const STATUS_TEXT: Record<string, Record<string, string>> = {
  Award: AWARD_STATUS_LABEL,
  ApprovalInstance: { PENDING: "In progress", APPROVED: "Approved", REJECTED: "Refused", RECALLED: "Withdrawn" },
  SecurityInstrument: REGISTER_STATUS_LABEL,
  InsurancePolicy: REGISTER_STATUS_LABEL,
  Contract: CONTRACT_STATUS_LABEL,
};
const ENUM_TEXT: Record<string, Record<string, string>> = {
  instrumentKind: INSTRUMENT_LABEL,
  instrument: INSTRUMENT_LABEL,
  completionUnit: { DAYS: "Days", WEEKS: "Weeks", MONTHS: "Months" },
  bondBasis: BOND_BASIS_LABEL,
  wcBasis: WC_BASIS_LABEL,
  erpCommitmentKind: COMMITMENT_KIND_LABEL,
  method: DELIVERY_LABEL,
  decision: DECISION_LABEL,
  kind: { ...SECURITY_KIND_LABEL, ...INSURANCE_KIND_LABEL },
  form: SECURITY_FORM_LABEL,
  numberSource: { SERIES: "The contract type's series", INDENT_NUMBER: "The indent's own number" },
  language: LANGUAGE_LABEL,
  bondBasisProvenance: { STATED: "Stated", OBSERVED: "Observed", ASSUMED: "Assumed" },
  termsProvenance: { STATED: "Stated", OBSERVED: "Observed", ASSUMED: "Assumed" },
};

function HistoryPanel({ entries, total, timeZone }: { entries: Awaited<ReturnType<typeof awardHistory>>["entries"]; total: number; timeZone: string | null }) {
  const read = (field: string, value: string | null, entity: string): string => {
    if (value == null || value === "") return "—";
    if (field === "status" && STATUS_TEXT[entity]?.[value]) return STATUS_TEXT[entity][value];
    if (field === "yearReading") return "The year of issue — an assumed reading, to be confirmed";
    if (ENUM_TEXT[field]?.[value]) return ENUM_TEXT[field][value];
    if (MONEY_FIELDS.has(field) && /^-?\d+(\.\d+)?$/.test(value)) return formatMoney(parseSen(value));
    if (/Percent$/.test(field) && /^\d+(\.\d+)?$/.test(value)) return pct(value)!;
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return formatDate(value);
    if (value === "true" || value === "yes") return "Yes";
    if (value === "false" || value === "no") return "No";
    if (/^[A-Z][A-Z_]+$/.test(value)) return "—";
    return value;
  };
  const shown = (field: string, ch: { before: string | null; after: string | null }, action: string) =>
    !/(Code|Key|Id)$/.test(field) && (action !== "CREATE" || (ch.after != null && ch.after !== "" && ch.after !== "false" && ch.after !== "no")) && (action !== "UPDATE" || ch.before !== ch.after);
  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<ClockIcon size={17} />}
        title="History"
        subtitle={`${total > entries.length ? `Showing the latest ${entries.length} of ${total} changes. ` : "Every change to this award and what is under it. "}Nobody is signed in, so no change is attributed. The identity card number is masked here.`}
        divided={entries.length === 0}
      />
      {entries.length === 0 ? (
        <EmptyState size="sm" title="No recorded changes">Changes made through the portal appear here.</EmptyState>
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
                  {foldPeriodChanges(e.changes).filter((ch) => shown(ch.field, ch, e.action)).map((ch) => (
                    <li key={ch.field}>
                      {FIELD_NAME[ch.field] ?? fieldLabel(ch.field)}: {e.action === "UPDATE" && <>{read(ch.field, ch.before, e.entity)} → </>}
                      <span className="text-ink-2">{read(ch.field, e.action === "DELETE" ? ch.before : ch.after, e.entity)}</span>
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

