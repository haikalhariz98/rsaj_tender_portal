/**
 * Saving the organisation's upload rules (OD-3). Every allowed type must be one the
 * product can recognise from content; the size is a whole number of bytes above zero.
 * Leaving either unset is allowed — it is how the policy ships — and uploads are then
 * refused naming the setting.
 */

import { isKnownMediaType, type Finding } from "./types";

export type PolicyFault = "TYPE_NOT_RECOGNISABLE" | "SIZE_INVALID";

export function policyFaults(i: { allowedMediaTypes: readonly string[]; maxBytes: string | null }): Finding<PolicyFault>[] {
  const out: Finding<PolicyFault>[] = [];
  for (const t of i.allowedMediaTypes) if (!isKnownMediaType(t)) out.push({ code: "TYPE_NOT_RECOGNISABLE", level: "block", data: { type: t } });
  if (i.maxBytes != null && i.maxBytes.trim() !== "" && !/^[1-9][0-9]{0,15}$/.test(i.maxBytes.trim())) out.push({ code: "SIZE_INVALID", level: "block" });
  return out;
}

/// Megabytes as typed on a form, to bytes (1 MB = 1,048,576 bytes). Null: not a whole or decimal number above zero.
export function megabytesToBytes(mb: string): bigint | null {
  const v = mb.trim();
  const m = /^(\d{1,9})(?:\.(\d{1,3}))?$/.exec(v);
  if (!m) return null;
  const whole = BigInt(m[1]);
  const frac = BigInt((m[2] ?? "").padEnd(3, "0") || "0");
  const bytes = (whole * 1000n + frac) * 1048576n / 1000n;
  return bytes > 0n ? bytes : null;
}

/**
 * Bytes as megabytes for a form to show, 1 MB = 1,048,576 bytes, to the nearest thousandth
 * (half up), trailing zeros dropped. The exact inverse of `megabytesToBytes` for every
 * value it accepts: that floors by less than one byte, and one byte is under a thousandth
 * of a thousandth, so rounding to the nearest brings it back — reopening the upload rules
 * and saving never changes the cap. A positive size below half a thousandth shows as
 * 0.001, never 0, which the form would refuse. Flooring here lowered the cap on each save
 * (0.1 read back as 0.099; 0.001 as 0) — review should-fix 4.
 */
export function bytesToMegabytes(bytes: bigint): string {
  let thousandths = (bytes * 1000n + 524288n) / 1048576n;
  if (thousandths === 0n && bytes > 0n) thousandths = 1n;
  const whole = thousandths / 1000n;
  const frac = (thousandths % 1000n).toString().padStart(3, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}
