import { supplierUploadPost } from "../../../_auth/supplier";
import type { SupplierActor } from "@/lib/auth/types";
import { partPreBodyFaults, partUploadFaults } from "@/lib/bids/online/parts";
import { tryBeginBidUpload } from "@/lib/bids/online/upload-gate";
import { parseUploadForm, parseUploadQuery } from "@/lib/bids/online/upload-parse";
import { loadUploadFacts, logPartRefusal, PartRefused, storePart } from "@/lib/bids/online/upload-store";
import { PART_ROUTE_WORDS, PART_UPLOAD_FAULT_WORDS, UPLOAD_BUSY_WORDS, type PartRouteNotice } from "@/lib/bids/online/words";
import type { PartUploadFault } from "@/lib/bids/online/types";
import { db } from "@/lib/db";
import { limitBodyPaced } from "@/lib/documents/body";
import { RETRY_AFTER_SECONDS } from "@/lib/documents/concurrency";
import { readLimit, requestLengthFault } from "@/lib/documents/limits";
import { recogniseFile } from "@/lib/documents/media";
import { blobStore, deploymentCeiling, malwareScanner, runScan, sha256Hex } from "@/lib/documents/store";
import { BID_BODY_DEADLINE_SECONDS, BID_BODY_GRACE_SECONDS, BID_BODY_MIN_BYTES_PER_SECOND, RATE_LIMITS, rateRefusalLogged } from "@/lib/portal/bids/limits";
import { countAndJudgeCounted } from "@/lib/portal/bids/rate-store";

import { reply } from "../reply";

export const dynamic = "force-dynamic";

/**
 * A signed-in supplier uploads one part of its bid (SR-13, ADR 0036 D5, D6): `POST /supplier/bids/part?exerciseId=...&packPartId=...`, multipart with the fields `contentSha256`
 * (the hash the browser computed of the file, lower-case hex) and `file`. Guarded in the portal's order and before a byte of the body is read: the public copy, the Origin
 * guard, the form token (in `x-form-token`), who is signed in. Then the deployment's place and the supplier's own (one upload in flight per supplier; BUSY otherwise), the
 * account's rate, the exercise as this supplier may see it (another's answers 404 and writes nothing), the exercise's doors, the part's rule, and the stated length. The body
 * is then counted as it arrives, cut off at the part's limit, at the deadline and under the minimum rate. The type is the one the bytes say, the file is scanned (a failing
 * scanner is ERROR and refuses in both modes), and only then sealed to the exercise key. Nothing plain is stored; the one copy of the plain bytes made here is zeroed. The
 * parsed form holds the browser's `File` in memory until it is let go; that copy cannot be zeroed from here.
 */
export async function POST(request: Request) {
  const guard = await supplierUploadPost(request, "bids");
  if (!guard.ok) return guard.response;
  const release = tryBeginBidUpload(guard.actor.organisationId, guard.actor.supplierId);
  if (!release) return busy();
  try {
    return await upload(guard.actor, request);
  } finally {
    release();
  }
}

const busy = () => reply({ ok: false, code: "BUSY", message: UPLOAD_BUSY_WORDS.en }, 503, { "Retry-After": String(RETRY_AFTER_SECONDS) });
const notice = (code: PartRouteNotice, status: number, headers: Record<string, string> = {}) => reply({ ok: false, code, message: PART_ROUTE_WORDS[code].en }, status, headers);
const STATUS: Partial<Record<PartUploadFault, number>> = { TOO_LARGE: 413, BODY_TOO_SLOW: 408 };

