"use server";

import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import { auditedCreate, auditedUpdate } from "@/lib/audit/record";
import { db } from "@/lib/db";
import { loadOrganisationData } from "@/lib/organisation/load";
import { checkCode, findFormat, inForceOn } from "@/lib/organisation/structure";
import { ORGANISATION_CODE } from "@/lib/org";
import { checkPeriod, FormReader } from "@/lib/validate";

const PROVENANCE = ["STATED", "OBSERVED", "ASSUMED"] as const;
const KINDS = ["COMPANY", "DIVISION", "DEPARTMENT", "SECTION"] as const;
const PATH = "/configuration/organisation";

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

/// Codes in force on the day the new entry starts. A code freed by a unit that closed
/// last year is available again.
function codesInForce(
  rows: { code: string; effectiveFrom: Date; effectiveTo: Date | null }[],
  on: Date,
  except?: string,
): string[] {
  return rows.filter((r) => inForceOn(r, on) && r.code !== except).map((r) => r.code);
}

/**
 * Check a code against the format the customer configured for it.
 *
 * Calls the same `checkCode` the screen renders with. Re-deriving a pattern here is
 * how the form and the table come to disagree about what is valid.
 */
async function rejectMalformed(
  r: FormReader,
  field: string,
  value: string,
  formatKey: string,
): Promise<void> {
  if (!value) return;
  const data = await loadOrganisationData(ORGANISATION_CODE);
  const result = checkCode(value, findFormat(data.formats, formatKey));
  if (result.state === "MALFORMED") {
    r.reject(
      field,
      `Does not match the configured format${result.example ? ` — for example ${result.example}` : ""}.`,
    );
  }
  if (result.state === "BAD_PATTERN") {
    r.reject(field, "The configured format for this code is not usable. Fix it under Code formats.");
  }
}

// -------------------------------------------------------------------- org units

export async function saveOrgUnit(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;

  const id = String(data.get("id") ?? "");
  const rows = await db.orgUnit.findMany({
    where: { organisationId: orgId },
    select: { id: true, code: true, effectiveFrom: true, effectiveTo: true },
  });
  const current = id ? rows.find((x) => x.id === id) : undefined;

  const r = new FormReader(data);
  const effectiveFrom = r.date("effectiveFrom", "In force from", { required: true });
  const effectiveTo = r.date("effectiveTo", "In force to");
  checkPeriod(r, effectiveFrom, effectiveTo);

  const code = id
    ? String(data.get("code") ?? "")
    : r.code("code", "Code", {
        taken: codesInForce(rows, effectiveFrom ?? new Date(), current?.code),
      });

  const parentCode = r.optionalText("parentCode");
  if (parentCode && parentCode === code) {
    r.reject("parentCode", "A unit cannot report to itself.");
  }

  const costCentreCode = r.optionalText("costCentreCode");
  if (costCentreCode) await rejectMalformed(r, "costCentreCode", costCentreCode, "cost_centre");

  const v = {
    code,
    nameEn: r.text("nameEn", "Name", { required: true, max: 160 }),
    nameMs: r.optionalText("nameMs"),
    kind: r.choice("kind", "Tier", KINDS, { required: true }),
    parentCode,
    costCentreCode,
    governingSource: r.text("governingSource", "Source", { max: 240 }),
    provenance: r.choice("provenance", "Provenance", PROVENANCE, { required: true }),
    notes: r.text("notes", "Notes", { max: 2000 }),
    sortOrder: r.int("sortOrder", "Order", { min: 0 }) ?? 0,
    effectiveFrom: effectiveFrom ?? new Date(),
    effectiveTo,
  };

  const parsed = r.finish(v);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  const ctx = {
    organisationId: orgId,
    entity: "OrgUnit",
    entityLabel: v.nameEn,
    reason: String(data.get("reason") ?? ""),
  };
  const write = { ...v, kind: v.kind!, provenance: v.provenance! };

  if (!id) {
    await auditedCreate(ctx, v, (tx) =>
      tx.orgUnit.create({ data: { organisationId: orgId, ...write } }),
    );
  } else {
    const before = await db.orgUnit.findUnique({ where: { id } });
    if (!before) return { ok: false, message: "That unit no longer exists." };
    await auditedUpdate({ ...ctx, entityId: id }, before, v, (tx) =>
      tx.orgUnit.update({ where: { id }, data: write }),
    );
  }

  revalidatePath(PATH);
  return { ok: true };
}

// ------------------------------------------- cost centres, account codes, sites

type SimpleEntity = "CostCentre" | "AccountCode" | "Site";

function tableFor(entity: SimpleEntity) {
  return entity === "CostCentre"
    ? db.costCentre
    : entity === "AccountCode"
      ? db.accountCode
      : db.site;
}

