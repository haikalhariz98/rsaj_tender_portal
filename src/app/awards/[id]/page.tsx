import Link from "next/link";
import { notFound } from "next/navigation";

import { AwardIcon, CheckIcon, ClipboardIcon, ClockIcon, FileIcon, InboxIcon, PrinterIcon, RouteIcon, ShieldIcon, SlidersIcon } from "@/components/icons";
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
import { CONTRACT_YEAR_READING } from "@/lib/award/contract-number";
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
  GATE_LABEL,
  GATE_STATE_LABEL,
  INSTRUMENT_LABEL,
  INSTRUMENT_SHORT,
  INSURANCE_KIND_LABEL,
  LANGUAGE_LABEL,
  NON_COMMENCEMENT_LABEL,
  periodText,
  REGISTER_STATUS_LABEL,
  REGISTER_STATUS_TONE,
  RETURN_ITEM_LABEL,
  SECURITY_FORM_LABEL,
  SECURITY_KIND_LABEL,
  WC_BASIS_LABEL,
} from "@/lib/award/labels";
import { MASKING_NOTE } from "@/lib/award/mask";
import { mergeFieldLabel } from "@/lib/award/fields";
import { readinessGate } from "@/lib/award/readiness";
import { awardFacts, awardHistory, exerciseMatters, latestRoute, loadAward, matterRecord, type LoadedAward } from "@/lib/award/repo";
import { acceptancePageFaults, returnState, type ReturnRecord } from "@/lib/award/stage-two";
import { editable } from "@/lib/award/status";
import type { AwardStatus, Finding, InstrumentKind } from "@/lib/award/types";
import { storedDay } from "@/lib/dates";
import { formatDate, formatOrgDay } from "@/lib/format";
import { ACT_DONE_LABEL, ACT_LABEL } from "@/lib/labels";
import { boundarySentence, REGIME_LABEL } from "@/lib/method/labels";
import type { Regime } from "@/lib/method/types";
import { formatMoney, parseSen, senFromDecimal } from "@/lib/money";
import { DECISION_LABEL } from "@/lib/requisition/labels";
import { derivedAnnualValue } from "@/lib/securities/bond";
import { expiryAlert } from "@/lib/securities/expiry";
import { applicableRequirements } from "@/lib/securities/insurance";
import { derivedLimit } from "@/lib/securities/insurance";

