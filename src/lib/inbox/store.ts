/**
 * The staff inbox, read and written (Phase 3c). The drafts are `notices.ts`; this is the I/O and nothing else.
 *
 * - `writeNotices` runs inside the act's own transaction, so a notice exists if and only if the act did. It writes with "skip duplicates" on the notice's key,
 *   so an act retried, or a job re-run, tells no one twice. A recipient who is not a person of the organisation gets nothing.
 * - `loadInbox` and `unreadCount` give a person their own notices and nobody else's, leaving out the notices of an exercise restricted to people they are not
 *   (FR-MTD-007): the list of ids to leave out is the caller's `hiddenExercises`, the same one every other list uses.
 * - `markRead` records the first reading, once. The database lets nothing else about a notice change.
 */

import type { Tx } from "@/lib/audit/record";
import { exerciseIdNotHidden } from "@/lib/auth/sulit-store";

import type { NoticeDraft } from "./notices";

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

export async function loadInbox(client: Tx, viewer: { organisationId: string; personId: string }, hidden: readonly string[], take = 200): Promise<InboxNotice[]> {
  return client.staffNotice.findMany({
    where: OWN(viewer.organisationId, viewer.personId, hidden),
    orderBy: [{ raisedAt: "desc" }, { id: "desc" }],
    take,
    select: { id: true, kind: true, title: true, body: true, href: true, raisedAt: true, readAt: true },
  });
}

export async function unreadCount(client: Tx, viewer: { organisationId: string; personId: string }, hidden: readonly string[]): Promise<number> {
  return client.staffNotice.count({ where: { ...OWN(viewer.organisationId, viewer.personId, hidden), readAt: null } });
}

/// Mark a person's own unread notices read, at the moment given. Others' notices, and ones already read, are untouched.
export async function markRead(tx: Tx, viewer: { organisationId: string; personId: string }, ids: readonly string[], now: Date): Promise<number> {
  if (ids.length === 0) return 0;
  const r = await tx.staffNotice.updateMany({ where: { organisationId: viewer.organisationId, recipientPersonId: viewer.personId, id: { in: [...ids] }, readAt: null }, data: { readAt: now } });
  return r.count;
}
