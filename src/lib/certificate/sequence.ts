/**
 * The per-contract ordinal of a kind ("interim certificate 3"), allocated at issue under the contract lock
 * (ADR 0022). Only issued certificates hold one: a draft voided before issue never had one, so voiding leaves
 * no gap. FR-PAY-014 and FR-FIN-005 read it. Pure.
 */

import type { CertificateKind } from "./types";

export function nextSequence(issued: readonly { kind: CertificateKind; sequence: number | null }[], kind: CertificateKind): number {
  const taken = issued.filter((c) => c.kind === kind && c.sequence != null).map((c) => c.sequence!);
  return taken.length ? Math.max(...taken) + 1 : 1;
}
