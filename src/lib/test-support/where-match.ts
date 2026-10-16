/**
 * A small in-memory reading of a Prisma `where`, for the pure tests that prove a database filter agrees with the pure rule it
 * stands for (`CASE_STAGE_WHERE` and `caseStage`, `caseVisibilityWhere` and `caseVisibility`, the pipeline filters; wave G
 * step G3). The database proof is the db tests'; this one runs on every combination without a database.
 *
 * It knows only what those filters use, and throws on anything else, so a later edit that reaches for another operator fails
 * loudly instead of matching nothing (or everything) by accident:
 * - `AND` and `OR` (a list); `NOT` is refused, because the filters are written positively on purpose;
 * - a scalar: a literal or null (equality), `{ in }`, `{ notIn }`, `{ not }` (a literal or null);
 * - a to-one relation: `{ is }`, `{ isNot }`, each a filter or null;
 * - a to-many relation: `{ none }`, `{ some }`.
 * A field the row does not carry is an error too: a fixture must state every fact the filter reads.
 */

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

const isPlain = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v) && !(v instanceof Date);

function scalar(field: string, value: unknown, filter: unknown): boolean {
  if (!isPlain(filter)) return value === filter;
  const keys = Object.keys(filter);
  if (keys.length !== 1) throw new Error(`where-match: field "${field}" has ${keys.length} operators; give one per field`);
  const [op] = keys;
  const arg = filter[op];
  switch (op) {
    case "in":
      return (arg as unknown[]).includes(value);
    case "notIn":
      // As in SQL: a null is neither in nor not in a list.
      return value !== null && !(arg as unknown[]).includes(value);
    case "not":
      if (isPlain(arg)) throw new Error(`where-match: field "${field}" uses a nested "not"`);
      // As in SQL: "<> x" is not true of a null, and "not: null" is IS NOT NULL.
      return arg === null ? value !== null : value !== null && value !== arg;
    default:
      throw new Error(`where-match: field "${field}" uses unsupported operator "${op}"`);
  }
}

export function whereMatches(row: Row, where: Where): boolean {
  for (const [key, filter] of Object.entries(where)) {
    if (key === "AND") {
      if (!(filter as Where[]).every((w) => whereMatches(row, w))) return false;
      continue;
    }
    if (key === "OR") {
      if (!(filter as Where[]).some((w) => whereMatches(row, w))) return false;
      continue;
    }
    if (key === "NOT") throw new Error("where-match: NOT is refused; write the filter positively");
    if (!(key in row)) throw new Error(`where-match: the row does not carry "${key}"`);
    const value = row[key];
    if (isPlain(filter) && ("is" in filter || "isNot" in filter)) {
      if (Object.keys(filter).length !== 1) throw new Error(`where-match: relation "${key}" mixes operators`);
      if (value !== null && !isPlain(value)) throw new Error(`where-match: relation "${key}" is not a to-one row`);
      const [op, inner] = Object.entries(filter)[0];
      const hit = inner === null ? value === null : value !== null && whereMatches(value as Row, inner as Where);
      if (op === "is" ? !hit : inner === null ? value === null : hit) return false;
      continue;
    }
    if (isPlain(filter) && ("none" in filter || "some" in filter)) {
      if (Object.keys(filter).length !== 1) throw new Error(`where-match: relation "${key}" mixes operators`);
      if (!Array.isArray(value)) throw new Error(`where-match: relation "${key}" is not a to-many list`);
      const [op, inner] = Object.entries(filter)[0];
      const any = value.some((v) => whereMatches(v as Row, inner as Where));
      if (op === "some" ? !any : any) return false;
      continue;
    }
    if (!scalar(key, value, filter)) return false;
  }
  return true;
}
