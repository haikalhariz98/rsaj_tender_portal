/**
 * The contractor's acts on a Project workspace document (plan step 5, §6): create, a new version, a request. Each is the step-4 core (`store.ts`) run with a SUPPLIER actor inside
 * the contract the session's supplier holds (`inHeldContract`), which locks the contract (the canonical order) and answers "not found" for any contract that is not its own.
 *
 * What the portal adds to the cores, which do not check it (carry-forward from step 4):
 * - the act × status row, `actStatusFault("PROJECT_WORKSPACE", status)`, said in the contract's own words;
 * - for a document that is named, that the contractor may open it at all (PW-28): one it did not ask for, with no version it may see, is NOT FOUND to every act, exactly as its
 *   page and its file are, so no act can be used to learn that it exists;
 * - the refusal in the contractor's words (`contractor-view.ts`): never the approvers' working, never a screen only staff have.
 *
 * A supplier actor passes `act: null` (a portal act has no staff attribution; the supplier is named by the session on the audit row). A statutory declaration's version is the
 * one exception: the route asked the password again, and its moment (`stepUpAt`) is handed to the core, which writes the version's signed attribution (plan step 6). A refusal of
 * that attribution (a stale or spent password entry) is answered 403, in its own words, as the earlier send route answered it.
 */

import { AttributionRefused } from "@/lib/auth/attribution-store";
import type { SupplierActor } from "@/lib/auth/types";
import { actStatusFault, actStatusText } from "@/lib/contract/act-status";
import type { ContractStatus } from "@/lib/contract/types";
import { db } from "@/lib/db";
import { inHeldContract } from "@/lib/portal/projects/submission-store";
import { ProjectRefused } from "@/lib/portal/projects/types";
import { projectFaultViews } from "@/lib/portal/projects/words";

import { contractorFaultText, contractorRefusalText } from "./contractor-view";
import { loadDocumentFacts } from "./facts";
import type { CreateBody, RequestBody, VersionBody } from "./portal-api";
import { NOT_FOUND_OUTCOME, type PortalOutcome } from "./portal-upload";
import { addVersion, createDocument, requestDocument, WorkspaceRefused, type WorkspaceCtx } from "./store";
import { contractorMayOpen } from "./visibility";

/// The same 404 for every way a contractor can fail to reach a contract or a document: not its own, not there, another organisation's, not listed to it.
const notFound = (): never => {
  throw new WorkspaceRefused([{ code: "NOT_FOUND", level: "block" }], 404);
};

/**
 * Run `fn` as the contractor: in the held contract, the workspace open, and (for a named document) the document one it may open. A refusal comes back as the answer to send.
 */
async function asContractor(actor: SupplierActor, contractId: string, documentId: string | null, fn: (ctx: WorkspaceCtx) => Promise<Record<string, unknown>>): Promise<PortalOutcome> {
  try {
    const done = await inHeldContract(actor, contractId, async (tx, l, today) => {
      const shut = actStatusFault("PROJECT_WORKSPACE", l.contract.status as ContractStatus);
      if (shut) throw new WorkspaceRefused([{ code: shut.code, level: "block" }], 422, actStatusText(shut));
      if (documentId !== null) {
        // The contract is locked, and every act of the workspace holds it, so these facts cannot change before the core reads them again under the document's own lock.
        const doc = await tx.projectDocument.findFirst({ where: { id: documentId, contractId: l.contract.id, organisationId: l.org.id }, select: { id: true } });
        if (!doc) return notFound();
        if (!contractorMayOpen(await loadDocumentFacts(tx, doc.id))) return notFound();
      }
      return fn({ tx, l, now: new Date(), today });
    });
    return { status: 201, body: { ok: true, ...done } };
  } catch (e) {
    const refused = await refusalOutcome(e, actor.organisationId);
    if (refused) return refused;
    throw e;
  }
}

/// A refusal of a contractor's act as the answer to send, or null where the error is not one of the workspace's.
export async function refusalOutcome(e: unknown, organisationId: string): Promise<PortalOutcome | null> {
  if (e instanceof WorkspaceRefused) {
    if (e.status === 404) return NOT_FOUND_OUTCOME();
    const org = await db.organisation.findUnique({ where: { id: organisationId }, select: { name: true } });
    const name = org?.name ?? "the organisation";
    const message = contractorRefusalText(e, name);
    return { status: e.status, body: { ok: false, code: e.status === 409 ? "CHANGED" : "VALIDATION", message, faults: e.faults.filter((f) => f.level === "block").map((f) => ({ message: contractorFaultText(f, name) })) } };
  }
  if (e instanceof AttributionRefused) return { status: 403, body: { ok: false, code: "SIGNATURE_REFUSED", message: e.faults.map((f) => f.en).join(" ") } };
  if (e instanceof ProjectRefused) {
    if (e.status === 404) return NOT_FOUND_OUTCOME();
    const faults = projectFaultViews(e.faults);
    const message = faults.find((f) => f.level === "block")?.message ?? "That cannot be done.";
    return { status: e.status, body: { ok: false, code: e.status === 409 ? "CHANGED" : e.status === 429 ? "THROTTLED" : "VALIDATION", message, faults } };
  }
  return null;
}

/// A document with its first version (the staged files, and optionally one of the six kinds) or its first request. No approver: a contractor names none (PW-6). `stepUpAt`: when
/// the password was asked again, for a statutory declaration; null otherwise.
export function contractorCreate(actor: SupplierActor, i: CreateBody, stepUpAt: Date | null = null): Promise<PortalOutcome> {
  return asContractor(actor, i.contractId, null, async (ctx) => {
    const made = await createDocument(ctx, { kind: "SUPPLIER", actor }, { title: i.title, note: i.note, first: i.first, approverPersonIds: [], kind: i.kind, stepUpAt }, null);
    return { documentId: made.documentId, versionId: made.versionId };
  });
}

/// A new version of a document the contractor may open, from the staged files; the first version of one the organisation asked for may pick one of the six kinds. `stepUpAt`:
/// when the password was asked again (a statutory declaration's every version is signed); null where none was posted.
export function contractorVersion(actor: SupplierActor, i: VersionBody, stepUpAt: Date | null = null): Promise<PortalOutcome> {
  return asContractor(actor, i.contractId, i.documentId, async (ctx) => {
    const made = await addVersion(ctx, { kind: "SUPPLIER", actor }, { documentId: i.documentId, stagedVersionIds: i.stagedVersionIds, note: i.note, kind: i.kind, stepUpAt }, null);
    return { documentId: i.documentId, versionId: made.versionId, number: made.number };
  });
}

/// A request for a document the contractor may open (PW-30: to the document's side, only while it is Shared).
export function contractorRequest(actor: SupplierActor, i: RequestBody): Promise<PortalOutcome> {
  return asContractor(actor, i.contractId, i.documentId, async (ctx) => {
    const made = await requestDocument(ctx, { kind: "SUPPLIER", actor }, { documentId: i.documentId, note: i.note }, null);
    return { documentId: i.documentId, requestId: made.requestId };
  });
}
