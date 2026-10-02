/**
 * The checks a sale register row shows, with the tone each deserves, judged now: the status
 * certificate against the closing as it stands (so an extension re-judges every row; U1), the
 * authority, registration and suspension as attested. Pure; the screen renders what it returns.
 */

import { formatDate } from "@/lib/format";

import { isEligibilitySnapshot } from "@/lib/suppliers/eligibility";

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

export function saleChecks(
  s: { authoritySighted: boolean | null; certSighted: CertSighted | null; certValidUntil: string | null; registrationCheck: CheckState; suspensionCheck: CheckState; registerReadOn: string | null; noSupplierNamed: boolean },
  closingDay: string | null,
): SaleCheck[] {
  const out: SaleCheck[] = [{ text: `Authority: ${s.authoritySighted ? "sighted" : "not sighted"}`, warn: !s.authoritySighted }];
  if (s.certSighted) {
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
