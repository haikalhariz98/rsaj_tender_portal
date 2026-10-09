"use server";

import { revalidatePath } from "next/cache";

import { beginAct, attributionRefusalState } from "@/app/_auth/act";
import { permissionGate, staffForAct, toAuditActor } from "@/app/_auth/actor";
import type { FormState } from "@/components/record-editor";
import { diffFields } from "@/lib/audit/diff";
import { writeAudit } from "@/lib/audit/record";
import { dayOf, dayToDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { ANNOUNCEMENT_CATEGORIES, ANNOUNCEMENT_FAULT_WORDS, CATEGORY_WORDS, publishFaults, withdrawFaults } from "@/lib/portal/projects/announcements";
import { FormReader } from "@/lib/validate";

/**
 * The announcements board's acts (FR-VND-014, Phase 4e): publish, pin or unpin, and withdraw. Each is the signed-in officer's own act, allowed only where the organisation has granted
 * `announcements.publish` to a role the officer holds (undecided until decided: refused, in words). An announcement is never edited: a correction is a withdrawal, with its reason kept, and
 * a new announcement. Every act is audited with before and after in its own transaction.
 */

const PATH = "/suppliers";
const NO_ZONE: FormState = { ok: false, message: "Set the organisation's time zone under Configuration, Organisation first: the day an announcement is published is the organisation's." };
const GONE: FormState = { ok: false, message: "That announcement no longer exists." };

export async function publishAnnouncement(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const gate = await permissionGate(actor, "announcements.publish");
  if (!gate.ok) return { ok: false, message: gate.message };
  const r = new FormReader(data);
  const title = r.text("title", "Title", { max: 400 });
  const body = r.text("body", "Announcement", { max: 16000 });
  const category = r.choice("category", "Category", ANNOUNCEMENT_CATEGORIES);
  const pinned = r.bool("pinned");
  if (r.failed) return { ok: false, errors: r.errors };
  const faults = publishFaults({ title, body, category: category ?? null });
  if (faults.length) return { ok: false, errors: Object.fromEntries(faults.map((f) => [f.code.startsWith("TITLE") ? "title" : f.code.startsWith("BODY") ? "body" : "category", ANNOUNCEMENT_FAULT_WORDS[f.code]])) };
  const begun = await beginAct(actor, data, "Announcement.publishedBy", { personField: "publishedByPersonId", onBehalf: false });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  const today = dayOf(new Date(), actor.organisationTimeZone);
  if (!today) return NO_ZONE;
  try {
    await db.$transaction(async (tx) => {
      const now = new Date();
      const row = await tx.announcement.create({ data: { organisationId: actor.organisationId, category: category!, title: title.trim(), body: body.trim(), pinned, publishedOn: dayToDate(today), publishedAt: now, publishedByPersonId: act.subjectPersonId }, select: { id: true } });
      await act.write(tx, row.id);
      await writeAudit(tx, { actor: toAuditActor(actor), organisationId: actor.organisationId, entity: "Announcement", entityId: row.id, entityLabel: `Announcement · ${title.trim()}` }, "CREATE", diffFields(null, { category: CATEGORY_WORDS[category!].en, title: title.trim(), pinned: pinned ? "Yes" : "No", shownTo: "every signed-in supplier, in the portal; not sent" }));
    });
  } catch (e) {
    const attribution = attributionRefusalState(e);
    if (attribution) return attribution;
    throw e;
  }
  revalidatePath(PATH);
  return { ok: true, message: "Published. Every signed-in supplier reads it on the portal's Announcements page." };
}

export async function pinAnnouncement(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const gate = await permissionGate(actor, "announcements.publish");
  if (!gate.ok) return { ok: false, message: gate.message };
  const r = new FormReader(data);
  const id = r.text("id", "Announcement", { required: true });
  const pin = r.choice("pin", "Pin", ["yes", "no"] as const, { required: true });
  if (r.failed || !pin) return { ok: false, errors: r.errors };
  return db.$transaction(async (tx) => {
    const before = await tx.announcement.findFirst({ where: { id, organisationId: actor.organisationId }, select: { id: true, title: true, pinned: true, withdrawnAt: true } });
    if (!before) return GONE;
    if (before.withdrawnAt) return { ok: false, message: ANNOUNCEMENT_FAULT_WORDS.ALREADY_WITHDRAWN };
    const pinned = pin === "yes";
    if (before.pinned === pinned) return { ok: true };
    await tx.announcement.update({ where: { id: before.id, organisationId: actor.organisationId }, data: { pinned } });
    await writeAudit(tx, { actor: toAuditActor(actor), organisationId: actor.organisationId, entity: "Announcement", entityId: before.id, entityLabel: `Announcement · ${before.title}` }, "UPDATE", diffFields({ pinned: before.pinned ? "Yes" : "No" }, { pinned: pinned ? "Yes" : "No" }));
    revalidatePath(PATH);
    return { ok: true };
  });
}

export async function withdrawAnnouncement(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const gate = await permissionGate(actor, "announcements.publish");
  if (!gate.ok) return { ok: false, message: gate.message };
  const r = new FormReader(data);
  const id = r.text("id", "Announcement", { required: true });
  const reason = r.text("reason", "Why it is withdrawn", { max: 4000 });
  if (r.failed) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "Announcement.withdrawnBy", { personField: "withdrawnByPersonId", onBehalf: false });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  try {
    return await db.$transaction(async (tx) => {
      const before = await tx.announcement.findFirst({ where: { id, organisationId: actor.organisationId }, select: { id: true, title: true, withdrawnAt: true } });
      if (!before) return GONE;
      const faults = withdrawFaults({ withdrawn: before.withdrawnAt != null, reason });
      if (faults.length) return faults.every((f) => f.code.startsWith("REASON")) ? { ok: false, errors: { reason: faults.map((f) => ANNOUNCEMENT_FAULT_WORDS[f.code]).join(" ") } } : { ok: false, message: faults.map((f) => ANNOUNCEMENT_FAULT_WORDS[f.code]).join(" ") };
      const moved = await tx.announcement.updateMany({ where: { id: before.id, organisationId: actor.organisationId, withdrawnAt: null }, data: { withdrawnAt: new Date(), withdrawnByPersonId: act.subjectPersonId, withdrawReason: reason.trim(), pinned: false } });
      if (moved.count !== 1) return { ok: false, message: ANNOUNCEMENT_FAULT_WORDS.ALREADY_WITHDRAWN };
      await act.write(tx, before.id);
      await writeAudit(tx, { actor: toAuditActor(actor), organisationId: actor.organisationId, entity: "Announcement", entityId: before.id, entityLabel: `Announcement · ${before.title}`, reason: reason.trim() }, "UPDATE", diffFields({ withdrawn: "No" }, { withdrawn: "Yes" }));
      revalidatePath(PATH);
      return { ok: true, message: "Withdrawn. It is no longer shown to suppliers; the record and the reason are kept." };
    });
  } catch (e) {
    const attribution = attributionRefusalState(e);
    if (attribution) return attribution;
    throw e;
  }
}
