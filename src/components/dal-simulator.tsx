"use client";

import { useEffect, useState } from "react";

import { AlertTriangle, ArrowRight, InfoIcon } from "@/components/icons";
import { clauseOrGap, formatClause } from "@/lib/citation";

interface ChainStep {
  role: string;
  name: string;
  act: string;
  committee?: string;
  nonDelegable: boolean;
  note?: string;
}

interface Warning {
  code: string;
  level: "info" | "warn" | "err" | "gap";
  messageEn: string;
  clause?: string;
}

interface Resolution {
  rule: { key: string; label: string; clause: string; isGap: boolean; note?: string } | null;
  regime: string | null;
  approver: string | null;
  committee: string | null;
  nonDelegable: boolean;
  chain: ChainStep[];
  warnings: Warning[];
}

const ACT_LABEL: Record<string, string> = {
  P: "Propose",
  JP: "Jointly Propose",
  R: "Recommend",
  JR: "Jointly Recommend",
  MR: "Mandatory Recommendation",
  MJR: "Mandatory Joint Recommendation",
  A: "Approve",
  MA: "Mandatory Approval",
};

const CALLOUT: Record<Warning["level"], string> = {
  info: "callout--info",
  warn: "callout--warn",
  err: "callout--err",
  gap: "callout--warn",
};

