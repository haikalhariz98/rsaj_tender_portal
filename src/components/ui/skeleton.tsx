import type { ReactNode } from "react";

import { COMPONENT_WORDS } from "@/lib/i18n/catalogues/components";

import { Card } from "./card";
import { cx } from "./cx";

/// The default name of a loading region. Server `loading.tsx` files cannot reach the language context; the product is English only.
const LOADING = COMPONENT_WORDS.loading.en;

/// One grey bar that pulses where content will land. Still under `prefers-reduced-motion`.
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx("animate-pulse motion-reduce:animate-none rounded-md bg-sunken", className)} />;
}

/// The one announcement of a loading region: only the outermost skeleton is a status, so a screen reader hears it once. A `nested` piece is drawn inside another
/// skeleton and says nothing of its own.
export function LoadingRegion({ label = LOADING, nested, className, children }: { label?: string; nested?: boolean; className?: string; children: ReactNode }) {
  if (nested) return <div className={className}>{children}</div>;
  return (
    <div role="status" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/// List-shaped placeholder rows: a drawer's or a panel's body while it loads.
export function SkeletonRows({ rows = 4, label = LOADING, nested }: { rows?: number; label?: string; nested?: boolean }) {
  return (
    <LoadingRegion label={label} nested={nested} className="flex flex-col gap-4">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-9 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className={cx("h-3", i % 2 ? "w-2/5" : "w-3/5")} />
            <Skeleton className="h-3 w-1/4" />
          </div>
        </div>
      ))}
    </LoadingRegion>
  );
}

/// A card at a panel's size, so a tab does not jump when its content arrives. The body is padded as CardBody is.
export function PanelSkeleton({ rows = 4, label = LOADING, nested }: { rows?: number; label?: string; nested?: boolean }) {
  return (
    <LoadingRegion label={label} nested={nested}>
      <Card>
        <div className="flex items-center gap-3 border-b border-line/70 px-5 py-4 sm:px-6">
          <Skeleton className="size-8 rounded-lg" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="px-5 py-5 sm:px-6">
          <SkeletonRows rows={rows} nested />
        </div>
      </Card>
    </LoadingRegion>
  );
}

/// The tab strip: a pill track.
function TabsSkeleton() {
  return <Skeleton className="h-11 w-[32rem] max-w-full rounded-full" />;
}

/// The head of a screen at PageHeader's sizes: a 28px title, then facts, actions on the right. `tight`: the margin of a header given `mb-4`.
function HeaderSkeleton({ badge, facts, actions = 1, tight }: { badge?: boolean; facts?: boolean; actions?: number; tight?: boolean }) {
  return (
    <div className={cx(tight ? "mb-4" : "mb-7", "flex flex-wrap items-end justify-between gap-x-6 gap-y-4")}>
      <div className="min-w-[min(100%,40rem)] flex-1">
        <div className="flex items-center gap-3">
          <Skeleton className="h-[35px] w-72 max-w-full" />
          {badge && <Skeleton className="h-6 w-24 rounded-full" />}
        </div>
        {facts && <Skeleton className="mt-3 h-4 w-[26rem] max-w-full" />}
      </div>
      {actions > 0 && (
        <div className="flex gap-2">
          {Array.from({ length: actions }, (_, i) => (
            <Skeleton key={i} className="h-10 w-32 rounded-full" />
          ))}
        </div>
      )}
    </div>
  );
}

/// The page's frame — header, tab strip, then a card — shown while any screen loads.
export function PageSkeleton({ label = LOADING }: { label?: string }) {
  return (
    <LoadingRegion label={label}>
      <HeaderSkeleton facts actions={0} />
      <div className="flex flex-col gap-5">
        <TabsSkeleton />
        <PanelSkeleton rows={5} nested />
      </div>
    </LoadingRegion>
  );
}

/// A list screen: header, status-count chips, then the DataList card (search toolbar and rows).
/// `header`: the header's actions and whether its margin is the tight `mb-4`; `tabs`: a tab strip under it (Suppliers); `toolbar`: the search row (off for a list with `toolbar={false}`);
/// `cardHeader`: the CardHeader a page puts above its list (Inbox, Suppliers).
export function ListPageSkeleton({
  rows = 8,
  columns = 5,
  chips = 4,
  label = LOADING,
  toolbar = true,
  header,
  tabs,
  cardHeader,
}: {
  rows?: number;
  columns?: number;
  chips?: number;
  label?: string;
  toolbar?: boolean;
  header?: { actions?: number; tight?: boolean };
  tabs?: boolean;
  cardHeader?: boolean;
}) {
  return (
    <LoadingRegion label={label}>
      <HeaderSkeleton actions={header?.actions} tight={header?.tight} />
      {tabs && (
        <div className="mb-5">
          <TabsSkeleton />
        </div>
      )}
      {chips > 0 && (
        <div className="mb-6 flex gap-2">
          {Array.from({ length: chips }, (_, i) => (
            <Skeleton key={i} className="h-8 w-28 rounded-full" />
          ))}
        </div>
      )}
      <Card>
        {cardHeader && (
          <div className="flex items-center gap-3 px-5 py-4 sm:px-6">
            <Skeleton className="size-9 rounded-xl" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-28" />
            </div>
          </div>
        )}
        {toolbar && (
          <div className="flex items-center gap-2 px-4 py-3 sm:px-5">
            <Skeleton className="h-9 w-80 max-w-full rounded-full" />
            <Skeleton className="ml-auto size-9 rounded-full" />
            <Skeleton className="size-9 rounded-full" />
          </div>
        )}
        <div className="flex h-9 items-center gap-6 border-y border-line bg-sunken px-4">
          {Array.from({ length: columns }, (_, c) => (
            <Skeleton key={c} className={cx("h-3 bg-ink/10!", c === 0 ? "w-1/4" : "w-20")} />
          ))}
        </div>
        <div className="divide-y divide-line/70">
          {Array.from({ length: rows }, (_, r) => (
            <div key={r} className="flex h-12 items-center gap-6 px-4">
              {Array.from({ length: columns }, (_, c) => (
                <Skeleton key={c} className={cx("h-4", c === 0 ? "w-1/4" : c % 2 ? "w-20" : "w-28")} />
              ))}
            </div>
          ))}
        </div>
      </Card>
    </LoadingRegion>
  );
}

/// A record screen: header with badge, facts and actions, the stepper card where the record has one, the tab strip, a panel.
export function RecordPageSkeleton({ stepper = false, label = LOADING }: { stepper?: boolean; label?: string }) {
  return (
    <LoadingRegion label={label}>
      <HeaderSkeleton badge facts actions={2} />
      {stepper && (
        <Card className="mb-6">
          <div className="flex justify-between gap-4 px-6 py-5">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-2">
                <Skeleton className="size-8 rounded-full" />
                <Skeleton className="h-3 w-20" />
              </div>
            ))}
          </div>
        </Card>
      )}
      <div className="flex flex-col gap-5">
        <TabsSkeleton />
        <PanelSkeleton rows={5} nested />
      </div>
    </LoadingRegion>
  );
}

/// A settings screen: header, then stacked cards of rows.
export function SettingsPageSkeleton({ label = LOADING }: { label?: string }) {
  return (
    <LoadingRegion label={label} className="flex flex-col gap-6">
      <HeaderSkeleton actions={0} />
      <PanelSkeleton rows={3} nested />
      <PanelSkeleton rows={3} nested />
    </LoadingRegion>
  );
}
