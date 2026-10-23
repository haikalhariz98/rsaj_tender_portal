import { beforeAll, describe, expect, it } from "vitest";

import type { Tx } from "@/lib/audit/record";
import { db } from "@/lib/db";
import { makePerson, makeSupplierAccount, randomId } from "@/lib/test-db/auth-fixtures";

import { loadDocumentFactsMany } from "./facts";
import { walkMerged } from "./merge";
import { REGISTER_BATCH } from "./register";
import { documentState } from "./state";
import { documentsWaitingCount, loadDocumentsWaiting, waitingCandidates } from "./waiting-read";

/**
 * Ruling PW-47 (code review SHOULD-4), against a real database: "Documents waiting" and its count read only a provable safe superset of the documents that wait on the
 * organisation, so an organisation with a long history of final documents (about 200 here: approved by all their approvers, and kinds taken up) costs one bounded read,
 * not a walk of everything it ever filed. `documentState` is still the judge: the narrowed read keeps every state that waits on the organisation (a kind received, a
 * version waiting for an approver, an open request to the organisation, a rejected organisation document, a contractor's document waiting for approval), and judging
 * the narrowed set gives exactly what judging every document gives.
 *
 * The rows are written directly, as the acts leave them; the triggers judge every one.
 */

const run = randomId();
const DAY = 24 * 60 * 60 * 1000;
const at = (days: number) => new Date(Date.now() + days * DAY);
const D = (d: Date) => new Date(`${d.toISOString().slice(0, 10)}T00:00:00.000Z`);

let organisationId = "";
let contractId = "";
/// A closed contract (its workspace shut) with a kind received on it: never read.
let closedContractId = "";
/// `so` uploads and marks; `e` approves.
const p = { so: "", e: "" };
let account = "";
let tick = 0;
/// Each row a millisecond apart, so the newest-first order is the order written.
const next = () => new Date(Date.now() - 10 * DAY + ++tick);

async function doc(side: "CONTRACTOR" | "ORGANISATION", title: string, kind: "WORK_PROGRAMME" | "DELAY_NOTICE" | null = null) {
  return (await db.projectDocument.create({ data: { organisationId, contractId, title, note: "", side, kind, createdByPersonId: side === "ORGANISATION" ? p.so : null, createdBySupplierAccountId: side === "CONTRACTOR" ? account : null, createdAt: next() } })).id;
}
async function version(documentId: string, number: number, side: "CONTRACTOR" | "ORGANISATION", o: { noApprovers: boolean; requestId?: string }) {
  const when = next();
  return (await db.projectDocumentVersion.create({ data: { organisationId, documentId, number, note: "", uploadedByPersonId: side === "ORGANISATION" ? p.so : null, uploadedBySupplierAccountId: side === "CONTRACTOR" ? account : null, uploadedAt: when, uploadedOn: D(when), noApproversAtUpload: o.noApprovers, requestId: o.requestId ?? null } })).id;
}
const approver = async (documentId: string) => (await db.projectDocumentApprover.create({ data: { organisationId, documentId, personId: p.e, addedByPersonId: p.so, addedAt: next() } })).id;
const decide = (versionId: string, approverId: string, outcome: "APPROVED" | "REJECTED") => db.projectDocumentDecision.create({ data: { organisationId, versionId, approverId, outcome, remarks: outcome === "REJECTED" ? "No." : "", decidedByPersonId: p.e, decidedAt: next(), decidedOn: D(new Date()) } });
const mark = (versionId: string, outcome: "TAKEN_UP" | "RETURNED") => db.projectDocumentDecision.create({ data: { organisationId, versionId, approverId: null, outcome, remarks: outcome === "RETURNED" ? "Add the back-up." : "", decidedByPersonId: p.so, decidedAt: next(), decidedOn: D(new Date()) } });
const request = async (documentId: string, toSide: "CONTRACTOR" | "ORGANISATION") => (await db.projectDocumentRequest.create({ data: { organisationId, documentId, toSide, note: "", requestedByPersonId: toSide === "CONTRACTOR" ? p.so : null, requestedBySupplierAccountId: toSide === "ORGANISATION" ? account : null, requestedAt: next() } })).id;

/// The documents that wait on the organisation, by title, each a state the narrowed read must keep.
const WAITING: string[] = [];

