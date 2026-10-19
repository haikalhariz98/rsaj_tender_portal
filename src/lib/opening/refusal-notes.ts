/**
 * The reasons a matrix control is refused, said once under the matrix rather than inside each narrow cell (the 3c-7 rendered check). Refusals of one opening usually begin with the same
 * sentences and differ only at the end, so the sentences they share are said once and each different ending is said once, headed by the offers it applies to. A control then points at the notes
 * that make up its own reason.
 */

export interface RefusalAsked {
  /// Which offer's control is refused ("No. 2").
  offer: string;
  reason: string;
}

export interface RefusalNote {
  id: string;
  text: string;
  /// The offers this ending is for. Null where it is the shared lead, or the only ending.
  offers: string[] | null;
}

export interface RefusalNotes {
  notes: RefusalNote[];
  /// The ids a control refused for this reason points at, space separated (an `aria-describedby`). Undefined where the reason was not asked.
  idsFor: (reason: string) => string | undefined;
}

const sentencesOf = (r: string): string[] => r.split(/(?<=[.!?])\s+/).filter((s) => s.length > 0);

export function refusalNotes(asked: readonly RefusalAsked[], idPrefix: string): RefusalNotes {
  const reasons = [...new Set(asked.map((a) => a.reason))];
  const split = reasons.map(sentencesOf);
  let shared = 0;
  if (reasons.length > 1) {
    const shortest = Math.min(...split.map((s) => s.length));
    while (shared < shortest && split.every((s) => s[shared] === split[0][shared])) shared++;
  }
  const lead = shared > 0 ? split[0].slice(0, shared).join(" ") : null;
  const notes: RefusalNote[] = [];
  const idOf = new Map<string, string[]>();
  if (lead) notes.push({ id: `${idPrefix}-lead`, text: lead, offers: null });
  // Each different ending, said once, with the offers it is for.
  const tails = new Map<string, string[]>();
  reasons.forEach((r, i) => {
    const tail = split[i].slice(shared).join(" ");
    if (tail) tails.set(tail, [...(tails.get(tail) ?? []), ...asked.filter((a) => a.reason === r).map((a) => a.offer)]);
  });
  let n = 0;
  const tailId = new Map<string, string>();
  for (const [tail, offers] of tails) {
    const id = `${idPrefix}-${n++}`;
    tailId.set(tail, id);
    notes.push({ id, text: tail, offers: tails.size > 1 || lead ? [...new Set(offers)] : null });
  }
  reasons.forEach((r, i) => {
    const tail = split[i].slice(shared).join(" ");
    idOf.set(r, [...(lead ? [`${idPrefix}-lead`] : []), ...(tail ? [tailId.get(tail)!] : [])]);
  });
  return { notes, idsFor: (reason) => idOf.get(reason)?.join(" ") || undefined };
}
