import type { Prisma } from "@/generated/prisma/client";
import { diffFields } from "@/lib/audit/diff";
import { writeAudit, type Tx } from "@/lib/audit/record";
import type { SupplierActor } from "@/lib/auth/types";
import { dayToDate, storedDay } from "@/lib/dates";
import { db } from "@/lib/db";
import { lockSupplierRow } from "@/lib/suppliers/lock";

import { parseRate } from "./documents";
import { draftShapeFaults, stepFaults, type DraftSection } from "./faults";
import { draftOf, emptyDraftView, type DraftView, type FileView } from "./draft-view";
import { wizardState, type WizardState } from "./state";

export { draftOf, emptyDraftView, type DraftDocumentView, type DraftView, type FileView } from "./draft-view";
import type { CreditorInput, RegistrationContext, RegistrationStep, StepFault } from "./types";
import { CREDITOR_FIELDS, EMPTY_CREDITOR } from "./types";
import { creditorTrailChanges } from "./creditor";

/**
 * A signed-in supplier's registration draft, read and saved (Phase 4b, steps 2 to 5). The supplier is the SESSION's (`actor.supplierId`), never anything a request names, and every
 * read and write also names the actor's organisation. A draft belongs to a supplier, so it is the supplier's accounts' draft: any contact of the supplier with an account sees it.
 *
 * A save judges shape and length only (`draftShapeFaults`) and never claims the draft valid. Every write takes the supplier row, then the draft row, `FOR UPDATE`, in that order (the
 * supplier-only lock path, `src/lib/suppliers/lock.ts`); the draft's `version` rises with each, so a save made on a stale page is refused and writes nothing. A draft that was sent is
 * frozen: nothing is written to it, and the database holds that as well (triggers, migration 20261013100000).
 */

const versionSelect = { id: true, originalFilename: true, byteSize: true, mediaType: true, scanState: true, storedAt: true } as const;
const fileOf = (v: { id: string; originalFilename: string; byteSize: bigint; mediaType: string; scanState: string; storedAt: Date }): FileView => ({ versionId: v.id, name: v.originalFilename, size: v.byteSize, mediaType: v.mediaType, scanState: v.scanState as FileView["scanState"], storedAt: v.storedAt });

/// The draft as the page shows it and the rules judge it. Reads only.
export async function loadDraftView(client: Tx, actor: Pick<SupplierActor, "organisationId" | "supplierId">): Promise<DraftView> {
  const where = { supplierId: actor.supplierId, organisationId: actor.organisationId };
  const [row, profile] = await Promise.all([
    client.registrationDraft.findFirst({
      where,
      include: {
        documents: {
          where: { removedAt: null },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          include: {
            values: { select: { registrationValueId: true } },
            attachments: { where: { purpose: "SUPPLIER_DRAFT_DOCUMENT", detachedAt: null }, orderBy: [{ attachedAt: "asc" }, { id: "asc" }], select: { version: { select: versionSelect } } },
          },
        },
      },
    }),
    client.creditorProfile.findFirst({
      where: { ...where, submittedAt: null },
      orderBy: { version: "desc" },
      include: { attachments: { where: { purpose: "SUPPLIER_BANK_STATEMENT", detachedAt: null }, orderBy: [{ attachedAt: "asc" }, { id: "asc" }], select: { version: { select: versionSelect } } } },
    }),
  ]);
  const base = emptyDraftView();
  if (!row && !profile) return base;
  return {
    ...base,
    id: row?.id ?? null,
    version: row?.version ?? 0,
    sentAt: row?.submittedAt ?? null,
    lastSavedAt: row?.lastSavedAt ?? null,
    signatoryName: row?.signatoryName ?? "",
    signatoryDesignation: row?.signatoryDesignation ?? "",
    giroConfirmed: row?.giroConfirmed ?? false,
    giroTextSha256: row?.giroTextSha256 ?? null,
    documents: (row?.documents ?? []).map((d) => ({
      id: d.id,
      typeId: d.typeId,
      title: d.title,
      reference: d.reference,
      issuingAuthority: d.issuingAuthority,
      expiresOn: d.expiresOn ? storedDay(d.expiresOn) : null,
      notApplicable: d.notApplicable,
      ratePercent: d.ratePercent ? d.ratePercent.toString() : null,
      files: d.attachments.map((a) => fileOf(a.version)),
      valueIds: d.values.map((v) => v.registrationValueId),
    })),
    creditorId: profile?.id ?? null,
    creditor: profile ? Object.fromEntries(CREDITOR_FIELDS.map((k) => [k, profile[k]])) as unknown as CreditorInput : { ...EMPTY_CREDITOR },
    statement: (profile?.attachments ?? []).map((a) => fileOf(a.version)),
  };
}