beforeAll(async () => {
  organisationId = (await db.organisation.create({ data: { code: `PWN_${run}`, name: `Jabatan Senarai ${run}`, timeZone: "Asia/Kuala_Lumpur" } })).id;
  for (const k of Object.keys(p) as (keyof typeof p)[]) p[k] = (await makePerson(organisationId, `Waiting ${k} ${run}`)).id;
  const s = await makeSupplierAccount(organisationId);
  account = s.account!.id;
  const newContract = async (status: "ACTIVE" | "CLOSED") => {
    const r = randomId();
    const requisition = await db.requisition.create({
      data: { organisationId, reference: `PWN/RQ/${r}`, requestingUnitCode: "PWN_DEPT", requestingPersonId: p.so, title: "Waiting requisition", justification: "Tests.", needStatement: "None.", costCentreCode: "PWN_CC", accountCode: "PWN_AC", placeOfDelivery: "Nowhere", dateRequired: D(at(100)), estimatedValue: "100000.00", raisedOn: D(at(-30)) },
    });
    const exercise = await db.sourcingExercise.create({ data: { organisationId, reference: `PWN/EX/${r}`, requisitionId: requisition.id, title: `Road ${r}`, estimatedValue: "100000.00", sourcingMethodCode: "PWN_METHOD", status: "EVALUATED" } });
    const award = await db.award.create({ data: { organisationId, reference: `PWN/AW/${r}`, exerciseId: exercise.id, instrumentKind: "WORK_INDENT", awardeeName: "A Contractor", awardedValue: "100000.00", completionPeriod: 90, completionUnit: "DAYS", status: "ISSUED", vendorId: s.supplier.id } });
    return (await db.contract.create({ data: { organisationId, number: `PWN/CON/${r}`, numberSource: "SERIES", numberedOn: D(at(-20)), awardId: award.id, contractSum: "100000.00", status } })).id;
  };
  contractId = await newContract("ACTIVE");
  closedContractId = await newContract("CLOSED");
  const onClosed = (await db.projectDocument.create({ data: { organisationId, contractId: closedContractId, title: "Received on a closed contract", note: "", side: "CONTRACTOR", kind: "DELAY_NOTICE", createdBySupplierAccountId: account, createdAt: next() } })).id;
  await version(onClosed, 1, "CONTRACTOR", { noApprovers: true });

  // About 200 final documents: 100 approved by every approver, a third of them after a rejected first version; 100 kinds taken up.
  for (let i = 0; i < 100; i++) {
    const d = await doc("ORGANISATION", `Approved ${i}`);
    const a = await approver(d);
    if (i % 3 === 0) {
      await decide(await version(d, 1, "ORGANISATION", { noApprovers: false }), a, "REJECTED");
      await decide(await version(d, 2, "ORGANISATION", { noApprovers: false }), a, "APPROVED");
    } else await decide(await version(d, 1, "ORGANISATION", { noApprovers: false }), a, "APPROVED");
  }
  for (let i = 0; i < 100; i++) await mark(await version(await doc("CONTRACTOR", `Taken up ${i}`, "WORK_PROGRAMME"), 1, "CONTRACTOR", { noApprovers: true }), "TAKEN_UP");

  // Every state that waits on the organisation.
  const received = await doc("CONTRACTOR", "Kind received", "DELAY_NOTICE");
  await version(received, 1, "CONTRACTOR", { noApprovers: true });
  const resent = await doc("CONTRACTOR", "Kind returned, then sent again", "WORK_PROGRAMME");
  await mark(await version(resent, 1, "CONTRACTOR", { noApprovers: true }), "RETURNED");
  await version(resent, 2, "CONTRACTOR", { noApprovers: true });
  const pending = await doc("ORGANISATION", "Waiting for its approver");
  await approver(pending);
  await version(pending, 1, "ORGANISATION", { noApprovers: false });
  const again = await doc("ORGANISATION", "Approved, then a new version waits");
  const a2 = await approver(again);
  await decide(await version(again, 1, "ORGANISATION", { noApprovers: false }), a2, "APPROVED");
  // (An approved document is final; a new version cannot follow it. Instead: a rejected organisation document waits on the organisation's side for its new version.)
  const rejected = await doc("ORGANISATION", "Rejected, waiting on its side");
  await decide(await version(rejected, 1, "ORGANISATION", { noApprovers: false }), await approver(rejected), "REJECTED");
  const askedOf = await doc("ORGANISATION", "Asked of the organisation");
  await request(askedOf, "ORGANISATION");
  const contractorsOwn = await doc("CONTRACTOR", "Contractor's, waiting for approval");
  await approver(contractorsOwn);
  await version(contractorsOwn, 1, "CONTRACTOR", { noApprovers: false });
  WAITING.push("Kind received", "Kind returned, then sent again", "Waiting for its approver", "Rejected, waiting on its side", "Asked of the organisation", "Contractor's, waiting for approval");

  // Not waiting on the organisation, and not final: a kind returned (on the contractor), a request to the contractor, a Shared document.
  await mark(await version(await doc("CONTRACTOR", "Kind returned", "WORK_PROGRAMME"), 1, "CONTRACTOR", { noApprovers: true }), "RETURNED");
  await request(await doc("CONTRACTOR", "Asked of the contractor"), "CONTRACTOR");
  await version(await doc("ORGANISATION", "Shared"), 1, "ORGANISATION", { noApprovers: true });
  // `again` is final (approved): it was written above only to show that an approved document is dropped by the narrowed read.
}, 300_000);

