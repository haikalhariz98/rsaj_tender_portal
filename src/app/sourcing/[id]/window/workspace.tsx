import type { ReactNode } from "react";

import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { addendaTab, briefingTab, invitationActs, saleRegister, windowTab } from "@/lib/window/read";
import { invitationStage } from "@/lib/window/stage";

import { AddendaSection, addendaHeader } from "./addenda-section";
import { BriefingSection, briefingHeader } from "./briefing-section";
import { GONE } from "./common";
import { PreparingSection } from "./preparing-section";
import { SaleSection, saleHeader } from "./sale-section";
import { tabActs } from "./tab-acts";
import { WindowSection, windowHeader, type WindowContext } from "./window-section";

/// The sections of the exercise's Invitation tab, in order. The strip is the shared Tabs' second level.
export const INVITATION_SECTIONS = [
  { id: "window", label: "Window" },
  { id: "sales", label: "Sale register" },
  { id: "briefing", label: "Briefing" },
  { id: "addenda", label: "Addenda" },
] as const;

export type InvitationSectionId = (typeof INVITATION_SECTIONS)[number]["id"];
export const invitationSectionOf = (v: string | undefined): InvitationSectionId => INVITATION_SECTIONS.find((s) => s.id === v)?.id ?? "window";

/// What the page puts in its header for the section (the act it asks for, the reasons others are disabled) and the panel.
export interface InvitationView {
  panel: ReactNode;
  actions: ReactNode;
  notes: [string, string][];
  /// Where the section replaces the header's own cancel (a published exercise is cancelled on its route).
  cancel: ReactNode | null;
}

/// A section's own header acts with the tab's (extend, cancel), so every section's header is alike.
async function withTabActs(own: { actions: ReactNode; notes: [string, string][] }, c: WindowContext) {
  const a = await invitationActs(c.exerciseId);
  const tab = a ? tabActs(a, c) : { actions: null, notes: [] as [string, string][], cancel: null };
  return { actions: <>{own.actions}{tab.actions}</>, notes: [...own.notes, ...tab.notes], cancel: tab.cancel };
}

/// The sections the tab offers at this stage. Before approval for tendering the window and the briefings are one view, so there is no strip.
export const invitationSectionsFor = (status: string) => (invitationStage(status) === "live" ? [...INVITATION_SECTIONS] : undefined);

/**
 * One section at a time: only the section the address names is read, so a sibling's data is never
 * loaded. A draft has no window to show, and the screen says what to do first. While the documents
 * are in preparation or awaiting approval for tendering, the window's items and the briefings are
 * shown and can be prepared (the server allows both); the sections open from approval for tendering.
 */
export async function loadInvitation(section: InvitationSectionId, c: WindowContext): Promise<InvitationView> {
  const none = { actions: null, notes: [] as [string, string][], cancel: null };
  const stage = invitationStage(c.status);
  if (stage === "preparing") {
    const [w, b] = await Promise.all([windowTab(c.exerciseId), briefingTab(c.exerciseId)]);
    if (!w || !b) return { ...none, panel: GONE };
    return { ...none, panel: <PreparingSection w={w} b={b} c={c} /> };
  }
  if (stage === "not_yet") {
    return {
      ...none,
      panel: (
        <Card>
          <EmptyState title="The window is prepared once the exercise is in preparation" action={<ButtonLink href={`/sourcing/${c.exerciseId}?tab=documents`} variant="secondary" size="sm">Open the tender documents</ButtonLink>}>
            The window&apos;s items, briefings and site visits are prepared here once the exercise is moved to preparation. Advertising or inviting, selling the documents and addenda follow approval for tendering.
          </EmptyState>
        </Card>
      ),
    };
  }
  if (section === "sales") {
    const d = await saleRegister(c.exerciseId);
    if (!d) return { ...none, panel: GONE };
    return { ...(await withTabActs(saleHeader(d, c), c)), panel: <SaleSection d={d} c={c} /> };
  }
  if (section === "briefing") {
    const d = await briefingTab(c.exerciseId);
    if (!d) return { ...none, panel: GONE };
    return { ...(await withTabActs(briefingHeader(d, c), c)), panel: <BriefingSection d={d} c={c} /> };
  }
  if (section === "addenda") {
    const d = await addendaTab(c.exerciseId);
    if (!d) return { ...none, panel: GONE };
    return { ...(await withTabActs(addendaHeader(d, c), c)), panel: <AddendaSection d={d} c={c} /> };
  }
  const d = await windowTab(c.exerciseId);
  if (!d) return { ...none, panel: GONE };
  return { ...windowHeader(d, c), panel: <WindowSection d={d} c={c} /> };
}

