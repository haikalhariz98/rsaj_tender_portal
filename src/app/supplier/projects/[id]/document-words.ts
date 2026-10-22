import type { Tone } from "@/components/ui/badge";
import { stateWords } from "@/lib/project-docs/labels";

/**
 * How the contractor's Documents list and document page colour what the portal's loaders already said in words (`portal-read.ts`). Colour only: no rule and no state is decided
 * here. The loaders give words, not the staff state, so the tone is read from what the contractor is told: it is asked to act (warn), the document is final (ok), the organisation
 * has it in hand (info), or nobody is waiting (neutral). Pure, so it is tested without a page.
 */
export function portalTone(r: { stateLabel: string; shown: "VERSIONS" | "BEING_PREPARED"; waitsOnYou: boolean; waitsOnLabel: string | null }): Tone {
  if (r.waitsOnYou) return "warn";
  if (r.shown === "BEING_PREPARED") return "info";
  if (r.stateLabel === stateWords("APPROVED", null)) return "ok";
  if (r.waitsOnLabel) return "info";
  return "neutral";
}

/// The outcome of a decision on the contractor's own document, as a badge's tone (the words are the loader's).
export const OUTCOME_TONE = { APPROVED: "ok", REJECTED: "err", TAKEN_UP: "ok", RETURNED: "warn" } as const;

/// Said when the page's form key is not set: nothing can be sent, and the files are shown by name only.
export const SENDING_CLOSED = "Sending is closed.";
