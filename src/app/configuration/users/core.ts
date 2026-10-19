import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import { diffFields } from "@/lib/audit/diff";
import { auditedCreate, auditedDelete, auditedUpdate, writeAudit, type Tx } from "@/lib/audit/record";
import { attachFault } from "@/lib/documents/attach";
import { delegationFacts } from "@/lib/documents/owner-facts";
import { dayToDate, todayIn } from "@/lib/dates";
import { attached, filed } from "@/lib/documents/audit-view";
import { documentFaultText, PURPOSE_LABEL } from "@/lib/documents/labels";
import { lockVersion } from "@/lib/documents/service";
import { hiddenExerciseOfDocument } from "@/lib/documents/hidden";
import { sulitAttachRefused } from "@/lib/documents/entitlement";
import { refuseHiddenExercise, restrictedExerciseIds } from "@/lib/auth/sulit-store";
import { blocking } from "@/lib/documents/types";
import { delegationPeriodText, RECOMMENDATION_NOT_ATTACHED, RECOMMENDATION_ZONE_UNSET } from "@/lib/people/labels";
import { endAssignment as endAssignmentDay } from "@/lib/people/end-assignment";
import { db } from "@/lib/db";
import { periodsOverlap } from "@/lib/effective";
import { END_DAY_LABEL } from "@/lib/effective-text";
import { faultsIn, GRANTOR_FAULT_TEXT, grantorFault, type Delegation, type DelegationFault } from "@/lib/people/delegation";
import { lockDelegation, lockDelegationsOf, lockReportingLinesOf } from "@/lib/people/lock";
import { loadReportingLines } from "@/lib/people/reporting-line-store";
import { immediateSuperior, lineFaults, LINE_FAULT_TEXT, NO_SUPERIOR_CHOICE, type ReportingLine } from "@/lib/people/reporting-lines";
import { moveStepsOfAbsentHolders } from "@/app/approvals/actions";
import { holderMarkedAbsentNotices, delegationReceivedNotice } from "@/lib/inbox/notices";
import { writeNotices } from "@/lib/inbox/store";
import { standsOnTextBeforeAttachments } from "@/lib/people/recommendation";
import { OPENING_CONFIG_FAULT_TEXT, personUnitFault } from "@/lib/opening/config";
import { checkPeriod, FormReader } from "@/lib/validate";
import { issuedInForce } from "@/lib/authority/issue";
import { inProgressSittingRefusal } from "@/lib/committee/sittings";
import { currentAmbient } from "@/lib/ambient/ambient-tx";
import { deactivationGate, exposureLines } from "@/lib/sealing/deactivation";
import { loadHolderExposures } from "@/lib/sealing/substitution-store";
import { shredExerciseReleases } from "@/lib/opening/unseal-store";
import { splitValues } from "@/lib/ui/select-logic";
import { requireStaff, toAuditActor } from "@/app/_auth/actor";
import { attributionRefusalState, beginAct } from "@/app/_auth/act";
import { disableAccountOfLeaver, LeaverRefused } from "@/lib/auth/administration";
import { delegationPersonsToCheck, delegationWhat, holdingGrows, officeWhat } from "@/lib/auth/administration-conflict";
import { assertCanHold, HoldingRefused } from "@/lib/auth/administration-guard";
import type { AuditActor, StaffActor } from "@/lib/auth/types";
import type { OrgScope } from "@/lib/org-scope";
import { inOrder } from "@/lib/series";

const PATH = "/configuration/users";

async function organisationId(scope: OrgScope): Promise<string | null> {
  const org = await db.organisation.findUnique({
    where: { id: scope.organisationId },
    select: { id: true },
  });
  return org?.id ?? null;
}

const NO_ORG: FormState = {
  ok: false,
  message: "No organisation is configured. Run npm run setup before adding records.",
};

// ------------------------------------------------------------------------ people

/**
 * Save a person.
 *
 * Only the fields this form posts are written. `staffNo` and `isActive` are not on
 * the drawer, and an unchecked box posts nothing — so reading them here would clear
 * a staff number and mark every edited person a leaver.
 */
export async function savePerson(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const orgId = await organisationId(actor);
  if (!orgId) return NO_ORG;

  const id = String(data.get("id") ?? "");
  const r = new FormReader(data);

  const v = {
    name: r.text("name", "Name", { required: true, max: 160 }),
    email: r.text("email", "Email", { required: true, max: 160 }),
    jobTitle: r.optionalText("jobTitle"),
    portalRoleCode: r.optionalText("portalRoleCode"),
    authorityLevel: r.optionalText("authorityLevel"),
    department: r.optionalText("department"),
    telephone: r.optionalText("telephone"),
    // The switch reads "Currently away", so it is stored inverted. Naming the input
    // after what it says beats a box whose label and value disagree.
    isAvailable: !r.bool("isAway"),
    // 6.7 (C-6): the unit they sit in, checked against the structure. Not recorded is allowed.
    orgUnitCode: r.optionalText("orgUnitCode"),
  };

  if (v.orgUnitCode) {
    const units = await db.orgUnit.findMany({ where: { organisationId: orgId }, select: { code: true } });
    const fault = personUnitFault(v.orgUnitCode, units.map((u) => u.code));
    if (fault) r.reject("orgUnitCode", OPENING_CONFIG_FAULT_TEXT[fault]);
  }

  if (v.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email)) {
    r.reject("email", "That does not look like an email address.");
  }

  if (v.email) {
    const clash = await db.person.findFirst({
      where: { organisationId: orgId, email: v.email, ...(id ? { NOT: { id } } : {}) },
      select: { name: true },
    });
    if (clash) r.reject("email", `That address is already on record for ${clash.name}.`);
  }

  if (v.portalRoleCode) {
    const role = await db.authorityRole.findFirst({
      where: { organisationId: orgId, code: v.portalRoleCode },
      select: { id: true },
    });
    if (!role) r.reject("portalRoleCode", "That role is no longer configured.");
  }

  const parsed = r.finish(v);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  const ctx = {
    actor: toAuditActor(actor),
    organisationId: orgId,
    entity: "Person",
    entityLabel: v.name,
    reason: String(data.get("reason") ?? ""),
  };

  if (!id) {
    await auditedCreate(ctx, v, (tx) => tx.person.create({ data: { organisationId: orgId, ...v } }));
  } else {
    const before = await db.person.findUnique({ where: { id, organisationId: actor.organisationId } });
    if (!before) return { ok: false, message: "That person is no longer on record." };
    // Product owner, 2026-10-08 (log line 1770): recording a person as away changes who decides their steps, so it needed `configuration.draft`, the key that gives and ends an
    // office. Phase 5b: every save of a person is proposed by a holder of that key and applied by a second person, so the change from available to away is no longer judged
    // here on its own.
    await auditedUpdate({ ...ctx, entityId: id }, before, v, (tx) =>
      tx.person.update({ where: { id, organisationId: actor.organisationId }, data: v }),
    );
    // FR-APR-012: marking a holder absent moves their pending steps up, where the reporting line says who is above them. Only the change from in to away does:
    // marking them available again moves nothing back, and an edit that leaves them where they were runs nothing.
    if (before.isAvailable && !v.isAvailable) await afterAbsence(actor, { id, name: before.name });
  }

  revalidatePath(PATH);
  // GN-04, AC-13: who holds a step changes, so the shell's badges are drawn again.
  revalidatePath("/", "layout");
  revalidatePath("/approvals");
  return { ok: true };
}

