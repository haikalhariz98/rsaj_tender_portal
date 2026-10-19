import { hiddenExercises } from "@/app/_auth/sulit";
import type { Reader } from "@/lib/auth/sulit-store";
import type { ReactNode } from "react";

import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { addendaTab, briefingTab, saleRegister, windowTab } from "@/lib/window/read";
import { invitationStage } from "@/lib/window/stage";

import { AddendaSection, addendaHeader } from "./addenda-section";
import { BriefingSection } from "./briefing-section";
import { GONE } from "./common";
import { SaleSection, saleHeader } from "./sale-section";
import { WindowSection, windowHeader, type WindowContext } from "./window-section";

/**
 * What the page puts in its header for a section (the act it asks for, the reasons others are disabled) and the panel.
 *
 * Sourcing Requirements v2 (SR-06, ruling 9) took the Invitation tab apart. Publishing, with the evaluation model choice, the notice, the
 * channels, the invitees and letters, the addenda, the closing changes and the cancellation, is a section of Tender documents, after the
 * approval track. The sale register, the requests and the briefing attendance are the first section of Bids and opening. What the tab held
 * before approval (the notice, the fee, the bid validity and the briefings) is prepared on Scope and estimate.
 */
export interface InvitationView {
  panel: ReactNode;
  actions: ReactNode;
  notes: [string, string][];
  /// Where the section replaces the header's own cancel (a published exercise is cancelled on its route).
  cancel: ReactNode | null;
}

const none = { actions: null, notes: [] as [string, string][], cancel: null };

/// Said where the window is not there yet, with where to go: the same sentences whichever of the two sections asks.
function NotYet({ c, what }: { c: WindowContext; what: string }) {
  const stage = invitationStage(c.status, c.noPack);
  if (stage === "no_window") {
    return (
      <Card>
        <EmptyState title="This exercise has no invitation window">No tender documents, so nothing to publish.</EmptyState>
      </Card>
    );
  }
  if (stage === "not_yet") {
    return (
      <Card>
        <EmptyState title={`${what} opens once the exercise is in preparation`} action={<ButtonLink href={`/sourcing/${c.exerciseId}?tab=overview`} variant="secondary" size="sm">Open the Overview</ButtonLink>}>
          Move to preparation first.
        </EmptyState>
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <EmptyState title={`${what} opens after approval for tendering`} action={<ButtonLink href={`/sourcing/${c.exerciseId}?tab=scope&section=notice`} variant="secondary" size="sm">Open Notice and fee</ButtonLink>} />
    </div>
  );
}

/**
 * The Publishing section of Tender documents: read only while it is the section being looked at. Before approval for tendering it says what
 * must come first; from approval it is the window as it was on the Invitation tab, less the items that moved to Scope and estimate.
 */
export async function loadPublishing(scope: Reader, c: WindowContext): Promise<InvitationView> {
  if (invitationStage(c.status, c.noPack) !== "live") return { ...none, panel: <NotYet c={c} what="Publishing" /> };
  const [d, a] = await Promise.all([windowTab(scope.organisationId, c.exerciseId, await hiddenExercises(scope)), addendaTab(scope.organisationId, c.exerciseId)]);
  if (!d || !a) return { ...none, panel: GONE };
  const head = windowHeader(d, c);
  const addenda = addendaHeader(a, c);
  return {
    actions: (
      <>
        {head.actions}
        {addenda.actions}
      </>
    ),
    notes: [...head.notes, ...addenda.notes],
    cancel: head.cancel,
    panel: (
      <div className="flex flex-col gap-6">
        <WindowSection d={d} c={c} />
        <AddendaSection d={a} c={c} />
      </div>
    ),
  };
}

/**
 * The Sales and briefing section of Bids and opening: the sale register and the suppliers' requests, then each briefing or site visit with
 * who attended. Scheduling a briefing is on Scope and estimate, where the notice that states it is prepared.
 */
export async function loadSalesAndBriefing(scope: Reader, c: WindowContext): Promise<InvitationView> {
  if (invitationStage(c.status, c.noPack) !== "live") return { ...none, panel: <NotYet c={c} what="The sale of the documents" /> };
  const [sales, briefing] = await Promise.all([saleRegister(scope.organisationId, c.exerciseId), briefingTab(scope.organisationId, c.exerciseId)]);
  if (!sales || !briefing) return { ...none, panel: GONE };
  const head = saleHeader(sales, c);
  return {
    ...head,
    cancel: null,
    panel: (
      <div className="flex flex-col gap-6">
        <SaleSection d={sales} c={c} />
        <BriefingSection d={briefing} c={c} />
      </div>
    ),
  };
}
