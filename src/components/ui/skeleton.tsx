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

/// The head of a screen at PageHeader's sizes: a 28px title, then facts, actions on the right.
function HeaderSkeleton({ badge, facts, actions = 1 }: { badge?: boolean; facts?: boolean; actions?: number }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-[min(100%,40rem)] flex-1">
        <div className="flex items-center gap-3">
          <Skeleton className="h-[35px] w-72" />
          {badge && <Skeleton className="h-6 w-24 rounded-full" />}
        </div>
        {facts && <Skeleton className="mt-3 h-4 w-[26rem] max-w-full" />}
      </div>
      {actions > 0 && (
        <div className="flex gap-2">
          {Array.from({ length: actions }, (_, i) => (
            <Skeleton key={i} className="h-10 w-32 rounded-xl" />
          ))}
        </div>
      )}
    </div>
  );
}

/// A list screen: header, status-count chips, then the DataList card (search toolbar and rows).
export function ListPageSkeleton({ rows = 8, columns = 5, chips = 4, label = "Loading" }: { rows?: number; columns?: number; chips?: number; label?: string }) {
  return (
    <div role="status" aria-busy="true" aria-label={label}>
      <HeaderSkeleton />
      {chips > 0 && (
        <div className="mb-5 flex gap-2">
          {Array.from({ length: chips }, (_, i) => (
            <Skeleton key={i} className="h-9 w-28 rounded-full" />
          ))}
        </div>
      )}
      <Card>
        <div className="flex items-center gap-2 px-5 py-3">
          <Skeleton className="h-9 w-80 max-w-full rounded-xl" />
          <Skeleton className="ml-auto size-9 rounded-xl" />
          <Skeleton className="size-9 rounded-xl" />
        </div>
        <div className="flex gap-6 border-y border-line px-5 py-3">
          {Array.from({ length: columns }, (_, c) => (
            <Skeleton key={c} className={cx("h-3", c === 0 ? "w-1/4" : "w-20")} />
          ))}
        </div>
        <div className="divide-y divide-line/70">
          {Array.from({ length: rows }, (_, r) => (
            <div key={r} className="flex items-center gap-6 px-5 py-3.5">
              {Array.from({ length: columns }, (_, c) => (
                <Skeleton key={c} className={cx("h-4", c === 0 ? "w-1/4" : c % 2 ? "w-20" : "w-28")} />
              ))}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/// A record screen: header with badge, facts and actions, the stepper card where the record has one, the tab strip, a panel.
export function RecordPageSkeleton({ stepper = false, label = "Loading" }: { stepper?: boolean; label?: string }) {
  return (
    <div role="status" aria-busy="true" aria-label={label}>
      <HeaderSkeleton badge facts actions={2} />
      <div className="flex flex-col gap-5">
        {stepper && (
          <Card>
            <div className="flex justify-between gap-4 px-6 py-5">
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="flex flex-1 flex-col items-center gap-2">
                  <Skeleton className="size-7 rounded-full" />
                  <Skeleton className="h-3 w-20" />
                </div>
              ))}
            </div>
          </Card>
        )}
        <Skeleton className="h-11 w-[32rem] max-w-full rounded-full" />
        <PanelSkeleton rows={5} />
      </div>
    </div>
  );
}

/// A settings screen: header, then stacked cards of rows.
export function SettingsPageSkeleton({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className="flex flex-col gap-6">
      <HeaderSkeleton actions={0} />
      <PanelSkeleton rows={3} />
      <PanelSkeleton rows={3} />
    </div>
  );
}