/**
 * The sweep that follows someone being marked absent, and the notice to the people above them. The person is already saved as away: the sweep sees the office
 * with nobody able to act and moves each pending step as an officer's escalation would (`moveStepsOfAbsentHolders`), or leaves it and says why. What it did is
 * written beside the absence in the trail, so the audit reads "marked away" and then what became of their steps. The superiors are told once per absence.
 * A failure of the sweep never undoes the absence: it is re-run from the worklist. Only this person's steps are looked at. Where the person who recorded the absence is an
 * administrator account the sweep is refused as an escalation is (administration is kept apart from transactions): the steps stay, the trail and the superior are told so, and an
 * officer moves them from the worklist.
 */
async function afterAbsence(actor: StaffActor, person: { id: string; name: string }): Promise<void> {
  let sweep: Awaited<ReturnType<typeof moveStepsOfAbsentHolders>> | null = null;
  try {
    sweep = await moveStepsOfAbsentHolders(person.id);
  } catch (e) {
    console.error("The sweep after an absence failed; the steps stay where they are and the worklist can run it again:", e);
  }
  const at = new Date();
  const lines = await loadReportingLines(db, actor.organisationId);
  const day = todayIn(at, actor.organisationTimeZone);
  const superior = day ? immediateSuperior(lines, person.id, dayToDate(day)) : null;
  await db.$transaction(async (tx) => {
    if (sweep?.refused) {
      await writeAudit(tx, { actor: toAuditActor(actor), organisationId: actor.organisationId, entity: "Person", entityId: person.id, entityLabel: person.name, reason: `Marked away. Their pending steps were not moved: ${sweep.refused} An officer moves them from the worklist.` }, "UPDATE", diffFields({ pendingSteps: "waiting" }, { pendingSteps: "not moved: an administrator account does not move approval steps" }));
    } else if (sweep) {
      const said = sweep.words.join(" ");
      await writeAudit(tx, { actor: toAuditActor(actor), organisationId: actor.organisationId, entity: "Person", entityId: person.id, entityLabel: person.name, reason: `Marked away. ${said}` }, "UPDATE", diffFields({ pendingSteps: "waiting" }, { pendingSteps: `${sweep.moved} moved, ${sweep.stayed} stay` }));
    }
    if (superior) {
      await writeNotices(tx, actor.organisationId, actor.system ? null : actor.personId, holderMarkedAbsentNotices({ personId: person.id, personName: person.name, at, moved: sweep?.moved ?? 0, stayed: sweep?.stayed ?? 0, notMoved: !!sweep?.refused, superiors: [superior], by: actor.system ? null : actor.personId }));
    }
  });
}

/**
 * Mark someone as having left, or put them back.
 *
 * Its own action rather than a field on the drawer: it is not an edit to their
 * details, it stops every office they hold from resolving, and the sample's drawer
 * has no control for it. A reason is required: it is the account of why. Where the person has
 * a sign-in account this also disables it, so it is an administrator's act and never one's own
 * (`leaverFaults`); anyone else is refused and nothing is changed.
 */
export async function setPersonActive(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const orgId = await organisationId(actor);
  if (!orgId) return NO_ORG;

  const id = String(data.get("id") ?? "");
  const reason = String(data.get("reason") ?? "").trim();
  if (!reason) return { ok: false, errors: { reason: "A reason is required." } };

  const isActive = String(data.get("isActive") ?? "") !== "";

  const before = await db.person.findFirst({
    where: { id, organisationId: orgId },
    select: { id: true, name: true, isActive: true },
  });
  if (!before) return { ok: false, message: "That person is no longer on record." };
  if (before.isActive === isActive) {
    return { ok: false, message: "Somebody has already changed that. Close and look again." };
  }
  // A leaver stops holding the offices they hold, which can change who sits at a
  // committee sitting in progress.
  const sitting = await inProgressSittingRefusal(actor, {
    roster: (r) => ({ ...r, people: r.people.map((p) => (p.id === id ? { ...p, isActive } : p)) }),
  });
  if (sitting) return { ok: false, message: sitting };

  // An opening officer of an online exercise holds a share nobody can stand in for after the closing (ADR 0036 D11, 20t). Between the unseal and finalising the act needs a second approver, so it is
  // refused where it is not running as a proposal or a second person's decision; the exercises it leaves unopenable or unfinalisable are listed on the screen and recorded below.
  const exposures = isActive ? [] : ((await loadHolderExposures(db, orgId, new Date(), [id])).get(id) ?? []);
  const gate = deactivationGate({ exposures, mode: currentAmbient()?.mode ?? null });
  if (!gate.allowed) return { ok: false, message: gate.message };

  try {
    await auditedUpdate(
      { actor: toAuditActor(actor), organisationId: orgId, entity: "Person", entityId: id, entityLabel: before.name, reason },
      { isActive: before.isActive },
      { isActive },
      async (tx) => {
        const row = await tx.person.update({ where: { id, organisationId: actor.organisationId }, data: { isActive } });
        // Phase 1b: a leaver's sign-in account is disabled, and its sessions end, in this same transaction (every request re-checks the person as well; this makes it a recorded fact).
        if (!isActive) await disableAccountOfLeaver(tx, { personId: id, organisationId: orgId, actor: toAuditActor(actor), by: { isAdministrator: actor.isAdministrator, accountId: actor.accountId }, reason });
        // 20bc: leaving changes who can take part in an opening, so the exercises' outstanding unseal releases are shredded at once. One audit row per exercise says what was left and why.
        const lines = exposureLines(exposures);
        for (const [n, x] of exposures.entries()) {
          await shredExerciseReleases(tx, { organisationId: orgId, exerciseId: x.exerciseId, now: new Date() });
          await writeAudit(tx, { actor: toAuditActor(actor), organisationId: orgId, entity: "SourcingExercise", entityId: x.exerciseId, entityLabel: `${x.reference} · Opening officer · ${before.name}`, reason }, "UPDATE", diffFields({ openingOfficer: "Named, able to take part" }, { openingOfficer: lines[n] }));
        }
        return row;
      },
    );
  } catch (error) {
    if (error instanceof LeaverRefused) return { ok: false, message: error.fault.en };
    throw error;
  }

  revalidatePath(PATH);
  // GN-04, AC-13: who holds a step changes, so the shell's badges are drawn again.
  revalidatePath("/", "layout");
  return { ok: true };
}

