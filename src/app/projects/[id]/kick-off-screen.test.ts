import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { KickOffCardView } from "@/lib/project-docs/kick-off-read";
import type { ContractorAccounts } from "@/lib/project-docs/team-read";

vi.mock("@/app/projects/[id]/kick-off-actions", () => ({}));
vi.mock("@/app/projects/[id]/document-actions", () => ({}));
vi.mock("./kick-off-editors", () => ({
  ScheduleKickOffDrawer: () => h("button", null, "Schedule"),
  ChangeKickOffDrawer: ({ current }: { current: { meetsOn: string | null; meetsTime: string | null; place: string } }) => h("button", { "data-on": current.meetsOn, "data-time": current.meetsTime, "data-place": current.place }, "Change"),
  RecordKickOffHeldDrawer: ({ today, choices }: { today: string | null; choices: { organisation: { name: string }[]; contractor: { label: string }[] } }) =>
    h("button", { "data-today": today, "data-org": choices.organisation.map((p) => p.name).join(","), "data-con": choices.contractor.map((a) => a.label).join(",") }, "Record as held"),
}));

import { ContractorAccountsCard } from "./contractor-accounts-card";
import { KickOffCard } from "./kick-off-card";

const open = { allowed: true, reasons: [] as string[] };
const shut = (...reasons: string[]) => ({ allowed: false, reasons });
const CHOICES = { organisation: [{ personId: "p1", name: "Aminah Binti Razak", office: "Superintending Officer" }], contractor: [{ accountId: "a1", label: "Lim Wei", named: true, statusLabel: "Active" }], contractorNamesWithheld: null };
const MEETING = { meetsAtText: "5 Nov 2026, 10:00", meetsOn: "2026-11-05", meetsTime: "10:00", place: "Meeting room 2", onlineLink: "https://meet.example.test/room?x=1", agenda: "Introductions\nProgramme", scheduledBy: "Hassan Bin Ali", scheduledOn: "23 Oct 2026, 09:00" };
const base = (o: Partial<KickOffCardView> = {}): KickOffCardView => ({
  state: "NOT_SCHEDULED",
  stateLabel: "Not scheduled",
  tone: "neutral",
  meeting: null,
  held: null,
  actions: { schedule: open, change: shut("Nothing is scheduled."), recordHeld: shut("Nothing is scheduled.") },
  choices: { organisation: [], contractor: [], contractorNamesWithheld: null },
  today: "2026-10-23",
  briefingMissing: false,
  ...o,
});
const scheduled = (o: Partial<KickOffCardView> = {}) => base({ state: "UPCOMING", stateLabel: "Scheduled", tone: "info", meeting: MEETING, actions: { schedule: shut("Already scheduled."), change: open, recordHeld: open }, choices: CHOICES, ...o });
const card = (c: KickOffCardView) => renderToStaticMarkup(h(KickOffCard, { card: c, contractId: "c1", briefingHref: "/projects/c1?stage=signing&tab=formation&section=signing" }));

