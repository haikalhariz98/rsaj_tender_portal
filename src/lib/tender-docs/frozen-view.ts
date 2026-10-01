/**
 * The tender's conditions as a frozen pack shows them (code review C1). Once the documents are
 * with approval or approved, every conditions card is built from what was frozen on the pack
 * (`conditionsSnapshot`) and from nothing live: a later change to a body, the stamp's wording,
 * the permit list or a clause must not make a judged pack read as if it had a fault, nor as if
 * it were clear. A pack frozen before increment 2 has no snapshot: it says so, and shows what
 * the exercise itself recorded, with no finding about it. Pure; words only.
 */

import { RECORDED_ON_BEHALF } from "@/lib/documents/labels";
import { formatDate } from "@/lib/format";

import { ASSURANCE_KIND_LABEL, restrictionQuestion } from "./conditions-labels";
import type { ConditionsSnapshot } from "./conditions";
import type { AssuranceKind } from "./assurance";
import { NOT_SET, yesNoNotSet } from "./labels";

/// A body's name as it starts a line ("the Demo Companies Registry" is "The Demo Companies Registry" in a list).
export const capFirst = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export const BEFORE_CONDITIONS_TEXT = "Frozen before the tender's conditions were recorded with the documents, so nothing was judged or frozen for them. What the exercise recorded is shown as it stands; it was not checked at submission.";

export interface FrozenGroup {
  number: number;
  heading: string;
  items: { body: string; qualifiers: string | null }[];
}

/// The registrations, grouped as alternatives: the first group reads "One of these" / "Required", later ones "And …".
export function groupHeadings<R extends { alternativeGroup: number }, T>(reqs: readonly R[], item: (r: R) => T): { number: number; heading: string; items: T[] }[] {
  const numbers = [...new Set(reqs.map((r) => r.alternativeGroup))].sort((a, b) => a - b);
  return numbers.map((n, i) => {
    const members = reqs.filter((r) => r.alternativeGroup === n);
    return { number: n, heading: i === 0 ? (members.length > 1 ? "One of these" : "Required") : members.length > 1 ? "And one of these" : "And", items: members.map(item) };
  });
}

/// The assurance policy as the pack was judged under it.
export function assuranceRequiredText(required: boolean | null): string {
  return required == null ? NOT_SET : required ? "Required by policy" : "Not required (the organisation's decision)";
}

export function frozenConditionsView(s: ConditionsSnapshot, versionNo: number) {
  return {
    version: versionNo,
    judgedOn: formatDate(s.judgedOn),
    /// Stated only where a frozen document states the validity window: then these are the days it states.
    notice: s.windowStated ? `The notice states ${formatDate(s.windowStated.startOn)} – ${formatDate(s.windowStated.closingDay)}` : null,
    groups: groupHeadings(s.eligibility.requirements, (r) => ({ body: r.body, qualifiers: r.qualifiers?.trim() ? r.qualifiers.trim() : null })) as FrozenGroup[],
    restriction: {
      question: restrictionQuestion(s.restriction.label),
      answer: yesNoNotSet(s.restriction.restricted),
      stampEn: s.restriction.restricted ? (s.restriction.stampEn ?? NOT_SET) : null,
      stampMs: s.restriction.restricted ? (s.restriction.stampMs ?? null) : null,
    },
    permit: { answer: yesNoNotSet(s.permit.regulated), type: s.permit.regulated ? (s.permit.permit ?? NOT_SET) : null },
    tableDocument: s.tableDocument,
    assurance: {
      required: assuranceRequiredText(s.assurance.required),
      rows: (s.assurance.required ? s.assurance.needed : []).map((kind) => {
        const c = s.assurance.confirmations.find((x) => x.kind === kind) ?? null;
        return { label: ASSURANCE_KIND_LABEL[kind as AssuranceKind] ?? "A confirmation", by: c ? `${c.person} · ${RECORDED_ON_BEHALF}` : null, on: c ? formatDate(c.on) : null };
      }),
    },
    clauses: s.clauses.map((c) => ({ title: c.title, version: `Text version ${c.bodyVersion}`, status: c.overriddenBy ? "Left out under an endorsement" : "Carried", override: c.overriddenBy ? `Endorsed by ${c.overriddenBy} · ${RECORDED_ON_BEHALF}: “${c.overrideReason ?? ""}”` : null })),
  };
}

export type FrozenConditionsView = ReturnType<typeof frozenConditionsView>;