// ------------------------------------------------------------------- permissions

/**
 * Grant a capability to a role, or take it away.
 *
 * One cell of the permissions grid. Deliberately not a form: the grid is the editor,
 * and a drawer between the click and the change would make setting thirty of them a
 * chore nobody would finish.
 *
 * There is no reason field. A grant is reversible and visible on the grid itself; the
 * audit entry records which way it went and when.
 */
export async function setGrant(
  roleCode: string,
  capabilityId: string,
  granted: boolean,
): Promise<FormState> {
  const actor = await requireStaff();
  const orgId = await organisationId(actor);
  if (!orgId) return NO_ORG;

  const capability = await db.capability.findFirst({
    where: { id: capabilityId, organisationId: orgId },
    select: { nameEn: true },
  });
  if (!capability) return { ok: false, message: "That capability is no longer configured." };

  const role = await db.authorityRole.findFirst({
    where: { organisationId: orgId, code: roleCode },
    select: { nameEn: true },
  });
  if (!role) return { ok: false, message: "That role is no longer configured." };

  const existing = await db.roleCapability.findUnique({
    where: { capabilityId_roleCode: { capabilityId, roleCode } },
    select: { id: true },
  });
  if (Boolean(existing) === granted) return { ok: true };

  const ctx = {
    actor: toAuditActor(actor),
    organisationId: orgId,
    entity: "RoleCapability",
    entityLabel: `${role.nameEn} — ${capability.nameEn}`,
    reason: "",
  };

  if (granted) {
    await auditedCreate({ ...ctx }, { roleCode, capability: capability.nameEn }, (tx) =>
      tx.roleCapability.create({ data: { capabilityId, roleCode } }),
    );
  } else {
    await auditedDelete(
      { ...ctx, entityId: existing!.id },
      { roleCode, capability: capability.nameEn },
      (tx) => tx.roleCapability.delete({ where: { id: existing!.id, capability: { organisationId: actor.organisationId } } }),
    );
  }

  revalidatePath(PATH);
  // GN-04, AC-13: who holds a step changes, so the shell's badges are drawn again.
  revalidatePath("/", "layout");
  return { ok: true };
}

// -------------------------------------------------------------------- delegation

/// Which field an entry fault belongs against, and what it says there.
const DELEGATION_FAULTS: Record<DelegationFault, { field: string; message: string }> = {
  TO_SELF: { field: "toPersonId", message: "Nobody delegates to themselves." },
  RECORDER_IS_DELEGATE: { field: "toPersonId", message: "You cannot record a delegation to yourself on someone else's behalf: the authority would be granted and received by one person. Another officer records it, or the grantor signs in and gives it." },
  ENDS_BEFORE_IT_STARTS: {
    field: "effectiveTo",
    message: "A delegation cannot end before it starts.",
  },
  OVERLAPS_EXISTING: {
    field: "effectiveFrom",
    message:
      "They already have a delegation of this role over part of that period. End that one first.",
  },
  SUB_DELEGATION_FORBIDDEN: {
    field: "fromPersonId",
    message: "What they hold was delegated to them, and it may not be passed on again.",
  },
  CAPABILITY_NOT_HELD: {
    field: "capabilityCodes",
    message: "That role does not hold all of those capabilities, so it cannot delegate them.",
  },
  OFFICE_UNDECIDED: {
    field: "capabilityCodes",
    message:
      "Nobody has decided what this role may do, so its capabilities cannot be delegated yet. Set them on the Permissions tab first.",
  },
  DELEGATION_CYCLE: {
    field: "toPersonId",
    message: "That would close a loop: this role is already delegated, directly or through others, from the delegate back to the grantor, and no one would hold it.",
  },
  DELEGATE_NOT_SUBORDINATE: {
    field: "toPersonId",
    message: "The delegate must be a direct line subordinate of the jobholder, the person whose authority is delegated, and the reporting line does not say so. Check the reporting lines, or choose someone who reports directly to the jobholder.",
  },
  DELEGATE_LINE_NOT_SET: {
    field: "toPersonId",
    message: "Reporting line not set for the delegate, so they cannot be shown to be a direct line subordinate of the jobholder. Record their reporting line first.",
  },
  // FR-APR-011 (ruling of 2026-10-08, log line 1773): the jobholder whose authority is delegated is not the grantor.
  GRANTOR_IS_JOBHOLDER: {
    field: "jobholderPersonId",
    message: "Nobody delegates their own authority. A delegation is granted by the jobholder's superior, so the grantor and the jobholder are two people.",
  },
  DELEGATE_IS_JOBHOLDER: {
    field: "toPersonId",
    message: "The jobholder cannot also be the delegate: they would receive their own authority.",
  },
  JOBHOLDER_DOES_NOT_HOLD: {
    field: "jobholderPersonId",
    message: "The jobholder does not hold this role over that whole period, so their authority cannot be delegated.",
  },
  GRANTOR_NOT_SUPERIOR: {
    field: "fromPersonId",
    message: "The grantor must be the jobholder's immediate superior, and the reporting line does not say so. Check the reporting lines, or let the jobholder's superior grant it.",
  },
  JOBHOLDER_LINE_NOT_SET: {
    field: "jobholderPersonId",
    message: "Reporting line not set for the jobholder, so the grantor cannot be shown to be their immediate superior. Record the jobholder's reporting line first.",
  },
  UNBOUNDED: {
    field: "effectiveTo",
    message:
      "A delegation must end on a date or cover named capabilities. Set an end date, or choose what is delegated.",
  },
  GRANTOR_DOES_NOT_HOLD: {
    field: "fromPersonId",
    message: "They do not hold this role over that whole period, so they cannot delegate it.",
  },
  ABSENT_GRANTOR_NO_RECOMMENDATION: {
    field: "holderRecommendation",
    message:
      "They are recorded as away, so their authority has reverted upward. It is delegated again only on the absent holder's recommendation: record it, with its date.",
  },
  ABSENT_GRANTOR_RECOMMENDATION_NOT_ATTACHED: {
    // Shown against the file field the editor carries for the signed recommendation.
    field: "file",
    message: RECOMMENDATION_NOT_ATTACHED,
  },
  MANDATORY_ACT: {
    field: "capabilityCodes",
    message:
      "This role gives a mandatory recommendation or approval, which cannot be delegated. Choose the capabilities to delegate instead of the whole role.",
  },
};

