"use server";

import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import { diffFields } from "@/lib/audit/diff";
import { writeAudit } from "@/lib/audit/record";
import { db } from "@/lib/db";
import { requisitionOrg } from "@/lib/requisition/repo";
import { SPLIT_KEYS, type SplitKey } from "@/lib/requisition/types";
import { FormReader } from "@/lib/validate";

/**
 * Requisition controls: the customer's policy for requisitions, every field unset
 * until set. Saving an empty field clears it back to unset, which is recorded — unset
 * is a state the screen shows, never a zero.
 */

const PATH = "/configuration/requisitions";
const NO_ORG: FormState = { ok: false, message: "No organisation is configured. Run npm run setup first." };
const TIERS = ["COMPANY", "DIVISION", "DEPARTMENT", "SECTION"] as const;
const PROVENANCE = ["STATED", "OBSERVED", "ASSUMED"] as const;

/// A three-way choice posted as "yes" / "no" / "" (not set).
function triState(r: FormReader, name: string, label: string): boolean | null {
  const v = r.choice(name, label, ["yes", "no"] as const);
  return v == null ? null : v === "yes";
}

/// Values posted newline-separated by the tokens field.
const list = (data: FormData, name: string) =>
  String(data.get(name) ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

export async function savePolicy(_prev: FormState, data: FormData): Promise<FormState> {
  const org = await requisitionOrg();
  if (!org) return NO_ORG;
  const r = new FormReader(data);
  const matchOn = list(data, "splittingMatchOn");
  const tiers = list(data, "endorsementTiers");
  if (matchOn.some((k) => !(SPLIT_KEYS as readonly string[]).includes(k))) r.reject("splittingMatchOn", "Choose from the fields offered.");
  if (tiers.some((t) => !(TIERS as readonly string[]).includes(t))) r.reject("endorsementTiers", "Choose from the tiers offered.");
  const v = {
    splittingWindowDays: r.int("splittingWindowDays", "Splitting window", { min: 1 }),
    splittingMatchOn: matchOn as SplitKey[],
    splittingAggregateAcrossYear: triState(r, "splittingAggregateAcrossYear", "Aggregate across the financial year"),
    budgetRecheckDays: r.int("budgetRecheckDays", "Re-check after", { min: 0 }),
    endorsementTiers: tiers as (typeof TIERS)[number][],
    erpReferenceRequired: triState(r, "erpReferenceRequired", "Registration needs the finance system's numbers"),
    provenance: r.choice("provenance", "Provenance", PROVENANCE),
    notes: r.text("notes", "Notes", { max: 4000 }),
  };
  const reason = r.text("reason", "Reason", { max: 2000 });
  const parsed = r.finish(v);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  await db.$transaction(async (tx) => {
    const before = await tx.requisitionPolicy.findUnique({ where: { organisationId: org.id } });
    const row = await tx.requisitionPolicy.upsert({ where: { organisationId: org.id }, update: v, create: { organisationId: org.id, ...v } });
    const flat = (x: typeof v | NonNullable<typeof before>) => ({ ...x, splittingMatchOn: x.splittingMatchOn.join(", "), endorsementTiers: x.endorsementTiers.join(", ") });
    const changes = diffFields(before ? flat(before) : null, flat(v));
    if (!before || changes.length > 0) {
      await writeAudit(tx, { organisationId: org.id, entity: "RequisitionPolicy", entityId: row.id, entityLabel: "Requisition controls", reason }, before ? "UPDATE" : "CREATE", changes);
    }
  });
  revalidatePath(PATH);
  return { ok: true };
}

/// Where the budget check comes from (FinanceIntegration.budgetCheckSource). Unset runs none.
export async function saveBudgetCheckSource(_prev: FormState, data: FormData): Promise<FormState> {
  const org = await requisitionOrg();
  if (!org) return NO_ORG;
  const r = new FormReader(data);
  const source = r.choice("budgetCheckSource", "Budget check source", ["PORTAL_LEDGER", "MANUAL_ERP_ENTRY"] as const);
  const reason = r.text("reason", "Reason", { max: 2000 });
  if (r.failed) return { ok: false, errors: r.errors };
  await db.$transaction(async (tx) => {
    const before = await tx.financeIntegration.findUnique({ where: { organisationId: org.id } });
    const row = await tx.financeIntegration.upsert({
      where: { organisationId: org.id },
      update: { budgetCheckSource: source },
      create: { organisationId: org.id, budgetCheckSource: source },
    });
    const changes = diffFields({ budgetCheckSource: before?.budgetCheckSource ?? null }, { budgetCheckSource: source });
    if (changes.length > 0) {
      await writeAudit(tx, { organisationId: org.id, entity: "FinanceIntegration", entityId: row.id, entityLabel: "Budget check source", reason }, before ? "UPDATE" : "CREATE", changes);
    }
  });
  revalidatePath(PATH);
  return { ok: true };
}
