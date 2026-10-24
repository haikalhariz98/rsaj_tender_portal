import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { LIST_EXPORT_MAX_ROWS, parseListQuery, sortKeys } from "@/lib/list-query";
import { makePerson, randomId } from "@/lib/test-db/auth-fixtures";

import { APPLICATION_VIEWS, documentsToSeeToIds, listSuppliers, SUPPLIER_VIEWS } from "./repo";

/**
 * 7.4, against the scratch database: the Suppliers register and its Applications tab are searched, viewed, sorted and paged by the server over the whole set,
 * and `total` is the count under the same where as the rows.
 */
const run = randomId();
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const register = (sp: Record<string, string> = {}) => parseListQuery(sp, SUPPLIER_VIEWS, sortKeys("supplier"));
const applications = (sp: Record<string, string> = {}) => parseListQuery(sp, APPLICATION_VIEWS, sortKeys("application"));
const TODAY = "2026-10-24";
const three = (n: number) => String(n).padStart(3, "0");
let organisationId = "";
let other = "";
const supplierIds: string[] = [];

const supplier = (orgId: string, n: number, over: Record<string, unknown> = {}) => ({
  organisationId: orgId, reference: `SUP/${run}/${three(n)}`, registeredName: `Lister ${three(n)} ${run} Sdn Bhd`, registrationNo: `${run}-${three(n)}`,
  registrationNoKey: `${run}${three(n)}${orgId.slice(-4)}`, entityTypeCode: "LST_TYPE", countryCode: "my", registeredAddress: "Nowhere", companyEmail: "s@example.invalid", ...over,
});

beforeAll(async () => {
  organisationId = (await db.organisation.create({ data: { code: `SLST_${run}`, name: "Supplier list organisation", timeZone: "Asia/Kuala_Lumpur" } })).id;
  other = (await db.organisation.create({ data: { code: `SLST_O_${run}`, name: "Other", timeZone: "Asia/Kuala_Lumpur" } })).id;
  const recorder = (await makePerson(organisationId)).id;
  // 30 suppliers, 000 the oldest: every third an applicant, every fifth with a finance-system code. Created one by one so createdAt differs.
  for (let n = 0; n < 30; n++) {
    const s = await db.supplier.create({ data: supplier(organisationId, n, { status: n % 3 === 0 ? "APPLICANT" : "REGISTERED", erpVendorCode: n % 5 === 0 ? `VC${run}${n}` : null }) });
    supplierIds.push(s.id);
  }
  // Another organisation's supplier with the same words.
  await db.supplier.create({ data: supplier(other, 0) });
  // 12 open applications, one a day from the 1st: 0-5 received, 6-8 waiting on a resubmission still open, 9-11 past the deadline.
  for (let i = 0; i < 12; i++) {
    await db.supplierApplication.create({
      data: {
        organisationId, supplierId: supplierIds[i], kind: "NEW", receivedOn: day(`2026-10-${String(1 + i).padStart(2, "0")}`), channel: "COUNTER", recordedByPersonId: recorder, recordedAt: day("2026-10-01"),
        status: i < 6 ? "RECEIVED" : "RESUBMISSION_REQUESTED", resubmitBy: i < 6 ? null : i < 9 ? day("2099-01-01") : day("2020-01-01"),
      },
    });
  }
}, 120_000);

const list = (reg: ReturnType<typeof register>, opts: Parameters<typeof listSuppliers>[5] = {}) => listSuppliers(organisationId, reg, TODAY, null, null, opts);

