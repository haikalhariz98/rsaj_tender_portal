import matters from "./labels.json";

type Label = { en: string;  };

const MATTERS = matters as Record<string, Label>;

/**
 * The name of a matter, in the organisation's own wording.
 *
 * Matter codes are configuration keys — `vo`, `lad_waiver`, `cmgd`. They must never
 * reach a screen; a heading made of a database key reads as unfinished software.
 * Anything unlabelled falls back to a readable form of the code rather than a blank,
 * so a customer adding a matter of their own still gets a usable heading.
 */
export function matterLabel(code: string, language: "en" = "en"): string {
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
  // 6.15 (OD-2 A): what a supplier's application is for.
  NEW: "A first registration",
  RENEWAL: "A renewal of registration",
  UPGRADE: "An upgrade of registration",
  // 6.15a (OD-8 A): what a blacklisting route is asked for.
  BLACKLIST: "A blacklisting",
  BLACKLIST_LIFT: "The lifting of a blacklisting",
  // 6.13 Part B run 1b (FR-EOT-007, BD-613-132): the cause of an extension of time's financial impact.
  financial_not_authority: "With a financial impact not due to an authority requirement",
  financial_authority: "With a financial impact due to an authority requirement",
  no_financial_impact: "With no financial impact",
};

export function condLabel(code: string): string {
  return CONDS[code] ?? code.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/// What a rule with no condition was chosen on: the value the route was resolved on, by what the route
/// is for. A requisition's route resolves on the requisition's value; an exercise's routes (Approval for
/// Tendering, a window change) on the exercise's estimated value, the figure their resolver reads
/// (`l.ex.estimatedValue`, snapshotted on the route as its value). Lead's ruling, Phase 2 close-out.
export const ROUTED_ON_VALUE_ALONE = {
  requisition: "The requisition's value alone",
  exercise: "The exercise's estimated value alone",
} as const;

/// What a route was chosen on: the rule's condition, or the value alone (which the line below it,
/// where shown, spells out).
export function routedOnLabel(cond: string | null | undefined, resolvedOn: keyof typeof ROUTED_ON_VALUE_ALONE = "requisition"): string {
  return cond ? condLabel(cond) : ROUTED_ON_VALUE_ALONE[resolvedOn];
}

// Phase 1 carry D6: the shared components' hints, here rather than as literals in the components.

/// Under the reason a record editor asks for (RecordEditor's `reason`).
export const REASON_HINT = "Recorded in the audit trail with who made the change. This is the only account of why it was made.";

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
