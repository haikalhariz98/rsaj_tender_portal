import Link from "next/link";
import { notFound } from "next/navigation";

import { CalendarIcon, CheckIcon, ClipboardIcon, FileIcon, InboxIcon, WalletIcon } from "@/components/icons";
import { RecordCrumb } from "@/components/shell/record-crumb";
import { Tabs } from "@/components/tabs";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { issueFormToken } from "@/lib/auth/form-secret";
import { CONTRACT_STATUS_WORDS } from "@/lib/contract/labels";
import { db } from "@/lib/db";
import { loadProjectContext } from "@/lib/portal/projects/context-store";
import { isProjectTab, type ProjectTab } from "@/lib/portal/projects/types";

import { requireSupplier } from "../../../_auth/supplier";
import { CertificatesPanel, DiaryPanel, OverviewPanel, PaymentsPanel, ProgrammePanel, SubmissionsPanel } from "./panels";

export const dynamic = "force-dynamic";

/**
 * One contract as the signed-in contractor holds it (Phase 4e): where it stands, the programme and progress, the site diary to attest, the certificates certified against what was paid, the
 * certificates to sign or dispute, and the submissions sent to the office. The supplier is the SESSION's; the id in the address is a contract's, and the page answers "not found" for one that
 * does not exist, is another organisation's or is another contractor's, all alike. One tab is read at a time, and only its own slice.
 */
export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; page?: string }> }) {
  const actor = await requireSupplier();
  const { id } = await params;
  const { tab: asked, page } = await searchParams;
  const ctx = await loadProjectContext(db, actor, id);
  if (!ctx) notFound();
  const tab: ProjectTab = isProjectTab(asked) ? asked : "overview";
  const acting = tab === "diary" || tab === "certificates" || tab === "submissions" || tab === "payments" || tab === "programme";
  const token = acting ? issueFormToken("projects") : null;
  const status = CONTRACT_STATUS_WORDS[ctx.contract.status].en;

  const tabs = [
    { id: "overview", label: "Overview", icon: <ClipboardIcon size={15} />, lazy: true, panel: tab === "overview" ? <OverviewPanel actor={actor} ctx={ctx} /> : null },
    { id: "programme", label: "Programme", icon: <CalendarIcon size={15} />, lazy: true, panel: tab === "programme" ? <ProgrammePanel actor={actor} ctx={ctx} token={token} /> : null },
    { id: "diary", label: "Site diary", icon: <FileIcon size={15} />, lazy: true, panel: tab === "diary" ? <DiaryPanel actor={actor} ctx={ctx} token={token} page={page} /> : null },
    { id: "payments", label: "Payments", icon: <WalletIcon size={15} />, lazy: true, panel: tab === "payments" ? <PaymentsPanel actor={actor} ctx={ctx} token={token} /> : null },
    { id: "certificates", label: "Certificates", icon: <CheckIcon size={15} />, lazy: true, panel: tab === "certificates" ? <CertificatesPanel actor={actor} ctx={ctx} token={token} /> : null },
    { id: "submissions", label: "Submissions", icon: <InboxIcon size={15} />, lazy: true, panel: tab === "submissions" ? <SubmissionsPanel actor={actor} ctx={ctx} token={token} /> : null },
  ];

  return (
    <>
      <RecordCrumb label={`Contract ${ctx.contract.number}`} />
      <PageHeader
        eyebrow={<Link href="/supplier/projects">My Projects</Link>}
        title={ctx.contract.title}
        badge={<Badge tone={ctx.contract.status === "ACTIVE" ? "ok" : ctx.contract.status === "CANCELLED" || ctx.contract.status === "TERMINATED" ? "err" : "neutral"}>{status}</Badge>}
        subtitle={`Contract ${ctx.contract.number} · ${ctx.contract.reference} · ${actor.supplierName}`}
        meta={[actor.displayName]}
      />
      {acting && !token && (
        <Callout tone="warn" title="Sending is closed" className="mb-5">
          The form key is not set. Tell the portal operator.
        </Callout>
      )}
      <Tabs initial={tab} label="Contract" tabs={tabs} />
    </>
  );
}
