"use server";

import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import { requireStaff, toAuditActor } from "@/app/_auth/actor";
import type { StaffActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { SIGN_IN_IMAGE_MAX_BYTES, signInImageFaultText } from "@/lib/organisation/logo";
import { SIGN_IN_FIELDS, type SignInPageInput } from "@/lib/organisation/sign-in-page";
import { clearSignInImage, storeSignInImage, storeSignInPage, type Subject } from "@/lib/organisation/sign-in-store";

const PATH = "/configuration/organisation";

const NO_ORG: FormState = { ok: false, message: "No organisation is configured. Run npm run setup before adding records." };

/// The sign-in page is what anyone sees before signing in, so a save refreshes it as well as this screen.
function refresh() {
  revalidatePath("/sign-in");
  revalidatePath(PATH);
}

async function subjectOf(actor: StaffActor): Promise<Subject | null> {
  const org = await db.organisation.findUnique({ where: { code: actor.organisationCode }, select: { id: true, name: true } });
  return org ? { organisationId: org.id, organisationName: org.name, actor: toAuditActor(actor) } : null;
}

/// Replace the sign-in image. Only PNG, JPEG or WebP, judged by the file's bytes, up to 512 KB.
export async function uploadSignInImage(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const who = await subjectOf(actor);
  if (!who) return NO_ORG;
  const file = data.get("signInImage");
  if (!(file instanceof File) || file.size === 0) return { ok: false, errors: { signInImage: signInImageFaultText("EMPTY", 0) } };
  // Next has already read the body, capped by serverActions.bodySizeLimit; this catches a file between the limit and that cap, with the form's own message.
  if (file.size > SIGN_IN_IMAGE_MAX_BYTES) return { ok: false, errors: { signInImage: signInImageFaultText("TOO_LARGE", file.size) } };
  const outcome = await storeSignInImage(db, who, new Uint8Array(await file.arrayBuffer()));
  if (!outcome.ok) return { ok: false, errors: { signInImage: outcome.error } };
  if (outcome.changed) refresh();
  return { ok: true, message: outcome.changed ? "Saved. The new image shows on the sign-in page now." : "That is already the sign-in image." };
}

/// Remove the sign-in image; the panel is drawn in the product's own colours again. A reason is required.
export async function removeSignInImage(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const who = await subjectOf(actor);
  if (!who) return NO_ORG;
  const reason = String(data.get("reason") ?? "").trim();
  if (!reason) return { ok: false, errors: { reason: "Say why the sign-in image is being removed." } };
  const outcome = await clearSignInImage(db, who, reason);
  if (!outcome.ok) return { ok: false, message: outcome.error };
  refresh();
  return { ok: true };
}

/// Save the sign-in page's words and links. Blank clears a setting; a link must be a web address.
export async function saveSignInPage(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const who = await subjectOf(actor);
  if (!who) return NO_ORG;
  const input = Object.fromEntries(SIGN_IN_FIELDS.map((f) => [f, String(data.get(f) ?? "")])) as SignInPageInput;
  const outcome = await storeSignInPage(db, who, input, String(data.get("reason") ?? ""));
  if (!outcome.ok) return { ok: false, errors: outcome.errors as Record<string, string> };
  if (outcome.changed) refresh();
  return { ok: true, message: outcome.changed ? "Saved. The sign-in page shows the new words now." : "Nothing changed." };
}
