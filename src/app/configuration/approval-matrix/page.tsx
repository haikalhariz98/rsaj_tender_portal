import { Accordion } from "@/components/accordion";
import { AuthoritySimulator } from "@/components/authority-simulator";
import { AlertTriangle, CheckIcon, SlidersIcon } from "@/components/icons";
import { RuleChain, type ChainStep } from "@/components/rule-chain";
import { listIssues, loadMatrix, loadRuleRows, type IssueSummary } from "@/lib/authority/load";
import { listCommittees } from "@/lib/committee/repo";
import { approverAct, ruleIsDelegable } from "@/lib/authority/resolve";
import { formatPercentBand, formatValueBand } from "@/lib/format";
import { ACT_LABEL, matterLabel, methodLabel } from "@/lib/labels";
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
import { Badge } from "@/components/ui/badge";
import { HistoryButton } from "@/components/history-drawer";

export const dynamic = "force-dynamic";

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

  // Which issue to show: the one asked for, else the one in force, else a draft.
  const issues = await listIssues(ORGANISATION_CODE);
  const inForceNow =
    issues.find(
      (i) => i.issuedAt && i.effectiveFrom <= on && (i.effectiveTo == null || i.effectiveTo > on),
    ) ?? null;
  const draftIssue = issues.find((i) => !i.issuedAt) ?? null;
  const selected = issues.find((i) => i.id === requested) ?? inForceNow ?? draftIssue ?? null;

  if (!selected) {
    return (
      <>
        <PageHeader
          title="Approval matrix"
          badge={<Badge tone="warn">Not set</Badge>}
          subtitle="Who proposes, who recommends and who approves, at every value."
        />

        <div className="card">
          <div className="card__body">
            <div className="empty">
              <div className="empty__t">No approval limits yet</div>
              <p className="empty__d">
                {ORGANISATION_NAME} has no authority limits, so the portal cannot say who
                approves anything. Draft the first issue, add its rules, then issue it.
              </p>
              <div className="empty__a">
                <AddMatrix />
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  const matrix = await loadMatrix(ORGANISATION_CODE, on, selected.id);
  const matrixId = selected.id;
  const editable = !selected.issuedAt;
  const state = stateOf(selected, on);
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
        badge={<Badge tone={state.tone} dot>{`${selected.label} · ${state.label}`}</Badge>}
        subtitle="Who proposes, who recommends and who approves, at every value."
        meta={[
          `${matrix.rules.length} rules`,
          `${domains.length} decision types`,
          `${committees} committees involved`,
          `${fixed} cannot be delegated`,
        ]}
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
                splittingWindowDays: matrix.policy.splittingWindowDays,
                currency: matrix.policy.currency,
                noRuleClause: matrix.policy.clauses?.noRule ?? null,
                selfApprovalClause: matrix.policy.clauses?.selfApproval ?? null,
                absenceClause: matrix.policy.clauses?.absence ?? null,
                funderOverrideClause: matrix.policy.clauses?.funderOverride ?? null,
              }}
            />
            <AddRule matrixId={matrixId} offices={offices} />
            <IssueDraft
              id={matrixId}
              label={selected.label}
              meantFrom={selected.effectiveFrom}
              replaces={inForceNow?.label ?? null}
            />
          </>
          ) : draftIssue ? (
            <ButtonLink href={`?issue=${draftIssue.id}`} variant="primary" size="sm">
              Open draft {draftIssue.label}
            </ButtonLink>
          ) : (
            <StartRevision fromId={matrixId} fromLabel={selected.label} />
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
                {i.label} <span className="text-ink-3">· {s.label}</span>
              </Link>
            );
          })}
        </nav>
      )}

      <div className="stack stack--lg">
        {editable ? (
          <Callout tone="warn" title="This is a draft">
            Nothing in it routes a matter until it is issued. Change the thresholds and rules
            here, then issue it from a date. The simulator below still uses the issue in force.
          </Callout>
        ) : state.label === "In force" ? (
          <Callout tone="info" title={`In force since ${formatDate(selected.effectiveFrom)}`}>
            These rules route every approval in the portal. An issued issue cannot be changed, so
            a decision can always be shown the rules it ran under. To change them, start a new
            revision.
          </Callout>
        ) : (
          <Callout tone="info" title={state.label}>
            {selected.effectiveTo
              ? `In force from ${formatDate(selected.effectiveFrom)} until ${formatDate(selected.effectiveTo)}. Kept so decisions taken under it can be shown the rules they ran under.`
              : `Issued to come into force on ${formatDate(selected.effectiveFrom)}.`}
          </Callout>
        )}

        <section className="card">
          <div className="card__head">
            <SlidersIcon size={17} />
            <div className="card__titles">
              <div className="h3 trunc">Value bands</div>
              <div className="card__sub trunc">
                Thresholds applied to every routing decision.
              </div>
            </div>
          </div>
          <div className="card__body">
            <div className="grid g3">
              <div className="panel">
                <div className="lbl">Below the quotation floor</div>
                <div className="stat__value stat__value--sm num">
                  ≤ {formatValueBand(null, matrix.policy.quotationFloor).replace("≤ ", "")}
                </div>
                <p className="xs dim" style={{ marginTop: 6 }}>
                  Matters valued at or below the quotation floor.
                </p>
              </div>
              <div className="panel">
                <div className="lbl">Quotation band</div>
                <div className="stat__value stat__value--sm num">
                  {formatValueBand(matrix.policy.quotationFloor, matrix.policy.tenderFloor)}
                </div>
                <p className="xs dim" style={{ marginTop: 6 }}>
                  Above the quotation floor, up to where the bands meet.
                </p>
              </div>
              <div className="panel">
                <div className="lbl">Tender band</div>
                <div className="stat__value stat__value--sm num">
                  {formatValueBand(matrix.policy.tenderFloor, null)}
                </div>
                <p className="xs dim" style={{ marginTop: 6 }}>
                  Above the point where the bands meet.
                </p>
              </div>
            </div>

            <div className="divider" style={{ margin: "18px 0" }} />

            <div className="kv kv--2">
              <div className="kv__r">
                <div className="kv__k">Where the bands meet</div>
                <div className="kv__v num">
                  {formatValueBand(null, matrix.policy.boundaryValue).replace("≤ ", "")}
                </div>
              </div>
              <div className="kv__r">
                <div className="kv__k">A value exactly on the boundary</div>
                <div className="kv__v">
                  {matrix.policy.boundaryInclusive ? (
                    <span className="chip chip--brand">Falls in the quotation band</span>
                  ) : (
                    <span className="chip chip--brand">Falls in the tender band</span>
                  )}
                </div>
              </div>
              <div className="kv__r">
                <div className="kv__k">Requisition boundary</div>
                <div className="kv__v num">
                  {formatValueBand(null, matrix.policy.requisitionBoundary).replace("≤ ", "")}
                </div>
              </div>
              <div className="kv__r">
                <div className="kv__k">Anti-splitting window</div>
                <div className="kv__v num">{matrix.policy.splittingWindowDays} days</div>
              </div>
            </div>

            <div className="callout callout--warn" style={{ marginTop: 16 }}>
              <span className="callout__ico">
                <AlertTriangle size={17} />
              </span>
              <div>
                <div className="strong" style={{ marginBottom: 2 }}>
                  The boundary itself is a policy choice
                </div>
                A works package valued at exactly{" "}
                <span className="num strong">
                  {formatValueBand(null, matrix.policy.boundaryValue).replace("≤ ", "")}
                </span>{" "}
                sits in the{" "}
                <span className="strong">
                  {matrix.policy.boundaryInclusive ? "quotation" : "tender"}
                </span>{" "}
                band under the current setting — a different committee, a different approver and a
                different award instrument from the other reading. Only this exact value is
                affected; every other band edge is unaffected.
              </div>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card__head">
            <SlidersIcon size={17} />
            <div className="card__titles">
              <div className="h3 trunc">Routing rules</div>
              <div className="card__sub trunc">Rules grouped by decision type.</div>
            </div>
            <div className="row">
              <span className="badge badge--outline">{matrix.rules.length} rules</span>
            </div>
          </div>
          <div className="card__body">
            <div className="stack stack--sm">
              {domains.map(([domain, rules], i) => (
                <Accordion
                  key={domain}
                  title={matterLabel(domain)}
                  meta={`${rules.length} ${rules.length === 1 ? "rule" : "rules"}`}
                  defaultOpen={i === 0}
                >
                  <div className="dl">
                    <div className="tablewrap dl__scroll">
                      <table className="table table--compact">
                        <colgroup>
                          <col style={{ width: "17%" }} />
                          <col style={{ width: "13%" }} />
                          <col style={{ width: "42%" }} />
                          <col style={{ width: "13%" }} />
                          <col style={{ width: "15%" }} />
                          {editable && <col style={{ width: "150px" }} />}
                        </colgroup>
                        <thead>
                          <tr>
                            <th>Value band</th>
                            <th>Method</th>
                            <th>Route</th>
                            <th>Committee</th>
                            <th>Delegation</th>
                            {editable && <th>Change</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {rules.map((rule, r) => {
                            // A rule is banded either by ringgit or by percentage of the
                            // contract sum; variations use the latter.
                            const pct = formatPercentBand(rule.pctMin, rule.pctMax);
                            return (
                              <tr key={r}>
                                <td className="wrapcell">
                                  <div className="cellstack">
                                    <span className="cellstack__t num">
                                      {pct ?? formatValueBand(rule.minValue, rule.maxValue)}
                                    </span>
                                    {pct && (
                                      <span className="cellstack__s">of the contract sum</span>
                                    )}
                                    {!pct &&
                                      (rule.contractValueMin != null ||
                                        rule.contractValueMax != null) && (
                                        <span className="cellstack__s">
                                          contract{" "}
                                          {formatValueBand(
                                            rule.contractValueMin,
                                            rule.contractValueMax,
                                          )}
                                        </span>
                                      )}
                                  </div>
                                </td>
                                <td>
                                  <span className="dim sm">
                                    {rule.method ? methodName(rule.method) : "Any method"}
                                  </span>
                                </td>
                                <td className="wrapcell">
                                  <RuleChain steps={chainFor(rule)} />
                                </td>
                                <td>
                                  {rule.committeeCode ? (
                                    <span className="row" style={{ gap: 5 }}>
                                      <span className="badge">{roleName(rule.committeeCode)}</span>
                                      {rule.committeeAct && (
                                        <span
                                          className={`chain__act chain__act--${rule.committeeAct}`}
                                        >
                                          {ACT_LABEL[rule.committeeAct] ?? rule.committeeAct}
                                        </span>
                                      )}
                                    </span>
                                  ) : (
                                    <span className="dim">—</span>
                                  )}
                                </td>
                                <td>
                                  {!ruleIsDelegable(rule) ? (
                                    <span className="badge badge--warn">
                                      <AlertTriangle size={12} />
                                      <span className="badge__t">Fixed</span>
                                    </span>
                                  ) : (
                                    <span className="badge badge--ok">
                                      <CheckIcon size={12} />
                                      <span className="badge__t">May delegate</span>
                                    </span>
                                  )}
                                </td>
                                {editable && (
                                  <td>
                                    <RuleActions
                                      rule={rule}
                                      row={ruleRows[rule.ruleKey]}
                                      matrixId={matrixId}
                                      offices={offices}
                                      roleName={roleName}
                                    />
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </Accordion>
              ))}
            </div>
          </div>
        </section>

        {gaps > 0 && (
          <div className="callout callout--warn">
            <span className="callout__ico">
              <AlertTriangle size={17} />
            </span>
            <div>
              <div className="strong" style={{ marginBottom: 2 }}>
                {gaps} {gaps === 1 ? "matter has" : "matters have"} no limit set for it
              </div>
              No limit has ever been set for who may authorise these. Work is still routed so
              nothing stalls, but the route is an assumption.
            </div>
          </div>
        )}

        <section className="card card--accent">
          <div className="card__head">
            <SlidersIcon size={17} />
            <div className="card__titles">
              <div className="h3 trunc">Simulator</div>
              <div className="card__sub trunc">
                Resolve the approval route for a given case.
              </div>
            </div>
          </div>
          <div className="card__body">
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
          </div>
        </section>
      </div>
    </>
  );
}

/// A draft rule's controls: edit it, and add or remove the steps before the approver.
function RuleActions({
  rule,
  row,
  matrixId,
  offices,
  roleName,
}: {
  rule: Rule;
  row: { id: string; recommenders: { id: string; roleCode: string; act: string }[] } | undefined;
  matrixId: string;
  offices: { code: string; nameEn: string }[];
  roleName: (code: string | null) => string | null;
}) {
  if (!row) return null;
  return (
    <div className="flex flex-col items-start gap-1.5">
      <div className="flex items-center gap-1">
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
      </div>
      {row.recommenders.map((step) => (
        <span key={step.id} className="inline-flex items-center gap-1 rounded-full bg-ink/[0.05] py-0.5 pr-0.5 pl-2.5 text-[12px] text-ink-2">
          {roleName(step.roleCode)} · {ACT_LABEL[step.act] ?? step.act}
          <RemoveRecommender id={step.id} label={`${roleName(step.roleCode)} from this rule`} />
        </span>
      ))}
    </div>
  );
}
