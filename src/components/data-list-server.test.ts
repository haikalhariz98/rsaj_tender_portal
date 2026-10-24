import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ListQuery } from "@/lib/list-query";

import { DataList, type Column, type Row, type ServerMode } from "./data-list";
import { serverMode } from "./server-list";

/** Server mode (7.3): the server searches, sorts and pages; the client filters nothing and counts from the total. */
const base: ListQuery = { q: null, view: null, sort: null, dir: "desc", page: 0, size: 25, words: [] };
const sortColumns = { name: "title" };
const make = (query: Partial<ListQuery> = {}, o: Partial<{ total: number; page: number; exportHref: string; exportBlocked: string }> = {}): ServerMode =>
  serverMode("/list", { ...base, ...query }, { total: 340, page: 0, sortColumns, ...o });

const cols: Column[] = [
  { key: "name", label: "Name", sortable: true },
  { key: "other", label: "Other", sortable: true },
  { key: "value", label: "Value", sortable: true, sulit: true },
];
const two: Row[] = [
  { id: "1", search: "alpha", cells: { name: { kind: "text", text: "Alpha" }, other: { kind: "text", text: "o" }, value: { kind: "money", value: 5 } } },
  { id: "2", search: "beta", cells: { name: { kind: "text", text: "Beta" }, other: { kind: "text", text: "o" }, value: { kind: "money", value: 6 } } },
];
const render = (server: ServerMode, rows: Row[] = two) =>
  renderToStaticMarkup(createElement(DataList, { columns: cols, rows, views: [{ id: "x", label: "View X" }], filters: [{ key: "other", label: "Other" }], server }));

describe("DataList in server mode", () => {
  it("is a GET search form named q that keeps the view and the sort, and filters no row on the client", () => {
    const out = render(make({ q: "alp", view: "x", sort: "title", dir: "asc" }));
    expect(out).toContain('action="/list"');
    expect(out).toContain('name="q"');
    expect(out).toContain('value="alp"');
    expect(out).toContain('name="view"');
    expect(out).toContain('name="sort"');
    expect(out).toContain('name="dir"');
    // "alp" matches one row, yet both are drawn: the server filtered, the client does not.
    expect(out).toContain("Alpha");
    expect(out).toContain("Beta");
  });
  it("draws neither the client view selector nor the filters", () => {
    const out = render(make());
    expect(out).not.toContain("View X");
    expect(out).not.toContain("All records");
    expect(out).not.toContain("Any other");
  });
  it("counts from the total, offers 10, 25 and 50 as links, and Next but not Previous on the first page", () => {
    const out = render(make());
    expect(out).toContain("1–25 of 340");
    expect(out).toContain('href="/list?size=10"');
    expect(out).toContain('href="/list?size=50"');
    expect(out).toContain('href="/list"');
    expect(out).toContain('href="/list?page=1"');
    expect(out).not.toContain("Showing");
    const last = render(make({ page: 13 }, { page: 13 }));
    expect(last).toContain("326–340 of 340");
    expect(last).toContain('href="/list?page=12"');
    expect(last).not.toContain('href="/list?page=14"');
  });
  it("draws a column of the sort set as a header link carrying sort and dir, keeping q and view; any other column is not sortable, whatever its flag or the total", () => {
    const out = render(make({ q: "alp", view: "x" }));
    expect(out).toContain('href="/list?q=alp&amp;view=x&amp;sort=title&amp;dir=asc"');
    expect(out).toContain('title="Name"');
    expect(out).not.toContain('title="Other"');
    expect(out).not.toContain('title="Value"');
    expect(out).toContain(">Other<");
    expect(render(make({ sort: "title", dir: "asc" }))).toContain('aria-sort="ascending"');
    expect(render(make({ sort: "title", dir: "desc" }))).toContain('aria-sort="descending"');
    expect(render(make({ sort: "title", dir: "desc" }))).toMatch(/<a title="Name"[^>]*href="\/list"/);
    // A total of 3 changes nothing about which columns are sortable.
    const small = render(make({}, { total: 3 }));
    expect(small).toContain('title="Name"');
    expect(small).not.toContain('title="Other"');
  });
  it("keeps the page's own export until the export routes; links to a route when given; says it cannot where blocked", () => {
    expect(render(make())).toContain("Download CSV");
    const blocked = render(make({}, { exportBlocked: "This view cannot be exported" }));
    expect(blocked).not.toContain("Download CSV");
    expect(blocked).toContain("This view cannot be exported");
    const linked = render(make({}, { exportHref: "/list/export?q=a" }));
    expect(linked).toContain('href="/list/export?q=a"');
    expect(linked).not.toContain("Download CSV");
  });
  it("still collapses an all-withheld SULIT column into one note", () => {
    const hid: Row[] = two.map((r) => ({ ...r, cells: { ...r.cells, value: { kind: "withheld", words: "Only the committee may read this." } } }));
    const out = render(make(), hid);
    expect(out).toContain("Values hidden");
    expect(out).not.toContain(">Value<");
  });
  it("narrowed and nothing found: says nothing matches, with the way back to the whole list", () => {
    const out = render(make({ q: "zzz" }, { total: 0 }), []);
    expect(out).toContain("Nothing matches");
    expect(out).toContain('href="/list"');
  });
});

describe("serverMode links", () => {
  const q: ListQuery = { q: "bid", view: "open", sort: null, dir: "desc", page: 2, size: 10, words: ["bid"] };
  const o = { total: 100, page: 2, sortColumns: { name: "title" } };
  it("cycles a sort from ascending to descending to the default, back on the first page and keeping q, view and size", () => {
    expect(serverMode("/l", q, o).sortHrefs.name).toBe("/l?q=bid&view=open&sort=title&dir=asc&size=10");
    expect(serverMode("/l", { ...q, sort: "title", dir: "asc" }, o).sortHrefs.name).toBe("/l?q=bid&view=open&sort=title&size=10");
    expect(serverMode("/l", { ...q, sort: "title" }, o).sortHrefs.name).toBe("/l?q=bid&view=open&size=10");
  });
  it("pages and sizes keep the query; the size choice goes back to the first page; the last page has no Next", () => {
    const s = serverMode("/l", q, o);
    expect(s.prevHref).toBe("/l?q=bid&view=open&page=1&size=10");
    expect(s.nextHref).toBe("/l?q=bid&view=open&page=3&size=10");
    expect(s.sizeHrefs[50]).toBe("/l?q=bid&view=open&size=50");
    expect(serverMode("/l", q, { ...o, page: 9 }).nextHref).toBeNull();
  });
  it("offers the way back only when a search or a view narrows the list", () => {
    expect(serverMode("/l", q, o).clearHref).toBe("/l?size=10");
    expect(serverMode("/l", { ...q, q: null, view: null }, o).clearHref).toBeNull();
  });
});

describe("serverMode on a tabbed page (7.4)", () => {
  it("every link of a tab's list carries the tab, the search and the view, whichever page it is on", () => {
    const m = serverMode("/suppliers?tab=applications", { ...base, q: "lister", view: "lapsed", page: 1 }, { total: 100, page: 1, sortColumns: { supplier: "name" } });
    for (const href of [m.prevHref, m.nextHref, m.sortHrefs.supplier, m.sizeHrefs[50]]) {
      expect(href).toContain("tab=applications");
      expect(href).toContain("q=lister");
      expect(href).toContain("view=lapsed");
    }
    expect(m.keep).toEqual({ view: "lapsed" });
  });
});
