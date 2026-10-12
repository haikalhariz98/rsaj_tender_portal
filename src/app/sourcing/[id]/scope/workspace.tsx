import { EmptyState } from "@/components/ui/feedback";
import { Card } from "@/components/ui/card";
import { bqTab, estimateTab, scopeTab } from "@/lib/scope/read";
import type { ScopeSectionId } from "@/lib/scope/sections";

import type { ReactNode } from "react";

import { BqSection } from "./bq-section";
import { EstimateSection } from "./estimate-section";
import { ScopeSection } from "./scope-section";
import { requireStaff } from "@/app/_auth/actor";
import { sulitExerciseGate } from "@/app/_auth/sulit";
import { BQ_FIELDS } from "@/lib/scope/bq-fields";

const GONE = (
  <Card>
    <EmptyState title="This exercise could not be found">Its organisation may no longer be configured.</EmptyState>
  </Card>
);

/**
 * One section at a time: only the section the address names is read (a sibling's data is
 * never loaded), and the company estimate's read model holds neither its figure nor its
 * reasons. The first five sections (Details & compliance, Key dates & person in charge,
 * Opening officers, Notice and fee, Briefing and site visit) arrive built as `prepared`.
 */
export async function ScopeWorkspace({ exerciseId, section, prepared }: { exerciseId: string; section: ScopeSectionId; prepared?: ReactNode }) {
  // Whose records: the signed-in person's organisation (ADR 0034 D10). The page has already asked; the read is cached per request.
  const scope = await requireStaff();
  // The preparation sections (SR-05 to SR-07) are built by the page, which already holds the exercise they are judged on; each reads only its own data.
  if (section === "details" || section === "dates" || section === "officers" || section === "notice" || section === "briefing") return prepared ?? GONE;
  if (section === "bq") {
    // The priced bill is SULIT (6.2 OD-8, Phase 3b): one answer for the exercise, logged, and every rate, amount and total is held to it.
    const d = await bqTab(scope.organisationId, exerciseId, await sulitExerciseGate(scope, exerciseId, "exercise", BQ_FIELDS));
    return d ? <BqSection d={d} /> : GONE;
  }
  if (section === "estimate") {
    const d = await estimateTab(scope.organisationId, exerciseId);
    return d ? <EstimateSection d={d} /> : GONE;
  }
  const d = await scopeTab(scope.organisationId, exerciseId, scope.system ? null : scope.personId);
  return d ? <ScopeSection d={d} /> : GONE;
}
