/**
 * Whether the Tender Table Document may be shown to a supplier now (FR-DOC-010, Phase 4d). Pure.
 *
 * It is available for inspection from publication to the closing and withdrawn after it (`tableDocumentAvailability`, derived from the window's phase). Only the approved, frozen version is ever shown: a version
 * still being drafted (watermarked) is the office's working copy and is refused. Where it is not shown the reason is said in words, never a blank page. Opening it is logged before it is shown.
 */

import type { TableAvailability } from "@/lib/window/phase";

export type InspectionReading = { open: true } | { open: false; headline: string; detail: string };

export function inspectionReading(availability: TableAvailability, version: { approved: boolean } | null): InspectionReading {
  switch (availability) {
    case "NOT_YET":
      return { open: false, headline: "Not available yet", detail: "The Tender Table Document is open to inspection from the day the exercise is published until the closing." };
    case "WITHDRAWN":
      return { open: false, headline: "No longer available", detail: "The Tender Table Document is withdrawn at the closing, or when the exercise is cancelled." };
    case "UNKNOWN":
      return { open: false, headline: "Not available", detail: "The dates of this exercise are not complete, so it cannot be said whether the Tender Table Document is open to inspection. Tell the procurement office." };
    case "AVAILABLE":
      if (!version) return { open: false, headline: "Not available", detail: "The procurement office has no documents for this exercise to show." };
      if (!version.approved) return { open: false, headline: "Not available", detail: "The documents have not been approved for tendering, so none is shown." };
      return { open: true };
    default: {
      const never: never = availability;
      return never;
    }
  }
}
