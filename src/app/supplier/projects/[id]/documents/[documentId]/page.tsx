import { notFound } from "next/navigation";

import { RecordCrumb } from "@/components/shell/record-crumb";
import { Callout } from "@/components/ui/feedback";
import { issueFormToken } from "@/lib/auth/form-secret";
import { db } from "@/lib/db";
import { loadProjectContext } from "@/lib/portal/projects/context-store";
import { loadPortalDocumentPage } from "@/lib/project-docs/portal-read";

import { requireSupplier } from "../../../../../_auth/supplier";
import { PortalDocumentView } from "./document-view";

export const dynamic = "force-dynamic";

/**
 * One document of a contract the signed-in contractor holds (the simple Project workspace, plan step 5). The supplier is the SESSION's; the ids in the address are a contract's and a
 * document's, and the page answers "not found" for every cause alike: no such contract, another organisation's, another contractor's, a document that is not on this contract, or an
 * organisation document the contractor may not see (PW-28). The form key is issued here, for the acts and the file links on this page.
 */
export default async function PortalDocumentPage({ params }: { params: Promise<{ id: string; documentId: string }> }) {
  const actor = await requireSupplier();
  const { id, documentId } = await params;
  const ctx = await loadProjectContext(db, actor, id);
  if (!ctx) notFound();
  const page = await loadPortalDocumentPage(db, actor, id, documentId);
  if (!page) notFound();
  const token = issueFormToken("projects");
  return (
    <>
      <RecordCrumb label={page.title} parent={ctx.contract.number} />
      {!token && (
        <Callout tone="warn" title="Sending is closed" className="mb-5">
          The form key is not set. Tell the procurement office.
        </Callout>
      )}
      <PortalDocumentView page={page} contractNumber={ctx.contract.number} token={token} />
    </>
  );
}
