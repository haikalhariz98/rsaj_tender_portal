/**
 * The contractor's identity-card number (FR-AWD-008). Stored in full; shown in full only
 * in the Return tab's own field, masked everywhere else — lists, history, snapshots and
 * merge fields (6.11 ruling). Masking is not access control: that arrives with sign-in.
 */

/// Always twelve characters: eight dots and the last four digits — fewer digits are
/// padded with dots, and nothing but digits is ever shown, so a mask never reveals a
/// short or malformed number's shape.
export function maskIc(ic: string | null | undefined): string {
  const v = (ic ?? "").trim();
  if (!v) return "";
  const tail = v.replace(/\D/g, "").slice(-4).padStart(4, "•");
  return `••••••••${tail}`;
}

/// A Malaysian identity card number: twelve digits, the hyphens optional (900101-14-5678).
export const IC_FORMAT = /^\d{6}-?\d{2}-?\d{4}$/;
export const icNumberFault = (v: string): "FORMAT" | null => (v.trim() && !IC_FORMAT.test(v.trim()) ? "FORMAT" : null);

export const MASKING_NOTE = "Masked here. Masking is not access control.";
