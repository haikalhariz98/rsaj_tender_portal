import { supplierUploadPost } from "../../../_auth/supplier";
import { RETRY_AFTER_SECONDS, uploadLimiter } from "@/lib/documents/concurrency";
import { UploadRefusal } from "@/lib/documents/service";
import type { Finding as StoreFinding } from "@/lib/documents/types";
import { CompanyRefused } from "@/lib/portal/company/errors";
import { storeReplacement, type ReplacementTarget } from "@/lib/portal/company/replace-store";
import { companyFaultViews } from "@/lib/portal/company/words";

import { readUpload, storeRefusalReply } from "../upload-request";
import { unexpectedFailure } from "@/lib/unexpected-failure";

export const dynamic = "force-dynamic";

const reply = (body: Record<string, unknown>, status = 200, headers: Record<string, string> = {}) => Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
const ID = /^[A-Za-z0-9_-]{8,40}$/;

/**
 * A signed-in supplier sends a document to the procurement office from its Company workspace (Phase 4c: FR-VND-007, answering an item of the office's request online; FR-VND-008, renewing
 * a document before it expires; or a first document of a kind it does not hold): `POST /supplier/company/document`, multipart, the file and its details in ONE request, so a document is
 * never lodged without its file. Guarded in the portal's order and before a byte of the body is read: the public copy, the Origin guard (multipart only), the form token (in `x-form-token`),
 * who is signed in. Then the settings, the length, the body counted as it arrives and cut off at the limit, and the type read from the file's own bytes (`readUpload`). The act's own
 * transaction judges everything again on the locked rows (who may, what, the quota), and an unset setting refuses and names itself.
 *
 * The form says what the document is for (`target`: an item of the request, a document of the supplier's own to renew, or a type to give for the first time) and the id of it, and the
 * details. It names no supplier, organisation, day or time: the supplier is the session's and the day is the server's. A document sent here waits for an officer's check; a renewal does not
 * replace the one in force until then. Every file is "Not scanned".
 */
export async function POST(request: Request) {
  const guard = await supplierUploadPost(request, "company");
  if (!guard.ok) return guard.response;
  const slot = uploadLimiter().tryAcquire();
  if (!slot) return reply({ ok: false, code: "BUSY", message: "The portal is busy. Try again in a few seconds." }, 503, { "Retry-After": String(RETRY_AFTER_SECONDS) });
  try {
    const read = await readUpload(guard.actor, request, "document");
    if (!read.ok) return read.response;
    const { upload } = read;
    const kind = upload.text("target");
    const id = upload.text("targetId");
    if (!["item", "renew", "new"].includes(kind) || !ID.test(id)) return reply({ ok: false, code: "VALIDATION", message: "Say which document this is for." }, 400);
    const target: ReplacementTarget = kind === "item" ? { kind: "item", itemId: id } : kind === "renew" ? { kind: "renew", documentId: id } : { kind: "new", typeId: id };
    const valueIds = [...new Set(upload.form.getAll("valueIds").flatMap((v) => (typeof v === "string" && ID.test(v.trim()) ? [v.trim()] : [])))].slice(0, 60);
    try {
      const stored = await storeReplacement(guard.actor, {
        target,
        details: {
          reference: upload.text("reference").slice(0, 120),
          issuingAuthority: upload.text("issuingAuthority").slice(0, 160),
          expiresOn: upload.text("expiresOn").slice(0, 10),
          ratePercent: upload.text("ratePercent").slice(0, 8),
          title: upload.text("title").slice(0, 120),
          valueIds,
        },
        bytes: upload.bytes,
        sha256: upload.sha256,
        mediaType: upload.mediaType,
        originalFilename: upload.file.name,
        org: upload.org,
        store: upload.store,
        storeSettings: upload.storeSettings,
        policy: upload.policy,
      });
      return reply({ ok: true, documentId: stored.documentId, label: stored.label, byteSize: stored.byteSize, scanState: stored.scanState, faults: companyFaultViews(stored.warnings) }, 201);
    } catch (e) {
      if (e instanceof CompanyRefused) {
        const faults = companyFaultViews(e.faults);
        return reply({ ok: false, code: e.status === 404 ? "NOT_FOUND" : "VALIDATION", message: faults.find((f) => f.level === "block")?.message ?? "Check what you entered.", faults }, e.status);
      }
      if (e instanceof UploadRefusal) return storeRefusalReply(e.finding as StoreFinding, e.status, "document");
      return unexpectedFailure(e);
    }
  } finally {
    slot();
  }
}
