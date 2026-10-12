/**
 * Demo data for Phase 4d: the supplier's My Bids workspace. Invented throughout; nothing here is a customer's figure, list, wording or source. It sets no policy: the organisation's decision on notices to
 * unsuccessful tenderers (D7) stays unset, so the screens show that state and the founder can decide it under Configuration. (Wave 3a, SR-10: on a fresh load the window policy's release of the
 * documents online, the payment simulator and its methods are set by `prisma/demo-switches.ts`, and DEMO/SX/0018/2026 is the demonstration's one exercise sold online.)
 *
 *   demo_vnd2  Demo Paip Services, which bought the documents of DEMO/SX/0018/2026 (an advertised exercise open for bids, with its addendum 1) and was a bidder in DEMO/SX/0016/2026.
 *              Its portal account `demo.supplier6` waits for activation; `npm run demo:accounts` gives it the demonstration password. It has an addendum to acknowledge, and it has opened the
 *              Tender Table Document once (an inspection-log row).
 *   demo_vnd1  Contoh Bina Sdn Bhd, which has bought nothing of DEMO/SX/0018/2026. DEMO/SX/0018/2026 is sold online in the demonstration, so its account `demo.supplier7` has Buy documents
 *              to press (an exercise sold at the counter would have a request waiting for an officer instead), and can sign up for the briefing added to that exercise, three days ahead.
 *
 * Applied alone to a database the demonstration is already loaded in by `npm run demo:my-bids`, and at the end of a full load. Nothing is deleted or replaced: a second run adds nothing.
 */

import { randomBytes } from "node:crypto";

import type { PrismaClient } from "../src/generated/prisma/client";
import { diffFields } from "../src/lib/audit/diff";
import { loginKeyOf } from "../src/lib/auth/identity";
import { hashPassword } from "../src/lib/auth/password";
import { dayToDate, instantAt, todayIn } from "../src/lib/dates";
import { DEMO_ACTOR } from "./demo-actor";

type Db = PrismaClient;
const P = "demo_";

export const MY_BIDS_DEMO_ACCOUNTS = [
  { loginName: "demo.supplier6", supplierId: `${P}vnd2` },
  { loginName: "demo.supplier7", supplierId: `${P}vnd1` },
] as const;

type Entry = { id: string; organisationId: string; entity: string; entityId: string; entityLabel: string; action: "CREATE" | "UPDATE"; at: Date; changes: object[]; reason: string; unattributed: boolean };

