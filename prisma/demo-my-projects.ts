/**
 * Demo data for Phase 4e: the contractor's My Projects workspace and the announcements board. Invented throughout; nothing here is a customer's figure, list, wording or source. It sets no policy:
 * the service levels for contractors' submissions stay unset (the queue says so) and nobody is granted `announcements.publish` here (`npm run demo:accounts` grants it, as an assumed grant, to the
 * same demonstration office that manages supplier accounts).
 *
 *   demo_con13  DEMO/KP/T/005/2026, the works contract of prisma/demo-lifecycle.ts, held by Syarikat Contoh Pembinaan Sdn Bhd (demo_ctr13, portal account `demo.ctr13`). Where the award does not
 *               yet name the contractor on the register (a database loaded before Phase 4b), the contractor is put on the register and the award linked, as the lifecycle demo does.
 *               Two site diary entries: yesterday's, attested by both (the agent's recorded by the officer from paper), and today's, waiting for the agent to sign from the portal.
 *               Two submissions from the contractor's account: an interim claim two days ago, with the Finance Director's office told and waiting for an answer, and a notice of a cause
 *               of delay a week ago, returned by the S.O. with a note.
 *   Announcements: one pinned Important announcement and one Notice, published by Chen Wei Ling.
 *
 * Applied alone to a database the demonstration is already loaded in by `npm run demo:my-projects`, and at the end of a full load. Nothing is deleted or replaced: a second run adds nothing.
 */

import type { PrismaClient } from "../src/generated/prisma/client";
import { diffFields } from "../src/lib/audit/diff";
import { dayToDate, instantAt, todayIn } from "../src/lib/dates";
import { contractorSubmissionNotices } from "../src/lib/inbox/notices";
import { officeHolders } from "../src/lib/certificate/repo";
import { loadContract } from "../src/lib/contract/repo";
import { DEMO_ACTOR } from "./demo-actor";
import { createRegisteredContractor } from "./demo-contractor";

type Db = PrismaClient;
const P = "demo_";
const CON = `${P}con13`;

type Entry = { id: string; organisationId: string; entity: string; entityId: string; entityLabel: string; action: "CREATE" | "UPDATE"; at: Date; changes: object[]; reason: string; unattributed: boolean };

