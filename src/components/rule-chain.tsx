import { ArrowRight } from "@/components/icons";
import { cx } from "@/components/ui/cx";
import { ActBadge, isMandatoryAct } from "@/components/ui/act";

/**
 * A route as one line: who proposes, who recommends, who approves, in order.
 *
 * Each step carries its authority act as a small badge, so a mandatory
 * recommendation is distinguishable from an ordinary one at a glance rather than
 * by reading the whole row.
 */
export interface ChainStep {
  role: string;
  act: string;
  /// A quieter line under the role — the act spelled out, a downgrade.
  meta?: string;
  /// Marks the step as one that cannot be handed to anyone else.
  nonDelegable?: boolean;
}

// The act badge and its tints live in the design system, shared with every screen
// that shows an act. Re-exported for callers that imported them from here.
export { ActBadge, actTint, isMandatoryAct } from "@/components/ui/act";

export function RuleChain({ steps }: { steps: ChainStep[] }) {
  if (steps.length === 0) return <span className="text-ink-4">—</span>;

  return (
    <ol className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-1.5">
      {steps.map((step, i) => (
        <li key={`${step.role}-${step.act}-${i}`} className="flex min-w-0 items-center gap-1">
          <span
            className={cx(
              "inline-flex min-w-0 items-center gap-1.5 rounded-full border py-0.5 pr-2.5 pl-0.5 text-[12.5px]",
              isMandatoryAct(step.act)
                ? step.act === "MA"
                  ? "border-rose-200 bg-rose-50/60"
                  : "border-amber-200 bg-amber-50/60"
                : "border-line bg-surface",
            )}
          >
            <ActBadge act={step.act} step={i + 1} />
            <span className="min-w-0">
              <span className="block font-medium text-ink">{step.role}</span>
              {step.meta && <span className="block text-[11.5px] text-ink-3">{step.meta}</span>}
            </span>
            {step.nonDelegable && (
              <span
                title="Cannot be delegated"
                className="shrink-0 rounded-full bg-amber-100 px-1.5 text-[10.5px] font-bold text-amber-800"
              >
                ND
              </span>
            )}
          </span>
          {i < steps.length - 1 && (
            <ArrowRight size={13} className="shrink-0 text-ink-4" aria-hidden="true" />
          )}
        </li>
      ))}
    </ol>
  );
}
