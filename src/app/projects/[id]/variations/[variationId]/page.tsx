import Link from "next/link";
import type { ContractStatus } from "@/lib/contract/types";
import { actStatusFault, actStatusText, statusCalloutTitle } from "@/lib/contract/act-status";
import { notFound } from "next/navigation";

import { EscalateDrawer } from "@/app/approvals/editors";
import { OwnerAttachments } from "@/components/attachments/owner-attachments";
import { ApprovalRouteCard } from "@/components/approval-route-card";
import { ClockIcon, FileIcon, RouteIcon, ScaleIcon, ToolsIcon, WalletIcon } from "@/components/icons";
import { RecordCrumb } from "@/components/shell/record-crumb";
import { Tabs } from "@/components/tabs";
import { Badge, Chip } from "@/components/ui/badge";
import { Blocked } from "@/components/ui/blocked";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { ProvenanceBadge } from "@/components/ui/provenance";
import { KeyValues } from "@/components/ui/stat";
import { isMandatoryAct } from "@/components/ui/act";
import { historyEntityLabel, RECORD_TYPE_WORDS, VARIATION_ENTITIES } from "@/lib/audit/entity-labels";
import { REJECTION_KIND_LABEL } from "@/lib/authority/rejection-labels";
import type { RejectionKind } from "@/lib/authority/rejection";
import { STATUS_WORDS as CERT_WORDS } from "@/lib/certificate/labels";
import { noFormFault } from "@/lib/certificate/form-needs";
import { applyOverrides } from "@/lib/certificate/override";
import { readComputedSnapshot } from "@/lib/certificate/snapshot";
import type { CertificateStatus } from "@/lib/certificate/types";
import { secretariatHoldersOn } from "@/lib/committee/tabling";
import { historyFieldLabel, historyValue } from "@/lib/contract/history-words";
import { contractLabel, loadContract, type LoadedContract } from "@/lib/contract/repo";
import { dayOf, storedDay } from "@/lib/dates";
import { db } from "@/lib/db";
import { decimalText, formatDate, formatOrgDateTime } from "@/lib/format";
import { ACT_DONE_LABEL, ACT_LABEL } from "@/lib/labels";
import { formatMoney, parseSen, senFromDecimal } from "@/lib/money";
import { ORGANISATION_CODE } from "@/lib/org";
import { EXECUTED_STATUSES } from "@/lib/payment/eligibility";
import { loadRoster } from "@/lib/people/load";
import { capacityFor } from "@/lib/supervision/authority";
import { delegationFactsOf, loadSupervision, soOfficeOn } from "@/lib/supervision/load";
import { approvedValue, awaitingChoice, closeFaults, commenceFaults, commencedPending, cumulativeApproved, lastStepFormFault, newSumOf, pendingRoute, pendingValueRoutes, priorValueOf, routeValue, scheduleFormOf, sendFaults, soDecisionFaults, stageOf, submitFaults, type VariationFacts } from "@/lib/variation/application";
import { clockReading, instructionFaults, sketchesLine } from "@/lib/variation/instruction";
import { BASE_WORDS, BASIS_WORDS, CONSENT_WORDS, DIRECTION_WORDS, EVENT_WORDS, EXEMPTION_WORDS, LAST_STEP_REFUSED, ORIGIN_WORDS, RATE_SOURCE_WORDS, SCHEDULE_FORM_WORDS, SO_DECISION_WORDS, STAGE_TONE, STAGE_WORDS, variationFaultText } from "@/lib/variation/labels";
import { adjustmentInProgress, consentOf, disputeOf, factsOf, liveInstructionRow, liveOrderRow, matterFactsOf, orderNetOf, standingMeasurements, type VariationRow } from "@/lib/variation/load";
import { citeStepFaults, matterLineOf, tableStepFaults } from "@/lib/variation/tabling";
import { dayworkFlags, measurementFaults } from "@/lib/variation/measure";
import { orderApprovalFaults, orderFaults } from "@/lib/variation/order";
import { percentLabel, percentLabelText, variationReading, type Reading } from "@/lib/variation/percent";
import { ADJUSTMENT_DIRECTIONS, RATE_SOURCES, SO_DECISIONS, VARIATION_EVENTS, VARIATION_EXEMPTIONS, VARIATION_ORIGINS, type VariationEvent, type VariationExemption } from "@/lib/variation/types";
import { variationView, type VariationView } from "@/lib/variation/view";

import { AdjustmentRefusedCallout } from "../../adjustment-refused";
import {
  ChooseVariationRefusalDrawer,
  CiteCommitteeDrawer,
  CloseVariationDrawer,
  CommenceDrawer,
  DayworkDrawer,
  DecideVariationStepDrawer,
  InstructionDrawer,
  MeasurementDrawer,
  OralLoopDrawer,
  OrderDrawer,
  RemoveMeasurementDrawer,
  SendVariationDrawer,
  SoDecisionDrawer,
  SubmitVariationDrawer,
  TableVariationDrawer,
  VariationRecordDrawer,
  type Option,
} from "../../variation-editors";

export const dynamic = "force-dynamic";

const TONE = { brand: "brand", info: "info", ok: "ok", warn: "warn", err: "err", neutral: undefined } as const;
const day = (d: Date | null | undefined) => (d ? storedDay(d) : null);
const dim = (t: string) => <span className="text-ink-4">{t}</span>;
const say = (fs: readonly { code: string; level: string; data?: Record<string, string | number | null> }[]) => (fs.length ? fs.map((f) => variationFaultText(f as never)).join(" ") : null);
const NOTE_ID = "variation-action-note";
const HISTORY_PAGE = 200;
const yes = (v: boolean | null) => (v == null ? dim("Not answered") : v ? "Yes" : "No");

/**
 * One variation (6.13 Part A step 4, FR-VAR-001–024): its application and the S.O.'s decision, its approvals on their
 * own routes (each step decided here, a committee's step cited from its decision on the matter tabled from here), its
 * instruction and the oral loop, its measured items and daywork, its Variation Order Certificate, and its History.
 * Every refusal shown beside a button is the act's own rule on the same inputs.
 */
