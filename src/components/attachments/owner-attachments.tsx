import { requireStaff } from "@/app/_auth/actor";
import { FileIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { ownerPanel, uploadContext } from "@/lib/documents/read";
import type { OwnerRef } from "@/lib/documents/repo";
import { documentOrg } from "@/lib/documents/service";
import { panelView, type PanelOptions } from "@/lib/documents/views";

import { AttachmentPanel } from "./attachment-panel";

/**
 * A record's documents, loaded on the server and handed to the shared panel as plain
 * data (the panel's lists carry client controls, so they cannot be built here). Mount it
 * inside the tab or card that shows the record's documents, so only the tab being looked
 * at reads them.
 *
 * `required` and `findings` are the owner screen's own facts about its record (an
 * exercise's method needs a dossier; an award's return needs its scans); everything
 * the panel decides comes from `read.ts`.
 */
export async function OwnerAttachments({ owner, title, subtitle, collapseWhenEmpty, compact, ...opts }: {
  owner: OwnerRef;
  title?: string;
  subtitle?: string;
  /// Where every slot is filled only by another step (nothing here is uploaded) and nothing is
  /// attached, nor was: the panel is one line, its title and what the slot says, not a card of
  /// empty states. Anything attached, or any slot that can take an upload, shows the whole panel.
  collapseWhenEmpty?: boolean;
  /// Only the slots, each with its upload and download (AttachmentPanel).
  compact?: boolean;
} & PanelOptions) {
  // Whose documents: the signed-in person's organisation (ADR 0034 D10). Every page that draws this has already asked who is signed in; the read is cached per request.
  const { organisationId } = await requireStaff();
  const [org, panel, upload] = await Promise.all([documentOrg(organisationId), ownerPanel(organisationId, owner), uploadContext(organisationId)]);
  if (!panel || !upload) {
    return (
      <EmptyState size="sm" title="Its documents cannot be shown">
        The record, or the organisation, could not be found.
      </EmptyState>
    );
  }
  const view = panelView(panel, upload, org?.timeZone ?? null, opts);
  if (collapseWhenEmpty && view.items.length === 0 && view.past.length === 0 && view.slots.length > 0 && view.slots.every((s) => s.attachedBy != null)) {
    return (
      <Card>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-5 py-3.5 sm:px-6">
          <FileIcon size={16} />
          <span className="text-[14px] font-semibold text-ink">{title ?? "Documents"}</span>
          {view.slots.map((s) => (
            <Badge key={s.purpose} tone={s.status.tone}>{s.status.text}</Badge>
          ))}
        </div>
      </Card>
    );
  }
  return <AttachmentPanel {...view} title={title} subtitle={subtitle} compact={compact} />;
}
