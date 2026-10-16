import type { NextRequest } from "next/server";

import { staffRoute } from "@/app/_auth/route";
import { exerciseIsHidden } from "@/app/_auth/sulit";
import { db } from "@/lib/db";
import { downloadRequestFault } from "@/lib/documents/request-guard";
import { FILED_FILE_STATUS, FILED_FILE_WORDS, filedFileFaults, NOT_FILED_YET_WORDS, parseFiledFileRequest } from "@/lib/opening/filed-file";
import { filedVersionOf, loadFiledFileFacts } from "@/lib/opening/filed-file-store";
import { countAndJudgeCounted } from "@/lib/portal/bids/rate-store";
import { ensureFileMoved } from "@/lib/sealing/online-file-mover";
import { logSealedRefusal, recordIdOrNull } from "@/lib/sealing/unlock-store";

export const dynamic = "force-dynamic";

const refusal = (code: string, message: string, status: number, fields?: Record<string, string>) =>
  Response.json({ ok: false, code, message, error: message, ...(fields ? { fields } : {}) }, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });

/**
 * The download of an opening-check file after the opening is finalised, through the filed document (wave 3c plan §4.2, ruling 20cl). Internal copy only (the shared guard refuses the public one).
 * POST form fields `exerciseId`, `openingId`, `fileId`; nothing else is accepted.
 *
 * The order, and why. Signed in, from a page of this origin, with a form body (`staffRoute`), then SEC-4: a download another site started is refused before anything is read. The form, parsed in one place.
 * An administrator account is refused next (20at, 20au), before a file is looked up. An exercise the actor may not see reads as one that is not there. The pure faults are judged on facts read from the
 * opening and the frozen rules, never the live parts (G1). Only then is the file filed, once (`ensureFileMoved` is a no-op for a file already filed), and the answer is a 303 to the document version route,
 * which applies the SULIT entitlement and logs the download as it does for every filed document. This route sends no bytes itself and reads nothing sealed.
 */
export async function POST(req: NextRequest) {
  const guard = await staffRoute({ contentTypes: ["application/x-www-form-urlencoded", "multipart/form-data"] });
  if (!guard.ok) return guard.response;
  const actor = guard.actor;
  if (downloadRequestFault(req.headers.get("sec-fetch-site"))) return refusal("CROSS_SITE", "This file is opened from the portal's own pages. Open the portal and download it from there.", 403);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return refusal("VALIDATION", "Send the exercise, opening and file as a form.", 400, { body: "Send a form with exerciseId, openingId and fileId." });
  }
  const parsed = parseFiledFileRequest(form);
  if (!parsed.ok) return refusal("VALIDATION", "The request is not valid.", 400, parsed.fields);
  const { exerciseId, openingId, fileId } = parsed.value;
  // A refusal after the exercise is known to be this actor's to see is written down, as the sealed-file route does, with the reason and the file (an unknown or hidden exercise is not: it reads as absent).
  // The first refusal in each window for the account is written and the rest are counted (the same limiter the sealed doors use for refusals), so a script cannot fill the table.
  const logRefusal = async (reasonCode: string) => {
    const seen = await countAndJudgeCounted(db, { organisationId: actor.organisationId, accountId: actor.accountId, action: "officer-sealed-refusal" }, new Date());
    if (seen.count === 1) await logSealedRefusal({ organisationId: actor.organisationId, exerciseId, kind: "DOWNLOAD", staffPersonId: actor.personId, reasonCode, recordId: recordIdOrNull(fileId) });
  };

  if (actor.isAdministrator) {
    await logRefusal("ADMINISTRATOR");
    return refusal("ADMINISTRATOR", FILED_FILE_WORDS.ADMINISTRATOR, FILED_FILE_STATUS.ADMINISTRATOR);
  }
  if (await exerciseIsHidden(actor, exerciseId)) return refusal("NOT_FOUND", "Not found", 404);
  const facts = await loadFiledFileFacts({ organisationId: actor.organisationId, exerciseId, openingId, fileId });
  if (!facts) return refusal("NOT_FOUND", "Not found", 404);
  const faults = filedFileFaults({ administrator: false, finalised: facts.finalised, fileOnOpening: facts.fileOnOpening, checked: facts.checked });
  if (faults.length > 0) {
    const code = faults[0].code as keyof typeof FILED_FILE_STATUS;
    await logRefusal(code);
    // The first fault's words only: a caller holding a file id learns no more about the file than one reason.
    return refusal(code, FILED_FILE_WORDS[code], FILED_FILE_STATUS[code]);
  }

  const moved = await ensureFileMoved(actor.organisationId, fileId);
  if (moved.status === "FAILED") {
    await logRefusal(moved.code);
    return refusal(moved.code, FILED_FILE_WORDS[moved.code], 409);
  }
  const filed = await filedVersionOf(actor.organisationId, fileId);
  if (!filed) {
    await logRefusal("NOT_FILED_YET");
    return refusal("NOT_FILED_YET", NOT_FILED_YET_WORDS, 409);
  }
  const location = `/api/documents/versions/${filed.versionId}`;
  // The matrix asks in JSON (a fetch cannot read a redirect's address); a plain form post is still answered with the 303.
  if ((req.headers.get("accept") ?? "").includes("application/json")) return Response.json({ ok: true, location }, { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  return new Response(null, { status: 303, headers: { Location: location, "Cache-Control": "no-store" } });
}

/// HEAD is refused outright, as on every download route (SEC-4): it must not file a document or reach the version route.
export async function HEAD() {
  return new Response(null, { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