async function upload(actor: SupplierActor, request: Request) {
  const query = parseUploadQuery(new URL(request.url).searchParams);
  if (!query.ok) return notice("FIELDS_DISAGREE", 400);
  const { exerciseId, packPartId } = query.value;

  // The account's rate, counted before anything is judged, so a refused try counts too. Only the first refusal in each window writes a row (20w).
  const rate = await countAndJudgeCounted(db, { organisationId: actor.organisationId, accountId: actor.accountId, action: "bid-part-upload" });
  if (rate.limited) {
    if (rateRefusalLogged(rate.count, RATE_LIMITS["bid-part-upload"].limit)) await logPartRefusal(actor, exerciseId, "PART_UPLOAD", "RATE_LIMITED");
    return notice("RATE_LIMITED", 429, { "Retry-After": String(rate.retryAfterSeconds) });
  }

  const facts = await loadUploadFacts(db, actor, { exerciseId, packPartId });
  if (!facts) return notice("NOT_FOUND", 404);
  const refuse = async (faults: readonly PartUploadFault[], status?: number) => {
    await logPartRefusal(actor, exerciseId, "PART_UPLOAD", faults[0]);
    const first = PART_UPLOAD_FAULT_WORDS[faults[0]];
    return reply(
      { ok: false, code: faults[0], message: first.en, faults: faults.map((f) => ({ message: PART_UPLOAD_FAULT_WORDS[f].en })) },
      status ?? STATUS[faults[0]] ?? 422,
    );
  };
  if (facts.gate.length > 0) return refuse(facts.gate);

  const store = blobStore();
  if ("fault" in store) {
    await logPartRefusal(actor, exerciseId, "PART_UPLOAD", "STORE_CLOSED");
    return notice("STORE_CLOSED", 503);
  }
  const ceiling = deploymentCeiling();
  const storeCap = "ceiling" in ceiling ? ceiling.ceiling : null;
  const pre = partPreBodyFaults({ rule: facts.rule, storeCap, draftFilesBySupplier: facts.draftFiles });
  if (pre.faults.length > 0) return refuse(pre.faults);
  if (pre.cap === null) return refuse(["SIZE_NOT_SET"]);

  const declared = request.headers.get("content-length");
  if (declared == null || declared.trim() === "") {
    await logPartRefusal(actor, exerciseId, "PART_UPLOAD", "NO_LENGTH");
    return notice("NO_LENGTH", 411);
  }
  const lengthFault = requestLengthFault(declared, pre.cap);
  if (lengthFault === "TOO_LARGE") return refuse(["TOO_LARGE"]);
  if (lengthFault) return notice("UNREADABLE", 400);

  // The body, counted as it arrives: cut off at the part's limit, at the deadline, and under the minimum rate.
  const limited = limitBodyPaced(request.body, readLimit(pre.cap), { deadlineMs: BID_BODY_DEADLINE_SECONDS * 1000, minBytesPerSecond: BID_BODY_MIN_BYTES_PER_SECOND, graceMs: BID_BODY_GRACE_SECONDS * 1000 });
  let form: FormData | null;
  try {
    form = await new Response(limited.stream, { headers: { "content-type": request.headers.get("content-type") ?? "" } }).formData();
  } catch {
    if (limited.tooSlow()) return refuse(["BODY_TOO_SLOW"]);
    if (limited.exceeded()) return refuse(["TOO_LARGE"]);
    return notice("UNREADABLE", 400);
  }
  const fields = parseUploadForm(form, { exerciseId, packPartId });
  form = null;
  if (!fields.ok) return notice("disagree" in fields ? "FIELDS_DISAGREE" : "UNREADABLE", 400);
  const file = fields.value.file;

  const scanner = malwareScanner();
  const recognised = await recogniseFile(file);
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    const serverSha256 = sha256Hex(bytes);
    const scan = await runScan(scanner, bytes);
    const faults = partUploadFaults({
      rule: facts.rule,
      sniffed: recognised.sniffed,
      office: recognised.office,
      size: BigInt(bytes.byteLength),
      storeCap,
      browserSha256: fields.value.contentSha256,
      serverSha256,
      scan,
      mode: facts.mode ?? "LIVE",
      scannerConfigured: scanner.configured,
      draftFilesBySupplier: facts.draftFiles,
    });
    if (faults.length > 0) return await refuse(faults);
    // A blank or whitespace name is replaced, so a file can never be sealed that the document store would later refuse for want of a title.
    const filename = Array.from(file.name).slice(0, 255).join("").trim() || "file";
    const stored = await storePart(actor, { facts, packPartId, plain: bytes, filename, mediaType: recognised.type ?? "application/octet-stream", scan, scannerConfigured: scanner.configured });
    return reply({ ok: true, fileId: stored.fileId, packPartId: stored.packPartId, plainSha256: stored.plainSha256, plainBytes: stored.plainBytes, scan: stored.scan }, 201);
  } catch (e) {
    if (e instanceof PartRefused) return await refuse(e.faults, e.status);
    throw e;
  } finally {
    bytes.fill(0);
  }
}
