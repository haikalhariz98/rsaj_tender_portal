"use server";

import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import { diffFields } from "@/lib/audit/diff";
import { writeAudit } from "@/lib/audit/record";
import { db } from "@/lib/db";
import { parseSen, senToDecimalString } from "@/lib/money";
import { gateRuleFaults, type GateRuleFault } from "@/lib/requisition/gate";
import { requisitionOrg } from "@/lib/requisition/repo";
import { SPLIT_KEYS, type SplitKey } from "@/lib/requisition/types";
import { FormReader } from "@/lib/validate";
import { splitValues } from "@/lib/ui/select-logic";

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
const list = (data: FormData, name: string) => splitValues(data.get(name));

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
    splitJustifyingRoleCode: r.optionalText("splitJustifyingRoleCode"),
    provenance: r.choice("provenance", "Provenance", PROVENANCE),
    notes: r.text("notes", "Notes", { max: 4000 }),
  };
  const reason = r.text("reason", "Reason", { max: 2000 });
  if (v.splitJustifyingRoleCode) {
    const office = await db.authorityRole.findFirst({ where: { organisationId: org.id, code: v.splitJustifyingRoleCode, isCommittee: false }, select: { id: true } });
    if (!office) r.reject("splitJustifyingRoleCode", "That is not an office. Add it under Users & roles first.");
  }
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

/// The finance system's numbers the portal consumes: the requisition's two, and the indent's (6.11).
const FORMAT_KEYS = ["erp_requisition_no", "erp_note_no", "erp_indent_no"] as const;

/**
 * The shape of one of the finance system's numbers, as a pattern with an example.
 * The customer's own: the portal consumes these numbers and never mints them, so it
 * can only check them against a shape somebody has set. Cleared, it is not checked.
 */
export async function saveErpFormat(_prev: FormState, data: FormData): Promise<FormState> {
  const org = await requisitionOrg();
  if (!org) return NO_ORG;
  const r = new FormReader(data);
  const key = r.choice("key", "Number", FORMAT_KEYS, { required: true });
  const pattern = r.text("pattern", "Pattern", { max: 200 });
  const example = r.text("example", "Example", { max: 120 });
  const description = r.text("description", "Description", { max: 400 });
  const provenance = r.choice("provenance", "Provenance", PROVENANCE);
  const reason = r.text("reason", "Reason", { max: 2000 });
  if (pattern) {
    try {
      new RegExp(`^(?:${pattern})$`);
    } catch {
      r.reject("pattern", "That is not a pattern the portal can read.");
    }
    if (!provenance) r.reject("provenance", "Say where the shape comes from.");
    if (example && !new RegExp(`^(?:${pattern})$`).test(example)) r.reject("example", "The example does not match the pattern.");
  }
  if (r.failed || !key) return { ok: false, errors: r.errors };
  await db.$transaction(async (tx) => {
    const before = await tx.codeFormat.findUnique({ where: { organisationId_key: { organisationId: org.id, key } } });
    const label = key === "erp_requisition_no" ? "Finance system requisition no. format" : key === "erp_note_no" ? "Requisition note no. format" : "Indent number format";
    if (!pattern) {
      if (!before) return;
      await tx.codeFormat.delete({ where: { id: before.id } });
      await writeAudit(tx, { organisationId: org.id, entity: "CodeFormat", entityId: before.id, entityLabel: label, reason }, "DELETE",
        diffFields({ pattern: before.pattern, example: before.example }, { pattern: null, example: null }));
      return;
    }
    const v = { pattern, example, description, provenance: provenance! };
    const row = await tx.codeFormat.upsert({
      where: { organisationId_key: { organisationId: org.id, key } },
      update: v,
      create: { organisationId: org.id, key, ...v },
    });
    const changes = diffFields(before, v);
    if (!before || changes.length > 0) {
      await writeAudit(tx, { organisationId: org.id, entity: "CodeFormat", entityId: row.id, entityLabel: label, reason }, before ? "UPDATE" : "CREATE", changes);
    }
  });
  revalidatePath(PATH);
  revalidatePath("/requisitions");
  revalidatePath("/configuration/awards");
  return { ok: true };
}

// ------------------------------------------------------------- committee gate rules

