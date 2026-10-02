import type { ReactNode } from "react";

import { ClockIcon, FileIcon } from "@/components/icons";
import { Badge, Chip } from "@/components/ui/badge";
import { Blocked } from "@/components/ui/blocked";
import { Card, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { ProvenanceBadge } from "@/components/ui/provenance";
import { enterFault, type BaselineValues, type EnteredGroup } from "@/lib/contract/baseline";
import { correctableFaults } from "@/lib/contract/baseline-entry";
import { contractFaultText } from "@/lib/contract/fault-text";
import type { signingFacts } from "@/lib/contract/judge";
import { BASELINE_FIELD_WORDS, REASON_WORDS, SOURCE_WORDS } from "@/lib/contract/labels";
import { baselineRows, frozenInputsOf, valuesOf } from "@/lib/contract/load";
import type { LoadedContract } from "@/lib/contract/repo";
import { isExecuted } from "@/lib/contract/status";
import type { BaselineSource, ContractStatus } from "@/lib/contract/types";
import { confirmFaults, draftFaults } from "@/lib/contract/versions";
import { formatDate, formatOrgDateTime } from "@/lib/format";
import { formatMoney, type Sen } from "@/lib/money";
import { formatPct } from "@/lib/tender-docs/percent";

import { BaselineEntryDrawer, ConfirmBaselineDrawer } from "./editors";

type Facts = Awaited<ReturnType<typeof signingFacts>>;
const rm = (s: Sen | null) => (s == null ? null : formatMoney(s));
const UNIT = { DAYS: ["day", "days"], WEEKS: ["week", "weeks"], MONTHS: ["month", "months"] } as const;
const period = (n: number, u: keyof typeof UNIT) => `${n} ${UNIT[u][n === 1 ? 0 : 1]}`;

interface FieldRow {
  key: string;
  group: EnteredGroup | null;
  value: ReactNode | null;
  source: BaselineSource | null;
  /// What "Not set" means here, where it is not simply unset.
  unset?: string;
}

/// Each value of a baseline, as the screen states it. "None" is a stated answer; null reads "Not set", never 0.
function rowsOf(b: BaselineValues): FieldRow[] {
  return [
    { key: "contractSum", group: null, value: rm(b.contractSum), source: "AWARD" },
    { key: "completion", group: null, value: period(b.completionPeriod, b.completionUnit), source: "AWARD" },
    { key: "contractDate", group: null, value: b.contractDate ? formatDate(b.contractDate) : null, source: null, unset: "The day the signature for the employer is recorded" },
    { key: "possession", group: null, value: b.possessionDate ? formatDate(b.possessionDate) : null, source: null, unset: "Recorded at possession of site (post-award lifecycle)" },
    { key: "dateForCompletion", group: null, value: b.dateForCompletion ? formatDate(b.dateForCompletion) : null, source: b.dateForCompletion ? "DERIVED" : null, unset: "From possession and the period" },
    // 64-C4-c: no defects liability period reads "None", never "0 months".
    { key: "dlp", group: "dlp", value: b.dlpApplies == null ? null : b.dlpApplies ? (b.dlpMonths ? period(b.dlpMonths, "MONTHS") : null) : "None", source: b.dlpSource },
    {
      key: "lad",
      group: "lad",
      value: b.ladKind == null ? null : b.ladKind === "AMOUNT_PER_DAY" ? (b.ladAmount != null ? `${rm(b.ladAmount)} ${b.ladUnit || "(no unit)"}` : null) : b.ladPct ? `${formatPct(b.ladPct)} of the contract sum a day${b.ladDaily != null ? ` = ${rm(b.ladDaily)} a day (half up to the sen)` : ""}` : null,
      source: b.ladSource,
    },
    { key: "retention", group: "retention", value: b.retentionApplies == null ? null : !b.retentionApplies ? "Does not apply" : `${b.retentionPercent ? formatPct(b.retentionPercent) : "Not set"} of each certificate, capped at ${b.retentionCapPercent ? formatPct(b.retentionCapPercent) : "not set"} of the contract sum`, source: b.retentionSource },
    { key: "sums", group: "sums", value: b.pcSums == null || b.provisionalSums == null ? null : `Prime cost ${rm(b.pcSums)} · provisional ${rm(b.provisionalSums)}`, source: b.sumsSource },
    { key: "buildersWorksValue", group: null, value: rm(b.buildersWorksValue), source: b.buildersWorksValue != null ? "DERIVED" : null, unset: "The contract sum less the prime cost and provisional sums, once those are stated" },
    { key: "firstInterim", group: "firstInterim", value: rm(b.firstInterimMinimum), source: b.firstInterimSource },
    { key: "subsequentInterim", group: "subsequentInterim", value: rm(b.subsequentInterimMinimum), source: b.subsequentInterimSource },
    { key: "honourDays", group: "honourDays", value: b.honourCertificateDays == null ? null : period(b.honourCertificateDays, "DAYS"), source: b.honourSource, unset: "Not set: the module that reads it refuses its own act until it is" },
    {
      key: "sectional",
      group: "sectional",
      value: b.sectionalCompletion == null ? null : !b.sectionalCompletion ? "Does not apply" : b.sections.length ? b.sections.map((s) => `${s.ref}. ${s.description}: ${s.ladDaily != null ? `${rm(s.ladDaily)} a day` : "damages not stated"}`).join("; ") : "Applies, no section stated",
      source: b.sectionalSource,
    },
    { key: "unfixedMaterials", group: "unfixedMaterials", value: b.unfixedMaterialsPct ? formatPct(b.unfixedMaterialsPct) : null, source: b.unfixedMaterialsPct ? "ENTERED" : null, unset: "Not set: the module that reads it refuses its own act until it is" },
    { key: "onCost", group: "onCost", value: b.onCostPct ? formatPct(b.onCostPct) : null, source: b.onCostPct ? "ENTERED" : null, unset: "Not set: the module that reads it refuses its own act until it is" },
    { key: "designWork", group: "designWork", value: rm(b.designWorkValue), source: b.designWorkValue != null ? "ENTERED" : null, unset: "Not set: the module that reads it refuses its own act until it is" },
  ];
}

/**
 * The contract baseline (FR-CON-014, ADR 0021): every value with where it came from and how far it can be
 * relied on, the versions recorded, and what still keeps it from being confirmed. A value nothing states
 * reads "Not set", never 0.
 */
export function BaselinePanel({ l, facts, timeZone }: { l: LoadedContract; facts: Facts; timeZone: string | null }) {
  const c = l.contract;
  const status = c.status as ContractStatus;
  const { draft, versions } = baselineRows(c);
  const latest = versions[versions.length - 1] ?? null;
  const shown = latest ?? draft;
  if (!shown) {
    return (
      <Card>
        <EmptyState title="No baseline yet">The draft is built when preparation starts, from the award, the tender Appendix and the bill.</EmptyState>
      </Card>
    );
  }
  const values = valuesOf(shown);
  const inputs = frozenInputsOf(c);
  const entered = (shown.entered ?? {}) as Record<string, { provenance?: string; note?: string }>;
  const draftOpen = draftFaults({ status, versions: versions.length }).length === 0;
  const correcting = versions.length > 0 && status !== "CANCELLED";
  const confirm = confirmFaults({ status, hasDraft: !!draft, versions: versions.length, gateReady: facts.gate.ready, baselineBlocks: facts.baseline.blocks });
  const provenanceOf = (r: FieldRow): string | null => {
    if (r.source === "ENTERED" && r.group) return entered[r.group]?.provenance ?? null;
    if (r.source === "AWARD") return inputs?.award.termsProvenance ?? null;
    if (r.source === "DERIVED" && (r.key === "retention" || r.key === "dlp")) return inputs?.band?.provenance ?? null;
    if (r.source === "DERIVED" && r.key === "firstInterim") return inputs?.interimPolicy.provenance ?? null;
    return null;
  };
  const findings = facts.baseline.findings;
  return (
    <div className="flex flex-col gap-6">
      {findings.some((f) => f.level !== "info") && (
        <Callout tone={findings.some((f) => f.level === "block") ? "warn" : "info"} title={findings.some((f) => f.level === "block") ? "The baseline is not complete" : "Noted"}>
          {findings.filter((f) => f.level !== "info").map(contractFaultText).join(" ")}
        </Callout>
      )}
      <Card className="overflow-hidden">
        <CardHeader
          icon={<FileIcon size={17} />}
          title={latest ? `Version ${latest.version} in force` : "The draft"}
          subtitle={latest ? `${REASON_WORDS[latest.reason!].en}, ${formatDate(latest.recordedOn)}. Never edited: a change is a correction, with its reason.` : "Built when preparation started. Values nothing else states are entered here, each with where it came from."}
          actions={
            !latest && status !== "CANCELLED" && !isExecuted(status) ? (
              confirm.length ? <Blocked label="Confirm the baseline" reason={confirm.map(contractFaultText).join(" ")} primary /> : <ConfirmBaselineDrawer id={c.id} blocker={null} />
            ) : latest ? (
              <Badge tone="ok">{`Version ${latest.version}`}</Badge>
            ) : undefined
          }
        />
        <ul className="divide-y divide-line/70">
          {rowsOf(values).map((r) => {
            const canEnter = draftOpen && r.group != null && inputs != null && enterFault(r.group, inputs) == null;
            const prov = provenanceOf(r);
            return (
              <li key={r.key} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-start sm:justify-between sm:px-6">
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-semibold text-ink-3">{BASELINE_FIELD_WORDS[r.key].en}</span>
                  <span className="block text-[13.5px] break-words text-ink">{r.value ?? <span className="text-ink-4">{r.unset ?? "Not set"}</span>}</span>
                  {r.source && (
                    <span className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
                      <span>{SOURCE_WORDS[r.source].en}</span>
                      {(r.source === "ENTERED" || prov) && <ProvenanceBadge value={prov} />}
                      {r.source === "ENTERED" && r.group && entered[r.group]?.note ? <span className="break-words">{entered[r.group]!.note}</span> : null}
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 flex-wrap items-center gap-2">
                  {canEnter && <BaselineEntryDrawer id={c.id} group={r.group!} label={BASELINE_FIELD_WORDS[r.key].en} mode="draft" />}
                  {correcting && r.group && inputs && (() => {
                    // R-3: the act's own rule; a value something states is not corrected here, and says why.
                    const stated = correctableFaults(r.group, inputs);
                    return stated.length ? <Blocked label="Correct" reason={stated.map(contractFaultText).join(" ")} /> : <BaselineEntryDrawer id={c.id} group={r.group} label={BASELINE_FIELD_WORDS[r.key].en} mode="correct" />;
                  })()}
                </span>
              </li>
            );
          })}
        </ul>
        {inputs && (
          <div className="border-t border-line px-5 py-3 text-[12.5px] break-words text-ink-3 sm:px-6">
            {[
              inputs.appendix ? `Tender Appendix: the approved pack's version ${inputs.appendix.packVersion}` : "No tender Appendix was frozen for this exercise: values it would state are entered at baseline",
              inputs.bq ? `Bill of quantities: version ${inputs.bq.versionNo} as pinned to the pack` : "No bill was pinned to an approved pack",
              inputs.band ? `Terms band: ${inputs.band.label ?? "unnamed"}` : "No terms band was recorded",
              inputs.interimPolicy.floor != null && inputs.interimPolicy.pct != null ? `First interim minimum: the lesser of ${formatMoney(inputs.interimPolicy.floor)} and ${formatPct(inputs.interimPolicy.pct)} of the builder's works value` : "No first-interim rule was set: the minimum is stated or entered",
            ].join(". ")}
            .
          </div>
        )}
      </Card>
      <Card className="overflow-hidden">
        <CardHeader icon={<ClockIcon size={17} />} title="Versions" subtitle="Each written once. Every later calculation reads the version in force on its day and keeps the one it read." divided={versions.length === 0} />
        {versions.length === 0 ? (
          <EmptyState size="sm" title="No version yet">The baseline is confirmed before the first valuation, once the readiness gate is met.</EmptyState>
        ) : (
          <ul className="divide-y divide-line/70">
            {[...versions].reverse().map((v) => (
              <li key={v.id} className="flex flex-col gap-1 px-5 py-3 sm:px-6">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-[13.5px] font-semibold text-ink">{`Version ${v.version}`}</span>
                  <Chip tone={v.reason === "CORRECTION" ? "warn" : "ok"}>{REASON_WORDS[v.reason!].en}</Chip>
                </span>
                <span className="text-[12.5px] break-words text-ink-3">{[`recorded ${formatOrgDateTime(v.recordedAt, timeZone)}`, v.correctionReason ? `reason: ${v.correctionReason}` : null].filter(Boolean).join(" · ")}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
