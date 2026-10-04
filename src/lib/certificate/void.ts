/**
 * Whether a certificate may be voided (6.13 Part B Run 1a fix round, BD-613-114's condition). Pure.
 *
 * An issued certificate whose issue wrote where the contract stands (the CPC, the CMGD, the termination, the final
 * certificate: KIND_ISSUE_WRITES) is refused by name first: no act undoes a contract's status, and none will until a run
 * decides how the status is undone (deferred). Every other move is the certificate's own transition rule (ADR 0022).
 */

import { KIND_ISSUE_WRITES } from "@/lib/contract/act-status";

import { certificateTransition } from "./status";
import type { CertificateKind, CertificateStatus, Finding } from "./types";

export function voidFaults(kind: CertificateKind, s: CertificateStatus): Finding[] {
  const wrote = KIND_ISSUE_WRITES[kind];
  if (s === "ISSUED" && wrote) return [{ code: "VOID_WOULD_UNDO_STATUS", level: "block", data: { status: wrote } }];
  const t = certificateTransition(s, "VOID");
  return t ? [{ code: t, level: "block" }] : [];
}
