import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";

import { cx } from "./cx";

/**
 * A plain table for short lists that need no search or paging — styled to sit next
 * to `DataList` without looking different from it. Anything a reader has to find
 * things in is a `DataList`.
 */
/// Below its stacking breakpoint a table's rows become blocks of labelled cells. A table
/// that needs more than a laptop's content column (`WIDE`) stacks below `xl`, so nothing
/// scrolls sideways at 1024 either; the rest stack below `md`. The classes are spelled out
/// whole so Tailwind sees them.
const WIDE = 680;
const STACK_MD =
  "max-md:block max-md:!min-w-0 max-md:[&_.truncate]:overflow-visible max-md:[&_.truncate]:text-clip max-md:[&_.truncate]:whitespace-normal max-md:[&_.truncate]:break-words max-md:[&_colgroup]:hidden max-md:[&_tbody]:block max-md:[&_td]:block max-md:[&_td]:py-1.5 max-md:[&_thead]:hidden max-md:[&_tr]:block max-md:[&_tr]:px-0 max-md:[&_tr]:py-2.5";
const STACK_XL =
  "max-xl:block max-xl:!min-w-0 max-xl:[&_.truncate]:overflow-visible max-xl:[&_.truncate]:text-clip max-xl:[&_.truncate]:whitespace-normal max-xl:[&_.truncate]:break-words max-xl:[&_colgroup]:hidden max-xl:[&_tbody]:block max-xl:[&_td]:block max-xl:[&_td]:py-1.5 max-xl:[&_thead]:hidden max-xl:[&_tr]:block max-xl:[&_tr]:px-0 max-xl:[&_tr]:py-2.5";

export function Table({
  children,
  className,
  minWidth = 640,
  stack = true,
}: {
  children: ReactNode;
  className?: string;
  /// Below this the table stacks (see `stack`) rather than crushing its columns.
  minWidth?: number;
  /// Each row becomes a block of its cells, every cell headed by its `Td` `label`, instead
  /// of a table that scrolls sideways. On by default: give every data `Td` a label. Turn it
  /// off only for a table whose rows mean nothing apart from their columns.
  stack?: boolean;
}) {
  const wide = minWidth > WIDE;
  return (
    <div className="overflow-x-auto">
      <table
        data-stack={stack ? (wide ? "xl" : "md") : undefined}
        className={cx(
          "group/t w-full table-fixed border-collapse text-[13.5px]",
          stack && (wide ? STACK_XL : STACK_MD),
          className,
        )}
        style={{ minWidth }}
      >
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
  label,
  children,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement> & {
  numeric?: boolean;
  /// What this cell is, shown above it where its table stacks (`<Table stack>`).
  label?: string;
}) {
  return (
    <td
      className={cx(
        "px-4 py-3 align-middle first:pl-5 last:pr-5 sm:first:pl-6 sm:last:pr-6",
        numeric && "text-right tabular-nums group-data-[stack=md]/t:max-md:text-left group-data-[stack=xl]/t:max-xl:text-left",
        className,
      )}
      {...props}
    >
      {label && <span className="mb-0.5 hidden text-[11.5px] font-semibold text-ink-3 group-data-[stack=md]/t:max-md:block group-data-[stack=xl]/t:max-xl:block">{label}</span>}
      {children}
    </td>
  );
}

/// A title with a quieter line beneath — the shape most first columns take. Both lines
/// wrap rather than cut: a name is what a row is read by.
export function CellStack({
  title,
  sub,
  mono,
  aside,
}: {
  title: ReactNode;
  /// A badge that belongs to the title ("bilingual", "off"). It keeps its own room beside
  /// the title, which is what gets cut, instead of trailing out of a truncated line.
  aside?: ReactNode;
  sub?: ReactNode;
  /// The sub line is a reference or pattern, set in the code face.
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      {aside ? (
        <div className="flex min-w-0 items-center gap-2">
          <div className={cx("break-words", "min-w-0 font-semibold text-ink")}>{title}</div>
          <span className="shrink-0">{aside}</span>
        </div>
      ) : (
        <div className={cx("break-words", "font-semibold text-ink")}>{title}</div>
      )}
      {sub && (
        <div className={cx("break-words", "text-[12.5px] text-ink-3", mono && "font-mono text-[12px]")}>{sub}</div>
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
///   `long`: buttons with a sentence for a label ("Attach to a record…"), about twice a short one.
export function ActionsCol({ icons = 2, labelled = 0, long = 0 }: { icons?: number; labelled?: number; long?: number }) {
  const controls = icons + labelled + long;
  // Controls, the gaps between them, and the cell's own padding (16 + 24 at last).
  const width = icons * 32 + labelled * 84 + long * 200 + Math.max(controls - 1, 0) * 4 + 40;
  return <col style={{ width }} />;
}
