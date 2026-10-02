import matters from "./labels.json";

type Label = { en: string; ms: string };

const MATTERS = matters as Record<string, Label>;

/**
 * The name of a matter, in the organisation's own wording.
 *
 * Matter codes are configuration keys — `vo`, `lad_waiver`, `cmgd`. They must never
 * reach a screen; a heading made of a database key reads as unfinished software.
 * Anything unlabelled falls back to a readable form of the code rather than a blank,
 * so a customer adding a matter of their own still gets a usable heading.
 */
export function matterLabel(code: string, language: "en" | "ms" = "en"): string {
  const label = MATTERS[code];
  if (label) return label[language];
  return code.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function hasMatterLabel(code: string): boolean {
  return code in MATTERS;
}

/// Sourcing methods, in the wording used on the forms.
const METHODS: Record<string, string> = {
  direct: "Direct appointment",
  open_selective: "Open / selective",
  quotation: "Quotation",
  tender: "Tender",
  rental: "Rental / leasing",
};

export function methodLabel(code: string): string {
  return METHODS[code] ?? code.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/// The authority acts, spelled out. Officers sign forms that say these words.
export const ACT_LABEL: Record<string, string> = {
  P: "Propose",
  JP: "Jointly propose",
  R: "Recommend",
  JR: "Jointly recommend",
  MR: "Mandatory recommendation",
  MJR: "Mandatory joint recommendation",
  A: "Approve",
  MA: "Mandatory approval",
};

/// An act's words with its DAL code, as a routing sheet prints both (ruling CO-9).
export function actWithCode(act: string): string {
  const words = ACT_LABEL[act];
  return words ? `${words} (${act})` : "Unknown act";
}

/// The acts as done, for recording a decision: "Recommended", not "Recommend — done".
export const ACT_DONE_LABEL: Record<string, string> = {
  P: "Proposed",
  JP: "Jointly proposed",
  R: "Recommended",
  JR: "Jointly recommended",
  MR: "Recommended (mandatory recommendation)",
  MJR: "Jointly recommended (mandatory)",
  A: "Approved",
  MA: "Approved (mandatory approval)",
};

/// Rule conditions, spelled out. A condition is a configuration key like a matter's.
const CONDS: Record<string, string> = {
  over_budget: "When over budget",
  // 6.5: what a change to the invitation window is asked for.
  EXTENSION: "An extension of the closing",
  CORRECTION: "A correction of the closing before publication",
  CANCELLATION: "The cancellation of the published exercise",
};

export function condLabel(code: string): string {
  return CONDS[code] ?? code.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/// What a route was chosen on. A rule with no condition is chosen by the requisition's value
/// alone, which the line below it ("Value band") then spells out.
export function routedOnLabel(cond: string | null | undefined): string {
  return cond ? condLabel(cond) : "The requisition's value alone";
}

// Phase 1 carry D6: the shared components' hints, here rather than as literals in the components.

/// Under the reason a record editor asks for (RecordEditor's `reason`).
export const REASON_HINT = "Recorded in the audit trail. Nobody is signed in, so this is the only account of why the change was made.";

/// What each provenance means, for its badge's tooltip; and the tooltip where nobody has sourced a fact.
export const PROVENANCE_HINT: Readonly<Record<"STATED" | "OBSERVED" | "ASSUMED", string>> = {
  STATED: "Written in a governing document",
  OBSERVED: "Seen in practice, not written down",
  ASSUMED: "A working default, awaiting sign-off",
};
export const PROVENANCE_NOT_SET_HINT = "Nobody has said where this came from";

/// The authority simulator's field hints.
export const SIMULATOR_HINT = {
  contractValue: "For variations",
  percentage: "Of contract sum",
  actingOfficer: "Nobody may approve their own matter",
  absent: "Authority reverts upward, never down",
  noFundingRoute: "No funding route configured yet",
  fundingRoute: "Whether a funder overrides these limits is set per route",
} as const;
