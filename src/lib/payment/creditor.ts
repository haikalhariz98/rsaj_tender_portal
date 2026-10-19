/**
 * Which of a supplier's bank details a payment may be made to (BD-613-44, Phase 4b; FR-VND-005). Pure.
 *
 * A creditor profile is versioned. The supplier enters one and sends it; an officer checks it. It counts for payment ONLY once an officer has checked it, and a change is a new version
 * that takes effect only when it too has been checked: until then the earlier checked version stays in force. A supplier that was never checked, or whose only version was found not in
 * order, has no bank details a payment may go to, and that is said in words, never read as a missing or empty account.
 */

export type CreditorVerification = "NOT_CHECKED" | "VERIFIED" | "NOT_IN_ORDER";

export interface CreditorVersionFact {
  version: number;
  /// Sent by the supplier. A version still being filled in (a draft) is not a version a payment could be made to, nor one awaiting a check.
  sent: boolean;
  verification: CreditorVerification;
}

export type CreditorStanding =
  /// A checked version is in force. `awaiting` is the newer version, if any, that is sent and not yet checked: it changes nothing until it is.
  | { state: "IN_FORCE"; version: number; awaiting: number | null }
  /// No version may be paid to. `reason` says why: nothing was sent, the newest is waiting for a check, or the only ones sent were found not in order.
  | { state: "NONE"; reason: "NOT_ENTERED" | "AWAITING_CHECK" | "NOT_IN_ORDER" };

/// The standing of a supplier's bank details: the highest checked version, and whether a newer one is waiting.
export function creditorStanding(versions: readonly CreditorVersionFact[]): CreditorStanding {
  const sent = versions.filter((v) => v.sent);
  const inForce = sent.filter((v) => v.verification === "VERIFIED").sort((a, b) => b.version - a.version)[0];
  if (inForce) {
    const awaiting = sent.filter((v) => v.version > inForce.version && v.verification === "NOT_CHECKED").sort((a, b) => b.version - a.version)[0];
    return { state: "IN_FORCE", version: inForce.version, awaiting: awaiting?.version ?? null };
  }
  if (sent.length === 0) return { state: "NONE", reason: "NOT_ENTERED" };
  return { state: "NONE", reason: sent.some((v) => v.verification === "NOT_CHECKED") ? "AWAITING_CHECK" : "NOT_IN_ORDER" };
}

/// The state of one version for a list: "In force" (the one a payment goes to), "Awaiting check", "Not in order", "Superseded" (checked, but a later checked version is in force), or "Draft".
export type CreditorVersionState = "IN_FORCE" | "AWAITING_CHECK" | "NOT_IN_ORDER" | "SUPERSEDED" | "DRAFT";

export function creditorVersionState(v: CreditorVersionFact, all: readonly CreditorVersionFact[]): CreditorVersionState {
  if (!v.sent) return "DRAFT";
  if (v.verification === "NOT_CHECKED") return "AWAITING_CHECK";
  if (v.verification === "NOT_IN_ORDER") return "NOT_IN_ORDER";
  const s = creditorStanding(all);
  return s.state === "IN_FORCE" && s.version === v.version ? "IN_FORCE" : "SUPERSEDED";
}

/// What a payment screen says of the supplier's bank details, in words.
export function creditorStandingWords(s: CreditorStanding): { en: string; ms: string; payable: boolean } {
  if (s.state === "IN_FORCE") {
    return s.awaiting != null
      ? { en: `Payments go to version ${s.version}, which an officer has checked. Version ${s.awaiting} is waiting for a check and changes nothing until then.`, ms: `Bayaran dibuat kepada versi ${s.version}, yang telah disemak oleh pegawai. Versi ${s.awaiting} menunggu semakan dan tidak mengubah apa-apa sehingga itu.`, payable: true }
      : { en: `Payments go to version ${s.version}, which an officer has checked.`, ms: `Bayaran dibuat kepada versi ${s.version}, yang telah disemak oleh pegawai.`, payable: true };
  }
  switch (s.reason) {
    case "NOT_ENTERED":
      return { en: "No bank details have been entered, so payments are refused.", ms: "Tiada butiran bank dimasukkan, jadi bayaran ditolak.", payable: false };
    case "AWAITING_CHECK":
      return { en: "Bank details await checking; payments are refused until checked.", ms: "Butiran bank menunggu pegawai menyemaknya, jadi bayaran ditolak sehingga itu.", payable: false };
    case "NOT_IN_ORDER":
      return { en: "Bank details not in order; payments are refused until corrected.", ms: "Butiran bank telah disemak dan didapati tidak teratur, jadi bayaran ditolak sehingga pembekal menghantar yang telah dibetulkan.", payable: false };
  }
}
