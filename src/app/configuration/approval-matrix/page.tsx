import { Accordion } from "@/components/accordion";
import { AuthoritySimulator } from "@/components/authority-simulator";
import { AlertTriangle, CheckIcon, SlidersIcon } from "@/components/icons";
import { ActBadge, RuleChain, type ChainStep } from "@/components/rule-chain";
import { listIssues, loadMatrix, loadRuleRows, type IssueSummary } from "@/lib/authority/load";
import { listCommittees } from "@/lib/committee/repo";
import { approverAct, edgeAtBoundary, ruleIsDelegable } from "@/lib/authority/resolve";
import { formatPercentBand, formatValueBand } from "@/lib/format";
import { ACT_LABEL, condLabel, matterLabel, methodLabel } from "@/lib/labels";
import { ORGANISATION_CODE, ORGANISATION_NAME } from "@/lib/org";
import { formatDate } from "@/lib/format";
import { loadReferenceData } from "@/lib/reference/load";
import { activeOn } from "@/lib/reference/vocabulary";
import { loadRoster } from "@/lib/people/load";
import {
  AddMatrix,
  AddRecommender,
  AddRule,
  EditMatrix,
  EditRule,
  IssueDraft,
  RemoveRecommender,
  StartRevision,
} from "./editors";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";
import { cx } from "@/components/ui/cx";
import type { Rule } from "@/lib/authority/types";
import { PageHeader } from "@/components/ui/page-header";
import { Badge, Chip } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { KeyValues, Stat } from "@/components/ui/stat";
import { ActionsCol, RowActions, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { HistoryButton } from "@/components/history-drawer";

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
  const { issue: requested } = await searchParams;
  // The vocabulary this customer has configured. Which funding routes override the
  // matrix is a property of the route, not of its name.
  const on = new Date();
  const reference = await loadReferenceData(ORGANISATION_CODE);
  const fundingRoutes = activeOn(reference.fundingRoutes, on);
  const sourcingMethods = activeOn(reference.sourcingMethods, on);

  /// A rule's `method` is an authority-matrix key, and `authorityMethodKey` is what
  /// binds a configured sourcing method to it. Where the customer has named the
  /// method, that name wins; the built-in wording is only a fallback for a key no
  /// configured method has claimed.
  const methodName = (code: string) =>
    sourcingMethods.find((m) => m.authorityMethodKey === code)?.nameEn ?? methodLabel(code);

  const roster = await loadRoster(ORGANISATION_CODE);
  const offices = roster.offices.map((o) => ({ code: o.code, nameEn: o.nameEn }));

  // Which issue to show: the one asked for, else the one in force, else a draft. A
  // funder's rule set is shown only when asked for: the defaults, "in force" and the
  // draft to open all mean the organisation's own limits, as routing does.
  const issues = await listIssues(ORGANISATION_CODE);
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

  const matrix = await loadMatrix(ORGANISATION_CODE, on, selected.id);
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

  // A rule may route to an office or to a committee; the two are kept apart, so look
  // in both before admitting the code is unknown.
  const committeeNames = new Map((await listCommittees()).map((c) => [c.code, c.nameEn]));
  const roleName = (code: string | null) =>
    code == null
      ? null
      : (matrix.roles[code]?.nameEn ?? committeeNames.get(code) ?? "Unknown office or committee");

  const chainFor = (rule: Rule): ChainStep[] => {
    const steps: ChainStep[] = [];
    if (rule.proposerCode) steps.push({ role: roleName(rule.proposerCode)!, act: "P" });
    for (const rec of rule.recommenders) steps.push({ role: roleName(rec.roleCode)!, act: rec.act });
    if (rule.approverCode) {
      steps.push({
        role: roleName(rule.approverCode)!,
        act: approverAct(rule),
      });
    }
    return steps;
  };

  const byDomain = new Map<string, Rule[]>();
  for (const rule of matrix.rules) {
    const list = byDomain.get(rule.domain) ?? [];
    list.push(rule);
    byDomain.set(rule.domain, list);
  }
  const domains = [...byDomain.entries()].sort((a, b) => b[1].length - a[1].length);

  const fixed = matrix.rules.filter((r) => !ruleIsDelegable(r)).length;
  const gaps = matrix.rules.filter((r) => r.isGap).length;
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
                noRuleClause: matrix.policy.clauses?.noRule ?? null,
                selfApprovalClause: matrix.policy.clauses?.selfApproval ?? null,
                absenceClause: matrix.policy.clauses?.absence ?? null,
                funderOverrideClause: matrix.policy.clauses?.funderOverride ?? null,
              }}
              routes={funderRoutes}
            />
            <AddRule matrixId={matrixId} offices={offices} />
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
              ? `In force from ${formatDate(selected.effectiveFrom)} until ${formatDate(selected.effectiveTo)}. Kept so decisions taken under it can be shown the rules they ran under.`
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
                    <Chip tone="brand">
                      {matrix.policy.boundaryInclusive
                        ? "Falls in the quotation band"
                        : "Falls in the tender band"}
                    </Chip>
                  ),
                },
                {
                  label: "Requisition boundary",
                  value: (
                    <span className="tabular-nums">
                      {formatValueBand(null, matrix.policy.requisitionBoundary).replace("≤ ", "")}
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
              different award instrument from the other reading. Only this exact value is
              affected; every other band edge is unaffected.
            </Callout>
          </CardBody>
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
                defaultOpen={i === 0}
              >
                <Table minWidth={editable ? 920 : 820}>
                  <colgroup>
                    <col style={{ width: editable ? "14%" : "16%" }} />
                    <col style={{ width: editable ? "10%" : "12%" }} />
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
                      const pct = formatPercentBand(rule.pctMin, rule.pctMax);
                      const band = pct ?? formatValueBand(rule.minValue, rule.maxValue);
                      const contract =
                        !pct && (rule.contractValueMin != null || rule.contractValueMax != null)
                          ? `contract ${formatValueBand(rule.contractValueMin, rule.contractValueMax)}`
                          : null;
                      const committee = rule.committeeCode ? roleName(rule.committeeCode) : null;
                      return (
                        <Tr key={r}>
                          <Td className="align-top">
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
                          <Td className="align-top text-[13px] break-words text-ink-2">
                            {rule.method ? methodName(rule.method) : "Any method"}
                          </Td>
                          <Td className="align-top">
                            <RuleChain steps={chainFor(rule)} />
                            {editable && (ruleRows[rule.ruleKey]?.recommenders.length ?? 0) > 0 && (
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {ruleRows[rule.ruleKey]!.recommenders.map((step) => {
                                  const text = `${roleName(step.roleCode)} · ${ACT_LABEL[step.act] ?? step.act}`;
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
                          <Td className="align-top">
                            {committee ? (
                              <div className="flex min-w-0 flex-col items-start gap-1">
                                <span className="text-[13px] font-semibold break-words text-ink">
                                  {committee}
                                </span>
                                {rule.committeeAct && (
                                  <span className="inline-flex items-start gap-1.5 text-[12px] text-ink-2">
                                    <ActBadge act={rule.committeeAct} />
                                    <span className="pt-0.5 leading-tight">
                                      {ACT_LABEL[rule.committeeAct] ?? rule.committeeAct}
                                    </span>
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-ink-4">—</span>
                            )}
                          </Td>
                          <Td className="align-top">
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
                            <Td className="align-top">
                              <RuleActions
                                rule={rule}
                                row={ruleRows[rule.ruleKey]}
                                matrixId={matrixId}
                                offices={offices}
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
            title={`${gaps} ${gaps === 1 ? "matter has" : "matters have"} no limit set for it`}
          >
            No limit has ever been set for who may authorise these. Work is still routed so
            nothing stalls, but the route is an assumption.
          </Callout>
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
}: {
  rule: Rule;
  row: { id: string } | undefined;
  matrixId: string;
  offices: { code: string; nameEn: string }[];
}) {
  if (!row) return null;
  return (
    <RowActions>
      <EditRule
        matrixId={matrixId}
        offices={offices}
        rule={{
          id: row.id,
          ruleKey: rule.ruleKey,
          domain: rule.domain,
          method: rule.method,
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
        }}
      />
      <AddRecommender ruleId={row.id} offices={offices} />
    </RowActions>
  );
}
