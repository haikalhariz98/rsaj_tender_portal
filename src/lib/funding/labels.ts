/// FS-4's three states in words: the eligibility dropdown and the Funding sources list.
export const ELIGIBILITY_WORDS = { NOT_SET: "Not set", ANY: "Any category", ONLY: "Only these" } as const;

export const eligibilityKey = (restricted: boolean | null): keyof typeof ELIGIBILITY_WORDS => (restricted == null ? "NOT_SET" : restricted ? "ONLY" : "ANY");
