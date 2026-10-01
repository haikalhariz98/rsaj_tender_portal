/**
 * Where a scrolling tab strip should be so a tab is in view. Only as far as it has to be: a tab
 * already clear of both edges' fades leaves the strip where it is, so a strip opening on one of its
 * first tabs is not scrolled to cut the others in half. Positions are relative to the strip's visible
 * box (left edge 0, right edge `width`). Returns the new scrollLeft, or null to leave it.
 */
export function scrollFor(i: { scrollLeft: number; scrollWidth: number; width: number; itemLeft: number; itemRight: number; fade: number }): number | null {
  const toLeft = i.itemLeft - i.fade;
  const toRight = i.itemRight - i.width + i.fade;
  const max = Math.max(0, i.scrollWidth - i.width);
  if (toLeft < 0) {
    const next = Math.max(0, i.scrollLeft + toLeft);
    return next === i.scrollLeft ? null : next;
  }
  if (toRight > 0) {
    const next = Math.min(max, i.scrollLeft + toRight);
    return next === i.scrollLeft ? null : next;
  }
  return null;
}
