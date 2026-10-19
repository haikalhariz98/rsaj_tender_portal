import { diffFields } from "@/lib/audit/diff";
import { standingBarFinding } from "@/lib/portal/standing-gate";
import { portalStandingBarOf } from "@/lib/portal/standing-gate-store";
import { writeAudit, type Tx } from "@/lib/audit/record";
import { attributeSupplierAct } from "@/lib/auth/supplier-attribution-store";
import type { SupplierActor } from "@/lib/auth/types";
import { dayToDate } from "@/lib/dates";
import { storeUpload, UploadRefusal, type DocumentOrg } from "@/lib/documents/service";
import type { BlobStore } from "@/lib/documents/store";
import type { Finding as StoreFinding } from "@/lib/documents/types";
import { loadRegistrationContext, loadRegistrationSettings } from "@/lib/portal/registration/context-store";
import { creditorTrailChanges } from "@/lib/portal/registration/creditor";
import { frozenWording } from "@/lib/portal/registration/declaration";
import { CREDITOR_FIELDS } from "@/lib/portal/registration/types";
import { uploadFault, uploadSettingFault, type UploadPolicy, type UploadStore } from "@/lib/portal/registration/upload";
import { lockSupplierRow } from "@/lib/suppliers/lock";
import type { SupplierStatus } from "@/lib/suppliers/types";

import { bankChangeFaults, bankState, type BankChangeInput } from "./bank";
import { CompanyRefused } from "./errors";
import { waitingUsage } from "./replace-store";
import { inOrder } from "@/lib/series";

/**
 * A registered supplier changes its bank details (Phase 4c; the CPD rulings of 2026-10-07 and the addendum: a change is a new version, ONE officer checks it, and the version in force stays in
 * force until then). One transaction does all of it: the supplier row locked; the state judged on the locked rows (on the register, no earlier change waiting, the details by the registration's own
 * rules, the GIRO wording the page showed still the wording in force, the quota); the bank statement stored in the class the organisation chose for statements (SULIT); a NEW version of the
 * creditor profile superseding the highest one; the GIRO authorisation signed for it, with the signatory, the wording frozen with its hash, the organisation's day and the server's time; the
 * signature (the password was asked again before this runs, and the stamp is checked against the session here); the audit rows, which name the fields that changed and never what they held;
 * and the version marked sent, which freezes its content (trigger). A refusal anywhere rolls the whole change back.
 *
 * The bank details in force are untouched here: a payment is judged on the latest CHECKED version (`creditorFaults`, BD-613-44), so a change counts for payment only once an officer has
 * checked it. Nothing in the request names a supplier, a day or a time.
 */

export interface BankChangeUpload {
  change: BankChangeInput;
  /// From `confirmSupplierPassword`: when the password was asked again for this act.
  stepUpAt: Date;
  bytes: Uint8Array;
  sha256: string;
  mediaType: string;
  originalFilename: string;
  org: DocumentOrg;
  store: BlobStore;
  storeSettings: UploadStore;
  /// What `SupplierPolicy` says of a bank statement's upload (its class, which must be SULIT, and the quota).
  policy: UploadPolicy;
}

export interface BankChangeResult {
  profileId: string;
  version: number;
  /// The organisation's day it was sent.
  sentOn: string;
}

