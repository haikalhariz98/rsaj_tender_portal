import type { SearchHit } from "./types";

/// Exact case-key hits first; within each side the caller's order (newest first) is kept. No relevance score (ST-1). Pure.
export const rankHits = (hits: readonly SearchHit[]): SearchHit[] => [...hits.filter((h) => h.exact), ...hits.filter((h) => !h.exact)];