describe("the kick-off meeting card (staff)", () => {
  it("not scheduled: the state, and only Schedule", () => {
    const html = card(base());
    expect(html).toContain("Kick-off meeting");
    expect(html).toContain("Not scheduled");
    expect(html).toContain(">Schedule<");
    expect(html).not.toContain(">Change<");
    expect(html).not.toContain("Record as held");
  });

  it("scheduled: when, place, agenda, who scheduled it; change and record offered, change prefilled", () => {
    const html = card(scheduled());
    expect(html).toContain("Scheduled");
    for (const t of ["5 Nov 2026, 10:00", "Meeting room 2", "Introductions", "Hassan Bin Ali"]) expect(html).toContain(t);
    expect(html).toContain('data-on="2026-11-05"');
    expect(html).toContain('data-time="10:00"');
    expect(html).toContain('data-today="2026-10-23"');
    expect(html).toContain('data-org="Aminah Binti Razak"');
    expect(html).toContain('data-con="Lim Wei"');
    expect(html).not.toContain(">Schedule<");
  });

  it("the online link is plain text, never an anchor", () => {
    const html = card(scheduled());
    expect(html).toContain("https://meet.example.test/room?x=1");
    expect(html).not.toMatch(/href="https:\/\/meet\.example/);
    expect(html).not.toMatch(/<a [^>]*>[^<]*meet\.example/);
  });

  it("an empty place or link is left out, not shown blank", () => {
    const html = card(scheduled({ meeting: { ...MEETING, place: "", onlineLink: "" } }));
    expect(html).not.toContain(">Place<");
    expect(html).not.toContain(">Online link<");
  });

  it("not recorded as held reads as a warning, and still offers the two acts", () => {
    const html = card(scheduled({ state: "NOT_RECORDED_AS_HELD", stateLabel: "Not recorded as held", tone: "warn" }));
    expect(html).toContain("Not recorded as held");
    expect(html).not.toMatch(/upcoming/i);
    expect(html).toMatch(/amber/);
    expect(html).toContain(">Change<");
    expect(html).toContain("Record as held");
  });

  it("held: the day, who recorded it, the three attendance lists, the minutes' page and files; no acts", () => {
    const html = card(
      scheduled({
        state: "HELD",
        stateLabel: "Held",
        tone: "ok",
        actions: { schedule: shut("x"), change: shut("It has been held."), recordHeld: shut("It has been held.") },
        held: {
          heldOnText: "5 Nov 2026",
          recordedBy: "Hassan Bin Ali",
          attendance: { organisation: ["Aminah Binti Razak"], contractor: ["Portal account"], others: ["Mr Tan, surveyor"] },
          minutes: { documentId: "d1", title: "Kick-off minutes", href: "/projects/c1/documents/d1", files: [{ versionId: "v1", name: "minutes.pdf" }] },
        },
      }),
    );
    for (const t of ["Held", "5 Nov 2026", "Aminah Binti Razak", "Portal account", "Mr Tan, surveyor", "Kick-off minutes", "minutes.pdf"]) expect(html).toContain(t);
    expect(html).toContain('href="/projects/c1/documents/d1"');
    expect(html).toContain('href="/api/documents/versions/v1"');
    expect(html).not.toContain(">Change<");
    expect(html).not.toContain("Record as held");
    expect(html).not.toContain(">Schedule<");
  });

  it("a shut gate is a disabled button; its reasons are in words and said once", () => {
    const why = "No authority today.";
    const html = card(scheduled({ actions: { schedule: shut("x"), change: shut(why), recordHeld: shut(why, "The minutes class is not set.") } }));
    expect(html).toContain("disabled");
    expect(html).toContain("The minutes class is not set.");
    const note = html.match(/id="kick-off-note"[^>]*>([^<]*)</)?.[1] ?? "";
    expect(note.split(why).length - 1).toBe(1);
    expect(note).toContain("The minutes class is not set.");
    expect(card(base({ actions: { schedule: shut("Time zone not set."), change: shut("n"), recordHeld: shut("n") } }))).toContain("Time zone not set.");
  });

  it("while the briefing is missing, a link to its own act; not otherwise", () => {
    expect(card(scheduled({ briefingMissing: true }))).toContain('href="/projects/c1?stage=signing&amp;tab=formation&amp;section=signing"');
    expect(card(scheduled())).not.toContain("Record the briefing");
    expect(card(base({ briefingMissing: true }))).toContain("Record the briefing");
  });

  it("no code reaches the screen", () => {
    const html = card(scheduled({ state: "NOT_RECORDED_AS_HELD", stateLabel: "Not recorded as held", tone: "warn" }));
    expect(html).not.toMatch(/NOT_RECORDED|NOT_SCHEDULED|UPCOMING/);
  });
});

const accounts = (o: Partial<ContractorAccounts> = {}): ContractorAccounts => ({ rows: [{ accountId: "a1", label: "Lim Wei", named: true, statusLabel: "Active" }], namesWithheld: null, manageHref: null, noContractor: false, ...o });
const acc = (a: ContractorAccounts) => renderToStaticMarkup(h(ContractorAccountsCard, { accounts: a }));

describe("the contractor's portal accounts (staff Team)", () => {
  it("names and status where the names are allowed; no manage link without the right", () => {
    const html = acc(accounts());
    expect(html).toContain("portal accounts");
    expect(html).toContain("Lim Wei");
    expect(html).toContain("Active");
    expect(html).not.toContain("Manage accounts");
  });

  it("without the names right: each row reads Portal account, and why is behind the information button", () => {
    const why = "You may not read contact names.";
    const html = acc(accounts({ rows: [{ accountId: "a1", label: "Portal account", named: false, statusLabel: "Active" }], namesWithheld: why }));
    expect(html).toContain("Portal account");
    expect(html).not.toContain("Lim Wei");
    expect(html).toContain(why);
  });

  it("the manage link only where given", () => {
    const html = acc(accounts({ manageHref: "/suppliers/s1" }));
    expect(html).toContain("Manage accounts");
    expect(html).toContain('href="/suppliers/s1"');
  });

  it("no accounts, and no contractor on the register, each say so", () => {
    expect(acc(accounts({ rows: [] }))).toContain("No portal accounts");
    const none = acc(accounts({ rows: [], noContractor: true }));
    expect(none).toContain("No contractor on the register");
    expect(none).not.toContain("No portal accounts");
  });

  it("uses the shared pieces: no prototype class, no count", () => {
    const src = readFileSync(join(__dirname, "contractor-accounts-card.tsx"), "utf8") + readFileSync(join(__dirname, "kick-off-card.tsx"), "utf8");
    expect(src).not.toMatch(/\b(pagehead|tabbar|card__head|btn)\b/);
    expect(acc(accounts())).not.toMatch(/\b\d+ (accounts?|people)\b/);
  });
});
