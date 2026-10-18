"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { FormState } from "@/components/record-editor";
import { attributionRefusalState, beginAct } from "@/app/_auth/act";
import { confirmBackdating, loadBackdateToConfirm } from "@/lib/auth/backdate-store";
import { confirmRefusal } from "@/lib/auth/backdate-confirmation";
import { uniqueViolationIndex } from "@/lib/scope/unique-violation";

import { hiddenExercises } from "@/app/_auth/sulit";
import { requireStaff, staffForAct } from "@/app/_auth/actor";
import { markUpTo } from "@/lib/inbox/paging";
import { markAllRead, markBackdateNoticeRead, openNotice } from "@/lib/inbox/store";
import { db } from "@/lib/db";

/**
 * Mark every unread notice of the signed-in person's own read, in one statement on the server: not the ids a page happened to show, so the bell and the sidebar count are
 * cleared whatever the number of notices. Only notices addressed to the person, and not hidden from them, are touched, whatever the form says. The form carries the time
 * the page was drawn, and a notice that arrived after it is left unread: it has not been seen. Only the first reading is recorded, and the database lets nothing else about a
 * notice change.
 */
export async function markNoticesRead(data: FormData): Promise<void> {
  const actor = await requireStaff();
  const now = new Date();
  const upTo = markUpTo(String(data.get("upTo") ?? ""), now);
  if (!upTo) return;
  await markAllRead(db, { organisationId: actor.organisationId, personId: actor.personId }, await hiddenExercises(actor), now, upTo);
  revalidatePath("/inbox");
  revalidatePath("/", "layout");
}

/**
 * Open one notice (AC-47): the action on a notice's link. The reader's own notice is marked read (the one kind that asks for an act, a back-dated signature to confirm, is not: it is read when
 * the confirmation is recorded), the layout is revalidated so the bell and the sidebar count fall, and the reader goes to the notice's address. Never run by a page render or a prefetch.
 * A notice that is not the reader's, is hidden from them or has no address sends them back to the inbox.
 */
export async function openNoticeAction(data: FormData): Promise<void> {
  const actor = await requireStaff();
  const opened = await openNotice(db, { organisationId: actor.organisationId, personId: actor.personId }, await hiddenExercises(actor), String(data.get("id") ?? ""), new Date());
  if (!opened) redirect("/inbox");
  revalidatePath("/", "layout");
  redirect(opened.href);
}

/**
 * Confirm a back-dated signature that names you as authorising it (NFR-AUD-006, ruling item 9, Phase 5a). A signature of your own: the password is asked again, every time,
 * before the transaction. Said first, so that nobody types a password to be told no: only the person named confirms, once, and an administrator account does not (a signed
 * act outside configuration is refused to one, as everywhere). The confirmation, its audit row and its attribution are one transaction.
 */
export async function confirmBackdatingAction(_prev: FormState, data: FormData): Promise<FormState> {
  const guard = await staffForAct("SIGNATURE");
  if (!guard.ok) return guard.state;
  const actor = guard.actor;
  const attributionId = String(data.get("attributionId") ?? "");
  const early = await loadBackdateToConfirm(db, actor, attributionId);
  // The same check the page asks before it draws the button (`confirmRefusal`).
  const refused = confirmRefusal(early, actor);
  if (refused) return { ok: false, message: refused };
  const begun = await beginAct(actor, data, "BackdateConfirmation.confirmedBy", { personField: "personId", document: { entity: "ActAttribution", id: attributionId } });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  try {
    const outcome = await db.$transaction(async (tx) => {
      const done = await confirmBackdating(tx, actor, attributionId, new Date());
      // The office the signer held (NFR-SIG-001): the one they hold, where they hold exactly one; with several, which of them they confirm in is not asked, and none is recorded.
      // AC-47: the notice that asked for this confirmation is read now, in the same transaction.
      if (done.ok) await markBackdateNoticeRead(tx, { organisationId: actor.organisationId, personId: actor.personId }, attributionId, new Date());
      if (done.ok) await act.write(tx, done.confirmationId, { document: { entity: "ActAttribution", id: attributionId }, roleCode: actor.offices.length === 1 ? actor.offices[0].roleCode : null });
      return done;
    });
    if (!outcome.ok) return { ok: false, message: outcome.faults.map((f) => f.en).join(" ") };
  } catch (e) {
    const refusedAttribution = attributionRefusalState(e);
    if (refusedAttribution) return refusedAttribution;
    // A second request that passed the same checks while the first was writing (a double click, two tabs): the unique index holds the rule, and it is said in words.
    if (uniqueViolationIndex(e) === "BackdateConfirmation_attributionId_key") return { ok: false, message: "You have already confirmed this back-dating." };
    throw e;
  }
  revalidatePath("/inbox");
  revalidatePath(`/inbox/${attributionId}`);
  revalidatePath("/", "layout");
  return { ok: true, message: "Confirmed. The back-dating now reads as confirmed by you." };
}
