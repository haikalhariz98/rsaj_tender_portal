/**
 * What the Invitation tab shows at each stage of the exercise (founder, 2026-10-05). Pure.
 *
 * - `not_yet`: a draft. Nothing is prepared on the window before the exercise is in preparation.
 * - `preparing`: documents in preparation, or awaiting approval for tendering. The window's items
 *   and the briefings and site visits may be prepared (`windowEditFault` allows it); publishing opens
 *   once the documents are approved for tendering.
 * - `live`: approved for tendering and every later status, cancelled included. The four sections.
 */

import type { ExerciseStatus } from "@/lib/method/types";

export type InvitationStage = "not_yet" | "preparing" | "live";

export function invitationStage(status: ExerciseStatus | string): InvitationStage {
  if (status === "DRAFT") return "not_yet";
  if (status === "DOCUMENTS_IN_PREPARATION" || status === "PENDING_APPROVAL_FOR_TENDERING") return "preparing";
  return "live";
}
