import Link from "next/link";
import { Badge, Chip } from "@/components/ui/badge";
import { type AwardEvaluation } from "@/lib/award/evaluate";
import { awardFindingTextFor, findingsForReader, FIX_AT, noReasonText, DIFFERS_TEXT, tenderTermText } from "@/lib/award/labels";
import { type BaselineField } from "@/lib/award/appendix-baseline";
import { formatPct } from "@/lib/tender-docs/percent";
import type { Finding } from "@/lib/award/types";
import { formatMoney, parseSen } from "@/lib/money";
import { type Governing } from "@/lib/award/insurance-terms";

export const money = (v: { toString(): string } | null | undefined) => (v == null ? null : formatMoney(parseSen(v.toString())));
export const pct = (v: { toString(): string } | null | undefined) => (v == null ? null : `${v.toString().replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "")}%`);
export const NOT_SET = "Not set";
export const notSet = (what = NOT_SET) => <span className="text-ink-4">{what}</span>;
export const yesNo = (v: boolean | null) => (v == null ? null : v ? "yes" : "no");
export { dayOrNull as day } from "@/lib/dates";

/// `recommendation`: whether the evaluation's recommendation is open to the reader. Where it is not, the findings that compare the award with it become one sentence (FR-EVL-014).
export function FaultList({ faults, figures = true, recommendation = true }: { faults: readonly Finding[]; figures?: boolean; recommendation?: boolean }) {
  const shown = findingsForReader(faults, recommendation);
  return (
    <ul className="flex list-disc flex-col gap-1 pl-5">
      {shown.map((f, i) => (
        <li key={i}>
          {awardFindingTextFor(f, figures, recommendation)}
          {FIX_AT[f.code] && (
            <>
              {" "}
              <Link href={FIX_AT[f.code].href}>{FIX_AT[f.code].label}</Link>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * 64-C4 (6.4 Q-1 B): a term with what the frozen tender states beside it, and, where the
 * award states it otherwise, "differs from the tender Appendix" with the reason recorded
 * (or that none is, and issue waits for one). Without a frozen Appendix: the term alone.
 */
export function AgainstTender({ ev, field, issued, children }: { ev: AwardEvaluation; field: BaselineField; issued: boolean; children: React.ReactNode }) {
  const said = ev.appendix ? tenderTermText(field, ev.appendix.baseline) : null;
  if (!ev.appendix || said == null) return <>{children}</>;
  const diff = ev.appendix.differences.find((d) => d.field === field);
  return (
    <span className="flex flex-col items-start gap-1">
      <span>{children}</span>
      <span className="text-[12.5px] break-words text-ink-3">{`${field === "regulated" ? "The tender answered" : "The tender Appendix states"}: ${said}`}</span>
      {diff && <Chip tone={diff.reason ? "info" : "warn"}>{DIFFERS_TEXT[field]}</Chip>}
      {diff && <span className="text-[12.5px] break-words text-ink-3">{diff.reason ? `Why: ${diff.reason}` : noReasonText(issued)}</span>}
    </span>
  );
}

/// 6.8 (E-9): a figure against the evaluation's recommendation: "differs from the recommendation", with the recommended figure and the reason.
export function FromRecommendation({ differs, reason, recommended, children }: { differs: boolean; reason: string | null; recommended: string | null; children: React.ReactNode }) {
  if (!recommended || !differs) return <>{children}</>;
  return (
    <span className="flex flex-col items-start gap-1">
      <span className="flex flex-wrap items-center gap-2">{children}<Badge tone="warn">Differs from the recommendation</Badge></span>
      <span className="text-[12.5px] text-ink-3">Recommended: {recommended}. {reason ? `Why: ${reason}` : "No reason recorded yet."}</span>
    </span>
  );
}

/// The insurance the tender Appendix states: carried to the contract, not restated by the award.
/// 64-C4-b: the sum insured that governs a kind, with its source; the award's figure below the Appendix's shows both.
export function GoverningSum({ g, reason, issued }: { g: Governing; reason: string | null; issued: boolean }) {
  if (g.state === "NOT_STATED") return notSet("Not stated: not compared");
  if (g.state === "APPENDIX") return <span>{formatMoney(g.sen)} <span className="text-ink-3">· from the tender Appendix</span></span>;
  // BD-613-2 ruling: a figure other than the one the Appendix governs, above or below, is a difference: both figures, and its reason.
  const differs = g.appendix != null && g.sen !== g.appendix;
  return (
    <span className="flex flex-col items-start gap-1">
      <span>{formatMoney(g.sen)} <span className="text-ink-3">· the award&apos;s own figure, which governs</span></span>
      {differs && <Chip tone={reason ? "info" : "warn"}>{`Differs from the tender Appendix's ${formatMoney(g.appendix!)}${g.belowAppendix ? " (below it)" : " (above it)"}`}</Chip>}
      {differs && <span className="text-[12.5px] text-ink-3">{reason ? `Why: ${reason}` : noReasonText(issued)}</span>}
    </span>
  );
}

export function tenderInsurance(b: NonNullable<AwardEvaluation["appendix"]>["baseline"]) {
  const m = (x: bigint | null) => (x == null ? notSet() : formatMoney(x));
  const u = b.insurance.worksUplift;
  return [
    { label: "Works insurance beyond the price (Appendix)", value: u ? (u.kind === "PERCENT" ? `${formatMoney(u.sen)} (${formatPct(u.pct)} of the awarded sum)` : formatMoney(u.sen)) : notSet() },
    { label: "Third-party and workmen's compensation minimums (Appendix)", value: <span>{m(b.insurance.tplMinimum)} · {m(b.insurance.wcMinimum)}</span> },
    { label: "Permitted insurance excess (Appendix)", value: m(b.insurance.insuranceExcess) },
    ...(b.sectional ? [{ label: "Sections", value: "Damages per section: as in the Appendix" }] : []),
  ];
}
