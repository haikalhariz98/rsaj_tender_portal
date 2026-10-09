import type { Tx } from "@/lib/audit/record";
import { formatOrgDateTime } from "@/lib/format";

import { boardOrder, type AnnouncementCategory } from "./announcements";

/**
 * The announcements board, read (Phase 4e, FR-VND-014). The supplier side reads the ones standing, in the board's order; the staff side reads every one, withdrawn included, for the
 * register. Reads only, in the caller's client, for one organisation: an announcement is the organisation's, never a supplier's, so nothing here names a supplier.
 */

export interface BoardAnnouncement {
  id: string;
  category: AnnouncementCategory;
  title: string;
  body: string;
  pinned: boolean;
  publishedAt: Date;
  publishedText: string;
  withdrawnAt: Date | null;
  withdrawnText: string | null;
  withdrawReason: string;
  publishedBy: string;
}

export async function loadBoard(client: Tx, organisationId: string, timeZone: string | null, opts: { withdrawn?: boolean } = {}): Promise<BoardAnnouncement[]> {
  const rows = await client.announcement.findMany({
    where: { organisationId, ...(opts.withdrawn ? {} : { withdrawnAt: null }) },
    orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }],
    take: 500,
    include: { publishedBy: { select: { name: true } } },
  });
  const items = rows.map((r) => ({
    id: r.id,
    category: r.category as AnnouncementCategory,
    title: r.title,
    body: r.body,
    pinned: r.pinned,
    publishedAt: r.publishedAt,
    publishedText: formatOrgDateTime(r.publishedAt, timeZone),
    withdrawnAt: r.withdrawnAt,
    withdrawnText: r.withdrawnAt ? formatOrgDateTime(r.withdrawnAt, timeZone) : null,
    withdrawReason: r.withdrawReason,
    publishedBy: r.publishedBy.name,
  }));
  return opts.withdrawn ? items : boardOrder(items);
}