/// Where the registration stands for this supplier, read.
export async function loadWizardState(client: Tx, actor: Pick<SupplierActor, "organisationId" | "supplierId">): Promise<WizardState | null> {
  const s = await client.supplier.findFirst({ where: { id: actor.supplierId, organisationId: actor.organisationId }, select: { status: true, registrationDraft: { select: { submittedAt: true } }, _count: { select: { applications: true } } } });
  if (!s) return null;
  return wizardState({ supplierStatus: s.status, draftSent: s.registrationDraft?.submittedAt != null, applications: s._count.applications });
}

// ------------------------------------------------------------------------------------------------ writing

export type SaveRefusal = "NOT_OPEN" | "STALE" | "NOT_FOUND" | "INVALID" | "SENT";

export class DraftRefused extends Error {
  constructor(readonly kind: SaveRefusal, readonly faults: StepFault[] = [], message = kind) {
    super(message);
  }
}

export interface LockedDraft {
  supplier: { id: string; reference: string; registeredName: string };
  draft: { id: string; version: number };
}

/**
 * Inside a transaction: the supplier row locked, the registration open for writing (the wizard is for an applicant whose registration is not yet with the office), the draft row locked, and
 * made if it does not exist yet. A draft that was sent is `SENT`; one the office holds (an application exists) is `NOT_OPEN`. `version` is checked against what the page last saw when given.
 */
export async function lockOpenDraft(tx: Tx, actor: Pick<SupplierActor, "organisationId" | "supplierId" | "accountId">, expectedVersion: number | null, now: Date): Promise<LockedDraft> {
  if (!(await lockSupplierRow(tx, actor.supplierId))) throw new DraftRefused("NOT_FOUND");
  const supplier = await tx.supplier.findFirst({ where: { id: actor.supplierId, organisationId: actor.organisationId }, select: { id: true, reference: true, registeredName: true, status: true, registrationDraft: { select: { id: true, submittedAt: true } }, _count: { select: { applications: true } } } });
  if (!supplier) throw new DraftRefused("NOT_FOUND");
  const state = wizardState({ supplierStatus: supplier.status, draftSent: supplier.registrationDraft?.submittedAt != null, applications: supplier._count.applications });
  if (state === "SENT") throw new DraftRefused("SENT");
  if (state !== "OPEN") throw new DraftRefused("NOT_OPEN");
  let id = supplier.registrationDraft?.id;
  if (!id) {
    const created = await tx.registrationDraft.create({ data: { organisationId: actor.organisationId, supplierId: supplier.id, lastSavedBySupplierAccountId: actor.accountId, lastSavedAt: now } });
    id = created.id;
    await writeAudit(tx, { actor: { kind: "SUPPLIER", supplierAccountId: actor.accountId, sessionId: null, sourceAddress: null }, organisationId: actor.organisationId, entity: "RegistrationDraft", entityId: id, entityLabel: `${supplier.reference} · Registration draft` }, "CREATE", diffFields(null, { started: "yes" }));
  }
  const locked = await tx.$queryRaw<{ version: number }[]>`SELECT version FROM "RegistrationDraft" WHERE id = ${id} FOR UPDATE`;
  const version = locked[0]?.version ?? 0;
  if (expectedVersion != null && version !== expectedVersion) throw new DraftRefused("STALE");
  return { supplier: { id: supplier.id, reference: supplier.reference, registeredName: supplier.registeredName }, draft: { id, version } };
}

/// Mark the draft as saved once more, by this account: the version rises, so any page that has not seen this write is stale.
export async function touchDraft(tx: Tx, actor: Pick<SupplierActor, "organisationId" | "accountId">, draftId: string, now: Date, extra: Prisma.RegistrationDraftUncheckedUpdateInput = {}): Promise<number> {
  const updated = await tx.registrationDraft.update({ where: { id: draftId, organisationId: actor.organisationId }, data: { ...extra, version: { increment: 1 }, lastSavedAt: now, lastSavedBySupplierAccountId: actor.accountId }, select: { version: true } });
  return updated.version;
}

