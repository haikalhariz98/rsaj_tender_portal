import { FORM_TOKEN_HEADER } from "../../../_auth/supplier";
import { readCookie } from "@/lib/auth/cookie-header";
import { checkFormToken } from "@/lib/auth/form-secret";
import { formTokenIssuedAt } from "@/lib/auth/form-token";
import { requestFacts } from "@/lib/auth/request";
import { foreignRequestFault } from "@/lib/auth/request-guard";
import { refusalBody, REFUSAL_STATUS } from "@/lib/auth/route-refusal";
import { STAFF_COOKIE, SUPPLIER_COOKIE } from "@/lib/auth/routes";
import { db } from "@/lib/db";
import { filenameFault } from "@/lib/documents/access";
import { limitBodyPaced } from "@/lib/documents/body";
import { registerUploadLimiter, RETRY_AFTER_SECONDS } from "@/lib/documents/concurrency";
import { formatBytes } from "@/lib/documents/labels";
import { readLimit } from "@/lib/documents/limits";
import { mediaFault, sniffMediaType, SNIFF_BYTES } from "@/lib/documents/media";
import { blobStore, sha256Hex } from "@/lib/documents/store";
import { honeypotTripped, HONEYPOT_FIELD, portalCapacity, PORTAL_APPLICATION_SERIES_KEY } from "@/lib/portal/apply";
import { dayToDate } from "@/lib/dates";
import { formatOrgDateTime } from "@/lib/format";
import { previewNext, type NumberingReset } from "@/lib/numbering/series";
import { loadRegisterSettings, type RegisterSettings } from "@/lib/portal/apply-repo";
import { deploymentOrganisation } from "@/lib/portal/deployment";
import { APPLY } from "@/lib/portal/labels";
import { overAddressLimit, registerAddressCounter } from "@/lib/portal/register/address-limit";
import { REGISTER_BODY_DEADLINE_SECONDS, REGISTER_BODY_GRACE_SECONDS, REGISTER_BODY_MIN_BYTES_PER_SECOND, REGISTER_TEXT_ALLOWANCE } from "@/lib/portal/register/ceiling";
import { currentTextsOf } from "@/lib/portal/register/config";
import { checkFiles, type FileToCheck } from "@/lib/portal/register/file-checks";
import { documentFilePart, REGISTER_APPLICATION_PART, STATEMENT_FILE_PART, type RegisterReply } from "@/lib/portal/register/contract";
import { blockingPublicFaults, publicApplicationFaults, publicFaultViews } from "@/lib/portal/register/faults";
import { heldDraft } from "@/lib/portal/register/held-draft";
import { parsePublicApplication } from "@/lib/portal/register/parse";
import { receivePublicApplication, type HeldFile } from "@/lib/portal/register/receive-store";
import { findSpent, tokenSha256 } from "@/lib/portal/register/token-store";
import { registrationContextFor } from "@/lib/portal/registration/context-store";
import type { UploadKind } from "@/lib/portal/registration/upload";
import { gate, SURFACE_ENV, surfaceOf } from "@/lib/portal/surface";
import { normaliseRegistrationNo } from "@/lib/suppliers/identity";

import { stampNow } from "../../../suppliers/shared";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;

const reply = (body: RegisterReply, status = 200, headers: Record<string, string> = {}) => Response.json(body, { status, headers: { "cache-control": "no-store", ...headers } });
const closed = () => reply({ ok: false, code: "CLOSED", message: APPLY.notOpenOnSubmit.en }, 503);
const busy = (headers: Record<string, string> = {}) => reply({ ok: false, code: "BUSY", message: APPLY.busy.en }, 503, headers);
const expired = () => reply({ ok: false, code: "FORM_EXPIRED", message: APPLY.submitExpired.en }, 400);
const unreadable = (status = 400) => reply({ ok: false, code: "UNREADABLE", message: APPLY.submitUnreadable.en }, status);
const tooLarge = (ceiling: bigint) => reply({ ok: false, code: "TOO_LARGE", message: APPLY.submitTooLarge(formatBytes(ceiling)).en }, 413);
const tooSlow = () => reply({ ok: false, code: "TOO_SLOW", message: APPLY.submitTooSlow.en }, 408);

