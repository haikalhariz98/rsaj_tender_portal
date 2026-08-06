import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import type { SeedPolicy, SeedRole, SeedRule } from "../src/lib/dal/matrix";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const dataDir = join(import.meta.dirname, "seed-data");
const read = <T>(file: string): T => JSON.parse(readFileSync(join(dataDir, file), "utf8")) as T;

const ORG_CODE = "RSAJ";

async function main() {
  const rules = read<SeedRule[]>("rsaj-dal-rules.json");
  const roles = read<SeedRole[]>("rsaj-dal-roles.json");
  const policy = read<SeedPolicy>("rsaj-dal-policy.json");

  // Fail before writing anything rather than seeding a matrix that routes to a role
  // with no name. A dangling code is a governance failure, not a display bug.
  const known = new Set(roles.map((r) => r.code));
  const referenced = new Set<string>();
  for (const r of rules) {
    for (const c of [r.proposer, r.approver, r.committee]) if (c) referenced.add(c);
    for (const rec of r.recommenders ?? []) referenced.add(rec.role);
  }
  // SO_PD is resolved from contract value at routing time, not a standing office.
  referenced.delete("SO_PD");
  const dangling = [...referenced].filter((c) => !known.has(c));
  if (dangling.length > 0) {
    throw new Error(`DAL rules reference unknown role codes: ${dangling.join(", ")}`);
  }

  const organisation = await db.organisation.upsert({
    where: { code: ORG_CODE },
    update: { name: "Ranhill SAJ Sdn Bhd", nameMs: "Ranhill SAJ Sdn Bhd" },
    create: { code: ORG_CODE, name: "Ranhill SAJ Sdn Bhd", nameMs: "Ranhill SAJ Sdn Bhd" },
  });

  for (const role of roles) {
    await db.authorityRole.upsert({
      where: { organisationId_code: { organisationId: organisation.id, code: role.code } },
      update: { ...role, organisationId: organisation.id },
      create: { ...role, organisationId: organisation.id },
    });
  }

  const label = policy.revision ?? "Unversioned";

  // Rules are replaced wholesale rather than merged: a DAL issue is a single
  // controlled document, and a half-applied revision would route by a matrix that
  // never existed on paper.
  const existing = await db.dalVersion.findUnique({
    where: { organisationId_label: { organisationId: organisation.id, label } },
  });
  if (existing) {
    await db.dalRule.deleteMany({ where: { dalVersionId: existing.id } });
  }

  const version = await db.dalVersion.upsert({
    where: { organisationId_label: { organisationId: organisation.id, label } },
    update: {
      boundaryValue: policy.boundaryValue,
      boundaryInclusive: policy.boundaryInclusive,
      quotationFloor: policy.quotationFloor,
      tenderFloor: policy.tenderFloor,
      requisitionBoundary: policy.requisitionBoundary,
      splittingWindowDays: policy.splittingWindowDays,
      currency: policy.currency,
    },
    create: {
      organisationId: organisation.id,
      label,
      // The RSAJ DAL is "Issue A Rev 00 · 11 June 2021 · Fifth Revision".
      effectiveFrom: new Date("2021-06-11T00:00:00Z"),
      boundaryValue: policy.boundaryValue,
      boundaryInclusive: policy.boundaryInclusive,
      quotationFloor: policy.quotationFloor,
      tenderFloor: policy.tenderFloor,
      requisitionBoundary: policy.requisitionBoundary,
      splittingWindowDays: policy.splittingWindowDays,
      currency: policy.currency,
    },
  });

  for (const rule of rules) {
    await db.dalRule.create({
      data: {
        dalVersionId: version.id,
        ruleKey: rule.id,
        domain: rule.domain,
        method: rule.method ?? null,
        cond: rule.cond ?? null,
        minValue: rule.min ?? null,
        maxValue: rule.max ?? null,
        pctMin: rule.pctMin ?? null,
        pctMax: rule.pctMax ?? null,
        contractValueMin: rule.cvMin ?? null,
        contractValueMax: rule.cvMax ?? null,
        labelEn: rule.label,
        proposerCode: rule.proposer ?? null,
        approverCode: rule.approver ?? null,
        committeeCode: rule.committee ?? null,
        committeeAct: (rule.committeeAct as never) ?? null,
        nonDelegable: Boolean(rule.nonDelegable),
        approverMandatory: Boolean(rule.approverMandatory),
        isGap: Boolean(rule.gap),
        gapNote: rule.gapNote ?? null,
        note: rule.note ?? "",
        clause: rule.clause,
        sortOrder: rule.order ?? 0,
        recommenders: {
          create: (rule.recommenders ?? []).map((rec, i) => ({
            roleCode: rec.role,
            act: rec.act as never,
            sequence: i,
          })),
        },
      },
    });
  }

  const gaps = rules.filter((r) => r.gap).length;
  console.log(
    `Seeded ${organisation.code}: ${roles.length} roles, ${rules.length} DAL rules ` +
      `(${gaps} flagged as gaps in the manual) under "${label}".`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
