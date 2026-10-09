import type { Tx } from "@/lib/audit/record";
import { pageOf } from "@/lib/certificate/library";
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

/// How many announcements a page of the board, or of the officers' register, shows.
export const BOARD_PAGE = 50;

/// One page of the board (or of the register, with `withdrawn`), in the board's order, paged in the database (4e review fix: it was one read capped at 500 with no word of the cap).
/// The database orders as `boardOrder` does (pinned first, then newest first), so a page is the board's own slice; `boardOrder` still drops a withdrawn one on the supplier's side.
export async function loadBoard(client: Tx, organisationId: string, timeZone: string | null, opts: { withdrawn?: boolean; page?: string } = {}): Promise<{ items: BoardAnnouncement[]; total: number; page: number }> {
  const where = { organisationId, ...(opts.withdrawn ? {} : { withdrawnAt: null }) };
  const total = await client.announcement.count({ where });
  const page = pageOf(opts.page, total, BOARD_PAGE);
  const rows = await client.announcement.findMany({
    where,
    orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }, { id: "asc" }],
    skip: page * BOARD_PAGE,
    take: BOARD_PAGE,
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
  return { items: opts.withdrawn ? items : boardOrder(items), total, page };
}
