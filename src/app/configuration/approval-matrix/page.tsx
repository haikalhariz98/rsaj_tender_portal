import { AlertTriangle } from "@/components/icons";
import { DalSimulator } from "@/components/dal-simulator";
import { loadMatrix, NoActiveDalVersionError } from "@/lib/dal/load";
import { formatBand } from "@/lib/format";
import { matterLabel, methodLabel } from "@/lib/labels";
import { ORGANISATION_CODE } from "@/lib/org";

export const dynamic = "force-dynamic";

export default async function ApprovalMatrixPage() {
  let matrix;
  try {
    matrix = await loadMatrix(ORGANISATION_CODE);
  } catch (error) {
    if (!(error instanceof NoActiveDalVersionError)) throw error;
    return (
      <div className="empty">
        <div className="empty__t">No approval matrix loaded</div>
        <p className="empty__d">{error.message}</p>
      </div>
    );
  }

  const gaps = matrix.rules.filter((r) => r.isGap);
  const fixed = matrix.rules.filter((r) => r.nonDelegable);
  const committees = new Set(matrix.rules.map((r) => r.committeeCode).filter(Boolean));

  const byDomain = new Map<string, typeof matrix.rules>();
  for (const rule of matrix.rules) {
    const list = byDomain.get(rule.domain) ?? [];
    list.push(rule);
    byDomain.set(rule.domain, list);
  }
  const domains = [...byDomain.entries()].sort((a, b) => b[1].length - a[1].length);

  const roleName = (code: string | null) =>
    code == null ? "—" : (matrix.roles[code]?.nameEn ?? code);

  const simulatorDomains = [...byDomain.keys()]
    .sort((a, b) => matterLabel(a).localeCompare(matterLabel(b)))
    .map((code) => ({ code, label: matterLabel(code) }));
  const simulatorMethods = [
    ...new Set(matrix.rules.map((r) => r.method).filter((m): m is string => !!m)),
  ]
    .sort()
    .map((code) => ({ code, label: methodLabel(code) }));
  const simulatorRoles = Object.values(matrix.roles)
    .map((r) => ({ code: r.code, name: r.nameEn }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <div className="pagehead">
        <div className="pagehead__top">
          <div className="pagehead__titles">
            <div className="pagehead__title">
              <h1 className="h1">Approval matrix</h1>
            </div>
            <p className="pagehead__sub">
              Who proposes, who recommends and who approves, at every value. These rules drive
              every approval in the portal — a change takes effect immediately, including in the
              simulator below.
            </p>
            <div className="pagehead__meta">
              <span>{matrix.rules.length} rules</span>
              <span className="sep">·</span>
              <span>{domains.length} decision types</span>
              <span className="sep">·</span>
              <span>{committees.size} committees involved</span>
              <span className="sep">·</span>
              <span>{fixed.length} cannot be delegated</span>
            </div>
          </div>
        </div>
      </div>

      <section className="section">
        <div className="section__head">
          <h2 className="h2">Try a routing</h2>
        </div>
        <DalSimulator
          domains={simulatorDomains}
          methods={simulatorMethods}
          roles={simulatorRoles}
        />
      </section>

      {gaps.length > 0 && (
        <div className="callout callout--warn" style={{ margin: "24px 0" }}>
          <span className="callout__ico">
            <AlertTriangle size={17} />
          </span>
          <div>
            <div className="strong" style={{ marginBottom: 2 }}>
              {gaps.length} matters have no limit set for them
            </div>
            No limit has ever been set for who may authorise these. Work is still routed so
            nothing stalls, but the route is an assumption and is flagged as one wherever it
            appears.
          </div>
        </div>
      )}

      <section className="section">
        <div className="section__head">
          <h2 className="h2">Routing rules</h2>
          <div className="section__actions">
            <span className="badge badge--outline">Grouped by what is being decided</span>
          </div>
        </div>
      </section>

      <div className="stack stack--lg">
        {domains.map(([domain, rules]) => (
          <section className="section" key={domain}>
            <div className="section__head">
              <h3 className="h3">{matterLabel(domain)}</h3>
              <div className="section__actions">
                <span className="badge badge--outline">{rules.length}</span>
              </div>
            </div>
            <div className="dl">
              <div className="tablewrap">
                <table className="table table--compact">
                  <colgroup>
                    <col style={{ width: "38%" }} />
                    <col style={{ width: "13%" }} />
                    <col style={{ width: "19%" }} />
                    <col style={{ width: "18%" }} />
                    <col style={{ width: "12%" }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Applies to</th>
                      <th>Method</th>
                      <th>Value</th>
                      <th>Approved by</th>
                      <th>Committee</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Keyed by position so the internal rule key stays server-side. */}
                    {rules.map((rule, i) => (
                      <tr key={i}>
                        <td className="wrapcell">
                          <span className="sm" style={{ whiteSpace: "normal" }}>
                            {rule.labelEn}
                          </span>
                          {rule.isGap && (
                            <span className="badge badge--warn" style={{ marginLeft: 8 }}>
                              Assumed
                            </span>
                          )}
                        </td>
                        <td className="sm dim">{rule.method ? methodLabel(rule.method) : "Any"}</td>
                        <td className="sm dim">{formatBand(rule.minValue, rule.maxValue)}</td>
                        <td className="sm">
                          {roleName(rule.approverCode)}
                          {rule.nonDelegable && (
                            <span className="chain__nd" style={{ marginLeft: 6 }}>
                              Fixed
                            </span>
                          )}
                        </td>
                        <td>
                          {rule.committeeCode ? (
                            <span className="row" style={{ gap: 5 }}>
                              <span className="badge">{rule.committeeCode}</span>
                              {rule.committeeAct && (
                                <span className={`chain__act chain__act--${rule.committeeAct}`}>
                                  {rule.committeeAct}
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="dim">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
