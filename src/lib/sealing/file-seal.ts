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

import { randomBytes } from "node:crypto";

import { gcmSeal, packGcm, zero } from "./aead";
import { hpkeSeal, packHpke } from "./hpke";
import type { AadContext, Bytes } from "./types";
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
