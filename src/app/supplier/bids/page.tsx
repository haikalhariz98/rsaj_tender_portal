import type { Metadata } from "next";

import { GlobeIcon, InboxIcon } from "@/components/icons";
import { Tabs } from "@/components/tabs";
import { PageHeader } from "@/components/ui/page-header";
import { isBidsListTab, type BidsListTab } from "@/lib/portal/bids/types";

import { requireSupplier } from "../../_auth/supplier";
import { ExercisesPanel, NoticesPanel } from "./panels";

export const metadata: Metadata = { title: "My Bids" };
export const dynamic = "force-dynamic";

/**
 * The signed-in supplier's own part in the exercises it follows (Phase 4d): the exercises it takes part in, and the notices it is shown. Its sign-ups, acknowledgements, requests for the documents and inspections are
 * its own and nobody else's: the supplier is the SESSION's and nothing in the address names one. Bids themselves are handed in on paper; this portal does not take them, and shows only how far an exercise has got.
 */
export default async function SupplierBidsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const actor = await requireSupplier();
  const { tab: asked } = await searchParams;
  const tab: BidsListTab = isBidsListTab(asked) ? asked : "exercises";
  const tabs = [
    { id: "exercises", label: "Exercises", icon: <GlobeIcon size={15} />, lazy: true, panel: tab === "exercises" ? <ExercisesPanel actor={actor} /> : null },
    { id: "notices", label: "Notices", icon: <InboxIcon size={15} />, lazy: true, panel: tab === "notices" ? <NoticesPanel actor={actor} /> : null },
  ];
  return (
    <>
      <PageHeader title="My Bids" subtitle={actor.supplierName} meta={[actor.displayName]} />
      <Tabs initial={tab} label="My Bids" tabs={tabs} />
    </>
  );
}
