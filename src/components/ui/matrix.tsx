import type { ReactNode } from "react";

import { cx } from "./cx";
import { Table, THead, Th, Tr, Td } from "./table";

/**
 * A matrix: row heads down the left, one column per subject, a cell where they cross (the SR-14 opening checklist is the first). Built on the shared `Table` pieces, so it sits beside
 * `DataList` and the plain tables without looking different. It is not a list: nothing is searched, sorted or paged, and rows do not stack.
 *
 * The one extension to `Table`, and why. A matrix has to be read across, so it never stacks (`stack={false}`): the row heads form a sticky first column and the subject columns are at
 * least `COLUMN_MIN` wide. With more columns than fit, the card scrolls sideways inside itself (the `Table` wrapper's own overflow) and the page does not. This is desktop only: there is
 * no narrow-screen form of a matrix, by decision (desktop-only product).
 */

export const HEAD_WIDTH = 168;
export const COLUMN_MIN = 176;

/// The narrowest the table may be for this many subject columns. Below it the card scrolls sideways; at or above it the columns share the width. Never fewer than one column's worth.
export function matrixMinWidth(columnCount: number): number {
  return HEAD_WIDTH + COLUMN_MIN * Math.max(columnCount, 1);
}

export interface MatrixColumnSpec {
  key: string;
  head: ReactNode;
}

export interface MatrixRowSpec {
  key: string;
  head: ReactNode;
  /// By column key. A column with no entry is an empty cell.
  cells: Record<string, ReactNode>;
  /// A summary row (a result, a decision): set apart from the rows of answers.
  summary?: boolean;
}

/// The first column stays put while the others scroll under it: opaque, and edged on the right because collapsed borders do not travel with a sticky cell.
const STICKY = "sticky left-0 z-10 border-r border-line shadow-[1px_0_0_0_var(--color-line)]";

export function Matrix({ corner, columns, rows, caption }: { corner: ReactNode; columns: readonly MatrixColumnSpec[]; rows: readonly MatrixRowSpec[]; caption: string }) {
  return (
    <Table stack={false} minWidth={matrixMinWidth(columns.length)}>
      <caption className="sr-only">{caption}</caption>
      <colgroup>
        <col style={{ width: HEAD_WIDTH }} />
        {columns.map((c) => (
          <col key={c.key} />
        ))}
      </colgroup>
      <THead>
        <Th scope="col" className={cx(STICKY, "bg-sunken whitespace-normal!")}>
          {corner}
        </Th>
        {columns.map((c) => (
          <Th key={c.key} scope="col" className="align-top whitespace-normal!">
            {c.head}
          </Th>
        ))}
      </THead>
      <tbody>
        {rows.map((r) => (
          <Tr key={r.key} className={cx("hover:bg-transparent", r.summary && "bg-sunken/50")}>
            <Th scope="row" className={cx(STICKY, "align-top font-semibold whitespace-normal! text-ink!", r.summary ? "bg-sunken" : "bg-surface")}>
              {r.head}
            </Th>
            {columns.map((c) => (
              <Td key={c.key} className="min-w-0 align-top break-words whitespace-normal">
                {r.cells[c.key]}
              </Td>
            ))}
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}
