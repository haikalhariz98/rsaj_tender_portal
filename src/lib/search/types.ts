import type { SearchEntity } from "./fields";

/**
 * What global search answers (ADR 0044 D3, D4; plan step 7 §2). Types and two constants; the store (7.2) fills them.
 */

/// The most hits a group shows; its `total` says how many matched.
export const SEARCH_GROUP_SIZE = 10;

/// Each group's heading, in the order the page draws them. ST-3: committee sittings are the fifth group.
export const SEARCH_GROUP_LABEL: Readonly<Record<SearchEntity, string>> = {
  requisition: "Requisitions",
  exercise: "Tenders & quotations",
  project: "Projects",
  supplier: "Suppliers",
  sitting: "Committees",
};

export type HitTone = "brand" | "ok" | "warn" | "err" | "info";

export interface SearchHit {
  entity: SearchEntity;
  id: string;
  /// A sitting's is its committee's name; never an agenda item's or a matter's title (ST-3, FR-MTD-007).
  title: string;
  /// Reference and number, as words (a sitting's: its reference and date).
  sub: string;
  /// The record's own page.
  href: string;
  status?: { text: string; tone?: HitTone };
  /// A whole-value match on a case key.
  exact: boolean;
}

export interface SearchGroup {
  entity: SearchEntity;
  label: string;
  /// At most SEARCH_GROUP_SIZE, exact first, then newest.
  hits: SearchHit[];
  /// A count under the same where as the hits: an honest "10 of 34", in which a hidden record is not counted.
  total: number;
  /// The list with ?q=.
  seeAllHref: string;
}

/// FR-REQ-002: the whole case, from the requisition down. Sittings are not in it (ST-3).
export interface CaseGroup {
  requisition: SearchHit;
  /// Only those the reader may see; a hidden one is neither shown nor counted.
  exercises: { hit: SearchHit; projects: SearchHit[] }[];
  /// AC-18: projects the reader may see (contract stages) whose exercise is hidden from them. Shown without the exercise, never naming it.
  projects: SearchHit[];
}

export interface SearchResult {
  q: string;
  caseGroup: CaseGroup | null;
  groups: SearchGroup[];
}
