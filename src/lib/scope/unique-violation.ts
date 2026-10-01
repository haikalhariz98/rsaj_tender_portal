/**
 * Which of 6.2's hand-written unique indexes a write ran into, and what that means. Pure.
 *
 * The indexes are backstops behind rules the actions already judge under their locks
 * (OD-2's one live estimate per exercise, one draft bill per exercise), so reaching one
 * means another act got there first. Only those two are mapped; any other unique
 * violation is not a rule's refusal and is rethrown, never dressed up as one.
 *
 * Prisma 7 through the pg driver adapter reports a unique violation as P2002 with no
 * `meta.target`: the index is named only in the driver's message
 * (`meta.driverAdapterError.cause.originalMessage`), and `constraint` carries the columns,
 * which do not tell a partial index from another on the same column. The name is read
 * from `target` (the engine's shape), `constraint.index`, or the message, in that order.
 */

export const UNIQUE_BACKSTOPS = {
  CompanyEstimate_one_live_per_exercise: "LIVE_ESTIMATE_EXISTS",
  BqVersion_one_draft_per_exercise: "DRAFT_EXISTS",
} as const;

export type BackstopCode = (typeof UNIQUE_BACKSTOPS)[keyof typeof UNIQUE_BACKSTOPS];

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null;

/// The name of the unique index a P2002 error names, or null where it is not a P2002 or names none.
export function uniqueViolationIndex(e: unknown): string | null {
  if (!isObject(e) || e.code !== "P2002" || !isObject(e.meta)) return null;
  const meta = e.meta;
  const target = meta.target;
  if (typeof target === "string") return target;
  if (Array.isArray(target)) {
    const named = target.find((t): t is string => typeof t === "string" && t in UNIQUE_BACKSTOPS);
    if (named) return named;
  }
  const cause = isObject(meta.driverAdapterError) && isObject(meta.driverAdapterError.cause) ? meta.driverAdapterError.cause : null;
  if (cause && isObject(cause.constraint) && typeof cause.constraint.index === "string") return cause.constraint.index;
  if (cause && typeof cause.originalMessage === "string") {
    const m = /unique constraint "([^"]+)"/.exec(cause.originalMessage);
    if (m) return m[1];
  }
  return null;
}

/// The rule a backstop index stands behind, or null: any other violation is rethrown by the caller.
export function backstopCode(e: unknown): BackstopCode | null {
  const index = uniqueViolationIndex(e);
  return index != null && Object.hasOwn(UNIQUE_BACKSTOPS, index) ? UNIQUE_BACKSTOPS[index as keyof typeof UNIQUE_BACKSTOPS] : null;
}
