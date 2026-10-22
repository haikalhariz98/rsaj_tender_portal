/**
 * What the contractor is told of a Project workspace document's STATE (PW-8, PW-28; plan step 5). One pure place: the portal list, the document page, "Waiting for you"
 * and the supplier's data export all ask here, so a staff-only state is never restated or leaked by a screen.
 *
 * `documentState` is the organisation's reading of the document: on an organisation document it can say "Waiting for approval" or "Rejected", which are the approvers'
 * working and the contractor must never see (PW-8: an organisation version with approvers is shown only once approved). So the contractor's reading is its own:
 * - A CONTRACTOR document: the real state. It is the contractor's own document and its answers (an approver's rejection and remarks) are what it must act on.
 * - An ORGANISATION document, listed because the contractor may see a version of it (shared at once, or approved): "Approved" where the latest version is the approved one,
 *   "Asked for" while the contractor's own request is open, and otherwise "Shared". Never "Waiting for approval", never "Rejected", and it never waits on anybody: a
 *   pending or rejected newer version is the organisation's own working.
 * - An ORGANISATION document the contractor asked for, with no version it may see: "Being prepared by {organisation}".
 * - Anything else is not listed (PW-28): no state, no title, no row.
 *
 * The day shown is the latest VISIBLE version's, never a hidden newer one's. The organisation is named, an officer never. Words are `labels.ts`'s.
 * Pure.
 */

import { BEING_PREPARED, faultText, stateWords } from "./labels";
import { documentState } from "./state";
import type { DocumentFacts, Finding, VersionFacts } from "./types";
import { contractorView, waitingForContractor } from "./visibility";

export interface ContractorReading {
  shown: "VERSIONS" | "BEING_PREPARED" | "NOT_LISTED";
  /// The state in the contractor's words; null where the document is not listed.
  stateLabel: string | null;
  /// "Waiting for you" is true (PW-13): an open request to the contractor, or its own document rejected or returned.
  waitsOnYou: boolean;
  /// "Waiting for you", `Waiting on {organisation}`, or null (nobody, or not the contractor's to know).
  waitsOnLabel: string | null;
  /// The versions the contractor may see, in number order. Empty unless `shown` is VERSIONS.
  visibleVersions: readonly VersionFacts[];
  /// The latest version the contractor may see.
  latestVisible: VersionFacts | null;
}

export const WAITING_FOR_YOU = "Waiting for you";

export function contractorReading(doc: DocumentFacts, orgName: string): ContractorReading {
  const view = contractorView(doc);
  if (view.shown === "NOT_LISTED") return { shown: "NOT_LISTED", stateLabel: null, waitsOnYou: false, waitsOnLabel: null, visibleVersions: [], latestVisible: null };
  if (view.shown === "BEING_PREPARED") return { shown: "BEING_PREPARED", stateLabel: BEING_PREPARED(orgName), waitsOnYou: false, waitsOnLabel: null, visibleVersions: [], latestVisible: null };

  const ids = new Set(view.versionIds);
  const visibleVersions = [...doc.versions].filter((v) => ids.has(v.id)).sort((a, b) => a.number - b.number);
  const latestVisible = visibleVersions[visibleVersions.length - 1] ?? null;
  const raw = documentState(doc);

  if (doc.side === "CONTRACTOR") {
    const waitsOnYou = waitingForContractor(doc);
    return { shown: "VERSIONS", stateLabel: stateWords(raw.state, doc.kind), waitsOnYou, waitsOnLabel: waitsOnYou ? WAITING_FOR_YOU : raw.waitsOn === "ORGANISATION" ? `Waiting on ${orgName}` : null, visibleVersions, latestVisible };
  }

  // An organisation document. Its own working (approvers, a rejection, a newer pending version) is not the contractor's to know.
  if (raw.state === "REQUESTED") return { shown: "VERSIONS", stateLabel: stateWords("REQUESTED", null), waitsOnYou: false, waitsOnLabel: `Waiting on ${orgName}`, visibleVersions, latestVisible };
  const approvedAndShown = raw.state === "APPROVED" && raw.latest !== null && latestVisible?.id === raw.latest.id;
  return { shown: "VERSIONS", stateLabel: approvedAndShown ? stateWords("APPROVED", null) : stateWords("SHARED", null), waitsOnYou: false, waitsOnLabel: null, visibleVersions, latestVisible };
}

// ------------------------------------------------------------------ words of a refusal, for the contractor

const GENERIC = "That cannot be done on this document now.";

/// Codes whose staff words say nothing of the organisation's own working: said as they are.
const SAFE_CODES: ReadonlySet<string> = new Set([
  "TITLE_REQUIRED",
  "TITLE_TOO_LONG",
  "NOTE_TOO_LONG",
  "NO_FILES",
  "TOO_MANY_FILES",
  "OWN_SIDE",
  "NOT_YOUR_SIDE",
  "FINAL",
  "REQUEST_OWN_SIDE",
  "TOO_MANY_FILES_IN_WINDOW",
  "TOO_MANY_BYTES_IN_WINDOW",
  "NOT_STAGED_FOR_PROJECT",
  "NOT_YOURS",
  "ALREADY_ATTACHED",
  "WITHDRAWN",
  "WRONG_CLASS",
  "DUPLICATE",
  "FILE_UNKNOWN",
  "FILE_REFUSED",
  "NOT_FOUND",
]);

/**
 * A fault in the contractor's words. The staff words of some faults name the organisation's own working ("Its latest version is waiting for approval", "An approver has
 * rejected this version") or point at screens only staff have ("Configuration › Documents"), and a refusal must not carry them to a contractor: those say what the contractor
 * can do, or nothing more than that it cannot be done now. The staff words (`faultText`) are used only for the codes that say nothing of the organisation's own working.
 */
export function contractorFaultText(f: Finding, orgName: string): string {
  if (SAFE_CODES.has(f.code)) return faultText(f, orgName);
  switch (f.code) {
    case "CLASS_NOT_SET":
      return `Project files are not set up yet. Ask ${orgName} to set them up.`;
    case "ZONE_NOT_SET":
      return `Dates are not set up yet. Ask ${orgName} to finish setting up.`;
    case "FILE_NOT_FOR_CONTRACTOR": {
      const n = f.data?.file;
      return `File ${n === undefined ? "" : String(n)} cannot be used here. Ask ${orgName}.`.replace("File  ", "A file ");
    }
    default:
      return GENERIC;
  }
}

/// A refusal of a contractor's act: the lead, then each distinct fault's words. `said` (the contract's state, from the act × status table) replaces them.
export function contractorRefusalText(e: { faults: readonly Finding[]; said: string | null }, orgName: string): string {
  if (e.said) return e.said;
  const words = [...new Set(e.faults.filter((f) => f.level === "block").map((f) => contractorFaultText(f, orgName)))];
  return ["Not done:", ...(words.length ? words : [GENERIC])].join(" ");
}
