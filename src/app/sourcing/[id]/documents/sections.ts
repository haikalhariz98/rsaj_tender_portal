/// The sections of the exercise's Tender documents tab (Sourcing Requirements v2, SR-06, ruling 9): the documents and the route they go by, then Publishing, after the approval track.
export const DOCUMENTS_SECTIONS = [
  { id: "documents", label: "Documents and approval" },
  { id: "publishing", label: "Publishing" },
] as const;

export type DocumentsSectionId = (typeof DOCUMENTS_SECTIONS)[number]["id"];

/// The section the address names, or the documents themselves.
export const documentsSectionOf = (v: string | undefined): DocumentsSectionId => DOCUMENTS_SECTIONS.find((s) => s.id === v)?.id ?? "documents";
