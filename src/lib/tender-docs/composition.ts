/**
 * Which parts a pack holds, and which standard form it names (FR-DOC-001, 002, 013;
 * FR-MTD-013). Resolved from the customer's configuration by pack kind and contract
 * basis: nothing here knows any customer's part list (Q-8 — those are a go-live seed and
 * a test-only fixture beside the tests).
 *
 * A part configured for a basis replaces a part of the same role configured for any
 * basis. Two parts of one role at the same reach are refused (which would the pack
 * take?), except OTHER, which may repeat. A pack needs its conditions part: the standard
 * form is that part's template (FR-DOC-002), so with none there is no form. No form rule
 * is driven by a date (OQ-09). Pure.
 */

import type { ConfiguredPart, PackKind, ResolvedPart } from "./types";

export type CompositionFault = "NO_PACK" | "BASIS_NOT_SET" | "COMPOSITION_NOT_SET" | "DUPLICATE_ROLE" | "NO_CONDITIONS_PART";

export type Composition = { parts: ResolvedPart[] } | { fault: CompositionFault; role?: string };

/// Printed order: the configured sort order, then the printed number as written ("7a" before "7b").
export const printedOrder = <P extends { sortOrder: number; printedNumber: string }>(parts: readonly P[]): P[] =>
  [...parts].sort((a, b) => a.sortOrder - b.sortOrder || a.printedNumber.localeCompare(b.printedNumber, "en", { numeric: true }));

/**
 * The parts of a pack of `packKind` on basis `basisCode`, as configured on day `on`
 * (a part retired on or before that day is not used).
 */
export function resolveComposition(parts: readonly ConfiguredPart[], packKind: PackKind, basisCode: string | null, on: string): Composition {
  if (packKind === "NONE") return { fault: "NO_PACK" };
  if (!basisCode) return { fault: "BASIS_NOT_SET" };
  const live = parts.filter((p) => p.packKind === packKind && (p.retiredOn == null || p.retiredOn > on) && (p.contractBasisCode == null || p.contractBasisCode === basisCode));
  if (live.length === 0) return { fault: "COMPOSITION_NOT_SET" };
  const specific = live.filter((p) => p.contractBasisCode != null);
  const general = live.filter((p) => p.contractBasisCode == null);
  for (const reach of [specific, general]) {
    const seen = new Set<string>();
    for (const p of reach) {
      if (p.role === "OTHER") continue;
      if (seen.has(p.role)) return { fault: "DUPLICATE_ROLE", role: p.role };
      seen.add(p.role);
    }
  }
  const replaced = new Set(specific.filter((p) => p.role !== "OTHER").map((p) => p.role));
  const chosen = [...specific, ...general.filter((p) => p.role === "OTHER" || !replaced.has(p.role))];
  if (!chosen.some((p) => p.role === "CONDITIONS")) return { fault: "NO_CONDITIONS_PART" };
  return {
    parts: printedOrder(chosen).map((p) => ({
      code: p.code,
      contractBasisCode: p.contractBasisCode,
      printedNumber: p.printedNumber,
      sortOrder: p.sortOrder,
      labelEn: p.labelEn,
      labelMs: p.labelMs,
      role: p.role,
      content: p.content,
      source: p.source,
      mandatory: p.mandatory,
      inTableDocument: p.inTableDocument,
      returnedByBidder: p.returnedByBidder ?? null,
      returnedByBidderProvenance: p.returnedByBidder == null ? null : (p.returnedByBidderProvenance ?? null),
      ownerOrgUnitCode: p.ownerOrgUnitCode,
      templateCode: p.templateCode,
      governingSource: p.governingSource,
      provenance: p.provenance,
    })),
  };
}

/**
 * The standard form the pack names (FR-MTD-013): the template of its conditions part.
 * `templateName` reads a template's name by code. Null where the conditions part names
 * no template, or the template is not configured: the screens say "Not set".
 */
export function formLabel(parts: readonly Pick<ResolvedPart, "role" | "templateCode">[], templateName: (code: string) => string | null): string | null {
  const conditions = parts.find((p) => p.role === "CONDITIONS");
  if (!conditions?.templateCode) return null;
  return templateName(conditions.templateCode);
}
