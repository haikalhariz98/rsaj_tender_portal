/**
 * Parts configured after a draft was started (review M2; ruling 13 and ADR 0035 item 7: no block that can never clear).
 *
 * A draft keeps the parts it was started with (`startPack` snapshots them) and "Refresh from configuration" takes only the two flags, so a part added to
 * Configuration afterwards (for instance the bill of quantities part, needed once the bill is an uploaded file) could never reach it. The exit is one bounded,
 * audited act on the draft: add the parts the configuration now resolves for this exercise that the draft does not hold. It only ever ADDS: it never removes,
 * renumbers or changes a part the draft holds, and a frozen version is never touched. Pure; the action writes what this returns.
 */

import type { Composition } from "./composition";
import type { ResolvedPart } from "./types";

export const TAKE_PARTS_LABEL = "Take newly configured parts";

/// The parts the configuration resolves now that the draft does not hold, in printed order. None where the composition cannot be resolved (the start findings say why).
///
/// A part is not listed if the draft already holds a part of its role (other than OTHER, which may repeat): the composition replaces a general part with a basis-specific one of the same
/// role, so taking both would give the draft two conditions parts, or two bills, which no composition would ever produce. The draft's own part stands; a start of the next version takes the new one.
export function newPartsOf(composition: Composition, held: readonly { partCode: string; role: string }[]): ResolvedPart[] {
  if ("fault" in composition) return [];
  const have = new Set(held.map((p) => p.partCode));
  const roles = new Set(held.map((p) => p.role));
  return composition.parts.filter((p) => !have.has(p.code) && (p.role === "OTHER" || !roles.has(p.role)));
}

/// The list shown, as the key the officer confirms with: the act recomputes it under the pack's lock and writes only if it is still the same.
export const newPartsKey = (parts: readonly Pick<ResolvedPart, "code">[]): string =>
  parts
    .map((p) => p.code)
    .sort()
    .join("|");

/// What the Parts card offers: the parts that would be added, in words; null where there are none.
export function newPartsView(parts: readonly Pick<ResolvedPart, "printedNumber" | "labelEn">[]): { parts: string[] } | null {
  return parts.length ? { parts: parts.map((p) => `${p.printedNumber}. ${p.labelEn}`) } : null;
}

/// Said when the confirmed list is not the list now: configuration changed in between.
export function confirmedPartsFault(confirmed: string | null, now: readonly Pick<ResolvedPart, "code">[]): string | null {
  if (confirmed == null || confirmed !== newPartsKey(now)) return "Configured parts changed. Nothing added. Reload and try again.";
  return null;
}
