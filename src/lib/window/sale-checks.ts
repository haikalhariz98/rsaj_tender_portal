/**
 * The checks a sale register row shows, with the tone each deserves, judged now: the status
 * certificate against the closing as it stands (so an extension re-judges every row; U1), the
 * authority, registration and suspension as attested. Pure; the screen renders what it returns.
 */

import { formatDate } from "@/lib/format";

import { restrictionPurchaseCheck } from "@/lib/portal/bids/purchase";
import { isEligibilitySnapshot } from "@/lib/suppliers/eligibility";
import { isPurchaseReading } from "@/lib/suppliers/restriction-register";

import { CERT_SIGHTED_LABEL } from "./labels";
import { certExpiresBeforeClosing } from "./sale";
import type { CertSighted, CheckState } from "./types";

export interface SaleCheck {
  text: string;
  /// A warning: the check is not clear, or not made.
  warn: boolean;
}


/**
 * 6.15a fix M-4: the registration and suspension words follow what the sale itself holds. With the
 * register's reading frozen on it (`registerReadOn`, the day of DocumentSale.eligibilitySnapshot) they say
 * the register's result and when it was read; without one, a check "not checked" says the sale was made
 * before the register checked it — never whether the party is linked now, which may have changed since —
 * or, recorded under the register with no supplier named (`noSupplierNamed`, residual 2), says so.
 */
/// The day the register's reading frozen on a sale was judged, or null where the sale holds none.
export const registerReadOn = (snapshot: unknown): string | null => (isEligibilitySnapshot(snapshot) ? snapshot.judgedOn : null);

const REGISTER_WORDS: Record<CheckState, string> = { NOT_CHECKED: "not checked on the supplier register", CLEAR: "clear on the supplier register", FAILED: "failed on the supplier register" };
const UNREAD_WORDS: Record<CheckState, string> = { NOT_CHECKED: "not checked: sold before the supplier register checked it", CLEAR: "checked, clear", FAILED: "failed" };
/// Residual 2: recorded under the register with no supplier named at the sale.
const NOT_NAMED_WORDS = "not checked: no supplier is named for the contractor at this sale";

/**
 * S7: an online sale has no officer sighting a letter of authority. What stands in its place is the reading of the signed-in person's standing on the supplier record, kept with the purchase when it was made
 * (`buyerStandingCheck`). This finds it in the purchase's stored checks, in the words the buyer was shown, or null where the sale did not come from a purchase.
 */
export function onlineAuthorityOf(checks: unknown): { text: string; warn: boolean } | null {
  if (!Array.isArray(checks)) return null;
  const c = checks.find((x): x is { key: string; state: string; detail: string } => typeof x === "object" && x != null && (x as { key?: unknown }).key === "AUTHORITY" && typeof (x as { detail?: unknown }).detail === "string");
  return c ? { text: c.detail, warn: c.state !== "PASS" } : null;
}

/**
 * Ruling 17a: an online sale of a restricted tender has no sighted certificate. What stands in its place is the supplier register's reading of the configured evidence document, kept with the purchase when it was
 * made (`restrictionPurchaseCheck`), in the words the buyer was shown: "verified on the supplier register", with the document's reference and validity. Null where the purchase kept none.
 */
export function onlineRestrictionOf(checks: unknown): { text: string; warn: boolean } | null {
  if (!Array.isArray(checks)) return null;
  const c = checks.find((x): x is { key: string; state: string; detail: string } => typeof x === "object" && x != null && (x as { key?: unknown }).key === "RESTRICTION" && typeof (x as { detail?: unknown }).detail === "string");
  return c ? { text: c.detail, warn: c.state !== "PASS" } : null;
}

/**
 * What the sale register shows of the restriction of a sale made from an online purchase (ruling 17a), in the officer's words. The structured reading frozen on the sale (`eligibilitySnapshot.restriction`,
 * written where the purchase was paid) is the source. A sale paid before it was kept falls back to the purchase's own check, which was worded for the buyer, so only whether it passed is taken from it.
 */
export function onlineRestrictionOfSale(snapshot: unknown, checks: unknown): { text: string; warn: boolean } | null {
  const frozen = snapshot && typeof snapshot === "object" ? (snapshot as { restriction?: unknown }).restriction : null;
  if (isPurchaseReading(frozen)) {
    const c = restrictionPurchaseCheck({ outcome: "ALLOW", document: frozen.document, lapses: frozen.lapses }, null, "STAFF");
    return { text: c.detail, warn: c.state !== "PASS" };
  }
  const kept = onlineRestrictionOf(checks);
  return kept ? { text: "Verified on the supplier register when the documents were bought. The document's details were not kept with this sale.", warn: kept.warn } : null;
}

export function saleChecks(
  s: { authoritySighted: boolean | null; /** An online sale of a restricted tender: the register's reading kept with the purchase (`onlineRestrictionOf`), shown in place of the certificate an officer sights. */ onlineRestriction?: { text: string; warn: boolean } | null; /** An online sale: the buyer's standing as read when it bought (`onlineAuthorityOf`), shown in place of the officer's sighting. */ onlineAuthority?: { text: string; warn: boolean } | null; certSighted: CertSighted | null; certValidUntil: string | null; registrationCheck: CheckState; suspensionCheck: CheckState; registerReadOn: string | null; noSupplierNamed: boolean },
  closingDay: string | null,
): SaleCheck[] {
  const out: SaleCheck[] = s.onlineAuthority ? [{ text: `Buyer's standing (read online, no letter of authority sighted): ${s.onlineAuthority.text}`, warn: s.onlineAuthority.warn }] : [{ text: `Authority: ${s.authoritySighted ? "sighted" : "not sighted"}`, warn: !s.authoritySighted }];
  if (s.onlineRestriction) out.push({ text: `Restriction: ${s.onlineRestriction.text}`, warn: s.onlineRestriction.warn });
  else if (s.certSighted) {
    const until = s.certValidUntil ? `, valid until ${formatDate(s.certValidUntil)}` : "";
    const early = certExpiresBeforeClosing(s.certValidUntil, closingDay);
    out.push({
      text: `Status certificate: ${CERT_SIGHTED_LABEL[s.certSighted].toLowerCase()}${until}${early ? `. It expires before the closing (${formatDate(closingDay)})` : ""}`,
      warn: early || s.certSighted === "NOT_SHOWN" || !s.certValidUntil,
    });
  }
  const words = (c: CheckState) => (s.registerReadOn ? `${REGISTER_WORDS[c]}, read ${formatDate(s.registerReadOn)}` : c === "NOT_CHECKED" && s.noSupplierNamed ? NOT_NAMED_WORDS : UNREAD_WORDS[c]);
  out.push({ text: `Registration: ${words(s.registrationCheck)}`, warn: s.registrationCheck !== "CLEAR" });
  out.push({ text: `Suspension: ${words(s.suspensionCheck)}`, warn: s.suspensionCheck !== "CLEAR" });
  return out;
}
