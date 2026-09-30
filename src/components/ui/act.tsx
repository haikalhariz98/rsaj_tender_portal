import { ACT_LABEL } from "@/lib/labels";

import { cx } from "./cx";

/**
 * A DAL authority act (P, R, MR, A, MA…), drawn the same way on every screen: the
 * matrix, the simulator, a committee's authority rows and a sitting's decisions.
 * Its words come only from `ACT_LABEL`, so an act reads the same everywhere.
 */

const MANDATORY = new Set(["MR", "MJR", "MA"]);

/// Mandatory acts cannot be skipped or delegated, so they must not look like
/// ordinary ones: amber for a mandatory recommendation, rose for mandatory approval.
export function actTint(act: string): string {
  switch (act) {
    case "MA":
      return "bg-rose-100 text-rose-700 ring-rose-200";
    case "MR":
    case "MJR":
      return "bg-amber-100 text-amber-800 ring-amber-200";
    case "A":
      return "bg-emerald-100 text-emerald-800 ring-emerald-200";
    case "P":
    case "JP":
      return "bg-sky-100 text-sky-700 ring-sky-200";
    default:
      return "bg-brand-100 text-brand-800 ring-brand-200";
  }
}

export function isMandatoryAct(act: string): boolean {
  return MANDATORY.has(act);
}

export function actLabel(act: string): string {
  return ACT_LABEL[act] ?? "Unknown act";
}

/// The act's abbreviation in a small tinted badge; its full name on hover.
export function ActBadge({ act, className }: { act: string; className?: string }) {
  return (
    <span
      title={actLabel(act)}
      className={cx(
        "inline-grid h-5 min-w-5 shrink-0 place-items-center rounded-full px-1.5 text-[10.5px] leading-none font-bold tracking-wide",
        actTint(act),
        isMandatoryAct(act) && "ring-1",
        className,
      )}
    >
      {act}
    </span>
  );
}

/// The badge with the act spelled out beside it, wrapping rather than truncating.
export function ActWithLabel({ act }: { act: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-2">
      <ActBadge act={act} />
      <span>{actLabel(act)}</span>
    </span>
  );
}