export default async function VariationPage(props: PageProps<"/projects/[id]/variations/[variationId]">) {
  const [{ id, variationId }, { tab }] = await Promise.all([props.params, props.searchParams as Promise<{ tab?: string }>]);
  const l = await loadContract(id);
  if (!l) notFound();
  const today = l.org.timeZone ? dayOf(new Date(), l.org.timeZone) : null;
  const vv = await variationView(l, today);
  const v = vv.all.find((x) => x.id === variationId);
  if (!v) notFound();
  const f = factsOf(v);
  const stage = stageOf(f);
  const people = (await db.person.findMany({ where: { organisationId: l.org.id, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } })).map((p) => ({ value: p.id, label: p.name }));
  const title = v.reference ? `Variation ${v.reference}` : "Variation (not yet numbered)";
  const zone = today ? null : "Set the organisation's time zone first.";
  // ADR 0031 (run 1a): the acts' own table, so the page refuses where the act would.
  const statusRefused = actStatusFault("VARIATION", l.contract.status as ContractStatus);
  const cancelled = statusRefused?.code === "CONTRACT_CANCELLED" ? "The contract is cancelled: it is kept as it was." : statusRefused ? actStatusText(statusRefused) : null;
  const blockedBy = zone ?? cancelled;

  // The header's acts, by where it stands, each judged by its act's own rule.
  const s = today ? await loadSupervision(l.contract.id) : null;
  const so = s && today ? await soOfficeOn(l, s, today) : null;
  const cap = (pid: string | null, on: string | null) => (pid && on && s ? capacityFor(pid, { act: "VARIATION_APPLICATION" }, so?.office ?? null, delegationFactsOf(s), on).capacity : null);
  const rep = (c: ReturnType<typeof cap>) => (c ? (c.as === "SO" ? ({ as: "SO" } as const) : ({ as: "DELEGATE", kind: c.kind } as const)) : null);
  const principal = v.principalPersonId && v.principalOn && s ? capacityFor(v.principalPersonId, { principalOrSo: true }, so?.office ?? null, delegationFactsOf(s), day(v.principalOn)!).capacity : null;
  const submitFs = submitFaults({
    status: v.status as "DRAFT",
    fields: { description: v.description, reason: v.reason, estimate: senFromDecimal(v.estimate), exemption: v.exemption as VariationExemption | null, periodImplication: v.periodImplication, agreedRateExists: v.agreedRateExists, funderConsentRequired: v.funderConsentRequired },
    origin: { origin: v.origin as "DEPARTMENT", originatorCapacity: v.origin === "SO_REPRESENTATIVE" ? rep(cap(v.originatorPersonId, today)) : null, reviewerCapacity: rep(cap(v.reviewedByPersonId, day(v.reviewedOn))), reviewRecorded: !!v.reviewedByPersonId && !!v.reviewedOn, allocationConfirmed: v.allocationConfirmed, principalRecorded: !!principal },
  });
  // Run 3 residual M1: with an issued adjustment unreadable, nothing is read over the issued adjustments (said above).
  const readingNow = (event: VariationEvent, value: bigint) => (vv.original == null || vv.refused ? null : variationReading({ basis: vv.policy?.variationPctBasis ?? null, base: vv.policy?.variationBase ?? null, original: vv.original, adjustments: vv.issued.map((a) => a.net), cumulativeApproved: cumulativeApproved(vv.facts, v.id), event, value, approvedSoFar: approvedValue(f) }));
  const priorReading = v.exemption == null ? readingNow("PRIOR", priorValueOf(f)) : null;
  const submitBlocker = blockedBy ?? vv.refused?.message ?? say([...submitFs, ...(priorReading && !priorReading.ok ? priorReading.faults : [])]);
  const destinationSet = !!(await db.rejectionDestination.findFirst({ where: { organisationId: l.org.id, domain: "vo", kind: { in: ["RETURN_TO_ORIGINATOR", "TERMINATE"] } }, select: { id: true } }));

  let action: React.ReactNode = null;
  let note: string | null = null;
  if (stage === "DRAFT") {
    note = submitBlocker;
    action = <SubmitVariationDrawer id={l.contract.id} variationId={v.id} exempt={v.exemption != null} blocker={submitBlocker} />;
  } else if (stage === "WITH_SO") {
    const fs = today ? soDecisionFaults({ status: "SUBMITTED", exemption: null, decision: "SUPPORTED", cap: null, estimate: f.estimate, note: "", decidedOn: today, submittedOn: day(v.submittedOn), today }) : [];
    note = blockedBy ?? say(fs);
    action = <SoDecisionDrawer id={l.contract.id} variationId={v.id} people={people} decisions={SO_DECISIONS.map((d) => ({ value: d, label: SO_DECISION_WORDS[d].en }))} today={today} destinationSet={destinationSet} blocker={note} />;
  }
  const closeBlocker = blockedBy ?? say(closeFaults({ v: f, reason: "a reason" }));
  const editValues = { variationId: v.id, origin: v.origin, originatorPersonId: v.originatorPersonId, description: v.description, reason: v.reason, estimate: v.estimate.toString(), exemption: v.exemption, periodImplication: v.periodImplication == null ? null : v.periodImplication ? "yes" : "no", agreedRateExists: v.agreedRateExists == null ? null : v.agreedRateExists ? "yes" : "no", funderConsentRequired: v.funderConsentRequired == null ? null : v.funderConsentRequired ? "yes" : "no", reviewedByPersonId: v.reviewedByPersonId, reviewedOn: day(v.reviewedOn), reviewNote: v.reviewNote, allocationConfirmed: v.allocationConfirmed == null ? null : v.allocationConfirmed ? "yes" : "no", allocationNote: v.allocationNote, principalPersonId: v.principalPersonId, principalOn: day(v.principalOn) };

  // History: the variation's own rows and everything under it.
  const ids = [v.id, ...v.approvals.flatMap((a) => [a.approvalInstance.id, ...a.approvalInstance.steps.map((x) => x.id)]), ...v.instructions.map((x) => x.id), ...v.measurements.map((x) => x.id), ...v.dayworkRecords.map((x) => x.id), ...v.orders.map((x) => x.id)];
  // A matter tabled from it: its tabling, as the variation's act wrote it (under the contract's label). What the sitting
  // then did with it (votes, outcome) is the committee's History, read on the sitting's own page.
  const historyWhere = { organisationId: l.org.id, OR: [{ entityId: { in: ids } }, { entityId: { in: v.matters.map((m) => m.id) }, entityLabel: { startsWith: `${contractLabel({ number: l.contract.number, award: { awardeeName: l.award.awardeeName } })} ·` } }] };
  const [history, historyTotal] = await Promise.all([
    db.auditEntry.findMany({ where: historyWhere, orderBy: { at: "desc" }, take: HISTORY_PAGE }),
    db.auditEntry.count({ where: historyWhere }),
  ]);

  const tabs = [
    { id: "application", label: "Application", icon: <FileIcon size={15} />, panel: <ApplicationPanel l={l} v={v} f={f} vv={vv} people={people} today={today} priorReading={priorReading} editBlocker={blockedBy ?? (v.status !== "DRAFT" ? say([{ code: "NOT_DRAFT", level: "block", data: { status: v.status } }]) : null)} editValues={editValues} /> },
    { id: "approval", label: "Approval", icon: <RouteIcon size={15} />, count: v.approvals.length, panel: <ApprovalPanel l={l} v={v} f={f} vv={vv} people={people} today={today} blockedBy={blockedBy} /> },
    { id: "instruction", label: "Instruction", icon: <ToolsIcon size={15} />, count: v.instructions.length + v.dayworkRecords.length, panel: <InstructionPanel l={l} v={v} f={f} vv={vv} people={people} today={today} blockedBy={blockedBy} /> },
    { id: "measurement", label: "Measurement", icon: <ScaleIcon size={15} />, count: v.measurements.filter((m) => !m.removedAt).length, panel: <MeasurementPanel l={l} v={v} people={people} today={today} blockedBy={blockedBy} /> },
    { id: "order", label: "Certificate", icon: <WalletIcon size={15} />, count: v.orders.length, panel: <OrderPanel l={l} v={v} f={f} vv={vv} people={people} blockedBy={blockedBy} /> },
    { id: "history", label: "History", icon: <ClockIcon size={15} />, count: historyTotal, panel: <HistoryPanel entries={history} total={historyTotal} timeZone={l.org.timeZone} /> },
  ];

  return (
    <>
      <RecordCrumb label={title} parent={l.contract.number} />
      <PageHeader
        eyebrow={<Link href={`/projects/${l.contract.id}?tab=variations`}>{`Contract ${l.contract.number}`}</Link>}
        title={title}
        badge={<Badge tone={TONE[STAGE_TONE[stage]]} dot>{STAGE_WORDS[stage].en}</Badge>}
        subtitle={v.description}
        meta={[
          `Estimate ${formatMoney(f.estimate)}`,
          v.exemption ? `Exempt: ${EXEMPTION_WORDS[v.exemption as VariationExemption].en.toLowerCase()}` : approvedValue(f) > 0n ? `Approved ${formatMoney(approvedValue(f))}` : "Not approved",
          ORIGIN_WORDS[v.origin as "DEPARTMENT"].en,
          l.award.awardeeName,
        ]}
        actionsNote={note ?? undefined}
        actionsNoteId={NOTE_ID}
        actions={
          <span className="flex flex-wrap items-center gap-2">
            {action}
            {stage !== "CLOSED" && stage !== "CERTIFIED" && stage !== "INSTRUCTED" && <CloseVariationDrawer id={l.contract.id} variationId={v.id} people={people} blocker={closeBlocker} />}
          </span>
        }
      />
      <div className="mb-6 flex flex-col gap-3">
        {!today && <Callout tone="warn" title="The organisation's time zone is not set">Every act on a variation records the organisation&apos;s day: none is assumed to be UTC.</Callout>}
        {vv.refused && <AdjustmentRefusedCallout l={l} refused={vv.refused} />}
        {statusRefused?.code === "CONTRACT_CANCELLED" && <Callout tone="warn" title="The contract is cancelled">Its variations are kept as they were; nothing more is recorded on them.</Callout>}
        {statusRefused && statusRefused.code !== "CONTRACT_CANCELLED" && <Callout tone="warn" title={statusCalloutTitle(l.contract.status as ContractStatus).en}>{actStatusText(statusRefused)}</Callout>}
        {stage === "CLOSED" && <Callout tone="warn" title="Closed">{`${v.closedReason} (${formatDate(day(v.closedOn))}).`}</Callout>}
        {commencedPending(f) && <Callout tone="warn" title="Commenced pending approval">{`Work commenced on ${formatDate(day(v.commencedOn))} on the support of ${v.commencedSupport?.name ?? "the S.O."}. Its estimate (${formatMoney(f.estimate)}) is in the contract's exposure until it is approved, and its work is not valued until then.`}</Callout>}
        {!EXECUTED_STATUSES.includes(l.contract.status) && <Callout tone="info" title="The contract is not executed">{variationFaultText({ code: "NOT_EXECUTED", level: "block" })}</Callout>}
      </div>
      <Tabs initial={tab} label="Variation" tabs={tabs} />
    </>
  );
}

