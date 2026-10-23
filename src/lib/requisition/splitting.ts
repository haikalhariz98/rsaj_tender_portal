/**
 * How a stored split check reads. The anti-splitting check itself went with FR-REQ-015
 * (founder, 2026-10-05) and its settings were dropped (simplification plan 5.8); the
 * checks stored before stay, and read the same on the list, the record and History.
 */

import type { SplitState } from "./types";

/**
 * Always from what was stored: a NOT_SET check reads "Not assessed" for ever.
 */
export function splitStateLabel(
  state: SplitState | null,
  justified = false,
): { label: string; tone: "ok" | "warn" | "err" | "neutral" } {
  if (state == null) return { label: "Not assessed", tone: "neutral" };
  if (state === "NOT_SET") return { label: "Not assessed · control not set", tone: "warn" };
  if (state === "CLEAR") return { label: "No split found", tone: "ok" };
  if (justified) return { label: "Possible split · justified", tone: "warn" };
  return { label: "Possible split", tone: "err" };
}
