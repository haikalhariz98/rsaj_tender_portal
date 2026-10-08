import { diffFields } from "@/lib/audit/diff";
import { writeAudit } from "@/lib/audit/record";
import { attributeSupplierAct } from "@/lib/auth/supplier-attribution-store";
import type { SupplierActor } from "@/lib/auth/types";
import { dayToDate } from "@/lib/dates";
import { db } from "@/lib/db";

import { loadRegistrationContext, loadRegistrationSettings } from "./context-store";
import { frozenWording } from "./declaration";
import { DraftRefused, draftOf, loadDraftView, lockOpenDraft, touchDraft } from "./draft-store";
import { blockingFaults, registrationFaults } from "./faults";
import { parseRate } from "./documents";
import type { DeclarationInput, DeclarationKind } from "./types";

/**
 * Sending the registration (Phase 4b, B6). One transaction writes all of it or none of it:
 *
 * - the application the supplier sent (NEW, PORTAL, no officer behind it, the server's day and time, and the supplier's account that sent it);
 * - the supplier's documents promoted from the draft's, lodged by the supplier's own account, each with its codes as they were named and its files MOVED (the same versions, detached
 *   from the draft and attached to the document: no copy of the bytes);
 * - the creditor profile, now sent (version one, awaiting an officer's check);
 * - the two declarations, each with the wording exactly as shown (frozen, with its hash), the signatory, the organisation's day and the server's time;
 * - the attributions: one signature, with the password asked again, of the submission (the application is the exact document signed), and a SIGNED row for each declaration;
 * - the audit rows with their before and after;
 * - the draft marked sent, which freezes it.
 *
 * Nothing in the request names a supplier, an organisation, a day or a time. The declaration's date is the server's, never typed. The route on `supplier_registration` is NOT started here:
 * a route's requester is a person (FR-APR-008), which a supplier is not, so an officer sends the application for decision as for a paper application, and the application waits in the
 * office's queue until then. The password is asked by the route before this runs, and its stamp is verified again here against the session (`attributeSupplierAct`).
 */

export interface SubmitInput {
  /// What the page last saw of the draft.
  version: number;
  declarations: readonly DeclarationInput[];
  /// From `confirmSupplierPassword`: when the password was asked again for this act.
  stepUpAt: Date;
}

export interface SubmitResult {
  /// The organisation's day it was sent.
  sentOn: string;
  applicationId: string;
}

