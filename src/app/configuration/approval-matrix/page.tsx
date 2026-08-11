import { Accordion } from "@/components/accordion";
import { AuthoritySimulator } from "@/components/authority-simulator";
import { AlertTriangle, CheckIcon, InfoIcon, SlidersIcon } from "@/components/icons";
import { RuleChain, type ChainStep } from "@/components/rule-chain";
import { loadMatrix, NoActiveMatrixError } from "@/lib/authority/load";
import { formatPercentBand, formatValueBand } from "@/lib/format";
import { matterLabel, methodLabel } from "@/lib/labels";
import { ORGANISATION_CODE } from "@/lib/org";
import { loadReferenceData } from "@/lib/reference/load";
import { activeOn } from "@/lib/reference/vocabulary";
import type { Rule } from "@/lib/authority/types";

export const dynamic = "force-dynamic";

export default async function ApprovalMatrixPage() {
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

  let matrix;
  try {
    matrix = await loadMatrix(ORGANISATION_CODE);
  } catch (error) {
    if (!(error instanceof NoActiveMatrixError)) throw error;
    return (
      <div className="empty">
        <div className="empty__t">No approval matrix loaded</div>
        <p className="empty__d">{error.message}</p>
      </div>
    );
  }

  const roleName = (code: string | null) =>
    code == null ? null : (matrix.roles[code]?.nameEn ?? code);

  const chainFor = (rule: Rule): ChainStep[] => {
    const steps: ChainStep[] = [];
    if (rule.proposerCode) steps.push({ role: roleName(rule.proposerCode)!, act: "P" });
    for (const rec of rule.recommenders) steps.push({ role: roleName(rec.roleCode)!, act: rec.act });
    if (rule.approverCode) {
      steps.push({
        role: roleName(rule.approverCode)!,
        act: rule.nonDelegable && rule.approverMandatory ? "MA" : "A",
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

  const fixed = matrix.rules.filter((r) => r.nonDelegable).length;
  const gaps = matrix.rules.filter((r) => r.isGap).length;
  const committees = new Set(matrix.rules.map((r) => r.committeeCode).filter(Boolean)).size;

  return (
    <>
      <div className="pagehead">
        <div className="pagehead__top">
          <div className="pagehead__titles">
            <div className="pagehead__title">
              <h1 className="h1 trunc">Approval matrix</h1>
            </div>
            <p className="pagehead__sub clamp2">
              Who proposes, who recommends and who approves, at every value.
            </p>
            <div className="pagehead__meta">
              <span>{matrix.rules.length} rules</span>
              <span className="sep">·</span>
              <span>{domains.length} decision types</span>
              <span className="sep">·</span>
              <span>{committees} committees involved</span>
              <span className="sep">·</span>
              <span>{fixed} cannot be delegated</span>
            </div>
          </div>
        </div>
      </div>

      <div className="stack stack--lg">
        <div className="callout callout--info">
          <span className="callout__ico">
            <InfoIcon size={17} />
          </span>
          <div className="grow">
            <span className="sm">
              These rules drive every approval in the portal. A change here takes effect
              immediately, including in the simulator below.
            </span>
          </div>
        </div>

        <section className="card">
          <div className="card__head">
            <SlidersIcon size={17} />
            <div className="card__titles">
              <div className="h3 trunc">Value bands</div>
              <div className="card__sub trunc">
                The thresholds every routing decision is measured against.
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
                  Direct purchase. No competitive process required.
                </p>
              </div>
              <div className="panel">
                <div className="lbl">Quotation band</div>
                <div className="stat__value stat__value--sm num">
                  {formatValueBand(matrix.policy.quotationFloor, matrix.policy.tenderFloor)}
                </div>
                <p className="xs dim" style={{ marginTop: 6 }}>
                  Quotation. Competitive, with a committee recommendation.
                </p>
              </div>
              <div className="panel">
                <div className="lbl">Tender band</div>
                <div className="stat__value stat__value--sm num">
                  {formatValueBand(matrix.policy.tenderFloor, null)}
                </div>
                <p className="xs dim" style={{ marginTop: 6 }}>
                  Tender. Advertised, and approved by a board.
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
              <div className="card__sub trunc">Grouped by what is being decided.</div>
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
                        </colgroup>
                        <thead>
                          <tr>
                            <th>Value band</th>
                            <th>Method</th>
                            <th>Route</th>
                            <th>Committee</th>
                            <th>Delegation</th>
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
                                      <span className="badge">{rule.committeeCode}</span>
                                      {rule.committeeAct && (
                                        <span
                                          className={`chain__act chain__act--${rule.committeeAct}`}
                                        >
                                          {rule.committeeAct}
                                        </span>
                                      )}
                                    </span>
                                  ) : (
                                    <span className="dim">—</span>
                                  )}
                                </td>
                                <td>
                                  {rule.nonDelegable ? (
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
                {gaps} matters have no limit set for them
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
                Enter a case and see the route it would follow today.
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
