/// The page sizes a list offers.
export const PAGE_SIZES = [10, 25, 50] as const;

/// Whether a list needs its paging footer: only when it is longer than the smallest page.
/// A list that fits on one page at every size has nothing to page.
export function needsPaging(rowCount: number): boolean {
  return rowCount > PAGE_SIZES[0];
}
