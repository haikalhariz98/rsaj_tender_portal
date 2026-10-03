/**
 * A certificate's route, in words (6.13 Part A step 3). The engine's decider refusals are written for a
 * requisition; on a certificate's route three of them would mislead (who sent it, its value, when it was sent), so
 * those read in the certificate's words. The rest (the office, the order, the date) are the engine's own.
 */

import type { DeciderFault } from "@/lib/requisition/holders";
import { deciderFaultText } from "@/lib/requisition/labels";

export const CERTIFICATE_DECIDER_TEXT: Readonly<Partial<Record<DeciderFault, string>>> = {
  SELF_APPROVAL: "That person sent this certificate for approval. Nobody decides what they sent.",
  OVER_CEILING: "The value this certificate is routed on is above the ceiling of the delegation that person acts under.",
  BEFORE_SUBMISSION: "A decision cannot be dated before the certificate was sent for approval.",
};

export function certificateDeciderText(f: DeciderFault, name: string | null): string {
  const t = CERTIFICATE_DECIDER_TEXT[f];
  if (!t) return deciderFaultText(f, name);
  return name ? t.replace(/^That person/, name).replace(/that person/g, name) : t;
}
