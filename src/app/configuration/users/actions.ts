"use server";

import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import { auditedCreate, auditedDelete, auditedUpdate } from "@/lib/audit/record";
import { db } from "@/lib/db";
import { periodsOverlap } from "@/lib/effective";
import { faultsIn, type Delegation, type DelegationFault } from "@/lib/people/delegation";
import { ORGANISATION_CODE } from "@/lib/org";
import { checkPeriod, FormReader } from "@/lib/validate";
import { issuedInForce } from "@/lib/authority/issue";
import { inProgressSittingRefusal } from "@/lib/committee/sittings";
import { splitValues } from "@/lib/ui/select-logic";

const PATH = "/configuration/users";

async function organisationId(): Promise<string | null> {
  const org = await db.organisation.findUnique({
    where: { code: ORGANISATION_CODE },
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
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;

  const id = String(data.get("id") ?? "");
  const r = new FormReader(data);

  const v = {
    name: r.text("name", "Name", { required: true, max: 160 }),
    email: r.text("email", "Email", { required: true, max: 160 }),
    jobTitle: r.optionalText("jobTitle"),
    jobTitleMs: r.optionalText("jobTitleMs"),
    portalRoleCode: r.optionalText("portalRoleCode"),
    authorityLevel: r.optionalText("authorityLevel"),
    department: r.optionalText("department"),
    telephone: r.optionalText("telephone"),
    // The switch reads "Currently away", so it is stored inverted. Naming the input
    // after what it says beats a box whose label and value disagree.
    isAvailable: !r.bool("isAway"),
  };

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
    organisationId: orgId,
    entity: "Person",
    entityLabel: v.name,
    reason: String(data.get("reason") ?? ""),
  };

  if (!id) {
    await auditedCreate(ctx, v, (tx) => tx.person.create({ data: { organisationId: orgId, ...v } }));
  } else {
    const before = await db.person.findUnique({ where: { id } });
    if (!before) return { ok: false, message: "That person is no longer on record." };
    await auditedUpdate({ ...ctx, entityId: id }, before, v, (tx) =>
      tx.person.update({ where: { id }, data: v }),
    );
  }

  revalidatePath(PATH);
  return { ok: true };
}

/**
 * Mark someone as having left, or put them back.
 *
 * Its own action rather than a field on the drawer: it is not an edit to their
 * details, it stops every office they hold from resolving, and the sample's drawer
 * has no control for it. A reason is required — nobody is signed in, so it is the
 * only account of why.
 */
export async function setPersonActive(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
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
  const sitting = await inProgressSittingRefusal({
    roster: (r) => ({ ...r, people: r.people.map((p) => (p.id === id ? { ...p, isActive } : p)) }),
  });
  if (sitting) return { ok: false, message: sitting };

  await auditedUpdate(
    { organisationId: orgId, entity: "Person", entityId: id, entityLabel: before.name, reason },
    { isActive: before.isActive },
    { isActive },
    (tx) => tx.person.update({ where: { id }, data: { isActive } }),
  );

  revalidatePath(PATH);
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
  const orgId = await organisationId();
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
      (tx) => tx.roleCapability.delete({ where: { id: existing!.id } }),
    );
  }

  revalidatePath(PATH);
  return { ok: true };
}

// -------------------------------------------------------------------- delegation

/// Which field an entry fault belongs against, and what it says there.
const DELEGATION_FAULTS: Record<DelegationFault, { field: string; message: string }> = {
  TO_SELF: { field: "toPersonId", message: "Nobody delegates to themselves." },
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
  MANDATORY_ACT: {
    field: "capabilityCodes",
    message:
      "This role gives a mandatory recommendation or approval, which cannot be delegated. Choose the capabilities to delegate instead of the whole role.",
  },
};

/**
 * Save a delegation.
 *
 * Every refusal comes from `faultsIn` rather than from checks written here. A
 * delegation that cannot be honoured is worse than none at all: the work stops and
 * nobody is expecting it to.
 */
