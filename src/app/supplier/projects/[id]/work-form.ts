import type { PortalAction } from "@/lib/work/types";

/**
 * What the contractor's Work forms post (workspace 3b step 6). Pure, so it is tested without a drawer. The server judges everything again (`work-api.ts`, `fields.ts`); this only
 * keeps a form from sending a field of the other type (the route refuses it) and from sending what is plainly missing.
 */

export type RaiseKind = "RFI" | "SAFETY_INCIDENT";

export interface RaiseInput {
  contractId: string;
  type: RaiseKind;
  title: string;
  description: string;
  location: string;
  /// A question's "Answer needed by".
  dueOn: string;
  /// An incident's severity, and the day and time it happened (the route takes them as one wall clock).
  severity: string;
  happenedDay: string;
  happenedTime: string;
  stagedVersionIds: readonly string[];
}

/// The fields a form cannot go without, each with the words beside it. A question needs its date; an incident its severity and when it happened.
export function raiseMissing(i: Pick<RaiseInput, "type" | "title" | "dueOn" | "severity" | "happenedDay" | "happenedTime">): Record<string, string> {
  const e: Record<string, string> = {};
  if (i.title.trim() === "") e.title = "Give it a title.";
  if (i.type === "RFI" && i.dueOn === "") e.dueOn = "Say when you need the answer.";
  if (i.type === "SAFETY_INCIDENT") {
    if (i.severity === "") e.severity = "Pick how serious it was.";
    if (i.happenedDay === "" || i.happenedTime === "") e.happenedAt = "Say when it happened.";
  }
  return e;
}

export function raiseBody(i: RaiseInput): Record<string, unknown> {
  const incident = i.type === "SAFETY_INCIDENT";
  return {
    contractId: i.contractId,
    type: i.type,
    title: i.title,
    description: i.description,
    location: i.location,
    ...(incident ? { severity: i.severity, happenedAt: `${i.happenedDay}T${i.happenedTime}` } : { dueOn: i.dueOn }),
    ...(i.stagedVersionIds.length > 0 ? { stagedVersionIds: [...i.stagedVersionIds] } : {}),
  };
}

export const replyBody = (contractId: string, item: string, body: string) => ({ contractId, item, body });
export const answerBody = (contractId: string, item: string, answer: string) => ({ contractId, item, answer });
export const attachBody = (contractId: string, item: string, stagedVersionIds: readonly string[]) => ({ contractId, item, stagedVersionIds: [...stagedVersionIds] });
/// A move names the status the screen showed, so a move made on a stale view is refused rather than applied.
export const moveBody = (contractId: string, item: string, action: Extract<PortalAction, "SEND_FOR_CHECKING" | "ACCEPT_ANSWER" | "ASK_AGAIN">, expectedFrom: string, comment = "") => ({ contractId, item, action, expectedFrom, comment });

/// The Work tab address, with or without an open item (the address the "Waiting for you" rows point at).
export const workHref = (contractId: string, item?: string) => `/supplier/projects/${encodeURIComponent(contractId)}?tab=work${item ? `&item=${encodeURIComponent(item)}` : ""}`;
