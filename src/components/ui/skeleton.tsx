import { Card } from "./card";
import { cx } from "./cx";

/// One grey bar that pulses where content will land.
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx("animate-pulse rounded-md bg-sunken", className)} />;
}

/// List-shaped placeholder rows: a drawer's or a panel's body while it loads.
export function SkeletonRows({ rows = 4, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className="flex flex-col gap-4">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-9 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className={cx("h-3", i % 2 ? "w-2/5" : "w-3/5")} />
            <Skeleton className="h-3 w-1/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

/// A card at a panel's size, so a tab does not jump when its content arrives.
export function PanelSkeleton({ rows = 4, label }: { rows?: number; label?: string }) {
  return (
    <Card>
      <div className="flex items-center gap-3 border-b border-line/70 px-5 py-4">
        <Skeleton className="size-8 rounded-lg" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="px-5 py-5">
        <SkeletonRows rows={rows} label={label} />
      </div>
    </Card>
  );
}

/// The page's frame — header, then a card — shown while any screen loads.
export function PageSkeleton({ label = "Loading" }: { label?: string }) {
  return (
    <div aria-busy="true" aria-label={label} className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-80" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-3 w-[28rem]" />
      </div>
      <Skeleton className="h-11 w-[32rem] rounded-xl" />
      <PanelSkeleton rows={5} />
    </div>
  );
}
