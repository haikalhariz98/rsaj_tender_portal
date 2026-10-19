"use client";

import { actLabel } from "@/components/ui/act";
import { useEffect, useId, useState } from "react";

import { RuleChain } from "@/components/rule-chain";
import { Badge, Chip } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { cx } from "@/components/ui/cx";
import { Callout, EmptyState, FindingNote } from "@/components/ui/feedback";
import { AffixInput, Field, Input, Select } from "@/components/ui/field";
import { SIMULATOR_HINT } from "@/lib/labels";

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
  // Opens on no case at all. Whatever matter it opened on, the default combination
  // (a value, no method) often matches nothing, and a red "no rule matched" before the
  // user has asked anything reads as a fault.
  const [domain, setDomain] = useState("");
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

  const chosen = domain !== "";
  const stale = chosen && answer?.key !== key;
  const result = chosen ? (answer?.result ?? null) : null;
  const error = chosen ? (answer?.error ?? null) : null;

  useEffect(() => {
    if (!chosen) return;
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
  }, [key, chosen]);

  const id = useId();
  const fid = (name: string) => `${id}-${name}`;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
      <Card tone="flat">
        <CardHeader title="The matter" subtitle="What is being authorised." />
        <CardBody className="flex flex-col gap-4">
          <Field label="Matter" htmlFor={fid("domain")}>
            <Select id={fid("domain")} value={domain} onChange={(e) => setDomain(e.target.value)}>
              <option value="">Choose a matter</option>
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
            <Field label="Contract value" htmlFor={fid("contract")} hint={SIMULATOR_HINT.contractValue}>
              <Input
                id={fid("contract")}
                numeric
                value={contractValue}
                inputMode="decimal"
                placeholder="optional"
                onChange={(e) => setContractValue(e.target.value)}
              />
            </Field>
            <Field label="Percentage" htmlFor={fid("pct")} hint={SIMULATOR_HINT.percentage}>
              <Input
                id={fid("pct")}
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
                ? SIMULATOR_HINT.noFundingRoute
                : SIMULATOR_HINT.fundingRoute
            }
          >
            <Select
              id={fid("funding")}
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

          <Field label="Acting officer" htmlFor={fid("actor")} hint={SIMULATOR_HINT.actingOfficer}>
            <Select id={fid("actor")} value={actor} onChange={(e) => setActor(e.target.value)}>
              <option value="">Not specified</option>
              {roles.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Absent" htmlFor={fid("absent")} hint={SIMULATOR_HINT.absent}>
            <Select id={fid("absent")} value={absent} onChange={(e) => setAbsent(e.target.value)}>
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

        {!chosen && (
          <Card tone="flat">
            <EmptyState size="sm" title="Pick a matter and a value" />
          </Card>
        )}

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

        {chosen && result && result.chain.length === 0 && !error && (
          <Card tone="flat">
            <EmptyState size="sm" title="No rule matched" />
          </Card>
        )}

        {result?.warnings.map((w, i) => (
          <FindingNote key={`${w.code}-${i}`} level={w.level}>
            <span>{w.messageEn}</span>
            {w.clause && (
              <Badge outline className="ml-2 align-middle" title={`Clause ${w.clause}`}>
                {w.clause}
              </Badge>
            )}
          </FindingNote>
        ))}
      </section>
    </div>
  );
}