export async function saveDelegation(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;

  const id = String(data.get("id") ?? "");
  const r = new FormReader(data);

  const fromPersonId = r.text("fromPersonId", "From", { required: true });
  const toPersonId = r.text("toPersonId", "To", { required: true });
  const roleCode = r.text("roleCode", "Delegating from", { required: true });
  const effectiveFrom = r.date("effectiveFrom", "From", { required: true });
  const effectiveTo = r.date("effectiveTo", "To");
  const capabilityCodes = splitValues(r.optionalText("capabilityCodes"));

  const v = {
    fromPersonId,
    toPersonId,
    roleCode,
    capabilityCodes,
    reason: r.optionalText("reason") ?? "",
    reasonMs: r.optionalText("reasonMs") ?? "",
    effectiveFrom: effectiveFrom!,
    effectiveTo,
    // FR-APR-012: the absent holder's recommendation, recorded as text, not attached.
    holderRecommendation: r.optionalText("holderRecommendation"),
    holderRecommendedOn: r.date("holderRecommendedOn", "Recommended on"),
  };
  if (v.holderRecommendation && !v.holderRecommendedOn) r.reject("holderRecommendedOn", "Give the date of the recommendation.");

  const parsed = r.finish(v);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  const [existing, held, grantorSpells, mandatory, grantor] = await Promise.all([
    db.delegation.findMany({
      where: { organisationId: orgId, ...(id ? { NOT: { id } } : {}) },
    }),
    db.capability.findMany({
      where: { organisationId: orgId, roles: { some: { roleCode } } },
      select: { code: true },
    }),
    db.roleAssignment.findMany({
      where: { personId: fromPersonId, roleCode, person: { organisationId: orgId } },
      select: { effectiveFrom: true, effectiveTo: true },
    }),
    // Any rule in force that gives this office a mandatory act, as approver or as a
    // recommender.
    db.authorityRule.count({
      where: {
        authorityMatrix: { organisationId: orgId, ...issuedInForce(new Date()) },
        OR: [
          { approverCode: roleCode, approverMandatory: true },
          { recommenders: { some: { roleCode, act: { in: ["MR", "MJR", "MA"] } } } },
        ],
      },
    }),
    db.person.findFirst({ where: { id: fromPersonId, organisationId: orgId }, select: { isAvailable: true } }),
  ]);

  // Holds the office across the whole delegation: some assignment begins by its start
  // and runs at least to its end.
  const grantorHoldsOffice = grantorSpells.some(
    (s) =>
      s.effectiveFrom <= v.effectiveFrom &&
      (s.effectiveTo == null || (v.effectiveTo != null && s.effectiveTo >= v.effectiveTo)),
  );

  const asDelegation = (row: {
    id: string;
    fromPersonId: string;
    toPersonId: string;
    roleCode: string;
    capabilityCodes: string[];
    valueCeiling: unknown;
    reason: string;
    reasonMs: string;
    noSubDelegation: boolean;
    effectiveFrom: Date;
    effectiveTo: Date | null;
  }): Delegation => ({
    id: row.id,
    fromPersonId: row.fromPersonId,
    toPersonId: row.toPersonId,
    roleCode: row.roleCode,
    capabilityCodes: row.capabilityCodes,
    valueCeiling: row.valueCeiling?.toString() ?? null,
    reason: row.reason,
    reasonMs: row.reasonMs,
    noSubDelegation: row.noSubDelegation,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
  });

  const proposed: Delegation = {
    id: id || "proposed",
    ...v,
    valueCeiling: null,
    noSubDelegation: true,
  };

  const faults = faultsIn(
    proposed,
    existing.map(asDelegation),
    held.map((c) => c.code),
    { grantorHoldsOffice, officeHasMandatoryActs: mandatory > 0, grantorUnavailable: grantor ? !grantor.isAvailable : false, holderRecommendation: v.holderRecommendation },
  );
  if (faults.length) {
    const errors: Record<string, string> = {};
    for (const fault of faults) {
      const { field, message } = DELEGATION_FAULTS[fault];
      errors[field] = message;
    }
    return { ok: false, errors };
  }

  const label = "Delegation";
  const ctx = {
    organisationId: orgId,
    entity: "Delegation",
    entityLabel: label,
    reason: v.reason,
  };

  if (!id) {
    await auditedCreate(ctx, v, (tx) =>
      tx.delegation.create({ data: { organisationId: orgId, ...v } }),
    );
  } else {
    const before = await db.delegation.findUnique({ where: { id } });
    if (!before) return { ok: false, message: "That delegation no longer exists." };
    await auditedUpdate({ ...ctx, entityId: id }, before, v, (tx) =>
      tx.delegation.update({ where: { id }, data: v }),
    );
  }

  revalidatePath(PATH);
  return { ok: true };
}

