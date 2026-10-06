/**
 * What the Invitation tab shows at each stage of the exercise (founder, 2026-10-05). Pure.
 *
 * - `not_yet`: a draft. Nothing is prepared on the window before the exercise is in preparation.
 * - `preparing`: documents in preparation, or awaiting approval for tendering. The window's items
 *   and the briefings and site visits may be prepared (`windowEditFault` allows it); publishing opens
 *   once the documents are approved for tendering.
 * - `no_window`: the exercise assembles no tender or quotation documents (no pack), so it has no window to
 *   prepare or publish, whatever its status; a published or cancelled one is shown by the sections themselves.
 * - `live`: approved for tendering and every later status, cancelled included. The four sections.
 */

import type { ExerciseStatus } from "@/lib/method/types";

export type InvitationStage = "not_yet" | "preparing" | "no_window" | "live";

export function invitationStage(status: ExerciseStatus | string, noPack = false): InvitationStage {
  if (status === "DRAFT") return noPack ? "no_window" : "not_yet";
  if (status === "DOCUMENTS_IN_PREPARATION" || status === "PENDING_APPROVAL_FOR_TENDERING") return noPack ? "no_window" : "preparing";
  return "live";
}
