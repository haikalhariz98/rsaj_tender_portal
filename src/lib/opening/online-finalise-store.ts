/**
 * What the online finalise reads before it commits (ADR 0036 D10, M5; build plan step 15). The ONLY reader of FINALISE grants: every other door serves OPENING_CHECK grants alone.
 *
 * With the finaliser's own key unlocked, every offer opened at this opening is checked one file at a time: the grant sealed to the finaliser opens the file's data key, the ciphertext is read
 * from the store and checked against its digest, and the body and its metadata are opened, which verifies both GCM tags and the plain digest (`openFile`). The bytes are discarded as soon as
 * they are verified, so no more than one file is ever plain in memory. The data keys are kept, because the finalise releases them to the mover in the same transaction that sets `finalisedAt`.
 * Each declaration is opened and parsed, and the company estimate's lodged copy where one was sealed to this opening. Reads only; nothing is written and no figure is returned in a message.
 * Every secret held is zeroed by `zeroMaterial`, which the caller runs in `finally`.
 */

import { parseDeclaration } from "@/lib/bids/online/submission";
import type { Declaration } from "@/lib/bids/online/types";
import { db } from "@/lib/db";
import { blobStore, sha256Hex } from "@/lib/documents/store";
import type { Sen } from "@/lib/money";
import { declarationAad } from "@/lib/sealing/bid-seal";
import { openFile } from "@/lib/sealing/file-seal";
import { SealError, zero, type Bytes } from "@/lib/sealing/types";
import { estimateAad, officerGrantAad, openGrant, openStoredGcm, type GrantSubjectKind, type GrantUseKind } from "@/lib/sealing/unseal-seal";

import { parseEstimateFigure, type MaterialFault } from "./online-finalise";

export interface FinaliseMaterial {
  /// Keyed by the offer's envelope id: what the declaration states.
  declared: Map<string, Declaration>;
  /// Each opened file's data key, for the release. Keyed by the file's id.
  deks: Map<string, Bytes>;
  /// The sealed estimate lodgement read, with its figure, or null where none was sealed to this opening.
  estimate: { lodgementId: string; figure: Sen } | null;
  /// The offers (envelope id → listing number) the material was gathered for: the transaction checks it still holds the same offers.
  offers: Map<string, number>;
}

export type Gathered = { ok: true; material: FinaliseMaterial } | { ok: false; fault: MaterialFault; listingNo: number | null };

export function zeroMaterial(m: FinaliseMaterial | null): void {
  if (!m) return;
  for (const d of m.deks.values()) zero(d);
  m.deks.clear();
}

