/**
 * The damages basis an interim certificate was raised on, frozen with it (6.13 Part B run 1b; ADR 0030 §6; plan B6's
 * both-orders table). Pure.
 *
 * At the raise the certificate freezes, per scope, the live decision (and whether an extension superseded it), the
 * issued extensions of time, the waivers approved and not yet applied, the waivers it applies, the scopes' dates for
 * completion and the rate segments. Its issue reads the same again and refuses LAD_BASIS_MOVED where any moved (an EOT
 * issued, a decision replaced or superseded, a waiver approved, a date or a segment moved), naming each: the
 * certificate is voided and raised again on the new basis.
 */

import { formatDate } from "@/lib/format";
import type { Finding } from "@/lib/method/types";

type Day = string;

export interface LadBasis {
  decisions: readonly { key: string; id: string; supersededBy: string | null }[];
  extensions: readonly string[];
  waiversApproved: readonly string[];
  waiversApplied: readonly string[];
  scopeDates: Readonly<Record<string, Day | null>>;
  segments: Readonly<Record<string, string>>;
}

export function ladBasisMoved(then: LadBasis, now: LadBasis, names: { extension: (id: string) => string; waiver: (id: string) => string; scope: (key: string) => string }): Finding[] {
  const moved: string[] = [];
  for (const e of now.extensions) if (!then.extensions.includes(e)) moved.push(`the extension of time ${names.extension(e)} issued`);
  const keys = [...new Set([...then.decisions.map((d) => d.key), ...now.decisions.map((d) => d.key)])];
  for (const k of keys) {
    const a = then.decisions.find((d) => d.key === k) ?? null;
    const b = now.decisions.find((d) => d.key === k) ?? null;
    if (a?.id !== b?.id) moved.push(`the decision on ${names.scope(k)} was replaced`);
    else if (b?.supersededBy && b.supersededBy !== a?.supersededBy) moved.push(`the decision on ${names.scope(k)} was superseded by ${b.supersededBy}`);
  }
  for (const w of now.waiversApproved) if (!then.waiversApproved.includes(w) && !then.waiversApplied.includes(w)) moved.push(`the waiver ${names.waiver(w)} was approved`);
  for (const k of [...new Set([...Object.keys(then.scopeDates), ...Object.keys(now.scopeDates)])]) {
    if ((then.scopeDates[k] ?? null) !== (now.scopeDates[k] ?? null)) moved.push(`the date for completion of ${names.scope(k)} moved to ${now.scopeDates[k] ? formatDate(now.scopeDates[k]!) : "none"}`);
  }
  for (const k of [...new Set([...Object.keys(then.segments), ...Object.keys(now.segments)])]) {
    if ((then.segments[k] ?? "") !== (now.segments[k] ?? "")) moved.push(`an occupation's confirmed rate changed the rate segments of ${names.scope(k)}`);
  }
  return moved.length ? [{ code: "LAD_BASIS_MOVED", level: "block", data: { moved: moved.join("; ") } }] : [];
}
