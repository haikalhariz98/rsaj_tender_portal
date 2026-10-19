import { AttributionRefused } from "@/lib/auth/attribution-store";
import { CertificateRefusal } from "@/lib/certificate/write";
import { ProjectRefused } from "@/lib/portal/projects/types";
import { projectFaultViews } from "@/lib/portal/projects/words";

/**
 * How My Projects' route handlers answer (Phase 4e). One shape, as My Bids': `ok`, a stable `code` for the page's logic (never printed), and a plain `message`. A finding of the rules is sent
 * as its words, never its code. Another contractor's, another organisation's and a non-existent contract's ids read as not found, with the same words for all of them. A refusal of the
 * certificate core (the block judged again in printed order) and of the attribution (a stale password entry) are passed on in their own words.
 */
export const reply = (body: Record<string, unknown>, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/// A store's refusal as an answer, or null where the error is not one of ours (the handler lets it be thrown).
export function refusalReply(e: unknown): Response | null {
  if (e instanceof ProjectRefused) {
    const faults = projectFaultViews(e.faults);
    const message = faults.find((f) => f.level === "block")?.message ?? "That cannot be done.";
    if (e.status === 404) return reply({ ok: false, code: "NOT_FOUND", message: "That is not something you can open." }, 404);
    return reply({ ok: false, code: e.status === 409 ? "CHANGED" : e.status === 429 ? "THROTTLED" : "VALIDATION", message, faults }, e.status);
  }
  if (e instanceof CertificateRefusal) return reply({ ok: false, code: "VALIDATION", message: e.message }, 422);
  if (e instanceof AttributionRefused) return reply({ ok: false, code: "SIGNATURE_REFUSED", message: e.faults.map((f) => f.en).join(" ") }, 403);
  return null;
}

/// The password asked again, answered: the refusal, or null where it was right.
export function passwordReply(asked: { ok: true; at: Date } | { ok: false; kind: "WRONG" | "LOCKED" | "THROTTLED" | "POLICY_NOT_SET" }): Response | null {
  if (asked.ok) return null;
  if (asked.kind === "LOCKED") return reply({ ok: false, code: "LOCKED", message: "This account is locked after too many wrong passwords. Try again later." }, 403);
  if (asked.kind === "THROTTLED") return reply({ ok: false, code: "THROTTLED", message: "Too many attempts just now. Wait a few minutes and try again." }, 429);
  if (asked.kind === "POLICY_NOT_SET") return reply({ ok: false, code: "CLOSED", message: "Signing is closed: sign-in is not set up. Tell the procurement office." }, 503);
  return reply({ ok: false, code: "WRONG_PASSWORD", message: "That password is not right. Nothing was done." }, 403);
}
