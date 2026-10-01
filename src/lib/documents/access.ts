/**
 * Whether a version's bytes are served (OD-2, OD-4).
 *
 * Nobody signs in yet, so the portal cannot say who is reading. Anything served is
 * served to anyone who can reach the portal — so SULIT and unclassified documents are
 * listed but never served, and a direct request is refused and logged. A version found
 * to carry a threat is never served. Verifying a fingerprint reads the bytes but serves
 * nothing, so it is allowed for every version.
 */

import type { ScanState, SecurityClass } from "./types";

export type DownloadRefusal = "SULIT" | "UNCLASSIFIED" | "THREAT";

export function downloadDecision(i: { classification: SecurityClass | null; scanState: ScanState }): { allow: true } | { allow: false; reason: DownloadRefusal } {
  if (i.scanState === "THREAT") return { allow: false, reason: "THREAT" };
  if (i.classification == null) return { allow: false, reason: "UNCLASSIFIED" };
  if (i.classification === "SULIT") return { allow: false, reason: "SULIT" };
  return { allow: true };
}

/**
 * A filename safe to put in a Content-Disposition header: the stored name with control
 * characters, quotes, backslashes and path separators taken out, and an ASCII fallback
 * beside the UTF-8 form. The name is the uploader's, shown and offered back, never used
 * as a path.
 */
export function dispositionFilename(original: string, fallbackExt: string): string {
  const cleaned = original.replace(/[\u0000-\u001f\u007f"\\/]/g, "").replace(/^\.+/, "").trim().slice(0, 180) || `document.${fallbackExt}`;
  const ascii = cleaned.replace(/[^\x20-\x7e]/g, "_").replace(/[;%]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(cleaned)}`;
}

export const EXTENSION_FOR: Readonly<Record<string, string>> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/tiff": "tif",
};
