/**
 * A loader for the customer's own registration lists (Phase 4b): the work codes of the bodies it registers suppliers under, and its banks and account types. It holds NO DATA. The lists
 * are the customer's (the registry's thousands of codes are theirs to supply, from the bodies' own publications), and the product ships none of them (AGENTS.md rule 1).
 *
 * It is never run by `npm run setup` or by the demonstration. A person runs it, on purpose, over a directory of files the customer supplied:
 *
 *   npx tsx prisma/rsaj/registration-seed.ts <directory>            judge the files and say what would be loaded; writes nothing
 *   npx tsx prisma/rsaj/registration-seed.ts <directory> --apply    load them
 *
 * The directory may hold either file, or both:
 *   registration-values.json   [{ bodyCode, kind, code, nameEn, nameMs?, parentCode?, rank?, valueCeiling?, ceilingProvenance?, governingSource, provenance: "STATED" }]
 *   lists.json                 [{ list: "BANK" | "ACCOUNT_TYPE", code, nameEn, nameMs?, governingSource, provenance: "STATED" }]
 * `bodyCode` is the code of a registration body already configured under Tender documents. Every row is STATED and names its source (spec B8): a row that is an assumption or an observed
 * habit, or that names no source, refuses the file, and is entered under Configuration instead, where it shows as what it is.
 *
 * What this loader covers, and what it does not (a decided difference from spec B8, which lists more): the registry's work codes, the banks and the account types, the lists that run to
 * hundreds or thousands of rows. The rest of what B8 names (document types with their hints, rates and switches, the entity, country, Bumiputera and state lists, the SSM, account-number and SWIFT
 * formats, the two declaration texts, the notice, the help contact, the quotas and the contact switch) is a handful of rows or one value each, and has an audited editor with its own
 * validation under Configuration; typing them there records who set each and why. A loader for them is a later step.
 *
 * A row with no name is refused, and one row refused refuses its whole file: nothing is written unless every row of every file is in order. A code already on the register is left as it
 * is. Each load is audited in the register's trail as the system ("RSAJ registration loader"), and runs in one transaction under the organisation's lock.
 */
import "dotenv/config";

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { diffFields } from "../../src/lib/audit/diff";
import { writeAudit } from "../../src/lib/audit/record";
import type { AuditActor } from "../../src/lib/auth/types";
import { db } from "../../src/lib/db";
import { ORGANISATION_CODE } from "../../src/lib/org";
import { judgeListFile, judgeValueFile } from "../../src/lib/suppliers/seed-files";

const ACTOR: AuditActor = { kind: "SYSTEM", label: "RSAJ registration loader" };
const WORDS = { STATED: "Stated", OBSERVED: "Observed", ASSUMED: "Assumed" } as const;

function read(dir: string, name: string): unknown | undefined {
  const file = path.join(dir, name);
  if (!existsSync(file)) return undefined;
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    throw new Error(`${name} is not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const apply = process.argv.includes("--apply");
  const dir = args[0];
  if (!dir) throw new Error("Give the directory of the customer's files: npx tsx prisma/rsaj/registration-seed.ts <directory> [--apply]. Nothing is loaded without it.");
  const values = read(dir, "registration-values.json");
  const lists = read(dir, "lists.json");
  if (values === undefined && lists === undefined) throw new Error(`There is neither registration-values.json nor lists.json in ${dir}.`);

  const org = await db.organisation.findUnique({ where: { code: ORGANISATION_CODE }, select: { id: true } });
  if (!org) throw new Error(`There is no organisation with the code ${ORGANISATION_CODE}. Run npm run setup first.`);

  const bodies = await db.registrationBody.findMany({ where: { organisationId: org.id }, select: { id: true, code: true } });
  const bodyCode = new Map(bodies.map((b) => [b.id, b.code]));
  const existingValues = (await db.registrationValue.findMany({ where: { organisationId: org.id }, select: { bodyId: true, kind: true, code: true, rank: true } })).map((v) => ({ bodyCode: bodyCode.get(v.bodyId) ?? "", kind: v.kind, code: v.code, rank: v.rank }));
  const existingLists = await db.supplierListValue.findMany({ where: { organisationId: org.id, list: { in: ["BANK", "ACCOUNT_TYPE"] } }, select: { list: true, code: true } });

  const judgedValues = values === undefined ? null : judgeValueFile(values, { bodyCodes: bodies.map((b) => b.code), existing: existingValues });
  const judgedLists = lists === undefined ? null : judgeListFile(lists, { existing: existingLists });
  const errors = [...(judgedValues?.errors.map((e) => `registration-values.json: ${e}`) ?? []), ...(judgedLists?.errors.map((e) => `lists.json: ${e}`) ?? [])];
  if (errors.length > 0) {
    console.error(`Nothing was loaded. ${errors.length} row${errors.length === 1 ? "" : "s"} must be put right first:`);
    for (const e of errors) console.error(`  ${e}`);
    process.exitCode = 1;
    return;
  }
  const say = (what: string, j: { rows: unknown[]; skipped: number } | null) => j && console.log(`${what}: ${j.rows.length} to load, ${j.skipped} already on the register.`);
  say("Registration values", judgedValues);
  say("Banks and account types", judgedLists);
  if (!apply) {
    console.log("Nothing was written. Run again with --apply to load them.");
    return;
  }

  await db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Organisation" WHERE id = ${org.id} FOR UPDATE`;
      const bodyId = new Map(bodies.map((b) => [b.code, b.id]));
      let order = 0;
      for (const v of judgedValues?.rows ?? []) {
        const row = await tx.registrationValue.create({
          data: { organisationId: org.id, bodyId: bodyId.get(v.bodyCode)!, kind: v.kind, code: v.code, nameEn: v.nameEn, nameMs: v.nameMs, parentCode: v.parentCode, rank: v.rank, valueCeiling: v.valueCeiling, ceilingProvenance: v.ceilingProvenance, governingSource: v.governingSource, provenance: v.provenance, sortOrder: ++order },
          select: { id: true },
        });
        await writeAudit(tx, { actor: ACTOR, organisationId: org.id, entity: "RegistrationValue", entityId: row.id, entityLabel: `Registration value · ${v.bodyCode} · ${v.nameEn}`, reason: "Loaded from the customer's file" }, "CREATE", diffFields(null, { name: v.nameEn, rank: v.rank, valueCeiling: v.valueCeiling, governingSource: v.governingSource || null, whereItComesFrom: WORDS[v.provenance] }));
      }
      for (const l of judgedLists?.rows ?? []) {
        const row = await tx.supplierListValue.create({ data: { organisationId: org.id, list: l.list, code: l.code, nameEn: l.nameEn, nameMs: l.nameMs, provenance: l.provenance, sortOrder: ++order }, select: { id: true } });
        await writeAudit(tx, { actor: ACTOR, organisationId: org.id, entity: "SupplierListValue", entityId: row.id, entityLabel: `${l.list === "BANK" ? "Bank" : "Account type"} · ${l.nameEn}`, reason: "Loaded from the customer's file" }, "CREATE", diffFields(null, { name: l.nameEn, nameInMalay: l.nameMs, whereItComesFrom: WORDS[l.provenance] }));
      }
    },
    { timeout: 300_000, maxWait: 10_000 },
  );
  console.log("Loaded.");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
