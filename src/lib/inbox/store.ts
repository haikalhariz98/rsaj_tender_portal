/**
 * The staff inbox, read and written (Phase 3c). The drafts are `notices.ts`; this is the I/O and nothing else.
 *
 * - `writeNotices` runs inside the act's own transaction, so a notice exists if and only if the act did. It writes with "skip duplicates" on the notice's key,
 *   so an act retried, or a job re-run, tells no one twice. A recipient who is not a person of the organisation gets nothing.
 * - `loadInbox` and `unreadCount` give a person their own notices and nobody else's, leaving out the notices of an exercise restricted to people they are not
 *   (FR-MTD-007): the list of ids to leave out is the caller's `hiddenExercises`, the same one every other list uses.
 * - `loadInbox` reads a page at a time from a cursor (`paging.ts`), and `inboxTotals` counts them all, so what a screen says it holds is never what one page held.
 * - `markRead` records the first reading, once. The database lets nothing else about a notice change. `markAllRead` does it for every notice of the person's own that is unread and
 *   not hidden, up to a moment, in one statement.
 */

import type { Tx } from "@/lib/audit/record";
import { exerciseIdNotHidden } from "@/lib/auth/sulit-store";

import type { NoticeDraft } from "./notices";
import { INBOX_PAGE_SIZE, type InboxCursor } from "./paging";

/// Returns how many notices were newly written (a retry returns 0).
export async function writeNotices(tx: Tx, organisationId: string, raisedByPersonId: string | null, drafts: readonly NoticeDraft[]): Promise<number> {
  if (drafts.length === 0) return 0;
  const known = new Set((await tx.person.findMany({ where: { organisationId, id: { in: [...new Set(drafts.map((d) => d.recipientPersonId))] } }, select: { id: true } })).map((p) => p.id));
  const data = drafts.filter((d) => known.has(d.recipientPersonId)).map((d) => ({ organisationId, raisedByPersonId, ...d }));
  if (data.length === 0) return 0;
  const written = await tx.staffNotice.createMany({ data, skipDuplicates: true });
  return written.count;
}

export interface InboxNotice {
  id: string;
  kind: string;
  title: string;
  body: string;
  href: string | null;
  raisedAt: Date;
  readAt: Date | null;
}

const OWN = (organisationId: string, personId: string, hidden: readonly string[]) => ({ organisationId, recipientPersonId: personId, ...exerciseIdNotHidden(hidden) });

/// One page of the person's notices, newest first: up to `take`, from just after `before` where given. `more` says whether any lie beyond the page.
export async function loadInbox(
  client: Tx,
  viewer: { organisationId: string; personId: string },
  hidden: readonly string[],
  opts: { take?: number; before?: InboxCursor | null } = {},
): Promise<InboxNotice[]> {
  return (await loadInboxPage(client, viewer, hidden, opts)).notices;
}

export async function loadInboxPage(
  client: Tx,
  viewer: { organisationId: string; personId: string },
  hidden: readonly string[],
  opts: { take?: number; before?: InboxCursor | null } = {},
): Promise<{ notices: InboxNotice[]; more: boolean }> {
  const take = opts.take ?? INBOX_PAGE_SIZE;
  const before = opts.before ?? null;
  const rows = await client.staffNotice.findMany({
    where: {
      ...OWN(viewer.organisationId, viewer.personId, hidden),
      ...(before ? { AND: [{ OR: [{ raisedAt: { lt: before.raisedAt } }, { raisedAt: before.raisedAt, id: { lt: before.id } }] }] } : {}),
    },
    orderBy: [{ raisedAt: "desc" }, { id: "desc" }],
    take: take + 1,
    select: { id: true, kind: true, title: true, body: true, href: true, raisedAt: true, readAt: true },
  });
  return { notices: rows.slice(0, take), more: rows.length > take };
}

/// How many notices the person has, and how many are unread: the real totals, whatever page is shown.
export async function inboxTotals(client: Tx, viewer: { organisationId: string; personId: string }, hidden: readonly string[]): Promise<{ total: number; unread: number }> {
  const where = OWN(viewer.organisationId, viewer.personId, hidden);
  const [total, unread] = await Promise.all([client.staffNotice.count({ where }), client.staffNotice.count({ where: { ...where, readAt: null } })]);
  return { total, unread };
}

export async function unreadCount(client: Tx, viewer: { organisationId: string; personId: string }, hidden: readonly string[]): Promise<number> {
  return client.staffNotice.count({ where: { ...OWN(viewer.organisationId, viewer.personId, hidden), readAt: null } });
}

/**
 * Mark every notice of the person's own that is unread and not hidden from them read, at the moment given, if it was raised no later than `upTo` (the time the screen they
 * pressed the button on was drawn: one that arrived since has not been seen). Others' notices, and ones already read, are untouched. Returns how many.
 */
export async function markAllRead(tx: Tx, viewer: { organisationId: string; personId: string }, hidden: readonly string[], now: Date, upTo: Date): Promise<number> {
  const r = await tx.staffNotice.updateMany({ where: { ...OWN(viewer.organisationId, viewer.personId, hidden), readAt: null, raisedAt: { lte: upTo } }, data: { readAt: now } });
  return r.count;
}

/// Mark a person's own unread notices read, at the moment given. Others' notices, and ones already read, are untouched.
export async function markRead(tx: Tx, viewer: { organisationId: string; personId: string }, ids: readonly string[], now: Date): Promise<number> {
  if (ids.length === 0) return 0;
  const r = await tx.staffNotice.updateMany({ where: { organisationId: viewer.organisationId, recipientPersonId: viewer.personId, id: { in: [...ids] }, readAt: null }, data: { readAt: now } });
  return r.count;
}