export async function loadMyProjectsDemo(db: Db, organisationId: string): Promise<{ loaded: boolean; notes: string[] }> {
  const notes: string[] = [];
  const org = await db.organisation.findUniqueOrThrow({ where: { id: organisationId }, select: { timeZone: true } });
  const tz = org.timeZone;
  if (!tz) throw new Error("Demo 4e: the organisation's time zone is not set.");
  const L = todayIn(new Date(), tz)!;
  const D = (days: number) => {
    const t = dayToDate(L);
    t.setUTCDate(t.getUTCDate() + days);
    return t.toISOString().slice(0, 10);
  };
  const T = (day: string, time: string) => instantAt(day, time, tz)!;
  const trail: Entry[] = [];
  let n = 0;
  const entry = (entity: string, entityId: string, entityLabel: string, action: Entry["action"], when: Date, changes: object[], reason = "") => trail.push({ id: `${P}mpau${++n}`, organisationId, entity, entityId, entityLabel, action, at: when, changes, reason, ...DEMO_ACTOR });
  const flush = async () => {
    if (trail.length) await db.auditEntry.createMany({ data: trail.splice(0) as never, skipDuplicates: true });
  };

  const contract = await db.contract.findUnique({ where: { id: CON }, select: { id: true, number: true, status: true, award: { select: { id: true, reference: true, awardeeName: true, awardeeRegistrationNo: true, awardeeAddress: true, vendorId: true } } } });
  if (!contract || contract.status !== "ACTIVE") {
    notes.push("DEMO/KP/T/005/2026 is not an active contract in this database, so the My Projects demonstration was not added");
    return { loaded: false, notes };
  }
  const label = `Contract ${contract.number} · ${contract.award.awardeeName}`;

  // ---- the contractor on the register, and the award linked to it (as the lifecycle demo does since Phase 4b; added here for a database loaded before).
  let supplierId = contract.award.vendorId;
  if (!supplierId) {
    const existing = await db.supplier.findUnique({ where: { id: `${P}ctr13` }, select: { id: true } });
    supplierId = existing?.id ?? (await createRegisteredContractor(db, organisationId, { key: "ctr13", name: contract.award.awardeeName, registrationNo: contract.award.awardeeRegistrationNo || "DEMO-0013-X", address: contract.award.awardeeAddress || "13 Contoh Industrial Park, Demo North", registeredOn: "2026-04-15" }));
    await db.award.update({ where: { id: contract.award.id }, data: { vendorId: supplierId } });
    const supplier = await db.supplier.findUniqueOrThrow({ where: { id: supplierId }, select: { reference: true, registeredName: true } });
    entry("Award", contract.award.id, `${contract.award.reference} · Awardee's supplier`, "UPDATE", T(D(-10), "10:00"), diffFields(null, { supplier: `${supplier.reference} · ${supplier.registeredName}`, linkedBy: "the demo loader, as an officer links an award with no party" }));
    notes.push(`the contractor ${supplier.registeredName} on the register, linked to ${contract.award.reference} (its portal account demo.ctr13 waits for activation: npm run demo:accounts)`);
  }
  const account = await db.supplierAccount.findFirst({ where: { supplierId, organisationId }, select: { id: true, contact: { select: { name: true } } } });
  if (!account) {
    notes.push("the contractor has no portal account, so no submission was added");
    await flush();
    return { loaded: notes.length > 0, notes };
  }

  // ---- the site diary: yesterday's entry attested by both (the agent's recorded from paper), today's waiting for the agent.
  const officer = await db.person.findFirst({ where: { id: `${P}p3`, organisationId }, select: { id: true, name: true } });
  if (officer) {
    const days: [string, string, boolean][] = [[`${P}mpsd1`, D(-1), true], [`${P}mpsd2`, L, false]];
    for (const [id, day, agentDone] of days) {
      if (await db.siteDiaryEntry.findUnique({ where: { id }, select: { id: true } })) continue;
      if (await db.siteDiaryEntry.findUnique({ where: { contractId_day: { contractId: CON, day: dayToDate(day) } }, select: { id: true } })) continue;
      const text = agentDone ? "Reinstatement of the district road crossing at chainage 0+350: base course laid and compacted. Two gangs on site. Washout valve chamber at 1+400 excavated." : "Road crossing at 0+350: binder course laid in the morning. Washout valve at 1+400 set and the chamber built to cover level. Afternoon showers from 3 p.m., work on the chamber stopped.";
      await db.siteDiaryEntry.create({ data: { id, organisationId, contractId: CON, day: dayToDate(day), weather: agentDone ? "Fine" : "Fine, afternoon showers", entry: text, officerPersonId: officer.id, officerAttestedOn: dayToDate(day), agentName: agentDone ? "Tan Mei Hua" : "", agentAttestedOn: agentDone ? dayToDate(day) : null, backdatedReason: "", recordedAt: T(day, "17:00"), recordedOn: dayToDate(day) } });
      entry("SiteDiaryEntry", id, `${label} · site diary ${day}`, "CREATE", T(day, "17:00"), diffFields(null, { day, responsibleOfficer: officer.name, attestedByOfficer: day, attestedByAgent: agentDone ? `Tan Mei Hua (recorded from paper, not signed) on ${day}` : "Waiting for the contractor's agent to sign from the portal" }));
      notes.push(agentDone ? `the diary for ${day}, attested by both` : `the diary for ${day}, waiting for the contractor's agent to sign from the portal`);
    }
  }

  // ---- two submissions from the contractor's account: a claim waiting, and a delay notice returned.
  const l = await loadContract(organisationId, CON);
  const assignment = await db.contractSoAssignment.findFirst({ where: { contractId: CON, organisationId }, orderBy: [{ effectiveOn: "desc" }, { recordedAt: "desc" }], select: { roleCode: true, roleLabel: true } });
  const routed = assignment ? { routedToRoleCode: assignment.roleCode, routedToRoleLabel: assignment.roleLabel } : { routedToRoleCode: null, routedToRoleLabel: null };
  const holders = l && assignment ? await officeHolders(l, assignment.roleCode, L) : null;
  const recipients = holders ? [...holders.holderIds, ...holders.delegates.map((d) => d.personId)] : [];
  const supplier = await db.supplier.findUniqueOrThrow({ where: { id: supplierId }, select: { registeredName: true } });

  if (!(await db.contractorSubmission.findUnique({ where: { id: `${P}mps1` }, select: { id: true } }))) {
    const day = D(-2);
    await db.contractorSubmission.create({
      data: {
        id: `${P}mps1`, organisationId, contractId: CON, supplierId, kind: "INTERIM_CLAIM", title: "Interim claim 4, to the end of last month", body: "Work executed to the end of last month, the road crossing reinstatement and the washout valve at chainage 1+400 included. Materials on site listed separately.",
        amount: "61500.00", aboutDay: dayToDate(D(-9)), submittedBySupplierAccountId: account.id, submittedAt: T(day, "11:20"), submittedOn: dayToDate(day), signedAt: null, ...routed, serviceLevelDays: null, dueOn: null,
      },
    });
    entry("ContractorSubmission", `${P}mps1`, `${label} · Interim claim: Interim claim 4, to the end of last month`, "CREATE", T(day, "11:20"), diffFields(null, { kind: "Interim claim", amountClaimed: "RM 61,500.00", sentOn: day, routedTo: routed.routedToRoleLabel ?? "Nobody: no Superintending Officer is assigned to the contract", dueOn: "No due day: the service level is not set", madeBy: "the supplier's own portal account" }));
    if (recipients.length) {
      await db.staffNotice.createMany({ data: contractorSubmissionNotices({ submissionId: `${P}mps1`, contractLabel: label, kindLabel: "Interim claim", contractorName: supplier.registeredName, dueLabel: "No service level is set for this kind, so it has no due day.", recipients }).map((d) => ({ organisationId, raisedByPersonId: null, raisedAt: T(day, "11:20"), ...d })), skipDuplicates: true });
    }
    notes.push("an interim claim from the contractor's portal account, two days ago, waiting on the review queue");
  }
  if (!(await db.contractorSubmission.findUnique({ where: { id: `${P}mps2` }, select: { id: true } }))) {
    const day = D(-7);
    const decider = recipients[0] ?? null;
    await db.contractorSubmission.create({
      data: {
        id: `${P}mps2`, organisationId, contractId: CON, supplierId, kind: "DELAY_NOTICE", title: "Notice of delay: late approval of the road crossing permit", body: "The district road authority issued the road crossing permit nine days after the date applied for, and no work on the crossing could start until it did.",
        amount: null, aboutDay: dayToDate(D(-12)), submittedBySupplierAccountId: account.id, submittedAt: T(day, "16:05"), submittedOn: dayToDate(day), signedAt: null, ...routed, serviceLevelDays: null, dueOn: null,
        ...(decider ? { outcome: "RETURNED", outcomeNote: "The permit's date of application and the date of issue are not stated. Send the notice again with both, and the permit as issued, so the cause can be recorded against the extension of time it supports.", decidedByPersonId: decider, decidedOn: dayToDate(D(-5)), decidedAt: T(D(-5), "09:40") } : {}),
      },
    });
    entry("ContractorSubmission", `${P}mps2`, `${label} · Notice of a cause of delay: Notice of delay: late approval of the road crossing permit`, "CREATE", T(day, "16:05"), diffFields(null, { kind: "Notice of a cause of delay", day: D(-12), sentOn: day, routedTo: routed.routedToRoleLabel ?? "Nobody", dueOn: "No due day: the service level is not set", madeBy: "the supplier's own portal account" }));
    if (decider) entry("ContractorSubmission", `${P}mps2`, `${label} · Notice of a cause of delay: Notice of delay: late approval of the road crossing permit`, "UPDATE", T(D(-5), "09:40"), diffFields({ answer: null }, { answer: "Returned", note: "The permit's dates are not stated.", answeredOn: D(-5) }));
    notes.push(decider ? "a notice of delay from the contractor, returned by the S.O. with a note" : "a notice of delay from the contractor, waiting (no S.O. holder to answer it)");
  }

  // ---- the announcements board.
  const publisher = await db.person.findFirst({ where: { id: `${P}p3`, organisationId }, select: { id: true } });
  if (publisher) {
    const items = [
      { id: `${P}ann1`, category: "IMPORTANT" as const, pinned: true, days: -3, title: "Tender counter closed on the public holiday", body: "The tender counter is closed on the coming public holiday. A closing that falls on it moves to the next working day at the same time, as each notice states. Bids are not accepted by post on that day." },
      { id: `${P}ann2`, category: "NOTICE" as const, pinned: false, days: -14, title: "Registered suppliers: check your document expiry dates", body: "Several registered suppliers hold a business registration that expires this quarter. Lodge the renewal under Company, Documents before it lapses, so your registration stays in force." },
    ];
    for (const a of items) {
      if (await db.announcement.findUnique({ where: { id: a.id }, select: { id: true } })) continue;
      const day = D(a.days);
      await db.announcement.create({ data: { id: a.id, organisationId, category: a.category, title: a.title, body: a.body, pinned: a.pinned, publishedOn: dayToDate(day), publishedAt: T(day, "09:00"), publishedByPersonId: publisher.id } });
      entry("Announcement", a.id, `Announcement · ${a.title}`, "CREATE", T(day, "09:00"), diffFields(null, { category: a.category === "IMPORTANT" ? "Important" : "Notice", title: a.title, pinned: a.pinned ? "Yes" : "No", shownTo: "every signed-in supplier, in the portal; not sent" }));
      notes.push(`the announcement "${a.title}"${a.pinned ? ", pinned" : ""}`);
    }
  }
  await flush();
  return { loaded: notes.length > 0, notes };
}
