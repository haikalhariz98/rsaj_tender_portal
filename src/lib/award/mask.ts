/**
 * The contractor's identity-card number (FR-AWD-008). Stored in full; shown in full only
 * in the Return tab's own field, masked everywhere else — lists, history, snapshots and
 * merge fields (6.11 ruling). Masking is not access control: that arrives with sign-in.
 */

export function maskIc(ic: string | null | undefined): string {
  const v = (ic ?? "").trim();
  if (!v) return "";
  const digits = v.replace(/\D/g, "");
  const tail = digits.slice(-4) || v.slice(-4);
  return `••••••••${tail}`;
}

export const MASKING_NOTE = "Masked here. Masking is not access control: who may see the number is enforced once sign-in exists.";
