import type { Metadata } from "next";

import { BellIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { db } from "@/lib/db";
import { loadBoard } from "@/lib/portal/projects/announcement-store";
import { CATEGORY_TONE, CATEGORY_WORDS } from "@/lib/portal/projects/announcements";

import { requireSupplier } from "../../_auth/supplier";

export const metadata: Metadata = { title: "Announcements" };
export const dynamic = "force-dynamic";

/**
 * The announcements board (FR-VND-014, Phase 4e): what the procurement office has published to every signed-in supplier, pinned items first, each marked Important, Policy or Notice. Read only
 * here: an announcement is the office's, published by an officer the organisation has authorised. A withdrawn announcement is not shown.
 */
export default async function SupplierAnnouncementsPage() {
  const actor = await requireSupplier();
  const items = await loadBoard(db, actor.organisationId, actor.organisationTimeZone);
  const pinned = items.filter((a) => a.pinned);
  const rest = items.filter((a) => !a.pinned);
  const list = (xs: typeof items) => (
    <ul className="divide-y divide-line/70">
      {xs.map((a) => (
        <li key={a.id} className="flex flex-col gap-2 px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={CATEGORY_TONE[a.category] === "neutral" ? undefined : CATEGORY_TONE[a.category]}>{CATEGORY_WORDS[a.category].en}</Badge>
            {a.pinned && <Badge tone="brand" dot>Pinned</Badge>}
            <span className="text-[12.5px] text-ink-3">{a.publishedText}</span>
          </div>
          <p className="text-[15px] font-semibold text-ink">{a.title}</p>
          <p className="text-[14px] leading-relaxed break-words whitespace-pre-line text-ink-2">{a.body}</p>
        </li>
      ))}
    </ul>
  );
  return (
    <>
      <PageHeader title="Announcements" subtitle="What the procurement office has published for its suppliers, shown here and not sent." meta={[actor.supplierName, actor.displayName]} />
      {items.length === 0 ? (
        <Card>
          <EmptyState title="Nothing has been announced" icon={<BellIcon size={22} />}>When the procurement office publishes an announcement, it appears here, with the important ones pinned at the top.</EmptyState>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {pinned.length > 0 && (
            <Card className="overflow-hidden">
              <CardHeader icon={<BellIcon size={17} />} title="Pinned" subtitle="The office keeps these at the top until they are no longer needed." divided />
              <CardBody pad="none">{list(pinned)}</CardBody>
            </Card>
          )}
          {rest.length > 0 && (
            <Card className="overflow-hidden">
              <CardHeader icon={<BellIcon size={17} />} title={pinned.length ? "Other announcements" : "Announcements"} subtitle="Newest first." divided />
              <CardBody pad="none">{list(rest)}</CardBody>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
