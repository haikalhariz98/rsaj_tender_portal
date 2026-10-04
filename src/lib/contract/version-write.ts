/**
 * The baseline's version writer for extensions (6.13 Part B run 1b; ADR 0030 §1, ADR 0021 Amendment 2; flagged against
 * 6.12). Server-only for `writeExtensionVersion` (inside the caller's transaction, under the contract's lock, after the
 * certificate's); `extensionValues` is pure.
 *
 * An issued EOT certificate writes a version with reason EXTENSION_OF_TIME; an issued contract period agreement one with
 * PERIOD_EXTENSION. Each is the latest version's values with the extension's days added: to the whole works (the date
 * for completion moves, and every section with it) or to one section alone. The days are kept on the version
 * (`extensionDays`), so a later correction that derives the date from possession and the period keeps them. Written
 * once, never updated, with its sections; its CREATE entry says what it changed. Nothing else writes these reasons.
 */

import type { Prisma } from "@/generated/prisma/client";
import { diffFields } from "@/lib/audit/diff";
import { writeAudit, type Tx } from "@/lib/audit/record";
import { dayToDate } from "@/lib/dates";
import { extendedDates } from "@/lib/time/extension";

import { changedFields, latestVersion, type BaselineValues } from "./baseline";
import { baselineRows, rowOf, sectionRows, valuesOf } from "./load";
import { contractLabel, type LoadedContract } from "./repo";

/// The values after an extension of `days` on the scope (the whole works, or the section alone).
export function extensionValues(v: BaselineValues, scope: "WHOLE" | "SECTION", sectionRef: string | null, days: number): BaselineValues {
  const d = extendedDates({ dateForCompletion: v.dateForCompletion, extensionDays: v.extensionDays ?? 0, sections: v.sections.map((s) => ({ ...s, extensionDays: s.extensionDays ?? 0 })) }, scope, sectionRef, days);
  return { ...v, dateForCompletion: d.dateForCompletion, extensionDays: d.extensionDays, sections: d.sections };
}

export interface ExtensionVersionInput {
  reason: "EXTENSION_OF_TIME" | "PERIOD_EXTENSION";
  scope: "WHOLE" | "SECTION";
  sectionRef: string | null;
  days: number;
  /// What the version records it was written by (its certificate's number), frozen in its snapshot.
  writtenBy: { kind: string; certificateId: string; number: string | null };
  now: Date;
  today: string;
}

export interface WrittenVersion {
  id: string;
  version: number;
  values: BaselineValues;
}

/// Write the version (the latest version's values extended), its sections and its audit. Returns its id and values.
export async function writeExtensionVersion(tx: Tx, l: LoadedContract, i: ExtensionVersionInput): Promise<WrittenVersion> {
  const { versions, draft } = baselineRows(l.contract);
  const prior = latestVersion(versions);
  if (!prior) throw new Error("No baseline version to extend.");
  const before = valuesOf(prior);
  const after = extensionValues(before, i.scope, i.sectionRef, i.days);
  const version = (prior.version ?? 0) + 1;
  const row = await tx.contractBaseline.create({
    data: {
      organisationId: l.org.id,
      contractId: l.contract.id,
      version,
      reason: i.reason,
      correctionReason: "",
      recordedAt: i.now,
      recordedOn: dayToDate(i.today),
      ...rowOf(after),
      entered: (prior.entered ?? {}) as Prisma.InputJsonValue,
      snapshot: { ...(draft?.snapshot as object), extension: { reason: i.reason, scope: i.scope, sectionRef: i.sectionRef, days: i.days, writtenBy: i.writtenBy } } as Prisma.InputJsonValue,
    },
  });
  for (const s of sectionRows(after, l.org.id)) await tx.contractSection.create({ data: { ...s, baselineId: row.id } });
  await writeAudit(tx, { organisationId: l.org.id, entity: "ContractBaseline", entityId: row.id, entityLabel: `${contractLabel({ number: l.contract.number, award: { awardeeName: l.award.awardeeName } })} · baseline version ${version}`, reason: "" }, "CREATE",
    diffFields(null, { version, reason: i.reason === "EXTENSION_OF_TIME" ? "By an extension of time" : "By an extension of the contract period", changed: changedFields(before, after).join(", ") || "nothing", dateForCompletion: after.dateForCompletion, extendedBy: `${i.days} days${i.scope === "SECTION" ? ` (section ${i.sectionRef})` : ""}`, writtenBy: i.writtenBy.number ?? "its certificate" }));
  return { id: row.id, version, values: after };
}