export function DalSimulator({
  domains,
  methods,
  roles,
}: {
  domains: { code: string; label: string }[];
  methods: { code: string; label: string }[];
  roles: { code: string; name: string }[];
}) {
  const [domain, setDomain] = useState("payment");
  const [method, setMethod] = useState("tender");
  const [value, setValue] = useState("620000");
  const [contractValue, setContractValue] = useState("");
  const [pct, setPct] = useState("");
  const [actor, setActor] = useState("");
  const [absent, setAbsent] = useState("");
  const [funding, setFunding] = useState("");

  // Keyed by the query that produced it, so "is a request in flight" is derived
  // rather than held as a second piece of state.
  const [answer, setAnswer] = useState<{
    key: string;
    result: Resolution | null;
    error: string | null;
  } | null>(null);

  const params = new URLSearchParams({ domain });
  if (method) params.set("method", method);
  if (value) params.set("value", value);
  if (contractValue) params.set("contractValue", contractValue);
  if (pct) params.set("pct", pct);
  if (actor) params.set("actor", actor);
  if (absent) params.append("absent", absent);
  if (funding) params.set("funding", funding);
  const key = params.toString();

  const stale = answer?.key !== key;
  const result = answer?.result ?? null;
  const error = answer?.error ?? null;

  useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/dal/resolve?${key}`, { signal: controller.signal })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
        setAnswer({ key, result: body, error: null });
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setAnswer({ key, result: null, error: e instanceof Error ? e.message : "Request failed" });
      });

    return () => controller.abort();
  }, [key]);

  return (
    <div className="grid" style={{ gridTemplateColumns: "minmax(0,340px) minmax(0,1fr)", gap: 24 }}>
      <section className="card" style={{ alignSelf: "start" }}>
        <div className="card__head">
          <div className="card__titles">
            <h2 className="h3">The matter</h2>
            <div className="card__sub">What is being authorised</div>
          </div>
        </div>
        <div className="card__body">
          <div className="stack stack--md">
            <label className="field">
              <span className="field__lbl">Matter</span>
              <select className="select" value={domain} onChange={(e) => setDomain(e.target.value)}>
                {domains.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field__lbl">Sourcing method</span>
              <select className="select" value={method} onChange={(e) => setMethod(e.target.value)}>
                <option value="">Any</option>
                {methods.map((m) => (
                  <option key={m.code} value={m.code}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field__lbl">Value</span>
              <div className="inputwrap inputwrap--pre">
                <span className="inputwrap__pre">RM</span>
                <input
                  className="input input--num"
                  value={value}
                  inputMode="decimal"
                  onChange={(e) => setValue(e.target.value)}
                />
              </div>
            </label>

            <div className="grid g2" style={{ gap: 12 }}>
              <label className="field">
                <span className="field__lbl">Contract value</span>
                <input
                  className="input input--num input--sm"
                  value={contractValue}
                  inputMode="decimal"
                  placeholder="optional"
                  onChange={(e) => setContractValue(e.target.value)}
                />
                <span className="field__hint">For variations</span>
              </label>
              <label className="field">
                <span className="field__lbl">Percentage</span>
                <input
                  className="input input--num input--sm"
                  value={pct}
                  inputMode="decimal"
                  placeholder="optional"
                  onChange={(e) => setPct(e.target.value)}
                />
                <span className="field__hint">Of contract sum</span>
              </label>
            </div>

            <div className="divider" />

            <label className="field">
              <span className="field__lbl">Funding route</span>
              <select
                className="select select--sm"
                value={funding}
                onChange={(e) => setFunding(e.target.value)}
              >
                <option value="">Internal</option>
                <option value="government">Government</option>
                <option value="developer">Developer</option>
              </select>
            </label>

            <label className="field">
              <span className="field__lbl">Acting officer</span>
              <select
                className="select select--sm"
                value={actor}
                onChange={(e) => setActor(e.target.value)}
              >
                <option value="">Not specified</option>
                {roles.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.name}
                  </option>
                ))}
              </select>
              <span className="field__hint">Nobody may approve their own matter</span>
            </label>

            <label className="field">
              <span className="field__lbl">Absent</span>
              <select
                className="select select--sm"
                value={absent}
                onChange={(e) => setAbsent(e.target.value)}
              >
                <option value="">Nobody</option>
                {roles.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.name}
                  </option>
                ))}
              </select>
              <span className="field__hint">Authority reverts upward, never down</span>
            </label>
          </div>
        </div>
      </section>

      <section className="stack" style={{ opacity: stale ? 0.6 : 1, transition: "opacity 150ms" }}>
        {error && (
          <div className="callout callout--err" role="alert">
            <span className="callout__ico">
              <AlertTriangle size={17} />
            </span>
            <div>{error}</div>
          </div>
        )}

        {result?.rule && (
          <div className="card card--accent">
            <div className="card__body">
              <div className="row wrap" style={{ gap: 10, marginBottom: 8 }}>
                {result.regime && <span className="chip chip--brand">{result.regime} regime</span>}
                {result.nonDelegable && <span className="chain__nd">non-delegable</span>}
              </div>
              <p className="h3" style={{ marginBottom: 6 }}>
                {result.rule.label}
              </p>
              {/* The governing authority, written the way an officer would cite it.
                  The internal rule key stays in the API for audit and off the screen. */}
              <p className="sm dim">
                {clauseOrGap(result.rule.clause, result.rule.isGap)}
              </p>
            </div>
          </div>
        )}

        {result && result.chain.length > 0 && (
          <div className="card">
            <div className="card__head">
              <div className="card__titles">
                <h2 className="h3">Approval chain</h2>
                <div className="card__sub">{result.chain.length} steps, in order</div>
              </div>
            </div>
            <div className="card__body">
              <div className="chain">
                {result.chain.map((step, i) => (
                  <div key={`${step.role}-${step.act}-${i}`} className="row" style={{ gap: 0 }}>
                    <div className="chain__n" data-state={i === result.chain.length - 1 ? "current" : "done"}>
                      <span className={`chain__act chain__act--${step.act}`}>{step.act}</span>
                      <span className="col">
                        <span className="chain__role">{step.name}</span>
                        <span className="chain__meta">
                          {ACT_LABEL[step.act] ?? step.act}
                          {step.note === "downgraded" && " · downgraded"}
                        </span>
                      </span>
                      {step.nonDelegable && <span className="chain__nd">ND</span>}
                    </div>
                    {i < result.chain.length - 1 && (
                      <span className="chain__arrow">
                        <ArrowRight size={16} />
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {result && result.chain.length === 0 && !error && (
          <div className="card">
            <div className="card__body">
              <div className="empty empty--sm">
                <div className="empty__t">No rule matched</div>
                <p className="empty__d">
                  Nothing in the authority matrix covers this combination.
                </p>
              </div>
            </div>
          </div>
        )}

        {result?.warnings.map((w, i) => (
          <div key={`${w.code}-${i}`} className={`callout ${CALLOUT[w.level]}`}>
            <span className="callout__ico">
              {w.level === "info" ? <InfoIcon size={17} /> : <AlertTriangle size={17} />}
            </span>
            <div>
              {w.messageEn}
              {formatClause(w.clause) && <span className="dim"> ({formatClause(w.clause)})</span>}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
