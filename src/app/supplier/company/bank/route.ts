import { supplierUploadPost } from "../../../_auth/supplier";
import { AttributionRefused } from "@/lib/auth/attribution-store";
import { confirmSupplierPassword } from "@/lib/auth/supplier-identity";
import { db } from "@/lib/db";
import { RETRY_AFTER_SECONDS, uploadLimiter } from "@/lib/documents/concurrency";
import { UploadRefusal } from "@/lib/documents/service";
import type { Finding as StoreFinding } from "@/lib/documents/types";
import type { BankChangeInput } from "@/lib/portal/company/bank";
import { judge, sendBankChange } from "@/lib/portal/company/bank-store";
import { CompanyRefused } from "@/lib/portal/company/errors";
import { companyFaultViews } from "@/lib/portal/company/words";
import { CREDITOR_FIELDS, EMPTY_CREDITOR } from "@/lib/portal/registration/types";

import { readUpload, storeRefusalReply } from "../upload-request";

export const dynamic = "force-dynamic";

const reply = (body: Record<string, unknown>, status = 200, headers: Record<string, string> = {}) => Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

/**
 * A registered supplier changes its bank details (Phase 4c; the CPD rulings of 2026-10-07: a change is a new version, one officer checks it, the version in force stays in force until
 * then): `POST /supplier/company/bank`, multipart, the details, the bank statement and the signed GIRO authorisation in ONE request. Guarded in the portal's order and before a byte of the
 * body is read (`supplierUploadPost`), then the settings, the length, the body counted as it arrives, the type from the file's own bytes (`readUpload`). Then, in this order:
 *
 *  1. what stands in the way is judged on the details as they are now (a change that cannot be sent is refused WITHOUT asking for the password, so a wrong one is never counted for nothing);
 *  2. the password is asked again: a wrong one counts towards the lockout and is logged (`STEP_UP_FAILED`), and a locked or throttled account is refused;
 *  3. one transaction judges it all again on the locked rows, with the wording in force now (a stale or forged wording is refused), and writes the new version, the statement, the signed
 *     authorisation, the signatures and the audit rows, or nothing.
 *
 * The form names no supplier, day or time: the supplier is the session's and the day is the server's. The bank values are SULIT: they are never written to an answer, a log or the trail.
 */
export async function POST(request: Request) {
  const guard = await supplierUploadPost(request, "company");
  if (!guard.ok) return guard.response;
  const { actor, facts } = guard;
  const slot = uploadLimiter().tryAcquire();
  if (!slot) return reply({ ok: false, code: "BUSY", message: "The portal is busy. Try again in a few seconds." }, 503, { "Retry-After": String(RETRY_AFTER_SECONDS) });
  try {
    const read = await readUpload(actor, request, "statement");
    if (!read.ok) return read.response;
    const { upload } = read;
    const creditor = { ...EMPTY_CREDITOR };
    for (const k of CREDITOR_FIELDS) creditor[k] = upload.text(k).slice(0, 1000);
    const change: BankChangeInput = {
      creditor,
      statementFiles: 1,
      giro: {
        textVersionId: upload.text("giroTextVersionId").slice(0, 60),
        textSha256: upload.text("giroTextSha256").slice(0, 64),
        signatoryName: upload.text("signatoryName").slice(0, 160),
        signatoryDesignation: upload.text("signatoryDesignation").slice(0, 120),
        confirmed: upload.text("giroConfirmed") === "true",
      },
    };
    // The password is a field of the form and is read here only to be asked of the account; it is written nowhere.
    const password = typeof upload.form.get("password") === "string" ? (upload.form.get("password") as string) : "";

    const faults = (await judge(db, actor, change, password.length > 0)).filter((f) => f.level === "block");
    if (faults.length > 0) {
      const views = companyFaultViews(faults);
      return reply({ ok: false, code: "VALIDATION", message: views[0]!.message, faults: views }, 422);
    }

    const asked = await confirmSupplierPassword(actor, password, facts);
    if (!asked.ok) {
      if (asked.kind === "LOCKED") return reply({ ok: false, code: "LOCKED", message: "This account is locked after too many wrong passwords. Try again later." }, 403);
      if (asked.kind === "THROTTLED") return reply({ ok: false, code: "THROTTLED", message: "Too many attempts just now. Wait a few minutes and try again." }, 429);
      if (asked.kind === "POLICY_NOT_SET") return reply({ ok: false, code: "CLOSED", message: "Signing is closed: sign-in is not set up. Tell the procurement office." }, 503);
      return reply({ ok: false, code: "WRONG_PASSWORD", message: "That password is not right. Nothing was sent." }, 403);
    }

    try {
      const sent = await sendBankChange(actor, {
        change,
        stepUpAt: asked.at,
        bytes: upload.bytes,
        sha256: upload.sha256,
        mediaType: upload.mediaType,
        originalFilename: upload.file.name,
        org: upload.org,
        store: upload.store,
        storeSettings: upload.storeSettings,
        policy: upload.policy,
      });
      return reply({ ok: true, version: sent.version, sentOn: sent.sentOn }, 201);
    } catch (e) {
      if (e instanceof CompanyRefused) {
        const views = companyFaultViews(e.faults);
        return reply({ ok: false, code: "VALIDATION", message: views.find((f) => f.level === "block")?.message ?? "Check what you entered.", faults: views }, e.status);
      }
      if (e instanceof UploadRefusal) return storeRefusalReply(e.finding as StoreFinding, e.status, "statement");
      if (e instanceof AttributionRefused) return reply({ ok: false, code: "SIGNATURE_REFUSED", message: e.faults.map((f) => f.en).join(" ") }, 403);
      throw e;
    }
  } finally {
    slot();
  }
}
