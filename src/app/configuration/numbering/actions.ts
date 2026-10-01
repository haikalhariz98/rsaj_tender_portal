"use server";

import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import { auditedCreate, auditedUpdate } from "@/lib/audit/record";
import { organisationDay } from "@/lib/dates";
import { db } from "@/lib/db";
import { afterConfiguring, patternFaults, serialFor, type Series } from "@/lib/numbering/series";
import { ORGANISATION_CODE } from "@/lib/org";
import { FormReader } from "@/lib/validate";

const PROVENANCE = ["STATED", "OBSERVED", "ASSUMED"] as const;
const RESETS = ["NEVER", "CALENDAR_YEAR", "FINANCIAL_YEAR"] as const;
const PATH = "/configuration/numbering";

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

export async function saveSeries(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;

  const id = String(data.get("id") ?? "");
  const existing = await db.numberingSeries.findMany({
    where: { organisationId: orgId },
    select: { id: true, key: true },
  });
  const current = id ? existing.find((e) => e.id === id) : undefined;
  if (id && !current) return { ok: false, message: "That series no longer exists." };

  const r = new FormReader(data);
  // What a series applies to is set once: references already issued were formed
  // under it. The edit drawer does not offer it, so it comes from the stored record.
  const key = current
    ? current.key
    : r.code("key", "Applies to", { taken: existing.map((e) => e.key) });

  const pattern = r.text("pattern", "Pattern", { required: true, max: 200 });
  const resetOn = r.choice("resetOn", "Starts again", RESETS, { required: true });
  const financialYearStartMonth = r.int("financialYearStartMonth", "Financial year starts", {
    min: 1,
  });

  if (financialYearStartMonth != null && financialYearStartMonth > 12) {
    r.reject("financialYearStartMonth", "There are twelve months.");
  }

  // The same faults the screen renders, refused at entry. A pattern with no serial
  // gives every matter one reference; a yearly reset with no year in the pattern
  // collides only when next year's first matter is raised, which is far too late.
  if (pattern && resetOn) {
    for (const fault of patternFaults({ pattern, resetOn })) {
      if (fault.kind === "NO_SERIAL") {
        r.reject("pattern", "The pattern must contain {SERIAL}, or every reference is the same.");
      }
      if (fault.kind === "UNKNOWN_TOKEN") {
        r.reject(
          "pattern",
          `{${fault.token}} is not a token. Use {SERIAL}, {YEAR}, {SHORTYEAR} or {MONTH}.`,
        );
      }
      if (fault.kind === "RESET_WITHOUT_PERIOD") {
        r.reject(
          "pattern",
          "This series starts again each period, so the pattern must show {YEAR} or {SHORTYEAR} — otherwise two matters in different years share a reference.",
        );
      }
    }
  }

  // The serial's period is stamped on the organisation's day, never the UTC one; unset,
  // no period can be stamped, so nothing is saved (6.10 §9.5 follow-up).
  const zone = (await db.organisation.findUnique({ where: { id: orgId }, select: { timeZone: true } }))?.timeZone ?? null;
  const day = organisationDay(new Date(), zone);
  if (!day) {
    return { ok: false, message: "A series' serial belongs to the period of the organisation's day, and its time zone is not set. Set it under Configuration, Organisation first." };
  }
  const now = day;
  const stored = current ? await db.numberingSeries.findUnique({ where: { id } }) : null;
  const storedSeries: Series | null = stored;

  const nextSerial = r.int("nextSerial", "Next serial", { min: 1 });
  if (storedSeries && nextSerial != null) {
    // A serial never goes backwards: an allocated reference is never reused, and a
    // gap is evidence while a duplicate is a defect. Measured against what the series
    // would issue today, so a due yearly reset may be confirmed at 1.
    const floor = serialFor(storedSeries, now);
    if (nextSerial < floor) {
      r.reject(
        "nextSerial",
        `The serial cannot go back. It is at ${floor}; an allocated reference is never reused.`,
      );
    }
  }

  const v = {
    key,
    nameEn: r.text("nameEn", "Name", { required: true, max: 120 }),
    pattern,
    padding: r.int("padding", "Serial width", { min: 1 }) ?? 1,
    resetOn: resetOn ?? "NEVER",
    financialYearStartMonth: financialYearStartMonth ?? 1,
    provenance: r.choice("provenance", "Provenance", PROVENANCE, { required: true }),
    notes: r.text("notes", "Notes", { max: 2000 }),
  };

  const parsed = r.finish(v);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  // Blank keeps the stored serial; a typed one is stamped with today's period.
  const serial = afterConfiguring(
    storedSeries,
    { resetOn: v.resetOn, financialYearStartMonth: v.financialYearStartMonth },
    nextSerial,
    now,
  );

  const ctx = {
    organisationId: orgId,
    entity: "NumberingSeries",
    entityLabel: v.nameEn,
    reason: String(data.get("reason") ?? ""),
  };
  const write = { ...v, ...serial, resetOn: v.resetOn, provenance: v.provenance! };

  if (!stored) {
    await auditedCreate(ctx, write, (tx) =>
      tx.numberingSeries.create({ data: { organisationId: orgId, ...write } }),
    );
  } else {
    await auditedUpdate({ ...ctx, entityId: stored.id }, stored, write, (tx) =>
      tx.numberingSeries.update({ where: { id: stored.id }, data: write }),
    );
  }

  revalidatePath(PATH);
  return { ok: true };
}
