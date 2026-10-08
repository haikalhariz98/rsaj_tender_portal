/**
 * Who is told that an exercise is "on the boundary" (product owner, 2026-10-08, ruling on log line 1716; NFR-SEC-002). The boundary between two bands is
 * configuration that anyone can read, so "the estimate is exactly on it" STATES the estimate to the sen. It is therefore said only to a reader the estimate itself is not
 * withheld from, on every screen: the chip, the filter and its count on the sourcing list, the award page's line, as the exercise page already does. The band stays shown
 * to everyone (it says only where an estimate falls, and the route needs it); withholding the band too is the stricter reading and is not taken.
 *
 * Pure.
 */

/// Whether "on the boundary" may be shown to this reader for this exercise: it is true of the exercise, and the reader may read its estimate.
export function boundaryShown(onBoundary: boolean, estimateReadable: boolean): boolean {
  return onBoundary && estimateReadable;
}

/// What the count and the filter of the list say about the rows they do not consider: the words, or null where every row's estimate is readable.
export function boundaryCountNote(withheldRows: number): string | null {
  return withheldRows > 0
    ? `${withheldRows} ${withheldRows === 1 ? "exercise whose estimate is" : "exercises whose estimates are"} withheld from you ${withheldRows === 1 ? "is" : "are"} not counted`
    : null;
}

/// The filter's own explanation, always shown: it considers only the exercises whose estimate the reader may read.
export const BOUNDARY_VIEW_ABOUT = "Exercises whose estimate is exactly on the boundary between two bands. Only exercises whose estimate you may read are considered: saying a withheld estimate is on the boundary would state it, so those are not counted here.";
