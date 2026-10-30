import { sidePanelClass } from "@/components/ui/drawer";
import { PanelSkeleton } from "@/components/ui/skeleton";

import { WORK_PANEL_SIZE } from "./work-shared";

/// The Work tab while its list or board loads: a card at the list's size, so the tab does not jump when the rows arrive.
export function WorkSkeleton() {
  return <PanelSkeleton rows={7} label="Loading work" />;
}

/// The side panel while its item loads: in the panel's place, so the list beside it stays put.
export function WorkItemSkeleton() {
  return (
    <div className="fixed top-16 right-0 bottom-0 z-30 print:hidden">
      <div className={sidePanelClass(WORK_PANEL_SIZE, "overflow-hidden p-5")}>
        <PanelSkeleton rows={6} label="Loading item" />
      </div>
    </div>
  );
}
