import { PanelSkeleton } from "@/components/ui/skeleton";

/// The Work tab while its list or board loads: a card at the list's size, so the tab does not jump when the rows arrive.
export function WorkSkeleton() {
  return <PanelSkeleton rows={7} label="Loading work" />;
}

/// The side panel while its item loads: in the panel's place, so the list beside it stays put.
export function WorkItemSkeleton() {
  return (
    <div className="fixed top-16 right-0 bottom-0 z-30 w-184 max-w-[96vw] overflow-hidden border-l border-line bg-surface p-5 shadow-pop print:hidden">
      <PanelSkeleton rows={6} label="Loading item" />
    </div>
  );
}