/// A stored delegation row as `faultsIn` reads it.
function asDelegation(row: {
  id: string;
  fromPersonId: string;
  jobholderPersonId: string | null;
  toPersonId: string;
  roleCode: string;
  capabilityCodes: string[];
  valueCeiling: unknown;
  reason: string;
  reasonMs: string;
  noSubDelegation: boolean;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}): Delegation {
  return {
    id: row.id,
    fromPersonId: row.fromPersonId,
    jobholderPersonId: row.jobholderPersonId,
    toPersonId: row.toPersonId,
    roleCode: row.roleCode,
    capabilityCodes: row.capabilityCodes,
    valueCeiling: row.valueCeiling?.toString() ?? null,
    reason: row.reason,
    reasonMs: row.reasonMs,
    noSubDelegation: row.noSubDelegation,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
  };
}

class DelegationRefused extends Error {
  constructor(readonly state: FormState) {
    super(state.message ?? "Refused");
  }
}

/**
 * Save a delegation.
 *
 * Every refusal comes from `faultsIn` rather than from checks written here. A
 * delegation that cannot be honoured is worse than none at all: the work stops and
 * nobody is expecting it to.
 */
export async function saveDelegation(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const orgId = await organisationId(actor);
  if (!orgId) return NO_ORG;

  const id = String(data.get("id") ?? "");
  const r = new FormReader(data);

  const fromPersonId = r.text("fromPersonId", "From", { required: true });
  const toPersonId = r.text("toPersonId", "To", { required: true });
  // FR-APR-011 (ruling of 2026-10-08, log line 1773): the jobholder whose authority is delegated. A new delegation always names one. An edit of a delegation recorded before the rule may
  // leave it empty (it keeps the earlier reading, where the grantor is the holder), and is asked for one once it has one.
  const jobholderPersonId = r.optionalText("jobholderPersonId");
  if (!id && !jobholderPersonId) r.reject("jobholderPersonId", "Choose the jobholder whose authority is delegated. It is not the grantor: nobody delegates their own authority.");
  const roleCode = r.text("roleCode", "Delegating from", { required: true });
  const effectiveFrom = r.date("effectiveFrom", "From", { required: true });
  const effectiveTo = r.date("effectiveTo", END_DAY_LABEL);
  const capabilityCodes = splitValues(r.optionalText("capabilityCodes"));

  const v = {
    fromPersonId,
    jobholderPersonId,
    toPersonId,
    roleCode,
    capabilityCodes,
    reason: r.optionalText("reason") ?? "",
    reasonMs: r.optionalText("reasonMs") ?? "",
    effectiveFrom: effectiveFrom!,
    effectiveTo,
    // FR-APR-012: the absent holder's recommendation, its summary as text; the signed
    // copy is attached (OD-6, `recommendationVersionId`).
    holderRecommendation: r.optionalText("holderRecommendation"),
    holderRecommendedOn: r.date("holderRecommendedOn", "Recommended on"),
  };
  if (v.holderRecommendation && !v.holderRecommendedOn) r.reject("holderRecommendedOn", "Give the date of the recommendation.");

  const parsed = r.finish(v);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };
  // The grantor is the signed-in person, or another whose delegation is recorded from their paper letter (Phase 2b; the grantor rules of 3c come later).
  const begun = await beginAct(actor, data, "Delegation.fromPerson", { personField: "fromPersonId", namesSubject: true });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  // F8: a delegation recorded for a grantor other than the signed-in officer is refused unless the officer is an administrator or may record on someone's behalf.
  // Applied from a proposal, the grantor was judged at the proposal, by the rehearsal, against the proposer who recorded it (ruling 1982(h)(1)): the applier does not record it.
  if (!act.appliedFromProposal && grantorFault({ recordedForAnother: act.recorderId != null, actorIsAdministrator: actor.isAdministrator, actorMayRecordOnBehalf: actor.permissions.has("acts.recordOnBehalf") })) return { ok: false, errors: { fromPersonId: GRANTOR_FAULT_TEXT } };

  const recommendationVersionId = r.optionalText("recommendationVersionId");
  // OD-2 (review of Phase 3b): attaching a document puts it on the delegation, whose people then judge its bytes, so a SULIT or hidden one the signed-in officer may not already open reads
  // as not there. Asked before the transaction so the logged refusal is kept.
  if (recommendationVersionId && (await recommendationRefused(actor, recommendationVersionId))) return { ok: false, errors: { recommendationVersionId: documentFaultText({ code: "VERSION_UNKNOWN", level: "block" }) } };
  const proposed: Delegation = {
    id: id || "proposed",
    ...v,
    valueCeiling: null,
    noSubDelegation: true,
  };

  const label = "Delegation";
  const ctx = {
    actor: toAuditActor(actor),
    organisationId: orgId,
    entity: "Delegation",
    entityLabel: label,
    reason: v.reason,
  };

  try {
    await db.$transaction(async (tx) => {
      // F8: delegations of an organisation are written one at a time, so that two saves (A to B, B to A) cannot each pass the loop check alone and both stand.
      // Taken before any row lock, and by every writer of a delegation.
      await lockDelegationsOf(tx, orgId);
      // The delegation's row is locked first (on an edit), and every read that feeds the
      // decision is made after it, in this transaction (LESSONS: re-validate on locked rows).
      const stored = id ? await lockDelegation(tx, id, orgId) : null;
      if (id && !stored) throw new DelegationRefused({ ok: false, message: "That delegation no longer exists." });

      if (id && stored!.jobholderPersonId && !jobholderPersonId) throw new DelegationRefused({ ok: false, errors: { jobholderPersonId: "This delegation records the jobholder whose authority it delegates. Choose them again to save it." } });
      if (jobholderPersonId && !(await tx.person.findFirst({ where: { id: jobholderPersonId, organisationId: orgId }, select: { id: true } }))) throw new DelegationRefused({ ok: false, errors: { jobholderPersonId: "That person is not on record." } });

      const existing = await tx.delegation.findMany({ where: { organisationId: orgId, ...(id ? { NOT: { id } } : {}) } });
      const held = await tx.capability.findMany({ where: { organisationId: orgId, roles: { some: { roleCode } } }, select: { code: true } });
      // The authority delegated is the jobholder's, where one is recorded: the jobholder holds the office (the grantor, being the superior, need not), and an absent HOLDER is the jobholder.
      // A delegation recorded before the rule keeps the earlier reading, where the grantor is the holder.
      const holderPersonId = jobholderPersonId ?? fromPersonId;
      const grantorSpells = await tx.roleAssignment.findMany({
        where: { personId: holderPersonId, roleCode, person: { organisationId: orgId } },
        select: { effectiveFrom: true, effectiveTo: true },
      });
      // Any rule in force that gives this office a mandatory act, as approver or as a
      // recommender.
      const mandatory = await tx.authorityRule.count({
        where: {
          authorityMatrix: { organisationId: orgId, ...issuedInForce(new Date()) },
          OR: [
            { approverCode: roleCode, approverMandatory: true },
            { recommenders: { some: { roleCode, act: { in: ["MR", "MJR", "MA"] } } } },
          ],
        },
      });
      const grantor = await tx.person.findFirst({ where: { id: holderPersonId, organisationId: orgId }, select: { isAvailable: true } });

      // Holds the office across the whole delegation: some assignment begins by its start
      // and runs at least to its end.
      const grantorHoldsOffice = grantorSpells.some(
        (s) =>
          s.effectiveFrom <= v.effectiveFrom &&
          (s.effectiveTo == null || (v.effectiveTo != null && s.effectiveTo >= v.effectiveTo)),
      );

      // OD-6: the signed recommendation is attached in the same act as the delegation it
      // grants (a version staged by the upload, its id in the form), or was attached since.
      // A delegation marked text-only when the store landed stands on its text, until an
      // edit extends or opens its end, moves its start earlier, changes the grantor, the office
      // or the delegate, or widens what is delegated (`legacyEndedBy`).
      const faults = faultsIn(
        proposed,
        existing.map(asDelegation),
        held.map((c) => c.code),
        {
          recorderId: act.recorderId,
          // Judged on the jobholder where one is recorded, on the grantor otherwise (`faultsIn`).
          grantorHoldsOffice,
          jobholderHoldsOffice: grantorHoldsOffice,
          officeHasMandatoryActs: mandatory > 0,
          grantorUnavailable: grantor ? !grantor.isAvailable : false,
          holderRecommendation: v.holderRecommendation,
          recommendationAttached: (stored?.liveAttachments ?? 0) > 0 || !!recommendationVersionId,
          recordedBeforeAttachments: standsOnTextBeforeAttachments(stored, v),
          // FR-APR-011: the organisation's reporting lines, as recorded; none recorded is said in words (`delegationNotes`) and applies no rule.
          reportingLines: await loadReportingLines(tx, orgId),
        },
      );
      if (faults.length) {
        const errors: Record<string, string> = {};
        for (const fault of faults) {
          const { field, message } = DELEGATION_FAULTS[fault];
          // Two faults can land on one field (the jobholder does not hold the office, and has no reporting line): both are said, not the last.
          errors[field] = errors[field] ? `${errors[field]} ${message}` : message;
        }
        throw new DelegationRefused({ ok: false, errors });
      }

      // Administration is kept apart from transactions (ADR 0034 D9): neither the grantor nor the delegate is a Person whose account is an administrator's.
      // Asked only of what the edit gives or extends (a new delegation, another Person or office, an earlier start, a later or open end), so that a
      // delegation that already breaks the rule can still be ended or shortened (review of Phase 2a). Taken after the delegation's own lock, in id order.
      const askedOf = delegationPersonsToCheck(
        stored ? { fromPersonId: stored.fromPersonId, toPersonId: stored.toPersonId, what: delegationWhat(stored.roleCode, stored.capabilityCodes), effectiveFrom: stored.effectiveFrom, effectiveTo: stored.effectiveTo } : null,
        { fromPersonId, toPersonId, what: delegationWhat(roleCode, capabilityCodes), effectiveFrom: v.effectiveFrom, effectiveTo: v.effectiveTo ?? null },
      );
      try {
        if (askedOf.length > 0) await assertCanHold(tx, askedOf, "DELEGATION");
      } catch (e) {
        if (e instanceof HoldingRefused) throw new DelegationRefused({ ok: false, errors: { [e.personId === fromPersonId ? "fromPersonId" : "toPersonId"]: e.fault.en } });
        throw e;
      }

      let delegationId = id;
      if (!id) {
        const row = await tx.delegation.create({ data: { organisationId: orgId, ...v } });
        await writeAudit(tx, { ...ctx, entityId: row.id }, "CREATE", diffFields(null, v));
        delegationId = row.id;
      } else {
        const locked = await tx.delegation.findUniqueOrThrow({ where: { id, organisationId: actor.organisationId } });
        await tx.delegation.update({ where: { id, organisationId: actor.organisationId }, data: v });
        const changes = diffFields(locked, v);
        if (changes.length) await writeAudit(tx, { ...ctx, entityId: id }, "UPDATE", changes);
      }
      await act.write(tx, delegationId);
      if (recommendationVersionId) await attachRecommendation(tx, toAuditActor(actor), orgId, delegationId, recommendationVersionId);
      // FR-APR-011: the delegate is told in the portal, once for these terms (a delegation changed to other terms is told again).
      const [parties, office, caps] = await inOrder(
        () => tx.person.findMany({ where: { organisationId: orgId, id: { in: [fromPersonId, toPersonId, ...(jobholderPersonId ? [jobholderPersonId] : [])] } }, select: { id: true, name: true } }),
        () => tx.authorityRole.findFirst({ where: { organisationId: orgId, code: roleCode }, select: { nameEn: true } }),
        () => capabilityCodes.length > 0 ? tx.capability.findMany({ where: { organisationId: orgId, code: { in: capabilityCodes } }, select: { nameEn: true } }) : Promise.resolve([]));
      await writeNotices(
        tx,
        orgId,
        actor.system ? null : actor.personId,
        delegationReceivedNotice({
          delegationId,
          termsKey: [toPersonId, roleCode, [...capabilityCodes].sort().join(","), v.effectiveFrom.toISOString(), v.effectiveTo?.toISOString() ?? ""].join("|"),
          toPersonId,
          fromName: `${parties.find((p) => p.id === fromPersonId)?.name ?? "A colleague"}${jobholderPersonId ? ` (the authority of ${parties.find((p) => p.id === jobholderPersonId)?.name ?? "the jobholder"})` : ""}`,
          officeLabel: office?.nameEn ?? "an office no longer configured",
          periodWords: delegationPeriodText(proposed).replace(/^./, (c) => c.toLowerCase()),
          whatWords: capabilityCodes.length === 0 ? "the whole office" : `these capabilities: ${caps.map((c) => c.nameEn).join(", ")}`,
          by: actor.system ? null : actor.personId,
        }),
      );
    });
  } catch (e) {
    if (e instanceof DelegationRefused) return e.state;
    const attribution = attributionRefusalState(e);
    if (attribution) return attribution;
    if (e instanceof RecommendationRefused) return { ok: false, errors: { recommendationVersionId: e.message } };
    throw e;
  }

  revalidatePath(PATH);
  // GN-04, AC-13: who holds a step changes, so the shell's badges are drawn again.
  revalidatePath("/", "layout");
  return { ok: true };
}

