import { diffFields } from "@/lib/audit/diff";
import { writeAudit } from "@/lib/audit/record";
import type { AuditActor } from "@/lib/auth/types";
import { dayToDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { storeUploadTx } from "@/lib/documents/service";
import type { BlobStore } from "@/lib/documents/store";
import { issueReference, NumberingError } from "@/lib/numbering/issue";
import { portalCapacity, PORTAL_APPLICATION_SERIES_KEY } from "@/lib/portal/apply";
import type { RegisterSettings } from "@/lib/portal/apply-repo";
import { loadRegistrationSettings, registrationContextFor } from "@/lib/portal/registration/context-store";
import { frozenWording } from "@/lib/portal/registration/declaration-text";
import { parseRate } from "@/lib/portal/registration/documents";
import { CREDITOR_FIELDS, type DeclarationKind } from "@/lib/portal/registration/types";
import { inOrder } from "@/lib/series";
import { normaliseRegistrationNo } from "@/lib/suppliers/identity";
import { composeAddress, mobileWithDialCode, typedDay } from "@/lib/suppliers/step-one";

import { REGISTER_RECEIVE_TIMEOUT_SECONDS } from "./ceiling";
import { currentTextsOf } from "./config";
import type { CurrentTexts, PublicApplicationBody } from "./contract";
import { blockingPublicFaults, publicApplicationFaults, type PublicFault } from "./faults";
import { heldDraft } from "./held-draft";
import { findSpent } from "./token-store";

/**
 * A stranger's whole registration, received (ADR 0041 D1 to D4 and D8, plan 3.1 step 11). One transaction writes all of it, so a refusal anywhere leaves nothing, not even a file's bytes
 * (the blob store is transactional, ADR 0011):
 *
 * 1. the spent token, FIRST: a second send with the same token waits on its unique index, and then reads this one's reference;
 * 2. the application's reference, from its own series: the series row is the lock under which the day's and the number's counts are read (the number's leaves out applications set
 *    aside or rejected, RSEC-1(b); the day's counts every one);
 * 3. every rule judged on the configuration as it reads now, unlocked, so a refusal costs no byte written;
 * 4. the application (`form WHOLE`), with step 1 as the applicant typed it;
 * 5. to 7. the certificates with their codes and files, and the bank details with the statement, filed in the classes the organisation chose, each file recorded by the application;
 * 7a. only then the organisation and the agreed texts held still (in `submit-store.ts`'s order), the texts and the notice read again, and every rule judged again on them: no share
 *    lock is held while the bytes are written (security audit M3), and a text retired meanwhile still refuses the whole;
 * 8. one agreement per tick, with the wording exactly as shown and its hash, the signatory as typed, and the organisation's day and the server's time;
 * 9. the token set to the application;
 * 10. one audit row, naming no company, number or bank detail. The trail is not free of personal data: every applicant row names the source address the request came from, and
 *     each file's own row its original name, which the applicant chose (review minor; the trail is append-only).
 *
 * No supplier is created and the register is never asked (REG-1): whether a number is already held is the officer's to see. Server-only.
 */

/// A file as the route read it: the bytes, their digest, and the type the bytes say they are.
export interface HeldFile {
  bytes: Uint8Array;
  sha256: string;
  mediaType: string;
  originalFilename: string;
}

export interface ReceiveInput {
  /// What the route judged the request by (`loadRegisterSettings`): the register was open.
  register: RegisterSettings;
  /// The token's SHA-256, and when it was made.
  token: { sha256: string; issuedAt: Date };
  body: PublicApplicationBody;
  /// The files of each document row, by its row key, in the order they were sent.
  files: ReadonlyMap<string, readonly HeldFile[]>;
  statement: readonly HeldFile[];
  store: BlobStore;
  sourceAddress: string | null;
  now: Date;
}

export type ReceiveOutcome =
  | { ok: true; reference: string }
  | { ok: false; kind: "BUSY" | "CLOSED" }
  /// A rule found a fault on what was read again under the lock: a text retired, a notice changed, a type or a code withdrawn since the page was drawn.
  | { ok: false; kind: "VALIDATION"; faults: PublicFault[]; current: CurrentTexts };

/// A refusal thrown from inside the transaction, so the reference and everything else it took are given back.
class Turned extends Error {
  constructor(readonly outcome: ReceiveOutcome) {
    super("Turned away");
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

/// Fixed words: a document's title is never the applicant's own.
const CERTIFICATE_TITLE = "Certificate sent with an online application";
const STATEMENT_TITLE = "Bank statement sent with an online application";

const AGREEMENT_ORDER: readonly DeclarationKind[] = ["GIRO_AUTHORISATION", "FALSE_DECLARATION", "TERMS_AND_CONDITIONS"];

export async function receivePublicApplication(i: ReceiveInput): Promise<ReceiveOutcome> {
  const { register, body } = i;
  const orgId = register.org.id;
  const today = register.org.today;
  const documentClassId = register.upload.document.classId;
  const statementClassId = register.upload.statement.classId;
  if (today == null || documentClassId == null || statementClassId == null) return { ok: false, kind: "CLOSED" };
  const key = normaliseRegistrationNo(body.company.registrationNo);
  const fileCounts = new Map([...i.files].map(([k, fs]) => [k, fs.length]));
  // The token's row may not say it was spent before it was made: a token made a moment ahead of this clock (the skew allowed) is spent at the moment it was made.
  const consumedAt = i.now.getTime() < i.token.issuedAt.getTime() ? i.token.issuedAt : i.now;

  try {
    const reference = await db.$transaction(
      async (tx) => {
        // 1. The token, before anything else: a concurrent send with the same token blocks here until this one commits or rolls back.
        const spent = await tx.portalFormToken.create({ data: { organisationId: orgId, tokenSha256: i.token.sha256, issuedAt: i.token.issuedAt, consumedAt } });

        // 2. The reference. The series row is the lock: the counts below are read while it is held, so two sends cannot both take the last place.
        const issued = await issueReference(tx, orgId, PORTAL_APPLICATION_SERIES_KEY, dayToDate(today));
        const since = new Date(i.now.getTime() - DAY_MS);
        const [lastDay, forNumber] = await inOrder(
          () => tx.portalApplication.count({ where: { organisationId: orgId, receivedAt: { gte: since } } }),
          // RSEC-1(b): an application set aside or rejected no longer holds its number's place, so nobody can squat a number with junk the office threw out.
          () => tx.portalApplication.count({ where: { organisationId: orgId, registrationNoKey: key, receivedAt: { gte: since }, status: { notIn: ["DISCARDED", "REJECTED"] } } }));
        const capacity = portalCapacity({ lastDay, forNumber }, register.limits);
        if (capacity === "NOT_SET") throw new Turned({ ok: false, kind: "CLOSED" });
        // Alike for both limits, so the form never says that this particular number has been sent before.
        if (capacity === "BUSY") throw new Turned({ ok: false, kind: "BUSY" });

        // 3. Every rule, on the configuration as it reads now (unlocked): a refusal here writes no byte. Judged again under the locks at 7a.
        const valueIds = [...new Set(body.documents.flatMap((d) => d.valueIds))];
        const judge = async () => {
          const settings = await loadRegistrationSettings(tx, orgId);
          if (!settings) throw new Turned({ ok: false, kind: "CLOSED" });
          const ctx = await registrationContextFor(tx, orgId, settings, valueIds, { registrationNoKey: key, contactName: body.company.contact.name });
          const faults = blockingPublicFaults(publicApplicationFaults(body, heldDraft(body, fileCounts, i.statement.length), ctx, register.step1));
          if (faults.length > 0) throw new Turned({ ok: false, kind: "VALIDATION", faults, current: currentTextsOf(ctx) });
          return { settings, ctx };
        };
        const { ctx } = await judge();
        // The statement's class must still be SULIT, on the row: it may have changed since the settings were read.
        const statementClass = await tx.documentClass.findFirst({ where: { id: statementClassId, organisationId: orgId }, select: { classification: true } });
        if (statementClass?.classification !== "SULIT") throw new Turned({ ok: false, kind: "CLOSED" });

        // 4. The application, step 1 exactly as the step-one form wrote it, and which form it came from.
        const c = body.company;
        const a = c.address;
        const app = await tx.portalApplication.create({
          data: {
            organisationId: orgId,
            reference: issued,
            receivedOn: dayToDate(today),
            receivedAt: i.now,
            form: "WHOLE",
            registeredName: c.registeredName,
            registrationNo: c.registrationNo.trim(),
            registrationNoKey: key,
            entityTypeCode: c.entityTypeCode.trim(),
            countryCode: c.countryCode.trim(),
            // The single text is composed from the parts, for the readers that want one; the state is the list's name for it, not its code.
            registeredAddress: composeAddress(a, a.stateCode ? register.stateName(a.stateCode.trim()) : null),
            addressLine1: a.addressLine1,
            addressLine2: a.addressLine2,
            city: a.city,
            postcode: a.postcode,
            stateCode: (a.stateCode ?? "").trim(),
            bumiputeraClaimCode: (c.bumiputeraClaimCode ?? "").trim(),
            incorporatedOn: dayToDate(typedDay(c.incorporatedOn)!),
            companyEmail: c.companyEmail,
            contactName: c.contact.name,
            contactDesignation: c.contact.designation,
            contactEmail: c.contact.email,
            contactPhone: mobileWithDialCode(c.contact.phone, register.callingCode(c.countryCode.trim())),
          },
        });
        const applicant: AuditActor = { kind: "APPLICANT", portalApplicationId: app.id, sourceAddress: i.sourceAddress };
        const file = (f: HeldFile, title: string, documentClassId: string) =>
          storeUploadTx(tx, applicant, {
            org: register.org,
            store: i.store,
            bytes: f.bytes,
            sha256: f.sha256,
            mediaType: f.mediaType,
            originalFilename: f.originalFilename,
            title,
            documentClassId,
            documentId: null,
            recordedByPersonId: null,
            recordedByPortalApplicationId: app.id,
            receivedOn: null,
            note: "",
          });

        // 5 and 6. The certificates, each with its codes as they stood and its files.
        let fileCount = 0;
        for (const d of body.documents) {
          const type = ctx.types.find((t) => t.id === d.typeId)!;
          const rate = d.ratePercent.trim() === "" ? null : parseRate(d.ratePercent);
          const values = d.valueIds.map((id) => ctx.values.find((v) => v.id === id)!);
          const row = await tx.portalApplicationDocument.create({
            data: {
              organisationId: orgId,
              portalApplicationId: app.id,
              typeId: type.id,
              typeLabelSnapshot: type.nameEn,
              clientKey: d.clientKey,
              title: d.title.trim(),
              reference: d.reference.trim(),
              issuingAuthority: d.issuingAuthority.trim(),
              expiresOn: !d.notApplicable && d.expiresOn.trim() ? dayToDate(d.expiresOn.trim()) : null,
              notApplicable: d.notApplicable,
              ratePercent: rate,
              ...(values.length ? { values: { create: values.map((v) => ({ organisationId: orgId, registrationValueId: v.id, kind: v.kind, codeSnapshot: v.code, labelSnapshot: v.nameEn })) } } : {}),
            },
          });
          for (const f of i.files.get(d.clientKey) ?? []) {
            const stored = await file(f, CERTIFICATE_TITLE, documentClassId);
            await tx.documentAttachment.create({ data: { organisationId: orgId, purpose: "PORTAL_APPLICATION_DOCUMENT", versionId: stored.versionId, portalApplicationDocumentId: row.id } });
            fileCount += 1;
          }
        }

        // 7. The bank details, SULIT from receipt, and the statement in the SULIT class.
        const creditor = await tx.portalApplicationCreditor.create({
          data: { organisationId: orgId, portalApplicationId: app.id, ...Object.fromEntries(CREDITOR_FIELDS.map((k) => [k, body.creditor[k].trim()])) },
        });
        for (const f of i.statement) {
          const stored = await file(f, STATEMENT_TITLE, statementClassId);
          await tx.documentAttachment.create({ data: { organisationId: orgId, purpose: "PORTAL_APPLICATION_BANK_STATEMENT", versionId: stored.versionId, portalApplicationCreditorId: creditor.id } });
          fileCount += 1;
        }

        // 7a. Only now, with every byte written, the wording agreed to is held still until this commits, as the signed-in wizard's send holds it (the organisation first, then the
        // texts, shared), and every rule is judged again on what it reads under them. The agreements below are made on that reading.
        await tx.$queryRaw`SELECT id FROM "Organisation" WHERE id = ${orgId} FOR KEY SHARE`;
        await tx.$queryRaw`SELECT id FROM "DeclarationText" WHERE "organisationId" = ${orgId} FOR SHARE`;
        const held = await judge();
        const settings = held.settings;

        // 8. The agreements: the wording exactly as shown and its hash, the signatory as typed on step 4 (unverified: nobody is signed in), the organisation's day and the server's time.
        // The terms row also carries the Personal Data Notice agreed by the same tick.
        for (const kind of AGREEMENT_ORDER) {
          const text = held.ctx.texts[kind]!;
          const wording = frozenWording(text, settings.org.name);
          await tx.registrationDeclaration.create({
            data: {
              organisationId: orgId,
              portalApplicationId: app.id,
              kind,
              textId: text.id,
              textVersion: text.version,
              textSha256: wording.sha256,
              frozenTextEn: wording.en,
              frozenTextMs: wording.ms,
              ...(kind === "TERMS_AND_CONDITIONS" ? { noticeSha256: held.ctx.personalDataNotice!.sha256, noticeFrozenEn: held.ctx.personalDataNotice!.en } : {}),
              signatoryName: body.signatory.name.trim(),
              signatoryDesignation: body.signatory.designation.trim(),
              signedOn: dayToDate(today),
              signedAt: i.now,
              signedBySupplierAccountId: null,
            },
          });
        }

        // 9. The token is spent by this application.
        await tx.portalFormToken.update({ where: { id: spent.id }, data: { portalApplicationId: app.id } });

        // 10. One row in the trail. No company name, number, postal address or bank detail: the trail is append-only, and what is in it is never erased. Its actor names the source
        // address, and each file's own row (written by `storeUploadTx`) its original name.
        await writeAudit(
          tx,
          { actor: applicant, organisationId: orgId, entity: "PortalApplication", entityId: app.id, entityLabel: `${issued} · Online application` },
          "CREATE",
          diffFields(null, { event: "Online application received", reference: issued, receivedOn: today, documents: body.documents.length, files: fileCount, bankDetails: "entered" }),
        );
        return issued;
      },
      // Sized for the byte ceiling: every file's bytes are written in this transaction.
      { timeout: REGISTER_RECEIVE_TIMEOUT_SECONDS * 1000, maxWait: 10_000 },
    );
    return { ok: true, reference };
  } catch (e) {
    if (e instanceof Turned) return e.outcome;
    if (e instanceof NumberingError) return { ok: false, kind: "CLOSED" };
    // A send with the same token that got here first: its reference is the answer (plan 3.5). Read outside the rolled-back transaction.
    const won = await findSpent(db, orgId, i.token.sha256).catch(() => null);
    if (won) return { ok: true, reference: won.reference };
    throw e;
  }
}
