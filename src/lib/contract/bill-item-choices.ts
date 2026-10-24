/**
 * The choices a form offers for an item of the bill a contract was tendered on. Only the reference and the description are offered: a bill line's rate is the
 * estimator's (SULIT), not the contractor's tendered rate, so it is never filled into a form from here. Pure; `bill-items.ts` reads the bill.
 */

export const BILL_ITEM_CAP = 1000;

export interface BillSection {
  number: string;
  items: readonly { itemRef: string; description: string }[];
}

/// One choice per distinct reference (the first line to carry it), in the bill's order; a line with no reference cannot be named and is left out.
export function billItemChoices(sections: readonly BillSection[]): { options: { value: string; label: string }[]; truncated: boolean } {
  const seen = new Set<string>();
  const options: { value: string; label: string }[] = [];
  let truncated = false;
  for (const s of sections) {
    for (const i of s.items) {
      const ref = i.itemRef.trim();
      if (!ref || seen.has(ref)) continue;
      if (options.length >= BILL_ITEM_CAP) {
        truncated = true;
        continue;
      }
      seen.add(ref);
      options.push({ value: ref, label: `${ref} — ${i.description}` });
    }
  }
  return { options, truncated };
}

/// A reference named for a bill that is pinned and short enough to have been listed must be one of its items; where the bill is not pinned (or too long to list) any reference is let through, as before.
export function billItemFault(bill: { options: readonly { value: string }[]; truncated: boolean }, ref: string): string | null {
  if (!ref.trim() || bill.truncated || bill.options.length === 0) return null;
  return bill.options.some((o) => o.value === ref.trim()) ? null : "Choose an item from the contract's bill.";
}