// ------------------------------------------------------------------ reporting lines


/**
 * Record who a person reports to, for a period (FR-APR-010, FR-APR-011). Configuration, audited with the signed-in actor, and it ships empty: nothing is derived from
 * a unit's head, and a person with no line is "Reporting line not set". One writer at a time per organisation, so two edits cannot each pass the loop check alone;
 * what it refuses is `lineFaults` (a person above themselves, a loop, two lines for one person over the same days).
 */
export async function saveReportingLine(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const orgId = await organisationId(actor);
  if (!orgId) return NO_ORG;

  const id = String(data.get("id") ?? "");
  const r = new FormReader(data);
  const personId = r.text("personId", "Person", { required: true });
  const chosen = r.text("superiorPersonId", "Reports to", { required: true });
  const effectiveFrom = r.date("effectiveFrom", "From", { required: true });
  const effectiveTo = r.date("effectiveTo", END_DAY_LABEL);
  const v = {
    personId,
    superiorPersonId: chosen === NO_SUPERIOR_CHOICE ? null : chosen,
    effectiveFrom: effectiveFrom!,
    effectiveTo,
    provenance: r.choice("provenance", "Where this came from", ["STATED", "OBSERVED", "ASSUMED"] as const, { required: true }),
    note: r.optionalText("note") ?? "",
  };
  const parsed = r.finish(v);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  try {
    await db.$transaction(async (tx) => {
      await lockReportingLinesOf(tx, orgId);
      const stored = id ? await tx.reportingLine.findFirst({ where: { id, organisationId: orgId } }) : null;
      if (id && !stored) throw new DelegationRefused({ ok: false, message: "That reporting line no longer exists." });
      const people = await tx.person.findMany({ where: { organisationId: orgId, id: { in: [v.personId, ...(v.superiorPersonId ? [v.superiorPersonId] : [])] } }, select: { id: true, name: true, isActive: true } });
      const person = people.find((p) => p.id === v.personId);
      const superior = v.superiorPersonId ? people.find((p) => p.id === v.superiorPersonId) : null;
      if (!person) throw new DelegationRefused({ ok: false, errors: { personId: "That person is not on record." } });
      if (v.superiorPersonId && !superior) throw new DelegationRefused({ ok: false, errors: { superiorPersonId: "That person is not on record." } });
      if (superior && !superior.isActive) throw new DelegationRefused({ ok: false, errors: { superiorPersonId: "They have left. Choose someone who is still here." } });

      const all = await loadReportingLines(tx, orgId);
      const proposed: ReportingLine = { id: id || "proposed", personId: v.personId, superiorPersonId: v.superiorPersonId, effectiveFrom: v.effectiveFrom, effectiveTo: v.effectiveTo ?? null };
      const faults = lineFaults(proposed, all);
      if (faults.length > 0) {
        const errors: Record<string, string> = {};
        for (const f of faults) errors[f === "SELF" || f === "CYCLE" ? "superiorPersonId" : f === "ENDS_BEFORE_IT_STARTS" ? "effectiveTo" : "effectiveFrom"] = LINE_FAULT_TEXT[f];
        throw new DelegationRefused({ ok: false, errors });
      }

      const label = `${person.name} reports to ${superior?.name ?? "nobody (head of the line)"}`;
      const trail = { person: person.name, reportsTo: superior?.name ?? "Nobody (head of the line)", effectiveFrom: v.effectiveFrom, effectiveTo: v.effectiveTo ?? null, provenance: v.provenance, note: v.note };
      const ctx = { actor: toAuditActor(actor), organisationId: orgId, entity: "ReportingLine", entityLabel: label, reason: String(data.get("reason") ?? "") };
      const write = { personId: v.personId, superiorPersonId: v.superiorPersonId, effectiveFrom: v.effectiveFrom, effectiveTo: v.effectiveTo ?? null, provenance: v.provenance!, note: v.note };
      if (!stored) {
        const row = await tx.reportingLine.create({ data: { organisationId: orgId, ...write } });
        await writeAudit(tx, { ...ctx, entityId: row.id }, "CREATE", diffFields(null, trail));
      } else {
        const beforeNames = await tx.person.findMany({ where: { organisationId: orgId, id: { in: [stored.personId, ...(stored.superiorPersonId ? [stored.superiorPersonId] : [])] } }, select: { id: true, name: true } });
        const nameOf = (pid: string | null) => (pid ? (beforeNames.find((p) => p.id === pid)?.name ?? "A person no longer on record") : "Nobody (head of the line)");
        await tx.reportingLine.update({ where: { id, organisationId: orgId }, data: write });
        const changes = diffFields({ person: nameOf(stored.personId), reportsTo: nameOf(stored.superiorPersonId), effectiveFrom: stored.effectiveFrom, effectiveTo: stored.effectiveTo, provenance: stored.provenance, note: stored.note }, trail);
        if (changes.length) await writeAudit(tx, { ...ctx, entityId: id }, "UPDATE", changes);
      }
    });
  } catch (e) {
    if (e instanceof DelegationRefused) return e.state;
    throw e;
  }
  revalidatePath(PATH);
  // GN-04, AC-13: who holds a step changes, so the shell's badges are drawn again.
  revalidatePath("/", "layout");
  revalidatePath("/approvals");
  return { ok: true };
}

