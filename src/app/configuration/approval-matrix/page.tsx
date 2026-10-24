import { periodText } from "@/lib/effective-text";
import { gapMatters, gapTitle } from "@/lib/authority/gaps";
import { choicesNotMade, routeChoices } from "@/lib/authority/choice";
import { AlertTriangle, CheckIcon, SlidersIcon } from "@/components/icons";
import { ActBadge, RuleChain, type ChainStep } from "@/components/rule-chain";
import { listIssues, loadCoreRows, loadMatrix, loadRuleRows, type IssueSummary } from "@/lib/authority/load";
import { listCommittees } from "@/lib/committee/repo";
import { edgeAtBoundary, ruleChain, ruleIsDelegable } from "@/lib/authority/resolve";
import { APPROVES_ALONE, chainChoiceLabel, coreLevelFaultText, issueRefusal, originLabel } from "@/lib/authority/core-routing-labels";
import { coreChainFaultsAcross, coreLevelFaults } from "@/lib/authority/core-routing";
import { actLabel } from "@/components/ui/act";
import { formatPercentBand, formatValueBand } from "@/lib/format";
import { condLabel, matterLabel, methodLabel } from "@/lib/labels";
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
  AdoptDraft,
  ChooseRoute,
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
import { TestRoute } from "./test-route";
import { db } from "@/lib/db";
import { bandConsistencyFaults } from "@/lib/method/boundary";
import { findingText, REGIME_LABEL } from "@/lib/method/labels";
import { loadTermsBands } from "@/lib/method/repo";
import type { Regime } from "@/lib/method/types";
import { RuleInfo } from "@/components/ui/rule-info";
import { SettingValue } from "@/components/setup/setting-value";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";
import { MoreText } from "@/components/ui/more-text";
import { cx } from "@/components/ui/cx";
import type { Rule } from "@/lib/authority/types";
import { destinationFor, REJECTION_DOMAINS, type DestinationRow, type RejectionKind } from "@/lib/authority/rejection";
import { destinationText } from "@/lib/authority/rejection-labels";
import { PageHeader } from "@/components/ui/page-header";
import { InfoChip } from "@/components/ui/info-chip";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
import { startsOpen } from "@/lib/disclosure/open";
import { EmptyState } from "@/components/ui/feedback";
import { KeyValues, Stat } from "@/components/ui/stat";
import { ActionsCol, RowActions, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { HistoryButton } from "@/components/history-drawer";
import { requireStaff } from "@/app/_auth/actor";
import { loadMakers } from "@/lib/authority/maker-store";
import { eligibleFor } from "@/lib/auth/eligibility-store";
import { makerCheckerFault } from "@/lib/auth/maker-checker";
import { twoPersonOn } from "@/lib/auth/policy-store";

export const dynamic = "force-dynamic";
export const metadata = { title: "Approval matrix" };

/// Cards inside the Advanced fold: an address pointing at one opens the fold.
const ADVANCED_IDS = ["core-routing", "terms-bands", "rejection-destinations"];

/// Where an issue stands today. Read from its dates and whether it was issued.
function stateOf(issue: IssueSummary, on: Date): { label: string; tone: "ok" | "info" | "warn" | "neutral" } {
  if (!issue.issuedAt) return { label: "Draft", tone: "warn" };
  if (issue.effectiveFrom > on) return { label: `Starts ${formatDate(issue.effectiveFrom)}`, tone: "info" };
  if (issue.effectiveTo && issue.effectiveTo <= on) return { label: "Replaced", tone: "neutral" };
  return { label: "In force", tone: "ok" };
}

export default async function ApprovalMatrixPage({
  searchParams,
}: {
  searchParams: Promise<{ issue?: string; section?: string }>;
}) {
  const actor = await requireStaff();
  const { issue: requested, section } = await searchParams;
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
  const orgRow = await db.organisation.findUnique({ where: { code: actor.organisationCode }, select: { id: true, name: true } });
  const destinations: DestinationRow[] = orgRow
    ? (await db.rejectionDestination.findMany({ where: { organisationId: orgRow.id } })).map((d) => ({ ...d, kind: d.kind as RejectionKind, provenance: d.provenance as DestinationRow["provenance"] }))
    : [];
  const offices = roster.offices.map((o) => ({ code: o.code, nameEn: o.nameEn }));
  // The rule form's method list is the keys the reference data binds to a method, by the method's name.
  const methodOptions = sourcingMethods.flatMap((m) => (m.authorityMethodKey ? [{ code: m.authorityMethodKey, nameEn: m.nameEn }] : []));
  const committeeOptions = (await listCommittees(actor.organisationId)).map((c) => ({ code: c.code, nameEn: c.nameEn }));

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
          info={{ title: "Approval matrix", text: "Who proposes, who recommends and who approves, at every value." }}
        />

        <Card>
          <EmptyState title="No approval limits yet" action={<AddMatrix />} />
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
      ? { label: "In force · no routes", tone: "warn" as const }
      : baseState;
  const inForce = baseState.label === "In force";
  // Row ids only where they are needed: a draft's rules are the only ones that change.
  const ruleRows = editable ? await loadRuleRows(selected.id) : {};
  // The terms family and the boundary ruling (6.3).
  const [termsBands, boundaryMeta] = await Promise.all([
    loadTermsBands(selected.id),
    db.authorityMatrix.findUniqueOrThrow({ where: { id: selected.id, organisationId: actor.organisationId }, select: { boundaryProvenance: true, boundarySource: true } }),
  ]);
  const consistency = bandConsistencyFaults(matrix, termsBands);
  // Phase 2c (ADR 0034 D15): who made this draft, and whether the person looking may issue it. The issue is never the maker's.
  const makers = editable ? await loadMakers(db, selected.id) : null;
  const issuance = editable
    ? makerCheckerFault({
        makerPersonIds: makers!.personIds,
        makersUnknownAtLanding: (await db.authorityMatrix.findUniqueOrThrow({ where: { id: selected.id, organisationId: actor.organisationId }, select: { makersUnknownAtLanding: true } })).makersUnknownAtLanding,
        issuerPersonId: actor.personId,
        twoPersonChanges: await twoPersonOn(db, actor.organisationId),
        eligiblePersonIds: await eligibleFor(db, { organisationId: actor.organisationId, timeZone: actor.organisationTimeZone, now: on }, "configuration.issue"),
      })
    : null;
  const needsAdopting = editable && makers!.personIds.length === 0;
  // The core routing (FR-APR-004): this issue's own rows, in the offices' order, and the
  // flagged rules that would not issue against it.
  const officeName = (code: string) => matrix.roles[code]?.nameEn ?? "An office no longer configured";
  const officeOrder = new Map(roster.offices.map((o, i) => [o.code, i]));
  const coreRows = (await loadCoreRows(selected.id)).sort(
    (a, b) => (officeOrder.get(a.approverCode) ?? 999) - (officeOrder.get(b.approverCode) ?? 999) || a.sortOrder - b.sortOrder,
  );
  const coreRefusals = [
    ...(matrix.coreRouting ?? []).flatMap((level) =>
      coreLevelFaults(level, matrix.roles).map((f) => ({ key: `level-${level.approverCode}-${f.fault}-${f.roleCode}`, rule: null as Rule | null, text: `The standard route for ${officeName(level.approverCode)}: ${coreLevelFaultText(f.fault, officeName(f.roleCode))}` })),
    ),
    ...coreChainFaultsAcross(matrix.rules, matrix.coreRouting ?? [], matrix.roles).map((f) => ({
      key: `rule-${f.rule.ruleKey}`,
      rule: f.rule as Rule | null,
      text: issueRefusal(f.fault, f.rule.labelEn, f.roleCode ? officeName(f.roleCode) : "its approver"),
    })),
  ];
  const refusedDomains = new Set(coreRefusals.map((x) => x.rule?.domain).filter(Boolean));

  // A rule may route to an office or to a committee; the two are kept apart, so look
  // in both before admitting the code is unknown.
  const committeeNames = new Map(committeeOptions.map((c) => [c.code, c.nameEn]));
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
    if (fault) return <Badge tone="err">Does not fit the standard route</Badge>;
    if (rule.generateCoreChain === true && unchecked)
      return <span className="text-amber-800">{`${chainChoiceLabel(true)} · no standard route for ${officeName(rule.approverCode ?? "")} in this version`}</span>;
    if (rule.generateCoreChain === false) return <span>{`${chainChoiceLabel(false)} · ${rule.coreChainReason ?? "reason not recorded"}`}</span>;
    // A cleanly generated chain says so on each step; the note would repeat it.
    if (rule.generateCoreChain === true) return null;
    return <span>Not checked against the standard route</span>;
  };

  const byDomain = new Map<string, Rule[]>();
  for (const rule of matrix.rules) {
    const list = byDomain.get(rule.domain) ?? [];
    list.push(rule);
    byDomain.set(rule.domain, list);
  }
  const domains = [...byDomain.entries()].sort((a, b) => b[1].length - a[1].length);

  // Decision D2: the matters whose route the documents give two ways, and those nobody has chosen yet.
  const choices = new Map(routeChoices(matrix.rules).map((c) => [c.domain, c]));
  const notMade = choicesNotMade(matrix.rules);
  const fixed = matrix.rules.filter((r) => !ruleIsDelegable(r)).length;
  const gapList = gapMatters(matrix.rules);
  const gaps = gapList.length;

  const noun = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const destinationsSet = REJECTION_DOMAINS.filter((d) => destinationFor(destinations, d, on).set).length;

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
        info={{ title: "Approval matrix", text: "Who proposes, who recommends and who approves, at every value." }}
        meta={noRules ? ["No approval routes"] : [noun(matrix.rules.length, "approval route", "approval routes"), `${fixed} cannot be delegated`]}
        actions={
          <>
            <HistoryButton entity="AuthorityMatrix" entityId={matrixId} label={selected.label} />
            {!selectedRoute && (
              <TestRoute
                domains={[...byDomain.keys()]
                  .sort((a, b) => matterLabel(a).localeCompare(matterLabel(b)))
                  .map((code) => ({ code, label: matterLabel(code) }))}
                methods={[...new Set(matrix.rules.map((r) => r.method).filter((m): m is string => !!m))].sort().map((code) => ({ code, label: methodName(code) }))}
                roles={Object.values(matrix.roles)
                  .map((r) => ({ code: r.code, name: r.nameEn }))
                  .sort((a, b) => a.name.localeCompare(b.name))}
                fundingRoutes={fundingRoutes.map((r) => ({ code: r.code, label: r.nameEn }))}
              />
            )}
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
                <AddRule matrixId={matrixId} offices={offices} contractTypes={contractTypeOptions} methods={methodOptions} committees={committeeOptions} />
                <DiscardDraft id={matrixId} label={selected.label} />
                {needsAdopting && <AdoptDraft id={matrixId} label={selected.label} />}
                <IssueDraft
                  id={matrixId}
                  label={selected.label}
                  meantFrom={selected.effectiveFrom}
                  replaces={replaces?.label ?? null}
                  blocked={issuance?.en ?? null}
                />
              </>
            ) : draftIssue ? (
              <ButtonLink href={`?issue=${draftIssue.id}`} variant="primary" size="sm">
                Open draft
              </ButtonLink>
            ) : (
              <StartRevision fromId={matrixId} fromLabel={selected.label} />
            )}
          </>
        }
      />

      {issues.length > 1 && (
        <nav aria-label="Versions" className="-mt-2 mb-5 flex flex-wrap items-center gap-2">
          <span className="text-[12.5px] font-semibold text-ink-3">Versions</span>
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
          <Callout tone="warn" title="Draft. Nothing routes yet.">
            {needsAdopting
              ? "Nobody made it. Adopt it first."
              : `Made by ${makers!.names.join(", ")}. ${issuance ? issuance.en : "Another person puts it in force."}`}
          </Callout>
        ) : inForce && selectedRoute ? (
          <div><InfoChip tone="ok" detail={`Routes only requisitions on the “${routeName(selectedRoute)}” funding route, in place of the organisation's limits, where it has a route. Otherwise the limits route them and the trail says so.`}>{`In force since ${formatDate(selected.effectiveFrom)} · funder rules`}</InfoChip></div>
        ) : inForce ? (
          <div><InfoChip tone="ok" detail="Routes every approval. A version cannot be changed. Start a new version to change it.">{`In force since ${formatDate(selected.effectiveFrom)}`}</InfoChip></div>
        ) : (
          <div><InfoChip detail={selected.effectiveTo ? "Kept so decisions can show the rules they ran under." : "Not yet in force."}>{selected.effectiveTo ? `${state.label} · ${periodText(selected)}` : `${state.label} · from ${formatDate(selected.effectiveFrom)}`}</InfoChip></div>
        )}

        <Card>
          <CardHeader icon={<SlidersIcon size={17} />} title="Value bands" />
          <CardBody className="flex flex-col gap-6">
            <div className="grid gap-4 md:grid-cols-3">
              <Stat tone="neutral" label="Below the quotation floor" value={`≤ ${formatValueBand(null, matrix.policy.quotationFloor).replace("≤ ", "")}`} variant="inset" size="sm" />
              <Stat tone="neutral" label="Quotation band" value={formatValueBand(matrix.policy.quotationFloor, matrix.policy.tenderFloor)} variant="inset" size="sm" />
              <Stat tone="neutral" label="Tender band" value={formatValueBand(matrix.policy.tenderFloor, null)} variant="inset" size="sm" />
            </div>

            <KeyValues
              columns={2}
              className="border-t border-line pt-6"
              items={[
                { label: "Where the bands meet", value: <span className="tabular-nums">{formatValueBand(null, matrix.policy.boundaryValue).replace("≤ ", "")}</span> },
                {
                  label: "Exact amount at a limit",
                  value: (
                    <span className="inline-flex flex-wrap items-center gap-1">
                      <span>{matrix.policy.boundaryInclusive ? "Quotation band" : "Tender band"}</span>
                      <RuleInfo
                        label="The rule for an exact amount at a limit"
                        rule={`A value exactly on ${formatValueBand(null, matrix.policy.boundaryValue).replace("≤ ", "")} falls in the ${matrix.policy.boundaryInclusive ? "quotation" : "tender"} band, and a percentage exactly on a band edge falls on the same side, judged on the exact ratio. This is a policy choice: the other reading gives a different committee, approver and award instrument.${boundaryMeta.boundaryProvenance !== "STATED" && !boundaryMeta.boundarySource ? " With no written ruling, an exact amount at the limit is recorded as an exception." : ""}`}
                        clause={boundaryMeta.boundarySource}
                        source={boundaryMeta.boundaryProvenance}
                      />
                    </span>
                  ),
                },
                {
                  label: "Requisition limit",
                  value: (
                    <span className="inline-flex flex-wrap items-center gap-1">
                      <span className="tabular-nums">{formatValueBand(null, matrix.policy.requisitionBoundary).replace("≤ ", "")}</span>
                      <MoreText label="About the requisition limit" text="Shown for reference. Who approves a requisition is set by the requisition routes below." />
                    </span>
                  ),
                },
              ]}
            />
          </CardBody>
        </Card>

        {consistency.map((f, i) => (
          <Callout key={i} tone="warn" title="The limit could fall differently in two places">
            {findingText(f)}
          </Callout>
        ))}

        {coreRefusals.length > 0 && (
          <Callout tone="err" title={coreRefusals.length === 1 ? "One route or row would stop this version going in force" : `${coreRefusals.length} routes or rows would stop this version going in force`}>
            <ul className="mt-1 flex flex-col gap-2">
              {coreRefusals.map((x) => (
                <li key={x.key} className="flex flex-wrap items-start gap-2">
                  <span className="min-w-0 flex-1 break-words">{x.text}</span>
                  {editable && x.rule && ruleRows[x.rule.ruleKey] && (
                    <RuleActions rule={x.rule} row={ruleRows[x.rule.ruleKey]} matrixId={matrixId} offices={offices} contractTypes={contractTypeOptions} methods={methodOptions} committees={committeeOptions} />
                  )}
                </li>
              ))}
            </ul>
          </Callout>
        )}

        {notMade.length > 0 && (
          <Callout tone="warn" title={noun(notMade.length, "choice not made", "choices not made")}>
            <ul className="mt-1 flex flex-col gap-2">
              {notMade.map((c) => (
                <li key={c.domain} className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 break-words">{`${matterLabel(c.domain)}: ${c.options.join(" or ")}`}</span>
                  {editable && <ChooseRoute matrixId={matrixId} domain={c.domain} matter={matterLabel(c.domain)} options={c.options} chosen={null} />}
                </li>
              ))}
            </ul>
            <MoreText label="About route choices" text="The documents give two routes for these matters. Until one is chosen, such a matter cannot be routed." />
          </Callout>
        )}

        <Card id="routing-rules" className="scroll-mt-24">
          <CardHeader icon={<SlidersIcon size={17} />} title="Approval routes" />
          <CardBody className="flex flex-col gap-3">
            {domains.length === 0 && <EmptyState size="sm" title={selectedRoute ? "No funder routes supplied" : "No approval routes yet"} />}
            {domains.map(([domain, rules]) => (
              <Disclosure key={domain} boxed title={matterLabel(domain)} summary={noun(rules.length, "route", "routes")} defaultOpen={startsOpen({ finding: refusedDomains.has(domain) })}>
                {choices.has(domain) && (
                  <div className="mb-3 flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
                    <span>{`Route chosen: ${choices.get(domain)!.chosen ?? "not yet"}`}</span>
                    {editable && <ChooseRoute matrixId={matrixId} domain={domain} matter={matterLabel(domain)} options={choices.get(domain)!.options} chosen={choices.get(domain)!.chosen} />}
                  </div>
                )}
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
                      // A rule is banded either by ringgit or by percentage of the contract sum; variations use the latter.
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
                            <div className="font-semibold break-words text-ink tabular-nums">{band}</div>
                            {pct && <div className="text-[12.5px] text-ink-3">of the contract sum</div>}
                            {contract && <div className="text-[12.5px] break-words text-ink-3">{contract}</div>}
                            {rule.cond && <div className="text-[12.5px] break-words text-ink-3">{condLabel(rule.cond)}</div>}
                            {edgeAtBoundary(rule, matrix.policy) && (
                              // Its own line, as text: a badge this long clipped in the band column at 1280.
                              <div className="mt-1 text-[12.5px] break-words text-ink-3">
                                {rule.followsBoundarySwitch == null ? (
                                  <Badge tone="err">Limit not decided</Badge>
                                ) : rule.followsBoundarySwitch ? (
                                  "At the limit: follows the setting"
                                ) : (
                                  "At the limit: ignores the setting"
                                )}
                              </div>
                            )}
                          </Td>
                          <Td label="Method" className="align-top text-[13px] text-ink-2 [overflow-wrap:normal]">
                            {rule.method ? methodName(rule.method) : "Any method"}
                            {rule.contractTypeCode && <div className="mt-1 text-[12.5px] break-words text-ink-3">{`Contract type: ${contractTypeName(rule.contractTypeCode)}`}</div>}
                          </Td>
                          <Td label="Route" className="align-top">
                            <div className="flex items-start gap-1">
                              <div className="min-w-0 flex-1"><RuleChain steps={chainFor(rule)} /></div>
                              <RuleInfo label={`The rule behind ${rule.labelEn}`} rule={rule.note ? `${rule.labelEn}. ${rule.note}` : rule.labelEn} clause={rule.clause} source={rule.isGap ? "ASSUMED" : null} />
                            </div>
                            <div className="mt-1 text-[12.5px] break-words text-ink-3">{chainNote(rule)}</div>
                            {rule.choiceOptionEn && (
                              <div className="mt-1 text-[12.5px] break-words text-ink-3">
                                {`${rule.choiceOptionEn} · `}
                                {rule.chosen == null ? <Badge tone="warn">Not chosen</Badge> : rule.chosen ? "Chosen" : "Set aside"}
                              </div>
                            )}
                            {editable && (ruleRows[rule.ruleKey]?.recommenders.length ?? 0) > 0 && (
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {ruleRows[rule.ruleKey]!.recommenders.map((step) => {
                                  const text = `${roleName(step.roleCode)} · ${actLabel(step.act)}`;
                                  return (
                                    <span key={step.id} className="inline-flex max-w-full items-center gap-1 rounded-full bg-ink/[0.05] py-0.5 pr-0.5 pl-2.5 text-[12px] text-ink-2">
                                      <span className="truncate" title={text}>{text}</span>
                                      <RemoveRecommender id={step.id} label={`${roleName(step.roleCode)} from this rule`} />
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </Td>
                          <Td label="Committee" className="align-top">
                            {committee ? (
                              <div className="flex min-w-0 flex-col items-start gap-1">
                                <span className="text-[13px] font-semibold break-words text-ink">{committee}</span>
                                {rule.committeeAct && (
                                  <span className="inline-flex items-start gap-1.5 text-[12px] text-ink-2">
                                    <ActBadge act={rule.committeeAct} />
                                    <span className="pt-0.5 leading-tight">{actLabel(rule.committeeAct)}</span>
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-ink-4">—</span>
                            )}
                          </Td>
                          <Td label="Delegation" className="align-top">
                            {!ruleIsDelegable(rule) ? (
                              <Badge tone="warn"><AlertTriangle size={12} />Fixed</Badge>
                            ) : (
                              <Badge tone="ok"><CheckIcon size={12} />May delegate</Badge>
                            )}
                          </Td>
                          {editable && (
                            <Td label="Change" className="align-top">
                              <RuleActions rule={rule} row={ruleRows[rule.ruleKey]} matrixId={matrixId} offices={offices} contractTypes={contractTypeOptions} methods={methodOptions} committees={committeeOptions} />
                            </Td>
                          )}
                        </Tr>
                      );
                    })}
                  </tbody>
                </Table>
              </Disclosure>
            ))}
          </CardBody>
        </Card>

        {gaps > 0 && (
          <Callout tone="warn" title={gapTitle(gapList)}>
            <MoreText label="Items without a limit" text={gapList.map((g) => g.label).join("; ")} />
          </Callout>
        )}

        <Disclosure
          id="advanced"
          title="Advanced"
          summary={`${noun(coreRows.length, "standard route", "standard routes")} · ${noun(termsBands.length, "terms band", "terms bands")}`}
          defaultOpen={ADVANCED_IDS.includes(section ?? "") || coreRefusals.some((x) => !x.rule)}
        >
          <div className="flex flex-col gap-6">
            <Card className="overflow-hidden">
              <CardHeader
                icon={<SlidersIcon size={17} />}
                title="Standard route"
                collapsible
                id="core-routing"
                defaultOpen={startsOpen({ finding: coreRefusals.some((x) => !x.rule) }, { id: "core-routing", target: section })}
                summary={
                  <>
                    <span>{noun(coreRows.length, "office", "offices")}</span>
                    {coreRows.length === 0 && <span>Not set</span>}
                  </>
                }
              >
                {editable && <div className="flex justify-end px-5 pt-4 sm:px-6"><AddCoreLevel matrixId={matrixId} offices={offices} /></div>}
                {coreRows.length === 0 ? (
                  <EmptyState size="sm" title="Not set" />
                ) : (
                  <Table stack minWidth={editable ? 820 : 720}>
                    <colgroup>
                      <col style={{ width: "26%" }} />
                      <col />
                      {editable && <ActionsCol icons={3} />}
                    </colgroup>
                    <THead>
                      <Th>Approved by</Th>
                      <Th>Chain beneath</Th>
                      {editable && <Th className="text-right">Change</Th>}
                    </THead>
                    <tbody>
                      {coreRows.map((level) => (
                        <Tr key={level.id}>
                          <Td label="Approved by" className="align-top">
                            <div className="flex items-start gap-1">
                              <span className="font-semibold break-words text-ink">{officeName(level.approverCode)}</span>
                              <RuleInfo label={`The rule behind the standard route for ${officeName(level.approverCode)}`} rule={level.note || `The chain beneath ${officeName(level.approverCode)}.`} clause={level.clause} source={level.provenance} />
                            </div>
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
                                    {step.note && <span className="text-[12.5px] break-words text-ink-3">· {step.note}</span>}
                                    {editable && <RemoveCoreStep id={step.id} label={`${officeName(step.roleCode)} from the standard route for ${officeName(level.approverCode)}`} />}
                                  </li>
                                ))}
                              </ol>
                            )}
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
              </CardHeader>
            </Card>

            <Card className="overflow-hidden">
              <CardHeader
                icon={<SlidersIcon size={17} />}
                title="Contract terms bands"
                collapsible
                id="terms-bands"
                defaultOpen={startsOpen({}, { id: "terms-bands", target: section })}
                summary={
                  <>
                    <span>{noun(termsBands.length, "band", "bands")}</span>
                    {termsBands.length === 0 && <span>Not set</span>}
                  </>
                }
              >
                {editable && <div className="flex justify-end px-5 pt-4 sm:px-6"><AddTermsBand matrixId={matrixId} /></div>}
                {termsBands.length === 0 ? (
                  <EmptyState size="sm" title="Not set" />
                ) : (
                  <Table stack minWidth={editable ? 820 : 720}>
                    <colgroup>
                      <col style={{ width: "20%" }} />
                      <col />
                      <col style={{ width: "18%" }} />
                      <col style={{ width: "20%" }} />
                      {editable && <ActionsCol icons={2} />}
                    </colgroup>
                    <THead>
                      <Th>Value band</Th>
                      <Th>Terms set</Th>
                      <Th>Applies in</Th>
                      <Th>Retention · defects</Th>
                      {editable && <Th className="text-right">Change</Th>}
                    </THead>
                    <tbody>
                      {termsBands.map((t) => (
                        <Tr key={t.id}>
                          <Td label="Value band" className="align-top font-semibold tabular-nums">{formatValueBand(t.minValue, t.maxValue)}</Td>
                          <Td label="Terms set" className="align-top break-words">
                            <div className="flex items-start gap-1">
                              <span>{t.labelEn}</span>
                              <RuleInfo label={`The rule behind ${t.labelEn}`} rule={t.insuranceNote || `The terms that apply to ${formatValueBand(t.minValue, t.maxValue)}.`} clause={t.clause} source={t.provenance} />
                            </div>
                          </Td>
                          <Td label="Applies in" className="align-top text-[13px] text-ink-2">{t.regime ? REGIME_LABEL[t.regime as Regime] : "Every rule set"}</Td>
                          <Td label="Retention · defects" className="align-top text-[13px] text-ink-2">
                            {t.retentionApplies == null ? "Not set" : t.retentionApplies ? "Retention" : "No retention"} · {t.defectsLiabilityApplies == null ? "not set" : t.defectsLiabilityApplies ? "defects liability" : "no defects liability"}
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
              </CardHeader>
            </Card>

            {!selectedRoute && (
              <Card className="overflow-hidden">
                <CardHeader
                  icon={<SlidersIcon size={17} />}
                  title="When an item is rejected"
                  collapsible
                  id="rejection-destinations"
                  defaultOpen={startsOpen({}, { id: "rejection-destinations", target: section })}
                  summary={<span>{destinationsSet} of {REJECTION_DOMAINS.length} set</span>}
                >
                  <Table stack minWidth={680}>
                    <colgroup>
                      <col style={{ width: "26%" }} />
                      <col />
                      <col style={{ width: "16%" }} />
                      <ActionsCol icons={0} labelled={2} />
                    </colgroup>
                    <THead>
                      <Th>Item type</Th>
                      <Th>Where it goes</Th>
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
                            <Td label="Item type" className="font-semibold text-ink">{label}</Td>
                            <Td label="Where it goes" className="text-ink-2">
                              <SettingValue value={row ? destinationText(row.kind, office) : null} unset="The officer chooses, recorded as their choice." />
                            </Td>
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
                </CardHeader>
              </Card>
            )}

            {!selectedRoute && funderRoutes.length > 0 && (
              <Card>
                <CardHeader
                  icon={<SlidersIcon size={17} />}
                  title="Funder rule sets"
                  subtitle="Own limits for a funding route"
                  actions={<AddMatrix routes={funderRoutes} primary={false} label="Draft a funder's rule set" title="Draft a funder's rule set" />}
                  divided={false}
                />
              </Card>
            )}
          </div>
        </Disclosure>
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
  methods,
  committees,
}: {
  rule: Rule;
  row: { id: string } | undefined;
  matrixId: string;
  offices: { code: string; nameEn: string }[];
  contractTypes: { code: string; nameEn: string }[];
  methods: { code: string; nameEn: string }[];
  committees: { code: string; nameEn: string }[];
}) {
  if (!row) return null;
  return (
    <RowActions>
      <EditRule
        matrixId={matrixId}
        offices={offices}
        contractTypes={contractTypes}
        methods={methods}
        committees={committees}
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
