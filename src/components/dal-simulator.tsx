"use client";

import { useEffect, useState } from "react";

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

const WARNING_STYLE: Record<Warning["level"], string> = {
  info: "border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200",
  warn: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200",
  err: "border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200",
  gap: "border-purple-300 bg-purple-50 text-purple-900 dark:border-purple-900 dark:bg-purple-950 dark:text-purple-200",
};

const field =
  "w-full rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50";

export function DalSimulator({
  domains,
  methods,
  roles,
}: {
  domains: string[];
  methods: string[];
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

  // Answers are keyed by the query that produced them, so "is a request in flight"
  // is derived by comparing keys rather than held as a second piece of state.
  const [answer, setAnswer] = useState<{ key: string; result: Resolution | null; error: string | null } | null>(
    null,
  );

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
    <div className="flex flex-col gap-6">
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-black/60 dark:text-white/60">Matter</span>
          <select value={domain} onChange={(e) => setDomain(e.target.value)} className={field}>
            {domains.map((d) => (
              <option key={d} value={d}>
                {d.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-black/60 dark:text-white/60">Method</span>
          <select value={method} onChange={(e) => setMethod(e.target.value)} className={field}>
            <option value="">(any)</option>
            {methods.map((m) => (
              <option key={m} value={m}>
                {m.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-black/60 dark:text-white/60">Value (RM)</span>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            inputMode="decimal"
            className={field}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-black/60 dark:text-white/60">
            Contract value (RM)
          </span>
          <input
            value={contractValue}
            onChange={(e) => setContractValue(e.target.value)}
            inputMode="decimal"
            placeholder="for variations and payments"
            className={field}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-black/60 dark:text-white/60">
            Percentage of contract
          </span>
          <input
            value={pct}
            onChange={(e) => setPct(e.target.value)}
            inputMode="decimal"
            placeholder="for variation orders"
            className={field}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-black/60 dark:text-white/60">Funding</span>
          <select value={funding} onChange={(e) => setFunding(e.target.value)} className={field}>
            <option value="">Internal</option>
            <option value="government">Government</option>
            <option value="developer">Developer</option>
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-black/60 dark:text-white/60">
            Acting officer
          </span>
          <select value={actor} onChange={(e) => setActor(e.target.value)} className={field}>
            <option value="">(not specified)</option>
            {roles.map((r) => (
              <option key={r.code} value={r.code}>
                {r.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-black/60 dark:text-white/60">Absent</span>
          <select value={absent} onChange={(e) => setAbsent(e.target.value)} className={field}>
            <option value="">(nobody)</option>
            {roles.map((r) => (
              <option key={r.code} value={r.code}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
      </section>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {result && (
        <section className={`flex flex-col gap-5 ${stale ? "opacity-60" : ""}`}>
          {result.rule ? (
            <div className="flex flex-col gap-1 border-l-2 border-black/20 pl-4 dark:border-white/20">
              <p className="text-sm font-medium">{result.rule.label}</p>
              <p className="font-mono text-xs text-black/50 dark:text-white/50">
                {result.rule.key} · {result.rule.clause}
                {result.regime ? ` · ${result.regime} regime` : ""}
              </p>
              {result.rule.note && (
                <p className="text-xs text-black/60 dark:text-white/60">{result.rule.note}</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-black/60 dark:text-white/60">No rule matched.</p>
          )}

          {result.chain.length > 0 && (
            <ol className="flex flex-col">
              {result.chain.map((step, i) => (
                <li key={`${step.role}-${step.act}-${i}`} className="flex items-start gap-3 py-2">
                  <span className="mt-0.5 w-5 shrink-0 text-right font-mono text-xs text-black/40 dark:text-white/40">
                    {i + 1}
                  </span>
                  <div className="flex flex-1 flex-col gap-0.5">
                    <span className="text-sm">
                      {step.name}
                      {step.committee && (
                        <span className="ml-2 rounded bg-black/5 px-1.5 py-0.5 text-xs dark:bg-white/10">
                          committee
                        </span>
                      )}
                      {step.nonDelegable && (
                        <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                          non-delegable
                        </span>
                      )}
                      {step.note === "downgraded" && (
                        <span className="ml-2 rounded bg-black/5 px-1.5 py-0.5 text-xs dark:bg-white/10">
                          downgraded
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-black/50 dark:text-white/50">
                      {ACT_LABEL[step.act] ?? step.act}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          )}

          {result.warnings.length > 0 && (
            <div className="flex flex-col gap-2">
              {result.warnings.map((w, i) => (
                <p
                  key={`${w.code}-${i}`}
                  className={`rounded-md border px-3 py-2 text-xs ${WARNING_STYLE[w.level]}`}
                >
                  {w.messageEn}
                  {w.clause && <span className="ml-1 font-mono opacity-70">({w.clause})</span>}
                </p>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
