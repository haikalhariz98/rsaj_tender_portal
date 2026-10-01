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
export async function OwnerAttachments({ owner, title, subtitle, ...opts }: { owner: OwnerRef; title?: string; subtitle?: string } & PanelOptions) {
  const [org, panel, upload] = await Promise.all([documentOrg(), ownerPanel(owner), uploadContext()]);
  if (!panel || !upload) {
    return (
      <EmptyState size="sm" title="Its documents cannot be shown">
        The record, or the organisation, could not be found.
      </EmptyState>
    );
  }
  return <AttachmentPanel {...panelView(panel, upload, org?.timeZone ?? null, opts)} title={title} subtitle={subtitle} />;
}
