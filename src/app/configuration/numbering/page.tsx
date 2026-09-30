import { AlertTriangle } from "@/components/icons";
import { loadSeries } from "@/lib/numbering/load";
import { patternFaults, periodFor, previewNext, serialFor } from "@/lib/numbering/series";
import { ORGANISATION_CODE } from "@/lib/org";

import { AddSeries, EditSeries } from "./editors";

export const dynamic = "force-dynamic";

const PROVENANCE_LABEL: Record<string, string> = {
  STATED: "Stated",
  OBSERVED: "Observed",
  ASSUMED: "Assumed",
};

const PROVENANCE_CHIP: Record<string, string> = {
  STATED: "chip--ok",
  OBSERVED: "chip--info",
  ASSUMED: "chip--warn",
};

const RESET_LABEL: Record<string, string> = {
  NEVER: "Never",
  CALENDAR_YEAR: "Each calendar year",
  FINANCIAL_YEAR: "Each financial year",
};

export default async function NumberingPage() {
  const on = new Date();
  const series = await loadSeries(ORGANISATION_CODE);
  const faulty = series.filter((s) => patternFaults(s).length > 0);

  return (
    <>
      <div className="pagehead">
        <div className="pagehead__top">
          <div className="pagehead__titles">
            <div className="pagehead__title">
              <h1 className="h1">Numbering</h1>
              {faulty.length > 0 && (
                <span className="badge badge--warn">
                  {faulty.length === 1 ? "1 pattern at fault" : `${faulty.length} patterns at fault`}
                </span>
              )}
            </div>
            <p className="pagehead__sub">
              How exercise, contract and certificate references are formed.
            </p>
          </div>
        </div>
      </div>

      {faulty.length > 0 && (
        <div className="callout callout--err" style={{ marginBottom: 24 }}>
          <div>
            <strong>A pattern would produce references that collide</strong>
            <ul className="stack stack--sm" style={{ margin: "6px 0 0", paddingLeft: 0 }}>
              {faulty.map((s) =>
                patternFaults(s).map((f) => (
                  <li key={`${s.id}-${f.kind}`} className="sm" style={{ listStyle: "none" }}>
                    <strong>{s.nameEn}</strong> —{" "}
                    {f.kind === "NO_SERIAL"
                      ? "no {SERIAL} in the pattern, so every reference would be identical."
                      : f.kind === "UNKNOWN_TOKEN"
                        ? `{${f.token}} is not a token and is rendered literally.`
                        : "it starts again each period but shows no year, so next period's first reference repeats this one."}
                  </li>
                )),
              )}
            </ul>
          </div>
        </div>
      )}

      <section className="section" style={{ marginBottom: 24 }}>
        <div className="section__head">
          <h2 className="h3">Series</h2>
          {series.length > 0 && <span className="badge badge--outline">{series.length}</span>}
          <div className="spacer" />
          <AddSeries />
        </div>
        <p className="sm muted" style={{ margin: "0 0 12px" }}>
          A reference is the business key of a matter, so it is configured rather than
          improvised. Allocated numbers are never reused.
        </p>

        {series.length === 0 ? (
          <div className="card">
            <div className="card__body">
              <div className="empty">
                <div className="empty__t">Not set</div>
                <p className="empty__d">
                  No series has been set. Nothing can be numbered until one is, and a record
                  without a reference cannot be cited on a contract or a certificate.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="dl">
            <div className="tablewrap">
              <table className="table">
                <colgroup>
                  <col style={{ width: "20%" }} />
                  <col style={{ width: "20%" }} />
                  <col style={{ width: "20%" }} />
                  <col style={{ width: "16%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "12%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Series</th>
                    <th>Pattern</th>
                    <th>Next reference</th>
                    <th>Starts again</th>
                    <th>Source</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {series.map((s) => {
                    const faults = patternFaults(s);
                    const period = periodFor(s, on);
                    return (
                      <tr key={s.id}>
                        <td>
                          <div className="cellstack">
                            <span className="cellstack__t">{s.nameEn}</span>
                            <span className="cellstack__s">
                              serial {serialFor(s, on)}
                              {period ? ` of ${period}` : ""}
                            </span>
                          </div>
                        </td>
                        <td className="sm mono">{s.pattern}</td>
                        <td>
                          {faults.length > 0 ? (
                            <span className="badge badge--warn">Would collide</span>
                          ) : (
                            <span className="num sm">{previewNext(s, on)}</span>
                          )}
                        </td>
                        <td className="sm dim">
                          {RESET_LABEL[s.resetOn] ?? s.resetOn}
                          {s.resetOn === "FINANCIAL_YEAR" && s.financialYearStartMonth !== 1
                            ? ` (from month ${s.financialYearStartMonth})`
                            : ""}
                        </td>
                        <td>
                          <span className={`chip ${PROVENANCE_CHIP[s.provenance] ?? ""}`}>
                            {PROVENANCE_LABEL[s.provenance] ?? s.provenance}
                          </span>
                        </td>
                        <td className="right">
                          <EditSeries series={s} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <div className="callout callout--info">
        <span className="callout__ico">
          <AlertTriangle size={17} />
        </span>
        <div className="grow">
          <span className="sm">
            A serial only ever moves forward. Where a matter is cancelled its reference is
            not returned to the pool — the gap is recorded, because a missing reference is
            evidence and a reused one is a defect.
          </span>
        </div>
      </div>
    </>
  );
}
