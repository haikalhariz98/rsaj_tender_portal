import { Suspense } from "react";

import { ActGate } from "@/components/act-gate";
import { Note } from "@/components/ui/feedback";
import { actStatusBlocker } from "@/lib/contract/act-status";
import { contractLabel } from "@/lib/contract/repo";
import { db } from "@/lib/db";
import { assigneeOptions, contractorHasActiveAccount, linkOptions, loadWorkContext } from "@/lib/work/load";
import { parseWorkQuery, workHref } from "@/lib/work/href";
import { myWorkHref } from "@/lib/work/my-work";

import { WorkPanelShell } from "../projects/[id]/work-controls";
import { WorkItemPanel } from "../projects/[id]/work-item-panel";
import { WorkItemSkeleton } from "../projects/[id]/work-skeleton";

const NOT_THERE = "That item isn't there.";

/**
 * The same side panel as the project's Work tab, opened in place (`?contract={id}&item=RFI-12`, 0008 §5.6). It reads only that one contract's context, asked by the
 * organisation, so a contract of another organisation reads as no item, in the same words. It asks the WORK_ITEM row once and states it to every control beneath
 * (ActGate), as the Work tab does; the acts ask it again under the lock.
 */
export async function MyWorkItemPanel({ organisationId, personId, contractId, item }: { organisationId: string; personId: string; contractId: string; item: string }) {
  const loaded = await loadWorkContext({ organisationId, contractId, now: new Date() });
  if (!loaded) {
    return (
      <WorkPanelShell label="Work item" closeHref={myWorkHref(null)} title="Item not found">
        <Note>{NOT_THERE}</Note>
      </WorkPanelShell>
    );
  }
  const { context: ctx, contract: l } = loaded;
  const [people, linkOpts, noAccount] = await Promise.all([assigneeOptions({ organisationId, contractId }), linkOptions({ organisationId, contractId }), contractorHasActiveAccount(db, l).then((has) => !has)]);
  return (
    <ActGate blocker={actStatusBlocker("WORK_ITEM", ctx.contractStatus)}>
      <Suspense key={`${contractId}:${item}`} fallback={<WorkItemSkeleton />}>
        <WorkItemPanel
          l={l}
          ctx={ctx}
          hrefs={{ close: myWorkHref(null), item: (ref) => myWorkHref({ contract: contractId, item: ref }) }}
          project={{ label: contractLabel({ number: l.contract.number, award: l.award }), href: workHref(contractId, parseWorkQuery({}, [])) }}
          personId={personId}
          address={item}
          people={people}
          linkOpts={linkOpts}
          noAccount={noAccount}
        />
      </Suspense>
    </ActGate>
  );
}