export async function loadMyBidsDemo(db: Db, organisationId: string): Promise<{ loaded: boolean; notes: string[] }> {
  const notes: string[] = [];
  const org = await db.organisation.findUniqueOrThrow({ where: { id: organisationId }, select: { timeZone: true } });
  const tz = org.timeZone;
  if (!tz) throw new Error("Demo 4d: the organisation's time zone is not set.");
  const L = todayIn(new Date(), tz)!;
  const D = (days: number) => {
    const t = dayToDate(L);
    t.setUTCDate(t.getUTCDate() + days);
    return t.toISOString().slice(0, 10);
  };
  const T = (day: string, time: string) => instantAt(day, time, tz)!;
  const trail: Entry[] = [];
  let n = 0;
  const entry = (entity: string, entityId: string, entityLabel: string, action: Entry["action"], when: Date, changes: object[], reason = "") => trail.push({ id: `${P}mbau${++n}`, organisationId, entity, entityId, entityLabel, action, at: when, changes, reason, ...DEMO_ACTOR });
  const flush = async () => {
    if (trail.length) await db.auditEntry.createMany({ data: trail.splice(0) as never });
  };

  const sx18 = await db.sourcingExercise.findUnique({ where: { id: `${P}sx18` }, select: { id: true, reference: true, status: true, saleMode: true, window: { select: { id: true, publishedAt: true } } } });
  if (!sx18?.window?.publishedAt || sx18.status !== "ADVERTISED") {
    notes.push("DEMO/SX/0018/2026 is not an advertised exercise in this database, so the My Bids demonstration was not added");
    return { loaded: false, notes };
  }

  // ---- the two portal accounts, waiting for activation (given the demonstration password by npm run demo:accounts).
  for (const [i, a] of MY_BIDS_DEMO_ACCOUNTS.entries()) {
    const supplier = await db.supplier.findUnique({ where: { id: a.supplierId }, select: { id: true, reference: true, registeredName: true, contacts: { where: { isPrimary: true, retiredOn: null }, select: { id: true, account: { select: { id: true } } }, take: 1 } } });
    const contact = supplier?.contacts[0];
    if (!supplier || !contact || contact.account) continue;
    const when = T(D(-6), "10:00");
    await db.supplierAccount.create({
      data: { id: `${P}vacc${6 + i}`, organisationId, contactId: contact.id, supplierId: supplier.id, loginName: a.loginName, loginKey: loginKeyOf(a.loginName), passwordHash: await hashPassword(randomBytes(32).toString("base64url")), passwordChangedAt: when, status: "PENDING_ACTIVATION" },
    });
    entry("SupplierAccount", `${P}vacc${6 + i}`, `${supplier.reference} · Portal account`, "CREATE", when, diffFields(null, { status: "Waiting for activation", demonstration: "give it the demonstration password with npm run demo:accounts" }));
    notes.push(`the portal account ${a.loginName} for ${supplier.registeredName}`);
  }

  // ---- a briefing three days ahead on the open exercise: a supplier can sign up for it.
  if (!(await db.siteEvent.findUnique({ where: { id: `${P}brf2` }, select: { id: true } }))) {
    await db.siteEvent.create({ data: { id: `${P}brf2`, organisationId, windowId: sx18.window.id, kind: "BRIEFING", startsAt: T(D(3), "10:00"), place: "Demo meeting room 2", notes: "A demonstration briefing, so a supplier has one to sign up for." } });
    entry("SiteEvent", `${P}brf2`, `${sx18.reference} · Tender briefing`, "CREATE", T(D(-1), "09:00"), diffFields(null, { event: "Tender briefing", place: "Demo meeting room 2", mandatory: "Not answered" }));
    notes.push("a briefing three days ahead on DEMO/SX/0018/2026");
  }

  // ---- demo_vnd2 has opened the Tender Table Document once; demo_vnd1 has asked for the documents.
  const acc6 = await db.supplierAccount.findUnique({ where: { id: `${P}vacc6` }, select: { id: true } });
  const acc7 = await db.supplierAccount.findUnique({ where: { id: `${P}vacc7` }, select: { id: true } });
  if (acc6 && !(await db.tenderInspectionEvent.findFirst({ where: { windowId: sx18.window.id, supplierId: `${P}vnd2` }, select: { id: true } }))) {
    const pack = await db.tenderPack.findFirst({ where: { exerciseId: sx18.id, status: "APPROVED" }, select: { versionNo: true } });
    await db.tenderInspectionEvent.create({ data: { id: `${P}insp1`, organisationId, windowId: sx18.window.id, supplierId: `${P}vnd2`, kind: "TABLE_DOCUMENT", documentVersion: pack?.versionNo ?? 1, viewedBySupplierAccountId: acc6.id, viewedAt: T(D(-2), "15:20") } });
    notes.push("one opening of the Tender Table Document by demo_vnd2, in the inspection log");
  }
  // SR-10 review: a request for the documents is the counter's way of asking. On an exercise sold online (the demonstration's sx18 is, since `demo-switches.ts`) a buyer buys instead, so a
  // request made here would wait for an officer forever. The request is made only where the exercise is sold at the counter.
  if (acc7 && sx18.saleMode !== "ONLINE" && !(await db.documentRequest.findFirst({ where: { windowId: sx18.window.id, supplierId: `${P}vnd1` }, select: { id: true } }))) {
    const checks = [
      { key: "ON_SALE", state: "PASS", detail: "The documents are on sale now." },
      { key: "REGISTER", state: "PASS", detail: "Registered, not cancelled, not suspended and not blacklisted, on the supplier register." },
      { key: "AUTHORITY", state: "BRING", detail: "Bring proof that the person collecting the documents may receive them for your company, such as a letter naming them. The officer checks it at the counter." },
    ];
    await db.documentRequest.create({ data: { id: `${P}dreq1`, organisationId, windowId: sx18.window.id, supplierId: `${P}vnd1`, collectorName: "Azman Bin Hashim", requestedBySupplierAccountId: acc7.id, requestedAt: T(D(-1), "11:05"), checks } });
    entry("DocumentRequest", `${P}dreq1`, `${sx18.reference} · Request for the documents by Contoh Bina Sdn Bhd`, "CREATE", T(D(-1), "11:05"), diffFields(null, { request: "Asked for the documents", collector: "Azman Bin Hashim", madeBy: "the supplier's own portal account", payment: "Not taken online" }));
    notes.push("a request for the documents by demo_vnd1, waiting for an officer");
  }
  await flush();
  return { loaded: notes.length > 0, notes };
}