export async function saveCodedRecord(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;

  const entity = String(data.get("entity") ?? "") as SimpleEntity;
  if (!["CostCentre", "AccountCode", "Site"].includes(entity)) {
    return { ok: false, message: "Unknown record type." };
  }
  const id = String(data.get("id") ?? "");
  const table = tableFor(entity);

  const rows = await (table as typeof db.costCentre).findMany({
    where: { organisationId: orgId },
    select: { id: true, code: true, effectiveFrom: true, effectiveTo: true },
  });
  const current = id ? rows.find((x) => x.id === id) : undefined;

  const r = new FormReader(data);
  const effectiveFrom = r.date("effectiveFrom", "In force from", { required: true });
  const effectiveTo = r.date("effectiveTo", "In force to");
  checkPeriod(r, effectiveFrom, effectiveTo);

  const code = id
    ? String(data.get("code") ?? "")
    : r.code("code", "Code", {
        taken: codesInForce(rows, effectiveFrom ?? new Date(), current?.code),
      });

  // The customer's own format governs a cost centre and an account code. A site code
  // is the portal's own reference and has no configured shape.
  if (entity === "CostCentre") await rejectMalformed(r, "code", code, "cost_centre");
  if (entity === "AccountCode") await rejectMalformed(r, "code", code, "account_code");

  const common = {
    code,
    nameEn: r.text("nameEn", "Name", { required: true, max: 160 }),
    nameMs: r.optionalText("nameMs"),
    provenance: r.choice("provenance", "Provenance", PROVENANCE, { required: true }),
    notes: r.text("notes", "Notes", { max: 2000 }),
    sortOrder: r.int("sortOrder", "Order", { min: 0 }) ?? 0,
    effectiveFrom: effectiveFrom ?? new Date(),
    effectiveTo,
  };
  const v =
    entity === "Site"
      ? {
          ...common,
          address: r.text("address", "Address", { max: 400 }),
          orgUnitCode: r.optionalText("orgUnitCode"),
        }
      : common;

  const parsed = r.finish(v);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  const ctx = {
    organisationId: orgId,
    entity,
    entityLabel: common.nameEn,
    reason: String(data.get("reason") ?? ""),
  };
  const write = { ...v, provenance: common.provenance! };

  if (!id) {
    await auditedCreate(ctx, v, (tx) =>
      (tx[
        entity === "CostCentre" ? "costCentre" : entity === "AccountCode" ? "accountCode" : "site"
      ] as typeof db.costCentre).create({
        data: { organisationId: orgId, ...write } as never,
      }),
    );
  } else {
    const before = await (table as typeof db.costCentre).findUnique({ where: { id } });
    if (!before) return { ok: false, message: "That record no longer exists." };
    await auditedUpdate({ ...ctx, entityId: id }, before, v, (tx) =>
      (tx[
        entity === "CostCentre" ? "costCentre" : entity === "AccountCode" ? "accountCode" : "site"
      ] as typeof db.costCentre).update({ where: { id }, data: write as never }),
    );
  }

  revalidatePath(PATH);
  return { ok: true };
}

// ------------------------------------------------------------------ code formats

export async function saveCodeFormat(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;

  const r = new FormReader(data);
  const key = r.choice("key", "Applies to", ["cost_centre", "account_code"] as const, {
    required: true,
  });
  const pattern = r.text("pattern", "Pattern", { required: true, max: 400 });

  // A pattern that will not compile would either crash a screen or silently accept
  // everything. Refused here, where the customer can still see what they typed.
  if (pattern) {
    try {
      new RegExp(`^(?:${pattern})$`);
    } catch {
      r.reject("pattern", "That is not a usable regular expression.");
    }
  }

  const example = r.text("example", "Example", { max: 120 });
  const description = r.text("description", "Requirement", { max: 400 });
  const provenance = r.choice("provenance", "Provenance", PROVENANCE, { required: true });

  // An example that does not satisfy its own pattern would mislead every officer who
  // trusts it.
  if (pattern && example && !r.failed) {
    const result = checkCode(example, {
      key: key ?? "",
      pattern,
      example,
      description,
      provenance: "STATED",
    });
    if (result.state === "MALFORMED") {
      r.reject("example", "The example does not satisfy the pattern above.");
    }
  }

  const v = { key: key ?? "", pattern, example, description, provenance };
  const parsed = r.finish(v);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  const existing = await db.codeFormat.findFirst({
    where: { organisationId: orgId, key: v.key },
  });

  const ctx = {
    organisationId: orgId,
    entity: "CodeFormat",
    entityLabel: v.key === "cost_centre" ? "Cost centre format" : "Account code format",
    reason: String(data.get("reason") ?? ""),
  };
  const write = { ...v, provenance: v.provenance! };

  if (!existing) {
    await auditedCreate(ctx, v, (tx) =>
      tx.codeFormat.create({ data: { organisationId: orgId, ...write } }),
    );
  } else {
    await auditedUpdate({ ...ctx, entityId: existing.id }, existing, v, (tx) =>
      tx.codeFormat.update({ where: { id: existing.id }, data: write }),
    );
  }

  revalidatePath(PATH);
  return { ok: true };
}

// ------------------------------------------------------------------------ close

/**
 * Closing a record ends its period today rather than deleting it.
 *
 * A requisition raised last year must still resolve the unit, cost centre or site it
 * named. Nothing configured here is ever removed from the database.
 */
export async function closeRecord(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;

  const entity = String(data.get("entity") ?? "");
  const id = String(data.get("id") ?? "");
  const reason = String(data.get("reason") ?? "").trim();
  if (!reason) return { ok: false, errors: { reason: "A reason is required." } };

  const key =
    entity === "OrgUnit"
      ? "orgUnit"
      : entity === "CostCentre"
        ? "costCentre"
        : entity === "AccountCode"
          ? "accountCode"
          : entity === "Site"
            ? "site"
            : null;
  if (!key) return { ok: false, message: "Unknown record type." };

  const before = await (db[key] as typeof db.costCentre).findUnique({ where: { id } });
  if (!before) return { ok: false, message: "That record no longer exists." };
  if (before.effectiveTo) return { ok: false, message: "That record is already closed." };

  const effectiveTo = new Date();
  await auditedUpdate(
    { organisationId: orgId, entity, entityId: id, entityLabel: before.nameEn, reason },
    { effectiveTo: null },
    { effectiveTo },
    (tx) => (tx[key] as typeof db.costCentre).update({ where: { id }, data: { effectiveTo } }),
  );

  revalidatePath(PATH);
  return { ok: true };
}
