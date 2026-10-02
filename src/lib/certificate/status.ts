/**
 * Where a certificate may go next (ADR 0022). Pure.
 *
 * DRAFT → IN_ROUTING: it has a routing sheet type; its figures freeze (no override from here on).
 * DRAFT → SIGNING: a certificate the raising module sends to no route (no routing sheet type).
 * IN_ROUTING → SIGNING: its approval route (the latest of its chain) is approved and every internal check of
 *   the current iteration is recorded.
 * SIGNING → ISSUED: every printed block is recorded; only the last signature does it.
 * DRAFT, IN_ROUTING, SIGNING → VOID: with a reason, never once issued. An issued certificate is corrected
 *   only by a later certificate (6.13's rules).
 * Nothing leaves ISSUED or VOID.
 */

import type { CertificateStatus } from "./types";

export const CERTIFICATE_TRANSITIONS: Readonly<Record<CertificateStatus, readonly CertificateStatus[]>> = {
  DRAFT: ["IN_ROUTING", "SIGNING", "VOID"],
  IN_ROUTING: ["SIGNING", "VOID"],
  SIGNING: ["ISSUED", "VOID"],
  ISSUED: [],
  VOID: [],
};

export type TransitionFault = "NOT_ALLOWED" | "ISSUED_IS_FINAL" | "VOID_IS_FINAL";

/// Null where the move is allowed, else why not.
export function certificateTransition(from: CertificateStatus, to: CertificateStatus): TransitionFault | null {
  if (CERTIFICATE_TRANSITIONS[from].includes(to)) return null;
  if (from === "ISSUED") return "ISSUED_IS_FINAL";
  if (from === "VOID") return "VOID_IS_FINAL";
  return "NOT_ALLOWED";
}

/// Whether the figures may still change (overrides only in DRAFT).
export const figuresOpen = (s: CertificateStatus): boolean => s === "DRAFT";
/// Whether the certificate is live (neither issued nor void).
export const isOpen = (s: CertificateStatus): boolean => s !== "ISSUED" && s !== "VOID";
