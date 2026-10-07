import { EmptyState } from "@/components/ui/feedback";
import { Card } from "@/components/ui/card";
import { bqTab, estimateTab, scopeTab } from "@/lib/scope/read";
import type { ScopeSectionId } from "@/lib/scope/sections";

import { BqSection } from "./bq-section";
import { EstimateSection } from "./estimate-section";
import { ScopeSection } from "./scope-section";
import { requireStaff } from "@/app/_auth/actor";

const GONE = (
  <Card>
    <EmptyState title="This exercise could not be found">Its organisation may no longer be configured.</EmptyState>
  </Card>
);

/**
 * One section at a time: only the section the address names is read (a sibling's data is
 * never loaded), and the company estimate's read model holds neither its figure nor its
 * reasons.
 */
export async function ScopeWorkspace({ exerciseId, section }: { exerciseId: string; section: ScopeSectionId }) {
  // Whose records: the signed-in person's organisation (ADR 0034 D10). The page has already asked; the read is cached per request.
  const scope = await requireStaff();
  if (section === "bq") {
    const d = await bqTab(scope.organisationId, exerciseId);
    return d ? <BqSection d={d} /> : GONE;
  }
  if (section === "estimate") {
    const d = await estimateTab(scope.organisationId, exerciseId);
    return d ? <EstimateSection d={d} /> : GONE;
  }
  const d = await scopeTab(scope.organisationId, exerciseId);
  return d ? <ScopeSection d={d} /> : GONE;
}
