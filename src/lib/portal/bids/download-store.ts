import type { SupplierActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { logAccess } from "@/lib/documents/service";
import { dispositionFilename, downloadDecision, EXTENSION_FOR } from "@/lib/documents/access";
import { blobStore, sha256Hex } from "@/lib/documents/store";
import { downloadRequestFault } from "@/lib/documents/request-guard";
import { packManifest } from "@/lib/tender-docs/freeze";

import { loadBidContext } from "./context-store";
import { loadReleaseFacts } from "./inspection-store";
import { isRepeatDownload, RATE_LIMITED_WORDS } from "./limits";
import { countAndJudge } from "./rate-store";

/**
 * Downloading what a released purchase releases (SR-10, ruling 17). Released means the frozen pack's issued parts: its uploaded files, and its merged texts. A supplier whose purchase is released may
 * download them, and nobody else: the release is judged here, on this request, by the same rule that opens the documents on screen (`releaseState`), and a file or a text is served only if the approved
 * pack's frozen manifest names it. Every download is a row, written after the response is built so none is logged for a file not sent. The append-only log is bounded where it is asked (SEC-2): an account may ask only so often (`limits.ts`), and a repeat of the same download within a few minutes is the same download and is not logged again. A file refused, or one whose bytes do not match their fingerprint, is an access event, as for staff (SEC-3).
 *
 * Only the approved pack is released; a SULIT or threat-flagged file is never served to a supplier; the bytes are checked against their fingerprint before they are sent.
 */

export interface ReleasedFile {
  kind: "FILE";
  versionId: string;
  partLabel: string;
  title: string;
  versionNo: number;
}
export interface ReleasedText {
  kind: "TEXT";
  /// `<part code>.<language>`: the part and the language of the merged text.
  id: string;
  partLabel: string;
  title: string;
}
export type ReleasedItem = ReleasedFile | ReleasedText;

export interface ReleasedPack {
  packVersion: number;
  files: ReleasedFile[];
  /// The merged texts, each with the words frozen when the documents were approved.
  texts: (ReleasedText & { body: string })[];
}

const LANGUAGE_WORDS = { MS: "Malay", EN: "English" } as const;

/// The issued parts of the exercise's approved pack: what a released purchase releases. Null where there is no approved pack.
export async function releasedPackOf(organisationId: string, exerciseId: string): Promise<ReleasedPack | null> {
  const pack = await db.tenderPack.findFirst({
    where: { exerciseId, organisationId, status: "APPROVED" },
    orderBy: { versionNo: "desc" },
    select: { versionNo: true, manifest: true, frozenAt: true, documents: { select: { partCode: true, language: true, renderedText: true } } },
  });
  const manifest = pack?.frozenAt ? packManifest(pack.manifest) : null;
  if (!pack || !manifest) return null;
  const issued = manifest.filter((m) => m.state === "READY");
  const files: ReleasedFile[] = issued.flatMap((m) => m.files.map((f) => ({ kind: "FILE" as const, versionId: f.versionId, partLabel: `${m.printedNumber} ${m.label}`.trim(), title: f.title, versionNo: f.versionNo })));
  const texts = issued.flatMap((m) =>
    pack.documents
      .filter((d) => d.partCode === m.partCode)
      .map((d) => ({ kind: "TEXT" as const, id: `${m.partCode}.${d.language}`, partLabel: `${m.printedNumber} ${m.label}`.trim(), title: `${m.label} (${LANGUAGE_WORDS[d.language]})`, body: d.renderedText })),
  );
  return { packVersion: pack.versionNo, files, texts };
}

export type DownloadRefusal = { ok: false; status: 403 | 404 | 429 | 500 | 503; text: string; retryAfterSeconds?: number };
export type DownloadReply = { ok: true; body: Uint8Array<ArrayBuffer>; contentType: string; disposition: string; commit: () => Promise<void> };

/**
 * One download. Judged first, in order: the request is from the portal's own pages; the exercise is one this supplier may see; its purchase is released (the rule that opens the documents on screen);
 * the item is one the approved pack names. The log row is written by `commit`, which the route calls once the response is built.
 */
export async function prepareDownload(actor: SupplierActor, i: { exerciseId: string; file: string | null; text: string | null; secFetchSite: string | null }, now: Date = new Date()): Promise<DownloadReply | DownloadRefusal> {
  const no = (status: DownloadRefusal["status"], text: string): DownloadRefusal => ({ ok: false, status, text });
  if (downloadRequestFault(i.secFetchSite)) return no(403, "Download this from your own list: open the exercise in My Bids and choose the file there. Nothing was logged.");
  // SEC-2: the account's own rate, counted before anything is read. A refusal for rate writes no trail.
  const rate = await countAndJudge(db, { organisationId: actor.organisationId, accountId: actor.accountId, action: "document-download" }, now);
  if (rate.limited) return { ...no(429, RATE_LIMITED_WORDS["document-download"]), retryAfterSeconds: rate.retryAfterSeconds };
  const ctx = await loadBidContext(db, actor, i.exerciseId, now);
  if (!ctx || !ctx.ex.window) return no(404, "That exercise is not one you can open.");
  const release = await loadReleaseFacts(db, actor, ctx);
  if (release.state !== "READY") return no(403, `${release.words.short}. ${release.words.detail}`);
  const pack = await releasedPackOf(actor.organisationId, ctx.ex.id);
  if (!pack) return no(404, "The procurement office has no approved documents for this exercise to release.");
  const purchaseId = release.purchase?.id ?? null;
  const window = ctx.ex.window;
  const who = { organisationId: actor.organisationId, supplierAccountId: actor.accountId, sessionId: actor.sessionId, sourceAddress: actor.sourceAddress };
  const log = (row: { kind: "FILE" | "MERGED_TEXT"; partLabel: string; title: string; documentVersionId: string | null }) => async () => {
    // SEC-2: the same item taken again by the same account within a few minutes is one download for the log.
    const last = await db.purchaseDownload.findFirst({ where: { organisationId: actor.organisationId, windowId: window.id, accountId: actor.accountId, kind: row.kind, documentVersionId: row.documentVersionId, title: row.title, packVersion: pack.packVersion }, orderBy: { downloadedAt: "desc" }, select: { downloadedAt: true } });
    if (isRepeatDownload(last?.downloadedAt ?? null, now)) return;
    await db.purchaseDownload.create({ data: { organisationId: actor.organisationId, windowId: window.id, supplierId: actor.supplierId, purchaseId, accountId: actor.accountId, packVersion: pack.packVersion, downloadedAt: now, ...row } });
  };

  if (i.text) {
    const t = pack.texts.find((x) => x.id === i.text);
    if (!t) return no(404, "That text is not part of the released documents.");
    const header = `${ctx.ex.reference} · ${ctx.ex.title}\n${t.title}\nDocuments version ${pack.packVersion}, as frozen when they were approved for tendering.\n\n`;
    const bytes = new TextEncoder().encode(`${header}${t.body}\n`) as Uint8Array<ArrayBuffer>;
    return { ok: true, body: bytes, contentType: "text/plain; charset=utf-8", disposition: dispositionFilename(`${ctx.ex.reference} ${t.title}.txt`, "txt"), commit: log({ kind: "MERGED_TEXT", partLabel: t.partLabel, title: t.title, documentVersionId: null }) };
  }

  const f = pack.files.find((x) => x.versionId === i.file);
  if (!f) return no(404, "That file is not part of the released documents.");
  const version = await db.documentVersion.findFirst({ where: { id: f.versionId, organisationId: actor.organisationId }, select: { id: true, sha256: true, mediaType: true, originalFilename: true, scanState: true, document: { select: { classificationSnapshot: true } } } });
  if (!version) return no(404, "That file is not part of the released documents.");
  // A supplier is never entitled to a SULIT file: only an officer's records admit one.
  const decision = downloadDecision({ classification: version.document.classificationSnapshot, scanState: version.scanState, entitled: false });
  if (!decision.allow) {
    await logAccess({ organisationId: actor.organisationId, kind: "REFUSED", reasonCode: decision.reason, versionId: version.id, actor: who });
    return no(403, "This file cannot be released to you. Ask the procurement office for it.");
  }
  const s = blobStore();
  if ("fault" in s) {
    await logAccess({ organisationId: actor.organisationId, kind: "REFUSED", reasonCode: s.fault, versionId: version.id, actor: who });
    return no(503, "The document store is not configured, so the file cannot be sent. Tell the procurement office.");
  }
  const bytes = await s.store.get(actor.organisationId, version.sha256);
  if (!bytes || sha256Hex(bytes) !== version.sha256) {
    await logAccess({ organisationId: actor.organisationId, kind: "INTEGRITY_FAILED", reasonCode: bytes ? "DIGEST_MISMATCH" : "BYTES_MISSING", versionId: version.id, actor: who });
    return no(500, "The stored file does not match its fingerprint, so it is not sent. Tell the procurement office.");
  }
  return { ok: true, body: bytes as Uint8Array<ArrayBuffer>, contentType: version.mediaType, disposition: dispositionFilename(version.originalFilename, EXTENSION_FOR[version.mediaType] ?? "bin"), commit: log({ kind: "FILE", partLabel: f.partLabel, title: f.title, documentVersionId: f.versionId }) };
}
