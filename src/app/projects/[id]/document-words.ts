import type { Tone } from "@/components/ui/badge";
import type { Gate } from "@/lib/project-docs/page-store";
import type { DocumentState } from "@/lib/project-docs/state";

/**
 * How the Project workspace's two screens (the Documents list and a document's page) say what the domain layer already decided. No arithmetic and no rule: the tone a state's
 * badge takes, and the one line that says why the blocked acts are blocked. Pure, so it is tested without a page.
 */

/// The badge's tone for a state. The words are `stateWords`'s; this is colour only.
export const STATE_TONE: Readonly<Record<DocumentState, Tone>> = {
  REQUESTED: "warn",
  WAITING_FOR_APPROVAL: "info",
  APPROVED: "ok",
  REJECTED: "err",
  SHARED: "neutral",
  RECEIVED: "info",
  TAKEN_UP: "ok",
  RETURNED: "warn",
};

/**
 * Why the blocked acts are blocked, once. Acts that share a reason are named together; when every act shares one (the contract is closed, the reader holds no authority) the
 * reason stands alone. Null when nothing is blocked. The reasons are the gates' own words (`faultText`), never restated here.
 */
export function gateNote(gates: readonly { label: string; gate: Gate }[]): string | null {
  const blocked = gates.filter((g) => !g.gate.allowed);
  if (blocked.length === 0) return null;
  const groups = new Map<string, string[]>();
  for (const g of blocked) {
    const words = g.gate.reasons.join(" ");
    groups.set(words, [...(groups.get(words) ?? []), g.label]);
  }
  if (groups.size === 1 && blocked.length === gates.length) return [...groups.keys()][0]!;
  return [...groups].map(([words, labels]) => `${labels.join(", ")}: ${words}`).join(" ");
}