export interface SavedSection {
  version: number;
  /// The ids the new rows were given, by the temporary id the page sent (`new:<n>`).
  created: Record<string, string>;
  /// What the step's rules say now. A save never claims validity: the page shows these only when the supplier asked to go on.
  faults: StepFault[];
}

const NEW_ROW = /^new:[A-Za-z0-9_-]{1,40}$/;

export interface SaveRequest {
  section: DraftSection;
  /// Rows to remove from the step, by id (documents only). Their files are detached (the bytes are kept).
  remove?: readonly string[];
}

/**
 * Save one section. Refused whole, writing nothing, when the page is stale, the draft is frozen or the section is not shaped like a section. Rows the section names that belong to no
 * draft of this supplier are refused as not found (a row id from another supplier's page does nothing).
 */
export async function saveSection(actor: SupplierActor, req: { version: number } & SaveRequest, ctxFor: (tx: Tx, chosenValueIds: string[]) => Promise<RegistrationContext>, now: Date = new Date()): Promise<SavedSection> {
  const shape = draftShapeFaults(req.section);
  if (shape.some((f) => f.level === "block")) throw new DraftRefused("INVALID", shape);
  return db.$transaction(
    async (tx) => {
      const locked = await lockOpenDraft(tx, actor, req.version, now);
      const created: Record<string, string> = {};
      const audit = (entity: string, entityId: string, label: string, changes: ReturnType<typeof diffFields>) =>
        changes.length ? writeAudit(tx, { actor: { kind: "SUPPLIER", supplierAccountId: actor.accountId, sessionId: actor.sessionId, sourceAddress: actor.sourceAddress }, organisationId: actor.organisationId, entity, entityId, entityLabel: `${locked.supplier.reference} · ${label}` }, "UPDATE", changes) : Promise.resolve();

      const s = req.section;
      if (s.step === "documents") {
        const types = await tx.supplierDocumentType.findMany({ where: { organisationId: actor.organisationId }, select: { id: true, nameEn: true, retiredOn: true } });
        const typeName = new Map(types.map((t) => [t.id, t.nameEn]));
        const existing = await tx.registrationDraftDocument.findMany({ where: { draftId: locked.draft.id, organisationId: actor.organisationId, removedAt: null } });
        const byId = new Map(existing.map((d) => [d.id, d]));
        for (const row of s.documents) {
          const rate = row.ratePercent.trim() === "" ? null : (parseRate(row.ratePercent) ?? row.ratePercent.trim());
          const data = {
            typeId: row.typeId,
            title: row.title.trim(),
            reference: row.reference.trim(),
            issuingAuthority: row.issuingAuthority.trim(),
            expiresOn: row.expiresOn.trim() ? dayToDate(row.expiresOn.trim()) : null,
            notApplicable: row.notApplicable,
            // A rate that cannot be stored as a percentage is kept out of the column: the rules report it (RATE_INVALID) when the supplier goes on.
            ratePercent: rate != null && parseRate(rate) != null ? parseRate(rate) : null,
          };
          if (!typeName.has(data.typeId)) throw new DraftRefused("INVALID", [{ step: "documents", code: "DOCUMENT_TYPE_UNKNOWN", level: "block", field: `documents.${row.id}` }]);
          if (NEW_ROW.test(row.id)) {
            const made = await tx.registrationDraftDocument.create({ data: { organisationId: actor.organisationId, draftId: locked.draft.id, ...data } });
            created[row.id] = made.id;
            await audit("RegistrationDraftDocument", made.id, "Registration draft", diffFields(null, { document: typeName.get(data.typeId), title: data.title || null, reference: data.reference || null, expiresOn: row.expiresOn.trim() || null, notApplicable: data.notApplicable }));
            continue;
          }
          const before = byId.get(row.id);
          if (!before) throw new DraftRefused("NOT_FOUND");
          // A document keeps its type: another type is another document.
          if (before.typeId !== data.typeId) throw new DraftRefused("INVALID", [{ step: "documents", code: "DOCUMENT_TYPE_UNKNOWN", level: "block", field: `documents.${row.id}` }]);
          await tx.registrationDraftDocument.update({ where: { id: before.id }, data: { title: data.title, reference: data.reference, issuingAuthority: data.issuingAuthority, expiresOn: data.expiresOn, notApplicable: data.notApplicable, ratePercent: data.ratePercent } });
          await audit(
            "RegistrationDraftDocument",
            before.id,
            "Registration draft",
            diffFields(
              { [`${typeName.get(before.typeId)} title`]: before.title, [`${typeName.get(before.typeId)} reference`]: before.reference, [`${typeName.get(before.typeId)} issuing authority`]: before.issuingAuthority, [`${typeName.get(before.typeId)} expiry`]: before.expiresOn ? storedDay(before.expiresOn) : null, [`${typeName.get(before.typeId)} not applicable`]: before.notApplicable, [`${typeName.get(before.typeId)} rate`]: before.ratePercent?.toString() ?? null },
              { [`${typeName.get(before.typeId)} title`]: data.title, [`${typeName.get(before.typeId)} reference`]: data.reference, [`${typeName.get(before.typeId)} issuing authority`]: data.issuingAuthority, [`${typeName.get(before.typeId)} expiry`]: data.expiresOn ? storedDay(data.expiresOn) : null, [`${typeName.get(before.typeId)} not applicable`]: data.notApplicable, [`${typeName.get(before.typeId)} rate`]: data.ratePercent },
            ),
          );
        }
        for (const id of req.remove ?? []) {
          const row = byId.get(id);
          if (!row) throw new DraftRefused("NOT_FOUND");
          await removeDraftDocument(tx, actor, row.id, now);
          await audit("RegistrationDraftDocument", row.id, "Registration draft", [{ field: `${typeName.get(row.typeId) ?? "Document"} removed`, before: row.title || typeName.get(row.typeId) || null, after: null }]);
        }
      } else if (s.step === "codes") {
        const docs = await tx.registrationDraftDocument.findMany({ where: { draftId: locked.draft.id, organisationId: actor.organisationId, removedAt: null, id: { in: s.documents.map((d) => d.id) } }, include: { values: { select: { registrationValueId: true } }, type: { select: { nameEn: true } } } });
        const byId = new Map(docs.map((d) => [d.id, d]));
        const asked = [...new Set(s.documents.flatMap((d) => d.valueIds))];
        // A value must be one of this organisation's, and a retired one is not newly chosen (one already on the draft may stay).
        const values = asked.length ? await tx.registrationValue.findMany({ where: { id: { in: asked }, organisationId: actor.organisationId }, select: { id: true, retiredOn: true, code: true, nameEn: true } }) : [];
        const known = new Map(values.map((v) => [v.id, v]));
        for (const d of s.documents) {
          const row = byId.get(d.id);
          if (!row) throw new DraftRefused("NOT_FOUND");
          const had = new Set(row.values.map((v) => v.registrationValueId));
          const next = [...new Set(d.valueIds)];
          for (const id of next) {
            const v = known.get(id);
            if (!v) throw new DraftRefused("INVALID", [{ step: "codes", code: "VALUE_UNKNOWN", level: "block", field: `documents.${d.id}.values` }]);
            if (!had.has(id) && v.retiredOn != null && (!now || storedDay(v.retiredOn) <= storedDay(now))) throw new DraftRefused("INVALID", [{ step: "codes", code: "VALUE_RETIRED", level: "block", field: `documents.${d.id}.values`, data: { value: `${v.code} — ${v.nameEn}` } }]);
          }
          const drop = [...had].filter((id) => !next.includes(id));
          const add = next.filter((id) => !had.has(id));
          if (drop.length) await tx.registrationDraftValue.deleteMany({ where: { draftDocumentId: row.id, registrationValueId: { in: drop } } });
          if (add.length) await tx.registrationDraftValue.createMany({ data: add.map((id) => ({ organisationId: actor.organisationId, draftDocumentId: row.id, registrationValueId: id })) });
          if (drop.length || add.length) {
            const nameOf = (id: string) => (known.get(id) ? `${known.get(id)!.code} — ${known.get(id)!.nameEn}` : "A code no longer listed");
            await audit("RegistrationDraftDocument", row.id, "Registration draft", [{ field: `${row.type.nameEn} codes`, before: drop.length ? drop.map(nameOf).join("; ") : null, after: add.length ? add.map(nameOf).join("; ") : null }]);
          }
        }
      } else if (s.step === "epayment") {
        const profile = await ensureCreditorDraft(tx, actor, locked.supplier.id);
        const data: Record<string, string> = {};
        for (const k of CREDITOR_FIELDS) if (s.creditor[k] != null) data[k] = s.creditor[k]!.trim();
        const before = profile.row;
        if (Object.keys(data).length) await tx.creditorProfile.update({ where: { id: before.id, organisationId: actor.organisationId }, data });
        // The values are SULIT personal data and the trail can never be erased: it records which fields changed, never what they held (`creditorTrailChanges`).
        await audit("CreditorProfile", before.id, "Creditor's profile", creditorTrailChanges(before as unknown as Partial<Record<keyof CreditorInput, string>>, data as Partial<Record<keyof CreditorInput, string>>));
        const draftData: Prisma.RegistrationDraftUncheckedUpdateInput = {};
        if (s.signatoryName != null) draftData.signatoryName = s.signatoryName.trim();
        if (s.signatoryDesignation != null) draftData.signatoryDesignation = s.signatoryDesignation.trim();
        if (s.giroConfirmed != null) {
          if (s.giroConfirmed) {
            // A tick is about the wording it was made on: refused unless the page showed the wording now in force.
            const now = (await ctxFor(tx, [])).texts.GIRO_AUTHORISATION;
            if (!now) throw new DraftRefused("INVALID", [{ step: "epayment", code: "TEXT_NOT_SET", level: "block", field: "giro", data: { kind: "GIRO_AUTHORISATION" } }]);
            if (s.giroTextSha256 !== now.sha256) throw new DraftRefused("INVALID", [{ step: "epayment", code: "TEXT_STALE", level: "block", field: "giro.confirmed", data: { kind: "GIRO_AUTHORISATION" } }]);
          }
          draftData.giroConfirmed = s.giroConfirmed;
          draftData.giroTextSha256 = s.giroConfirmed ? s.giroTextSha256! : null;
        }
        if (Object.keys(draftData).length) {
          const prior = await tx.registrationDraft.findUniqueOrThrow({ where: { id: locked.draft.id }, select: { signatoryName: true, signatoryDesignation: true, giroConfirmed: true } });
          await audit("RegistrationDraft", locked.draft.id, "Registration draft", diffFields({ signatoryNamed: prior.signatoryName ? "yes" : "no", signatoryDesignation: prior.signatoryDesignation, giroAuthorisationTicked: prior.giroConfirmed }, { signatoryNamed: (draftData.signatoryName ?? prior.signatoryName) ? "yes" : "no", signatoryDesignation: draftData.signatoryDesignation ?? prior.signatoryDesignation, giroAuthorisationTicked: draftData.giroConfirmed ?? prior.giroConfirmed }));
          await tx.registrationDraft.update({ where: { id: locked.draft.id }, data: draftData });
        }
      }
      const version = await touchDraft(tx, actor, locked.draft.id, now);
      const view = await loadDraftView(tx, actor);
      const ctx = await ctxFor(tx, view.documents.flatMap((d) => d.valueIds));
      return { version, created, faults: stepFaults(s.step as RegistrationStep, draftOf(view), ctx) };
    },
    { timeout: 20_000, maxWait: 10_000 },
  );
}