/**
 * The one submission of a supplier's registration (ADR 0041, plan section 3): `POST /supplier/register/submit`, multipart, from a stranger who is not signed in. Every field of the five
 * steps and every file travel in this one post, and the server judges all of it again: its answer is final. A route handler and not a server action: the public copy refuses every
 * server action, so a stranger can never reach a staff one through this form.
 *
 * The route is left out of the proxy (`src/proxy.ts`), which would copy the body into memory and keep only its first 10 MB, so it asks the boundary's own question itself, first. Then,
 * each refusing with words and none reading further (plan 3.1, with the token moved forward, decisions log 2026-10-21):
 *
 * 1. the boundary (`gate`), as the proxy would answer;
 * 2. the Origin guard (multipart only);
 * 3. the signed form token (`x-form-token`). A genuine token already spent is answered with its application's reference, before anything else is read: a retry is never refused for a
 *    limit its own first send took, nor for the day it waited, and never makes a second application;
 * 4. the register's readiness, and the day's count, before the body;
 * 5. a slot of the register's own limiter (security audit H1), held to the end: taken only now, so a request refused above never holds one, and strangers never take the slots staff and
 *    signed-in suppliers upload through;
 * 6. the stated length against the ceiling derived from the settings (none stated: refused);
 * 7. the body, read through a counter that cuts it off at the same ceiling, at a deadline and under a minimum rate (`limitBodyPaced`);
 * 8. the bait field (a filled one is answered as received, and nothing is written or spent);
 * 9. the shape of the application and of its parts;
 * 10. each file, by its own bytes, against the type, size and quotas;
 * 11. every step's rules, by step and field (the files' faults with them, so the applicant sees all at once);
 * 12. one transaction (`receivePublicApplication`), which judges the counts and the agreed texts again under its locks.
 *
 * Nothing is written before step 12, and a refusal there writes nothing either: not a row, not a byte. Every file is stored "Not scanned": nothing scans here. Only PDF and images are
 * taken (RSEC-2: the organisation's supplier types less CSV). An officer's download of such a file takes a fresh scan and is refused on a threat, a failed scan, or (once a scanner is
 * configured) a file it did not check; with no scanner it is served only after the officer confirms, and never shown as clean (`applicant-scan.ts`, the staff download route).
 */