/// A client that counts what it is asked: raw reads, and how many documents' facts are loaded.
function counting(client: typeof db) {
  const n = { raw: 0, facts: 0 };
  const proxy = new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === "$queryRaw") {
        return (...args: unknown[]) => {
          n.raw++;
          return Reflect.apply(target.$queryRaw as (...a: unknown[]) => unknown, target, args);
        };
      }
      if (prop === "projectDocument") {
        const model = target.projectDocument;
        return new Proxy(model, {
          get(m, k) {
            if (k === "findMany") {
              return (args: { where?: { id?: { in?: unknown[] } } }) => {
                n.facts += args.where?.id?.in?.length ?? 0;
                return m.findMany(args as never);
              };
            }
            return Reflect.get(m, k);
          },
        });
      }
      return Reflect.get(target, prop, receiver);
    },
  });
  return { client: proxy as unknown as Tx, n };
}

/// What the judge reads as waiting on the organisation, over EVERY document on the contract whose workspace is open: the unnarrowed answer.
async function judgedOverAll(): Promise<Set<string>> {
  const all = await db.projectDocument.findMany({ where: { organisationId, contractId }, select: { id: true } });
  const facts = await loadDocumentFactsMany(db, all.map((d) => d.id));
  return new Set([...facts].filter(([, f]) => documentState(f).waitsOn === "ORGANISATION").map(([id]) => id));
}

describe("PW-47: Documents waiting reads a narrowed, safe superset", () => {
  it("about 200 final documents are never read: the count costs one bounded read, and the facts of only the few that may wait", async () => {
    expect(await db.projectDocument.count({ where: { organisationId } })).toBeGreaterThan(200);
    const { client, n } = counting(db);
    const count = await documentsWaitingCount(client, organisationId);
    expect(count).toBe(WAITING.length);
    expect(n.raw).toBe(1);
    expect(n.facts).toBeLessThanOrEqual(WAITING.length + 2);
    expect(n.facts).toBeLessThan(REGISTER_BATCH);
  });

  it("every state that waits on the organisation survives the narrowing, and the narrowed set judged equals every document judged", async () => {
    const unnarrowed = await judgedOverAll();
    const titles = await db.projectDocument.findMany({ where: { id: { in: [...unnarrowed] } }, select: { title: true } });
    expect(titles.map((t) => t.title).sort()).toEqual([...WAITING].sort());
    const page = await walkMerged(waitingCandidates(db, organisationId), { source: "EARLIER", load: async () => [] }, {
      cursor: null,
      take: 500,
      batch: REGISTER_BATCH,
      keep: (m) => (m.source === "DOCUMENT" && m.row.facts && documentState(m.row.facts).waitsOn === "ORGANISATION" ? m.row.id : null),
    });
    expect(new Set(page.rows)).toEqual(unnarrowed);
    // The list itself shows them, newest first, and pages by its cursor over the narrowed read: two at a time, the same set.
    const list = await loadDocumentsWaiting(db, { org: { id: organisationId, code: `PWN_${run}`, name: "Org" }, viewerPersonId: p.so, today: null });
    expect(list.rows.map((r) => r.title)).toEqual([...WAITING].reverse());
    const seen: string[] = [];
    let after: string | null = null;
    for (let i = 0; i < 10; i++) {
      const pageOf: { rows: { title: string }[]; next: string | null } = await loadDocumentsWaiting(db, { org: { id: organisationId, code: `PWN_${run}`, name: "Org" }, viewerPersonId: p.so, today: null, take: 2, after });
      seen.push(...pageOf.rows.map((r) => r.title));
      after = pageOf.next;
      if (!after) break;
    }
    expect(seen).toEqual([...WAITING].reverse());
  });

  it("one contract only, where scoped; a contract whose workspace is shut is not read", async () => {
    expect(await documentsWaitingCount(db, organisationId, contractId)).toBe(WAITING.length);
    expect(await documentsWaitingCount(db, organisationId, closedContractId)).toBe(0);
    expect(await documentsWaitingCount(db, organisationId, "no-such-contract")).toBe(0);
  });
});
