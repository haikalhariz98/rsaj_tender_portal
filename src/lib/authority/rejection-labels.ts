/**
 * How a rejection destination reads (FR-APR-016). Kinds and sources are codes; they
 * reach a screen only through here. An officer's choice always says it was a choice,
 * recorded on someone's behalf, never as the organisation's policy (ruling CO-5).
 */

import type { ChoiceFault, DestinationFault, RejectionKind, RejectionSource } from "./rejection";

export const REJECTION_KIND_LABEL: Record<RejectionKind, string> = {
  RETURN_TO_ORIGINATOR: "Return to whoever raised it",
  RETURN_TO_STEP: "Return to an earlier step",
  TERMINATE: "End the matter",
};

/// The destination with the office named where it returns to a step.
export function destinationText(kind: RejectionKind, office: string | null): string {
  if (kind === "RETURN_TO_STEP") return `Returns to the ${office ?? "office no longer configured"}'s step`;
  return kind === "RETURN_TO_ORIGINATOR" ? "Returns to whoever raised it" : "The matter ends";
}

export const PROVENANCE_WORD: Record<string, string> = { STATED: "stated", OBSERVED: "observed", ASSUMED: "assumed" };

/**
 * What the approver of a pending step is told happens if they reject (ruling CO-4,
 * FR-APR-019 spirit): from the route's snapshot, never today's configuration.
 */
export function ifRejectedText(
  route: { snapshotAt: Date | null; kind: RejectionKind | null; returnToOffice: string | null; provenance: string | null },
  committeeStep: boolean,
  /// Said of one step: whether the office a return names has a step before it. A return
  /// to a step that is not earlier cannot be applied, so the officer chooses
  /// (`rejectionOutcome`, STEP_NOT_ON_ROUTE). Omitted: said of the route as a whole.
  targetBefore?: boolean,
): string {
  if (committeeStep) return "If not carried: the committee's own not-carried outcome decides — a loop returns it to whoever raised it, a terminal outcome ends it.";
  if (!route.snapshotAt) return "If rejected: where it goes was not recorded when this route opened — the officer will choose.";
  if (!route.kind) return "If rejected: not set — the officer will choose, and the choice is recorded as theirs.";
  if (route.kind === "RETURN_TO_STEP" && targetBefore === false)
    return `If rejected at this step: the configured return is to the ${route.returnToOffice ?? "office no longer configured"}, but no step of that office comes before this one — the officer will choose where it goes.`;
  const how = route.provenance ? ` (configured; source: ${PROVENANCE_WORD[route.provenance] ?? "not recorded"})` : " (configured)";
  return `If rejected: ${destinationText(route.kind, route.returnToOffice).replace(/^R/, "r").replace(/^T/, "t")}${how}.`;
}

export const SOURCE_TEXT: Record<RejectionSource, string> = {
  CONFIGURED: "as configured for this matter type",
  COMMITTEE_OUTCOME: "as the committee's not-carried outcome says",
  OFFICER_CHOICE: "the officer's choice, recorded on behalf of a named person, not signed — not policy",
};

/// What was applied when the route rejected.
export function appliedText(kind: RejectionKind, source: RejectionSource, office: string | null, chosenBy: string | null): string {
  const what = destinationText(kind, office);
  if (source === "OFFICER_CHOICE") return `${what}: chosen by ${chosenBy ?? "a person no longer on record"}, recorded on their behalf, not signed. A choice, not policy.`;
  return `${what}, ${SOURCE_TEXT[source]}.`;
}

export const CHOICE_WHY_TEXT: Record<"NOT_SET" | "STEP_NOT_ON_ROUTE" | "NOT_SUPPORTED", string> = {
  NOT_SET: "No rejection destination was set for this matter type when the route opened, so the officer chooses where it goes.",
  STEP_NOT_ON_ROUTE: "The configured destination returns to a step that is not on this route before the rejecting step, so the officer chooses where it goes.",
  NOT_SUPPORTED: "The configured destination is not one this matter can take, so the officer chooses where it goes.",
};

export const CHOICE_FAULT_TEXT: Record<ChoiceFault, string> = {
  NOT_AWAITING: "This matter is not waiting for a choice of where it goes.",
  NOT_OFFERED: "Choose one of the destinations offered.",
  STEP_REQUIRED: "Choose the step it returns to.",
  STEP_NOT_EARLIER: "It can return only to a step before the one that rejected it.",
  REASON_REQUIRED: "Say why it goes there.",
  PERSON_REQUIRED: "Name who chose: it is recorded on their behalf.",
};

export const DESTINATION_FAULT_TEXT: Record<DestinationFault, { field: string; message: string }> = {
  DOMAIN_UNKNOWN: { field: "domain", message: "Choose a matter type the portal routes." },
  ROLE_REQUIRED: { field: "returnToRoleCode", message: "Name the office whose step it returns to." },
  ROLE_NOT_ALLOWED: { field: "returnToRoleCode", message: "Only a return to a step names an office." },
  ROLE_UNKNOWN: { field: "returnToRoleCode", message: "That office is not on file." },
  SAME_DAY: { field: "effectiveFrom", message: "Another destination for this matter type takes effect that day. Choose another day." },
  ENDS_BEFORE_IT_STARTS: { field: "effectiveTo", message: "It must end after it starts." },
};
