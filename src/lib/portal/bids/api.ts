/**
 * What My Bids' route handlers read from a request body (Phase 4d). Pure: a handler parses with these and acts on the result, so the shape a request must have is held in one place and tested without
 * a server. Nothing here reads a supplier, an organisation, an account or a day from the body: those come from the session and the server's clock. A field of the wrong type or past its bound is a refusal, never
 * a guess. The ids named are an exercise's, an event's and an addendum's, which the stores read only as the session's supplier may see them (another's read as not found).
 */

/// More than any of the three bodies ever is (two ids and a name); past it the request is not read at all.
export const BIDS_BODY_LIMIT = 4 * 1024;

export type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };
const bad = <T>(message: string): Parsed<T> => ({ ok: false, message });

const ID = /^[A-Za-z0-9_-]{8,40}$/;
const isId = (v: unknown): v is string => typeof v === "string" && ID.test(v);
const text = (v: unknown, max: number): string | null => (v == null ? "" : typeof v === "string" && v.length <= max * 4 ? v.slice(0, max * 2) : null);

export interface EventBody {
  exerciseId: string;
  eventId: string;
  action: "signup" | "withdraw";
  representative: string;
}

export function parseEventBody(b: Record<string, unknown>): Parsed<EventBody> {
  if (!isId(b.exerciseId) || !isId(b.eventId)) return bad("Say which briefing or site visit this is for.");
  if (b.action !== "signup" && b.action !== "withdraw") return bad("Say whether you are signing up or withdrawing.");
  const representative = text(b.representative, 240);
  if (representative == null) return bad("The name is not text.");
  return { ok: true, value: { exerciseId: b.exerciseId, eventId: b.eventId, action: b.action, representative } };
}

export interface AcknowledgeBody {
  exerciseId: string;
  addendumId: string;
}

export function parseAcknowledgeBody(b: Record<string, unknown>): Parsed<AcknowledgeBody> {
  if (!isId(b.exerciseId) || !isId(b.addendumId)) return bad("Say which addendum this is for.");
  return { ok: true, value: { exerciseId: b.exerciseId, addendumId: b.addendumId } };
}

export interface RequestBody {
  exerciseId: string;
  action: "request" | "withdraw";
  collectorName: string;
}

export function parseRequestBody(b: Record<string, unknown>): Parsed<RequestBody> {
  if (!isId(b.exerciseId)) return bad("Say which exercise this is for.");
  if (b.action !== "request" && b.action !== "withdraw") return bad("Say whether you are asking for the documents or withdrawing the request.");
  const collectorName = text(b.collectorName, 240);
  if (collectorName == null) return bad("The name is not text.");
  return { ok: true, value: { exerciseId: b.exerciseId, action: b.action, collectorName } };
}
