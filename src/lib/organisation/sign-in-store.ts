/**
 * Writing the sign-in page's image and words, and recording it.
 *
 * One path for everything that changes them: the configuration screen's actions call these, and so does any loader script, so the audit
 * row is the same whichever way the change was made. Each runs under the organisation's row lock, as the logo's writes do, so the trail's
 * "before" is what the write replaced, and the write and its audit row are one transaction.
 */
import { diffFields, snapshotFields } from "@/lib/audit/diff";
import { writeAudit, type Tx } from "@/lib/audit/record";
import type { db } from "@/lib/db";
import type { AuditActor } from "@/lib/auth/types";

import { inspectSignInImage, signInImageFaultText } from "./logo";
import { normaliseSignInPage, SIGN_IN_FIELDS, signInPageFaults, type SignInField, type SignInPageInput } from "./sign-in-page";

type Client = Pick<typeof db, "$transaction">;
export interface Subject {
  organisationId: string;
  organisationName: string;
  actor: AuditActor;
}

async function lockOrganisation(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM "Organisation" WHERE id = ${id} FOR UPDATE`;
}

const MEDIA_LABEL = { "image/png": "PNG", "image/jpeg": "JPEG", "image/webp": "WebP" } as const;

/// How an image reads in the trail: its fingerprint, type, size and dimensions, never its bytes.
function imageFacts(l: { sha256: string; mediaType: string; sizeBytes: number; width: number; height: number }) {
  return {
    fingerprint: l.sha256,
    type: MEDIA_LABEL[l.mediaType as keyof typeof MEDIA_LABEL] ?? "Image",
    size: `${Math.ceil(l.sizeBytes / 1024)} KB`,
    dimensions: `${l.width} × ${l.height}`,
  };
}

export type ImageOutcome = { ok: true; changed: boolean } | { ok: false; error: string };

/// Replace the sign-in image. The file is judged by its own bytes; the same bytes again change nothing and write nothing.
export async function storeSignInImage(client: Client, who: Subject, bytes: Uint8Array): Promise<ImageOutcome> {
  const check = inspectSignInImage(bytes);
  if (!check.ok) return { ok: false, error: signInImageFaultText(check.fault, check.sizeBytes) };
  const changed = await client.$transaction(async (tx) => {
    await lockOrganisation(tx, who.organisationId);
    const prior = await tx.organisationSignInImage.findUnique({ where: { organisationId: who.organisationId }, select: { sha256: true, mediaType: true, sizeBytes: true, width: true, height: true } });
    if (prior?.sha256 === check.sha256) return false;
    const row = { bytes: Buffer.from(bytes), mediaType: check.mediaType, sizeBytes: check.sizeBytes, sha256: check.sha256, width: check.width, height: check.height, uploadedAt: new Date() };
    const saved = await tx.organisationSignInImage.upsert({
      where: { organisationId: who.organisationId },
      create: { organisationId: who.organisationId, ...row },
      update: row,
      select: { id: true },
    });
    await writeAudit(
      tx,
      { actor: who.actor, organisationId: who.organisationId, entity: "OrganisationSignInImage", entityId: saved.id, entityLabel: who.organisationName },
      prior ? "UPDATE" : "CREATE",
      diffFields(prior ? imageFacts(prior) : null, imageFacts(check)),
    );
    return true;
  });
  return { ok: true, changed };
}

/// Remove the sign-in image; the panel is drawn in the product's own colours again. The reason is recorded.
export async function clearSignInImage(client: Client, who: Subject, reason: string): Promise<{ ok: true } | { ok: false; error: string }> {
  return client.$transaction(async (tx) => {
    await lockOrganisation(tx, who.organisationId);
    const image = await tx.organisationSignInImage.findUnique({ where: { organisationId: who.organisationId }, select: { id: true, sha256: true, mediaType: true, sizeBytes: true, width: true, height: true } });
    if (!image) return { ok: false as const, error: "There is no sign-in image to remove." };
    await tx.organisationSignInImage.delete({ where: { id: image.id, organisationId: who.organisationId } });
    await writeAudit(tx, { actor: who.actor, organisationId: who.organisationId, entity: "OrganisationSignInImage", entityId: image.id, entityLabel: who.organisationName, reason }, "DELETE", snapshotFields(imageFacts(image)));
    return { ok: true as const };
  });
}

export type PageOutcome = { ok: true; changed: boolean } | { ok: false; errors: Partial<Record<SignInField, string>> };

/// Save the sign-in page's words and links. Refused, field by field, with what to fix; blank clears a setting.
export async function storeSignInPage(client: Client, who: Subject, input: SignInPageInput, reason = ""): Promise<PageOutcome> {
  const faults = signInPageFaults(input);
  if (Object.keys(faults).length > 0) return { ok: false, errors: faults };
  const after = normaliseSignInPage(input);
  const changed = await client.$transaction(async (tx) => {
    await lockOrganisation(tx, who.organisationId);
    const prior = await tx.organisationSignInPage.findUnique({ where: { organisationId: who.organisationId } });
    const changes = diffFields(Object.fromEntries(SIGN_IN_FIELDS.map((f) => [f, prior?.[f] ?? null])), after);
    if (changes.length === 0) return false;
    const saved = await tx.organisationSignInPage.upsert({
      where: { organisationId: who.organisationId },
      create: { organisationId: who.organisationId, ...after },
      update: after,
      select: { id: true },
    });
    await writeAudit(tx, { actor: who.actor, organisationId: who.organisationId, entity: "OrganisationSignInPage", entityId: saved.id, entityLabel: who.organisationName, reason }, prior ? "UPDATE" : "CREATE", changes);
    return true;
  });
  return { ok: true, changed };
}
