import type { Metadata } from "next";

import { BuildingIcon, FileIcon, LockIcon, ScaleIcon } from "@/components/icons";
import { Tabs } from "@/components/tabs";
import { Callout } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { issueFormToken } from "@/lib/auth/form-secret";
import { isCompanyTab, type CompanyTab } from "@/lib/portal/company/types";

import { requireSupplier } from "../../_auth/supplier";
import { EligibilityPanel } from "./eligibility-panel";
import { BankPanel, DocumentsPanel, OverviewPanel } from "./panels";

export const metadata: Metadata = { title: "Company" };
export const dynamic = "force-dynamic";

/**
 * The signed-in supplier's own company (Phase 4c): where its registration stands and its standing (Overview), its documents with their expiry bands and reminders and the office's requests
 * to answer online (Documents), its bank details and a change of them (Bank details), and the exercises it qualifies for (Eligibility). One tab is read at a time, and only its own slice.
 * The supplier is the SESSION's: nothing in the address names one.
 */
export default async function SupplierCompanyPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const actor = await requireSupplier();
  const { tab: asked } = await searchParams;
  const tab: CompanyTab = isCompanyTab(asked) ? asked : "overview";
  // One token for this workspace's two uploads, and the registration's for the code search and the downloads of its own files (the same routes the wizard uses).
  const token = tab === "documents" || tab === "bank" ? issueFormToken("company") : null;
  const searchToken = tab === "documents" || tab === "bank" ? issueFormToken("registration") : null;

  const tabs = [
    { id: "overview", label: "Overview", icon: <BuildingIcon size={15} />, lazy: true, panel: tab === "overview" ? <OverviewPanel actor={actor} /> : null },
    { id: "documents", label: "Documents", icon: <FileIcon size={15} />, lazy: true, panel: tab === "documents" ? <DocumentsPanel actor={actor} token={token} searchToken={searchToken} /> : null },
    { id: "bank", label: "Bank details", icon: <LockIcon size={15} />, lazy: true, panel: tab === "bank" ? <BankPanel actor={actor} token={token} searchToken={searchToken} /> : null },
    { id: "eligibility", label: "Eligibility", icon: <ScaleIcon size={15} />, lazy: true, panel: tab === "eligibility" ? <EligibilityPanel actor={actor} /> : null },
  ];

  return (
    <>
      <PageHeader title="Company" subtitle={actor.supplierName} meta={[actor.displayName]} />
      {(tab === "documents" || tab === "bank") && !token && (
        <Callout tone="warn" title="Sending is closed" className="mb-5">
          The form key is not set. Tell the procurement office.
        </Callout>
      )}
      <Tabs initial={tab} label="Company" tabs={tabs} />
    </>
  );
}
