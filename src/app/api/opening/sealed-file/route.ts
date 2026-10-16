import type { NextRequest } from "next/server";

import { actFormFromJson, beginActFrom } from "@/app/_auth/act";
import { staffRoute } from "@/app/_auth/route";
import { exerciseIsHidden } from "@/app/_auth/sulit";
import { db } from "@/lib/db";
import { dispositionFilename, EXTENSION_FOR } from "@/lib/documents/access";
import { downloadLimiter, RETRY_AFTER_SECONDS } from "@/lib/documents/concurrency";
import { blobStore, sha256Hex } from "@/lib/documents/store";
import { findOpening, isFinalised, loadFileFacts } from "@/lib/opening/sealed-file-store";
import { RATE_LIMITS, rateRefusalLogged } from "@/lib/portal/bids/limits";
import { countAndJudgeCounted } from "@/lib/portal/bids/rate-store";
import { openFile } from "@/lib/sealing/file-seal";
import { downloadFaults } from "@/lib/sealing/grants";
import { downloadRefusalWords, MAX_SEALED_FILE_REQUEST_BYTES, parseSealedFileRequest, reasonOf, SEALED_FILE_STATUS, SEALED_FILE_WORDS, type SealedFileRefusal } from "@/lib/sealing/sealed-file";
import { SealError, zero } from "@/lib/sealing/types";
import { logSealedGranted, logSealedRefusal, unlockOwnKey, unlockRefusalWords } from "@/lib/sealing/unlock-store";
import { officerGrantAad, openGrant } from "@/lib/sealing/unseal-seal";
import { DOWNLOAD_POLICY } from "@/lib/security-headers";

/**
 * The officer's download of a sealed file at the opening check (ADR 0036 D4, D10; rulings 20n, 20t, 20w; build plan step 14). Internal copy only (the proxy refuses it on the public one, and the
 * shared guard refuses it again from inside). POST `{ openingId, fileId, password, passphrase }`.
 *
 * Only a named opening officer, never an administrator, only after the unseal and before finalising, only a file of an opening-check part of a bid that was opened at this opening (SR-14), and
 * through the grant sealed to that officer's own key. The sign-in password is asked every time (step-up), and so is the passphrase (20n): no unwrapped key is kept between requests.
 *
 * The order, and why. The guard (signed in, same origin, JSON): a request refused here reached nothing sealed and writes nothing (20w). The body, parsed in one place. The account's rate is
 * counted next, before anything is looked up or tried, so a flood of refusals writes one row a minute and password or passphrase guessing is bounded. Then who is asking and what the file is:
 * `downloadFaults`, each refusal logged. Then the password, then the passphrase (`unlockOwnKey`, which logs its own refusals and counts a wrong passphrase on the key's counter). Then the grant,
 * the body and the metadata are opened, every GCM tag and the plain digest checked, and only then are bytes sent: "stream" here means sent once verified, because unverified plaintext must not leave.
 * The response is built before the download is logged, so no entry says a file was served that was not.
 */
