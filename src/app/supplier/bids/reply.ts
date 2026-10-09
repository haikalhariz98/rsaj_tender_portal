import { BidRefused } from "@/lib/portal/bids/types";
import { bidFaultViews } from "@/lib/portal/bids/words";

/**
 * How My Bids' route handlers answer (Phase 4d). One shape, as the registration's and the Company workspace's: `ok`, a stable `code` for the page's logic (never printed), and a plain `message`. A finding of the
 * rules is sent as its words, never its code. Another supplier's, another organisation's and a confidential exercise's ids read as not found, with the same words as one that does not exist.
 */
export const reply = (body: Record<string, unknown>, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/// A store's refusal as an answer, or null where the error is not one of ours (the handler lets it be thrown).
export function refusalReply(e: unknown): Response | null {
  if (!(e instanceof BidRefused)) return null;
  const faults = bidFaultViews(e.faults);
  const message = faults.find((f) => f.level === "block")?.message ?? "That cannot be done.";
  if (e.status === 404) return reply({ ok: false, code: "NOT_FOUND", message: "That is not something you can open." }, 404);
  return reply({ ok: false, code: e.status === 409 ? "CHANGED" : "VALIDATION", message, faults }, e.status);
}
