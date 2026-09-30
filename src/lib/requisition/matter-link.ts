/**
 * Which requisition a committee matter's reference names (6.10 typed-FK ruling,
 * ruling BD-18, ADR 0002).
 *
 * A requisition matter carries a reference — the portal's own or a finance-system
 * number. It links only where exactly one requisition answers to it, and not one that
 * is cancelled or closed. Two matches are refused as ambiguous, never picked between.
 */

export type MatterRefResult =
  | { ok: true; requisitionId: string }
  | { ok: false; fault: "NOT_FOUND" | "AMBIGUOUS" | "CLOSED" };

export function resolveMatterRef(matches: readonly { id: string; status: string }[]): MatterRefResult {
  if (matches.length === 0) return { ok: false, fault: "NOT_FOUND" };
  if (matches.length > 1) return { ok: false, fault: "AMBIGUOUS" };
  if (["CANCELLED", "CLOSED"].includes(matches[0].status)) return { ok: false, fault: "CLOSED" };
  return { ok: true, requisitionId: matches[0].id };
}

export const MATTER_REF_TEXT: Record<Exclude<MatterRefResult, { ok: true }>["fault"], string> = {
  NOT_FOUND: "No requisition has that reference. Give its portal reference or its finance-system number.",
  AMBIGUOUS: "More than one requisition answers to that reference. Give the portal reference, which is unique.",
  CLOSED: "That requisition is cancelled or closed, so nothing can be tabled against it.",
};
