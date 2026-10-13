/**
 * The unseal's parent check (ADR 0036 D7, M2 with ruling 20h; build plan §1.3). Pure.
 *
 * The manifest seals an alternative's parent as it was at submission; the row's current parent may since have moved, only by its parent's replacement (to the
 * replacement) or withdrawal (to none), in that act (trigger 6). So the unseal does not compare the parent for equality: it asks that the current parent be reached
 * from the sealed one by following replacements, or be none after a recorded withdrawal. A jump to any other bid, another supplier's included, is not reachable.
 */

// src/lib/bids/online/parent.ts (D7, M2 with 20h): the unseal's parent check
export function parentReachable(sealedParent: string | null, currentParent: string | null, replacedBy: (id: string) => string | null, withdrawnClearedLink: boolean): boolean {
  if (sealedParent === null) return currentParent === null;
  if (currentParent === null) return withdrawnClearedLink;
  const seen = new Set<string>();
  for (let at: string | null = sealedParent; at !== null && !seen.has(at); at = replacedBy(at)) {
    if (at === currentParent) return true;
    seen.add(at);
  }
  return false;
}