/// The unsent creditor profile of the supplier, made if there is none (version one, or one past the highest sent, superseding it).
export async function ensureCreditorDraft(tx: Tx, actor: Pick<SupplierActor, "organisationId" | "accountId">, supplierId: string) {
  const open = await tx.creditorProfile.findFirst({ where: { supplierId, organisationId: actor.organisationId, submittedAt: null }, orderBy: { version: "desc" } });
  if (open) return { row: open, created: false };
  const last = await tx.creditorProfile.findFirst({ where: { supplierId, organisationId: actor.organisationId }, orderBy: { version: "desc" }, select: { id: true, version: true } });
  const row = await tx.creditorProfile.create({ data: { organisationId: actor.organisationId, supplierId, version: (last?.version ?? 0) + 1, supersedesId: last?.id ?? null, enteredBySupplierAccountId: actor.accountId } });
  return { row, created: true };
}

/// Take a draft document off the draft: its files are detached with the reason (the bytes are kept, ADR 0011), its codes go, and the row is marked removed. Nothing is deleted: the
/// files were attached to it, and the trail names it.
export async function removeDraftDocument(tx: Tx, actor: Pick<SupplierActor, "organisationId">, draftDocumentId: string, now: Date): Promise<void> {
  await tx.documentAttachment.updateMany({ where: { registrationDraftDocumentId: draftDocumentId, detachedAt: null, organisationId: actor.organisationId }, data: { detachedAt: now, detachReason: "Removed by the supplier from its registration" } });
  await tx.registrationDraftValue.deleteMany({ where: { draftDocumentId } });
  await tx.registrationDraftDocument.update({ where: { id: draftDocumentId, organisationId: actor.organisationId }, data: { removedAt: now } });
}
