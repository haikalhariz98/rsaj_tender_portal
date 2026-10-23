import Link from "next/link";
import { notFound } from "next/navigation";

import { CalendarIcon, CheckIcon, ClipboardIcon, FileIcon, InboxIcon, ShieldIcon } from "@/components/icons";
import { RecordCrumb } from "@/components/shell/record-crumb";
import { Tabs } from "@/components/tabs";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { issueFormToken } from "@/lib/auth/form-secret";
import { db } from "@/lib/db";
import { loadBidScreen } from "@/lib/bids/online/my-bids-store";
import { SCREEN_WORDS } from "@/lib/bids/online/screen-words";
import { loadBidContext } from "@/lib/portal/bids/context-store";
import { isBidTab, type BidTab } from "@/lib/portal/bids/types";
import { OPPORTUNITY_STATE } from "@/lib/portal/labels";
import { isIssuedAward, opportunityState } from "@/lib/portal/public";

import { requireSupplier } from "../../../_auth/supplier";
import { BidPanel } from "./bid-panel";
import { AddendaPanel, BriefingsPanel, DocumentsPanel, OutcomePanel, OverviewPanel } from "./panels";

export const dynamic = "force-dynamic";

export const metadata = { title: "Your bid" };

/**
 * One exercise as the signed-in supplier takes part in it (Phase 4d): where it stands, the briefings and site visits to sign up for, the addenda to acknowledge, the documents to ask for and inspect, and the
 * outcome. The supplier is the SESSION's; the id in the address is an exercise's, and the page answers "not found" for one that does not exist, is another organisation's, is confidential and not linked to this
 * supplier, or is not published, all alike. One tab is read at a time, and only its own slice.
 */
export default async function BidExercisePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const actor = await requireSupplier();
  const { id } = await params;
  const { tab: asked } = await searchParams;
  const ctx = await loadBidContext(db, actor, id);
  if (!ctx) notFound();
  // Where bids are taken online, a Your bid tab (SR-13, step 11). Where they are handed in on paper there is none, and its address reads as the overview.
  const online = await loadBidScreen(db, actor, id);
  const tab: BidTab = isBidTab(asked) && (asked !== "bid" || online?.online) ? asked : "overview";
  const token = tab === "briefings" || tab === "addenda" || tab === "documents" ? issueFormToken("bids") : null;
  const awarded = (await db.award.findMany({ where: { exerciseId: ctx.ex.id, organisationId: actor.organisationId }, select: { status: true } })).some((a) => isIssuedAward(a.status));
  const state = OPPORTUNITY_STATE[opportunityState({ status: ctx.ex.status as Parameters<typeof opportunityState>[0]["status"], closingAt: ctx.ex.closingAt }, awarded, ctx.now)];

  const tabs = [
    { id: "overview", label: "Overview", icon: <ClipboardIcon size={15} />, lazy: true, panel: tab === "overview" ? <OverviewPanel actor={actor} ctx={ctx} /> : null },
    { id: "briefings", label: "Briefings and visits", icon: <CalendarIcon size={15} />, lazy: true, panel: tab === "briefings" ? <BriefingsPanel actor={actor} ctx={ctx} token={token} /> : null },
    { id: "addenda", label: "Addenda", icon: <InboxIcon size={15} />, lazy: true, panel: tab === "addenda" ? <AddendaPanel actor={actor} ctx={ctx} token={token} /> : null },
    { id: "documents", label: "Documents", icon: <FileIcon size={15} />, lazy: true, panel: tab === "documents" ? <DocumentsPanel actor={actor} ctx={ctx} token={token} /> : null },
    ...(online?.online ? [{ id: "bid", label: SCREEN_WORDS.tab.en, icon: <ShieldIcon size={15} />, lazy: true, panel: tab === "bid" ? <BidPanel screen={online} supplierName={actor.supplierName} /> : null }] : []),
    { id: "outcome", label: "Outcome", icon: <CheckIcon size={15} />, lazy: true, panel: tab === "outcome" ? <OutcomePanel actor={actor} ctx={ctx} /> : null },
  ];

  return (
    <>
      <RecordCrumb label={ctx.ex.reference} />
      <PageHeader
        title={ctx.ex.title}
        badge={<Badge tone={state.tone ?? "neutral"}>{state.label.en}</Badge>}
        subtitle={`${ctx.ex.reference} · ${actor.supplierName}`}
        meta={ctx.seen.via === "PUBLIC" ? [<Link key="public" href={`/supplier/opportunities/${ctx.ex.id}`}>The public notice</Link>] : undefined}
      />
      {(tab === "briefings" || tab === "addenda" || tab === "documents") && !token && (
        <Callout tone="warn" title="Sending is closed" className="mb-5">
          The form key is not set. Tell the procurement office.
        </Callout>
      )}
      <Tabs initial={tab} label="Exercise" tabs={tabs} />
    </>
  );
}
