import type { SplitFault } from "./split";

/// FS-4's three states in words: the eligibility dropdown and the Funding sources list.
export const ELIGIBILITY_WORDS = { NOT_SET: "Not set", ANY: "Any category", ONLY: "Only these" } as const;

export const eligibilityKey = (restricted: boolean | null): keyof typeof ELIGIBILITY_WORDS => (restricted == null ? "NOT_SET" : restricted ? "ONLY" : "ANY");

/// FS-4's warning, naming the source: an unset eligibility is never a silent pass.
export const eligibilityNotSetText = (source: string) => `Eligibility not set for ${source}, so the project category is not checked.`;

/// FS-7's refusals, in words.
export const SPLIT_FAULT_TEXT: Record<SplitFault, string> = {
  LOCKED: "Funding is fixed once a payment is certified.",
  EMPTY: "Add at least one source.",
  TOO_MANY: "At most five sources.",
  BAD_PERCENT: "Each share is a percentage above 0, to at most 2 decimals.",
  DUPLICATE_SOURCE: "A source is named twice.",
  NOT_100: "The shares must add up to 100%.",
  NOT_IN_FORCE: "A source is no longer in use.",
  NOT_ELIGIBLE: "A source may not fund this project's category.",
  CATEGORY_MISSING: "A source funds only some project categories. Record the category on the requisition first.",
};

