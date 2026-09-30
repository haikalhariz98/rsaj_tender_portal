import Link from "next/link";
import { notFound } from "next/navigation";

import { AlertTriangle, ChartIcon, ClipboardIcon, ClockIcon, RouteIcon, ShieldIcon } from "@/components/icons";
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
import { CellStack, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { fieldLabel } from "@/lib/audit/diff";
import { loadIssue, loadOverrideMatrix } from "@/lib/authority/load";
import { MATTER_KIND_LABEL, OUTCOME_LABEL } from "@/lib/committee/labels";
import { dayToDate, storedDay } from "@/lib/dates";
import { formatDate, formatRM } from "@/lib/format";
import { ACT_LABEL, condLabel } from "@/lib/labels";
import { parseSen } from "@/lib/money";
import { ORGANISATION_CODE } from "@/lib/org";
import { pathTo } from "@/lib/organisation/structure";
import { loadDelegations, loadRoster } from "@/lib/people/load";
import { officesHeldBy } from "@/lib/people/roster";
import { identityHolds, isStale, overBudgetDisposition, type BudgetSnapshot } from "@/lib/requisition/budget";
import { commitmentFault } from "@/lib/requisition/commitment";
import { endorsementFaults, endorsersFor } from "@/lib/requisition/endorsement";
import { blocking, requisitionFaults } from "@/lib/requisition/fields";
import { fundingGate } from "@/lib/requisition/funding";
import { deciderFaults, holdersFor } from "@/lib/requisition/holders";
import {
  APPROVAL_STATUS_LABEL,
  DECIDER_FAULT_TEXT,
  DECISION_LABEL,
  endorsementFaultText,
  fieldFaultText,
  fundingFaultText,
  OPERATOR_LABEL,
  SOURCE_LABEL,
  SPLIT_KEY_LABEL,
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
  recordOf,
  requisitionHistory,
  type LoadedRequisition,
} from "@/lib/requisition/repo";
import { resolveRequisitionRoute } from "@/lib/requisition/route";
import { splitApprovalFault, splitStateLabel } from "@/lib/requisition/splitting";
import { transitionFault } from "@/lib/requisition/status";
import type { OrgUnitKind } from "@/lib/requisition/types";

import {
  CancelDrawer,
  ChangeFundingDrawer,
  CheckBudgetDrawer,
  CiteCommitteeDrawer,
  CloseDrawer,
  DecisionDrawer,
  ErpRefsDrawer,
  ExternalAuthorityDrawer,
  JustifySplitDrawer,
  MarkEndorsed,
  RecallDrawer,
  RecordEndorsementDrawer,
  RegisterDrawer,
  ReopenDrawer,
  ReturnDrawer,
  SubmitDrawer,
} from "../editors";

export const dynamic = "force-dynamic";

const TONE = { neutral: "neutral", brand: "brand", ok: "ok", warn: "warn", err: "err", info: "info" } as const;
const ORGANISATION_HREF = "/configuration/organisation";
const CONTROLS_HREF = "/configuration/requisitions";
const BUDGET_HREF = "/configuration/budget";
const PRE_SUBMIT = ["REGISTERED", "BUDGET_CHECKED", "OVER_BUDGET"];
const TERMINAL = ["CANCELLED", "CLOSED"];

const sen = (v: { toString(): string } | null) => (v == null ? null : parseSen(v.toString()));
const money = (v: { toString(): string } | null) => (v == null ? "Not recorded" : formatRM(num(v)));

export default async function RequisitionPage(props: PageProps<"/requisitions/[id]">) {
  const [{ id }, { tab }] = await Promise.all([props.params, props.searchParams as Promise<{ tab?: string }>]);
  const l = await loadRequisition(id);
  if (!l) notFound();
  const r = l.req;
  const today = l.org.today;
  const on = today ? dayToDate(today) : new Date();

  const [policy, controls, { lookups, formats, costCentres, accountCodes, sites }, roster, delegations, history] = await Promise.all([
    loadPolicy(l.org.id),
    loadControls(l.org.id),
    loadLookups(l.org.id),
    loadRoster(ORGANISATION_CODE),
    loadDelegations(ORGANISATION_CODE),
    requisitionHistory(l),
  ]);

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

  const endorseBlock = transitionFault(r.status, "ENDORSED", {
    today,
    fieldFaults: fieldFaults.length,
    tiersSet: policy.endorsementTiers.length > 0,
    endorsementFaults: eFaults.length,
  });
  const registerBlock = transitionFault(r.status, "REGISTERED", {
    today,
    erpReferenceRequired: policy.erpReferenceRequired,
    erpRequisitionNo: policy.erpReferenceRequired ? "(entered in the drawer)" : r.erpRequisitionNo,
    erpNoteNo: policy.erpReferenceRequired ? "(entered in the drawer)" : r.erpNoteNo,
  });

  // Submission, as far as it can be judged before the lock: the same pure checks.
  let submitBlocker: string | null = null;
  let overBudget: { invocation: boolean; controlNotSet: boolean; auto: boolean } | null = null;
  let preview: ReturnType<typeof resolveRequisitionRoute> | null = null;
  let previewRoles: Record<string, { nameEn: string }> = {};
  if (PRE_SUBMIT.includes(r.status)) {
    const stale = lastCheck && today ? isStale(storedDay(lastCheck.checkedAt), policy.budgetRecheckDays, today) : false;
    if (!today) submitBlocker = transitionFaultText({ code: "TIME_ZONE_UNSET" });
    else if (fieldFaults.length > 0) submitBlocker = fieldFaultText(fieldFaults[0]);
    else if (gate.faults.length > 0) submitBlocker = fundingFaultText(gate.faults[0]);
    else if (!lastCheck) submitBlocker = "Run the budget check first.";
    else if (stale && controls.budgetCheckSource === "MANUAL_ERP_ENTRY") submitBlocker = "The last check is stale and was entered by hand. Enter a fresh check first.";
    if (lastCheck) {
      const d = overBudgetDisposition(lastCheck.verdict, controls.availabilityCheck, false);
      if (!d.proceed && (d.fault === "NO_BUDGET" || d.fault === "AMBIGUOUS")) {
        submitBlocker ??= d.fault === "NO_BUDGET" ? "No budget to check against on the budget code." : "The account is not the budget code's, so the budget line is unclear.";
      }
      if (lastCheck.verdict === "EXCEEDS") overBudget = { invocation: !d.proceed, controlNotSet: d.controlNotSet, auto: d.proceed };
    }
    const dal = await loadIssue(ORGANISATION_CODE, on, undefined, null);
    if (!dal) submitBlocker ??= "No approval matrix is in force.";
    else {
      previewRoles = dal.matrix.roles;
      const override = gate.supersedesAuthority && r.fundingRouteCode ? await loadOverrideMatrix(ORGANISATION_CODE, r.fundingRouteCode, on) : null;
      const q = { value: num(r.estimatedValue)!, overBudget: lastCheck?.verdict === "EXCEEDS", fundingRouteCode: r.fundingRouteCode, fundingSupersedesAuthority: gate.supersedesAuthority === true };
      preview = resolveRequisitionRoute(dal.matrix, override, q);
      const held = officesHeldBy(roster, r.requestingPersonId, on).map((o) => o.code);
      if (preview.resolution.approverCode && held.includes(preview.resolution.approverCode)) {
        preview = resolveRequisitionRoute(dal.matrix, override, { ...q, actorRoleCode: preview.resolution.approverCode });
      }
      if (preview.faults.length > 0) submitBlocker ??= preview.faults[0].messageEn;
    }
  }

  const checkBlocker = !PRE_SUBMIT.includes(r.status)
    ? null
    : !today
      ? transitionFaultText({ code: "TIME_ZONE_UNSET" })
      : !controls.budgetCheckSource
        ? "Where the budget check comes from is not set. Set it in Requisition controls."
        : null;

  const recallBlock = r.status === "PENDING_APPROVAL" ? transitionFault(r.status, "RECALLED", { today, anyStepDone: open?.steps.some((s) => s.decision !== "PENDING") ?? false }) : null;
  const locked = !["DRAFT"].includes(r.status);
  const erpFirst = r.erpRequisitionNo ? `${r.erpRequisitionNo} · ${r.reference}` : r.reference;

  const actions = (
    <>
      {r.status === "DRAFT" && (
        <>
          <ButtonLink href={`/requisitions/${r.id}/edit`} variant="secondary" size="sm">
            Edit
          </ButtonLink>
          <MarkEndorsed id={r.id} blocker={endorseBlock ? transitionFaultText(endorseBlock) : null} />
        </>
      )}
      {r.status === "ENDORSED" && (
        <>
          <ReturnDrawer id={r.id} people={people} today={today} />
          <RegisterDrawer
            id={r.id}
            required={policy.erpReferenceRequired}
            proc={r.erpRequisitionNo}
            nm={r.erpNoteNo}
            blocker={registerBlock && registerBlock.code !== "ERP_REFS_REQUIRED" ? transitionFaultText(registerBlock) : null}
          />
        </>
      )}
      {PRE_SUBMIT.includes(r.status) && (
        <>
          <CheckBudgetDrawer id={r.id} source={controls.budgetCheckSource} blocker={checkBlocker} today={today} />
          <SubmitDrawer id={r.id} blocker={submitBlocker} overBudget={overBudget} />
        </>
      )}
      {r.status === "PENDING_APPROVAL" && <RecallDrawer id={r.id} blocker={recallBlock ? transitionFaultText(recallBlock) : null} />}
      {["RETURNED", "RECALLED", "REJECTED"].includes(r.status) && <ReopenDrawer id={r.id} />}
      {r.status === "REJECTED" && <CloseDrawer id={r.id} />}
      {["DRAFT", "ENDORSED", "RETURNED", "REGISTERED", "BUDGET_CHECKED", "OVER_BUDGET"].includes(r.status) && <CancelDrawer id={r.id} />}
    </>
  );

  return (
    <>
      <RecordCrumb label={r.reference} />
      <PageHeader
        eyebrow={<Link href="/requisitions">Requisition</Link>}
        title={r.title}
        badge={
          <>
            <Badge tone={TONE[STATUS_TONE[r.status]]} dot>
              {STATUS_LABEL[r.status]}
            </Badge>
            {r.origin === "EXTERNAL" && <Badge tone="info">Received from the finance system</Badge>}
          </>
        }
        subtitle={`${unitName(r.requestingUnitCode)}${r.sectionUnitCode ? ` · ${unitName(r.sectionUnitCode)}` : ""} · raised by ${r.requestingPerson.name}`}
        meta={[
          <span key="ref" className="font-mono text-[12.5px]">
            {r.erpRequisitionNo ? erpFirst : `${r.reference} · finance system no. not recorded`}
          </span>,
          <span key="v" className="tabular-nums">{formatRM(num(r.estimatedValue))}</span>,
          `Required by ${formatDate(r.dateRequired)}`,
          route ? route.nameEn : "Funding route not set",
        ]}
        actions={actions}
      />

      {!TERMINAL.includes(r.status) && r.status !== "APPROVED" && !today && (
        <Callout
          tone="warn"
          className="mb-6"
          title="The organisation's time zone is not set"
          action={
            <ButtonLink href={ORGANISATION_HREF} size="sm">
              Set time zone
            </ButtonLink>
          }
        >
          Endorsing, submitting and deciding depend on today&apos;s date, which is not assumed to be UTC. None of them can be recorded until the zone is set.
        </Callout>
      )}
      {r.status === "RETURNED" && (
        <Callout tone="warn" className="mb-6" title={`Returned to ${r.returnedTo?.name ?? "Not recorded"} on ${formatDate(r.returnedOn)}`}>
          {r.returnedReason || "No reason recorded."}
        </Callout>
      )}
      {r.status === "CANCELLED" && (
        <Callout tone="info" className="mb-6" title="Cancelled">
          {r.cancelReason || "No reason recorded."}
        </Callout>
      )}
      {r.origin === "EXTERNAL" && (
        <Callout tone="info" className="mb-6" title="Entered by hand from the finance system">
          Its numbers, budget figures and approval trail are stored exactly as typed. The trail is not checked against the approval matrix.
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
                l={l}
                facts={{
                  department: unitName(r.requestingUnitCode) ?? "Not set",
                  section: unitName(r.sectionUnitCode) ?? "None",
                  costCentre: named(costCentres, r.costCentreCode || null) ?? "Not set",
                  account: named(accountCodes, r.accountCode || null) ?? "Not set",
                  site: named(sites, r.siteCode) ?? "None",
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
                  today,
                }}
              />
            ),
          },
          {
            id: "budget",
            label: "Budget",
            icon: <ChartIcon size={15} />,
            count: r.budgetChecks.length,
            panel: <BudgetPanel l={l} controls={controls} recheckDays={policy.budgetRecheckDays} />,
          },
          {
            id: "approval",
            label: "Approval",
            icon: <RouteIcon size={15} />,
            panel: (
              <ApprovalPanel
                l={l}
                preview={preview}
                previewMatrixRoles={previewRoles}
                decide={(step) => {
                  if (!open || step.decision !== "PENDING") return null;
                  const earlierDone = open.steps.filter((s) => s.sequence < step.sequence).every((s) => s.decision === "DONE");
                  if (!earlierDone) return DECIDER_FAULT_TEXT.OUT_OF_ORDER;
                  if (!today) return DECIDER_FAULT_TEXT.TIME_ZONE_UNSET;
                  // The final step waits for a flagged split's justification.
                  const last = open.steps.every((s) => s.id === step.id || s.decision === "DONE");
                  const split = r.splitChecks.find((c) => c.id === open.splitCheckId) ?? null;
                  if (last && splitApprovalFault(split)) return "Flagged as a possible split: record the justification (Checks tab) before the final approval.";
                  return null;
                }}
                suggestions={(roleCode) => {
                  if (!today) return people;
                  const path = pathTo(lookups.units, unit, on).reverse().map((u) => u.code);
                  const h = holdersFor(roleCode, path, roster, delegations, today);
                  const first = new Set([...h.holderIds, ...h.delegates.map((d) => d.personId)]);
                  return [...people.filter((p) => first.has(p.value)), ...people.filter((p) => !first.has(p.value))];
                }}
                stepFaultPreview={(step) => {
                  // Why the holders on file cannot decide it: the ruled conflicts, named early.
                  if (!open || !today || step.committeeCode || !step.roleCode) return null;
                  const path = pathTo(lookups.units, unit, on).reverse().map((u) => u.code);
                  const h = holdersFor(step.roleCode, path, roster, delegations, today);
                  const candidates = [...h.holderIds, ...h.delegates.map((d) => d.personId)];
                  if (candidates.length === 0) return "Nobody holds this office for the requisition's department today, and nobody holds a delegation of it.";
                  const ok = candidates.some(
                    (pid) =>
                      deciderFaults(step, {
                        today,
                        holders: h,
                        person: lookups.people.find((p) => p.id === pid) ?? null,
                        requesterId: r.requestingPersonId,
                        endorserIds: r.endorsements.map((e) => e.personId),
                        otherDeciderIds: open.steps.filter((s) => s.id !== step.id && s.decidedByPersonId).map((s) => s.decidedByPersonId!),
                        earlierDone: true,
                        decidedOn: today,
                        openedOn: storedDay(open.openedAt),
                        value: parseSen(r.estimatedValue.toString()),
                      }).faults.length === 0,
                  );
                  return ok ? null : "Every holder of this office on file is barred from deciding it (they raised or endorsed it, or decided another step, or the value is over their delegation). Record a delegation to someone who is not.";
                }}
                today={today}
              />
            ),
          },
          {
            id: "checks",
            label: "Checks",
            icon: <ShieldIcon size={15} />,
            panel: (
              <ChecksPanel
                l={l}
                gate={{ ...gate, faults: gate.faults.map(fundingFaultText) }}
                route={route ? { name: route.nameEn, requires: route.requiresExternalAuthorityRef, label: route.externalAuthorityRefLabel } : null}
                routes={lookups.fundingRoutes.filter((x) => x.retiredOn == null || x.retiredOn > on).map((x) => ({ value: x.code, label: x.nameEn }))}
                policy={policy}
                people={people}
                today={today}
                routeNameOf={(code) => lookups.fundingRoutes.find((x) => x.code === code)?.nameEn ?? null}
              />
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
                labelFor={(field, value) => {
                  if (field === "requestingPersonId" || field === "returnedToPersonId") return personName(value) ?? "Not on record";
                  if (field === "requestingUnitCode" || field === "sectionUnitCode") return unitName(value) ?? "—";
                  if (field === "fundingRouteCode") return lookups.fundingRoutes.find((x) => x.code === value)?.nameEn ?? "A route no longer configured";
                  if (field === "budgetCodeId") return lookups.budgetCodes.find((b) => b.id === value)?.code ?? "A budget code no longer on file";
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

function Overview({
  l,
  facts,
  fieldNotes,
  locked,
  endorsement,
}: {
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
    today: string | null;
  };
}) {
  const r = l.req;
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
              {
                label: "Finance system requisition no.",
                value: r.erpRequisitionNo ? <span className="font-mono text-[13px]">{r.erpRequisitionNo}</span> : <span className="text-ink-3">Not recorded</span>,
              },
              { label: "Requisition note no.", value: r.erpNoteNo ? <span className="font-mono text-[13px]">{r.erpNoteNo}</span> : <span className="text-ink-3">Not recorded</span> },
              { label: "Requesting department", value: facts.department },
              { label: "Section", value: facts.section },
              { label: "Requesting officer", value: r.requestingPerson.name },
              { label: "Cost centre", value: facts.costCentre },
              { label: "Account code", value: facts.account },
              { label: "Budget code", value: r.budgetCode ? `${r.budgetCode.code} · ${r.budgetCode.descriptionEn}` : <span className="text-ink-3">Not set</span> },
              { label: "Site", value: facts.site },
              { label: "Place of delivery", value: r.placeOfDelivery || <span className="text-ink-3">Not set</span> },
              { label: "Date required", value: formatDate(r.dateRequired) },
              { label: "Estimated value", value: <span className="tabular-nums">{formatRM(num(r.estimatedValue))}</span> },
              { label: "Raised on", value: formatDate(r.raisedOn) },
              { label: "Entered", value: r.origin === "EXTERNAL" ? "Received by hand from the finance system" : "Raised in the portal" },
            ]}
          />
          <div className="grid gap-6 border-t border-line pt-6 md:grid-cols-2">
            <div className="min-w-0">
              <div className="text-[12px] font-semibold text-ink-3">Justification</div>
              <p className="mt-1 text-[14px] break-words whitespace-pre-line text-ink">{r.justification || <span className="text-ink-3">Not set</span>}</p>
            </div>
            <div className="min-w-0">
              <div className="text-[12px] font-semibold text-ink-3">Need statement</div>
              <p className="mt-1 text-[14px] break-words whitespace-pre-line text-ink">{r.needStatement || <span className="text-ink-3">Not set</span>}</p>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader
          icon={<ClipboardIcon size={17} />}
          title="Line items"
          subtitle={`${r.lines.length} ${r.lines.length === 1 ? "line" : "lines"}, coming to ${formatRM(Number(lineTotal) / 100)}.`}
        />
        {r.lines.length === 0 ? (
          <EmptyState size="sm" title="No lines">
            A requisition needs at least one line before it can leave draft.
          </EmptyState>
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
                  <Td className="tabular-nums text-ink-3">{x.lineNo}</Td>
                  <Td>
                    <span className="block truncate" title={x.description}>
                      {x.description}
                    </span>
                  </Td>
                  <Td numeric>{x.quantity == null ? "—" : `${Number(x.quantity.toString())}${x.unit ? ` ${x.unit}` : ""}`}</Td>
                  <Td numeric>{x.estimatedUnitPrice == null ? "—" : formatRM(num(x.estimatedUnitPrice))}</Td>
                  <Td numeric className="font-semibold">
                    {formatRM(num(x.estimatedAmount))}
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
          subtitle="The heads of the tiers the policy names, before submission (FR-REQ-003). Recorded on their behalf: nobody signs in yet."
          actions={
            endorsement.canRecord && endorsement.tiers.length > 0 ? (
              <RecordEndorsementDrawer
                id={r.id}
                tiers={endorsement.tiers.filter((t) => !r.endorsements.some((e) => e.tier === t)).map((t) => ({ value: t, label: TIER_LABEL[t] }))}
                people={endorsement.people}
                today={endorsement.today}
              />
            ) : undefined
          }
        />
        {endorsement.tiers.length === 0 ? (
          <CardBody>
            <Callout
              tone="warn"
              title="Endorsement tiers are not set"
              action={
                <ButtonLink href={CONTROLS_HREF} size="sm">
                  Set tiers
                </ButtonLink>
              }
            >
              The policy does not say whose endorsement a requisition needs, and none is assumed. Until the tiers are set, no requisition can be endorsed or submitted.
            </Callout>
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
                    <Td>
                      <CellStack title={TIER_LABEL[x.tier]} sub={x.unit ?? "No such unit on the path"} />
                    </Td>
                    <Td>
                      {e ? (
                        <CellStack title={`${e.person.name} · ${formatDate(e.endorsedOn)}`} sub={e.note || "Recorded on their behalf, not signed"} />
                      ) : (
                        <Badge tone="warn">Awaiting</Badge>
                      )}
                    </Td>
                    <Td>
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
  l,
  controls,
  recheckDays,
}: {
  l: LoadedRequisition;
  controls: { availabilityCheck: string | null; commitOnApproval: boolean | null; budgetCheckSource: string | null };
  recheckDays: number | null;
}) {
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
  const stale = c && l.org.today ? isStale(storedDay(c.checkedAt), recheckDays, l.org.today) : false;
  const settings: { label: string; value: React.ReactNode }[] = [
    {
      label: "Check source",
      value: controls.budgetCheckSource ? SOURCE_LABEL[controls.budgetCheckSource as keyof typeof SOURCE_LABEL] : <Badge tone="warn">Not set</Badge>,
    },
    {
      label: "Re-checked on submission after",
      value: recheckDays == null ? <span>Not set — a check never goes stale</span> : `${recheckDays} days`,
    },
    {
      label: "Over budget",
      value:
        controls.availabilityCheck === "advisory"
          ? "Routes to the over-budget approvers with a warning"
          : controls.availabilityCheck === "blocking"
            ? "Held until the over-budget route is invoked"
            : <span>Control not set — held until the over-budget route is invoked</span>,
    },
    {
      label: "Commit on approval",
      value: controls.commitOnApproval == null ? <Badge tone="warn">Not set</Badge> : controls.commitOnApproval ? "Yes, on the day it is approved" : "No",
    },
  ];
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          icon={<ChartIcon size={17} />}
          title="Latest budget check"
          subtitle={c ? `${SOURCE_LABEL[c.source]} · as at ${formatDate(c.asAt)} · checked ${formatDate(c.checkedAt)}` : "Not checked yet."}
          actions={c ? <Badge tone={TONE[VERDICT_TONE[c.verdict]]}>{VERDICT_LABEL[c.verdict]}</Badge> : undefined}
        />
        <CardBody className="flex flex-col gap-5">
          {!c ? (
            <EmptyState size="sm" title="No budget check yet">
              The check runs once the requisition is registered.
            </EmptyState>
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
                    </span>
                  }
                  value={money(c.approvedAccount)}
                  hint={c.source === "PORTAL_LEDGER" ? "Committed plus spent, assumed. The verdict never reads it." : "As the finance system shows it. The verdict never reads it."}
                />
                <Stat variant="inset" size="sm" tone="neutral" label="Projected balance" value={money(c.projectedBalance)} hint={`After ${formatRM(num(c.requestedAmount))}`} />
              </div>
              {c.outcome.includes("COST_CENTRE_OUTSIDE_OWNER") && (
                <Callout tone="warn">The cost centre&apos;s unit is not the budget code&apos;s owning unit. This warns and does not block.</Callout>
              )}
              {identity === false && (
                <Callout tone="err">Actual budget less approved account does not equal the balance on this ledger check. Report it: the ledger arithmetic should always close.</Callout>
              )}
              {stale && <Callout tone="info">This check is older than the re-check window, so it is re-run on submission.</Callout>}
            </>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          icon={<ShieldIcon size={17} />}
          title="Controls applied"
          subtitle="As configured today. A submitted requisition's route keeps the settings it was judged under."
          actions={
            <ButtonLink href={controls.budgetCheckSource ? BUDGET_HREF : CONTROLS_HREF} size="sm" variant="ghost">
              Configure
            </ButtonLink>
          }
        />
        <CardBody>
          <KeyValues columns={2} items={settings} />
        </CardBody>
      </Card>

      {r.budgetChecks.length > 1 && (
        <Card className="overflow-hidden">
          <CardHeader icon={<ClockIcon size={17} />} title="Earlier checks" subtitle="Every check is kept as it was." />
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
                  <Td>{formatDate(x.checkedAt)}</Td>
                  <Td>
                    <span className="block truncate">{SOURCE_LABEL[x.source]}</span>
                  </Td>
                  <Td numeric>{money(x.balanceAsAt)}</Td>
                  <Td>
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

function ApprovalPanel({
  l,
  preview,
  previewMatrixRoles,
  decide,
  suggestions,
  stepFaultPreview,
  today,
}: {
  l: LoadedRequisition;
  preview: ReturnType<typeof resolveRequisitionRoute> | null;
  previewMatrixRoles: Record<string, { nameEn: string }>;
  decide: (s: Step) => string | null;
  suggestions: (roleCode: string) => { value: string; label: string }[];
  stepFaultPreview: (s: Step) => string | null;
  today: string | null;
}) {
  const r = l.req;
  const [inst, ...earlier] = r.approvalInstances;
  const matters = r.committeeDecisions;

  if (!inst) {
    return (
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader icon={<RouteIcon size={17} />} title="Approval route" subtitle="Resolved and stored when the requisition is submitted." />
          <CardBody className="flex flex-col gap-4">
            {preview ? (
              <>
                <p className="text-[13.5px] text-ink-2">If it were submitted today, the approval matrix would route it:</p>
                {preview.resolution.chain.length > 0 ? (
                  <ol className="flex flex-col gap-2">
                    {preview.resolution.chain.map((s, i) => (
                      <li key={i} className="flex items-center gap-2 text-[13.5px]">
                        <ActBadge act={s.act} />
                        <span className="font-semibold text-ink">{previewMatrixRoles[s.roleCode]?.nameEn ?? "An office no longer configured"}</span>
                        <span className="text-ink-3">{ACT_LABEL[s.act]}</span>
                      </li>
                    ))}
                  </ol>
                ) : null}
                {preview.faults.map((f) => (
                  <Callout key={f.messageEn} tone="err">
                    {f.messageEn}
                  </Callout>
                ))}
                {preview.warnings.filter((w) => w.level !== "err").map((w) => (
                  <Callout key={w.messageEn} tone="warn">
                    {w.messageEn}
                  </Callout>
                ))}
              </>
            ) : (
              <EmptyState size="sm" title="Not submitted">
                The route is resolved once the requisition is registered and its budget checked.
              </EmptyState>
            )}
          </CardBody>
        </Card>
        <CommitteeMatters l={l} />
      </div>
    );
  }

  const warnings = (inst.warnings as { code: string; level: string; messageEn: string }[]) ?? [];
  const split = inst.splitCheckId ? r.splitChecks.find((c) => c.id === inst.splitCheckId) : null;
  const splitShown = splitStateLabel(inst.splitState, !!split?.overrideJustification);
  const open = inst.status === "PENDING";

  return (
    <div className="flex flex-col gap-6">
      <Card className="overflow-hidden">
        <CardHeader
          icon={<RouteIcon size={17} />}
          title="Approval route"
          subtitle={
            inst.checkedAgainstMatrix
              ? `Opened ${formatDate(inst.openedAt)} under ${inst.matrixLabel ?? "an issue no longer on file"}.`
              : "As received from the finance system: not checked against the approval matrix."
          }
          actions={<Badge tone={inst.status === "APPROVED" ? "ok" : inst.status === "PENDING" ? "brand" : "warn"}>{APPROVAL_STATUS_LABEL[inst.status]}</Badge>}
        />
        <CardBody className="flex flex-col gap-5">
          {inst.checkedAgainstMatrix ? (
            <KeyValues
              columns={2}
              items={[
                { label: "Rule", value: inst.ruleLabel ? `${inst.ruleLabel}${inst.ruleClause ? ` · ${inst.ruleClause}` : ""}` : "Not recorded" },
                { label: "Routed on", value: inst.cond ? condLabel(inst.cond) : "Its value band" },
                {
                  label: "At the boundary",
                  value: inst.boundaryOperator ? OPERATOR_LABEL[inst.boundaryOperator] : "No edge of the rule sat on the boundary",
                },
                {
                  label: "Funder's rules",
                  value: inst.fundingOverrideApplied
                    ? `Superseded the approval matrix: ${inst.overrideMatrixLabel ?? "a rule set no longer on file"}`
                    : r.fundingSupersedesAuthority
                      ? "The funder's rules supersede on this route, but none applied — see the warnings"
                      : "Do not apply on this funding route",
                },
                {
                  label: "Over budget",
                  value:
                    inst.budgetVerdict === "EXCEEDS"
                      ? inst.overBudgetInvoked
                        ? `Over-budget route invoked by the officer${inst.availabilityCheck == null ? " · control not set" : ""}`
                        : "Routed to the over-budget approvers automatically, with a warning"
                      : "Within budget",
                },
                {
                  label: "Splitting check the approvers saw",
                  value: <Chip tone={TONE[splitShown.tone]}>{splitShown.label}</Chip>,
                },
              ]}
            />
          ) : (
            <Callout tone="info" title="Not checked against the approval matrix">
              This trail was typed in from the finance system. The portal did not route it and does not vouch for it.
            </Callout>
          )}
          {warnings.length > 0 && (
            <ul className="flex flex-col gap-2">
              {warnings.map((w, i) => (
                <li key={i}>
                  <Callout tone={w.level === "err" ? "err" : w.level === "info" ? "info" : "warn"}>{w.messageEn}</Callout>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
        <ol className="divide-y divide-line/70 border-t border-line">
          {inst.steps.map((s) => {
            const committee = s.committeeDecision;
            const record = committee ? recordOf({ ...committee, meeting: committee.meeting }) : null;
            const blocker = open ? decide(s) : null;
            const barred = open && s.decision === "PENDING" && !blocker ? stepFaultPreview(s) : null;
            const citable = matters.filter((d) => d.meeting.committee.code === s.committeeCode && d.outcome !== "PENDING");
            return (
              <li key={s.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
                <div className="flex min-w-0 items-start gap-3">
                  <ActBadge act={s.act} />
                  <div className="min-w-0">
                    <div className="font-semibold break-words text-ink">
                      {s.roleLabel} <span className="font-normal text-ink-3">· {ACT_LABEL[s.act]}</span>
                    </div>
                    {s.decision === "PENDING" ? (
                      <div className="text-[12.5px] text-ink-3">
                        {s.committeeCode ? "Awaiting the committee's decision on a tabled matter." : "Awaiting a decision."}
                        {s.nonDelegable && " Cannot be delegated."}
                      </div>
                    ) : committee && record ? (
                      <div className="text-[12.5px] text-ink-2">
                        {OUTCOME_LABEL[record.outcome]} by the {record.committee} at{" "}
                        <Link href={`/committees/${committee.meetingId}`}>{record.meetingReference}</Link> on {formatDate(record.decisionDate ?? record.meetingDate)}
                        {record.notApproved ? ` · ${record.notApproved.nameEn}` : ""}
                      </div>
                    ) : (
                      <div className="text-[12.5px] text-ink-2">
                        {DECISION_LABEL[s.decision]} · {s.decidedByName ?? "Not recorded"}
                        {inst.checkedAgainstMatrix ? " · recorded on behalf of, not signed" : ""} · {formatDate(s.decidedOn)}
                        {s.delegation ? ` · under delegation from ${s.delegation.fromPerson.name}` : ""}
                        {s.reason ? ` · “${s.reason}”` : ""}
                      </div>
                    )}
                    {barred && <div className="mt-1 text-[12.5px] text-amber-800">{barred}</div>}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                  {s.decision !== "PENDING" && <Badge tone={s.decision === "DONE" ? "ok" : "err"}>{DECISION_LABEL[s.decision]}</Badge>}
                  {open && s.decision === "PENDING" && !s.committeeCode && s.roleCode && (
                    <DecisionDrawer id={r.id} stepId={s.id} roleLabel={s.roleLabel} act={ACT_LABEL[s.act]} people={suggestions(s.roleCode)} today={today} blocker={blocker} />
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
                          ? `No decided matter before the ${s.roleLabel} is tabled against this requisition. Table it at a sitting, with this requisition's reference.`
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

      {inst.status === "APPROVED" && inst.checkedAgainstMatrix && (
        <Callout tone={inst.commitOnApproval ? "ok" : "info"} title={inst.commitOnApproval ? "Budget committed on approval" : "No commitment written"}>
          {inst.commitOnApproval
            ? `A commitment of ${formatRM(num(r.estimatedValue))} was written against the budget code on the day it was approved.`
            : inst.commitOnApproval === false
              ? "Commit on approval is set off, so approval wrote no commitment."
              : "Commit on approval was not set when it was approved, so no commitment was written."}
        </Callout>
      )}

      <CommitteeMatters l={l} />

      {earlier.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader icon={<ClockIcon size={17} />} title="Earlier routes" subtitle="Kept on record. A re-submission opens a new route." />
          <ul className="divide-y divide-line/70">
            {earlier.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2 px-5 py-3 text-[13px] sm:px-6">
                <Badge tone="neutral">{APPROVAL_STATUS_LABEL[e.status]}</Badge>
                <span className="text-ink-2">
                  Opened {formatDate(e.openedAt)} · {e.ruleLabel ?? "as received"} · {e.steps.map((s) => s.roleLabel).join(" → ")}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

/// Committee matters tabled against this requisition (FR-REQ-012), from decisionRecord() only.
function CommitteeMatters({ l }: { l: LoadedRequisition }) {
  const matters = l.req.committeeDecisions;
  if (matters.length === 0) return null;
  return (
    <Card className="overflow-hidden">
      <CardHeader icon={<ShieldIcon size={17} />} title="Committee matters" subtitle="Tabled against this requisition at a sitting." />
      <ul className="divide-y divide-line/70">
        {matters.map((d) => {
          const rec = recordOf(d);
          return (
            <li key={d.id} className="flex flex-wrap items-center gap-2 px-5 py-3 text-[13px] sm:px-6">
              <Badge tone={d.outcome === "CARRIED" ? "ok" : d.outcome === "PENDING" ? "brand" : "warn"}>{OUTCOME_LABEL[d.outcome]}</Badge>
              <span className="min-w-0 truncate font-semibold text-ink">{d.subject}</span>
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
  policy,
  people,
  today,
  routeNameOf,
}: {
  l: LoadedRequisition;
  gate: { faults: string[]; posture: string | null; sourcingPermitted: boolean | null; supersedesAuthority: boolean | null };
  route: { name: string; requires: boolean | undefined; label: string | null | undefined } | null;
  routes: { value: string; label: string }[];
  policy: { splittingWindowDays: number | null; splittingMatchOn: string[]; provenance: string | null };
  people: { value: string; label: string }[];
  today: string | null;
  routeNameOf: (code: string) => string | null;
}) {
  const r = l.req;
  const split = r.splitChecks[0] ?? null;
  const inst = r.approvalInstances[0] ?? null;
  const shown = splitStateLabel(split?.state ?? null, !!split?.overrideJustification);
  const commit = commitmentFault({ status: r.status }, inst ? { status: inst.status, steps: inst.steps } : null);
  const canJustify = r.status === "PENDING_APPROVAL" && split?.state === "FLAGGED" && !split.overrideJustification && inst?.splitCheckId === split.id;
  const label = route?.label?.trim() || "External authority";
  const postureText =
    gate.posture === "RECORDS_ONLY"
      ? "The organisation does not procure on this route: no sourcing, evaluation or award"
      : gate.posture === "ROUTE_SET_EXTERNALLY"
        ? "The organisation procures; an external body decides the sourcing route"
        : gate.posture === "PROCURES"
          ? "The organisation procures and chooses how"
          : "Not set";
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          icon={<AlertTriangle size={17} />}
          title="Splitting check"
          subtitle="Related requisitions from the same source within the window (FR-REQ-015)."
          actions={
            <>
              <Chip tone={TONE[shown.tone]}>{shown.label}</Chip>
              {canJustify && <JustifySplitDrawer id={r.id} people={people} today={today} />}
            </>
          }
        />
        <CardBody className="flex flex-col gap-4">
          {!split ? (
            <p className="text-[13.5px] text-ink-3">Not assessed yet. The check runs when the requisition is submitted.</p>
          ) : split.state === "NOT_SET" ? (
            <Callout
              tone="warn"
              title="Not assessed: the control is not set"
              action={
                <ButtonLink href={CONTROLS_HREF} size="sm">
                  Set it
                </ButtonLink>
              }
            >
              When this requisition was submitted, the splitting window or the fields that make requisitions related were not set, so no check ran. That is recorded, and it was shown to the approvers. It will never read as clear.
            </Callout>
          ) : (
            <KeyValues
              columns={2}
              items={[
                { label: "Window", value: split.windowDays == null ? "Not set" : `${split.windowDays} days` },
                { label: "Related on", value: split.matchOn.length ? split.matchOn.map((k) => SPLIT_KEY_LABEL[k as keyof typeof SPLIT_KEY_LABEL] ?? "A field").join(", ") : "Not set" },
                { label: "Aggregated across the financial year", value: split.aggregateAcrossYear == null ? "Not set" : split.aggregateAcrossYear ? "Yes" : "No" },
                { label: "Policy", value: <ProvenanceBadge value={split.policyProvenance} /> },
                { label: "Related requisitions", value: split.relatedReferences.length ? split.relatedReferences.join(", ") : "None" },
                { label: "Combined value", value: split.combinedValue == null ? "—" : formatRM(num(split.combinedValue)) },
                {
                  label: "Would the whole go to a higher approver",
                  value: split.crossesBand == null ? "Not assessed" : split.crossesBand ? "Yes — the combined value routes differently" : "No — the same approver either way",
                },
              ]}
            />
          )}
          {split?.overrideJustification && (
            <Callout tone="info" title={`Justified by ${split.overriddenBy?.name ?? "Not recorded"} on ${formatDate(split.overriddenOn)}`}>
              {split.overrideJustification}
            </Callout>
          )}
          {split && (
            <p className="text-[12.5px] text-ink-3">
              Judged under the policy as it stood on {formatDate(split.checkedAt)}. Today the window is{" "}
              {policy.splittingWindowDays == null ? "not set" : `${policy.splittingWindowDays} days`}.
            </p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          icon={<RouteIcon size={17} />}
          title="Funding gate"
          subtitle="What the funding route decides (FR-REQ-004–006)."
        />
        <CardBody className="flex flex-col gap-4">
          <KeyValues
            columns={2}
            items={[
              { label: "Funding route", value: r.fundingRouteCode ? (routeNameOf(r.fundingRouteCode) ?? "A route no longer configured") : <Badge tone="warn">Not set</Badge> },
              { label: "What it means", value: postureText },
              {
                label: "Sourcing permitted",
                value:
                  r.sourcingPermitted == null ? (gate.sourcingPermitted == null ? "Not set" : `${gate.sourcingPermitted ? "Yes" : "No"} (stored on submission)`) : r.sourcingPermitted ? "Yes" : "No",
              },
              {
                label: route?.requires ? label : "External authority",
                value: route?.requires ? (r.externalAuthorityRef ? <span className="font-mono text-[13px]">{r.externalAuthorityRef}</span> : <Badge tone="warn">Not recorded</Badge>) : "Not required on this route",
              },
            ]}
          />
          {gate.faults.length > 0 && !["APPROVED", "CANCELLED", "CLOSED"].includes(r.status) && (
            <Callout tone="warn">{gate.faults.join(" ")}</Callout>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {route?.requires && !["CANCELLED", "CLOSED"].includes(r.status) && <ExternalAuthorityDrawer id={r.id} label={label} current={r.externalAuthorityRef} />}
            {!["DRAFT", "CANCELLED", "CLOSED", "FULFILLED", "PENDING_APPROVAL"].includes(r.status) && <ChangeFundingDrawer id={r.id} current={r.fundingRouteCode} routes={routes} />}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader icon={<ShieldIcon size={17} />} title="Commitment" subtitle="No purchase order, indent, letter of acceptance or contract before approval (FR-REQ-016)." />
        <CardBody>
          {commit == null ? (
            <Callout tone="ok">Approved. A commitment may be issued against it.</Callout>
          ) : commit.code === "NO_APPROVAL_ROUTE" ? (
            <Callout tone="info">Not submitted for approval, so nothing may be committed against it.</Callout>
          ) : (
            <Callout tone="warn">
              Not approved{commit.outstanding ? `: awaiting the ${commit.outstanding}'s decision` : ""}. Nothing may be committed against it yet.
            </Callout>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {!["CANCELLED", "CLOSED"].includes(r.status) && <ErpRefsDrawer id={r.id} proc={r.erpRequisitionNo} nm={r.erpNoteNo} />}
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
  entries,
  total,
  labelFor,
}: {
  entries: Awaited<ReturnType<typeof requisitionHistory>>["entries"];
  total: number;
  /// The page's reading of stored codes and ids it can name.
  labelFor: (field: string, value: string) => string | null;
}) {
  const read = (field: string, value: string | null): string => {
    if (value == null || value === "") return "—";
    const named = labelFor(field, value);
    if (named != null) return named;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDate(value);
    if (field === "status") return STATUS_LABEL[value as keyof typeof STATUS_LABEL] ?? value;
    if (field === "verdict") return VERDICT_LABEL[value as keyof typeof VERDICT_LABEL] ?? value;
    if (field === "source") return SOURCE_LABEL[value as keyof typeof SOURCE_LABEL] ?? value;
    if (field === "decision") return DECISION_LABEL[value as keyof typeof DECISION_LABEL] ?? value;
    if (field === "tier") return TIER_LABEL[value as OrgUnitKind] ?? value;
    if (field === "splitState") return splitStateLabel(value as "CLEAR").label;
    if (field === "origin") return value === "EXTERNAL" ? "Received from the finance system" : "Raised in the portal";
    if (field === "act") return ACT_LABEL[value] ?? value;
    if (field === "cond") return condLabel(value);
    // Ids the trail stores are not shown raw. Cost centre, account and site codes are
    // business codes, printed on the forms, and read as themselves.
    if (/Id$/.test(field)) return "Another record";
    return value;
  };
  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<ClockIcon size={17} />}
        title="History"
        subtitle={
          total > entries.length
            ? `Showing the latest ${entries.length} of ${total} changes. Nobody is signed in, so no change is attributed.`
            : "Every change to this requisition and what is under it. Nobody is signed in, so no change is attributed."
        }
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
                <span className="text-[12px] text-ink-3">{formatDate(e.at)}</span>
              </div>
              {e.changes.length > 0 && (
                <ul className="text-[12.5px] break-words text-ink-3">
                  {e.changes.map((ch) => (
                    <li key={ch.field}>
                      {fieldLabel(ch.field)}: {e.action === "UPDATE" && <>{read(ch.field, ch.before)} → </>}
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

