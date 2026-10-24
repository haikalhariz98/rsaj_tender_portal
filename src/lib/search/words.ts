import type { Prisma } from "@/generated/prisma/client";

import { CASE_KEYS, SEARCH_FIELDS, type SearchEntity } from "./fields";

/**
 * The where fragments a search adds (ADR 0044 D2, ST-1). Pure: builds Prisma where objects, imports Prisma types only.
 * Each is a fragment for the caller to AND with its own scope and guards (`{ AND: [scope, wordsWhere(...)] }`), never spread.
 */

/// The where input of each entity's model.
export interface SearchWhere {
  requisition: Prisma.RequisitionWhereInput;
  exercise: Prisma.SourcingExerciseWhereInput;
  project: Prisma.AwardWhereInput;
  supplier: Prisma.SupplierWhereInput;
  sitting: Prisma.MeetingWhereInput;
  application: Prisma.SupplierApplicationWhereInput;
}

/// A filter at the end of a dotted path, through to-one relations: "contract.number" → { contract: { number: filter } }.
const nested = (path: string, filter: object): object => path.split(".").reduceRight<object>((inner, key) => ({ [key]: inner }), filter);

/// A word as an ILIKE pattern's literal text. Prisma 7 passes `%`, `_` and `\` through as wildcards and escape in `contains`, and
/// in `equals` with `mode: "insensitive"` (both are ILIKE on Postgres; `words.db.test.ts` proved it with this escape off), so they
/// are escaped here, backslash first.
export const likeLiteral = (word: string): string => word.replace(/[\\%_]/g, (c) => `\\${c}`);

/// Every word must match at least one of the entity's fields, case-insensitive substring. No words: matches everything.
/// `hidden` (the exercises the reader may not see): a project is not found through its exercise's own paths when that exercise is hidden
/// from the reader (AC-18; its reference and contract number still find it).
export function wordsWhere<E extends SearchEntity>(entity: E, words: readonly string[], hidden: readonly string[] = []): SearchWhere[E] {
  const fields = SEARCH_FIELDS[entity];
  const clause = (path: string, w: string): object => {
    const match = nested(path, { contains: likeLiteral(w), mode: "insensitive" });
    return entity === "project" && hidden.length && path.startsWith("exercise.") ? { AND: [match, { exercise: { id: { notIn: [...hidden] } } }] } : match;
  };
  return { AND: words.map((w) => ({ OR: fields.map((path) => clause(path, w)) })) } as SearchWhere[E];
}

/// A whole-value, case-insensitive match of q on one of the entity's case keys (ST-4). Null for an entity with none.
export function exactKeyWhere<E extends SearchEntity>(entity: E, q: string): SearchWhere[E] | null {
  const keys = CASE_KEYS[entity];
  if (!keys?.length) return null;
  return { OR: keys.map((path) => nested(path, { equals: likeLiteral(q), mode: "insensitive" })) } as SearchWhere[E];
}
