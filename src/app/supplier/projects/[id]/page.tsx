import { notFound } from "next/navigation";

import { CalendarIcon, CheckIcon, ClipboardIcon, FileIcon, InboxIcon, ToolsIcon, WalletIcon } from "@/components/icons";
import { RecordCrumb } from "@/components/shell/record-crumb";
import { Tabs } from "@/components/tabs";
import { Badge } from "@/components/ui/badge";
import { Blocked } from "@/components/ui/blocked";
import { Callout } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { issueFormToken } from "@/lib/auth/form-secret";
import { CONTRACT_STATUS_WORDS } from "@/lib/contract/labels";
import { db } from "@/lib/db";
import { loadProjectContext } from "@/lib/portal/projects/context-store";
import { isProjectTab, type ProjectTab } from "@/lib/portal/projects/types";
import { SEVERITY_WORDS } from "@/lib/work/labels";
import { loadPortalItem, loadPortalWork } from "@/lib/work/portal-read";

import { requireSupplier } from "../../../_auth/supplier";
import { RaiseDrawer } from "./work-drawers";
import { WORK_NOT_NOW, WorkPanel } from "./work-panel";
import { CertificatesPanel, DefectsPanel, DiaryPanel, OverviewPanel, PaymentsPanel, portalCompletion, ProgrammePanel, SubmissionsPanel } from "./panels";

export const dynamic = "force-dynamic";

export const metadata = { title: "Your contract" };

/**
 * One contract as the signed-in contractor holds it (Phase 4e): where it stands, the programme and progress, the site diary to attest, the certificates certified against what was paid, the
 * certificates to sign or dispute, and the documents sent to the office. The supplier is the SESSION's; the id in the address is a contract's, and the page answers "not found" for one that
 * does not exist, is another organisation's or is another contractor's, all alike. One tab is read at a time, and only its own slice.
 */
export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; page?: string; docsAfter?: string; earlier?: string; item?: string; closed?: string; workPage?: string }> }) {
  const actor = await requireSupplier();
  const { id } = await params;
  const { tab: asked, page, docsAfter, earlier, item: wanted, closed, workPage } = await searchParams;
  const ctx = await loadProjectContext(db, actor, id);
  if (!ctx) notFound();
  const tab: ProjectTab = isProjectTab(asked) ? asked : "overview";
  // Phase 2 close-out stage B: the Defects tab shows once the practical completion certificate is issued.
  const completed = (await portalCompletion(ctx)).issued;
  const acting = tab === "work" || tab === "diary" || tab === "certificates" || tab === "submissions" || tab === "defects";
  const token = acting || tab === "overview" ? issueFormToken("projects") : null;
  // The Work tab reads only its own slice: the three groups and, when the address names one, that item.
  const workPageNo = Math.max(0, Number.parseInt(workPage ?? "0", 10) || 0);
  const work = tab === "work" ? await loadPortalWork(actor, id, new Date(), workPageNo) : null;
  const workItem = work && wanted ? await loadPortalItem(actor, id, wanted) : null;
  const status = CONTRACT_STATUS_WORDS[ctx.contract.status].en;

  const tabs = [
    { id: "overview", label: "Overview", icon: <ClipboardIcon size={15} />, lazy: true, panel: tab === "overview" ? <OverviewPanel actor={actor} ctx={ctx} token={token} /> : null },
    { id: "work", label: "Work", icon: <ToolsIcon size={15} />, lazy: true, panel: tab === "work" && work ? <WorkPanel contractId={id} work={work} closed={closed === "1"} workPage={workPageNo} wanted={wanted || null} item={workItem} token={token} /> : null },
    { id: "programme", label: "Programme", icon: <CalendarIcon size={15} />, lazy: true, panel: tab === "programme" ? <ProgrammePanel actor={actor} ctx={ctx} /> : null },
    { id: "diary", label: "Site diary", icon: <FileIcon size={15} />, lazy: true, panel: tab === "diary" ? <DiaryPanel actor={actor} ctx={ctx} token={token} page={page} /> : null },
    { id: "payments", label: "Payments", icon: <WalletIcon size={15} />, lazy: true, panel: tab === "payments" ? <PaymentsPanel actor={actor} ctx={ctx} /> : null },
    { id: "certificates", label: "Certificates", icon: <CheckIcon size={15} />, lazy: true, panel: tab === "certificates" ? <CertificatesPanel actor={actor} ctx={ctx} token={token} /> : null },
    { id: "submissions", label: "Documents", icon: <InboxIcon size={15} />, lazy: true, panel: tab === "submissions" ? <SubmissionsPanel actor={actor} ctx={ctx} token={token} docsAfter={docsAfter || null} earlier={earlier || null} /> : null },
    ...(completed ? [{ id: "defects", label: "Defects", icon: <ClipboardIcon size={15} />, lazy: true, panel: tab === "defects" ? <DefectsPanel actor={actor} ctx={ctx} token={token} /> : null }] : []),
  ];

  return (
    <>
      <RecordCrumb label={`Contract ${ctx.contract.number}`} />
      <PageHeader
        title={ctx.contract.title}
        badge={<Badge tone={ctx.contract.status === "ACTIVE" ? "ok" : ctx.contract.status === "CANCELLED" || ctx.contract.status === "TERMINATED" ? "err" : "neutral"}>{status}</Badge>}
        subtitle={`Contract ${ctx.contract.number} · ${ctx.contract.reference} · ${actor.supplierName}`}
        meta={[actor.displayName]}
        {...(work ? { actions: workActions(id, token, work.canAct), actionsNoteId: "work-note", actionsNote: work.canAct ? undefined : WORK_NOT_NOW } : {})}
      />
      {acting && !token && (
        <Callout tone="warn" title="Sending is closed" className="mb-5">
          The form key is not set. Tell the procurement office.
        </Callout>
      )}
      <Tabs initial={tab} label="Contract" tabs={tabs} />
    </>
  );
}

const SEVERITIES = Object.entries(SEVERITY_WORDS).map(([value, w]) => ({ value, label: w.en }));

/// "Ask a question" is the tab's one primary; "Report an incident" sits beside it. Where the contract or the organisation's settings shut the acts, both say so.
function workActions(contractId: string, token: string | null, canAct: boolean) {
  if (!canAct) {
    return (
      <>
        <Blocked label="Ask a question" reason={WORK_NOT_NOW} primary noteId="work-note" />
        <Blocked label="Report an incident" reason={WORK_NOT_NOW} noteId="work-note" />
      </>
    );
  }
  return (
    <>
      <RaiseDrawer contractId={contractId} token={token} kind="SAFETY_INCIDENT" severities={SEVERITIES} />
      <RaiseDrawer contractId={contractId} token={token} kind="RFI" severities={SEVERITIES} primary />
    </>
  );
}