// ----------------------------------------------------------------------- offices

export async function saveOffice(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const orgId = await organisationId(actor);
  if (!orgId) return NO_ORG;

  const id = String(data.get("id") ?? "");
  const existing = await db.authorityRole.findMany({
    where: { organisationId: orgId },
    select: { id: true, code: true },
  });
  const current = id ? existing.find((e) => e.id === id) : undefined;
  if (id && !current) return { ok: false, message: "That role no longer exists." };

  const r = new FormReader(data);

  // The code is set once and never edited: every approval rule routes to it. The
  // drawer does not offer it, so it is read from the record rather than from the
  // form — `data.get("code")` on a form that has no such field is null, and writing
  // that would blank the thing the rules point at.
  const code = current
    ? current.code
    : r.code("code", "Code", {
        taken: existing.map((e) => e.code),
      });

  const escalatesToCode = r.optionalText("escalatesToCode");
  const selfApprovalEscalatesToCode = r.optionalText("selfApprovalEscalatesToCode");

  // Authority reverts upward, never to itself: an office escalating to itself would
  // leave an absent holder's matter with nowhere to go.
  if (escalatesToCode && escalatesToCode === code) {
    r.reject("escalatesToCode", "A role cannot escalate to itself.");
  }
  if (selfApprovalEscalatesToCode && selfApprovalEscalatesToCode === code) {
    r.reject(
      "selfApprovalEscalatesToCode",
      "Self-approval must escalate to a different role, or it is not an escalation.",
    );
  }

  const v = {
    code,
    nameEn: r.text("nameEn", "Name", { required: true, max: 160 }),
    nameMs: r.text("nameMs", "Name (Malay)", { required: true, max: 160 }),
    isCommittee: r.bool("isCommittee"),
    escalatesToCode,
    selfApprovalEscalatesToCode,
    sortOrder: r.int("sortOrder", "Order", { min: 0 }) ?? 0,
  };

  const parsed = r.finish(v);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  const ctx = {
    actor: toAuditActor(actor),
    organisationId: orgId,
    entity: "AuthorityRole",
    entityLabel: v.nameEn,
    reason: String(data.get("reason") ?? ""),
  };

  if (!id) {
    await auditedCreate(ctx, v, (tx) =>
      tx.authorityRole.create({ data: { organisationId: orgId, ...v } }),
    );
  } else {
    const before = await db.authorityRole.findUnique({ where: { id, organisationId: actor.organisationId } });
    if (!before) return { ok: false, message: "That role no longer exists." };
    await auditedUpdate({ ...ctx, entityId: id }, before, v, (tx) =>
      tx.authorityRole.update({ where: { id, organisationId: actor.organisationId }, data: v }),
    );
  }

  revalidatePath(PATH);
  // GN-04, AC-13: who holds a step changes, so the shell's badges are drawn again.
  revalidatePath("/", "layout");
  return { ok: true };
}

