import { diffFields } from "@/lib/audit/diff";
import { writeAudit, type Tx } from "@/lib/audit/record";
import type { SupplierActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { storeUpload, UploadRefusal, type DocumentOrg } from "@/lib/documents/service";
import type { BlobStore } from "@/lib/documents/store";
import type { Finding } from "@/lib/documents/types";

import { DraftRefused, ensureCreditorDraft, lockOpenDraft, touchDraft } from "./draft-store";
import { uploadFault, uploadSettingFault, type UploadKind, type UploadPolicy, type UploadStore, type UploadUsage } from "./upload";

/**
 * A signed-in supplier's upload, stored (Phase 4b; ruling 2 of the CPD registration rulings). One transaction does all of it: the supplier row and the draft row locked, the quota judged on
 * the locked rows (two uploads that arrive together cannot both pass it), the bytes, the document in the class the organisation chose, the version recorded by the supplier's own account,
 * its attachment to the draft's document (or to the creditor profile's statement), the draft's version raised, and the audit rows. A refusal anywhere rolls the whole upload back.
 *
 * The file is never named by the supplier: it is attached to a row of the supplier's own draft, found under its lock, and a row that is not on the supplier's own draft is not found. The
 * reply is the same whether or not the organisation already holds the same bytes (threat model C-6): the document and the version are always new.
 */

export type UploadTarget = { kind: "document"; documentId: string | null; typeId: string | null; title: string } | { kind: "statement" };

export interface SupplierUploadInput {
  /// What the page last saw of the draft; a stale page's upload is refused.
  version: number;
  target: UploadTarget;
  bytes: Uint8Array;
  sha256: string;
  mediaType: string;
  originalFilename: string;
  org: DocumentOrg;
  store: BlobStore;
  /// The smaller of the organisation's size and the deployment's ceiling, and the types it takes.
  storeSettings: UploadStore;
  /// What `SupplierPolicy` says of this kind of upload.
  policy: UploadPolicy;
}

export interface SupplierUploadResult {
  versionId: string;
  rowId: string | null;
  /// What the file is called on the page.
  label: string;
  byteSize: string;
  scanState: "NOT_SCANNED";
  version: number;
}

/// Every version uploaded under this registration, withdrawn or detached ones included: bytes are never deleted (ADR 0011), so they all count against the quota.
export async function uploadUsage(tx: Tx, organisationId: string, supplierId: string, draftId: string): Promise<UploadUsage> {
  const rows = await tx.documentAttachment.findMany({
    where: { organisationId, OR: [{ registrationDraftDocument: { draftId } }, { creditorProfile: { supplierId } }] },
    select: { versionId: true, version: { select: { byteSize: true } } },
  });
  const seen = new Map(rows.map((r) => [r.versionId, r.version.byteSize]));
  return { files: seen.size, bytes: [...seen.values()].reduce((a, b) => a + b, 0n) };
}

export async function storeSupplierUpload(actor: SupplierActor, i: SupplierUploadInput, now: Date = new Date()): Promise<SupplierUploadResult> {
  const kind: UploadKind = i.target.kind;
  const sniffed = { size: BigInt(i.bytes.byteLength), sniffedType: i.mediaType };
  let rowId: string | null = null;
  let draftVersion = 0;
  let label = i.originalFilename;
  {
    const stored = await storeUpload(
      { kind: "SUPPLIER", supplierAccountId: actor.accountId, sessionId: actor.sessionId, sourceAddress: actor.sourceAddress },
      {
        org: i.org,
        store: i.store,
        bytes: i.bytes,
        sha256: i.sha256,
        mediaType: i.mediaType,
        originalFilename: i.originalFilename,
        // The title the document is filed under. A certificate is filed under what it is; the supplier's own words are the row's title, never the document's.
        title: kind === "statement" ? "Bank statement" : "Certificate uploaded by the supplier",
        documentClassId: i.policy.classId,
        documentId: null,
        recordedByPersonId: null,
        recordedBySupplierAccountId: actor.accountId,
        receivedOn: null,
        note: "",
        hooks: {
          before: async (tx) => {
            const locked = await lockOpenDraft(tx, actor, i.version, now);
            // The class a statement takes must be SULIT now, on the row: it may have been changed since the settings were read.
            if (kind === "statement") {
              const cls = i.policy.classId ? await tx.documentClass.findFirst({ where: { id: i.policy.classId, organisationId: actor.organisationId }, select: { classification: true } }) : null;
              const unset = uploadSettingFault(i.storeSettings, { ...i.policy, classIsSulit: cls?.classification === "SULIT" }, kind);
              if (unset) throw new UploadRefusal(unset as Finding, 422);
            }
            // The quota, on the locked rows: the only judgement that counts.
            const usage = await uploadUsage(tx, actor.organisationId, actor.supplierId, locked.draft.id);
            const fault = uploadFault(sniffed, i.storeSettings, i.policy, usage, kind);
            if (fault) throw new UploadRefusal(fault as Finding, fault.code === "TOO_LARGE" ? 413 : 422);
            if (i.target.kind === "document") {
              const t = i.target;
              let row = t.documentId ? await tx.registrationDraftDocument.findFirst({ where: { id: t.documentId, draftId: locked.draft.id, organisationId: actor.organisationId, removedAt: null }, select: { id: true, type: { select: { nameEn: true } }, title: true } }) : null;
              if (t.documentId && !row) throw new DraftRefused("NOT_FOUND");
              if (!row) {
                if (!t.typeId) throw new DraftRefused("INVALID");
                const type = await tx.supplierDocumentType.findFirst({ where: { id: t.typeId, organisationId: actor.organisationId }, select: { id: true, nameEn: true, retiredOn: true } });
                if (!type || (type.retiredOn != null && type.retiredOn <= now)) throw new DraftRefused("INVALID");
                const made = await tx.registrationDraftDocument.create({ data: { organisationId: actor.organisationId, draftId: locked.draft.id, typeId: type.id, title: t.title.trim().slice(0, 120) } });
                row = { id: made.id, type: { nameEn: type.nameEn }, title: made.title };
                await writeAudit(tx, { actor: { kind: "SUPPLIER", supplierAccountId: actor.accountId, sessionId: actor.sessionId, sourceAddress: actor.sourceAddress }, organisationId: actor.organisationId, entity: "RegistrationDraftDocument", entityId: made.id, entityLabel: `${locked.supplier.reference} · Registration draft` }, "CREATE", diffFields(null, { document: type.nameEn, title: made.title || null }));
              }
              rowId = row.id;
              label = row.title ? `${row.type.nameEn} · ${row.title}` : row.type.nameEn;
            } else {
              const profile = await ensureCreditorDraft(tx, actor, locked.supplier.id);
              rowId = profile.row.id;
              label = "Bank statement";
            }
          },
          after: async (tx, created) => {
            await tx.documentAttachment.create({
              data: {
                organisationId: actor.organisationId,
                purpose: kind === "statement" ? "SUPPLIER_BANK_STATEMENT" : "SUPPLIER_DRAFT_DOCUMENT",
                versionId: created.versionId,
                ...(kind === "statement" ? { creditorProfileId: rowId! } : { registrationDraftDocumentId: rowId! }),
              },
            });
            const draft = await tx.registrationDraft.findFirstOrThrow({ where: { supplierId: actor.supplierId, organisationId: actor.organisationId }, select: { id: true } });
            draftVersion = await touchDraft(tx, actor, draft.id, now);
          },
        },
      },
    );
    return { versionId: stored.versionId, rowId, label, byteSize: stored.byteSize, scanState: "NOT_SCANNED", version: draftVersion };
  }
}

/// Detach one of the supplier's own files from its draft, with the reason it is given here (the bytes are kept). A file that is not on this supplier's own draft is not found.
export async function withdrawDraftFile(actor: SupplierActor, req: { version: number; versionId: string }, now: Date = new Date()): Promise<{ version: number }> {
  return db.$transaction(
    async (tx) => {
      const locked = await lockOpenDraft(tx, actor, req.version, now);
      const a = await tx.documentAttachment.findFirst({
        where: {
          organisationId: actor.organisationId,
          versionId: req.versionId,
          detachedAt: null,
          OR: [{ purpose: "SUPPLIER_DRAFT_DOCUMENT", registrationDraftDocument: { draftId: locked.draft.id } }, { purpose: "SUPPLIER_BANK_STATEMENT", creditorProfile: { supplierId: actor.supplierId, submittedAt: null } }],
        },
        select: { id: true, purpose: true, version: { select: { originalFilename: true } } },
      });
      if (!a) throw new DraftRefused("NOT_FOUND");
      await tx.documentAttachment.update({ where: { id: a.id }, data: { detachedAt: now, detachReason: "Withdrawn by the supplier before sending its registration" } });
      await writeAudit(tx, { actor: { kind: "SUPPLIER", supplierAccountId: actor.accountId, sessionId: actor.sessionId, sourceAddress: actor.sourceAddress }, organisationId: actor.organisationId, entity: "DocumentAttachment", entityId: a.id, entityLabel: `${locked.supplier.reference} · ${a.purpose === "SUPPLIER_BANK_STATEMENT" ? "Bank statement" : "Registration draft"}` }, "UPDATE", [{ field: "file", before: a.version.originalFilename, after: "withdrawn by the supplier" }]);
      return { version: await touchDraft(tx, actor, locked.draft.id, now) };
    },
    { timeout: 20_000, maxWait: 10_000 },
  );
}
