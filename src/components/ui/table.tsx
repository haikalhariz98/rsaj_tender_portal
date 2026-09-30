import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";

import { cx } from "./cx";

/**
 * A plain table for short lists that need no search or paging — styled to sit next
 * to `DataList` without looking different from it. Anything a reader has to find
 * things in is a `DataList`.
 */
export function Table({
  children,
  className,
  minWidth = 640,
}: {
  children: ReactNode;
  className?: string;
  /// Below this the table scrolls sideways rather than crushing its columns.
  minWidth?: number;
}) {
  return (
    <div className="overflow-x-auto">
      <table className={cx("w-full table-fixed border-collapse text-[13.5px]", className)} style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead>
      <tr className="border-y border-line bg-sunken">{children}</tr>
    </thead>
  );
}

export function Th({
  className,
  numeric,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <th
      className={cx(
        "px-4 py-2.5 text-[12px] font-semibold whitespace-nowrap text-ink-3 first:pl-5 last:pr-5 sm:first:pl-6 sm:last:pr-6",
        numeric ? "text-right" : "text-left",
        className,
      )}
      {...props}
    />
  );
}

export function Tr({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cx("border-b border-line/70 transition last:border-b-0 hover:bg-brand-50/40", className)}
      {...props}
    />
  );
}

export function Td({
  className,
  numeric,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <td
      className={cx("px-4 py-3 align-middle first:pl-5 last:pr-5 sm:first:pl-6 sm:last:pr-6", numeric && "text-right tabular-nums", className)}
      {...props}
    />
  );
}

/// A title with a quieter line beneath — the shape most first columns take.
export function CellStack({
  title,
  sub,
  mono,
}: {
  title: ReactNode;
  sub?: ReactNode;
  /// The sub line is a reference or pattern, set in the code face.
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="truncate font-semibold text-ink">{title}</div>
      {sub && (
        <div className={cx("truncate text-[12.5px] text-ink-3", mono && "font-mono text-[12px]")}>{sub}</div>
      )}
    </div>
  );
}

/// The controls at the end of a row, right-aligned and evenly spaced. `justify-end-safe`
/// keeps an overflow on the cell's own start edge instead of spilling into the
/// previous cell, and the controls never wrap.
export function RowActions({ children }: { children: ReactNode }) {
  return <div className="flex items-center justify-end-safe gap-1 whitespace-nowrap">{children}</div>;
}

/// The column that holds a row's `RowActions`, sized to its controls in pixels. A
/// percentage of a table-fixed table is narrower than two buttons at some viewport,
/// and the controls then spill into the cell beside them. `icons` counts the 32px
/// icon-only controls (history, edit...), `labelled` the small buttons that carry a
/// word (Retire...). Give the column's neighbours a percentage, or none at all so one
/// of them takes what is left; never give the actions a percentage.
///
///   <colgroup>
///     <col />
///     <col style={{ width: "18%" }} />
///     <ActionsCol icons={2} />
///   </colgroup>
export function ActionsCol({ icons = 2, labelled = 0 }: { icons?: number; labelled?: number }) {
  const controls = icons + labelled;
  // Controls, the gaps between them, and the cell's own padding (16 + 24 at last).
  const width = icons * 32 + labelled * 84 + Math.max(controls - 1, 0) * 4 + 40;
  return <col style={{ width }} />;
}
