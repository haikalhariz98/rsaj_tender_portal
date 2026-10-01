/**
 * Legal holds (NFR-RET-002). Placed and released by a named Person, each with a
 * reason; while one stands, no disposal may touch the document (`disposalFault`). One
 * standing hold per document: a second reason is recorded by releasing and placing again.
 */

import type { Finding } from "./types";

export type HoldFault = "REASON_REQUIRED" | "PERSON_REQUIRED" | "ALREADY_ON_HOLD";

export function holdFaults(i: { reason: string; personId: string | null; standing: readonly { releasedAt: Date | null }[] }): Finding<HoldFault>[] {
  const out: Finding<HoldFault>[] = [];
  if (!i.reason.trim()) out.push({ code: "REASON_REQUIRED", level: "block" });
  if (!i.personId) out.push({ code: "PERSON_REQUIRED", level: "block" });
  if (i.standing.some((h) => h.releasedAt == null)) out.push({ code: "ALREADY_ON_HOLD", level: "block" });
  return out;
}

export type ReleaseFault = "NOT_ON_HOLD" | "REASON_REQUIRED" | "PERSON_REQUIRED";

export function releaseFaults(i: { hold: { releasedAt: Date | null } | null; reason: string; personId: string | null }): Finding<ReleaseFault>[] {
  if (!i.hold || i.hold.releasedAt != null) return [{ code: "NOT_ON_HOLD", level: "block" }];
  const out: Finding<ReleaseFault>[] = [];
  if (!i.reason.trim()) out.push({ code: "REASON_REQUIRED", level: "block" });
  if (!i.personId) out.push({ code: "PERSON_REQUIRED", level: "block" });
  return out;
}
