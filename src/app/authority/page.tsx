import { AlertTriangle } from "@/components/icons";
import { formatClause } from "@/lib/citation";
import { matterLabel } from "@/lib/labels";
import { loadMatrix, NoActiveDalVersionError } from "@/lib/dal/load";
import { formatBand } from "@/lib/format";
import { ORGANISATION_CODE } from "@/lib/org";

export const dynamic = "force-dynamic";

export default async function AuthorityPage() {
  let matrix;
  try {
    matrix = await loadMatrix(ORGANISATION_CODE);
  } catch (error) {
    if (!(error instanceof NoActiveDalVersionError)) throw error;
    return (
      <div className="empty">
        <div className="empty__t">No authority limits loaded</div>
        <p className="empty__d">{error.message}</p>
      </div>
    );
  }

  const gaps = matrix.rules.filter((r) => r.isGap);

  // Grouped by matter, which is how the DAL itself is laid out.
  const byDomain = new Map<string, typeof matrix.rules>();
  for (const rule of matrix.rules) {
    const list = byDomain.get(rule.domain) ?? [];
    list.push(rule);
    byDomain.set(rule.domain, list);
  }
  const domains = [...byDomain.entries()].sort((a, b) => b[1].length - a[1].length);

  const roleName = (code: string | null) =>
    code == null ? "—" : (matrix.roles[code]?.nameEn ?? code);

  return (
    <>
      <div className="pagehead">
        <div className="pagehead__top">
          <div className="pagehead__titles">
            <div className="pagehead__title">
              <h1 className="h1">Authority limits</h1>
              <span className="badge badge--outline">{matrix.rules.length} rows</span>
            </div>
            <p className="pagehead__sub">
              Who may authorise what, and up to which value.
            </p>
            <div className="pagehead__meta">
              <span>
                Quotation and tender meet at {formatBandBoundary(matrix.policy.boundaryValue)}
              </span>
              <span className="sep">·</span>
              <span>{domains.length} matters</span>
            </div>
          </div>
        </div>
      </div>

      {gaps.length > 0 && (
        <div className="callout callout--warn" style={{ marginBottom: 24 }}>
          <span className="callout__ico">
            <AlertTriangle size={17} />
          </span>
          <div>
            <div className="strong" style={{ marginBottom: 2 }}>
              {gaps.length} matters have no authority limit set for them
            </div>
            No limit has ever been set for who may authorise these. Work is still routed so
            nothing stalls, but the route is an assumption and is flagged as one wherever it
            appears.
          </div>
        </div>
      )}

      <div className="stack stack--lg">
        {domains.map(([domain, rules]) => (
          <section className="section" key={domain}>
            <div className="section__head">
              <h2 className="h3">{matterLabel(domain)}</h2>
              <div className="section__actions">
                <span className="badge badge--outline">{rules.length}</span>
              </div>
            </div>
            <div className="dl">
              <div className="tablewrap">
                <table className="table table--compact">
                  <colgroup>
                    <col style={{ width: "30%" }} />
                    <col style={{ width: "11%" }} />
                    <col style={{ width: "16%" }} />
                    <col style={{ width: "17%" }} />
                    <col style={{ width: "12%" }} />
                    <col style={{ width: "14%" }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Method</th>
                      <th>Band</th>
                      <th>Approver</th>
                      <th>Committee</th>
                      <th>Clause</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Keyed by position, not by the internal rule key: React keys are
                        serialised into the page payload, and the internal identifier has
                        no business leaving the server. The list is server-rendered in a
                        fixed order and never reordered on the client. */}
                    {rules.map((rule, i) => (
                      <tr key={i}>
                        <td className="wrapcell">
                          <span className="sm" style={{ whiteSpace: "normal" }}>
                            {rule.labelEn}
                          </span>
                        </td>
                        <td className="sm dim">{rule.method?.replace(/_/g, " ") ?? "any"}</td>
                        <td className="sm dim">{formatBand(rule.minValue, rule.maxValue)}</td>
                        <td className="sm">
                          {roleName(rule.approverCode)}
                          {rule.nonDelegable && (
                            <span className="chain__nd" style={{ marginLeft: 6 }}>
                              ND
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
                        <td className="xs dim">
                          {rule.isGap ? (
                            <span className="badge badge--warn">No clause</span>
                          ) : (
                            (formatClause(rule.clause) ?? "—")
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

function formatBandBoundary(value: number): string {
  return "RM" + value.toLocaleString("en-MY");
}
