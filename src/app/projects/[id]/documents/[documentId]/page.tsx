import { notFound } from "next/navigation";

import { requireStaff } from "@/app/_auth/actor";
import { loadCase } from "@/app/_auth/case";
import { RecordCrumb } from "@/components/shell/record-crumb";
import { loadContract } from "@/lib/contract/repo";
import { db } from "@/lib/db";
import { loadDocumentPage } from "@/lib/project-docs/page-store";

import { DocumentPageView } from "./document-view";

export const metadata = { title: "Document" };

export const dynamic = "force-dynamic";

/**
 * One Project workspace document (ADR 0042, plan step 4 §5.3). Reading follows `caseVisibility`: a case the reader may not see is a 404 (`loadCase`, which answers first), as is a
 * document that is not on this contract. A reader with no authority to act reads the whole document; the loader's gates say why each act is blocked.
 */
export default async function ProjectDocumentPage(props: PageProps<"/projects/[id]/documents/[documentId]">) {
  const actor = await requireStaff();
  const { id, documentId } = await props.params;
  const loaded = await loadCase(actor, id);
  if (loaded.kind !== "CONTRACT") notFound();
  const l = await loadContract(actor.organisationId, loaded.contractId);
  if (!l) notFound();
  const page = await loadDocumentPage(db, l, actor, documentId);
  if (!page) notFound();
  return (
    <>
      <RecordCrumb label={page.title} parent={l.contract.number} />
      <DocumentPageView page={page} />
    </>
  );
}