export async function POST(req: NextRequest) {
  const guard = await staffRoute({ contentTypes: ["application/json"] });
  if (!guard.ok) return guard.response;
  const actor = guard.actor;

  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_SEALED_FILE_REQUEST_BYTES) return fault("TOO_LARGE", SEALED_FILE_WORDS.TOO_LARGE);
  const raw = await req.text();
  if (raw.length > MAX_SEALED_FILE_REQUEST_BYTES) return fault("TOO_LARGE", SEALED_FILE_WORDS.TOO_LARGE);
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    json = null;
  }
  const parsed = parseSealedFileRequest(json);
  if (!parsed.ok) return fault("VALIDATION", SEALED_FILE_WORDS.VALIDATION, { fields: parsed.fields });
  const { openingId, fileId, password, passphrase } = parsed.value;

  const now = new Date();
  const rate = await countAndJudgeCounted(db, { organisationId: actor.organisationId, accountId: actor.accountId, action: "officer-sealed-download" }, now);

  const opening = await findOpening(actor.organisationId, openingId);
  if (rate.limited) {
    // 20w: the first refusal in a window is written down, the rest are not.
    if (opening && rateRefusalLogged(rate.count, RATE_LIMITS["officer-sealed-download"].limit)) {
      await logSealedRefusal({ organisationId: actor.organisationId, exerciseId: opening.exerciseId, kind: "DOWNLOAD", staffPersonId: actor.personId, reasonCode: "RATE_LIMITED", recordId: fileId });
    }
    return fault("RATE_LIMITED", SEALED_FILE_WORDS.RATE_LIMITED, { headers: { "Retry-After": String(rate.retryAfterSeconds) } });
  }
  // A restricted exercise the officer may not see reads as one that is not there (FR-MTD-007).
  if (!opening || (await exerciseIsHidden(actor, opening.exerciseId))) return fault("NOT_FOUND", SEALED_FILE_WORDS.NOT_FOUND);
  const exerciseId = opening.exerciseId;
  const refuse = async (code: SealedFileRefusal, message: string, reasonCode: string = code) => {
    await logSealedRefusal({ organisationId: actor.organisationId, exerciseId, kind: "DOWNLOAD", staffPersonId: actor.personId, reasonCode, recordId: fileId });
    return fault(code, message);
  };

  // An administrator account does not open or download bids, and is told so before anything about the file is looked up.
  if (actor.isAdministrator) return refuse("ADMINISTRATOR", downloadRefusalWords("ADMINISTRATOR"));
  const facts = await loadFileFacts({ organisationId: actor.organisationId, exerciseId, openingId, personId: actor.personId, fileId });
  if (!facts.namedOfficer) return refuse("NOT_NAMED_OFFICER", downloadRefusalWords("NOT_NAMED_OFFICER"));
  if (!facts.file) return refuse("NOT_FOUND", SEALED_FILE_WORDS.NOT_FOUND);
  const faults = downloadFaults({
    actorIsNamedOfficer: facts.namedOfficer,
    actorIsAdministrator: actor.isAdministrator,
    unsealed: opening.unsealedAt != null,
    finalised: opening.finalisedAt != null,
    // With no grant there is no use to judge, so the other faults speak first (a bid not opened here says so); a file that passes them and has no grant is refused as NO_GRANT below, so only
    // a grant that says OPENING_CHECK ever lets a byte out.
    use: facts.grant?.use ?? "OPENING_CHECK",
    // A bid that was not opened at this opening is not an opened bid here, whatever its row says.
    bidStatus: facts.file.openedHere ? facts.file.bidStatus : "SUBMITTED",
  });
  if (faults.length > 0) {
    const code = reasonOf(faults);
    return refuse(code, downloadRefusalWords(code));
  }
  if (!facts.grant || !facts.officerKeyId) return refuse("NO_GRANT", SEALED_FILE_WORDS.NO_GRANT);
  const file = facts.file;
  const grant = facts.grant;
  const officerKeyId = facts.officerKeyId;

  // The cap on downloads in flight: each holds a whole file in memory. Over it nothing was asked of the store, and nothing is logged.
  const slot = downloadLimiter().tryAcquire();
  if (!slot) return fault("BUSY", SEALED_FILE_WORDS.BUSY, { headers: { "Retry-After": String(RETRY_AFTER_SECONDS) } });
  try {
    // The sign-in password, asked every time. Nothing is signed: the attribution is never written, only the password checked.
    const begun = await beginActFrom(actor, actFormFromJson({ password }, { personKey: "personId" }), "OfficerExerciseKey.person", { personField: "personId", onBehalf: false, document: { entity: "Opening", id: openingId } });
    if (!begun.ok) {
      const message = begun.state.message ?? Object.values(begun.state.errors ?? {}).join(" ");
      return refuse("STEP_UP_REFUSED", message || "That password is not right.");
    }

    // The passphrase, every time. `unlockOwnKey` logs its own refusals.
    const unlocked = await unlockOwnKey({ organisationId: actor.organisationId, exerciseId, personId: actor.personId, passphrase, kind: "DOWNLOAD", now, recordId: fileId });
    if (!unlocked.ok) return fault(unlocked.reason, unlockRefusalWords(unlocked));
    let dek: Uint8Array | null = null;
    try {
      // The key unlocked is the live one the grant was read for: the officer may have set a new share in between.
      if (unlocked.officerKeyId !== officerKeyId) return await refuse("KEY_CHANGED", SEALED_FILE_WORDS.KEY_CHANGED);
      // Finalised while the passphrase was being tried: the files are documents now.
      if (await isFinalised(actor.organisationId, openingId)) return await refuse("FINALISED_USE_DOCUMENTS", downloadRefusalWords("FINALISED_USE_DOCUMENTS"));

      const store = blobStore();
      if ("fault" in store) return await refuse("BYTES_MISSING", SEALED_FILE_WORDS.BYTES_MISSING, store.fault);
      const cipher = await store.store.get(actor.organisationId, file.cipherSha256);
      if (!cipher) return await refuse("BYTES_MISSING", SEALED_FILE_WORDS.BYTES_MISSING, "BYTES_MISSING");
      if (sha256Hex(cipher) !== file.cipherSha256) return await refuse("DIGEST_MISMATCH", SEALED_FILE_WORDS.DIGEST_MISMATCH, "CIPHER_DIGEST_MISMATCH");

      try {
        // The use is written here as a literal, never read from the row: a grant that is not an opening-check grant does not open, whatever its column says.
        dek = openGrant({
          officerPrivate: unlocked.privateKey,
          sealed: grant.sealedDek,
          aad: officerGrantAad({ organisationId: actor.organisationId, exerciseId, openingId, officerKeyId, subject: "FILE", recordId: file.id, use: "OPENING_CHECK" }),
        });
      } catch (e) {
        if (e instanceof SealError) return await refuse("FILE_UNREADABLE", SEALED_FILE_WORDS.FILE_UNREADABLE, "GRANT_UNREADABLE");
        throw e;
      }
      const opened = openFile({
        context: { organisationId: actor.organisationId, exerciseId, keyId: file.keyId, fileId: file.id, packPartId: file.packPartId },
        dek,
        cipher: new Uint8Array(cipher),
        bodyIv: file.bodyIv,
        sealedMeta: file.sealedMeta,
      });
      if (!opened.ok) {
        return await (opened.fault === "DIGEST_MISMATCH" ? refuse("DIGEST_MISMATCH", SEALED_FILE_WORDS.DIGEST_MISMATCH, "PLAIN_DIGEST_MISMATCH") : refuse("FILE_UNREADABLE", SEALED_FILE_WORDS.FILE_UNREADABLE, "FILE_UNREADABLE"));
      }

      // Built before the download is logged. The type is served only if it is one the product recognises; anything else goes out as opaque bytes.
      const mediaType = EXTENSION_FOR[opened.meta.mediaType] ? opened.meta.mediaType : "application/octet-stream";
      let response: Response;
      try {
        response = new Response(opened.plain as Uint8Array<ArrayBuffer>, {
          status: 200,
          headers: {
            "Content-Type": mediaType,
            "Content-Length": String(opened.plain.byteLength),
            "Content-Disposition": dispositionFilename(opened.meta.filename, EXTENSION_FOR[mediaType] ?? "bin"),
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": DOWNLOAD_POLICY,
            "Cache-Control": "private, no-store",
          },
        });
      } catch {
        zero(opened.plain);
        return await refuse("FILE_UNREADABLE", SEALED_FILE_WORDS.FILE_UNREADABLE, "RESPONSE_NOT_BUILT");
      }
      await logSealedGranted({ organisationId: actor.organisationId, exerciseId, kind: "DOWNLOAD", staffPersonId: actor.personId, recordId: file.id, at: now });
      return response;
    } finally {
      zero(unlocked.privateKey);
      if (dek) zero(dek);
    }
  } finally {
    slot();
  }
}

function fault(code: SealedFileRefusal, message: string, extra: { fields?: Record<string, string>; headers?: Record<string, string> } = {}) {
  return Response.json(
    { ok: false, code, message, error: message, ...(extra.fields ? { fields: extra.fields } : {}) },
    { status: SEALED_FILE_STATUS[code], headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extra.headers } },
  );
}
