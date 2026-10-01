/**
 * The checks a sale register row shows, with the tone each deserves, judged now: the status
 * certificate against the closing as it stands (so an extension re-judges every row; U1), the
 * authority, registration and suspension as attested. Pure; the screen renders what it returns.
 */

import { formatDate } from "@/lib/format";

import { CERT_SIGHTED_LABEL } from "./labels";
import { certExpiresBeforeClosing } from "./sale";
import type { CertSighted, CheckState } from "./types";

export interface SaleCheck {
  text: string;
  /// A warning: the check is not clear, or not made.
  warn: boolean;
}

const STATE_WORDS: Record<CheckState, string> = { NOT_CHECKED: "not checked", CLEAR: "checked, clear", FAILED: "failed" };

export function saleChecks(
  s: { authoritySighted: boolean | null; certSighted: CertSighted | null; certValidUntil: string | null; registrationCheck: CheckState; suspensionCheck: CheckState },
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
  out.push({ text: `Registration: ${STATE_WORDS[s.registrationCheck]}`, warn: s.registrationCheck !== "CLEAR" });
  out.push({ text: `Suspension: ${STATE_WORDS[s.suspensionCheck]}`, warn: s.suspensionCheck !== "CLEAR" });
  return out;
}
