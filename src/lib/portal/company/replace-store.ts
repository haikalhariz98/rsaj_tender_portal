import { diffFields } from "@/lib/audit/diff";
import { writeAudit, type Tx } from "@/lib/audit/record";
import type { SupplierActor } from "@/lib/auth/types";
import { dayToDate, storedDay } from "@/lib/dates";
import { storeUpload, UploadRefusal, type DocumentOrg } from "@/lib/documents/service";
import type { BlobStore } from "@/lib/documents/store";
import type { Finding as StoreFinding } from "@/lib/documents/types";
import { loadRegistrationSettings, typeConfig } from "@/lib/portal/registration/context-store";
import { parseRate } from "@/lib/portal/registration/documents";
import { uploadFault, type UploadPolicy, type UploadStore, type UploadUsage } from "@/lib/portal/registration/upload";
import { lockSupplierRow } from "@/lib/suppliers/lock";
import { lapseState } from "@/lib/suppliers/review";
import type { RegistrationValueKind, SupplierStatus } from "@/lib/suppliers/types";

import { replacementFaults, type ReplacementInput } from "./documents";
import { CompanyRefused } from "./errors";
import { companyDocument, DOCUMENT_INCLUDE } from "./company-store";
import type { CompanyDocument, CompanyFinding } from "./types";

/**
 * A supplier lodges a replacement, a renewal or a first document online (Phase 4c: FR-VND-007 per-document resubmission, FR-VND-008 renewal). One transaction does all of it: the supplier row
 * locked, then the office's application where the document answers a request, then the rules judged on the locked rows (who may, what, the quota), the bytes, the supplier's document
 * (recorded by the supplier's own account, not yet checked, superseding what it renews, tied to the application and the item it answers), its codes, its file, and the audit rows. A refusal
 * anywhere rolls the whole upload back, so a document is never lodged without its file or its file stored without its document.
 *
 * A renewal waits for an officer's check and takes effect only then (FR-VND-008), so the document in force does not change here: the old one stays in force until the renewal is verified.
 * Nothing in the request names a supplier, an organisation, a day or a time: the supplier is the session's and the day is the server's. The reply is the same whether or not the organisation
 * already holds the same bytes (threat model C-6): the document and the version are always new.
 *
 * Lock order: the supplier row, the application, then the document store's rows (as the wizard's upload takes the supplier row and the draft, then the store's).
 */

export type ReplacementTarget =
  /// An item of the office's open request (the item answers it).
  | { kind: "item"; itemId: string }
  /// A document of the supplier's own, to be renewed.
  | { kind: "renew"; documentId: string }
  /// A first document of a configured type the supplier does not hold.
  | { kind: "new"; typeId: string };

export interface ReplacementUploadInput {
  target: ReplacementTarget;
  details: ReplacementInput;
  bytes: Uint8Array;
  sha256: string;
  mediaType: string;
  originalFilename: string;
  org: DocumentOrg;
  store: BlobStore;
  storeSettings: UploadStore;
  policy: UploadPolicy;
}

export interface ReplacementResult {
  documentId: string;
  versionId: string;
  /// What the document is called on the page.
  label: string;
  byteSize: string;
  scanState: "NOT_SCANNED";
  /// Faults that did not stop it (a warning).
  warnings: CompanyFinding[];
}

/// What is waiting for an officer under this supplier: every version attached to a document it lodged that nobody has checked, or to bank details nobody has checked, withdrawn ones too (bytes are never deleted, ADR 0011). The quota is about this, so it frees as the office checks.
export async function waitingUsage(tx: Tx, organisationId: string, supplierId: string): Promise<UploadUsage> {
  const rows = await tx.documentAttachment.findMany({
    where: {
      organisationId,
      OR: [{ supplierDocument: { supplierId, verification: "NOT_CHECKED", recordedBySupplierAccountId: { not: null } } }, { creditorProfile: { supplierId, verification: "NOT_CHECKED" } }],
    },
    select: { versionId: true, version: { select: { byteSize: true } } },
  });
  const seen = new Map(rows.map((r) => [r.versionId, r.version.byteSize]));
  return { files: seen.size, bytes: [...seen.values()].reduce((a, b) => a + b, 0n) };
}

