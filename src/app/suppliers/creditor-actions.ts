"use server";

import type { FormState } from "@/components/record-editor";
import { diffFields } from "@/lib/audit/diff";
import { CREDITOR_PROFILE_FIELDS, creditorDecision, creditorEventRow, creditorNamedFacts, creditorPermissionState } from "@/lib/auth/creditor-access-store";
import { refusalWords } from "@/lib/auth/sulit-access";
import { writeSulitEvents } from "@/lib/auth/sulit-store";
import { dayToDate, todayIn } from "@/lib/dates";
import { db } from "@/lib/db";
import { isLive } from "@/lib/documents/evidence";
import { creditorReviewFaults, creditorReviewText } from "@/lib/suppliers/creditor-review";
import { VERIFICATION_LABEL } from "@/lib/suppliers/labels";
import { blocking, VERIFICATION_STATES } from "@/lib/suppliers/types";
import { FormReader } from "@/lib/validate";

import { beginAct } from "@/app/_auth/act";
import { staffForAct, toAuditActor } from "@/app/_auth/actor";
import { activePerson, audit, CHANGED, GONE, inSupplier, label, Refusal, stampNow } from "./shared";

/**
 * An officer checks a supplier's bank details (Phase 4b, FR-VND-005; CPD, 2026-10-07: ONE officer, no second-officer step). A signed act: the officer's own sign-in and password
 * (`CreditorProfile.verifiedBy`, a signature-class slot an administrator account is refused at the door), the exact profile it signs, and the day the check was made.
 *
 * The officer must be able to read the profile they check: named by the route of the supplier's registration, or holding `sulit.read.creditorProfile` (undecided until the organisation
 * decides). That is judged here, on the locked rows, and the access is logged whether allowed or refused; a refusal is returned in words with only that log row written. The check is made once, on a
 * profile the supplier has sent, and never changes its content: a change by the supplier is a new version, checked on its own.
 */
export async function verifyCreditorProfile(_prev: FormState, data: FormData): Promise<FormState> {
  const guard = await staffForAct("SIGNATURE");
  if (!guard.ok) return guard.state;
  const actor = guard.actor;
  const now = stampNow();
  const profileId = String(data.get("profileId") ?? "").trim();
  const r = new FormReader(data);
  const state = r.choice("verification", "Outcome of the check", VERIFICATION_STATES.filter((s) => s !== "NOT_CHECKED"));
  const note = r.text("verificationNote", "Why", { max: 2000 });
  if (r.failed) return { ok: false, errors: r.errors };
  // The check is signed with the officer's own password: no one is named but the signed-in officer (it cannot be recorded for someone else from paper).
  const begun = await beginAct(actor, data, "CreditorProfile.verifiedBy", { personField: "personId", dateField: "verifiedOn", document: { entity: "CreditorProfile", id: profileId }, onBehalf: false });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  const found = profileId ? await db.creditorProfile.findFirst({ where: { id: profileId, organisationId: actor.organisationId }, select: { supplierId: true } }) : null;
  if (!found) return GONE;
  return inSupplier(actor, found.supplierId, async (tx, l) => {
    await tx.$queryRaw`SELECT id FROM "CreditorProfile" WHERE id = ${profileId} FOR UPDATE`;
    const profile = await tx.creditorProfile.findFirst({
      where: { id: profileId, supplierId: found.supplierId, organisationId: actor.organisationId },
      include: { attachments: { where: { purpose: "SUPPLIER_BANK_STATEMENT" }, select: { detachedAt: true, version: { select: { withdrawnAt: true } } } } },
    });
    if (!profile) return GONE;

    // Who may read it may check it: judged on the rows as locked now and logged, whether allowed or refused.
    const facts = (await creditorNamedFacts(tx, actor.organisationId, [{ id: profile.id, supplierId: profile.supplierId, verifiedByPersonId: profile.verifiedByPersonId }])).get(profile.id);
    const decision = creditorDecision(actor, facts, await creditorPermissionState(tx, actor));
    await writeSulitEvents(tx, actor, [creditorEventRow({ id: profile.id, label: label(l.supplier, "Creditor's profile") }, CREDITOR_PROFILE_FIELDS, decision)]);
    if (decision.state === "WITHHELD") return { ok: false, message: `Nothing was saved: ${refusalWords(decision.basis, "creditorProfile", { routeStarted: facts?.routeStarted ?? false }).en}` };

    const person = await activePerson(tx, l.org.id, act.subjectPersonId);
    const fs = creditorReviewFaults(
      { state, personActive: !!person, verifiedOn: act.day, note },
      { sent: profile.submittedAt != null, verification: profile.verification, sentOn: profile.submittedAt ? todayIn(profile.submittedAt, l.org.timeZone) : null, statementFiles: profile.attachments.filter(isLive).length },
      l.org.today,
    );
    if (blocking(fs).length) {
      const errors: Record<string, string> = {};
      const rest: string[] = [];
      for (const f of blocking(fs)) {
        const field = f.code === "STATE_REQUIRED" ? "verification" : f.code === "NOTE_REQUIRED" ? "verificationNote" : f.code === "DAY_REQUIRED" || f.code === "IN_FUTURE" || f.code === "BEFORE_SENT" ? "verifiedOn" : null;
        if (field) errors[field] = creditorReviewText(f).en;
        else rest.push(creditorReviewText(f).en);
      }
      return { ok: false, errors, ...(rest.length ? { message: `Nothing was saved: ${rest.join(" ")}` } : {}) };
    }
    // Checked once, on a profile nobody has checked: the row is conditional, so two officers who arrive together cannot both write.
    const moved = await tx.creditorProfile.updateMany({ where: { id: profile.id, verification: "NOT_CHECKED", submittedAt: { not: null } }, data: { verification: state!, verifiedByPersonId: person!.id, verifiedOn: dayToDate(act.day!), verifiedAt: now, verificationNote: note } });
    if (moved.count !== 1) throw new Refusal(CHANGED);
    await audit(tx, toAuditActor(actor), l.org.id, "CreditorProfile", profile.id, label(l.supplier, "Creditor's profile"), "UPDATE", diffFields({ bankDetails: VERIFICATION_LABEL.NOT_CHECKED.en }, { bankDetails: VERIFICATION_LABEL[state!].en, checkedOn: act.day, checkNote: note || null }), note);
    // The office the officer held when they signed: the first the roster lists for them, organisation-wide before a department's (an officer who holds several is not asked which, yet).
    const office = actor.offices.find((o) => o.scope == null) ?? actor.offices[0];
    await act.write(tx, profile.id, { document: { entity: "CreditorProfile", id: profile.id }, roleCode: office?.roleCode });
    return { ok: true, message: state === "VERIFIED" ? "The bank details are checked and in order. Payments to this supplier go to them." : "The bank details are marked as not in order, with your reasons. The supplier is told on its account page." };
  });
}
