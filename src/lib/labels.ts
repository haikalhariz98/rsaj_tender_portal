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
