import { EmptyState } from "@/components/ui/feedback";
import { Card } from "@/components/ui/card";
import { bqTab, estimateTab, scopeTab } from "@/lib/scope/read";
import type { ScopeSectionId } from "@/lib/scope/sections";

import { BqSection } from "./bq-section";
import { EstimateSection } from "./estimate-section";
import { ScopeSection } from "./scope-section";

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
  if (section === "bq") {
    const d = await bqTab(exerciseId);
    return d ? <BqSection d={d} /> : GONE;
  }
  if (section === "estimate") {
    const d = await estimateTab(exerciseId);
    return d ? <EstimateSection d={d} /> : GONE;
  }
  const d = await scopeTab(exerciseId);
  return d ? <ScopeSection d={d} /> : GONE;
}
