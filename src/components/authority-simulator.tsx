"use client";

import { actLabel } from "@/components/ui/act";
import { useEffect, useId, useState } from "react";

import { RuleChain } from "@/components/rule-chain";
import { Badge, Chip } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { cx } from "@/components/ui/cx";
import { EmptyState, Callout } from "@/components/ui/feedback";
import { AffixInput, Field, Input, Select } from "@/components/ui/field";

interface ResolvedStep {
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
  chain: ResolvedStep[];
  warnings: Warning[];
}

const REGIME_LABEL: Record<string, string> = {
  below: "Below the quotation floor",
  quotation: "Quotation band",
  tender: "Tender band",
};


const CALLOUT: Record<Warning["level"], "info" | "warn" | "err"> = {
  info: "info",
  warn: "warn",
  err: "err",
  gap: "warn",
};

export function AuthoritySimulator({
  domains,
  methods,
  roles,
  fundingRoutes,
}: {
  domains: { code: string; label: string }[];
  methods: { code: string; label: string }[];
  roles: { code: string; name: string }[];
  /// Configured in Reference data. Empty until someone sets one, which is why the
  /// select says so rather than offering a route the customer never agreed to.
  fundingRoutes: { code: string; label: string }[];
}) {
  // Start on what this customer has configured. Hard-coded "payment" and "tender"
  // pointed the first query at a matter and method that may not exist, so the
  // simulator opened on "no rule matches" for no reason.
  const [domain, setDomain] = useState(domains[0]?.code ?? "");
  const [method, setMethod] = useState("");
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

    fetch(`/api/authority/resolve?${key}`, { signal: controller.signal })
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

  const id = useId();
  const fid = (name: string) => `${id}-${name}`;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
      <Card tone="flat">
        <CardHeader title="The matter" subtitle="What is being authorised." />
        <CardBody className="flex flex-col gap-4">
          <Field label="Matter" htmlFor={fid("domain")}>
            <Select id={fid("domain")} value={domain} onChange={(e) => setDomain(e.target.value)}>
              {domains.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Sourcing method" htmlFor={fid("method")}>
            <Select id={fid("method")} value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="">Any</option>
              {methods.map((m) => (
                <option key={m.code} value={m.code}>
                  {m.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Value" htmlFor={fid("value")}>
            <AffixInput
              id={fid("value")}
              prefix="RM"
              className="[&_input]:text-right"
              value={value}
              inputMode="decimal"
              onChange={(e) => setValue(e.target.value)}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Contract value" htmlFor={fid("contract")} hint="For variations">
              <Input
                id={fid("contract")}
                size="sm"
                numeric
                value={contractValue}
                inputMode="decimal"
                placeholder="optional"
                onChange={(e) => setContractValue(e.target.value)}
              />
            </Field>
            <Field label="Percentage" htmlFor={fid("pct")} hint="Of contract sum">
              <Input
                id={fid("pct")}
                size="sm"
                numeric
                value={pct}
                inputMode="decimal"
                placeholder="optional"
                onChange={(e) => setPct(e.target.value)}
              />
            </Field>
          </div>

          <hr className="border-line" />

          <Field
            label="Funding route"
            htmlFor={fid("funding")}
            hint={
              fundingRoutes.length === 0
                ? "No funding route configured yet"
                : "Whether a funder overrides these limits is set per route"
            }
          >
            <Select
              id={fid("funding")}
              size="sm"
              value={funding}
              onChange={(e) => setFunding(e.target.value)}
              disabled={fundingRoutes.length === 0}
            >
              <option value="">Not specified</option>
              {fundingRoutes.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Acting officer" htmlFor={fid("actor")} hint="Nobody may approve their own matter">
            <Select id={fid("actor")} size="sm" value={actor} onChange={(e) => setActor(e.target.value)}>
              <option value="">Not specified</option>
              {roles.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Absent" htmlFor={fid("absent")} hint="Authority reverts upward, never down">
            <Select id={fid("absent")} size="sm" value={absent} onChange={(e) => setAbsent(e.target.value)}>
              <option value="">Nobody</option>
              {roles.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.name}
                </option>
              ))}
            </Select>
          </Field>
        </CardBody>
      </Card>

      <section
        aria-live="polite"
        aria-busy={stale}
        className={cx("flex min-w-0 flex-col gap-4 transition-opacity duration-150", stale && "opacity-60")}
      >
        {error && <Callout tone="err">{error}</Callout>}

        {result?.rule && (
          <Card tone="brand">
            <CardBody>
              <div className="mb-2 flex flex-wrap items-center gap-2.5">
                {result.regime && (
                  <Chip tone="brand">{REGIME_LABEL[result.regime] ?? "Unknown band"}</Chip>
                )}
                {result.nonDelegable && <Badge tone="warn">non-delegable</Badge>}
              </div>
              <p className="text-[15px] font-bold tracking-tight text-ink">{result.rule.label}</p>
            </CardBody>
          </Card>
        )}

        {result && result.chain.length > 0 && (
          <Card tone="flat">
            <CardHeader
              title="Approval chain"
              subtitle={`${result.chain.length} steps, in order`}
            />
            <CardBody>
              <RuleChain
                steps={result.chain.map((step) => ({
                  role: step.name,
                  act: step.act,
                  meta: `${actLabel(step.act)}${step.note === "downgraded" ? " · downgraded" : ""}`,
                  nonDelegable: step.nonDelegable,
                }))}
              />
            </CardBody>
          </Card>
        )}

        {result && result.chain.length === 0 && !error && (
          <Card tone="flat">
            <EmptyState size="sm" title="No rule matched">
              Nothing in the authority matrix covers this combination.
            </EmptyState>
          </Card>
        )}

        {result?.warnings.map((w, i) => (
          <Callout key={`${w.code}-${i}`} tone={CALLOUT[w.level]}>
            <span>{w.messageEn}</span>
            {w.clause && (
              <Badge outline className="ml-2 align-middle" title={`Clause ${w.clause}`}>
                {w.clause}
              </Badge>
            )}
          </Callout>
        ))}
      </section>
    </div>
  );
}