import {
  AddConditionDrawer,
  AWARD_NOTE_ID,
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
  const [f, history, matters] = await Promise.all([awardFacts(l), awardHistory(l), exerciseMatters(ex.id)]);
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
  const returned = !!award.awardReturn && (loa ? !!award.awardReturn.signedLetterReceivedOn : !!award.awardReturn.signatoryName);
  const canCancel = status === "DRAFT" || status === "PENDING_APPROVAL" || status === "APPROVED" || (status === "ISSUED" && !returned && !award.commencedOn);
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
  };
  const routePreview = ev.route?.ok ? ev.route.chain.map((s) => `${f.issue?.matrix.roles[s.roleCode]?.nameEn ?? "An office no longer configured"} — ${ACT_LABEL[s.act]?.toLowerCase() ?? "acts"}${s.committeeCode ? ", as a committee decision" : ""}`) : [];
  const consequenceText = ev.consequence ? NON_COMMENCEMENT_LABEL[ev.consequence] : null;

  const actions = (
    <>
      {edits.details && (
        <EditDetailsDrawer
          id={award.id}
          values={{ awardeeName: award.awardeeName, awardeeRegistrationNo: award.awardeeRegistrationNo, awardeeAddress: award.awardeeAddress, awardedValue: award.awardedValue.toString(), completionPeriod: String(award.completionPeriod), completionUnit: award.completionUnit }}
        />
      )}
      {edits.terms && <EditTermsDrawer id={award.id} values={termsValues} regulatedLabel={policy.regulatedActivityLabel} />}
      {status === "DRAFT" && <SubmitAwardDrawer id={award.id} blocker={submitBlocker} route={routePreview} />}
      {canRecordCommitment && <RecordCommitmentDrawer id={award.id} indent={!loa} example={f.config.indentFormat?.example || null} today={today} />}
      {issueReady && ev.signatory?.ok && (
        <IssueDrawer
          id={award.id}
          signatory={ev.signatory.roleLabel}
          people={suggestions(ev.signatory.roleCode)}
          today={today}
          summary={[
            ["Instrument", INSTRUMENT_LABEL[kind]],
            ["Documents", ev.documents.map((d) => DOCUMENT_LABEL[d.kind]).join(", ")],
            ["Contract number", "fault" in ev.contractNumber ? NOT_SET : ev.contractNumber.source === "SERIES" ? "The next in its contract type's series" : `The indent's own number, ${award.erpCommitmentNo}`],
            ["Copies to", "rows" in ev.distribution ? ev.distribution.rows.map((r) => r.recipientName).join(", ") : NOT_SET],
            ["Case handed to", policy.postContractUnitCode ?? "Sections not set: recorded without them"],
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
        <span className="font-semibold text-ink-2">Issue:</span> not available until everything below is in place.
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
  const securities = award.contract?.securities ?? [];
  const policies = award.contract?.policies ?? [];
  const gate = readinessGate({
    returned: ret ? (loa ? returnState(ret).complete : acceptancePageFaults(ret).length === 0) : false,
    bondRequired: award.bondRequired,
    bondNotRequiredReason: award.bondNotRequiredReason,
    requiredBond: ev.requiredBond,
    bonds: securities.map((s) => ({ kind: s.kind, status: s.status, value: senFromDecimal(s.value) })),
    requirements,
    policies: policies.map((p) => ({ kind: p.kind, substitutesFor: p.substitutesFor, status: p.status })),
  });

  const tabs = [
    { id: "overview", label: "Overview", icon: <AwardIcon size={15} />, panel: <OverviewPanel l={l} ev={ev} methodName={methodName} typeName={typeName} policyLabel={policy.regulatedActivityLabel} validityDays={policy.indentValidityDays} expiredRule={!!f.config.indentExpiredRule} /> },
    {
      id: "approval",
      label: "Approval",
      icon: <RouteIcon size={15} />,
      panel: <ApprovalPanel l={l} ev={ev} suggestions={suggestions} today={today} matters={matters} roleName={(c) => f.issue?.matrix.roles[c]?.nameEn ?? "An office no longer configured"} />,
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
      count: award.conditions.length,
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
        subtitle={
          <>
            <span className="font-mono text-[12.5px]">{award.reference}</span> · for <Link href={`/sourcing/${ex.id}?tab=award`}>{ex.reference}</Link>, {ex.title}
          </>
        }
        meta={[
          <span key="v" className="tabular-nums">{money(award.awardedValue)}</span>,
          INSTRUMENT_SHORT[kind],
          ev.signatory?.ok ? `Signed by the ${ev.signatory.roleLabel}` : "Signatory not resolved",
          award.contract ? `Contract ${award.contract.number}` : "No contract number yet",
        ]}
        actions={actions}
        actionsNote={headerNote}
        actionsNoteId={AWARD_NOTE_ID}
      />

      <div className="mb-6 flex flex-col gap-3">
        {status === "CANCELLED" && (
          <Callout tone="info" title="Cancelled">
            {award.cancelReason || "No reason recorded."}
            {award.cancelConsequence && ` Consequence recorded: ${NON_COMMENCEMENT_LABEL[award.cancelConsequence].toLowerCase()}. Blacklisting itself waits for the supplier register.`}
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
            The grace period ended on {formatDate(ev.commencement.deadline)}. The variant&apos;s consequence: {consequenceText ? consequenceText.toLowerCase() : "not set on the variant"}. Cancelling records it; blacklisting itself waits for the supplier register. Nothing is sent.
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

function OverviewPanel({ l, ev, methodName, typeName, policyLabel, validityDays, expiredRule }: { l: LoadedAward; ev: AwardEvaluation; methodName: string; typeName: string; policyLabel: string | null; validityDays: number | null; expiredRule: boolean }) {
  const { award, ex, req } = l;
  const kind = award.instrumentKind as InstrumentKind;
  const c = award.contract;
  const handover = c?.ownershipEvents[0] ?? null;
  const indent = ev.indent;
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader icon={<AwardIcon size={17} />} title="The award" subtitle={`${INSTRUMENT_LABEL[kind]}. The exercise's classification is read from its record, never copied.`} />
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
              { label: "Awarded value", value: <span className="tabular-nums">{money(award.awardedValue)}</span> },
              { label: "Exercise's estimate", value: <span className="tabular-nums">{money(ex.estimatedValue)}</span> },
              { label: "Completion period", value: periodText(award.completionPeriod, award.completionUnit) },
              { label: "Stated start date", value: award.startDate ? formatDate(award.startDate) : notSet() },
              { label: "Completion", value: ev.completion ? formatDate(ev.completion) : notSet("Not known until the start date is set") },
              { label: policyLabel ? `${policyLabel}?` : "The regulated activity?", value: award.regulatedActivity == null ? notSet("Not answered") : award.regulatedActivity ? "Yes" : "No" },
              { label: "Status of the exercise", value: "Awarded is shown from the award: the exercise's own status moves when the sourcing window is built." },
            ]}
          />
        </CardBody>
      </Card>
      <Card>
        <CardHeader icon={<FileIcon size={17} />} title="Contract and commitment" subtitle="The contract number is drawn when the instrument is issued; the finance system's number is consumed, never issued." />
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
                    <span className="text-[12.5px] text-ink-3">{CONTRACT_YEAR_READING}</span>
                  </span>
                ) : "fault" in ev.contractNumber ? notSet(awardFindingText({ code: ev.contractNumber.fault, level: "block" })) : ev.contractNumber.source === "SERIES" ? "Drawn from its contract type's series on issue" : "The indent's own number, on issue",
              },
              { label: "Contract sum", value: c ? <span className="tabular-nums">{money(c.contractSum)}</span> : notSet("On issue") },
              {
                label: "Case handed over",
                value: handover ? `${formatDate(handover.on)}${handover.fromUnitCode || handover.toUnitCode ? ` · ${handover.fromUnitCode ?? "not set"} to ${handover.toUnitCode ?? "not set"}` : " · sections not set"}` : notSet("On issue"),
              },
              {
                label: "Finance system's number",
                value: award.erpCommitmentNo ? (
                  <span className="flex flex-col">
                    <span className="font-mono text-[13px]">{award.erpCommitmentNo}</span>
                    <span className="text-[12.5px] text-ink-3">{`${award.erpCommitmentKind ? COMMITMENT_KIND_LABEL[award.erpCommitmentKind] : ""} · typed by an officer${ev.indentFormatOk === null ? " · no format set, not checked" : ""}`}</span>
                  </span>
                ) : (
                  notSet("Not recorded")
                ),
              },
              ...(kind === "WORK_INDENT"
                ? [
                    {
                      label: "Indent validity",
                      value: !indent || indent.state === "NOT_RECEIVED" ? notSet("Runs from the indent's receipt") : indent.state === "NOT_SET" ? notSet("Validity not set") : (
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
        <CardHeader icon={<SlidersIcon size={17} />} title="The letter's terms" subtitle="Per award, with where they came from. Never defaulted." actions={award.termsProvenance ? <ProvenanceBadge value={award.termsProvenance} /> : undefined} />
        <CardBody>
          <KeyValues
            columns={2}
            items={[
              { label: "Liquidated damages", value: award.ladAmount ? `${money(award.ladAmount)}${award.ladUnit ? ` ${award.ladUnit}` : ""}` : notSet() },
              { label: "Retention", value: award.retentionPercent ? `${pct(award.retentionPercent)}${award.retentionCapPercent ? `, limited to ${pct(award.retentionCapPercent)} of the sum` : ""}` : ev.terms?.retentionAsked === false ? "Not asked by its terms band" : notSet() },
              { label: "Defects liability period", value: award.dlpMonths != null ? periodText(award.dlpMonths, "MONTHS") : ev.terms?.dlpAsked === false ? "Not asked by its terms band" : notSet() },
              { label: "Terms band", value: ex.termsBandKey ? (l.ex.bandSnapshot as { terms?: { label?: string } } | null)?.terms?.label ?? "As recorded on the exercise" : ex.termsState === "NONE_IN_REGIME" ? "Not applicable in this band" : notSet() },
              { label: "Appointment-letter variant", value: kind === "LETTER_OF_ACCEPTANCE" ? "Not applicable" : award.variantName ?? (ev.variant?.state === "SELECTED" ? ev.variant.variant.nameEn : notSet(ev.variant ? awardFindingText({ code: ev.variant.state === "NONE" ? "VARIANT_NONE" : ev.variant.state === "AMBIGUOUS" ? "VARIANT_AMBIGUOUS" : "TERMS_NOT_SET", level: "block" }) : NOT_SET)) },
              { label: "If work does not commence", value: kind === "LETTER_OF_ACCEPTANCE" ? "Not applicable" : ev.consequence ? NON_COMMENCEMENT_LABEL[ev.consequence] : notSet() },
            ]}
          />
        </CardBody>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ approval

function ApprovalPanel({ l, ev, suggestions, today, matters, roleName }: { l: LoadedAward; ev: AwardEvaluation; suggestions: (c: string | null) => { value: string; label: string }[]; today: string | null; matters: Awaited<ReturnType<typeof exerciseMatters>>; roleName: (code: string) => string }) {
  const { award } = l;
  const inst = latestRoute(award);
  const earlier = award.approvalInstances.filter((i) => i.id !== inst?.id);
  const cited = new Set(award.approvalInstances.flatMap((i) => i.steps.map((s) => s.committeeDecisionId)).filter(Boolean));
  const sig = ev.signatory;
  const cb = ev.committee;
  const ab = ev.approver;
  return (
    <div className="flex flex-col gap-6">
      {!inst ? (
        <Card>
          <CardHeader icon={<RouteIcon size={17} />} title="Who approves the appointment" subtitle="Resolved when the award is sent for approval, for the awarded value, under the approval matrix then in force." />
          <CardBody className="flex flex-col gap-3">
            {ev.route?.ok ? (
              <>
                <p className="text-[13.5px] text-ink-2">If it were sent today, it would go:</p>
                <ol className="flex flex-col gap-1.5">
                  {ev.route.chain.map((s, i) => (
                    <li key={i} className="flex min-w-0 items-center gap-2 text-[13.5px]">
                      <ActBadge act={s.act} />
                      <span className="min-w-0 font-semibold break-words text-ink">{roleName(s.roleCode)}</span>
                      <span className="text-ink-3">{ACT_LABEL[s.act]}{s.committeeCode ? ", as a committee decision" : ""}</span>
                    </li>
                  ))}
                </ol>
                <p className="text-[12.5px] break-words text-ink-3">{`${ev.route.ruleLabel}${ev.route.clause ? ` · ${ev.route.clause}` : ""}`}</p>
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
            subtitle={`Sent ${formatOrgDay(inst.openedAt, l.org.timeZone)} under ${inst.matrixLabel ?? "an issue no longer on file"}: ${inst.ruleLabel ?? "a rule no longer on file"}.`}
            actions={<Badge tone={inst.status === "APPROVED" ? "ok" : inst.status === "PENDING" ? "brand" : "warn"}>{inst.status === "APPROVED" ? "Approved" : inst.status === "PENDING" ? "In progress" : inst.status === "REJECTED" ? "Refused" : "Withdrawn"}</Badge>}
          />
          {((inst.warnings as { level: string; messageEn: string }[]) ?? []).length > 0 && (
            <CardBody className="flex flex-col gap-2">
              {(inst.warnings as { level: string; messageEn: string }[]).map((w, i) => (
                <Callout key={i} tone={tone(w.level)}>{w.messageEn}</Callout>
              ))}
            </CardBody>
          )}
          {inst.status === "PENDING" && <p className="border-t border-line px-5 py-2.5 text-[12.5px] text-ink-3 sm:px-6">Steps are decided in order. A committee&apos;s step is discharged by citing its decision on this exercise.</p>}
          <ol className="divide-y divide-line/70 border-t border-line">
            {inst.steps.map((s) => {
              const earlierDone = inst.steps.filter((x) => x.sequence < s.sequence).every((x) => x.decision === "DONE");
              const citedRecord = s.committeeDecision ? matterRecord(s.committeeDecision) : null;
              const open = inst.status === "PENDING" && s.decision === "PENDING" && earlierDone;
              const offered = matters
                .filter((m) => m.meeting.committee.code === s.committeeCode && !cited.has(m.id))
                .map((m) => ({ value: m.id, label: `${m.meeting.reference} · ${m.subject} · ${m.outcome === "PENDING" ? "not decided yet" : m.outcome === "CARRIED" ? "carried" : m.outcome === "DEFERRED" ? "deferred" : "not carried"}` }));
              return (
                <li key={s.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
                  <div className="flex min-w-0 items-start gap-3">
                    <ActBadge act={s.act} />
                    <div className="min-w-0">
                      <div className="font-semibold break-words text-ink">
                        {s.roleLabel} <span className="font-normal text-ink-3">· {ACT_LABEL[s.act]}{s.committeeCode ? ", as a committee decision" : ""}</span>
                      </div>
                      <div className="text-[12.5px] break-words text-ink-2">
                        {s.decision === "PENDING"
                          ? inst.status === "PENDING"
                            ? `${earlierDone ? "Awaiting a decision." : "Waits for the step before."}${s.nonDelegable ? " Cannot be delegated." : ""}`
                            : "Not decided: the route closed."
                          : s.committeeCode && citedRecord?.record
                            ? `${DECISION_LABEL[s.decision]} · ${citedRecord.record.committee} at ${citedRecord.record.meetingReference}, ${formatDate(citedRecord.record.decisionDate ?? citedRecord.record.meetingDate)} · ${citedRecord.minuted ? "minuted" : "not yet minuted"}`
                            : `${DECISION_LABEL[s.decision]} · ${s.decidedByName ?? "Not recorded"} · recorded on behalf of, not signed · ${formatDate(s.decidedOn)} · received ${s.receivedOn ? formatDate(s.receivedOn) : "not recorded"}${s.delegation ? ` · under delegation from ${s.delegation.fromPerson.name}` : ""}${s.reason ? ` · “${s.reason}”` : ""}`}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                    {s.decision !== "PENDING" && <Badge tone={s.decision === "DONE" ? "ok" : "err"}>{DECISION_LABEL[s.decision]}</Badge>}
                    {open && (s.committeeCode ? (
                      <CiteDecisionDrawer id={award.id} stepId={s.id} committee={s.roleLabel} matters={offered} />
                    ) : (
                      <DecideStepDrawer id={award.id} stepId={s.id} roleLabel={s.roleLabel} act={ACT_LABEL[s.act] ?? "Acts"} done={ACT_DONE_LABEL[s.act] ?? "Done"} people={suggestions(s.roleCode)} today={today} />
                    ))}
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>
      )}

      <Card>
        <CardHeader icon={<ClipboardIcon size={17} />} title="Routing sheet" subtitle="The committee's block and the approver's, read from the decision record and the route — never keyed. They are frozen into the covering memo when it is issued." />
        <CardBody className="grid gap-5 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <p className="text-[12px] font-semibold text-ink-3">Committee</p>
            {cb?.state === "DECIDED" ? (
              <KeyValues
                items={[
                  { label: "Committee", value: cb.committee },
                  { label: "Sitting", value: `${cb.meetingReference}, ${formatDate(cb.meetingDate)}` },
                  { label: "Outcome", value: cb.outcome === "CARRIED" ? "Carried" : cb.outcome === "DEFERRED" ? "Deferred" : "Not carried" },
                  { label: "Decided on", value: cb.decisionDate ? formatDate(cb.decisionDate) : notSet("Not recorded") },
                  { label: "Minutes", value: cb.minuted ? "Minuted" : "Not yet minuted — the decision stands on the record" },
                ]}
              />
            ) : (
              <p className="text-[13.5px] text-ink-3">{cb ? "Not decided yet." : "The route has no committee step."}</p>
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
              <p className="text-[13.5px] text-ink-3">{inst ? "The route's approval is a committee's." : "Resolved when the award is sent for approval."}</p>
            )}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader icon={<FileIcon size={17} />} title="Who signs the instrument" subtitle="From the signatory rules on the approval matrix, at the awarded value. No rule, two rules or a known gap refuses: a signatory is never assumed." />
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
                { label: "Office", value: sig.roleLabel },
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

      {earlier.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader icon={<ClockIcon size={17} />} title="Earlier routes" subtitle="Kept on record." />
          <ul className="divide-y divide-line/70">
            {earlier.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2 px-5 py-3 text-[13px] sm:px-6">
                <Badge tone="neutral">{e.status === "REJECTED" ? "Refused" : e.status === "RECALLED" ? "Withdrawn" : e.status === "APPROVED" ? "Approved" : "In progress"}</Badge>
                <span className="min-w-0 break-words text-ink-2">
                  Sent {formatOrgDay(e.openedAt, l.org.timeZone)} · {e.steps.map((s) => s.roleLabel).join(" → ")}
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
  const page = acceptancePageFaults(ret);
  const tri = (v: boolean | null) => (v == null ? notSet("Not recorded") : v ? "Yes" : "No — recorded as not done");
  return (
    <Card>
      <CardHeader
        icon={<ClipboardIcon size={17} />}
        title={loa ? "What came back (integrity pact, second stage)" : "The acceptance page"}
        subtitle={loa ? (state.complete ? "All three documents are back." : `Still to come: ${state.missing.map((m) => RETURN_ITEM_LABEL[m]).join(", ")}.`) : page.length === 0 ? "Every field is recorded." : `Still to record: ${page.map((x) => ACCEPTANCE_FAULT_LABEL[x]).join(", ")}.`}
        actions={award.status === "ISSUED" ? <ReturnDrawer id={award.id} loa={loa} people={people} values={{ ...ret, contractorSigned: yesNo(ret.contractorSigned), stampAffixed: yesNo(ret.stampAffixed), witnessSigned: yesNo(ret.witnessSigned), receivedByPersonId: r.receivedByPersonId, whereHeld: r.whereHeld }} /> : undefined}
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
            <Callout tone="info">The identity card number is shown in full here only. {MASKING_NOTE}</Callout>
            <KeyValues
              columns={2}
              items={[
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
            { label: "Attachments", value: <Chip tone="warn">Paper only — nothing is attached in this phase</Chip> },
          ]}
        />
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------- conditions

function ConditionsPanel({ l, gate, kinds, today }: { l: LoadedAward; gate: ReturnType<typeof readinessGate>; kinds: { value: string; label: string }[]; today: string | null }) {
  const { award } = l;
  const open = award.status !== "CANCELLED";
  const DETAIL: Record<string, string> = {
    BOND_NOT_DECIDED: "Whether a bond is required is not decided.",
    REASON_NOT_RECORDED: "No bond is required, but the reason is not recorded.",
    NOT_REQUIRED: `No bond required: ${award.bondNotRequiredReason}`,
    BASIS_NOT_SET: "The bond's basis is not set (D4).",
    NOT_VERIFIED: "No verified performance bond covers the required amount.",
    REQUIREMENTS_NOT_SET: "No insurance requirements are configured, so what must be verified is not known.",
  };
  return (
    <div className="flex flex-col gap-6">
      <Card className="overflow-hidden">
        <CardHeader icon={<ShieldIcon size={17} />} title="Conditions precedent to signing" subtitle="All three, cumulatively, before the contract may be signed. Preparation continues while the gate is red; the signature itself arrives with contract formation." actions={<Badge tone={gate.ready ? "ok" : "warn"}>{gate.ready ? "Ready" : "Not ready"}</Badge>} />
        <ul className="divide-y divide-line/70">
          {gate.items.map((i) => (
            <li key={i.key} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 sm:px-6">
              <span className="min-w-0">
                <span className="block text-[13.5px] font-semibold text-ink">{GATE_LABEL[i.key]}</span>
                {i.detail.length > 0 && <span className="block text-[12.5px] break-words text-ink-3">{i.key === "INSURANCE" && i.state === "NOT_MET" ? `Not yet verified: ${i.detail.join(", ")}.` : i.detail.map((d) => DETAIL[d] ?? d).join(" ")}</span>}
              </span>
              <Chip tone={i.state === "MET" ? "ok" : i.state === "NOT_SET" ? "warn" : "err"}>{GATE_STATE_LABEL[i.state]}</Chip>
            </li>
          ))}
        </ul>
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
  const open = !!c && c.status !== "CANCELLED";
  const issuers = f.config.issuers.filter((i) => i.retiredOn == null).map((i) => ({ value: i.id, label: i.name }));
  const months = award.completionUnit === "MONTHS" ? award.completionPeriod : null;
  const derived = derivedAnnualValue(senFromDecimal(award.awardedValue), months);
  const pl = derivedLimit(f.config.bands, senFromDecimal(award.awardedValue));
  const offsets = f.config.expiryOffsets;
  const alert = (d: Date | null) => {
    if (!today) return null;
    const a = expiryAlert(day(d), offsets, today);
    return a.state === "EXPIRED" ? <Chip tone="err">{`Expired ${a.daysAgo} days ago`}</Chip> : a.state === "DUE" ? <Chip tone="warn">{`Expires in ${a.daysLeft} days`}</Chip> : a.state === "NO_EXPIRY" ? <Chip tone="warn">No expiry recorded</Chip> : null;
  };
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader icon={<ShieldIcon size={17} />} title="The performance bond" subtitle="Decided per contract (D4): what it is a percentage of, the percentage and how long it must run. Never defaulted." actions={editable(award.status as AwardStatus).terms ? <EditTermsDrawer id={award.id} values={termsValues} regulatedLabel={f.config.policy.regulatedActivityLabel} label="Edit bond" /> : undefined} />
        <CardBody className="flex flex-col gap-5">
          {award.bondRequired == null ? (
            <Callout tone="warn" title="Not decided">Whether this contract needs a performance bond is not decided. Nothing is assumed.</Callout>
          ) : award.bondRequired === false ? (
            <Callout tone="info" title="No bond required">{award.bondNotRequiredReason || "The reason is not recorded."} {award.bondBasisProvenance && <ProvenanceBadge value={award.bondBasisProvenance} />}</Callout>
          ) : ev.requiredBond.state === "NOT_SET" ? (
            <Callout tone="warn" title="Bond basis not set (D4)">The procedure and the observed award pack give different bases. Choose what this contract&apos;s bond is a percentage of, and the percentage.</Callout>
          ) : null}
          <div className="grid gap-4 md:grid-cols-3">
            <Stat variant="inset" size="sm" tone="neutral" label="Required amount" value={ev.requiredBond.state === "SET" ? formatMoney(ev.requiredBond.amount) : null} hint={award.bondBasis ? `${BOND_BASIS_LABEL[award.bondBasis]}${award.bondPercent ? `, ${pct(award.bondPercent)}` : ""}` : "Basis not set"} />
            <Stat variant="inset" size="sm" tone="neutral" label="One-year value, as entered" value={award.bondBasisAmount && award.bondBasis === "ANNUAL_VALUE" ? money(award.bondBasisAmount) : null} hint={derived ? `Derived from the sum and period: ${formatMoney(derived)}. For comparison only.` : "No derived figure: the period is not in months."} />
            <Stat variant="inset" size="sm" tone="neutral" label="Must run until" value={ev.bondUntil ? formatDate(ev.bondUntil) : null} hint={award.bondValidityExtraMonths != null ? `Completion plus ${award.bondValidityExtraMonths} months.` : "Months past completion not set."} />
          </div>
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
          subtitle={requirements.length ? `Required for this contract: ${requirements.map((r) => r.nameEn).join(", ")}. Workmen's compensation set on: ${award.wcBasis ? WC_BASIS_LABEL[award.wcBasis].toLowerCase() : "not set"}.` : "No insurance requirements are configured, so what must be verified is not known."}
          actions={open ? <LodgePolicyDrawer id={award.id} issuers={issuers} today={today} /> : undefined}
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
                  <span className="block text-[13.5px] font-semibold break-words text-ink">{`${INSURANCE_KIND_LABEL[p.kind]}${p.substitutesFor ? ` in place of the ${INSURANCE_KIND_LABEL[p.substitutesFor].toLowerCase()} policy` : ""} · ${money(p.sumInsured)}`}</span>
                  <span className="block text-[12.5px] break-words text-ink-3">
                    {[p.issuer?.name ?? `${p.issuerNameAsWritten || "Insurer"} (not on the approved list)`, p.policyNo || null, `${formatDate(p.periodStart)} to ${formatDate(p.periodEnd)}`, p.status === "REJECTED" ? `rejected: ${p.rejectedReason}` : p.verifiedBy ? `checked by ${p.verifiedBy.name}, ${formatDate(p.verifiedOn)}` : null].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="flex shrink-0 flex-wrap items-center gap-2">
                  {p.status !== "REJECTED" && alert(p.periodEnd)}
                  <Chip tone={REGISTER_STATUS_TONE[p.status]}>{REGISTER_STATUS_LABEL[p.status]}</Chip>
                  {open && p.status === "LODGED" && <ReviewDrawer id={award.id} targetId={p.id} kind="policy" name={`${INSURANCE_KIND_LABEL[p.kind]} policy`} people={people} today={today} />}
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
};
const ACTION_LABEL = { CREATE: "Created", UPDATE: "Changed", DELETE: "Removed" } as const;
const FIELD_NAME: Record<string, string> = {
  awardeeName: "Awardee",
  awardeeRegistrationNo: "Registration number",
  awardeeAddress: "Address",
  awardedValue: "Awarded value",
  completionPeriod: "Completion period",
  completionUnit: "Counted in",
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
  erpCommitmentNo: "Finance system's number",
  erpCommitmentKind: "Kind",
  indentReceivedOn: "Indent received",
  icNumber: "Identity card number",
  recordedOnBehalf: "Recorded",
  classificationLockedAt: "Classification locked",
};
const MONEY_FIELDS = new Set(["awardedValue", "bondBasisAmount", "ladAmount", "value", "sumInsured", "contractSum", "requiredValue", "appendixAmount", "requiredLimit"]);
const ENUM_TEXT: Record<string, Record<string, string>> = {
  status: { ...AWARD_STATUS_LABEL, PENDING: "In progress", REJECTED: "Refused", RECALLED: "Withdrawn", VERIFIED: "Verified", LODGED: "Lodged", NUMBER_ALLOCATED: "Number allocated" },
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
  const read = (field: string, value: string | null): string => {
    if (value == null || value === "") return "—";
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
                <span className="min-w-0 break-words text-ink-2">{e.entityLabel}</span>
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

