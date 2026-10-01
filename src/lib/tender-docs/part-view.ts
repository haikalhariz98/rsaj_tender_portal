/**
 * A part's "pick template" action as the Tender documents tab offers it: allowed with the
 * library's templates and the one the part draws now (so the drawer opens on it, never on
 * a blank choice that reads as "none chosen"), or refused with the reason. Pure: the read
 * model passes the part, the templates and the pack's edit fault it judged.
 */

import { partFaultText } from "./labels";
import type { EditFault } from "./pack";
import type { Finding, PartContent, PartSource } from "./types";

export type PickTemplateView =
  | { allowed: true; options: { value: string; label: string }[]; current: string }
  | { allowed: false; reason: string };

export function pickTemplateView(
  part: { source: PartSource; content: PartContent; templateId: string | null; printedNumber: string; label: string },
  templates: readonly { id: string; nameEn: string; bodyVersion: number }[],
  editFault: Finding<EditFault> | null,
): PickTemplateView {
  if (part.source !== "TEMPLATE") return { allowed: false, reason: "This part does not draw a library template." };
  if (part.content === "BESPOKE") return { allowed: false, reason: partFaultText({ code: "BESPOKE_FROM_LIBRARY", level: "block", data: { part: `${part.printedNumber}. ${part.label}` } }) };
  if (editFault) return { allowed: false, reason: partFaultText(editFault) };
  // The current template preselected, where it is still in the library; otherwise nothing is.
  const current = part.templateId && templates.some((t) => t.id === part.templateId) ? part.templateId : "";
  return { allowed: true, options: templates.map((t) => ({ value: t.id, label: `${t.nameEn} (text version ${t.bodyVersion})` })), current };
}
