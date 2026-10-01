import type { ReactNode } from "react";

import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { addendaTab, briefingTab, saleRegister, windowTab } from "@/lib/window/read";

import { AddendaSection, addendaHeader } from "./addenda-section";
import { BriefingSection, briefingHeader } from "./briefing-section";
import { GONE } from "./common";
import { SaleSection, saleHeader } from "./sale-section";
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

const EARLY = ["DRAFT", "DOCUMENTS_IN_PREPARATION", "PENDING_APPROVAL_FOR_TENDERING"];

/**
 * One section at a time: only the section the address names is read, so a sibling's data is never
 * loaded. Before the documents are approved for tendering there is no window to show, and the
 * screen says what to do first.
 */
export async function loadInvitation(section: InvitationSectionId, c: WindowContext): Promise<InvitationView> {
  const none = { actions: null, notes: [] as [string, string][], cancel: null };
  if (EARLY.includes(c.status)) {
    return {
      ...none,
      panel: (
        <Card>
          <EmptyState title="The window opens once the tender documents are approved" action={<ButtonLink href={`/sourcing/${c.exerciseId}?tab=documents`} variant="secondary" size="sm">Open the tender documents</ButtonLink>}>
            Advertising or inviting, selling the documents, briefings and addenda are recorded here after the documents are approved for tendering.
          </EmptyState>
        </Card>
      ),
    };
  }
  if (section === "sales") {
    const d = await saleRegister(c.exerciseId);
    if (!d) return { ...none, panel: GONE };
    return { ...saleHeader(d, c), cancel: null, panel: <SaleSection d={d} c={c} /> };
  }
  if (section === "briefing") {
    const d = await briefingTab(c.exerciseId);
    if (!d) return { ...none, panel: GONE };
    return { ...briefingHeader(d, c), cancel: null, panel: <BriefingSection d={d} c={c} /> };
  }
  if (section === "addenda") {
    const d = await addendaTab(c.exerciseId);
    if (!d) return { ...none, panel: GONE };
    return { ...addendaHeader(d, c), cancel: null, panel: <AddendaSection d={d} c={c} /> };
  }
  const d = await windowTab(c.exerciseId);
  if (!d) return { ...none, panel: GONE };
  return { ...windowHeader(d, c), panel: <WindowSection d={d} c={c} /> };
}