describe("listSuppliers, the register (server mode)", () => {
  it("pages the whole register, newest first: the true total, a page past the end is the last, no row twice", async () => {
    const first = (await list(register({ size: "10" })))!;
    expect(first.suppliers).toHaveLength(10);
    expect(first.total).toBe(30);
    expect(first.suppliers[0].reference).toBe(`SUP/${run}/029`);
    const past = (await list(register({ page: "99", size: "10" })))!;
    expect(past.page).toBe(2);
    const seen = new Set<string>();
    for (const page of ["0", "1", "2"]) for (const s of (await list(register({ page, size: "10" })))!.suppliers) seen.add(s.id);
    expect(seen.size).toBe(30);
  });

  it("finds a supplier on a later page from the first, by name, reference, registration number or finance code", async () => {
    const oldest = `SUP/${run}/000`;
    expect((await list(register({ size: "10" })))!.suppliers.map((s) => s.reference)).not.toContain(oldest);
    for (const q of [`Lister 000 ${run}`, oldest, `${run}-000`, `VC${run}0`]) {
      const found = (await list(register({ q })))!;
      expect(found.suppliers.map((s) => s.reference), q).toContain(oldest);
    }
    expect((await list(register({ q: `lister 000 ${run}` })))!.total).toBe(1);
    // A wildcard in the text is literal.
    expect((await list(register({ q: "%%" })))!.total).toBe(0);
  });

  it("views are taken over the whole register; the total of a view is its rows; the header counts stay over the whole set", async () => {
    const registered = (await list(register({ view: "registered", size: "10" })))!;
    expect(registered.total).toBe(20);
    expect(registered.suppliers.every((s) => s.status === "REGISTERED")).toBe(true);
    expect((await list(register({ view: "applicants", size: "10" })))!.total).toBe(10);
    const unsynced = (await list(register({ view: "unsynced", size: "50" })))!;
    expect(unsynced.suppliers.every((s) => s.status === "REGISTERED" && !s.erpVendorCode)).toBe(true);
    expect(unsynced.total).toBe(unsynced.suppliers.length);
    expect(registered.registered).toBe(20);
    expect(registered.applicants).toBe(10);
    expect(registered.unsynced).toBe(unsynced.total);
    // The view and the words together.
    const both = (await list(register({ view: "applicants", q: `Lister 003 ${run}` })))!;
    expect(both.suppliers.map((s) => s.reference)).toEqual([`SUP/${run}/003`]);
    expect((await list(register({ view: "registered", q: `Lister 003 ${run}` })))!.total).toBe(0);
  });

  it("'documents to see to' is judged by the caller over the whole register, then paged", async () => {
    const ids = [supplierIds[1], supplierIds[2], supplierIds[28]];
    const page = (await list(register({ view: "attention", size: "10" }), { attentionIds: ids }))!;
    expect(page.suppliers.map((s) => s.id).sort()).toEqual([...ids].sort());
    expect(page.total).toBe(3);
    // Without a judgement there is none: the view is empty, not the whole register.
    expect((await list(register({ view: "attention" })))!.total).toBe(0);
    // No document type is configured here, so nothing is judged.
    expect(await documentsToSeeToIds(organisationId, [], TODAY)).toEqual([]);
  });

  it("is the organisation's own: another organisation's supplier with the same words is not found", async () => {
    const found = (await list(register({ q: `Lister 000 ${run}` })))!;
    expect(found.total).toBe(1);
    expect(found.suppliers[0].id).toBe(supplierIds[0]);
  });

  it("sorts before paging on the allowed columns; a column outside the set is the default order", async () => {
    const asc = (await list(register({ sort: "name", dir: "asc", size: "10" })))!;
    expect(asc.suppliers[0].registeredName).toBe(`Lister 000 ${run} Sdn Bhd`);
    const desc = (await list(register({ sort: "name", size: "10" })))!;
    expect(desc.suppliers[0].registeredName).toBe(`Lister 029 ${run} Sdn Bhd`);
    const newest = (await list(register({ size: "10" })))!;
    expect(register({ sort: "erpVendorCode" }).sort).toBeNull();
    expect((await list(register({ sort: "erpVendorCode", dir: "asc", size: "10" })))!.suppliers.map((s) => s.id)).toEqual(newest.suppliers.map((s) => s.id));
  });

  it("{ all: 'register' } reads from the first row, up to the cap and one more, under the same where", async () => {
    const all = (await list(register({ view: "applicants", size: "10" }), { all: "register" }))!;
    expect(all.suppliers).toHaveLength(10);
    expect(all.total).toBe(10);
    expect(all.suppliers.length).toBeLessThanOrEqual(LIST_EXPORT_MAX_ROWS + 1);
  });
});

describe("listSuppliers, the applications tab (server mode)", () => {
  const refs = (d: Awaited<ReturnType<typeof list>>) => d!.queue.map((a) => a.supplier.reference);

  it("lists the open applications, newest first, and the count of the whole open set", async () => {
    const data = (await list(register(), { applications: applications({ size: "10" }) }))!;
    expect(data.queue).toHaveLength(10);
    expect(data.applicationsTotal).toBe(12);
    expect(data.queueTotal).toBe(12);
    expect(refs(data)[0]).toBe(`SUP/${run}/011`);
  });

  it("finds an application on a later page from the first, by the applicant's name or registration number", async () => {
    const data = (await list(register(), { applications: applications({ q: `Lister 000 ${run}`, size: "10" }) }))!;
    expect(refs(data)).toEqual([`SUP/${run}/000`]);
    expect(data.applicationsTotal).toBe(1);
    expect(refs((await list(register(), { applications: applications({ q: `${run}-001` }) }))!)).toEqual([`SUP/${run}/001`]);
    // A supplier with no open application is not on this tab, whatever its name.
    expect((await list(register(), { applications: applications({ q: `Lister 020 ${run}` }) }))!.applicationsTotal).toBe(0);
  });

  it("views are judged on the organisation's day over the whole open set: received, a resubmission open, and lapsed", async () => {
    expect((await list(register()))!.applicationCounts).toEqual({ received: 6, approval: 0, resubmission: 3, lapsed: 3 });
    const lapsed = (await list(register(), { applications: applications({ view: "lapsed", size: "10" }) }))!;
    expect(refs(lapsed).sort()).toEqual([9, 10, 11].map((n) => `SUP/${run}/${three(n)}`));
    expect(lapsed.applicationsTotal).toBe(3);
    const both = (await list(register(), { applications: applications({ view: "received", q: `Lister 004 ${run}` }) }))!;
    expect(refs(both)).toEqual([`SUP/${run}/004`]);
    expect((await list(register(), { applications: applications({ view: "lapsed", q: `Lister 004 ${run}` }) }))!.applicationsTotal).toBe(0);
  });

  it("sorts on the applicant's name or the day received; a column outside the set is the default order", async () => {
    const byName = (await list(register(), { applications: applications({ sort: "name", dir: "asc", size: "10" }) }))!;
    expect(refs(byName)[0]).toBe(`SUP/${run}/000`);
    const oldest = (await list(register(), { applications: applications({ sort: "date", dir: "asc", size: "10" }) }))!;
    expect(refs(oldest)[0]).toBe(`SUP/${run}/000`);
    expect(applications({ sort: "kind" }).sort).toBeNull();
    const seen = new Set<string>();
    for (const page of ["0", "1"]) for (const a of (await list(register(), { applications: applications({ sort: "name", page, size: "10" }) }))!.queue) seen.add(a.id);
    expect(seen.size).toBe(12);
  });

  it("{ all: 'applications' } reads from the first row under the same where", async () => {
    const all = (await list(register(), { applications: applications({ view: "received", size: "10" }), all: "applications" }))!;
    expect(all.queue).toHaveLength(6);
    expect(all.applicationsTotal).toBe(6);
  });
});
