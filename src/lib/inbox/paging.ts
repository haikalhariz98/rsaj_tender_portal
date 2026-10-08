/**
 * Paging the inbox (Phase 3c review): a person's notices are read a page at a time, newest first, from a cursor on the notice's own time and id, so that no notice is out of
 * reach however many there are. The cursor travels in the address and is read back with suspicion: anything that is not exactly the form written here is no cursor.
 *
 * Pure.
 */

export const INBOX_PAGE_SIZE = 100;

export interface InboxCursor {
  raisedAt: Date;
  id: string;
}

/// The cursor that resumes after this notice (the one a page ended on).
export function encodeCursor(c: InboxCursor): string {
  return `${c.raisedAt.toISOString()}~${c.id}`;
}

/// The cursor an address carries, or null where it is absent or not one this module wrote.
export function decodeCursor(raw: string | null | undefined): InboxCursor | null {
  if (!raw) return null;
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)~([A-Za-z0-9_-]{1,64})$/.exec(raw);
  if (!m) return null;
  const raisedAt = new Date(m[1]!);
  return Number.isNaN(raisedAt.getTime()) ? null : { raisedAt, id: m[2]! };
}

/**
 * "Mark all as read" is for what the page showed: the time the page was drawn, so a notice that arrived after it is not marked read unseen. The time comes back in a form
 * field and is only ever allowed to narrow the act: a missing or unreadable one marks nothing, and a time in the future is no later than now.
 */
export function markUpTo(raw: string | null | undefined, now: Date): Date | null {
  if (!raw) return null;
  const at = new Date(raw);
  if (Number.isNaN(at.getTime())) return null;
  return at.getTime() > now.getTime() ? now : at;
}
