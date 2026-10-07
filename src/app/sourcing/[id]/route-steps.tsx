import type { ReactNode } from "react";

import { requireStaff } from "@/app/_auth/actor";
import { ActBadge, actLabel } from "@/components/ui/act";
import { Badge } from "@/components/ui/badge";
import { routeActed } from "@/lib/auth/attribution-read";
import { escalationText } from "@/lib/authority/escalation-labels";
import { stepOriginText } from "@/lib/authority/core-routing-labels";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import type { StatusTone } from "@/lib/ui/status-tone";

/// A persisted route as the list reads it: what every route carries, whichever matter it is on (an
/// exercise's, 6.15's supplier registration), so the list is one component, never a copy.
export interface RouteStepsStep {
  id: string;
  sequence: number;
  act: string;
  roleLabel: string;
  actingRoleLabel: string | null;
  chainOrigin: string | null;
  escalation: "NO_AVAILABLE_HOLDER" | "CONFLICT_DECLARED" | null;
  escalationReason: string | null;
  declaredBy?: { name: string } | null;
  nonDelegable: boolean;
  decision: "PENDING" | "DONE" | "REJECTED";
  decidedByName: string | null;
  decidedOn: Date | null;
  delegation?: { fromPerson: { name: string } } | null;
  reason: string;
}
export interface RouteStepsRoute {
  status: string;
  coreChainFlag: boolean | null;
  steps: RouteStepsStep[];
}
type Route = RouteStepsRoute;
type Step = RouteStepsStep;

/**
 * The steps of an exercise's approval route, one list for every route the exercise carries (the
 * name, approval for tendering, a change to the invitation window), so a step reads the same on
 * each: its office and act, where it came from, what became of it, and who may act on it now.
 * What a step is called when decided, and the controls it carries, are the caller's: the route's
 * own words ("Returned for amendment", a committee step's citation) belong to the route.
 */
export async function RouteSteps<S extends Step = Step>({
  inst,
  stepLabel,
  stepTone,
  action,
  decided,
}: {
  inst: Omit<Route, "steps"> & { steps: S[] };
  stepLabel: (decision: "PENDING" | "DONE" | "REJECTED") => string;
  stepTone: (decision: string) => StatusTone;
  /// The controls beside a step (escalate, decide, cite). Given where the step stands in the route.
  action: (s: S, at: { earlierDone: boolean; isLast: boolean }) => ReactNode;
  /// How a decided step reads after its label, where the route words it differently (a cited committee decision).
  decided?: (s: S) => ReactNode;
}) {
  // Who decided each step, signed or recorded from paper, is read from its attribution (Phase 2b): the screen never says it by itself.
  const acted = await routeActed(db, (await requireStaff()).organisationId, [{ id: "", steps: inst.steps }]);
  return (
    <ol className="divide-y divide-line/70 border-t border-line">
      {inst.steps.map((s) => {
        const earlierDone = inst.steps.filter((x) => x.sequence < s.sequence).every((x) => x.decision === "DONE");
        const isLast = inst.steps.every((x) => x.id === s.id || x.decision === "DONE");
        return (
          <li key={s.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
            <div className="flex min-w-0 items-start gap-3">
              <ActBadge act={s.act} />
              <div className="min-w-0">
                <div className="font-semibold break-words text-ink">
                  {s.roleLabel} <span className="font-normal text-ink-3">· {actLabel(s.act)}</span>
                </div>
                {stepOriginText(inst, s) && <div className="text-[12.5px] text-ink-3">{stepOriginText(inst, s)}</div>}
                {s.escalation && (
                  <div className="text-[12.5px] break-words text-amber-800">
                    {escalationText({ roleLabel: s.roleLabel, actingRoleLabel: s.actingRoleLabel, escalation: s.escalation, escalationReason: s.escalationReason, declaredByName: s.declaredBy?.name ?? null }, s.declaredBy ? acted.declared(s.id, s.declaredBy.name) : null)}
                  </div>
                )}
                <div className="text-[12.5px] break-words text-ink-2">
                  {s.decision === "PENDING"
                    ? inst.status === "PENDING"
                      ? `${earlierDone ? "Awaiting a decision." : "Waits for the step before."}${s.nonDelegable ? " Cannot be delegated." : ""}`
                      : "Not decided: the route closed."
                    : (decided?.(s) ?? `${stepLabel(s.decision)} · ${acted.decided(s.id, s.decidedByName)} · ${formatDate(s.decidedOn)}${s.delegation ? ` · under delegation from ${s.delegation.fromPerson.name}` : ""}${s.reason ? ` · “${s.reason}”` : ""}`)}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
              {s.decision !== "PENDING" && <Badge tone={stepTone(s.decision)}>{stepLabel(s.decision)}</Badge>}
              {action(s, { earlierDone, isLast })}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