export async function sendBankChange(actor: SupplierActor, i: BankChangeUpload, now: Date = new Date()): Promise<BankChangeResult> {
  const sniffed = { size: BigInt(i.bytes.byteLength), sniffedType: i.mediaType };
  let profileId = "";
  let version = 0;
  let sentOn = "";
  const supplierAudit = { kind: "SUPPLIER" as const, supplierAccountId: actor.accountId, sessionId: actor.sessionId, sourceAddress: actor.sourceAddress };

  await storeUpload(
    { kind: "SUPPLIER", supplierAccountId: actor.accountId, sessionId: actor.sessionId, sourceAddress: actor.sourceAddress },
    {
      org: i.org,
      store: i.store,
      bytes: i.bytes,
      sha256: i.sha256,
      mediaType: i.mediaType,
      originalFilename: i.originalFilename,
      title: "Bank statement",
      documentClassId: i.policy.classId,
      documentId: null,
      recordedByPersonId: null,
      recordedBySupplierAccountId: actor.accountId,
      receivedOn: null,
      note: "",
      hooks: {
        before: async (tx) => {
          if (!(await lockSupplierRow(tx, actor.supplierId))) throw new CompanyRefused([{ code: "NOT_REGISTERED_FOR_CHANGE", level: "block" }]);
          // Decisions log, 2026-10-09, ruling on 1875(3): keeping the registration current is refused to a rejected, blacklisted or cancelled supplier; a suspended one may still send the renewal that lifts it.
          const bar = await portalStandingBarOf(tx, actor, "COMPANY_RECORD");
          if (bar) throw new CompanyRefused([standingBarFinding(bar)]);
          // The class a statement takes must be SULIT now, on the row: it may have been changed since the settings were read.
          const cls = i.policy.classId ? await tx.documentClass.findFirst({ where: { id: i.policy.classId, organisationId: actor.organisationId }, select: { classification: true } }) : null;
          const unset = uploadSettingFault(i.storeSettings, { ...i.policy, classIsSulit: cls?.classification === "SULIT" }, "statement");
          if (unset) throw new UploadRefusal(unset as unknown as StoreFinding, 422);
          const faults = await judge(tx, actor, i.change);
          if (faults.some((f) => f.level === "block")) throw new CompanyRefused(faults);
          const usage = await waitingUsage(tx, actor.organisationId, actor.supplierId);
          const refused = uploadFault(sniffed, i.storeSettings, i.policy, usage, "statement");
          if (refused) throw new UploadRefusal(refused as unknown as StoreFinding, refused.code === "TOO_LARGE" ? 413 : 422);
        },
        after: async (tx, created) => {
          const settings = (await loadRegistrationSettings(tx, actor.organisationId))!;
          const ctx = await loadRegistrationContext(tx, actor, settings, []);
          const text = ctx.texts.GIRO_AUTHORISATION!;
          const supplier = await tx.supplier.findFirstOrThrow({ where: { id: actor.supplierId, organisationId: actor.organisationId }, select: { reference: true } });
          const at = (entity: string, entityId: string, what: string) => ({ actor: supplierAudit, organisationId: actor.organisationId, entity, entityId, entityLabel: `${supplier.reference} · ${what}` });
          const today = settings.org.today!;

          // The new version supersedes the highest one, whatever its state (the chain is unbroken, and the supersedes column is unique).
          const last = await tx.creditorProfile.findFirst({ where: { supplierId: actor.supplierId, organisationId: actor.organisationId }, orderBy: { version: "desc" }, select: { id: true, version: true } });
          const data = Object.fromEntries(CREDITOR_FIELDS.map((k) => [k, i.change.creditor[k].trim()])) as Record<(typeof CREDITOR_FIELDS)[number], string>;
          const profile = await tx.creditorProfile.create({ data: { organisationId: actor.organisationId, supplierId: actor.supplierId, version: (last?.version ?? 0) + 1, supersedesId: last?.id ?? null, enteredBySupplierAccountId: actor.accountId, ...data } });
          profileId = profile.id;
          version = profile.version;
          sentOn = today;
          // The values are SULIT personal data and the trail can never be erased: it records which fields were entered, never what they held.
          await writeAudit(tx, at("CreditorProfile", profile.id, "Creditor's profile"), "CREATE", creditorTrailChanges(null, data));
          await tx.documentAttachment.create({ data: { organisationId: actor.organisationId, purpose: "SUPPLIER_BANK_STATEMENT", versionId: created.versionId, creditorProfileId: profile.id } });

          // The authorisation: the wording exactly as shown (frozen, with its hash), who signs, the organisation's day and the server's time. It belongs to the profile it authorises and to no application.
          const wording = frozenWording(text, settings.org.name);
          const declaration = await tx.registrationDeclaration.create({
            data: {
              organisationId: actor.organisationId,
              applicationId: null,
              creditorProfileId: profile.id,
              kind: "GIRO_AUTHORISATION",
              textId: text.id,
              textVersion: text.version,
              textSha256: wording.sha256,
              frozenTextEn: wording.en,
              frozenTextMs: wording.ms,
              signatoryName: i.change.giro.signatoryName.trim(),
              signatoryDesignation: i.change.giro.signatoryDesignation.trim(),
              signedOn: dayToDate(today),
              signedAt: now,
              signedBySupplierAccountId: actor.accountId,
            },
          });
          await writeAudit(tx, at("RegistrationDeclaration", declaration.id, "GIRO authorisation"), "CREATE", diffFields(null, { wordingVersion: text.version, wordingFingerprint: wording.sha256.slice(0, 12), position: i.change.giro.signatoryDesignation.trim(), signedOn: today }));

          // The signatures. One password entry signs one act: the change carries the signature (the profile is the exact document signed), and the declaration is a SIGNED row naming itself.
          await attributeSupplierAct(tx, { actor, entity: "CreditorProfile", entityId: profile.id, slot: "enteredBy", stepUpAt: i.stepUpAt, document: { entity: "CreditorProfile", id: profile.id }, reason: "Bank details changed after registration" });
          await attributeSupplierAct(tx, { actor, entity: "RegistrationDeclaration", entityId: declaration.id, slot: "signedBy", document: { entity: "RegistrationDeclaration", id: declaration.id }, reason: "Signed with the password entered when the change was sent" });

          // Sent: the content never changes after this (trigger), and the version waits for an officer's check.
          await tx.creditorProfile.update({ where: { id: profile.id, organisationId: actor.organisationId }, data: { submittedAt: now } });
          await writeAudit(tx, at("CreditorProfile", profile.id, "Creditor's profile"), "UPDATE", [{ field: "status", before: "being filled in", after: `version ${profile.version} sent, waiting for an officer to check it; the version in force stays in force until then` }]);
        },
      },
    },
  );
  return { profileId, version, sentOn };
}

/// The change judged on the locked rows: the same rules the handler asked before the password, with the state as it stands now. Used by the store and, without the lock, by the handler.
export async function judge(tx: Tx, actor: SupplierActor, change: BankChangeInput, passwordGiven = true) {
  const settings = await loadRegistrationSettings(tx, actor.organisationId);
  if (!settings) throw new CompanyRefused([{ code: "NOT_REGISTERED_FOR_CHANGE", level: "block" }]);
  const [supplier, ctx, rows] = await inOrder(
    () => tx.supplier.findFirst({ where: { id: actor.supplierId, organisationId: actor.organisationId }, select: { status: true } }),
    () => loadRegistrationContext(tx, actor, settings, []),
    () => tx.creditorProfile.findMany({ where: { supplierId: actor.supplierId, organisationId: actor.organisationId }, select: { version: true, submittedAt: true, verification: true } }));
  return bankChangeFaults(change, ctx, {
    supplierStatus: (supplier?.status ?? "REJECTED") as SupplierStatus,
    bank: bankState(rows.map((r) => ({ version: r.version, sent: r.submittedAt != null, verification: r.verification }))),
    passwordGiven,
  });
}
