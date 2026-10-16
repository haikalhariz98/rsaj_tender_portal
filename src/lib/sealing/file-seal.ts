/**
 * Sealing one bid part (ADR 0036 D4, D6; wave 3b step 9). Pure: no database, no clock, nothing written. The upload route reads the rows and writes them; this file builds what
 * goes in them, and nothing else builds a file's three ciphertexts, so the additional data that step 13's unseal rebuilds is written once here.
 *
 * A fresh one-use data key (32 random bytes) seals the body (AES-256-GCM, AAD FILE_BODY) and the metadata (AAD FILE_META); the data key is itself HPKE-sealed to the exercise
 * key's public half (AAD FILE_DEK). All three bind the organisation, the exercise, the exercise key's id, the file's id as `recordId` and the returned part's id as `partKey`,
 * so a ciphertext lifted into another file, part, exercise or key does not open.
 *
 * Stored forms: the body is `ct || tag` (the 12-byte IV is kept apart, in `OnlineBidFile.bodyIv`); the metadata is `iv || ct || tag` (`packGcm`); the sealed data key is
 * `enc || ct` (`packHpke`). The data key and the metadata's plain bytes are zeroed before this returns; the plain body is the caller's to zero.
 */

import { createHash, randomBytes } from "node:crypto";

import { GCM_TAG_BYTES, gcmSeal, packGcm, unpackGcm, zero } from "./aead";
import { hpkeSeal, packHpke } from "./hpke";
import { gcmOpen } from "./open";
import { SealError, type AadContext, type Bytes } from "./types";
import type { FileMeta } from "@/lib/bids/online/types";

export interface FileSealContext { organisationId: string; exerciseId: string; keyId: string; fileId: string; packPartId: string }

const aad = (purpose: "FILE_DEK" | "FILE_META" | "FILE_BODY", c: FileSealContext): AadContext => ({ purpose, organisationId: c.organisationId, exerciseId: c.exerciseId, keyId: c.keyId, recordId: c.fileId, partKey: c.packPartId });
export const fileDekAad = (c: FileSealContext): AadContext => aad("FILE_DEK", c);
export const fileMetaAad = (c: FileSealContext): AadContext => aad("FILE_META", c);
export const fileBodyAad = (c: FileSealContext): AadContext => aad("FILE_BODY", c);

export interface SealedFile {
  /// `ct || tag`: what goes to the document store, addressed by its digest.
  cipher: Bytes;
  /// The body's IV (12 bytes), for `OnlineBidFile.bodyIv`.
  bodyIv: Bytes;
  sealedDek: Bytes;
  sealedMeta: Bytes;
}

export function sealFile(i: { context: FileSealContext; exercisePublicKey: Bytes; plain: Bytes; meta: FileMeta }): SealedFile {
  const dek = new Uint8Array(randomBytes(32));
  const metaBytes = new TextEncoder().encode(JSON.stringify(i.meta));
  try {
    const body = gcmSeal(dek, i.plain, fileBodyAad(i.context));
    const meta = gcmSeal(dek, metaBytes, fileMetaAad(i.context));
    const sealedDek = packHpke(hpkeSeal(i.exercisePublicKey, dek, fileDekAad(i.context)));
    return { cipher: new Uint8Array(Buffer.concat([body.ct, body.tag])), bodyIv: body.iv, sealedDek, sealedMeta: packGcm(meta) };
  } finally {
    zero(dek, metaBytes);
  }
}

export type OpenedFile = { ok: true; plain: Bytes; meta: FileMeta } | { ok: false; fault: "UNREADABLE" | "DIGEST_MISMATCH" };

const isMeta = (m: unknown): m is FileMeta => {
  if (m == null || typeof m !== "object") return false;
  const o = m as Record<string, unknown>;
  return o.v === 1 && typeof o.filename === "string" && typeof o.mediaType === "string" && typeof o.plainSha256 === "string" && typeof o.plainBytes === "string" && /^[0-9]+$/.test(o.plainBytes);
};

/**
 * A sealed file opened with its data key (wave 3b step 14, the officer's download). The inverse of `sealFile`: the same additional data, rebuilt from the same context, so a body or
 * metadata lifted from another file, part, exercise or key does not open. The body is `ct || tag` with its IV kept apart. Nothing is returned unless the tag of the body AND of the metadata
 * verified AND the plain bytes match the digest and size the metadata states: unverified plaintext never leaves this function. The data key is the caller's to zero.
 */
export function openFile(i: { context: FileSealContext; dek: Bytes; cipher: Bytes; bodyIv: Bytes; sealedMeta: Bytes }): OpenedFile {
  let plain: Bytes | null = null;
  try {
    if (i.cipher.length < GCM_TAG_BYTES) return { ok: false, fault: "UNREADABLE" };
    const metaBytes = gcmOpen(i.dek, unpackGcm(i.sealedMeta), fileMetaAad(i.context));
    let meta: unknown;
    try {
      meta = JSON.parse(new TextDecoder().decode(metaBytes));
    } finally {
      zero(metaBytes);
    }
    if (!isMeta(meta)) return { ok: false, fault: "UNREADABLE" };
    const cut = i.cipher.length - GCM_TAG_BYTES;
    plain = gcmOpen(i.dek, { iv: i.bodyIv, ct: i.cipher.subarray(0, cut), tag: i.cipher.subarray(cut) }, fileBodyAad(i.context));
    if (BigInt(plain.length) !== BigInt(meta.plainBytes) || createHash("sha256").update(plain).digest("hex") !== meta.plainSha256) {
      zero(plain);
      return { ok: false, fault: "DIGEST_MISMATCH" };
    }
    return { ok: true, plain, meta };
  } catch (e) {
    if (plain) zero(plain);
    if (e instanceof SealError) return { ok: false, fault: "UNREADABLE" };
    throw e;
  }
}