const ACTS = ["P", "JP", "R", "JR", "MR", "MJR", "A", "MA"] as const;

const GATE_RULE_TEXT: Record<GateRuleFault, { field: string; message: string }> = {
  ROUTE_UNKNOWN: { field: "fundingRouteCode", message: "Choose a funding route on file." },
  COMMITTEE_UNKNOWN: { field: "committeeCode", message: "Choose a committee on file." },
  ENDS_BEFORE_IT_STARTS: { field: "effectiveTo", message: "It must end after it starts." },
  OVERLAPS: { field: "effectiveFrom", message: "This committee already answers this route's gate over part of that period. End the other rule first, or start this one after it." },
};

/**
 * A committee gate rule (FR-REQ-012, ADR 0010): which committee passes an approved
 * requisition on a funding route before its first exercise, above what value. The
 * customer's policy; none ships. A requisition's gates are a snapshot of the rules as
 * they read when it was approved, so an edit here changes nothing already determined.
 */
export async function saveGateRule(_prev: FormState, data: FormData): Promise<FormState> {
  const org = await requisitionOrg();
  if (!org) return NO_ORG;
  const id = String(data.get("id") ?? "");
  const r = new FormReader(data);
  const v = {
    fundingRouteCode: r.text("fundingRouteCode", "Funding route", { required: true }),
    committeeCode: r.text("committeeCode", "Committee", { required: true }),
    subjectEn: r.text("subjectEn", "What is put to it", { required: true, max: 240 }),
    subjectMs: r.optionalText("subjectMs"),
    act: r.choice("act", "The committee's act", ACTS, { required: true }),
    aboveValue: r.money("aboveValue", "Applies above"),
    governingSource: r.text("governingSource", "Source", { max: 240 }),
    provenance: r.choice("provenance", "Provenance", PROVENANCE, { required: true }),
    effectiveFrom: r.date("effectiveFrom", "In force from", { required: true }),
    effectiveTo: r.date("effectiveTo", "In force to"),
    sortOrder: r.int("sortOrder", "Order", { min: 0 }) ?? 0,
  };
  const reason = r.text("reason", "Reason", { max: 2000 });
  if (r.failed || !v.effectiveFrom || !v.act || !v.provenance) return { ok: false, errors: r.errors };
  const [routes, committees, others] = await Promise.all([
    db.fundingRoute.findMany({ where: { organisationId: org.id, retiredOn: null }, select: { code: true } }),
    db.committee.findMany({ where: { organisationId: org.id, retiredOn: null }, select: { code: true } }),
    db.committeeGateRule.findMany({ where: { organisationId: org.id } }),
  ]);
  const faults = gateRuleFaults({ id: id || "new", ...v, effectiveFrom: v.effectiveFrom, effectiveTo: v.effectiveTo }, others, {
    routes: routes.map((x) => x.code),
    committees: committees.map((x) => x.code),
  });
  if (faults.length > 0) return { ok: false, errors: Object.fromEntries(faults.map((f) => [GATE_RULE_TEXT[f].field, GATE_RULE_TEXT[f].message])) };
  const write = { ...v, act: v.act, provenance: v.provenance, effectiveFrom: v.effectiveFrom, aboveValue: v.aboveValue ? senToDecimalString(parseSen(v.aboveValue)) : null };
  await db.$transaction(async (tx) => {
    if (!id) {
      const row = await tx.committeeGateRule.create({ data: { organisationId: org.id, ...write } });
      await writeAudit(tx, { organisationId: org.id, entity: "CommitteeGateRule", entityId: row.id, entityLabel: `Committee gate: ${v.subjectEn}`, reason }, "CREATE", diffFields(null, write));
      return;
    }
    const before = await tx.committeeGateRule.findFirst({ where: { id, organisationId: org.id } });
    if (!before) return;
    await tx.committeeGateRule.update({ where: { id }, data: write });
    const changes = diffFields({ ...before, aboveValue: before.aboveValue?.toString() ?? null }, write);
    if (changes.length > 0) await writeAudit(tx, { organisationId: org.id, entity: "CommitteeGateRule", entityId: id, entityLabel: `Committee gate: ${v.subjectEn}`, reason }, "UPDATE", changes);
  });
  revalidatePath(PATH);
  return { ok: true };
}