// ------------------------------------------------------------------- assignments

export async function saveAssignment(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const orgId = await organisationId(actor);
  if (!orgId) return NO_ORG;

  const id = String(data.get("id") ?? "");
  const r = new FormReader(data);

  const personId = r.text("personId", "Person", { required: true });
  const roleCode = r.text("roleCode", "Role", { required: true });
  const scope = r.optionalText("scope");
  const effectiveFrom = r.date("effectiveFrom", "Held from", { required: true });
  const effectiveTo = r.date("effectiveTo", END_DAY_LABEL);
  checkPeriod(r, effectiveFrom, effectiveTo);

  if (personId) {
    const person = await db.person.findFirst({
      where: { id: personId, organisationId: orgId },
      select: { isActive: true, name: true },
    });
    if (!person) r.reject("personId", "That person is not on record.");
    else if (!person.isActive) {
      r.reject("personId", `${person.name} is marked as having left. Reinstate them first.`);
    }
  }

  // One office, one scope, one holder at a time. Two overlapping assignments would
  // make the approval chain resolve to two different signatories.
  if (personId && roleCode && effectiveFrom && !r.failed) {
    const siblings = await db.roleAssignment.findMany({
      where: {
        roleCode,
        person: { organisationId: orgId },
        ...(id ? { NOT: { id } } : {}),
      },
      include: { person: { select: { name: true } } },
    });
    const candidate = { effectiveFrom, effectiveTo };
    const clash = siblings.find(
      (s) =>
        (s.scope ?? null) === scope &&
        s.personId !== personId &&
        periodsOverlap(s, candidate),
    );
    if (clash) {
      r.reject(
        "effectiveFrom",
        `${clash.person.name} already holds this office over part of that period. End that assignment first.`,
      );
    }
  }

  const v = { personId, roleCode, scope, effectiveFrom: effectiveFrom!, effectiveTo };
  const parsed = r.finish(v);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  // Holding an office decides who sits in an ex-officio committee seat on a date: the
  // change may not move who sits at a sitting in progress (send-back 9.4).
  const previous = id ? await db.roleAssignment.findUnique({ where: { id, person: { organisationId: actor.organisationId } }, select: { roleCode: true } }) : null;
  for (const code of new Set([roleCode, previous?.roleCode].filter((c): c is string => !!c))) {
    const sitting = await inProgressSittingRefusal(actor, {
      roleCode: code,
      roster: (r) => {
        const next = { id: id || "proposed-assignment", ...v };
        return {
          ...r,
          assignments: id ? r.assignments.map((a) => (a.id === id ? next : a)) : [...r.assignments, next],
        };
      },
    });
    if (sitting) return { ok: false, message: sitting };
  }

  const label = `${roleCode} assignment`;
  const ctx = {
    actor: toAuditActor(actor),
    organisationId: orgId,
    entity: "RoleAssignment",
    entityLabel: label,
    reason: String(data.get("reason") ?? ""),
  };

  // Administration is kept apart from transactions (ADR 0034 D9): an office is never given to a Person whose account is an administrator's. The
  // check is made in the write's own transaction, under the Person's lock, so it cannot be passed by an administrator made at the same moment.
  try {
    if (!id) {
      await auditedCreate(ctx, v, async (tx) => {
        await assertCanHold(tx, [personId!], "OFFICE");
        return tx.roleAssignment.create({ data: v });
      });
    } else {
      const before = await db.roleAssignment.findUnique({ where: { id, person: { organisationId: actor.organisationId } } });
      if (!before) return { ok: false, message: "That assignment no longer exists." };
      await auditedUpdate({ ...ctx, entityId: id }, before, v, async (tx) => {
        // Asked only where the edit gives or extends the office: one that ends or shortens it gives nothing, and must stay possible (review of Phase 2a).
        const stored = await tx.roleAssignment.findUnique({ where: { id, person: { organisationId: actor.organisationId } }, select: { personId: true, roleCode: true, scope: true, effectiveFrom: true, effectiveTo: true } });
        const was = stored && { personId: stored.personId, what: officeWhat(stored.roleCode, stored.scope), effectiveFrom: stored.effectiveFrom, effectiveTo: stored.effectiveTo };
        if (holdingGrows(was, { personId: personId!, what: officeWhat(roleCode, scope ?? null), effectiveFrom: v.effectiveFrom, effectiveTo: v.effectiveTo ?? null })) await assertCanHold(tx, [personId!], "OFFICE");
        return tx.roleAssignment.update({ where: { id, person: { organisationId: actor.organisationId } }, data: v });
      });
    }
  } catch (e) {
    if (e instanceof HoldingRefused) return { ok: false, errors: { personId: e.fault.en } };
    throw e;
  }

  revalidatePath(PATH);
  // GN-04, AC-13: who holds a step changes, so the shell's badges are drawn again.
  revalidatePath("/", "layout");
  return { ok: true };
}