export async function POST(request: Request) {
  // 1. The boundary's own question: the copy serves this path, with no staff cookie on the public copy and no supplier cookie on the staff copy, and no server action.
  const cookies = request.headers.get("cookie");
  const verdict = gate({
    surface: surfaceOf(process.env[SURFACE_ENV]),
    method: request.method,
    pathname: new URL(request.url).pathname,
    hasServerAction: request.headers.has("next-action"),
    staffCookie: Boolean(readCookie(cookies, STAFF_COOKIE)),
    supplierCookie: Boolean(readCookie(cookies, SUPPLIER_COOKIE)),
    development: process.env.NODE_ENV === "development",
  });
  if (verdict.kind === "notFound") return new Response("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  if (verdict.kind !== "next") return Response.json(refusalBody("NOT_SIGNED_IN"), { status: 401, headers: { "cache-control": "no-store" } });
  // 2. Same origin, and a form body.
  const fault = foreignRequestFault(request, ["multipart/form-data"]);
  if (fault) return Response.json(refusalBody(fault.code, fault.message), { status: REFUSAL_STATUS[fault.code], headers: { "cache-control": "no-store" } });
  // RSEC-1(a): every submission that reaches the route is counted against its address, refused or received. Nothing is counted while the address is unknown.
  const address = requestFacts((n) => request.headers.get(n)).sourceAddress;
  if (address) registerAddressCounter().hit(address, Date.now());
  try {
    return await receive(request, address);
  } catch (e) {
    // The applicant is told nothing of the cause; the server's log holds its kind only (security audit L7): a database error prints its arguments, bank details among them.
    console.error("Public supplier application failed", errorKind(e));
    return reply({ ok: false, code: "TRY_AGAIN", message: APPLY.tryAgainLater.en }, 500);
  }
}

/// What a failure was, for the server's log: its kind and code, never its message or arguments.
function errorKind(e: unknown): { name: string; code: string | null } {
  const x = (typeof e === "object" && e !== null ? e : {}) as { name?: unknown; code?: unknown };
  return { name: typeof x.name === "string" ? x.name : typeof e, code: typeof x.code === "string" ? x.code : null };
}

/// A reference as the series would give the next application, read without moving it (security audit L5). The form only: the bait's answer must look like a real one.
async function baitReference(register: RegisterSettings): Promise<string> {
  const row = await db.numberingSeries.findUnique({ where: { organisationId_key: { organisationId: register.org.id, key: PORTAL_APPLICATION_SERIES_KEY } } });
  const on = dayToDate(register.org.today!);
  return row ? previewNext({ ...row, resetOn: row.resetOn as NumberingReset }, on) : "";
}

async function receive(request: Request, address: string | null): Promise<Response> {
  const now = stampNow();

  // 3. The token. Its signature is checked first, so EXPIRED means a token this deployment made: if it was spent, its reference is the answer.
  const token = request.headers.get(FORM_TOKEN_HEADER);
  const verdict = checkFormToken("register", token, now);
  if (verdict === "KEY_NOT_SET") return closed();
  // Any token of the register's shape is looked up before "out of date" is said, not only a well-signed one (step 3 review): a token that was spent and now fails its signature (the
  // key rotated) or its clock (another instance's) is answered with its application's reference. The browser reads "out of date" as "not spent" and sends a fresh token, so saying it of
  // a spent one would make a second application. Only a token that was once spent can match: a forged one finds nothing.
  if (verdict !== "OK" && (token == null || formTokenIssuedAt("register", token) == null)) return expired();
  const deployment = await deploymentOrganisation();
  if (!deployment) return closed();
  const tokenSha = tokenSha256(token!);
  const spent = await findSpent(db, deployment.id, tokenSha);
  // RSEC-5: a retry is told when its first send was received.
  if (spent) return reply({ ok: true, reference: spent.reference, firstReceived: formatOrgDateTime(spent.receivedAt, deployment.timeZone) });
  if (verdict !== "OK") return expired();

  // 4. Readiness (the page asks the same reader), and the day's count without a lock: the locked counts are judged again in the transaction.
  const register = await loadRegisterSettings();
  if (!register || register.missing.length > 0 || register.ceiling == null || register.org.id !== deployment.id) return closed();
  const lastDay = await db.portalApplication.count({ where: { organisationId: register.org.id, receivedAt: { gte: new Date(now.getTime() - DAY_MS) } } });
  if (portalCapacity({ lastDay, forNumber: 0 }, register.limits) !== "OPEN") return busy();
  // RSEC-1(a): the address's own count, after a spent token was answered (a retry learns its reference whatever its address sent since).
  const windowMs = (register.addressLimit.minutes ?? 0) * 60_000;
  if (address && overAddressLimit(registerAddressCounter().count(address, Date.now(), windowMs), register.addressLimit, address)) return reply({ ok: false, code: "TOO_MANY", message: APPLY.tooManyFromAddress.en }, 429, { "Retry-After": String(Math.ceil(windowMs / 1000)) });

  // 5. Capacity, before the body: one process holds only so many strangers' bodies at once, apart from everyone else's.
  const slot = registerUploadLimiter().tryAcquire();
  if (!slot) return busy({ "Retry-After": String(RETRY_AFTER_SECONDS) });
  try {
    return await receiveBody(request, { now, register, ceiling: register.ceiling, token: token!, tokenSha });
  } finally {
    slot();
  }
}

async function receiveBody(request: Request, i: { now: Date; register: RegisterSettings; ceiling: bigint; token: string; tokenSha: string }): Promise<Response> {
  const { now, register, ceiling, token, tokenSha } = i;

  // 6. The stated length, against the ceiling the settings give. The body is never pulled for a request refused here.
  const declared = request.headers.get("content-length");
  if (declared == null || declared.trim() === "") return reply({ ok: false, code: "NO_LENGTH", message: APPLY.submitNoLength.en }, 411);
  if (!/^[0-9]{1,20}$/.test(declared.trim())) return unreadable();
  if (BigInt(declared.trim()) > ceiling) return tooLarge(ceiling);

  // 7. The body, counted as it arrives and cut off at the same limit, whatever was stated, at the deadline and under the minimum rate.
  const limited = limitBodyPaced(request.body, readLimit(ceiling), { deadlineMs: REGISTER_BODY_DEADLINE_SECONDS * 1000, minBytesPerSecond: REGISTER_BODY_MIN_BYTES_PER_SECOND, graceMs: REGISTER_BODY_GRACE_SECONDS * 1000 });
  let form: FormData | null;
  try {
    form = await new Response(limited.stream, { headers: { "content-type": request.headers.get("content-type") ?? "" } }).formData();
  } catch {
    if (limited.tooSlow()) return tooSlow();
    return limited.exceeded() ? tooLarge(ceiling) : unreadable();
  }

  // 8. A filled bait field is a script: answered as received, with a reference in the series' own form, so the answer cannot be told from a real one (security audit L5). Nothing is
  // written, the series does not move, and the token is not spent.
  if (honeypotTripped(form.get(HONEYPOT_FIELD))) return reply({ ok: true, reference: await baitReference(register) });

  // 9. The application's shape, and every part named for a row of it (or the statement). Anything else is not this form's.
  const raw = form.get(REGISTER_APPLICATION_PART);
  // Security audit M1: never parsed past the allowance it was sized by. A character is at least one byte, so a longer string is a longer body.
  if (typeof raw !== "string" || raw.length > Number(REGISTER_TEXT_ALLOWANCE)) return unreadable();
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return unreadable();
  }
  const parsed = parsePublicApplication(json);
  if (!parsed.ok) return unreadable();
  const body = parsed.value;
  // A row the applicant says does not apply takes no file: a part sent for one is not this form's (review minor).
  const parts = new Map<string, { kind: UploadKind; key: string | null }>([[STATEMENT_FILE_PART, { kind: "statement", key: null }], ...body.documents.filter((d) => !d.notApplicable).map((d) => [documentFilePart(d.clientKey), { kind: "document" as const, key: d.clientKey }] as const)]);
  let sent: { part: { kind: UploadKind; key: string | null }; file: File }[] = [];
  for (const [name, value] of form.entries()) {
    if (name === REGISTER_APPLICATION_PART || name === HONEYPOT_FIELD) continue;
    const part = parts.get(name);
    if (!part || !(value instanceof File)) return unreadable();
    sent.push({ part, file: value });
  }

  // 10. Each file, in the order sent, by what its own bytes say it is, through the page's own check (`checkFiles`): the quotas count across the whole application, so each is judged
  // once. A file whose name or declared type disagrees with its bytes is refused as well: a disguise or a mistake, and neither is filed.
  const store = register.upload.store;
  const read: FileToCheck<File>[] = [];
  for (const { part, file } of sent) {
    const sniffed = sniffMediaType(new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer()));
    const disguised = filenameFault(file.name) != null || mediaFault(sniffed, { filename: file.name, contentType: file.type }, { allowedMediaTypes: [...store.allowedTypes], maxBytes: store.capBytes }) != null;
    read.push({ key: part.key, kind: part.kind, size: BigInt(file.size), type: sniffed, disguised, item: file });
  }
  sent = [];
  const checked = checkFiles(read, register.upload);
  read.length = 0;
  const fileFaults = checked.faults;
  const accepted = checked.accepted;
  const fileCounts = checked.counts;
  const statementCount = checked.statementCount;

  // 11. Every step's rules, on the body and the files that were taken. The context is the organisation's, with the codes chosen and the applicant's own number and contact.
  const ctx = await registrationContextFor(db, register.org.id, register.settings, [...new Set(body.documents.flatMap((d) => d.valueIds))], { registrationNoKey: normaliseRegistrationNo(body.company.registrationNo), contactName: body.company.contact.name });
  const ruleFaults = publicApplicationFaults(body, heldDraft(body, fileCounts, statementCount), ctx, register.step1);
  if (fileFaults.length > 0 || blockingPublicFaults(ruleFaults).length > 0) return reply({ ok: false, code: "VALIDATION", message: APPLY.nothingSent.en, faults: [...fileFaults, ...publicFaultViews(ruleFaults)], current: currentTextsOf(ctx) }, 422);

  // 12. The bytes, one copy each, and the one transaction.
  const files = new Map<string, HeldFile[]>();
  const statement: HeldFile[] = [];
  form = null;
  // Each file let go as soon as its bytes are copied (security audit M1): the form and the lists no longer hold it, so a body is not held twice over while the next is read.
  for (let a = accepted.shift(); a; a = accepted.shift()) {
    const bytes = new Uint8Array(await a.item.arrayBuffer());
    // Taken by `checkFiles`, so its bytes said a type the store takes.
    const held: HeldFile = { bytes, sha256: sha256Hex(bytes), mediaType: a.type!, originalFilename: a.item.name };
    if (a.key == null) statement.push(held);
    else files.set(a.key, [...(files.get(a.key) ?? []), held]);
  }
  const blobs = blobStore();
  if ("fault" in blobs) return closed();
  const outcome = await receivePublicApplication({
    register,
    token: { sha256: tokenSha, issuedAt: formTokenIssuedAt("register", token)! },
    body,
    files,
    statement,
    store: blobs.store,
    sourceAddress: requestFacts((n) => request.headers.get(n)).sourceAddress,
    now,
  });
  if (outcome.ok) return reply({ ok: true, reference: outcome.reference });
  if (outcome.kind === "VALIDATION") return reply({ ok: false, code: "VALIDATION", message: APPLY.nothingSent.en, faults: publicFaultViews(outcome.faults), current: outcome.current }, 422);
  return outcome.kind === "BUSY" ? busy() : closed();
}
