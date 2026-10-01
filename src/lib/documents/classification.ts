/**
 * Changing a document's classification (NFR-SEC-002, OD-2).
 *
 * The document takes its class's classification when it is created. An unset one is
 * set once, with a reason. Raising it is audited with a reason. Lowering it from SULIT
 * is refused until maker-checker arrives with sign-in: one person alone may not release
 * a SULIT document. The refusal names the way out — file a correctly classified copy as
 * a new document and withdraw this one (scope ruling).
 */

import type { Finding, SecurityClass } from "./types";

const RANK: Readonly<Record<SecurityClass, number>> = { PUBLIC: 0, INTERNAL: 1, SULIT: 2 };

export type ReclassifyFault = "UNCHANGED" | "REASON_REQUIRED" | "CANNOT_UNSET" | "DOWNGRADE_FROM_SULIT";

export function reclassifyFault(current: SecurityClass | null, next: SecurityClass | null, reason: string): Finding<ReclassifyFault>[] {
  if (next == null) return [{ code: "CANNOT_UNSET", level: "block" }];
  if (current === next) return [{ code: "UNCHANGED", level: "block" }];
  const out: Finding<ReclassifyFault>[] = [];
  if (current === "SULIT" && RANK[next] < RANK.SULIT) out.push({ code: "DOWNGRADE_FROM_SULIT", level: "block" });
  if (!reason.trim()) out.push({ code: "REASON_REQUIRED", level: "block" });
  return out;
}

/// What kind of change it is, for the audit row and the confirmation text.
export function reclassifyKind(current: SecurityClass | null, next: SecurityClass): "SET" | "RAISED" | "LOWERED" {
  if (current == null) return "SET";
  return RANK[next] > RANK[current] ? "RAISED" : "LOWERED";
}