type PanelProps = { l: LoadedContract; v: VariationRow; f: VariationFacts; vv: VariationView; people: Option[]; today: string | null };

// ------------------------------------------------------------------ application

function ApplicationPanel({ l, v, f, vv, people, priorReading, editBlocker, editValues }: PanelProps & { priorReading: ReturnType<typeof variationReading> | null; editBlocker: string | null; editValues: Record<string, string | null> }) {
  const cumulative = cumulativeApproved(vv.facts, v.id);
  const reading = priorReading?.ok ? priorReading.reading : null;
  const den = reading ? BigInt(reading.den) : null;
  const value = priorValueOf(f);
  const appCert = v.applicationCertificate;
  const frozen = v.applicationReading != null;
  // Once sent, the figures shown are the ones frozen with the route (the application is opened from them), never re-read.
  const snap = frozen ? readComputedSnapshot(v.applicationReading) : null;
  const fig = snap ? applyOverrides(snap, []) : null;
  const shown = (k: string) => {
    const x = fig ? [...fig.lines, ...fig.totals].find((y) => y.key === k) : null;
    if (!x || x.value == null) return null;
    return "type" in x && x.type === "TEXT" ? x.value : formatMoney(parseSen(x.value));
  };
  const frozenFigures = fig
    ? [
        { label: "This variation, as sent for approval", value: shown("thisVariation") },
        { label: "Its percentage", value: shown("thisPct") },
        { label: "Cumulative approved variations then", value: shown("cumulative") },
        { label: "Cumulative percentage, with this variation", value: shown("cumulativePct") },
        { label: "New contract sum including this variation", value: shown("newSum") },
        { label: "The percentage's basis", value: shown("basis") },
      ].filter((x) => x.value != null)
    : null;
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          icon={<FileIcon size={17} />}
          title="The application"
          subtitle="What the variation is, why, its estimate and the answers its path needs. The number, the percentage, the cumulative and the new contract sum are worked out, never typed."
          actions={v.status === "DRAFT" ? <VariationRecordDrawer id={l.contract.id} people={people} origins={VARIATION_ORIGINS.map((o) => ({ value: o, label: ORIGIN_WORDS[o].en }))} exemptions={VARIATION_EXEMPTIONS.map((e) => ({ value: e, label: EXEMPTION_WORDS[e].en }))} values={editValues} blocker={editBlocker} /> : undefined}
        />
        <CardBody>
          <KeyValues
            columns={2}
            items={[
              { label: "Number", value: v.reference ?? dim("Given when it is submitted") },
              { label: "Originated by", value: `${v.originatorName} (recorded on their behalf, not signed)` },
              { label: "Its path", value: ORIGIN_WORDS[v.origin as "DEPARTMENT"].en },
              ...(v.origin === "DEPARTMENT" ? [{ label: "Reviewed by an S.O.'s Representative", value: v.reviewedBy ? `${v.reviewedBy.name}, ${formatDate(day(v.reviewedOn))}${v.reviewNote ? `: ${v.reviewNote}` : ""}` : dim("Not reviewed yet") }] : []),
              { label: "Allocation confirmed (a Specialist representative)", value: v.allocationConfirmed == null ? dim("Not answered") : `${v.allocationConfirmed ? "Yes" : "No"}${v.allocationNote ? `: ${v.allocationNote}` : ""}` },
              { label: "Passed through a Principal Representative", value: v.principal ? `${v.principal.name}, ${formatDate(day(v.principalOn))}` : dim("Not recorded") },
              { label: "Reason it is done as a variation", value: v.reason },
              { label: "Estimated amount", value: formatMoney(f.estimate) },
              { label: "Exempt from prior approval", value: v.exemption ? EXEMPTION_WORDS[v.exemption as VariationExemption].en : "No" },
              { label: "Implies a change to the contract period", value: yes(v.periodImplication) },
              { label: "A negotiated agreed rate exists", value: yes(v.agreedRateExists) },
              { label: "Affects a funder's assets", value: yes(v.funderConsentRequired) },
            ]}
          />
        </CardBody>
      </Card>
      {v.exemption == null && (
        <Card>
          <CardHeader icon={<ScaleIcon size={17} />} title="Its percentage and the new contract sum" subtitle={frozen ? "As frozen when it was sent for prior approval: the application is opened from these figures when its approval is approved." : "As they would be read now. They are frozen with its route when it is sent for prior approval."} />
          <CardBody>
            {frozenFigures ? (
              <KeyValues columns={2} items={frozenFigures.map((x) => ({ label: x.label, value: x.value }))} />
            ) : !priorReading || !priorReading.ok ? (
              <p className="text-[13px] text-amber-800">{priorReading ? say(priorReading.faults) : "No baseline is in force today."}</p>
            ) : (
              <KeyValues
                columns={2}
                items={[
                  { label: "This variation (at the S.O.'s cap where set)", value: formatMoney(value) },
                  { label: "Its percentage", value: <span className="flex flex-col items-start gap-1"><span>{`${percentLabelText(percentLabel({ num: value, den: den! }, vv.edges)).en} of ${formatMoney(den!)}`}</span><span className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-ink-3">{`${BASIS_WORDS[reading!.basis].en}, over ${BASE_WORDS[reading!.base].en.toLowerCase()}`}<ProvenanceBadge value={vv.policy?.variationProvenance ?? null} /></span></span> },
                  { label: "Cumulative approved, the others", value: `${formatMoney(cumulative)}, ${percentLabelText(percentLabel({ num: cumulative + value, den: den! }, vv.edges)).en} with this one` },
                  { label: "New contract sum including this variation", value: vv.original == null ? dim("No baseline") : formatMoney(newSumOf(vv.original, cumulative, value)) },
                ]}
              />
            )}
          </CardBody>
        </Card>
      )}
      <Card>
        <CardHeader icon={<ToolsIcon size={17} />} title="The S.O.'s decision" subtitle="Supported (with a cap where given) or not supported, with the reason. A variation exempt from prior approval goes straight to the instruction." />
        <CardBody>
          <KeyValues
            columns={2}
            items={[
              { label: "Decision", value: v.exemption ? "Not asked: exempt from prior approval" : v.soDecision ? `${SO_DECISION_WORDS[v.soDecision as "SUPPORTED"].en}${v.soDecisionCap ? `, up to ${formatMoney(senFromDecimal(v.soDecisionCap))}` : ""}` : dim("Not decided yet") },
              { label: "By", value: v.soDecidedBy ? `${v.soDecidedBy.name}, ${formatDate(day(v.soDecidedOn))} (recorded on their behalf, not signed)` : dim("—") },
              { label: "Note", value: v.soDecisionNote || dim("None") },
              { label: "The application (certificate)", value: appCert ? <Link className="font-medium text-brand-700 underline" href={`/projects/${l.contract.id}/certificates/${appCert.id}`}>{`${appCert.number ?? "Draft"} · ${CERT_WORDS[appCert.status as CertificateStatus].en}`}</Link> : dim(v.exemption ? "None: exempt" : "Opened when its prior approval is approved") },
            ]}
          />
        </CardBody>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ approval

async function ApprovalPanel({ l, v, f, vv, people, today, blockedBy }: PanelProps & { blockedBy: string | null }) {
  const order = liveOrderRow(v);
  const orderNet = order && order.certificate.status !== "ISSUED" ? orderNetOf(order) : null;
  const others = pendingValueRoutes(vv.facts, v.id);
  const blocking = vv.policy?.variationPctBasis === "CUMULATIVE" && others.length ? `Variation ${vv.all.find((x) => x.id === others[0].variationId)?.reference ?? ""}` : null;
  const adj = vv.policy?.variationBase === "REVISED" ? adjustmentInProgress(vv.adjustments) : null;
  // Each approval, judged by the send act's own rule (the amount at agreed rates is keyed in the drawer).
  const judged = VARIATION_EVENTS.map((e) => {
    const value = routeValue(f, e, e === "AGREED_RATE" ? 1n : null, orderNet);
    const fs = sendFaults({ v: f, event: e, value, cumulativeBlockedBy: blocking, adjustmentInProgress: adj ? `The adjustment of the contract sum${adj.certificate.number ? ` ${adj.certificate.number}` : ""}` : null, orderNet, applicationTemplateId: vv.formOf("VARIATION_APPLICATION") });
    return { e, fs };
  });
  const open = judged.filter((x) => x.fs.length === 0);
  const sendBlocker = blockedBy ?? vv.refused?.message ?? (open.length ? null : say(judged.find((x) => x.e === (v.exemption === "REMEASUREMENT" ? "REMEASUREMENT" : "PRIOR"))!.fs));
  const pend = pendingRoute(f);
  const choice = awaitingChoice(f);
  const consent = consentOf(v);
  const roster = today ? await loadRoster(ORGANISATION_CODE) : null;
  const sittingsFor = async (committeeId: string | null, code: string | null) => {
    if (!committeeId && !code) return { sittings: [] as Option[], tablers: [] as Option[] };
    const c = await db.committee.findFirst({ where: { organisationId: l.org.id, ...(committeeId ? { id: committeeId } : { code: code! }) }, select: { id: true, secretariatRoleCode: true, nameEn: true } });
    if (!c) return { sittings: [], tablers: [] };
    const ms = await db.meeting.findMany({ where: { committeeId: c.id, status: { in: ["SCHEDULED", "IN_PROGRESS"] } }, orderBy: { meetingDate: "asc" }, select: { id: true, reference: true, meetingDate: true } });
    return { sittings: ms.map((m) => ({ value: m.id, label: `${m.reference}, ${formatDate(day(m.meetingDate))}` })), tablers: roster ? secretariatHoldersOn(roster, c.secretariatRoleCode, today).map((p) => ({ value: p.id, label: p.name })) : [] };
  };
  const roles = await db.authorityRole.findMany({ where: { organisationId: l.org.id }, select: { code: true, nameEn: true } });
  const routes = [...v.approvals].reverse();
  const cards = await Promise.all(
    routes.map(async (a, n) => {
      const inst = a.approvalInstance;
      const reading = a.reading as unknown as Reading;
      const pendingCommittee = inst.status === "PENDING" ? inst.steps.find((st) => st.decision === "PENDING" && st.committeeCode) : null;
      const t = pendingCommittee ? await sittingsFor(null, pendingCommittee.committeeCode) : null;
      const matters = (code: string | null) => v.matters.filter((m) => !m.withdrawnAt && m.domain === inst.domain && m.meeting.committee.code === code).map((m) => ({ value: m.id, label: `${m.meeting.reference}: ${m.outcome === "PENDING" ? "not decided yet" : m.outcome === "DEFERRED" ? "deferred" : m.outcome === "CARRIED" ? "carried" : "not carried"}` }));
      const stepAction = (routeId: string, sequence: number) => {
        const st = inst.steps.find((x) => x.sequence === sequence);
        if (!st || inst.status !== "PENDING" || st.decision !== "PENDING" || blockedBy || routeId !== inst.id) return null;
        const earlierDone = inst.steps.filter((x) => x.sequence < st.sequence).every((x) => x.decision === "DONE");
        if (!earlierDone) return <Blocked label="Record decision" reason="Steps are decided in order: the step before is not done." />;
        if (st.committeeCode) {
          const ms = matters(st.committeeCode);
          return (
            <span className="flex flex-wrap items-center gap-2">
              {t && <TableVariationDrawer id={l.contract.id} variationId={v.id} purpose="STEP" sittings={t.sittings} tablers={t.tablers} label="Table it" blocker={say(tableStepFaults(matterFactsOf(v), inst.domain, st.committeeCode)) ?? (t.sittings.length ? null : "No sitting of the committee takes matters now: schedule one under Committees.")} />}
              {citeStepFaults(matterFactsOf(v), inst.domain, st.committeeCode).length ? <Blocked label="Cite the decision" reason={say(citeStepFaults(matterFactsOf(v), inst.domain, st.committeeCode))!} /> : <CiteCommitteeDrawer id={l.contract.id} variationId={v.id} stepId={st.id} committee={st.actingRoleLabel ?? st.roleLabel} matters={ms} />}
            </span>
          );
        }
        return (
          <span className="flex flex-wrap items-center gap-2">
            {st.roleCode && <EscalateDrawer stepId={st.id} office={st.actingRoleLabel ?? st.roleLabel} mandatory={isMandatoryAct(st.act)} people={people} />}
            <DecideVariationStepDrawer id={l.contract.id} variationId={v.id} stepId={st.id} roleLabel={st.actingRoleLabel ?? st.roleLabel} act={ACT_LABEL[st.act] ?? "Acts"} done={ACT_DONE_LABEL[st.act] ?? "Done"} people={people} today={today} />
          </span>
        );
      };
      // BD-613-110: a waiting prior approval whose last step would be refused for want of the application's form, by the
      // act's own rule on the same setting, said before anyone decides it.
      const noForm = inst.status === "PENDING" ? lastStepFormFault(a.event as VariationEvent, vv.formOf("VARIATION_APPLICATION")) : null;
      const extra = (
        <CardBody className="border-b border-line/70">
          {noForm && <Callout tone="warn" className="mb-2">{`${LAST_STEP_REFUSED.en} ${variationFaultText(noForm)}`}</Callout>}
          <p className="text-[12.5px] break-words text-ink-3">{`${EVENT_WORDS[a.event as VariationEvent].en}: ${formatMoney(senFromDecimal(a.value))}, read as ${vv.labelOf(reading, inst.domain).en} of ${formatMoney(BigInt(reading.den))} (${BASIS_WORDS[reading.basis].en.toLowerCase()}, over ${BASE_WORDS[reading.base].en.toLowerCase()}), ${vv.labelOf(reading, inst.domain).frozen ? "frozen when sent" : "sent"} ${formatDate(day(a.sentOn))} by ${a.sentBy.name} (recorded on their behalf, not signed).${vv.labelOf(reading, inst.domain).frozen ? "" : " Its percentage was not frozen with it (sent before labels were): read now on the issued matrix's rows, without any funding override."}`}</p>
          {v.matters.filter((m) => m.domain === inst.domain).map((m) => {
            // Acceptance S-1: the outcome only, linked to the sitting; members' votes stay on its decision record.
            const x = matterLineOf(m);
            return <p key={m.id} className="mt-1 text-[12.5px] break-words text-ink-3">Tabled at <Link className="font-medium text-brand-700 hover:underline" href={x.href}>{x.reference}</Link>{` (${x.committee}): ${x.outcome}.`}</p>;
          })}
        </CardBody>
      );
      return <ApprovalRouteCard key={inst.id} route={inst} title={`${EVENT_WORDS[a.event as VariationEvent].en}${routes.length > 1 && n > 0 ? " (earlier)" : ""}`} stepAction={stepAction} officeName={(code) => roles.find((x) => x.code === code)?.nameEn ?? null} extra={extra} />;
    }),
  );
  const consentCommittee = vv.policy?.funderConsentCommitteeId ?? null;
  const ct = v.funderConsentRequired ? await sittingsFor(consentCommittee, null) : null;
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          icon={<RouteIcon size={17} />}
          title="Its approvals"
          subtitle={v.exemption ? `Exempt from prior approval (${EXEMPTION_WORDS[v.exemption as VariationExemption].en.toLowerCase()}): no committee and no approval tiers${v.exemption === "REMEASUREMENT" ? "; the re-measurement itself is approved on its own route at its certificate's value" : ""}.` : "Each approval on its own route on the approval matrix: prior approval to instruct it, an increase of its approved value, the use of rates not in the contract. A committee's recommendation or approval on a route is a committee's step: tabled from here and cited from its decision."}
          actions={<SendVariationDrawer id={l.contract.id} variationId={v.id} events={open.map((x) => ({ value: x.e, label: EVENT_WORDS[x.e].en }))} people={people} blocker={sendBlocker} label="Send for approval" />}
        />
        <CardBody>
          <KeyValues
            columns={2}
            items={[
              { label: "Waiting for a decision", value: pend ? EVENT_WORDS[pend.event].en : dim("Nothing") },
              { label: "Approved value (prior approval and increases)", value: approvedValue(f) > 0n ? formatMoney(approvedValue(f)) : dim("None") },
              { label: "Funder's consent", value: v.funderConsentRequired ? <span className="flex flex-col items-start gap-1"><span>{`${CONSENT_WORDS[consent.state].en.charAt(0).toUpperCase()}${CONSENT_WORDS[consent.state].en.slice(1)}`}{consent.matter && <>{" ("}<Link className="font-medium text-brand-700 hover:underline" href={matterLineOf(consent.matter).href}>{consent.matter.meeting.reference}</Link>{`, ${matterLineOf(consent.matter).outcome})`}</>}</span>{ct && consent.state !== "PENDING" && consent.state !== "CARRIED" && <TableVariationDrawer id={l.contract.id} variationId={v.id} purpose="CONSENT" sittings={ct.sittings} tablers={ct.tablers} label="Table it for consent" blocker={blockedBy ?? (!consentCommittee ? variationFaultText({ code: "FUNDER_COMMITTEE_NOT_SET", level: "block" }) : !ct.sittings.length ? "No sitting of the committee takes matters now: schedule one under Committees." : v.status !== "SUPPORTED" ? variationFaultText({ code: "NOT_SUPPORTED_YET", level: "block" }) : null)} />}</span> : v.funderConsentRequired === false ? "Not needed" : dim("Not answered") },
            ]}
          />
        </CardBody>
      </Card>
      {choice && (
        <Callout tone="warn" title="Refused: where it goes is the officer's choice" action={<ChooseVariationRefusalDrawer id={l.contract.id} variationId={v.id} offered={choice.choices.map((k) => ({ value: k, label: REJECTION_KIND_LABEL[k as RejectionKind] }))} steps={(v.approvals.find((a) => a.approvalInstance.id === choice.id)?.approvalInstance.steps ?? []).filter((x) => x.decision !== "REJECTED").map((x) => ({ value: String(x.sequence), label: `${x.sequence}. ${x.roleLabel}` }))} people={people} />}>
          Nothing configured decides where a refused variation goes, so the officer chooses: back to whoever sent it (it may be sent again), back to an earlier step, or the variation ends.
        </Callout>
      )}
      {cards.length === 0 ? <Card><EmptyState size="sm" title="Not sent for approval yet">{v.exemption ? "An exempt variation needs no prior approval." : "Sent once the S.O. supports it."}</EmptyState></Card> : cards}
    </div>
  );
}

// ------------------------------------------------------------------ instruction

function InstructionPanel({ l, v, f, vv, people, today, blockedBy }: PanelProps & { blockedBy: string | null }) {
  const ins = liveInstructionRow(v);
  const form = scheduleFormOf(v.agreedRateExists, { withAgreedRate: vv.policy?.scheduleFormAgreedRate ?? null, withoutAgreedRate: vv.policy?.scheduleFormNoAgreedRate ?? null });
  const insBlocker = blockedBy ?? (today ? say(instructionFaults({ v: f, funderConsentRequired: v.funderConsentRequired, consent: consentOf(v).state, agreedRateExists: v.agreedRateExists, scheduleForm: form, description: v.description, oralIssuedOn: null, today })) : null) ?? (!vv.formSet("SO_INSTRUCTION") ? variationFaultText(noFormFault("SO_INSTRUCTION")) : null);
  const commenceBlocker = blockedBy ?? (today ? say(commenceFaults({ v: f, on: today, today, soDecidedOn: day(v.soDecidedOn), supporterCapable: true })) : null);
  const confirm = ins ? clockReading(day(ins.confirmDueOn), day(ins.contractorConfirmedOn)) : null;
  const objection = ins ? clockReading(day(ins.objectionDueOn), day(ins.objectedOn)) : null;
  const clockText = (c: ReturnType<typeof clockReading> | null) => (!c ? null : c.state === "NOT_SET" ? "Clock not set (advisory)" : c.state === "OPEN" ? `Due by ${formatDate(c.due)}` : `${c.late ? "Late" : "On time"}: due by ${formatDate(c.due)}, on ${formatDate(c.on)}`);
  const instructed = v.instructions.some((i) => i.certificate.status === "ISSUED");
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader icon={<ToolsIcon size={17} />} title="The S.O.'s instruction" subtitle="Never before the variation's approval (or its exemption) and the funder's consent where it needs one. Dated by the S.O.'s signature on its page." actions={!ins && v.status === "SUPPORTED" ? <InstructionDrawer id={l.contract.id} variationId={v.id} description={v.description} people={people} blocker={insBlocker} /> : undefined} />
        <CardBody>
          {ins ? (
            <KeyValues
              columns={2}
              items={[
                { label: "Certificate", value: <Link className="font-medium text-brand-700 underline" href={`/projects/${l.contract.id}/certificates/${ins.certificate.id}`}>{`${ins.certificate.number ?? "Not yet numbered"} · ${CERT_WORDS[ins.certificate.status as CertificateStatus].en}`}</Link> },
                { label: "Dated", value: ins.certificate.certificateDate ? formatDate(day(ins.certificate.certificateDate)) : dim("When the S.O. signs") },
                { label: "Description (the heading every item is measured under)", value: ins.description },
                { label: "Schedule form", value: SCHEDULE_FORM_WORDS[ins.scheduleForm].en },
                // Acceptance S-2 (FR-VAR-015): its plans or sketches, attached below through the document store; not required at issue.
                { label: "Plans or sketches", value: ins.attachments.length ? sketchesLine(ins.attachments.map((a) => ({ title: a.version.document.title, versionNo: a.version.versionNo }))).en : dim(sketchesLine([]).en) },
                { label: "First given orally", value: ins.oralIssuedOn ? formatDate(day(ins.oralIssuedOn)) : "No: written" },
                ...(ins.oralIssuedOn ? [{ label: "The contractor's written confirmation", value: `${clockText(confirm)}${ins.confirmationMatches == null ? "" : ins.confirmationMatches ? "; it matches the instruction intended" : "; it does not match"}` }, { label: "An objection", value: ins.objectedOn ? `${clockText(objection)}: ${ins.objectionNote}` : ins.contractorConfirmedOn ? (clockText(objection) ?? dim("None")) : dim("Not before the confirmation") }] : []),
              ]}
            />
          ) : (
            <p className="text-[13px] text-ink-3">{v.status === "SUPPORTED" ? (insBlocker ? insBlocker : "Not raised yet.") : "Not yet: it follows the variation's approval (or exemption)."}</p>
          )}
          {ins?.oralIssuedOn && <div className="mt-3"><OralLoopDrawer id={l.contract.id} variationId={v.id} values={{ contractorConfirmedOn: day(ins.contractorConfirmedOn), confirmationMatches: ins.confirmationMatches == null ? null : ins.confirmationMatches ? "yes" : "no", objectedOn: day(ins.objectedOn), objectionNote: ins.objectionNote }} /></div>}
        </CardBody>
      </Card>
      {ins && (
        <OwnerAttachments
          owner={{ kind: "variationInstruction", id: ins.id }}
          title="Plans and sketches"
          subtitle="Attached to the S.O.'s instruction through the document store, when it is issued or after. Not required at issue."
          only={["INSTRUCTION_SKETCH"]}
          required={{ INSTRUCTION_SKETCH: false }}
          statuses={{ INSTRUCTION_SKETCH: { text: sketchesLine([]).en, tone: "neutral" } }}
        />
      )}
      {v.exemption == null && v.status === "SUPPORTED" && !v.commencedOn && stageOf(f) !== "APPROVED" && (
        <Card>
          <CardHeader icon={<ClockIcon size={17} />} title="Commenced pending approval" subtitle="Work may proceed on the support of the S.O. or an S.O.'s Representative while the approval is obtained; it is listed with its estimate and age until approved." actions={<CommenceDrawer id={l.contract.id} variationId={v.id} people={people} today={today} blocker={commenceBlocker} />} />
        </Card>
      )}
      <Card className="overflow-hidden">
        <CardHeader icon={<ClockIcon size={17} />} title="Daywork" subtitle="Labour and plant time checked and agreed with the contractor the same day; the substantiation's clock read when each record is made." actions={<DayworkDrawer id={l.contract.id} variationId={v.id} people={people} today={today} blocker={blockedBy ?? (instructed ? null : variationFaultText({ code: "INSTRUCTION_NOT_ISSUED", level: "block" }))} />} divided={v.dayworkRecords.length > 0} />
        {v.dayworkRecords.length === 0 ? (
          <EmptyState size="sm" title="None recorded">Daywork is recorded once the instruction is issued.</EmptyState>
        ) : (
          <ul className="divide-y divide-line/70">
            {v.dayworkRecords.map((d) => {
              const fl = today ? dayworkFlags({ workedOn: storedDay(d.workedOn), agreedOn: day(d.agreedOn), substantiationDueOn: day(d.substantiationDueOn), substantiationReceivedOn: day(d.substantiationReceivedOn) }, today) : null;
              return (
                <li key={d.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-start sm:justify-between sm:px-6">
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2 text-[13.5px] font-semibold break-words text-ink">
                      {formatDate(storedDay(d.workedOn))}
                      {fl?.notAgreedSameDay && <Chip tone="warn">Not agreed the same day</Chip>}
                      {fl?.substantiation.state === "RECEIVED" && fl.substantiation.late && <Chip tone="warn">Substantiation late</Chip>}
                      {fl?.substantiation.state === "OPEN" && fl.substantiation.overdue && <Chip tone="err">Substantiation overdue</Chip>}
                    </span>
                    <span className="block text-[12.5px] break-words text-ink-3">{`${d.description} · ${d.agreedOn ? `agreed ${formatDate(day(d.agreedOn))} with ${d.agreedWith}` : "not agreed"} · ${fl?.substantiation.state === "NOT_SET" ? "substantiation clock not set" : d.substantiationReceivedOn ? `substantiation received ${formatDate(day(d.substantiationReceivedOn))}` : `substantiation due by ${formatDate(day(d.substantiationDueOn))}`} · recorded for ${d.person.name}`}</span>
                  </span>
                  <DayworkDrawer id={l.contract.id} variationId={v.id} people={people} today={today} values={{ dayworkId: d.id, workedOn: storedDay(d.workedOn), description: d.description, agreedOn: day(d.agreedOn), agreedWith: d.agreedWith, substantiationReceivedOn: day(d.substantiationReceivedOn) }} blocker={blockedBy} />
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ measurement

function MeasurementPanel({ l, v, people, today, blockedBy }: { l: LoadedContract; v: VariationRow; people: Option[]; today: string | null; blockedBy: string | null }) {
  const ins = liveInstructionRow(v);
  const orderLive = !!liveOrderRow(v);
  const pre = measurementFaults({ instruction: { description: ins?.description ?? "", issued: ins?.certificate.status === "ISSUED" }, orderLive, heading: ins?.description ?? "", itemRef: "item", measuredRefs: [], rateSource: "CONTRACT_RATE", bqItemRef: "item", agreedRateApproved: true, quantity: 1n, baseRate: 0n, adjustmentTt: null, coveredUp: false, recordsNote: "", measuredOn: today ?? "", today: today ?? "" }).filter((x) => x.code === "INSTRUCTION_NOT_ISSUED" || x.code === "ORDER_RAISED");
  const blocker = blockedBy ?? say(pre);
  const items = ins ? v.measurements.filter((m) => m.instructionId === ins.id) : [];
  const standing = ins ? standingMeasurements(v, ins.id) : [];
  const total = standing.reduce((a, m) => a + (m.direction === "ADDITION" ? 1n : -1n) * senFromDecimal(m.amount), 0n);
  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<ScaleIcon size={17} />}
        title="Measured items"
        subtitle={ins ? `Under the instruction's heading, “${ins.description}”, one item each, never merged. Net so far ${formatMoney(total)}.` : "Measured under the instruction once it is issued."}
        actions={<MeasurementDrawer id={l.contract.id} variationId={v.id} heading={ins?.description ?? ""} people={people} sources={RATE_SOURCES.map((x) => ({ value: x, label: RATE_SOURCE_WORDS[x].en }))} directions={ADJUSTMENT_DIRECTIONS.map((x) => ({ value: x, label: DIRECTION_WORDS[x].en }))} today={today} blocker={blocker} />}
        divided={items.length > 0}
      />
      {items.length === 0 ? (
        <EmptyState size="sm" title="Nothing measured">{ins ? "Measure each item as the work is executed; work to be covered up, with detailed records." : "No instruction issued yet."}</EmptyState>
      ) : (
        <ul className="divide-y divide-line/70">
          {items.map((m) => (
            <li key={m.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-start sm:justify-between sm:px-6">
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2 text-[13.5px] font-semibold break-words text-ink">
                  {`${m.itemRef}: ${m.description}`}
                  {m.rateSource === "AGREED_RATE" && <Chip tone="info">Agreed rate</Chip>}
                  {m.coveredUp && <Chip>Covered up</Chip>}
                  {m.removedAt && <Chip tone="warn">Removed</Chip>}
                </span>
                <span className="block text-[12.5px] break-words text-ink-3">{`${decimalText(m.quantity)} ${m.unit} at ${formatMoney(senFromDecimal(m.baseRate))}${m.adjustmentPct ? `, adjusted ${decimalText(m.adjustmentPct)}%` : ""}${m.bqItemRef ? ` (${m.bqItemRef})` : ""} · ${DIRECTION_WORDS[m.direction].en.toLowerCase()} ${formatMoney(senFromDecimal(m.amount))} · measured ${formatDate(storedDay(m.measuredOn))} for ${m.person.name}${m.recordsNote ? ` · ${m.recordsNote}` : ""}${m.removedAt ? ` · removed: ${m.removedReason}` : ""}`}</span>
              </span>
              {!m.removedAt && <RemoveMeasurementDrawer id={l.contract.id} variationId={v.id} measurementId={m.id} label={`item ${m.itemRef}`} blocker={blockedBy ?? (orderLive ? variationFaultText({ code: "ORDER_RAISED", level: "block" }) : null)} />}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ the order (VO-663)

async function OrderPanel({ l, v, f, vv, people, blockedBy }: Omit<PanelProps, "today"> & { blockedBy: string | null }) {
  const ins = liveInstructionRow(v);
  const order = liveOrderRow(v);
  const lines = ins ? standingMeasurements(v, ins.id) : [];
  const clauses = (await db.clauseText.findMany({ where: { organisationId: l.org.id, retiredOn: null }, orderBy: [{ sortOrder: "asc" }, { titleEn: "asc" }], select: { id: true, titleEn: true } })).map((c) => ({ value: c.id, label: c.titleEn }));
  const raiseBlocker = blockedBy ?? say(orderFaults({ v: f, instructionIssued: ins?.certificate.status === "ISSUED", orderLive: !!order, lines: lines.length, description: ins?.description ?? "", instructionDescription: ins?.description ?? "", clauseChosen: true })) ?? (!vv.formSet("VARIATION") ? variationFaultText(noFormFault("VARIATION")) : null);
  const coverage = order ? orderApprovalFaults({ v: f, net: orderNetOf(order), agreedRateTotal: BigInt((order.judgedUnder as { agreedRateTotal?: string } | null)?.agreedRateTotal ?? "0") }) : [];
  const dispute = order ? disputeOf(order) : null;
  const adjustedOn = order?.adjustmentLines.map((x) => ({ number: x.sumAdjustment.certificate.number, status: x.sumAdjustment.certificate.status })).find((c) => c.status !== "VOID") ?? null;
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader icon={<WalletIcon size={17} />} title="The Variation Order Certificate" subtitle="Certifies the measured variation, addition or omission, under the valuation clause chosen, its description the instruction's word for word. Signed by the S.O. after the recommending officer, never by an officer who may only instruct. The contract sum moves only by an issued adjustment of the contract sum." actions={!order ? <OrderDrawer id={l.contract.id} variationId={v.id} description={ins?.description ?? ""} clauses={clauses} people={people} blocker={raiseBlocker} /> : undefined} />
        <CardBody>
          {order ? (
            <KeyValues
              columns={2}
              items={[
                { label: "Certificate", value: <Link className="font-medium text-brand-700 underline" href={`/projects/${l.contract.id}/certificates/${order.certificate.id}`}>{`${order.certificate.number ?? "Not yet numbered"} · ${CERT_WORDS[order.certificate.status as CertificateStatus].en}`}</Link> },
                { label: "Net value", value: `${formatMoney(orderNetOf(order) < 0n ? -orderNetOf(order) : orderNetOf(order))}, ${DIRECTION_WORDS[orderNetOf(order) < 0n ? "OMISSION" : "ADDITION"].en.toLowerCase()}` },
                { label: "Valued under", value: order.valuationClauseTitle },
                { label: "Its value is covered", value: coverage.length ? <span className="text-amber-800">{say(coverage)}</span> : v.exemption && v.exemption !== "REMEASUREMENT" ? `Exempt from prior approval (${EXEMPTION_WORDS[v.exemption as VariationExemption].en.toLowerCase()}): signed by the S.O.` : "Yes, by the variation's approved routes" },
                { label: "The contractor", value: dispute ? <span className="flex flex-col items-start gap-1"><Chip tone="err">Disputed</Chip><span className="text-[12.5px] text-ink-3">{`${dispute.name} refused to sign on ${formatDate(dispute.on)}: ${dispute.note}. Recorded for resolution; it does not stop the issue or the payment.`}</span></span> : order.certificate.status === "ISSUED" ? "Signed" : dim("Not signed yet") },
                { label: "On an adjustment of the contract sum", value: adjustedOn ? `${adjustedOn.number ?? "In progress"} (${CERT_WORDS[adjustedOn.status as CertificateStatus].en.toLowerCase()})` : order.certificate.status === "ISSUED" ? dim("Not yet: raise one on the contract's Variations tab") : dim("Once issued") },
              ]}
            />
          ) : (
            <p className="text-[13px] text-ink-3">{raiseBlocker ?? "Not raised yet."}</p>
          )}
        </CardBody>
      </Card>
      {v.orders.filter((o) => o.certificate.status === "VOID").length > 0 && <Callout tone="info" title="Earlier certificates voided">{v.orders.filter((o) => o.certificate.status === "VOID").length} raised and voided before issue; their items are free again.</Callout>}
    </div>
  );
}

// ------------------------------------------------------------------ history

const ENTITY: Readonly<Record<string, string>> = Object.fromEntries(VARIATION_ENTITIES.map((e) => [e, RECORD_TYPE_WORDS[e].en]));

function HistoryPanel({ entries, total, timeZone }: { entries: { id: string; entity: string; entityLabel: string; action: string; at: Date; reason: string; changes: unknown }[]; total: number; timeZone: string | null }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader icon={<ClockIcon size={17} />} title="History" subtitle={`${total > entries.length ? `Showing the latest ${entries.length} of ${total} changes. ` : "Every change to this variation and what is under it. "}Nobody is signed in, so no change is attributed.`} divided={entries.length === 0} />
      {entries.length === 0 ? (
        <EmptyState size="sm" title="No changes yet">Its record is written when it is first saved.</EmptyState>
      ) : (
        <ul className="divide-y divide-line/70">
          {entries.map((e) => (
            <li key={e.id} className="px-5 py-3 sm:px-6">
              <span className="flex flex-wrap items-center gap-2 text-[13.5px] font-semibold break-words text-ink">
                {historyEntityLabel(e.entityLabel, ENTITY[e.entity] ?? RECORD_TYPE_WORDS[e.entity]?.en ?? "Record")}
                <Chip>{e.action === "CREATE" ? "Recorded" : e.action === "UPDATE" ? "Changed" : "Removed"}</Chip>
              </span>
              <span className="block text-[12.5px] text-ink-3">{formatOrgDateTime(e.at, timeZone)}{e.reason ? ` · ${e.reason}` : ""}</span>
              <ul className="mt-1 text-[12.5px] break-words text-ink-2">
                {((e.changes ?? []) as { field: string; before: string | null; after: string | null }[]).map((c, n) => (
                  <li key={n}>{`${historyFieldLabel(c.field)}: ${historyValue(c.field, c.before, formatDate, e.entity)} → ${historyValue(c.field, c.after, formatDate, e.entity)}`}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
