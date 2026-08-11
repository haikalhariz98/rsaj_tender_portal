/**
 * Effective dating, in one place.
 *
 * Units, cost centres, role assignments and authority matrices are all periods rather
 * than facts. They must all agree on what "in force" means, so the rule lives here and
 * every module imports it.
 */

export interface Effective {
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

/**
 * In force on a date: begun, and not yet ended.
 *
 * `effectiveTo` is exclusive, matching the authority matrix — a row ending on the
 * first of the month is not in force on the first. Two revisions of the same record
 * can therefore abut without overlapping by a day.
 */
export function inForceOn(entry: Effective, on: Date): boolean {
  if (entry.effectiveFrom > on) return false;
  return entry.effectiveTo == null || entry.effectiveTo > on;
}

/// Whether two periods share any day at all.
export function periodsOverlap(a: Effective, b: Effective): boolean {
  const aEndsBeforeB = a.effectiveTo != null && a.effectiveTo <= b.effectiveFrom;
  const bEndsBeforeA = b.effectiveTo != null && b.effectiveTo <= a.effectiveFrom;
  return !aEndsBeforeB && !bEndsBeforeA;
}

export function activeOn<T extends Effective & { sortOrder: number }>(
  entries: readonly T[],
  on: Date,
): T[] {
  // Sorts on sortOrder alone and relies on Array.prototype.sort being stable, so
  // whatever secondary order the loader supplied survives.
  return entries.filter((e) => inForceOn(e, on)).sort((a, b) => a.sortOrder - b.sortOrder);
}
