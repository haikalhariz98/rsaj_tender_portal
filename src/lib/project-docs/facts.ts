/**
 * A Project workspace document as the rules read it, read from the database (ADR 0042 D1; plan step 4 §5.1): the one reader of `DocumentFacts`. The acts call it
 * under the document's lock; the register and the page call it with no lock, for a read. Not pure, and it writes nothing.
 */

import type { Tx } from "@/lib/audit/record";
import { storedDay } from "@/lib/dates";

import type { DocumentFacts } from "./types";

const SELECT = {
  id: true,
  side: true,
  kind: true,
  versions: { select: { id: true, number: true, uploadedByPersonId: true, uploadedBySupplierAccountId: true, noApproversAtUpload: true, requestId: true, uploadedOn: true }, orderBy: { number: "asc" as const } },
  approvers: { select: { id: true, personId: true, removedAt: true }, orderBy: [{ addedAt: "asc" as const }, { id: "asc" as const }] },
  requests: { select: { id: true, toSide: true, answeredBy: { select: { id: true } } }, orderBy: [{ requestedAt: "asc" as const }, { id: "asc" as const }] },
};

/// Several documents' facts, in two reads (the register's page). A document that is not there is missing from the map.
export async function loadDocumentFactsMany(tx: Tx, documentIds: readonly string[]): Promise<Map<string, DocumentFacts>> {
  const out = new Map<string, DocumentFacts>();
  if (documentIds.length === 0) return out;
  const docs = await tx.projectDocument.findMany({ where: { id: { in: [...documentIds] } }, select: SELECT });
  const decisions = await tx.projectDocumentDecision.findMany({
    where: { version: { documentId: { in: [...documentIds] } } },
    select: { versionId: true, approverId: true, outcome: true, remarks: true, version: { select: { documentId: true } } },
    orderBy: [{ decidedAt: "asc" }, { id: "asc" }],
  });
  for (const d of docs) {
    out.set(d.id, {
      side: d.side,
      kind: d.kind,
      versions: d.versions.map((v) => ({ id: v.id, number: v.number, uploaderPersonId: v.uploadedByPersonId, uploaderAccountId: v.uploadedBySupplierAccountId, noApproversAtUpload: v.noApproversAtUpload, requestId: v.requestId, uploadedOn: storedDay(v.uploadedOn) })),
      approvers: d.approvers.map((a) => ({ id: a.id, personId: a.personId, removed: a.removedAt !== null })),
      decisions: decisions.filter((x) => x.version.documentId === d.id).map((x) => ({ versionId: x.versionId, approverId: x.approverId, outcome: x.outcome, remarks: x.remarks })),
      requests: d.requests.map((r) => ({ id: r.id, toSide: r.toSide, answered: r.answeredBy !== null })),
    });
  }
  return out;
}

/// One document's facts. Under the document's lock when an act calls it. Throws where the document is not there.
export async function loadDocumentFacts(tx: Tx, documentId: string): Promise<DocumentFacts> {
  const facts = (await loadDocumentFactsMany(tx, [documentId])).get(documentId);
  if (!facts) throw new Error(`Project document ${documentId} not found`);
  return facts;
}