export async function gatherFinaliseMaterial(i: { organisationId: string; exerciseId: string; openingId: string; officerKeyId: string; privateKey: Bytes }): Promise<Gathered> {
  const material: FinaliseMaterial = { declared: new Map(), deks: new Map(), estimate: null, offers: new Map() };
  const fail = (fault: MaterialFault, listingNo: number | null): Gathered => {
    zeroMaterial(material);
    return { ok: false, fault, listingNo };
  };
  try {
    const store = blobStore();
    if ("fault" in store) return fail("ONLINE_BYTES_MISSING", null);
    const opened = await db.openedBid.findMany({ where: { openingId: i.openingId, organisationId: i.organisationId }, orderBy: { listingNo: "asc" }, select: { id: true, listingNo: true, envelopeId: true } });
    const grants = new Map<string, { use: GrantUseKind; sealedDek: Uint8Array }>();
    for (const g of await db.officerDekGrant.findMany({ where: { openingId: i.openingId, organisationId: i.organisationId, officerKeyId: i.officerKeyId }, select: { subject: true, recordId: true, use: true, sealedDek: true } })) {
      grants.set(`${g.subject}.${g.recordId}`, { use: g.use, sealedDek: new Uint8Array(g.sealedDek) });
    }
    const dekOf = (subject: GrantSubjectKind, recordId: string): { ok: true; dek: Bytes } | { ok: false; fault: MaterialFault } => {
      const g = grants.get(`${subject}.${recordId}`);
      if (!g) return { ok: false, fault: "ONLINE_GRANT_MISSING" };
      try {
        // The use is read from the row because this door serves both uses; it is inside the additional data, so a use that was changed in the row does not open.
        return { ok: true, dek: openGrant({ officerPrivate: i.privateKey, sealed: g.sealedDek, aad: officerGrantAad({ organisationId: i.organisationId, exerciseId: i.exerciseId, openingId: i.openingId, officerKeyId: i.officerKeyId, subject, recordId, use: g.use }) }) };
      } catch (e) {
        if (e instanceof SealError) return { ok: false, fault: "ONLINE_GRANT_UNREADABLE" };
        throw e;
      }
    };

    for (const ob of opened) {
      material.offers.set(ob.envelopeId, ob.listingNo);
      const bid = await db.onlineBid.findFirst({
        where: { envelopeId: ob.envelopeId, organisationId: i.organisationId, exerciseId: i.exerciseId, status: "OPENED" },
        select: { id: true, keyId: true, sealedDeclaration: true, declarationCipherSha256: true, parts: { select: { file: { select: { id: true, keyId: true, packPartId: true, cipherSha256: true, bodyIv: true, sealedMeta: true } } } } },
      });
      if (!bid) return fail("ONLINE_BID_NOT_FOUND", ob.listingNo);

      // The declaration: opened with its own grant, parsed as at submission, held in memory until the transaction writes it.
      const declGrant = dekOf("DECLARATION", bid.id);
      if (!declGrant.ok) return fail(declGrant.fault, ob.listingNo);
      try {
        const stored = new Uint8Array(bid.sealedDeclaration);
        if (sha256Hex(stored) !== bid.declarationCipherSha256) return fail("ONLINE_DECLARATION_UNREADABLE", ob.listingNo);
        const plain = openStoredGcm({ dek: declGrant.dek, stored, aad: declarationAad({ organisationId: i.organisationId, exerciseId: i.exerciseId, keyId: bid.keyId, onlineBidId: bid.id }) });
        let parsed: ReturnType<typeof parseDeclaration>;
        try {
          parsed = parseDeclaration(JSON.parse(new TextDecoder().decode(plain)));
        } catch {
          return fail("ONLINE_DECLARATION_UNREADABLE", ob.listingNo);
        } finally {
          zero(plain);
        }
        if (!parsed.ok) return fail("ONLINE_DECLARATION_UNREADABLE", ob.listingNo);
        material.declared.set(ob.envelopeId, parsed.value);
      } catch (e) {
        if (e instanceof SealError) return fail("ONLINE_DECLARATION_UNREADABLE", ob.listingNo);
        throw e;
      } finally {
        zero(declGrant.dek);
      }

      // Every file, one at a time: the tags are verified and the bytes discarded.
      for (const part of bid.parts) {
        const file = part.file;
        const got = dekOf("FILE", file.id);
        if (!got.ok) return fail(got.fault, ob.listingNo);
        let keep = false;
        try {
          const cipher = await store.store.get(i.organisationId, file.cipherSha256);
          if (!cipher) return fail("ONLINE_BYTES_MISSING", ob.listingNo);
          if (sha256Hex(cipher) !== file.cipherSha256) return fail("ONLINE_DIGEST_MISMATCH", ob.listingNo);
          const read = openFile({ context: { organisationId: i.organisationId, exerciseId: i.exerciseId, keyId: file.keyId, fileId: file.id, packPartId: file.packPartId }, dek: got.dek, cipher: new Uint8Array(cipher), bodyIv: new Uint8Array(file.bodyIv), sealedMeta: new Uint8Array(file.sealedMeta) });
          if (!read.ok) return fail(read.fault === "DIGEST_MISMATCH" ? "ONLINE_DIGEST_MISMATCH" : "ONLINE_FILE_UNREADABLE", ob.listingNo);
          zero(read.plain);
          material.deks.set(file.id, got.dek);
          keep = true;
        } finally {
          if (!keep) zero(got.dek);
        }
      }
    }

    // The sealed estimate lodgement, where one was lodged under the live key and sealed to this opening's officers (step 16 writes it).
    const lodgement = await db.sealedEstimateLodgement.findFirst({ where: { exerciseId: i.exerciseId, organisationId: i.organisationId, supersededAt: null }, orderBy: { lodgedAt: "desc" }, select: { id: true, keyId: true, sealedEstimate: true, cipherSha256: true } });
    if (lodgement && grants.has(`ESTIMATE.${lodgement.id}`)) {
      const got = dekOf("ESTIMATE", lodgement.id);
      if (!got.ok) return fail(got.fault === "ONLINE_GRANT_MISSING" ? "ONLINE_ESTIMATE_UNREADABLE" : got.fault, null);
      try {
        const stored = new Uint8Array(lodgement.sealedEstimate);
        if (sha256Hex(stored) !== lodgement.cipherSha256) return fail("ONLINE_ESTIMATE_UNREADABLE", null);
        const plain = openStoredGcm({ dek: got.dek, stored, aad: estimateAad({ organisationId: i.organisationId, exerciseId: i.exerciseId, keyId: lodgement.keyId, lodgementId: lodgement.id }) });
        const figure = parseEstimateFigure(plain);
        zero(plain);
        if (figure === null) return fail("ONLINE_ESTIMATE_UNREADABLE", null);
        material.estimate = { lodgementId: lodgement.id, figure };
      } catch (e) {
        if (e instanceof SealError) return fail("ONLINE_ESTIMATE_UNREADABLE", null);
        throw e;
      } finally {
        zero(got.dek);
      }
    }
    return { ok: true, material };
  } catch {
    // A store or database failure while gathering is a refusal in words, never an error screen: nothing was written, and the caller logs the reason.
    return fail("ONLINE_STORE_UNAVAILABLE", null);
  }
}
