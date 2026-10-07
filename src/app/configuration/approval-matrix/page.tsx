import { Accordion } from "@/components/accordion";
import { periodText } from "@/lib/effective-text";
import { gapMatters, gapTitle } from "@/lib/authority/gaps";
import { AuthoritySimulator } from "@/components/authority-simulator";
import { AlertTriangle, CheckIcon, SlidersIcon } from "@/components/icons";
import { ActBadge, RuleChain, type ChainStep } from "@/components/rule-chain";
import { listIssues, loadCoreRows, loadMatrix, loadRuleRows, type IssueSummary } from "@/lib/authority/load";
import { listCommittees } from "@/lib/committee/repo";
import { edgeAtBoundary, ruleChain, ruleIsDelegable } from "@/lib/authority/resolve";
import { APPROVES_ALONE, chainChoiceLabel, coreLevelFaultText, issueRefusal, originLabel } from "@/lib/authority/core-routing-labels";
import { coreChainFaultsAcross, coreLevelFaults } from "@/lib/authority/core-routing";
import { actLabel } from "@/components/ui/act";
import { formatPercentBand, formatValueBand } from "@/lib/format";
import { actWithCode, condLabel, matterLabel, methodLabel } from "@/lib/labels";
import { ORGANISATION_NAME } from "@/lib/org";
import { formatDate } from "@/lib/format";
import { loadReferenceData } from "@/lib/reference/load";
import { activeOn } from "@/lib/reference/vocabulary";
import { loadRoster } from "@/lib/people/load";
import {
  AddCoreLevel,
  AddCoreStep,
  AddMatrix,
  AddRecommender,
  AddRule,
  AddTermsBand,
  DiscardDraft,
  EditCoreLevel,
  EditMatrix,
  EndRejectionDestination,
  SetRejectionDestination,
  EditRule,
  EditTermsBand,
  IssueDraft,
  RemoveCoreLevel,
  RemoveCoreStep,
  RemoveRecommender,
  RemoveTermsBand,
  StartRevision,
} from "./editors";
import { db } from "@/lib/db";
import { bandConsistencyFaults } from "@/lib/method/boundary";
import { boundarySentence, findingText, REGIME_LABEL } from "@/lib/method/labels";
import { loadTermsBands } from "@/lib/method/repo";
import type { Regime } from "@/lib/method/types";
import { ProvenanceBadge } from "@/components/ui/provenance";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";
import { cx } from "@/components/ui/cx";
import type { Rule } from "@/lib/authority/types";
import { destinationFor, REJECTION_DOMAINS, type DestinationRow, type RejectionKind } from "@/lib/authority/rejection";
import { destinationText } from "@/lib/authority/rejection-labels";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { KeyValues, Stat } from "@/components/ui/stat";
import { ActionsCol, RowActions, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { HistoryButton } from "@/components/history-drawer";
import { requireStaff } from "@/app/_auth/actor";

export const dynamic = "force-dynamic";

/// The band tiles sit inside a card, so they are flat and their figures a size down.

/// Where an issue stands today. Read from its dates and whether it was issued.
function stateOf(issue: IssueSummary, on: Date): { label: string; tone: "ok" | "info" | "warn" | "neutral" } {
  if (!issue.issuedAt) return { label: "Draft", tone: "warn" };
  if (issue.effectiveFrom > on) return { label: `Issued · starts ${formatDate(issue.effectiveFrom)}`, tone: "info" };
  if (issue.effectiveTo && issue.effectiveTo <= on) return { label: "Superseded", tone: "neutral" };
  return { label: "In force", tone: "ok" };
}

export default async function ApprovalMatrixPage({
  searchParams,
}: {
  searchParams: Promise<{ issue?: string }>;
}) {
  const actor = await requireStaff();
  const { issue: requested } = await searchParams;
  // The vocabulary this customer has configured. Which funding routes override the
  // matrix is a property of the route, not of its name.
  const on = new Date();
  const reference = await loadReferenceData(actor.organisationCode);
  const fundingRoutes = activeOn(reference.fundingRoutes, on);
  const sourcingMethods = activeOn(reference.sourcingMethods, on);
  // FR-APR-002: the contract types a rule may be confined to, by their names.
  const contractTypeOptions = activeOn(reference.contractTypes, on).map((t) => ({ code: t.code, nameEn: t.nameEn }));
  const contractTypeName = (code: string) => reference.contractTypes.find((t) => t.code === code)?.nameEn ?? "A contract type no longer configured";

  /// A rule's `method` is an authority-matrix key, and `authorityMethodKey` is what
  /// binds a configured sourcing method to it. Where the customer has named the
  /// method, that name wins; the built-in wording is only a fallback for a key no
  /// configured method has claimed.
  const methodName = (code: string) =>
    sourcingMethods.find((m) => m.authorityMethodKey === code)?.nameEn ?? methodLabel(code);

  const roster = await loadRoster(actor.organisationCode);
  const orgRow = await db.organisation.findUnique({ where: { code: actor.organisationCode }, select: { id: true } });
  const destinations: DestinationRow[] = orgRow
    ? (await db.rejectionDestination.findMany({ where: { organisationId: orgRow.id } })).map((d) => ({ ...d, kind: d.kind as RejectionKind, provenance: d.provenance as DestinationRow["provenance"] }))
    : [];
  const offices = roster.offices.map((o) => ({ code: o.code, nameEn: o.nameEn }));

  // Which issue to show: the one asked for, else the one in force, else a draft. A
  // funder's rule set is shown only when asked for: the defaults, "in force" and the
  // draft to open all mean the organisation's own limits, as routing does.
  const issues = await listIssues(actor.organisationCode);
  const own = issues.filter((i) => i.fundingRouteCode == null);
  const inForceOf = (list: IssueSummary[]) =>
    list.find((i) => i.issuedAt && i.effectiveFrom <= on && (i.effectiveTo == null || i.effectiveTo > on)) ?? null;
  const inForceNow = inForceOf(own);
  const selected = issues.find((i) => i.id === requested) ?? inForceNow ?? own.find((i) => !i.issuedAt) ?? issues[0] ?? null;
  // The route this issue belongs to, and its siblings on that route.
  const selectedRoute = selected?.fundingRouteCode ?? null;
  const sameRoute = issues.filter((i) => i.fundingRouteCode === selectedRoute);
  const draftIssue = sameRoute.find((i) => !i.issuedAt) ?? null;
  const replaces = inForceOf(sameRoute);
  const routeName = (code: string | null) =>
    code == null ? null : (reference.fundingRoutes.find((r) => r.code === code)?.nameEn ?? "A funding route no longer configured");
  const funderRoutes = fundingRoutes.filter((r) => r.supersedesAuthority).map((r) => ({ code: r.code, nameEn: r.nameEn }));

  if (!selected) {
    return (
      <>
        <PageHeader
          title="Approval matrix"
          badge={<Badge tone="warn">Not set</Badge>}
          subtitle="Who proposes, who recommends and who approves, at every value."
        />

        <Card>
          <EmptyState title="No approval limits yet" action={<AddMatrix />}>
            {ORGANISATION_NAME} has no authority limits, so the portal cannot say who
            approves anything. Draft the first issue, add its rules, then issue it.
          </EmptyState>
        </Card>
      </>
    );
  }

  const matrix = await loadMatrix(actor.organisationCode, on, selected.id);
  const matrixId = selected.id;
  const editable = !selected.issuedAt;
  const noRules = matrix.rules.length === 0;
  const baseState = stateOf(selected, on);
  // An issued set with no rules routes nothing: never a green "In force" on its own.
  const state =
    noRules && selected.issuedAt && baseState.label === "In force"
      ? { label: "In force · no rules supplied", tone: "warn" as const }
      : baseState;
  const inForce = baseState.label === "In force";
  // Row ids only where they are needed: a draft's rules are the only ones that change.
  const ruleRows = editable ? await loadRuleRows(selected.id) : {};
  // The terms family and the boundary ruling (6.3).
  const [termsBands, boundaryMeta] = await Promise.all([
    loadTermsBands(selected.id),
    db.authorityMatrix.findUniqueOrThrow({ where: { id: selected.id }, select: { boundaryProvenance: true, boundarySource: true } }),
  ]);
  const consistency = bandConsistencyFaults(matrix, termsBands);
  // The core routing (FR-APR-004): this issue's own rows, in the offices' order, and the
  // flagged rules that would not issue against it.
  const officeName = (code: string) => matrix.roles[code]?.nameEn ?? "An office no longer configured";
  const officeOrder = new Map(roster.offices.map((o, i) => [o.code, i]));
  const coreRows = (await loadCoreRows(selected.id)).sort(
    (a, b) => (officeOrder.get(a.approverCode) ?? 999) - (officeOrder.get(b.approverCode) ?? 999) || a.sortOrder - b.sortOrder,
  );
  const coreRefusals = [
    ...(matrix.coreRouting ?? []).flatMap((level) =>
      coreLevelFaults(level, matrix.roles).map((f) => ({ key: `level-${level.approverCode}-${f.fault}-${f.roleCode}`, rule: null as Rule | null, text: `The core routing for ${officeName(level.approverCode)}: ${coreLevelFaultText(f.fault, officeName(f.roleCode))}` })),
    ),
    ...coreChainFaultsAcross(matrix.rules, matrix.coreRouting ?? [], matrix.roles).map((f) => ({
      key: `rule-${f.rule.ruleKey}`,
      rule: f.rule as Rule | null,
      text: issueRefusal(f.fault, f.rule.labelEn, f.roleCode ? officeName(f.roleCode) : "its approver"),
    })),
  ];
  const refusedDomains = new Set(coreRefusals.map((x) => x.rule?.domain).filter(Boolean));
  const requisitionRules = matrix.rules.filter((r) => r.domain === "requisition" && !r.cond).sort((a, b) => (a.minValue ?? -1) - (b.minValue ?? -1));
  const appointmentRules = matrix.rules.filter((r) => r.domain === "appointment");

  // A rule may route to an office or to a committee; the two are kept apart, so look
  // in both before admitting the code is unknown.
  const committeeNames = new Map((await listCommittees(actor.organisationId)).map((c) => [c.code, c.nameEn]));
  const roleName = (code: string | null) =>
    code == null
      ? null
      : (matrix.roles[code]?.nameEn ?? committeeNames.get(code) ?? "Unknown office or committee");

  // The resolver's own chain for each rule — generated from the core routing where the
  // rule takes it from there — never the rule's fields restated (6.9 ruling C3). A
  // generated step says where it came from.
  const chainFor = (rule: Rule): ChainStep[] =>
    ruleChain(matrix, rule).steps.map((s) => ({
      role: roleName(s.roleCode)!,
      act: s.act,
      ...(s.origin ? { meta: originLabel(s.origin) } : {}),
    }));

  /// Where a rule's chain beneath the approver comes from, in words, with what the
  /// resolver says about it: not set, generated, as entered with its reason, or a fault.
  const chainNote = (rule: Rule) => {
    const { warnings } = ruleChain(matrix, rule);
    const fault = warnings.find((w) => w.level === "err");
    const unchecked = warnings.find((w) => w.code === "CORE_NOT_CHECKED");
    if (fault) return <Badge tone="err">Does not fit the core routing</Badge>;
    if (rule.generateCoreChain === true && unchecked)
      return <span className="text-amber-800">{`${chainChoiceLabel(true)} · no core routing for ${officeName(rule.approverCode ?? "")} on this issue`}</span>;
    if (rule.generateCoreChain === false) return <span>{`${chainChoiceLabel(false)} · ${rule.coreChainReason ?? "reason not recorded"}`}</span>;
    if (rule.generateCoreChain === true) return <span>{chainChoiceLabel(true)}</span>;
    return <span>{`Chain beneath: ${chainChoiceLabel(null).toLowerCase()} · not checked against core routing`}</span>;
  };

  const byDomain = new Map<string, Rule[]>();
  for (const rule of matrix.rules) {
    const list = byDomain.get(rule.domain) ?? [];
    list.push(rule);
    byDomain.set(rule.domain, list);
  }
  const domains = [...byDomain.entries()].sort((a, b) => b[1].length - a[1].length);

  const fixed = matrix.rules.filter((r) => !ruleIsDelegable(r)).length;
  const gapList = gapMatters(matrix.rules);
  const gaps = gapList.length;
  const committees = new Set(matrix.rules.map((r) => r.committeeCode).filter(Boolean)).size;

  return (
    <>
      <PageHeader
        title="Approval matrix"
        badge={
          <>
            <Badge tone={state.tone} dot>{`${selected.label} · ${state.label}`}</Badge>
            {selectedRoute && <Badge tone="info">{`Funder rule set · ${routeName(selectedRoute)}`}</Badge>}
          </>
        }
        subtitle="Who proposes, who recommends and who approves, at every value."
        meta={
          noRules
            ? ["Rules not supplied"]
            : [
                `${matrix.rules.length} ${matrix.rules.length === 1 ? "rule" : "rules"}`,
                `${domains.length} decision ${domains.length === 1 ? "type" : "types"}`,
                `${committees} ${committees === 1 ? "committee" : "committees"} involved`,
                `${fixed} cannot be delegated`,
              ]
        }
        actions={
          <>
          <HistoryButton entity="AuthorityMatrix" entityId={matrixId} label={selected.label} />
          {editable ? (
          <>
            <EditMatrix
              matrix={{
                id: matrixId,
                label: selected.label,
                effectiveFrom: selected.effectiveFrom,
                effectiveTo: null,
                boundaryValue: matrix.policy.boundaryValue,
                boundaryInclusive: matrix.policy.boundaryInclusive,
                quotationFloor: matrix.policy.quotationFloor,
                tenderFloor: matrix.policy.tenderFloor,
                requisitionBoundary: matrix.policy.requisitionBoundary,
                currency: matrix.policy.currency,
                fundingRouteCode: selectedRoute,
                boundaryProvenance: boundaryMeta.boundaryProvenance,
                boundarySource: boundaryMeta.boundarySource,
                noRuleClause: matrix.policy.clauses?.noRule ?? null,
                selfApprovalClause: matrix.policy.clauses?.selfApproval ?? null,
                absenceClause: matrix.policy.clauses?.absence ?? null,
                funderOverrideClause: matrix.policy.clauses?.funderOverride ?? null,
              }}
              routes={funderRoutes}
            />
            <AddRule matrixId={matrixId} offices={offices} contractTypes={contractTypeOptions} />
            <DiscardDraft id={matrixId} label={selected.label} />
            <IssueDraft
              id={matrixId}
              label={selected.label}
              meantFrom={selected.effectiveFrom}
              replaces={replaces?.label ?? null}
            />
          </>
          ) : draftIssue ? (
            <ButtonLink href={`?issue=${draftIssue.id}`} variant="primary" size="sm">
              Open draft {draftIssue.label}
            </ButtonLink>
          ) : (
            <StartRevision fromId={matrixId} fromLabel={selected.label} />
          )}
          {funderRoutes.length > 0 && selectedRoute == null && (
            <AddMatrix
              routes={funderRoutes}
              primary={false}
              label="Draft a funder's rule set"
              title="Draft a funder's rule set"
            />
          )}
          </>
        }
      />

      {issues.length > 1 && (
        <nav aria-label="Issues" className="-mt-2 mb-5 flex flex-wrap items-center gap-2">
          <span className="text-[12.5px] font-semibold text-ink-3">Issues</span>
          {issues.map((i) => {
            const s = stateOf(i, on);
            return (
              <Link
                key={i.id}
                href={`?issue=${i.id}`}
                aria-current={i.id === selected.id ? "page" : undefined}
                className={cx(
                  "rounded-full border px-3 py-1 text-[12.5px] no-underline transition hover:no-underline",
                  i.id === selected.id
                    ? "border-brand-300 bg-brand-50 font-semibold text-brand-800"
                    : "border-line-2 bg-surface text-ink-2 hover:border-ink-4",
                )}
              >
                {i.label} <span className="text-ink-3">· {i.fundingRouteCode ? `Funder rule set · ${routeName(i.fundingRouteCode)} · ` : ""}{s.label}</span>
              </Link>
            );
          })}
        </nav>
      )}

      <div className="flex flex-col gap-6">
        {editable ? (
          <Callout tone="warn" title="This is a draft">
            Nothing in it routes a matter until it is issued. Change the thresholds and rules
            here, then issue it from a date. The simulator below still uses the issue in force.
          </Callout>
        ) : inForce && selectedRoute ? (
          <Callout tone="info" title={`In force since ${formatDate(selected.effectiveFrom)}`}>
            A funder&apos;s rule set. It routes only requisitions whose funding route is &ldquo;{routeName(selectedRoute)}&rdquo;, in place of the
            organisation&apos;s limits, where it has a rule for the matter. Otherwise the organisation&apos;s limits route them, and
            the approval trail says the funder&apos;s rules were not applied.
          </Callout>
        ) : inForce ? (
          <Callout tone="info" title={`In force since ${formatDate(selected.effectiveFrom)}`}>
            These rules route every approval in the portal. Once issued, an issue cannot be changed,
            so a decision can always be shown the rules it ran under. To change them, start a new
            issue.
          </Callout>
        ) : (
          <Callout tone="info" title={state.label}>
            {selected.effectiveTo
              ? `In force ${periodText(selected)}. Kept so decisions taken under it can be shown the rules they ran under.`
              : `Issued to come into force on ${formatDate(selected.effectiveFrom)}.`}
          </Callout>
        )}

        <Card>
          <CardHeader
            icon={<SlidersIcon size={17} />}
            title="Value bands"
            subtitle="Thresholds applied to every routing decision."
          />
          <CardBody className="flex flex-col gap-6">
            <div className="grid gap-4 md:grid-cols-3">
              <Stat
                tone="neutral"
                label="Below the quotation floor"
                value={`≤ ${formatValueBand(null, matrix.policy.quotationFloor).replace("≤ ", "")}`}
                hint="Matters valued at or below the quotation floor."
                variant="inset"
                size="sm"
              />
              <Stat
                tone="neutral"
                label="Quotation band"
                value={formatValueBand(matrix.policy.quotationFloor, matrix.policy.tenderFloor)}
                hint="Above the quotation floor, up to where the bands meet."
                variant="inset"
                size="sm"
              />
              <Stat
                tone="neutral"
                label="Tender band"
                value={formatValueBand(matrix.policy.tenderFloor, null)}
                hint="Above the point where the bands meet."
                variant="inset"
                size="sm"
              />
            </div>

            <KeyValues
              columns={2}
              className="border-t border-line pt-6"
              items={[
                {
                  label: "Where the bands meet",
                  value: (
                    <span className="tabular-nums">
                      {formatValueBand(null, matrix.policy.boundaryValue).replace("≤ ", "")}
                    </span>
                  ),
                },
                {
                  label: "A value exactly on the boundary",
                  value: (
                    <span>{boundarySentence(matrix.policy.boundaryInclusive ? "GT" : "GTE", String(matrix.policy.boundaryValue), boundaryMeta.boundaryProvenance)}</span>
                  ),
                },
                {
                  // ADR 0024 Amendment 1 (6.13 Part A step 1): percentage band edges follow the same switch.
                  label: "A percentage exactly on a band edge",
                  // BD-613-5 ruling: the line carries the boundary ruling's provenance, as the side it reads is that ruling's.
                  value: (
                    <span className="flex flex-col items-start gap-1">
                      <span>{matrix.policy.boundaryInclusive ? "Falls in the band the edge closes: up to and including it (a variation of exactly 10.00% sits in the band ending at 10%)." : "Falls in the band the edge opens: from it upwards (a variation of exactly 10.00% sits in the band starting at 10%)."} Judged on the exact ratio of the two amounts, never a rounded figure.</span>
                      <ProvenanceBadge value={boundaryMeta.boundaryProvenance} />
                    </span>
                  ),
                },
                {
                  label: "Boundary ruling",
                  value: (
                    <span className="flex flex-col items-start gap-1">
                      <ProvenanceBadge value={boundaryMeta.boundaryProvenance} />
                      <span className="text-[12.5px] text-ink-3">
                        {boundaryMeta.boundarySource ||
                          (boundaryMeta.boundaryProvenance === "STATED" ? "Source not recorded" : "No written ruling: every case exactly on the boundary is recorded as an exception")}
                      </span>
                    </span>
                  ),
                },
                {
                  label: "Requisition boundary",
                  value: (
                    <span className="flex flex-col">
                      <span className="tabular-nums">{formatValueBand(null, matrix.policy.requisitionBoundary).replace("≤ ", "")}</span>
                      <span className="text-[12.5px] text-ink-3">Shown for reference: who approves a requisition is set by the requisition rules below.</span>
                    </span>
                  ),
                },
              ]}
            />

            <Callout tone="warn" title="The boundary itself is a policy choice">
              A works package valued at exactly{" "}
              <span className="font-semibold tabular-nums">
                {formatValueBand(null, matrix.policy.boundaryValue).replace("≤ ", "")}
              </span>{" "}
              sits in the{" "}
              <span className="font-semibold">
                {matrix.policy.boundaryInclusive ? "quotation" : "tender"}
              </span>{" "}
              band under the current setting — a different committee, a different approver and a
              different award instrument from the other reading. Among the ringgit bands only this
              exact value is affected; a percentage band edge follows the same setting.
            </Callout>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            icon={<SlidersIcon size={17} />}
            title="Three band families"
            subtitle="Requisition approval, procurement method and contract terms, held separately. None reads another's edges."
          />
          <CardBody className="grid gap-4 md:grid-cols-3">
            <div className="min-w-0 rounded-2xl border border-line/60 bg-sunken p-4">
              <h4 className="text-[13px] font-semibold text-ink-2">Requisition approval</h4>
              {requisitionRules.length === 0 ? (
                <p className="mt-2 text-[13px] text-ink-3">No requisition rules on this issue.</p>
              ) : (
                <ul className="mt-2 flex flex-col gap-1.5 text-[13px]">
                  {requisitionRules.map((r) => (
                    <li key={r.ruleKey} className="flex flex-wrap justify-between gap-x-2">
                      <span className="tabular-nums text-ink">{formatValueBand(r.minValue, r.maxValue)}</span>
                      <span className="min-w-0 break-words text-ink-2">{roleName(r.approverCode) ?? "No approver"}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="min-w-0 rounded-2xl border border-line/60 bg-sunken p-4">
              <h4 className="text-[13px] font-semibold text-ink-2">Procurement method</h4>
              <ul className="mt-2 flex flex-col gap-1.5 text-[13px]">
                <li className="flex flex-wrap justify-between gap-x-2"><span className="tabular-nums text-ink">{formatValueBand(null, matrix.policy.quotationFloor)}</span><span className="text-ink-2">{REGIME_LABEL.below}</span></li>
                <li className="flex flex-wrap justify-between gap-x-2"><span className="tabular-nums text-ink">{formatValueBand(matrix.policy.quotationFloor, matrix.policy.tenderFloor)}</span><span className="text-ink-2">{REGIME_LABEL.quotation}</span></li>
                <li className="flex flex-wrap justify-between gap-x-2"><span className="tabular-nums text-ink">{formatValueBand(matrix.policy.tenderFloor, null)}</span><span className="text-ink-2">{REGIME_LABEL.tender}</span></li>
              </ul>
              <p className="mt-2 text-[12.5px] text-ink-3">{appointmentRules.length} appointment {appointmentRules.length === 1 ? "rule" : "rules"} decide who approves, by method.</p>
            </div>
            <div className="min-w-0 rounded-2xl border border-line/60 bg-sunken p-4">
              <h4 className="text-[13px] font-semibold text-ink-2">Contract terms</h4>
              {termsBands.length === 0 ? (
                <p className="mt-2 text-[13px] text-ink-3">Not set: no terms bands on this issue.</p>
              ) : (
                <ul className="mt-2 flex flex-col gap-1.5 text-[13px]">
                  {termsBands.map((t) => (
                    <li key={t.bandKey} className="flex flex-col">
                      <span className="tabular-nums text-ink">{formatValueBand(t.minValue, t.maxValue)}{t.regime ? ` · ${REGIME_LABEL[t.regime as Regime].toLowerCase()}` : " · every regime"}</span>
                      <span className="break-words text-ink-2">{t.labelEn}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardBody>
        </Card>

        {consistency.map((f, i) => (
          <Callout key={i} tone="warn" title="The boundary could fall differently in two families">
            {findingText(f)}
          </Callout>
        ))}

        <Card className="overflow-hidden">
          <CardHeader
            icon={<SlidersIcon size={17} />}
            title="Contract terms bands"
            subtitle="Which terms set applies at a value — never the retention or defects figures."
            actions={editable ? <AddTermsBand matrixId={matrixId} /> : <Badge outline>{termsBands.length} {termsBands.length === 1 ? "band" : "bands"}</Badge>}
          />
          {termsBands.length === 0 ? (
            <EmptyState size="sm" title="Not set">
              No contract terms bands are set on this issue, so an exercise shows which terms set applies as not set.
              {editable ? " Add them here." : " Add them on a new issue."}
            </EmptyState>
          ) : (
            <Table stack minWidth={editable ? 820 : 720}>
              <colgroup>
                <col style={{ width: "18%" }} />
                <col />
                <col style={{ width: "17%" }} />
                <col style={{ width: "17%" }} />
                <col style={{ width: "14%" }} />
                {editable && <ActionsCol icons={2} />}
              </colgroup>
              <THead>
                <Th>Value band</Th>
                <Th>Terms set</Th>
                <Th>Applies in</Th>
                <Th>Retention · defects</Th>
                <Th>Source</Th>
                {editable && <Th className="text-right">Change</Th>}
              </THead>
              <tbody>
                {termsBands.map((t) => (
                  <Tr key={t.id}>
                    <Td label="Value band" className="align-top font-semibold tabular-nums">{formatValueBand(t.minValue, t.maxValue)}</Td>
                    <Td label="Terms set" className="align-top break-words">
                      {t.labelEn}
                      {t.insuranceNote && <div className="text-[12.5px] text-ink-3">{t.insuranceNote}</div>}
                    </Td>
                    <Td label="Applies in" className="align-top text-[13px] text-ink-2">{t.regime ? REGIME_LABEL[t.regime as Regime] : "Every regime"}</Td>
                    <Td label="Retention · defects" className="align-top text-[13px] text-ink-2">
                      {t.retentionApplies == null ? "Not set" : t.retentionApplies ? "Retention" : "No retention"} · {t.defectsLiabilityApplies == null ? "not set" : t.defectsLiabilityApplies ? "defects liability" : "no defects liability"}
                    </Td>
                    <Td label="Source" className="align-top">
                      <div className="flex min-w-0 flex-col items-start gap-1">
                        <ProvenanceBadge value={t.provenance} />
                        {t.clause && <span className="max-w-full truncate text-[12.5px] text-ink-3">{t.clause}</span>}
                      </div>
                    </Td>
                    {editable && (
                      <Td label="Change" className="align-top">
                        <RowActions>
                          <EditTermsBand matrixId={matrixId} band={t} />
                          <RemoveTermsBand id={t.id} label={t.labelEn} />
                        </RowActions>
                      </Td>
                    )}
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card className="overflow-hidden">
          <CardHeader
            icon={<SlidersIcon size={17} />}
            title="Core routing"
            subtitle="The chain every approval carries beneath it, by the office that approves."
            actions={editable ? <AddCoreLevel matrixId={matrixId} offices={offices} /> : <Badge outline>{coreRows.length} {coreRows.length === 1 ? "office" : "offices"}</Badge>}
          />
          {coreRefusals.length > 0 && (
            <div className="px-5 pb-4 sm:px-6">
              <Callout tone="err" title={coreRefusals.length === 1 ? "One rule or row would stop this issue being issued" : `${coreRefusals.length} rules or rows would stop this issue being issued`}>
                <ul className="mt-1 flex flex-col gap-2">
                  {coreRefusals.map((x) => (
                    <li key={x.key} className="flex flex-wrap items-start gap-2">
                      <span className="min-w-0 flex-1 break-words">{x.text}</span>
                      {editable && x.rule && ruleRows[x.rule.ruleKey] && (
                        <RuleActions rule={x.rule} row={ruleRows[x.rule.ruleKey]} matrixId={matrixId} offices={offices} contractTypes={contractTypeOptions} />
                      )}
                    </li>
                  ))}
                </ul>
              </Callout>
            </div>
          )}
          {coreRows.length === 0 ? (
            <EmptyState size="sm" title="Not set">
              Until core routing is recorded, every route uses the chain entered on its rule and says it has not been checked.
              {editable ? " Add a row for each office that approves." : " Record it on a new issue."}
            </EmptyState>
          ) : (
            <Table stack minWidth={editable ? 820 : 720}>
              <colgroup>
                <col style={{ width: "22%" }} />
                <col />
                <col style={{ width: "18%" }} />
                {editable && <ActionsCol icons={3} />}
              </colgroup>
              <THead>
                <Th>Approved by</Th>
                <Th>Chain beneath</Th>
                <Th>Source</Th>
                {editable && <Th className="text-right">Change</Th>}
              </THead>
              <tbody>
                {coreRows.map((level) => (
                  <Tr key={level.id}>
                    <Td label="Approved by" className="align-top">
                      <div className="font-semibold break-words text-ink">{officeName(level.approverCode)}</div>
                      {level.note && <div className="text-[12.5px] break-words text-ink-3">{level.note}</div>}
                    </Td>
                    <Td label="Chain beneath" className="align-top">
                      {level.steps.length === 0 ? (
                        <span className="text-[13px] text-ink-2">{APPROVES_ALONE.en}</span>
                      ) : (
                        <ol className="flex flex-col gap-1.5">
                          {level.steps.map((step, i) => (
                            <li key={step.id} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
                              <ActBadge act={step.act} step={i + 1} />
                              <span className="font-medium break-words text-ink">{officeName(step.roleCode)}</span>
                              <span className="text-ink-3">· {actLabel(step.act)}</span>
                              {step.provenance !== level.provenance && <ProvenanceBadge value={step.provenance} />}
                              {step.note && <span className="text-[12.5px] break-words text-ink-3">· {step.note}</span>}
                              {editable && <RemoveCoreStep id={step.id} label={`${officeName(step.roleCode)} from the core routing for ${officeName(level.approverCode)}`} />}
                            </li>
                          ))}
                        </ol>
                      )}
                    </Td>
                    <Td label="Source" className="align-top">
                      <div className="flex min-w-0 flex-col items-start gap-1">
                        <ProvenanceBadge value={level.provenance} />
                        {level.clause && <span className="max-w-full break-words text-[12.5px] text-ink-3">{level.clause}</span>}
                      </div>
                    </Td>
                    {editable && (
                      <Td label="Change" className="align-top">
                        <RowActions>
                          <AddCoreStep levelId={level.id} officeName={officeName(level.approverCode)} offices={offices} />
                          <EditCoreLevel matrixId={matrixId} offices={offices} level={level} officeName={officeName(level.approverCode)} />
                          <RemoveCoreLevel id={level.id} officeName={officeName(level.approverCode)} />
                        </RowActions>
                      </Td>
                    )}
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader
            icon={<SlidersIcon size={17} />}
            title="Routing rules"
            subtitle="Rules grouped by decision type."
            actions={<Badge outline>{matrix.rules.length} rules</Badge>}
          />
          <CardBody className="flex flex-col gap-3">
            {domains.length === 0 && (
              <EmptyState size="sm" title="No rules">
                {selectedRoute
                  ? "The funder's rules have not been supplied, so nothing is routed by them: every matter on this route is routed by the organisation's limits, with a warning."
                  : "No rule has been added to this issue yet."}
              </EmptyState>
            )}
            {domains.map(([domain, rules], i) => (
              <Accordion
                key={domain}
                title={matterLabel(domain)}
                meta={`${rules.length} ${rules.length === 1 ? "rule" : "rules"}`}
                defaultOpen={i === 0 || refusedDomains.has(domain)}
              >
                <Table stack minWidth={editable ? 920 : 820}>
                  <colgroup>
                    <col style={{ width: editable ? "13%" : "15%" }} />
                    <col style={{ width: editable ? "13%" : "14%" }} />
                    <col />
                    <col style={{ width: editable ? "15%" : "16%" }} />
                    <col style={{ width: editable ? "13%" : "15%" }} />
                    {editable && <ActionsCol icons={2} />}
                  </colgroup>
                  <THead>
                    <Th>Value band</Th>
                    <Th>Method</Th>
                    <Th>Route</Th>
                    <Th>Committee</Th>
                    <Th>Delegation</Th>
                    {editable && <Th className="text-right">Change</Th>}
                  </THead>
                  <tbody>
                    {rules.map((rule, r) => {
                      // A rule is banded either by ringgit or by percentage of the
                      // contract sum; variations use the latter.
                      const pct = formatPercentBand(rule.pctMin, rule.pctMax, matrix.policy.boundaryInclusive);
                      const band = pct ?? formatValueBand(rule.minValue, rule.maxValue);
                      const contract =
                        !pct && (rule.contractValueMin != null || rule.contractValueMax != null)
                          ? `contract ${formatValueBand(rule.contractValueMin, rule.contractValueMax)}`
                          : null;
                      const committee = rule.committeeCode ? roleName(rule.committeeCode) : null;
                      return (
                        <Tr key={r}>
                          <Td label="Value band" className="align-top">
                            <div className="font-semibold break-words text-ink tabular-nums">
                              {band}
                            </div>
                            {pct && (
                              <div className="text-[12.5px] text-ink-3">of the contract sum</div>
                            )}
                            {contract && (
                              <div className="text-[12.5px] break-words text-ink-3">{contract}</div>
                            )}
                            {rule.cond && (
                              <div className="text-[12.5px] break-words text-ink-3">{condLabel(rule.cond)}</div>
                            )}
                            {edgeAtBoundary(rule, matrix.policy) && (
                              // Its own line, as text: a badge this long clipped in the
                              // band column at 1280.
                              <div className="mt-1 text-[12.5px] break-words text-ink-3">
                                {rule.followsBoundarySwitch == null ? (
                                  <Badge tone="err">Boundary not decided</Badge>
                                ) : rule.followsBoundarySwitch ? (
                                  "At the boundary: follows the switch"
                                ) : (
                                  "At the boundary: ignores the switch"
                                )}
                              </div>
                            )}
                          </Td>
                          <Td label="Method" className="align-top text-[13px] text-ink-2 [overflow-wrap:normal]">
                            {rule.method ? methodName(rule.method) : "Any method"}
                            {rule.contractTypeCode && <div className="mt-1 text-[12.5px] break-words text-ink-3">{`Contract type: ${contractTypeName(rule.contractTypeCode)}`}</div>}
                          </Td>
                          <Td label="Route" className="align-top">
                            <RuleChain steps={chainFor(rule)} />
                            <div className="mt-1 text-[12.5px] break-words text-ink-3">{chainNote(rule)}</div>
                            {editable && (ruleRows[rule.ruleKey]?.recommenders.length ?? 0) > 0 && (
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {ruleRows[rule.ruleKey]!.recommenders.map((step) => {
                                  const text = `${roleName(step.roleCode)} · ${actWithCode(step.act)}`;
                                  return (
                                    <span
                                      key={step.id}
                                      className="inline-flex max-w-full items-center gap-1 rounded-full bg-ink/[0.05] py-0.5 pr-0.5 pl-2.5 text-[12px] text-ink-2"
                                    >
                                      <span className="truncate" title={text}>
                                        {text}
                                      </span>
                                      <RemoveRecommender
                                        id={step.id}
                                        label={`${roleName(step.roleCode)} from this rule`}
                                      />
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </Td>
                          <Td label="Committee" className="align-top">
                            {committee ? (
                              <div className="flex min-w-0 flex-col items-start gap-1">
                                <span className="text-[13px] font-semibold break-words text-ink">
                                  {committee}
                                </span>
                                {rule.committeeAct && (
                                  <span className="inline-flex items-start gap-1.5 text-[12px] text-ink-2">
                                    <ActBadge act={rule.committeeAct} />
                                    <span className="pt-0.5 leading-tight">
                                      {actWithCode(rule.committeeAct)}
                                    </span>
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-ink-4">—</span>
                            )}
                          </Td>
                          <Td label="Delegation" className="align-top">
                            {!ruleIsDelegable(rule) ? (
                              <Badge tone="warn">
                                <AlertTriangle size={12} />
                                Fixed
                              </Badge>
                            ) : (
                              <Badge tone="ok">
                                <CheckIcon size={12} />
                                May delegate
                              </Badge>
                            )}
                          </Td>
                          {editable && (
                            <Td label="Change" className="align-top">
                              <RuleActions
                                rule={rule}
                                row={ruleRows[rule.ruleKey]}
                                matrixId={matrixId}
                                offices={offices}
                                contractTypes={contractTypeOptions}
                              />
                            </Td>
                          )}
                        </Tr>
                      );
                    })}
                  </tbody>
                </Table>
              </Accordion>
            ))}
          </CardBody>
        </Card>

        {gaps > 0 && (
          <Callout
            tone="warn"
            title={gapTitle(gapList)}
          >
            No limit has ever been set for who may authorise {gaps === 1 ? "this" : "these"}: {gapList.map((g) => g.label).join("; ")}. Work is still routed so
            nothing stalls, but the route is an assumption.
          </Callout>
        )}

        {!selectedRoute && (
          <Card className="overflow-hidden">
            <CardHeader
              icon={<SlidersIcon size={17} />}
              title="When a matter is rejected"
              subtitle="Where a matter goes when a step rejects it, by matter type. None ships: unset, the officer chooses and the choice is recorded as theirs. A committee step follows the committee's own not-carried outcome."
            />
            <Table stack minWidth={720}>
              <colgroup>
                <col style={{ width: "24%" }} />
                <col />
                <col style={{ width: "15%" }} />
                <col style={{ width: "15%" }} />
                <ActionsCol icons={0} labelled={2} />
              </colgroup>
              <THead>
                <Th>Matter type</Th>
                <Th>Where it goes</Th>
                <Th>Source</Th>
                <Th>Since</Th>
                <Th className="text-right">Actions</Th>
              </THead>
              <tbody>
                {REJECTION_DOMAINS.map((domain) => {
                  const found = destinationFor(destinations, domain, on);
                  const row = found.set ? found.row : null;
                  const office = row?.returnToRoleCode ? (offices.find((o) => o.code === row.returnToRoleCode)?.nameEn ?? "An office no longer configured") : null;
                  const label = matterLabel(domain);
                  return (
                    <Tr key={domain}>
                      <Td label="Matter type" className="font-semibold text-ink">{label}</Td>
                      <Td label="Where it goes" className="text-ink-2">
                        {row ? (
                          <span className="break-words">{destinationText(row.kind, office)}</span>
                        ) : (
                          <span className="flex flex-col items-start gap-1">
                            <Badge tone="warn">Not set</Badge>
                            <span className="text-[12.5px] text-ink-3">The officer chooses, recorded as their choice.</span>
                          </span>
                        )}
                      </Td>
                      <Td label="Source">{row ? <ProvenanceBadge value={row.provenance} /> : <span className="text-ink-3">—</span>}</Td>
                      <Td label="Since" className="text-ink-2">{row ? formatDate(row.effectiveFrom) : "—"}</Td>
                      <Td>
                        <RowActions>
                          <SetRejectionDestination domain={domain} label={label} offices={offices} current={row ? { kind: row.kind, returnToRoleCode: row.returnToRoleCode } : null} />
                          {row && <EndRejectionDestination id={row.id} label={label} />}
                        </RowActions>
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>
        )}

        {!selectedRoute && (
                <Card tone="brand">
          <CardHeader
            icon={<SlidersIcon size={17} />}
            title="Simulator"
            subtitle="Resolve the approval route for a given case."
          />
          <CardBody>
            <AuthoritySimulator
              domains={[...byDomain.keys()]
                .sort((a, b) => matterLabel(a).localeCompare(matterLabel(b)))
                .map((code) => ({ code, label: matterLabel(code) }))}
              methods={[
                ...new Set(matrix.rules.map((r) => r.method).filter((m): m is string => !!m)),
              ]
                .sort()
                .map((code) => ({ code, label: methodName(code) }))}
              roles={Object.values(matrix.roles)
                .map((r) => ({ code: r.code, name: r.nameEn }))
                .sort((a, b) => a.name.localeCompare(b.name))}
              fundingRoutes={fundingRoutes.map((r) => ({ code: r.code, label: r.nameEn }))}
            />
          </CardBody>
        </Card>
        )}
      </div>
    </>
  );
}

/// A draft rule's controls: edit it, and add a step before the approver. Steps are
/// removed where they are shown, in the route.
function RuleActions({
  rule,
  row,
  matrixId,
  offices,
  contractTypes,
}: {
  rule: Rule;
  row: { id: string } | undefined;
  matrixId: string;
  offices: { code: string; nameEn: string }[];
  contractTypes: { code: string; nameEn: string }[];
}) {
  if (!row) return null;
  return (
    <RowActions>
      <EditRule
        matrixId={matrixId}
        offices={offices}
        contractTypes={contractTypes}
        rule={{
          id: row.id,
          ruleKey: rule.ruleKey,
          domain: rule.domain,
          method: rule.method,
          contractTypeCode: rule.contractTypeCode ?? null,
          minValue: rule.minValue,
          maxValue: rule.maxValue,
          followsBoundarySwitch: rule.followsBoundarySwitch,
          labelEn: rule.labelEn,
          labelMs: rule.labelMs,
          proposerCode: rule.proposerCode,
          approverCode: rule.approverCode,
          committeeCode: rule.committeeCode,
          committeeAct: rule.committeeAct,
          nonDelegable: rule.nonDelegable,
          approverMandatory: rule.approverMandatory,
          isGap: rule.isGap,
          gapNote: rule.gapNote,
          note: rule.note,
          clause: rule.clause,
          sortOrder: rule.sortOrder,
          generateCoreChain: rule.generateCoreChain ?? null,
          coreChainReason: rule.coreChainReason ?? null,
        }}
      />
      <AddRecommender ruleId={row.id} offices={offices} />
    </RowActions>
  );
}