export async function storeReplacement(actor: SupplierActor, i: ReplacementUploadInput, now: Date = new Date()): Promise<ReplacementResult> {
  const sniffed = { size: BigInt(i.bytes.byteLength), sniffedType: i.mediaType };
  let made: { documentId: string; label: string } | null = null;
  let warnings: CompanyFinding[] = [];
  type Plan = { typeId: string; typeName: string; renewsId: string | null; applicationId: string | null; itemId: string | null; itemLabel: string | null; supplierStatus: SupplierStatus; today: string; values: { id: string; kind: RegistrationValueKind; code: string; nameEn: string }[]; title: string };
  let plan: Plan | null = null;

  const stored = await storeUpload(
    { kind: "SUPPLIER", supplierAccountId: actor.accountId, sessionId: actor.sessionId, sourceAddress: actor.sourceAddress },
    {
      org: i.org,
      store: i.store,
      bytes: i.bytes,
      sha256: i.sha256,
      mediaType: i.mediaType,
      originalFilename: i.originalFilename,
      title: "Certificate uploaded by the supplier",
      documentClassId: i.policy.classId,
      documentId: null,
      recordedByPersonId: null,
      recordedBySupplierAccountId: actor.accountId,
      receivedOn: null,
      note: "",
      hooks: {
        before: async (tx) => {
          // The supplier row first, as every supplier-only write takes it: two replacements that arrive together are judged one after the other on what the first left.
          if (!(await lockSupplierRow(tx, actor.supplierId))) throw new CompanyRefused([{ code: "SUPPLIER_CLOSED", level: "block" }]);
          const settings = await loadRegistrationSettings(tx, actor.organisationId);
          const today = settings?.org.today ?? null;
          const supplier = await tx.supplier.findFirst({ where: { id: actor.supplierId, organisationId: actor.organisationId }, select: { status: true } });
          if (!settings || !supplier) throw new CompanyRefused([{ code: "SUPPLIER_CLOSED", level: "block" }]);
          const supplierStatus = supplier.status as SupplierStatus;

          // What the document is about: an item of the office's request (the application is locked next), a document of the supplier's own, or a type not yet held.
          let typeId: string | null = null;
          let renews: CompanyDocument | null = null;
          let askedAbout: CompanyDocument | null = null;
          let applicationId: string | null = null;
          let itemId: string | null = null;
          let itemLabel: string | null = null;
          let answering: { open: boolean; itemFound: boolean; itemWaiting: boolean; renewsIsAsked?: boolean } | null = null;
          const loadDoc = async (id: string) => {
            const row = await tx.supplierDocument.findFirst({ where: { id, supplierId: actor.supplierId, organisationId: actor.organisationId }, include: DOCUMENT_INCLUDE });
            return row ? companyDocument(row) : null;
          };
          const t = i.target;
          if (t.kind === "item") {
            const item = await tx.resubmissionItem.findFirst({
              where: { id: t.itemId, organisationId: actor.organisationId, decision: { outcome: "RESUBMIT", application: { supplierId: actor.supplierId, organisationId: actor.organisationId } } },
              select: { id: true, labelSnapshot: true, supplierDocumentId: true, documentTypeId: true, decision: { select: { id: true, applicationId: true } } },
            });
            if (!item) answering = { open: false, itemFound: false, itemWaiting: false };
            else {
              // The application is locked after the supplier row, and judged as it stands under the lock: still waiting on this supplier, this very request the latest, the day not past.
              await tx.$queryRaw`SELECT id FROM "SupplierApplication" WHERE id = ${item.decision.applicationId} AND "supplierId" = ${actor.supplierId} FOR UPDATE`;
              const app = await tx.supplierApplication.findFirst({
                where: { id: item.decision.applicationId, supplierId: actor.supplierId, organisationId: actor.organisationId },
                select: { id: true, status: true, resubmitBy: true, lapsedRecordedAt: true, decisions: { where: { outcome: "RESUBMIT" }, orderBy: { decidedAt: "desc" }, take: 1, select: { id: true } } },
              });
              const current = app?.status === "RESUBMISSION_REQUESTED" && app.lapsedRecordedAt == null && app.decisions[0]?.id === item.decision.id;
              const open = !!current && today != null && lapseState({ status: "RESUBMISSION_REQUESTED", resubmitBy: app!.resubmitBy ? storedDay(app!.resubmitBy) : null }, today) !== "LAPSED";
              const waiting = (await tx.supplierDocument.count({ where: { answersItemId: item.id, verification: "NOT_CHECKED", supplierId: actor.supplierId } })) > 0;
              answering = { open: !!current && open, itemFound: !!current, itemWaiting: waiting };
              if (current) {
                applicationId = app!.id;
                itemId = item.id;
                itemLabel = item.labelSnapshot;
                if (item.supplierDocumentId) {
                  // The item is about a document; what is renewed is the newest document of its chain, which may be an earlier answer that was found not in order.
                  const about = await loadDoc(item.supplierDocumentId);
                  typeId = about?.typeId ?? null;
                  askedAbout = about;
                } else typeId = item.documentTypeId;
              }
            }
          } else if (t.kind === "renew") {
            renews = await loadDoc(t.documentId);
            typeId = renews?.typeId ?? null;
            if (!renews) throw new CompanyRefused([{ code: "RENEWS_NOTHING", level: "block" }], 404);
          } else typeId = t.typeId;

          const typeRow = typeId ? await tx.supplierDocumentType.findFirst({ where: { id: typeId, organisationId: actor.organisationId } }) : null;
          const type = typeRow ? typeConfig(typeRow, today) : null;
          const repeatable = type?.repeatable === true;
          const ofType = typeId ? (await tx.supplierDocument.findMany({ where: { supplierId: actor.supplierId, organisationId: actor.organisationId, typeId }, include: DOCUMENT_INCLUDE })).map(companyDocument) : [];
          // A request for a type the supplier holds already (an officer asked for a fresh copy) renews the newest document of it; the chain it belongs to is the one read.
          const head = ofType.find((d) => !ofType.some((x) => x.supersedesId === d.id)) ?? null;
          if (t.kind === "item") {
            // Follow the chain from the document the item is about, or from the newest answer already sent to it (one found not in order), to its newest link.
            const earlier = [...ofType].filter((d) => d.answersItemId === itemId).sort((a, b) => b.lodgedOn.localeCompare(a.lodgedOn) || b.id.localeCompare(a.id))[0] ?? null;
            let at: CompanyDocument | null = askedAbout ?? earlier ?? (!repeatable && ofType.length === 1 ? ofType[0]! : null);
            for (let guard = 0; at && guard < 100; guard++) {
              const next: CompanyDocument | undefined = ofType.find((x) => x.supersedesId === at!.id);
              if (!next) break;
              at = next;
            }
            // A request for a kind that may be lodged several times, about no document, asks for one more under a title of its own: it renews none of those held.
            renews = at ?? (repeatable ? null : head);
            if (renews && answering) answering.renewsIsAsked = askedAbout != null && renews.id === askedAbout.id;
          }
          // The chain judged is the renewed document's own: for a kind lodged several times, the documents of its title.
          const sameTitle = (d: CompanyDocument, title: string) => d.title.trim().toLowerCase() === title.trim().toLowerCase();
          const chain = renews ? (repeatable ? ofType.filter((d) => sameTitle(d, renews!.title)) : ofType) : t.kind === "new" ? ofType : [];
          const heldTitles = ofType.map((d) => d.title);

          const valueRows = i.details.valueIds.length ? await tx.registrationValue.findMany({ where: { organisationId: actor.organisationId, id: { in: [...i.details.valueIds] } }, select: { id: true, bodyId: true, kind: true, code: true, nameEn: true, retiredOn: true } }) : [];
          const values = valueRows.map((v) => ({ id: v.id, bodyId: v.bodyId, kind: v.kind as RegistrationValueKind, code: v.code, nameEn: v.nameEn, retired: v.retiredOn != null && today != null && storedDay(v.retiredOn) <= today }));

          const faults = replacementFaults(i.details, { today, supplierStatus, type, chain, renews, heldTitles, answering, values, files: 1 });
          // The quota, on the locked rows: the only judgement that counts. Faults of the document come first, so a supplier is told what to put right before what the office's limits are.
          const blocking = faults.filter((f) => f.level === "block");
          if (blocking.length > 0) throw new CompanyRefused(faults);
          // An answer to the office's own request is not held against what is waiting for the office already (the documents sent with the registration, the bank details): the office's unfinished
          // checking cannot be what stops an applicant answering the office by its date. It is bounded by the items asked for, each of which takes one answer at a time. The file's size and type still count.
          const usage = answering ? { files: 0, bytes: 0n } : await waitingUsage(tx, actor.organisationId, actor.supplierId);
          const refused = uploadFault(sniffed, i.storeSettings, i.policy, usage, "document");
          if (refused) throw new UploadRefusal(refused as unknown as StoreFinding, refused.code === "TOO_LARGE" ? 413 : 422);

          warnings = faults.filter((f) => f.level !== "block");
          plan = {
            typeId: typeId!,
            typeName: type!.nameEn,
            renewsId: renews?.id ?? null,
            applicationId,
            itemId,
            itemLabel,
            supplierStatus,
            today: today!,
            values: valueRows.map((v) => ({ id: v.id, kind: v.kind as RegistrationValueKind, code: v.code, nameEn: v.nameEn })),
            title: type!.repeatable === true ? (renews?.title ?? i.details.title.trim()) : "",
          };
        },
        after: async (tx, created) => {
          const p = plan!;
          const d = i.details;
          const rate = d.ratePercent.trim() ? parseRate(d.ratePercent) : null;
          const expiresOn = d.expiresOn.trim() ? d.expiresOn : null;
          const doc = await tx.supplierDocument.create({
            data: {
              organisationId: actor.organisationId,
              supplierId: actor.supplierId,
              typeId: p.typeId,
              typeLabelSnapshot: p.typeName,
              applicationId: p.applicationId,
              reference: d.reference.trim(),
              issuingAuthority: d.issuingAuthority.trim(),
              title: p.title,
              expiresOn: expiresOn ? dayToDate(expiresOn) : null,
              ratePercent: rate,
              supersedesId: p.renewsId,
              answersItemId: p.itemId,
              lodgedOn: dayToDate(p.today),
              recordedAt: now,
              recordedByPersonId: null,
              recordedBySupplierAccountId: actor.accountId,
              ...(p.values.length ? { values: { create: p.values.map((v) => ({ organisationId: actor.organisationId, registrationValueId: v.id, kind: v.kind, codeSnapshot: v.code, labelSnapshot: v.nameEn })) } } : {}),
            },
          });
          await tx.documentAttachment.create({ data: { organisationId: actor.organisationId, purpose: "SUPPLIER_DOCUMENT", versionId: created.versionId, supplierDocumentId: doc.id } });
          const supplier = await tx.supplier.findFirstOrThrow({ where: { id: actor.supplierId, organisationId: actor.organisationId }, select: { reference: true } });
          const name = p.title ? `${p.typeName} · ${p.title}` : p.typeName;
          made = { documentId: doc.id, label: name };
          await writeAudit(
            tx,
            { actor: { kind: "SUPPLIER", supplierAccountId: actor.accountId, sessionId: actor.sessionId, sourceAddress: actor.sourceAddress }, organisationId: actor.organisationId, entity: "SupplierDocument", entityId: doc.id, entityLabel: `${supplier.reference} · ${p.typeName} ${d.reference.trim()}` },
            "CREATE",
            diffFields(null, {
              type: p.typeName,
              title: p.title || null,
              reference: d.reference.trim(),
              issuingAuthority: d.issuingAuthority.trim(),
              expiresOn,
              ratePercent: rate,
              codes: p.values.length ? p.values.map((v) => `${v.code} — ${v.nameEn}`).join("; ") : null,
              kind: p.renewsId ? "A renewal or replacement, waiting for an officer's check" : "A first document, waiting for an officer's check",
              answers: p.itemLabel ? `The office's request: ${p.itemLabel}` : null,
              lodgedBy: "the supplier's own portal account",
            }),
          );
        },
      },
    },
  );
  if (!made) throw new Error("A replacement was stored without its document.");
  return { documentId: (made as { documentId: string }).documentId, versionId: stored.versionId, label: (made as { label: string }).label, byteSize: stored.byteSize, scanState: "NOT_SCANNED", warnings };
}
