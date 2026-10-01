import { MANDATORY_ACTS as MANDATORY } from "@/lib/committee/quorum";
import { actWithCode } from "@/lib/labels";

import { CheckIcon, EyeIcon, FileIcon, ShieldIcon } from "@/components/icons";

import { cx } from "./cx";

/**
 * A DAL authority act (P, R, MR, A, MA…), drawn the same way on every screen: the
 * matrix, the simulator, a committee's authority rows and a sitting's decisions.
 * Its words come only from `ACT_LABEL`, so an act reads the same everywhere.
 */


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

/**
 * An act in words with its DAL code (close-out ruling CO-9, FR-APR-003): "Mandatory
 * recommendation (MR)". The code is the manual's own vocabulary (Appendix B.1), printed
 * on every routing sheet — not a configuration key — so it is shown beside the words,
 * and an MR step never reads like an R one.
 */
export function actLabel(act: string): string {
  return actWithCode(act);
}

/// A neutral role glyph for an act: a document for proposing, an eye for recommending,
/// a shield for the mandatory acts, a tick for approving. No letter codes on screen.
function ActGlyph({ act }: { act: string }) {
  if (isMandatoryAct(act)) return <ShieldIcon size={12} />;
  if (act === "A") return <CheckIcon size={12} />;
  if (act === "P" || act === "JP") return <FileIcon size={12} />;
  return <EyeIcon size={12} />;
}

/// A small tinted badge: the step number when the act sits in an ordered route, otherwise
/// a role glyph. The act's full name is its accessible name and its hover text; callers
/// keep the words visible beside it.
export function ActBadge({ act, step, className }: { act: string; step?: number; className?: string }) {
  return (
    <span
      title={actLabel(act)}
      role="img"
      aria-label={actLabel(act)}
      className={cx(
        "inline-grid h-5 min-w-5 shrink-0 place-items-center rounded-full px-1.5 text-[11px] leading-none font-bold tabular-nums",
        actTint(act),
        isMandatoryAct(act) && "ring-1",
        className,
      )}
    >
      {step !== undefined ? step : <ActGlyph act={act} />}
    </span>
  );
}

/// The badge with the act spelled out beside it, wrapping rather than truncating.
export function ActWithLabel({ act }: { act: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-2">
      <ActBadge act={act} />
      <span className="min-w-0">{actLabel(act)}</span>
    </span>
  );
}