/// Ending an assignment closes its period on the day the officer chooses: the first day
/// they no longer hold it, stored as a day (end day not included, `effective.ts`) and judged
/// against the organisation's today (`endAssignment`). The record stays: a decision signed
/// under it must keep resolving to the person who signed.
export async function endAssignment(_prev: FormState, data: FormData): Promise<FormState> {
  // Ending is gated by the key that gives (product owner, decisions log 2026-10-07): removing a holder changes who decides as much as adding one. Phase 5b: it is proposed by
  // a holder of that key (the action) and applied by a second person.
  const actor = await requireStaff();
  const orgId = await organisationId(actor);
  if (!orgId) return NO_ORG;

  const id = String(data.get("id") ?? "");
  const endDay = String(data.get("effectiveTo") ?? "").trim();
  const reason = String(data.get("reason") ?? "").trim();
  if (!reason) return { ok: false, errors: { reason: "A reason is required." } };

  const judge = async (read: typeof db | Tx) => {
    const row = await read.roleAssignment.findUnique({ where: { id, person: { organisationId: actor.organisationId } }, include: { person: { select: { name: true } } } });
    if (!row) return { row: null, result: null } as const;
    const org = await read.organisation.findUniqueOrThrow({ where: { id: orgId }, select: { timeZone: true } });
    return { row, result: endAssignmentDay({ effectiveFrom: row.effectiveFrom, effectiveTo: row.effectiveTo, endDay, today: todayIn(new Date(), org.timeZone) }) } as const;
  };
  const refusal = (result: Exclude<ReturnType<typeof endAssignmentDay>, { ok: true }>): FormState =>
    result.field ? { ok: false, errors: { [result.field]: result.message } } : { ok: false, message: result.message };

  const first = await judge(db);
  if (!first.row) return { ok: false, message: "That assignment no longer exists." };
  if (!first.result.ok) return refusal(first.result);

  const effectiveTo = first.result.effectiveTo;
  const sitting = await inProgressSittingRefusal(actor, {
    roleCode: first.row.roleCode,
    roster: (r) => ({ ...r, assignments: r.assignments.map((a) => (a.id === id ? { ...a, effectiveTo } : a)) }),
  });
  if (sitting) return { ok: false, message: sitting };

  class Refused extends Error {
    constructor(readonly state: FormState) {
      super("refused");
    }
  }
  try {
    await db.$transaction(async (tx) => {
      // Re-judged on the locked row: an end recorded while this act waited is seen here.
      await tx.$queryRaw`SELECT id FROM "RoleAssignment" WHERE id = ${id} FOR UPDATE`;
      const locked = await judge(tx);
      if (!locked.row) throw new Refused({ ok: false, message: "That assignment no longer exists." });
      if (!locked.result.ok) throw new Refused(refusal(locked.result));
      await tx.roleAssignment.update({ where: { id, person: { organisationId: actor.organisationId } }, data: { effectiveTo: locked.result.effectiveTo } });
      await writeAudit(
        tx,
        { actor: toAuditActor(actor), organisationId: orgId, entity: "RoleAssignment", entityId: id, entityLabel: `${locked.row.roleCode} — ${locked.row.person.name}`, reason },
        "UPDATE",
        diffFields({ effectiveTo: null }, { effectiveTo: locked.result.effectiveTo }),
      );
    });
  } catch (e) {
    if (e instanceof Refused) return e.state;
    throw e;
  }

  revalidatePath(PATH);
  // GN-04, AC-13: who holds a step changes, so the shell's badges are drawn again.
  revalidatePath("/", "layout");
  return { ok: true };
}

class RecommendationRefused extends Error {}

/// Whether the version is one the officer may not attach: it hangs on an exercise they may not see, or is SULIT and they may not open it.
async function recommendationRefused(actor: StaffActor, versionId: string): Promise<boolean> {
  const v = await db.documentVersion.findFirst({ where: { id: versionId, organisationId: actor.organisationId }, select: { documentId: true } });
  if (!v) return false;
  const under = await hiddenExerciseOfDocument(v.documentId, await restrictedExerciseIds(db, actor.organisationId), db);
  if (under && (await refuseHiddenExercise(db, actor, under))) return true;
  return sulitAttachRefused(db, actor, v.documentId);
}

/**
 * Attach the absent holder's signed recommendation (a staged or filed version) to the
 * delegation, in the caller's transaction, with the delegation's row already written
 * (and locked, on an edit). `attachFault` runs on what is read here; the attachment, the
 * document's filing and their audit rows share the transaction.
 */
async function attachRecommendation(tx: Tx, actor: AuditActor, orgId: string, delegationId: string, versionId: string) {
  // The document is locked before the version is judged (`lockVersion`): a withdrawal
  // committed while this act waited is seen here, never pinned.
  const v = await lockVersion(tx, versionId, orgId);
  if (!v) throw new RecommendationRefused(documentFaultText({ code: "VERSION_UNKNOWN", level: "block" }));
  const doc = await tx.document.findUniqueOrThrow({ where: { id: v.documentId, organisationId: orgId }, include: { documentClass: { select: { classification: true } } } });
  // Under the Delegation row lock (the same helper the generic attach uses): attachFault
  // judges what is read here, after the lock, never a read made before it.
  const d = await lockDelegation(tx, delegationId, orgId);
  if (!d) throw new RecommendationRefused("That delegation no longer exists.");
  const already = await tx.documentAttachment.findFirst({ where: { delegationId, purpose: "HOLDER_RECOMMENDATION", detachedAt: null, version: { documentId: doc.id } }, select: { id: true } });
  // 66-C1 (b): the organisation's today, never the UTC day: no zone set, the attachment is refused.
  const today = todayIn(new Date(), (await tx.organisation.findUniqueOrThrow({ where: { id: orgId }, select: { timeZone: true } })).timeZone);
  if (!today) throw new RecommendationRefused(RECOMMENDATION_ZONE_UNSET);
  const faults = blocking(attachFault({ purpose: "HOLDER_RECOMMENDATION", owner: delegationFacts(d, today), version: v, documentClass: doc.documentClass, documentClassification: doc.classificationSnapshot, alreadyAttached: !!already }));
  if (faults.length) throw new RecommendationRefused(faults.map(documentFaultText).join(" "));
  const owner = `Delegation · ${d.fromPerson.name} to ${d.toPerson.name}`;
  const row = await tx.documentAttachment.create({ data: { organisationId: orgId, purpose: "HOLDER_RECOMMENDATION", versionId: v.id, delegationId } });
  await writeAudit(tx, { actor, organisationId: orgId, entity: "DocumentAttachment", entityId: row.id, entityLabel: `${owner} · ${PURPOSE_LABEL.HOLDER_RECOMMENDATION}` }, "CREATE",
    attached({ purpose: "HOLDER_RECOMMENDATION", title: doc.title, versionNo: v.versionNo, sha256: v.sha256, owner }));
  if (doc.status === "STAGED") {
    await tx.document.update({ where: { id: doc.id, organisationId: orgId }, data: { status: "FILED", filedAt: new Date() } });
    await writeAudit(tx, { actor, organisationId: orgId, entity: "Document", entityId: doc.id, entityLabel: `Document · ${doc.title}` }, "UPDATE", filed());
  }
}