export async function submitRegistration(actor: SupplierActor, input: SubmitInput, now: Date = new Date()): Promise<SubmitResult> {
  return db.$transaction(
    async (tx) => {
      const locked = await lockOpenDraft(tx, actor, input.version, now);
      const settings = await loadRegistrationSettings(tx, actor.organisationId);
      if (!settings || !settings.org.today) throw new DraftRefused("INVALID", [{ step: "documents", code: "TIME_ZONE_UNSET", level: "block" }]);
      const view = await loadDraftView(tx, actor);
      const ctx = await loadRegistrationContext(tx, actor, settings, view.documents.flatMap((d) => d.valueIds));
      const faults = blockingFaults(registrationFaults(draftOf(view), ctx, input.declarations));
      if (faults.length > 0) throw new DraftRefused("INVALID", faults);
      const today = settings.org.today;
      const supplierAudit = { kind: "SUPPLIER" as const, supplierAccountId: actor.accountId, sessionId: actor.sessionId, sourceAddress: actor.sourceAddress };
      const org = { actor: supplierAudit, organisationId: actor.organisationId };
      const at = (entity: string, entityId: string, what: string) => ({ ...org, entity, entityId, entityLabel: `${locked.supplier.reference} · ${what}` });

      // The profile being sent: the one in progress, which the rules above judged complete.
      const profile = await tx.creditorProfile.findFirst({ where: { supplierId: actor.supplierId, organisationId: actor.organisationId, submittedAt: null }, orderBy: { version: "desc" } });
      if (!profile) throw new DraftRefused("INVALID", [{ step: "epayment", code: "STATEMENT_REQUIRED", level: "block" }]);

      // A supplier that already holds a live document of a type with one chain (an officer lodged it) is not given a second chain.
      const held = await tx.supplierDocument.findMany({ where: { supplierId: actor.supplierId, organisationId: actor.organisationId, renewedBy: { is: null } }, select: { typeId: true, title: true } });
      for (const d of view.documents) {
        const type = ctx.types.find((t) => t.id === d.typeId)!;
        const clash = held.some((h) => h.typeId === d.typeId && (type.repeatable === true ? h.title.trim().toLowerCase() === d.title.trim().toLowerCase() : true));
        if (clash) throw new DraftRefused("INVALID", [{ step: "documents", code: "DOCUMENT_DUPLICATE", level: "block", field: `documents.${d.id}`, data: { type: type.nameEn } }]);
      }

      const app = await tx.supplierApplication.create({
        data: {
          organisationId: actor.organisationId,
          supplierId: actor.supplierId,
          kind: "NEW",
          receivedOn: dayToDate(today),
          channel: "PORTAL",
          recordedByPersonId: null,
          recordedAt: now,
          submittedAt: now,
          submittedBySupplierAccountId: actor.accountId,
        },
      });
      await writeAudit(tx, at("SupplierApplication", app.id, `Application received ${today}`), "CREATE", diffFields(null, { kind: "New registration", channel: "Online, sent by the supplier", receivedOn: today, sentBy: "the supplier's own portal account" }));

      // The documents, with their codes and their files.
      const draftRows = await tx.registrationDraftDocument.findMany({
        where: { draftId: locked.draft.id, organisationId: actor.organisationId, removedAt: null },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        include: {
          type: { select: { nameEn: true } },
          values: { select: { registrationValue: { select: { id: true, kind: true, code: true, nameEn: true } } } },
          attachments: { where: { purpose: "SUPPLIER_DRAFT_DOCUMENT", detachedAt: null }, select: { id: true, versionId: true } },
        },
      });
      for (const r of draftRows) {
        const rate = r.ratePercent ? parseRate(r.ratePercent.toString()) : null;
        const doc = await tx.supplierDocument.create({
          data: {
            organisationId: actor.organisationId,
            supplierId: actor.supplierId,
            typeId: r.typeId,
            typeLabelSnapshot: r.type.nameEn,
            applicationId: app.id,
            reference: r.reference,
            issuingAuthority: r.issuingAuthority,
            title: r.title,
            expiresOn: r.notApplicable ? null : r.expiresOn,
            notApplicable: r.notApplicable,
            ratePercent: rate,
            lodgedOn: dayToDate(today),
            recordedAt: now,
            recordedByPersonId: null,
            recordedBySupplierAccountId: actor.accountId,
            ...(r.values.length ? { values: { create: r.values.map((v) => ({ organisationId: actor.organisationId, registrationValueId: v.registrationValue.id, kind: v.registrationValue.kind, codeSnapshot: v.registrationValue.code, labelSnapshot: v.registrationValue.nameEn })) } } : {}),
          },
        });
        for (const a of r.attachments) {
          await tx.documentAttachment.update({ where: { id: a.id }, data: { detachedAt: now, detachReason: "Moved to the supplier's document when the registration was sent" } });
          await tx.documentAttachment.create({ data: { organisationId: actor.organisationId, purpose: "SUPPLIER_DOCUMENT", versionId: a.versionId, supplierDocumentId: doc.id } });
        }
        await writeAudit(
          tx,
          at("SupplierDocument", doc.id, r.title ? `${r.type.nameEn} · ${r.title}` : r.type.nameEn),
          "CREATE",
          diffFields(null, {
            type: r.type.nameEn,
            title: r.title || null,
            reference: r.reference || null,
            issuingAuthority: r.issuingAuthority || null,
            expiresOn: r.notApplicable ? null : r.expiresOn ? r.expiresOn.toISOString().slice(0, 10) : null,
            notApplicable: r.notApplicable,
            ratePercent: rate,
            codes: r.values.length ? r.values.map((v) => `${v.registrationValue.code} — ${v.registrationValue.nameEn}`).join("; ") : null,
            files: r.attachments.length,
            lodgedBy: "the supplier's own portal account",
          }),
        );
      }

      // The bank details are sent: they now wait for an officer to check them. The content never changes after this (trigger).
      await tx.creditorProfile.update({ where: { id: profile.id, organisationId: actor.organisationId }, data: { submittedAt: now } });
      await writeAudit(tx, at("CreditorProfile", profile.id, "Creditor's profile"), "UPDATE", [{ field: "status", before: "being filled in", after: `version ${profile.version} sent, waiting for an officer to check it` }]);

      // The declarations: the wording exactly as shown, its hash, the signatory and the server's day and time.
      const org0 = await tx.organisation.findUniqueOrThrow({ where: { id: actor.organisationId }, select: { name: true } });
      const declared: { kind: DeclarationKind; id: string }[] = [];
      for (const i of input.declarations) {
        const text = ctx.texts[i.kind]!;
        const wording = frozenWording(text, org0.name);
        const d = await tx.registrationDeclaration.create({
          data: {
            organisationId: actor.organisationId,
            applicationId: app.id,
            creditorProfileId: i.kind === "GIRO_AUTHORISATION" ? profile.id : null,
            kind: i.kind,
            textId: text.id,
            textVersion: text.version,
            textSha256: wording.sha256,
            frozenTextEn: wording.en,
            frozenTextMs: wording.ms,
            signatoryName: i.signatoryName.trim(),
            signatoryDesignation: i.signatoryDesignation.trim(),
            signedOn: dayToDate(today),
            signedAt: now,
            signedBySupplierAccountId: actor.accountId,
          },
        });
        declared.push({ kind: i.kind, id: d.id });
        await writeAudit(tx, at("RegistrationDeclaration", d.id, i.kind === "GIRO_AUTHORISATION" ? "GIRO authorisation" : "Declaration that the information is true"), "CREATE", diffFields(null, { wordingVersion: text.version, wordingFingerprint: wording.sha256.slice(0, 12), position: i.signatoryDesignation.trim(), signedOn: today }));
      }

      // The signatures. One password entry signs one act, so the submission carries the signature (the application is the exact document signed) and each declaration is a SIGNED row naming
      // itself, resting on the same entry (`SUPPLIER_ACT_SLOTS`).
      await attributeSupplierAct(tx, { actor, entity: "SupplierApplication", entityId: app.id, slot: "submittedBySupplierAccount", stepUpAt: input.stepUpAt, document: { entity: "SupplierApplication", id: app.id } });
      for (const d of declared) {
        await attributeSupplierAct(tx, { actor, entity: "RegistrationDeclaration", entityId: d.id, slot: "signedBy", document: { entity: "RegistrationDeclaration", id: d.id }, reason: "Signed with the password entered when the registration was sent" });
      }

      // The draft is sent: its version rises one last time, and nothing is written to it again.
      await touchDraft(tx, actor, locked.draft.id, now, { submittedAt: now });
      await writeAudit(tx, at("RegistrationDraft", locked.draft.id, "Registration draft"), "UPDATE", [{ field: "status", before: "being filled in", after: "sent to the procurement office" }]);
      return { sentOn: today, applicationId: app.id };
    },
    { timeout: 60_000, maxWait: 10_000 },
  );
}
