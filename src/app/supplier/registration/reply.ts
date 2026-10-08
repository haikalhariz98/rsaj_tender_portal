import { AttributionRefused } from "@/lib/auth/attribution-store";
import { DraftRefused } from "@/lib/portal/registration/draft-store";
import type { StepFault } from "@/lib/portal/registration/types";
import { registrationFaultText } from "@/lib/portal/registration/words";

/**
 * How the registration's route handlers answer (Phase 4b). One shape, so the wizard reads every answer the same way: `ok`, a stable `code` for the page's logic (never printed), and a
 * plain `message` for the supplier. A finding of the rules is sent as its words and the field it belongs to, never as its code. Nothing in an answer names another supplier.
 */

export interface FaultView {
  step: StepFault["step"];
  field: string | null;
  level: StepFault["level"];
  message: string;
  messageMs: string;
}

export const faultViews = (fs: readonly StepFault[]): FaultView[] =>
  fs.map((f) => {
    const t = registrationFaultText(f);
    return { step: f.step, field: f.field ?? null, level: f.level, message: t.en, messageMs: t.ms };
  });

export const reply = (body: Record<string, unknown>, status = 200, headers: Record<string, string> = {}) => Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

/// A store's refusal as an answer, or null where the error is not one of ours (the handler lets it be thrown). A stale or frozen draft is 409 and wrote nothing.
export function refusalReply(e: unknown): Response | null {
  if (e instanceof DraftRefused) {
    switch (e.kind) {
      case "STALE":
        return reply({ ok: false, code: "STALE", message: "This registration was changed since this page was opened, perhaps in another window. Reload the page to see the latest. Nothing was saved." }, 409);
      case "SENT":
        return reply({ ok: false, code: "DECIDED", message: "This registration has already been sent to the procurement office, so it can no longer be changed." }, 409);
      case "NOT_OPEN":
        return reply({ ok: false, code: "NOT_OPEN", message: "This registration is with the procurement office, so it cannot be filled in here." }, 409);
      case "NOT_FOUND":
        return reply({ ok: false, code: "NOT_FOUND", message: "That is not part of your registration." }, 404);
      case "INVALID":
        return reply({ ok: false, code: "VALIDATION", message: e.faults.length ? faultViews(e.faults).filter((f) => f.level === "block")[0]?.message ?? "Check what you entered." : "Check what you entered.", faults: faultViews(e.faults) }, 422);
    }
  }
  if (e instanceof AttributionRefused) return reply({ ok: false, code: "SIGNATURE_REFUSED", message: e.faults.map((f) => f.en).join(" ") }, 403);
  return null;
}
