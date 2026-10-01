/**
 * A part's "pick template" action as the Tender documents tab offers it: allowed with the
 * library's templates and the one the part draws now (so the drawer opens on it, never on
 * a blank choice that reads as "none chosen"), or refused with the reason. Pure: the read
 * model passes the part, the templates and the pack's edit fault it judged.
 */

import { partFaultText } from "./labels";
import type { EditFault } from "./pack";
import type { Finding, PartContent, PartSource } from "./types";

/**
 * Office options, one per code. An org unit that was renamed or moved is stored once per
 * effective period under the same code; offering each period would list "Northern Region" twice
 * (and give React two options with one key). The period still in force wins, else the latest.
 */
export function distinctOffices(units: readonly { code: string; nameEn: string; effectiveFrom?: Date | null; effectiveTo?: Date | null }[]): { value: string; label: string }[] {
  const best = new Map<string, (typeof units)[number]>();
  for (const u of units) {
    const held = best.get(u.code);
    const better = !held || (u.effectiveTo == null && held.effectiveTo != null) || (u.effectiveTo == null === (held.effectiveTo == null) && (u.effectiveFrom?.getTime() ?? 0) > (held.effectiveFrom?.getTime() ?? 0));
    if (better) best.set(u.code, u);
  }
  return [...best.values()].sort((a, b) => a.nameEn.localeCompare(b.nameEn)).map((u) => ({ value: u.code, label: u.nameEn }));
}

export type PickTemplateView =
  | { allowed: true; options: { value: string; label: string }[]; current: string }
  | { allowed: false; reason: string };

/// A template with no text: nothing can be issued on it, so it is not offered (version 0 is its mark).
export const templateIsEmpty = (t: { bodyVersion: number; bodyEn?: string | null; bodyMs?: string | null }) =>
  t.bodyVersion === 0 || (t.bodyEn !== undefined && !t.bodyEn?.trim() && !t.bodyMs?.trim());

/**
 * `suitedCodes`: the codes of the library templates the configuration names for parts of this
 * part's role (any pack kind or basis). A template configured for a different role (a letter of
 * acceptance on an invitation) is not offered. Null: nothing is known, so nothing is narrowed.
 * The template the part draws now is always listed, so the drawer opens on it.
 */
export function pickTemplateView(
  part: { source: PartSource; content: PartContent; templateId: string | null; printedNumber: string; label: string },
  templates: readonly { id: string; nameEn: string; bodyVersion: number; code?: string; bodyEn?: string | null; bodyMs?: string | null }[],
  editFault: Finding<EditFault> | null,
  suitedCodes: ReadonlySet<string> | null = null,
): PickTemplateView {
  if (part.source !== "TEMPLATE") return { allowed: false, reason: "This part does not draw a library template." };
  if (part.content === "BESPOKE") return { allowed: false, reason: partFaultText({ code: "BESPOKE_FROM_LIBRARY", level: "block", data: { part: `${part.printedNumber}. ${part.label}` } }) };
  if (editFault) return { allowed: false, reason: partFaultText(editFault) };
  const offered = templates.filter((t) => t.id === part.templateId || (!templateIsEmpty(t) && (suitedCodes == null || (t.code != null && suitedCodes.has(t.code)))));
  // The current template preselected, where it is still offered; otherwise nothing is.
  const current = part.templateId && offered.some((t) => t.id === part.templateId) ? part.templateId : "";
  return { allowed: true, options: offered.map((t) => ({ value: t.id, label: `${t.nameEn} (text version ${t.bodyVersion})` })), current };
}
