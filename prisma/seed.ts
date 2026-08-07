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

  // Rules are replaced wholesale rather than merged: an issue of the authority limits
  // is a single controlled document, and a half-applied revision would route by a
  // matrix that never existed on paper.
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
    `Seeded ${organisation.code}: ${roles.length} roles, ${rules.length} authority rows ` +
      `(${gaps} matters with no governing clause) under "${label}".`,
  );

  await seedCommittees(organisation.id);
  await seedOperations(organisation.id);
}

interface SeedSeat {
  seatRoleCode: string | null;
  position: "CHAIRMAN" | "DEPUTY_CHAIRMAN" | "MEMBER" | "SECRETARY";
  provenance: "STATED" | "OBSERVED" | "ASSUMED";
  label: string;
}

interface SeedCommittee {
  code: string;
  nameEn: string;
  nameMs: string | null;
  mandate: string;
  governingSource: string;
  action: "APPROVES" | "RECOMMENDS" | "CONSENTS" | "DECIDES";
  isExternal?: boolean;
  quorum: number | null;
  quorumProvenance: "STATED" | "OBSERVED" | "ASSUMED" | null;
  compositionProvenance: "STATED" | "OBSERVED" | "ASSUMED" | null;
  valueScopeMin: number | null;
  valueScopeMax: number | null;
  notes: string;
  seats: SeedSeat[];
}

async function seedCommittees(organisationId: string) {
  const committees = read<SeedCommittee[]>("rsaj-committees.json");

  for (const c of committees) {
    const fields = {
      nameEn: c.nameEn,
      nameMs: c.nameMs,
      mandate: c.mandate,
      governingSource: c.governingSource,
      action: c.action as never,
      isExternal: Boolean(c.isExternal),
      quorum: c.quorum,
      quorumProvenance: (c.quorumProvenance as never) ?? null,
      compositionProvenance: (c.compositionProvenance as never) ?? null,
      valueScopeMin: c.valueScopeMin,
      valueScopeMax: c.valueScopeMax,
      notes: c.notes,
    };

    const committee = await db.committee.upsert({
      where: { organisationId_code: { organisationId, code: c.code } },
      update: fields,
      create: { organisationId, code: c.code, ...fields },
    });

    // Vacant seats are rebuilt from the configuration; a seat somebody has been
    // appointed to is left alone, so re-seeding never evicts a sitting member.
    await db.committeeMember.deleteMany({
      where: { committeeId: committee.id, personId: null },
    });
    const remaining = await db.committeeMember.count({ where: { committeeId: committee.id } });
    if (remaining === 0) {
      for (const seat of c.seats) {
        await db.committeeMember.create({
          data: {
            committeeId: committee.id,
            seatRoleCode: seat.seatRoleCode,
            seatLabel: seat.label,
            position: seat.position as never,
            provenance: seat.provenance as never,
            effectiveFrom: new Date("2021-06-11T00:00:00Z"),
          },
        });
      }
    }
  }

  const withQuorum = committees.filter((c) => c.quorum != null).length;
  console.log(
    `Seeded ${committees.length} committees — ${withQuorum} with a quorum set in policy, ` +
      `${committees.length - withQuorum} still to be set.`,
  );
}

interface Operations {
  people: { staffNo: string; name: string; jobTitle: string; roleCode?: string }[];
  seats: Record<string, string[]>;
  meetings: {
    committeeCode: string;
    reference: string;
    meetingDate: string;
    status: string;
    agenda: string;
    minutes?: string;
    attendance: string[];
    decisions: {
      domain: string;
      subject: string;
      matterRef?: string;
      amount?: number;
      act: string;
      dalRuleKey?: string;
      outcome: string;
      decisionDate?: string;
      votes: { staffNo: string; choice: string; comment: string }[];
    }[];
  }[];
}

/**
 * Officers, committee seats and sittings.
 *
 * Sample records shaped like real Johor water-utility procurement, so the screens
 * show a plausible working caseload rather than obvious filler. They are not real
 * transactions; a migration from live records replaces this before go-live.
 *
 * Two sittings are deliberately left mid-flight — one a vote short, one not yet
 * convened — because a system that only ever shows finished work hides exactly the
 * states an officer spends the day in.
 */
async function seedOperations(organisationId: string) {
  const ops = read<Operations>("rsaj-operations.json");

  const byStaffNo = new Map<string, string>();
  for (const p of ops.people) {
    const person = await db.person.upsert({
      where: { organisationId_staffNo: { organisationId, staffNo: p.staffNo } },
      update: { name: p.name, jobTitle: p.jobTitle },
      create: { organisationId, staffNo: p.staffNo, name: p.name, jobTitle: p.jobTitle },
    });
    byStaffNo.set(p.staffNo, person.id);

    // Where an officer holds an authority office, record it, so a resolved chain can
    // name a signatory rather than only an office.
    if (p.roleCode) {
      const held = await db.roleAssignment.findFirst({
        where: { personId: person.id, roleCode: p.roleCode, effectiveTo: null },
      });
      if (!held) {
        await db.roleAssignment.create({
          data: {
            personId: person.id,
            roleCode: p.roleCode,
            effectiveFrom: new Date("2024-01-01T00:00:00Z"),
          },
        });
      }
    }
  }

  for (const [code, staffNos] of Object.entries(ops.seats)) {
    const committee = await db.committee.findUnique({
      where: { organisationId_code: { organisationId, code } },
      select: { id: true },
    });
    if (!committee) continue;

    const seats = await db.committeeMember.findMany({
      where: { committeeId: committee.id },
      orderBy: { id: "asc" },
    });
    for (const [i, seat] of seats.entries()) {
      const personId = byStaffNo.get(staffNos[i] ?? "");
      if (personId) await db.committeeMember.update({ where: { id: seat.id }, data: { personId } });
    }
  }

  let sittings = 0;
  for (const m of ops.meetings) {
    const committee = await db.committee.findUnique({
      where: { organisationId_code: { organisationId, code: m.committeeCode } },
      select: { id: true },
    });
    if (!committee) continue;

    const already = await db.meeting.findUnique({
      where: { committeeId_reference: { committeeId: committee.id, reference: m.reference } },
    });
    if (already) continue;

    const meeting = await db.meeting.create({
      data: {
        committeeId: committee.id,
        reference: m.reference,
        meetingDate: new Date(m.meetingDate),
        status: m.status as never,
        agenda: m.agenda,
        minutes: m.minutes ?? "",
        attendance: {
          create: m.attendance
            .map((s) => byStaffNo.get(s))
            .filter((id): id is string => Boolean(id))
            .map((personId) => ({ personId, attended: true })),
        },
      },
    });

    for (const d of m.decisions) {
      const decision = await db.committeeDecision.create({
        data: {
          meetingId: meeting.id,
          domain: d.domain,
          subject: d.subject,
          matterRef: d.matterRef ?? null,
          amount: d.amount ?? null,
          act: d.act as never,
          dalRuleKey: d.dalRuleKey ?? null,
          outcome: d.outcome as never,
          decisionDate: d.decisionDate ? new Date(d.decisionDate) : null,
        },
      });

      for (const v of d.votes) {
        const personId = byStaffNo.get(v.staffNo);
        if (!personId) continue;
        await db.vote.create({
          data: {
            decisionId: decision.id,
            personId,
            choice: v.choice as never,
            comment: v.comment,
          },
        });
      }
    }
    sittings++;
  }

  console.log(
    `Seeded ${ops.people.length} officers and ${sittings} committee sittings ` +
      `across ${Object.keys(ops.seats).length} bodies.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