// ----------------------------------------------------------------------- offices

export async function saveOffice(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
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
    const before = await db.authorityRole.findUnique({ where: { id } });
    if (!before) return { ok: false, message: "That role no longer exists." };
    await auditedUpdate({ ...ctx, entityId: id }, before, v, (tx) =>
      tx.authorityRole.update({ where: { id }, data: v }),
    );
  }

  revalidatePath(PATH);
  return { ok: true };
}

// ------------------------------------------------------------------- assignments

export async function saveAssignment(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;

  const id = String(data.get("id") ?? "");
  const r = new FormReader(data);

  const personId = r.text("personId", "Person", { required: true });
  const roleCode = r.text("roleCode", "Role", { required: true });
  const scope = r.optionalText("scope");
  const effectiveFrom = r.date("effectiveFrom", "Held from", { required: true });
  const effectiveTo = r.date("effectiveTo", "Held to");
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
  const previous = id ? await db.roleAssignment.findUnique({ where: { id }, select: { roleCode: true } }) : null;
  for (const code of new Set([roleCode, previous?.roleCode].filter((c): c is string => !!c))) {
    const sitting = await inProgressSittingRefusal({
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
    organisationId: orgId,
    entity: "RoleAssignment",
    entityLabel: label,
    reason: String(data.get("reason") ?? ""),
  };

  if (!id) {
    await auditedCreate(ctx, v, (tx) => tx.roleAssignment.create({ data: v }));
  } else {
    const before = await db.roleAssignment.findUnique({ where: { id } });
    if (!before) return { ok: false, message: "That assignment no longer exists." };
    await auditedUpdate({ ...ctx, entityId: id }, before, v, (tx) =>
      tx.roleAssignment.update({ where: { id }, data: v }),
    );
  }

  revalidatePath(PATH);
  return { ok: true };
}

/// Ending an assignment closes its period. The record stays: a decision signed under
/// it must keep resolving to the person who signed.
export async function endAssignment(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;

  const id = String(data.get("id") ?? "");
  const reason = String(data.get("reason") ?? "").trim();
  if (!reason) return { ok: false, errors: { reason: "A reason is required." } };

  const before = await db.roleAssignment.findUnique({
    where: { id },
    include: { person: { select: { name: true } } },
  });
  if (!before) return { ok: false, message: "That assignment no longer exists." };
  if (before.effectiveTo) return { ok: false, message: "That assignment has already ended." };

  const effectiveTo = new Date();
  const sitting = await inProgressSittingRefusal({
    roleCode: before.roleCode,
    roster: (r) => ({ ...r, assignments: r.assignments.map((a) => (a.id === id ? { ...a, effectiveTo } : a)) }),
  });
  if (sitting) return { ok: false, message: sitting };
  await auditedUpdate(
    {
      organisationId: orgId,
      entity: "RoleAssignment",
      entityId: id,
      entityLabel: `${before.roleCode} — ${before.person.name}`,
      reason,
    },
    { effectiveTo: null },
    { effectiveTo },
    (tx) => tx.roleAssignment.update({ where: { id }, data: { effectiveTo } }),
  );

  revalidatePath(PATH);
  return { ok: true };
}
