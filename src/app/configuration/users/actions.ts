"use server";

import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import { auditedCreate, auditedUpdate } from "@/lib/audit/record";
import { db } from "@/lib/db";
import { periodsOverlap } from "@/lib/effective";
import { ORGANISATION_CODE } from "@/lib/org";
import { checkPeriod, FormReader } from "@/lib/validate";

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

export async function savePerson(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;

  const id = String(data.get("id") ?? "");
  const r = new FormReader(data);

  const staffNo = r.optionalText("staffNo");
  if (staffNo) {
    const clash = await db.person.findFirst({
      where: { organisationId: orgId, staffNo, ...(id ? { NOT: { id } } : {}) },
      select: { name: true },
    });
    if (clash) r.reject("staffNo", `That staff number already belongs to ${clash.name}.`);
  }

  const v = {
    name: r.text("name", "Name", { required: true, max: 160 }),
    staffNo,
    email: r.optionalText("email"),
    jobTitle: r.optionalText("jobTitle"),
    isActive: r.bool("isActive"),
  };

  if (v.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email)) {
    r.reject("email", "That does not look like an email address.");
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

  const r = new FormReader(data);
  const code = id
    ? String(data.get("code") ?? "")
    : r.code("code", "Code", {
        taken: existing.filter((e) => e.code !== current?.code).map((e) => e.code),
      });

  const escalatesToCode = r.optionalText("escalatesToCode");
  const selfApprovalEscalatesToCode = r.optionalText("selfApprovalEscalatesToCode");

  // Authority reverts upward, never to itself: an office escalating to itself would
  // leave an absent holder's matter with nowhere to go.
  if (escalatesToCode && escalatesToCode === code) {
    r.reject("escalatesToCode", "An office cannot escalate to itself.");
  }
  if (selfApprovalEscalatesToCode && selfApprovalEscalatesToCode === code) {
    r.reject(
      "selfApprovalEscalatesToCode",
      "Self-approval must escalate to a different office, or it is not an escalation.",
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
    if (!before) return { ok: false, message: "That office no longer exists." };
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

  const personId = r.text("personId", "Officer", { required: true });
  const roleCode = r.text("roleCode", "Office", { required: true });
  const scope = r.optionalText("scope");
  const effectiveFrom = r.date("effectiveFrom", "Held from", { required: true });
  const effectiveTo = r.date("effectiveTo", "Held to");
  checkPeriod(r, effectiveFrom, effectiveTo);

  if (personId) {
    const person = await db.person.findFirst({
      where: { id: personId, organisationId: orgId },
      select: { isActive: true, name: true },
    });
    if (!person) r.reject("personId", "That officer is not on record.");
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
