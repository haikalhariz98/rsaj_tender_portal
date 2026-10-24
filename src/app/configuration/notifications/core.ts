import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import { auditedCreate, auditedUpdate } from "@/lib/audit/record";
import { db } from "@/lib/db";
import { SUPPLIER_EXPIRY_EVENT } from "@/lib/suppliers/expiry";
import { FormReader } from "@/lib/validate";
import { requireStaff, toAuditActor } from "@/app/_auth/actor";
import type { OrgScope } from "@/lib/org-scope";

const PROVENANCE = ["STATED", "OBSERVED", "ASSUMED"] as const;
const PATH = "/configuration/notifications";

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

/**
 * Reminder offsets, read from a comma-separated list.
 *
 * Held largest first so the schedule reads in the order it happens. Duplicates are
 * collapsed: reminding twice on the same day is a configuration slip, not a policy.
 */
function readOffsets(r: FormReader, raw: string | null): number[] {
  if (!raw) return [];
  const parts = raw
    .split(/[,\s]+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const days: number[] = [];
  for (const part of parts) {
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0) {
      r.reject("reminderOffsetDays", `"${part}" is not a whole number of days.`);
      return [];
    }
    if (!days.includes(n)) days.push(n);
  }
  return days.sort((a, b) => b - a);
}

export async function saveNotificationRule(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const orgId = await organisationId(actor);
  if (!orgId) return NO_ORG;

  const id = String(data.get("id") ?? "");
  const existing = await db.notificationRule.findMany({
    where: { organisationId: orgId },
    select: { id: true, eventKey: true },
  });
  const current = id ? existing.find((e) => e.id === id) : undefined;
  if (id && !current) return { ok: false, message: "That notification no longer exists." };

  const r = new FormReader(data);
  // The event a rule listens for is set once. The edit drawer does not offer it, so
  // it comes from the stored record rather than from a form that has no such field.
  const eventKey = current
    ? current.eventKey
    : r.code("eventKey", "Event", { taken: existing.map((e) => e.eventKey) });

  const offices = await db.authorityRole.findMany({
    where: { organisationId: orgId },
    select: { code: true },
  });
  const known = new Set(offices.map((o) => o.code));

  const recipientRoleCodes = (r.optionalText("recipientRoleCodes") ?? "")
    .split(/[,\s]+/)
    .map((c) => c.trim())
    .filter(Boolean);

  for (const code of recipientRoleCodes) {
    if (!known.has(code)) {
      r.reject("recipientRoleCodes", `${code} is not an office. Add it under Users & roles first.`);
      break;
    }
  }

  const escalatesToRoleCode = r.optionalText("escalatesToRoleCode");
  if (escalatesToRoleCode && !known.has(escalatesToRoleCode)) {
    r.reject("escalatesToRoleCode", "That is not an office.");
  }

  const reminderOffsetDays = readOffsets(r, r.optionalText("reminderOffsetDays"));

  const isActive = r.bool("isActive");
  // A rule that notifies nobody and is switched on would look like a working rule and
  // send nothing. Switching it off records the decision instead.
  // The supplier-expiry rule is read by suppliers in the portal, not by offices.
  if (isActive && recipientRoleCodes.length === 0 && eventKey !== SUPPLIER_EXPIRY_EVENT) {
    r.reject(
      "recipientRoleCodes",
      "An active rule needs at least one recipient. Switch it off to record that this event notifies nobody.",
    );
  }

  const v = {
    eventKey,
    nameEn: r.text("nameEn", "Name", { required: true, max: 160 }),
    recipientRoleCodes,
    reminderOffsetDays,
    escalatesToRoleCode,
    isActive,
    provenance: r.choice("provenance", "Provenance", PROVENANCE, { required: true }),
    notes: r.text("notes", "Notes", { max: 2000 }),
    sortOrder: r.int("sortOrder", "Order", { min: 0 }) ?? 0,
  };

  const parsed = r.finish(v);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  const ctx = {
    organisationId: orgId,
    entity: "NotificationRule",
    entityLabel: v.nameEn,
    reason: String(data.get("reason") ?? ""),
    actor: toAuditActor(actor),
  };
  const write = { ...v, provenance: v.provenance! };
  // Arrays render as their joined text in the trail, which is what a reader wants.
  const forTrail = {
    ...v,
    recipientRoleCodes: v.recipientRoleCodes.join(", "),
    reminderOffsetDays: v.reminderOffsetDays.join(", "),
  };

  if (!id) {
    await auditedCreate(ctx, forTrail, (tx) =>
      tx.notificationRule.create({ data: { organisationId: orgId, ...write } }),
    );
  } else {
    const before = await db.notificationRule.findUnique({ where: { id, organisationId: actor.organisationId } });
    if (!before) return { ok: false, message: "That rule no longer exists." };
    await auditedUpdate(
      { ...ctx, entityId: id },
      {
        ...before,
        recipientRoleCodes: before.recipientRoleCodes.join(", "),
        reminderOffsetDays: before.reminderOffsetDays.join(", "),
      },
      forTrail,
      (tx) => tx.notificationRule.update({ where: { id, organisationId: actor.organisationId }, data: write }),
    );
  }

  revalidatePath(PATH);
  return { ok: true };
}
