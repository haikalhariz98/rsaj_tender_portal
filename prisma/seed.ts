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

  await seedCommittees(organisation.id);
  await seedDemoSitting(organisation.id);
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
    const committee = await db.committee.upsert({
      where: { organisationId_code: { organisationId, code: c.code } },
      update: {
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
      },
      create: {
        organisationId,
        code: c.code,
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
      },
    });

    // Seats are replaced wholesale, but only those not yet filled by a named person
    // — re-seeding must not evict an appointment somebody made in the application.
    await db.committeeMember.deleteMany({
      where: { committeeId: committee.id, personId: null },
    });
    const named = await db.committeeMember.count({ where: { committeeId: committee.id } });
    if (named === 0) {
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

  const stated = committees.filter((c) => c.quorum != null).length;
  console.log(
    `Seeded ${committees.length} committees — ${stated} with a quorum stated in the corpus, ` +
      `${committees.length - stated} where RSAJ must still supply one.`,
  );
}

interface DemoData {
  people: { staffNo: string; name: string; jobTitle: string; seat: string }[];
  meeting: {
    committeeCode: string;
    reference: string;
    agenda: string;
    decision: {
      domain: string;
      subject: string;
      matterRef: string;
      amount: number;
      act: string;
      dalRuleKey: string;
    };
    votes: { staffNo: string; choice: string; comment: string }[];
  };
}

/**
 * Fictitious people and one worked sitting, so the committee screens have something
 * to show in development. The sitting is deliberately incomplete: three of four
 * members have voted on a mandatory recommendation, which is the state that
 * demonstrates the "all members must vote" rule.
 *
 * Not production data. Remove this and `demo-people.json` before any real deployment.
 */
async function seedDemoSitting(organisationId: string) {
  const demo = read<DemoData>("demo-people.json");

  const committee = await db.committee.findUnique({
    where: { organisationId_code: { organisationId, code: demo.meeting.committeeCode } },
    include: { members: { orderBy: { position: "asc" } } },
  });
  if (!committee) return;

  const people = [];
  for (const p of demo.people) {
    people.push(
      await db.person.upsert({
        where: { organisationId_staffNo: { organisationId, staffNo: p.staffNo } },
        update: { name: p.name, jobTitle: p.jobTitle },
        create: { organisationId, staffNo: p.staffNo, name: p.name, jobTitle: p.jobTitle },
      }),
    );
  }

  // Fill the committee's seats in declared order with the demo people.
  const seats = await db.committeeMember.findMany({
    where: { committeeId: committee.id },
    orderBy: { id: "asc" },
  });
  for (const [i, seat] of seats.entries()) {
    if (i < people.length && seat.personId == null) {
      await db.committeeMember.update({
        where: { id: seat.id },
        data: { personId: people[i].id },
      });
    }
  }

  const existing = await db.meeting.findUnique({
    where: { committeeId_reference: { committeeId: committee.id, reference: demo.meeting.reference } },
  });
  if (existing) {
    console.log(`Demo sitting ${demo.meeting.reference} already present — left as is.`);
    return;
  }

  const meeting = await db.meeting.create({
    data: {
      committeeId: committee.id,
      reference: demo.meeting.reference,
      meetingDate: new Date("2026-08-05T02:30:00Z"),
      agenda: demo.meeting.agenda,
      status: "IN_PROGRESS",
      attendance: { create: people.map((p) => ({ personId: p.id, attended: true })) },
      decisions: {
        create: {
          domain: demo.meeting.decision.domain,
          subject: demo.meeting.decision.subject,
          matterRef: demo.meeting.decision.matterRef,
          amount: demo.meeting.decision.amount,
          act: demo.meeting.decision.act as never,
          dalRuleKey: demo.meeting.decision.dalRuleKey,
        },
      },
    },
    include: { decisions: true },
  });

  const decision = meeting.decisions[0];
  const byStaffNo = new Map(people.map((p) => [p.staffNo, p]));
  for (const v of demo.meeting.votes) {
    const person = byStaffNo.get(v.staffNo);
    if (!person) continue;
    await db.vote.create({
      data: {
        decisionId: decision.id,
        personId: person.id,
        choice: v.choice as never,
        comment: v.comment,
      },
    });
  }

  console.log(
    `Seeded ${people.length} FICTITIOUS demo people and one ${committee.code} sitting ` +
      `(${demo.meeting.votes.length} of ${people.length} votes cast — deliberately incomplete).`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
