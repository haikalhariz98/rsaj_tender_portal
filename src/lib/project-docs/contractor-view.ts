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
 *
 * PW-35 (audit L1): every reading here is computed on the contractor's projection of the facts (`contractorFacts`, `visibility.ts`), never on the real facts, so a
 * request answered only by a hidden version still reads "Asked for", waiting on the organisation (PW-46), and the portal's gates read the same projection.
 * Pure.
 */

import { BEING_PREPARED, faultText, stateWords } from "./labels";
import { documentState } from "./state";
import type { DocumentFacts, Finding, VersionFacts } from "./types";
import { contractorFacts, contractorView, waitingForContractor } from "./visibility";

export interface ContractorReading {
  shown: "VERSIONS" | "BEING_PREPARED" | "NOT_LISTED";
  /// The state in the contractor's words; null where the document is not listed.
  stateLabel: string | null;
  /// "Waiting for you" is true (PW-13): an open request to the contractor, or its own document rejected or returned.
  waitsOnYou: boolean;
  /// "Waiting for you", `Waiting on {organisation}`, or null (nobody, or not the contractor's to know).
  waitsOnLabel: string | null;
  /// With the organisation, as the contractor may know it (plan step 6, the overview's count): its own document waiting on the organisation (received, or waiting for
  /// approval), an organisation document it asked for and has not yet had (asked for, or being prepared). Never an organisation document's own working (PW-28).
  waitsOnOrganisation: boolean;
  /// The versions the contractor may see, in number order. Empty unless `shown` is VERSIONS.
  visibleVersions: readonly VersionFacts[];
  /// The latest version the contractor may see.
  latestVisible: VersionFacts | null;
}

export const WAITING_FOR_YOU = "Waiting for you";

/// `PortalDocumentPage.fromLabel` of a document the contractor started itself; any other value is the organisation's name.
export const FROM_YOU = "Yours";

export function contractorReading(doc: DocumentFacts, orgName: string): ContractorReading {
  const view = contractorView(doc);
  if (view.shown === "NOT_LISTED") return { shown: "NOT_LISTED", stateLabel: null, waitsOnYou: false, waitsOnLabel: null, waitsOnOrganisation: false, visibleVersions: [], latestVisible: null };
  if (view.shown === "BEING_PREPARED") return { shown: "BEING_PREPARED", stateLabel: BEING_PREPARED(orgName), waitsOnYou: false, waitsOnLabel: null, waitsOnOrganisation: true, visibleVersions: [], latestVisible: null };

  const known = contractorFacts(doc);
  const ids = new Set(view.versionIds);
  const visibleVersions = [...known.versions].filter((v) => ids.has(v.id)).sort((a, b) => a.number - b.number);
  const latestVisible = visibleVersions[visibleVersions.length - 1] ?? null;
  const raw = documentState(known);

  if (doc.side === "CONTRACTOR") {
    const waitsOnYou = waitingForContractor(known);
    const withOrganisation = !waitsOnYou && raw.waitsOn === "ORGANISATION";
    return { shown: "VERSIONS", stateLabel: stateWords(raw.state, doc.kind), waitsOnYou, waitsOnLabel: waitsOnYou ? WAITING_FOR_YOU : withOrganisation ? `Waiting on ${orgName}` : null, waitsOnOrganisation: withOrganisation, visibleVersions, latestVisible };
  }

  // An organisation document. Its own working (approvers, a rejection, a newer pending version) is not the contractor's to know: the projection has none of it, so its
  // state is Asked for (an open request, or one answered only by a hidden version), Approved, or Shared.
  if (raw.state === "REQUESTED") return { shown: "VERSIONS", stateLabel: stateWords("REQUESTED", null), waitsOnYou: false, waitsOnLabel: `Waiting on ${orgName}`, waitsOnOrganisation: true, visibleVersions, latestVisible };
  const approvedAndShown = raw.state === "APPROVED" && raw.latest !== null && latestVisible?.id === raw.latest.id;
  return { shown: "VERSIONS", stateLabel: approvedAndShown ? stateWords("APPROVED", null) : stateWords("SHARED", null), waitsOnYou: false, waitsOnLabel: null, waitsOnOrganisation: false, visibleVersions, latestVisible };
}

/**
 * The overview's two figures of the contractor's documents (plan step 6, the portal's `overviewTab`), read only through `contractorReading`: with the organisation, and
 * returned to it (its own document rejected or returned, so it sends a new version). An open request to the contractor is neither: it is in "Waiting for you".
 */
export function contractorTally(docs: readonly DocumentFacts[], orgName: string): { withOrganisation: number; returned: number } {
  let withOrganisation = 0;
  let returned = 0;
  for (const d of docs) {
    const r = contractorReading(d, orgName);
    if (r.waitsOnOrganisation) withOrganisation++;
    if (d.side === "CONTRACTOR" && r.waitsOnYou) {
      const s = documentState(contractorFacts(d)).state;
      if (s === "REJECTED" || s === "RETURNED") returned++;
    }
  }
  return { withOrganisation, returned };
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
  // Plan step 6: the kind and the statutory declaration's password reach the portal. These say what the contractor did or must do, and nothing of the organisation's working.
  "DECLARATION_NOT_SIGNED",
  "KIND_NOT_CONTRACTOR",
  "KIND_ALREADY_SET",
  "KIND_WITH_APPROVERS",
  "KIND_TAKES_NO_APPROVERS",
  "PORTAL_SIGNING_NOT_SET",
  "PORTAL_SIGNING_OFF",
  "SIGNER_NOT_AUTHORISED_NOT_SET",
  "SIGNER_NOT_AUTHORISED",
  // ADR 0045 D6: the kind the contract's route offers, and a supply claim's two files: what the contractor sent, never the organisation's working.
  "KIND_NOT_OFFERED",
  "SUPPLY_FILE_MISSING",
  "FILE_PURPOSE_NOT_TAKEN",
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
