/**
 * A refused staging upload in the contractor's words (plan step 5, §6). The document store's own words (`documentFaultText`) are the staff's: some point at the Upload rules or at an
 * administrator, one prints an environment setting's name, and the codes the contractor's route never expected fall through to "This was refused." A contractor is told what it
 * can do, or to ask the organisation (named), never where a staff member sets something. The words that say only what is wrong with the file are the store's. Pure.
 */

import { documentFaultText, mediaLabel } from "@/lib/documents/labels";
import type { Finding } from "@/lib/documents/types";

import { contractorFaultText } from "./contractor-view";

/// Settings that are the organisation's or the operator's to make: said as "not set up yet, ask {organisation}".
const NOT_SET_UP: ReadonlySet<string> = new Set([
  "TYPES_NOT_SET",
  "SIZE_NOT_SET",
  "CEILING_NOT_SET",
  "CEILING_INVALID",
  "CLASS_NOT_SET",
  "PROJECT_CLASS_NOT_SET",
  "CLASSES_NOT_CONFIGURED",
  "CLASS_UNKNOWN",
  "NO_ORGANISATION",
  "PERSON_UNKNOWN",
  "DOCUMENT_UNKNOWN",
  "DRIVER_UNKNOWN",
  "DRIVER_NOT_BUILT",
]);

const withArticle = (label: string) => (/^[AEIOU]/.test(label) ? `an ${label}` : `a ${label}`);

/// `allowedTypes` are the media types this contractor's upload may be (the upload rules' less the Office types); `orgName` is the organisation's configured name.
export function uploadFaultWords(f: Finding, ctx: { orgName: string; allowedTypes: readonly string[] }): string {
  if (NOT_SET_UP.has(f.code)) return contractorFaultText({ code: "CLASS_NOT_SET", level: "block" }, ctx.orgName);
  switch (f.code) {
    case "TYPE_NOT_ALLOWED": {
      const taken = ctx.allowedTypes.map((t) => withArticle(mediaLabel(t)));
      return `File is ${withArticle(mediaLabel(String(f.data?.sniffed)))}, which is not accepted here. Send ${taken.length > 1 ? `${taken.slice(0, -1).join(", ")} or ${taken[taken.length - 1]}` : taken[0]}.`;
    }
    case "BODY_TOO_SLOW":
      return "The upload was too slow and was stopped. Nothing was stored. Try again.";
    case "BUSY":
      return "The portal is busy. Nothing was stored. Wait a few seconds and try again.";
    default:
      return documentFaultText(f);
  }
}
