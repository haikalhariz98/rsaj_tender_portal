import type { JudgedView } from "@/lib/method/repo";
import { closesSoon } from "@/lib/window/closing-soon";
import type { WindowPhase } from "@/lib/window/phase";

/**
 * ST-8: the views whose rows are judged, not read: "Open for purchase" and "Closing soon" from the window phase (stored instants), "On the boundary"
 * from the reader's SULIT grant on the estimate (ruling of 2026-10-08, log line 1716: the view states the estimate, so it lists only the rows whose
 * estimate the reader may read). Of the repo's candidates, in their order, the ids that pass. The page pages these ids, so sort is set before paging
 * and the count is the judged count, never the database's. Pure; the page and the export share it.
 */
export function judgedViewIds(
  view: JudgedView,
  candidates: readonly { id: string }[],
  judged: { windows: ReadonlyMap<string, { phaseCode: WindowPhase; closingDay: string | null }>; today: string | null; granted: ReadonlySet<string> },
): string[] {
  const pass = (id: string): boolean => {
    if (view === "boundary") return judged.granted.has(id);
    const w = judged.windows.get(id);
    if (!w) return false;
    return view === "open" ? w.phaseCode === "OPEN_FOR_PURCHASE" : closesSoon({ today: judged.today, closingDay: w.closingDay, phase: w.phaseCode });
  };
  return candidates.map((c) => c.id).filter(pass);
}
