import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { PortalKickOffView } from "@/lib/project-docs/kick-off-read";
import type { PortalTeam } from "@/lib/project-docs/team-read";

import { PortalKickOffCard, PortalTeamCard } from "./kick-off-portal";

const team = (o: Partial<PortalTeam> = {}) => renderToStaticMarkup(h(PortalTeamCard, { team: { members: [{ name: "Aminah Binti Razak", office: "Superintending Officer" }, { name: "Hassan Bin Ali", office: "Acting: Superintending Officer" }], dayUnknown: false, ...o } }));
const MEETING = { meetsAtText: "5 Nov 2026, 10:00", place: "Meeting room 2", onlineLink: "https://meet.example.test/room", agenda: "Introductions\nProgramme" };
const view = (o: Partial<PortalKickOffView> = {}): PortalKickOffView => ({ state: "UPCOMING", stateLabel: "Scheduled", tone: "info", meeting: MEETING, held: null, ...o });
const card = (v: PortalKickOffView) => renderToStaticMarkup(h(PortalKickOffCard, { card: v }));

describe("the contractor's team list", () => {
  it("names and offices only", () => {
    const html = team();
    for (const t of ["Aminah Binti Razak", "Superintending Officer", "Hassan Bin Ali", "Acting: Superintending Officer"]) expect(html).toContain(t);
    expect(html).not.toMatch(/mailto:|@|tel:/);
  });

  it("says in words when the day is not known, and when nobody is named", () => {
    const unknown = team({ members: [], dayUnknown: true });
    expect(unknown).toContain("Not known yet");
    expect(unknown).toContain("time zone");
    expect(team({ members: [] })).toContain("Nobody named yet");
  });
});

describe("the contractor's kick-off card (read only)", () => {
  it("not scheduled: the state only", () => {
    const html = card(view({ state: "NOT_SCHEDULED", stateLabel: "Not scheduled", tone: "neutral", meeting: null }));
    expect(html).toContain("Kick-off meeting");
    expect(html).toContain("Not scheduled");
    expect(html).not.toContain(">When<");
  });

  it("scheduled: when, place and agenda; the link is text, no act, nobody named as having scheduled it", () => {
    const html = card(view());
    for (const t of ["5 Nov 2026, 10:00", "Meeting room 2", "Introductions", "https://meet.example.test/room"]) expect(html).toContain(t);
    expect(html).not.toMatch(/href="https:\/\/meet/);
    expect(html).not.toContain("<button");
    expect(html).not.toMatch(/Scheduled by|Recorded by/);
  });

  it("not recorded as held reads as a warning", () => {
    const html = card(view({ state: "NOT_RECORDED_AS_HELD", stateLabel: "Not recorded as held", tone: "warn" }));
    expect(html).toContain("Not recorded as held");
    expect(html).toMatch(/amber/);
  });

  it("held: attendance and minutes, the title a plain link to the document's page and the files named plain", () => {
    const html = card(
      view({
        state: "HELD",
        stateLabel: "Held",
        tone: "ok",
        held: {
          heldOnText: "5 Nov 2026",
          attendance: { organisation: ["Aminah Binti Razak"], contractor: ["Lim Wei"], others: [] },
          minutes: { title: "Kick-off minutes", href: "/supplier/projects/c1/documents/d1", files: [{ name: "minutes.pdf", href: "/supplier/projects/documents/file/f1" }] },
        },
      }),
    );
    for (const t of ["Held", "5 Nov 2026", "Aminah Binti Razak", "Lim Wei", "Kick-off minutes", "minutes.pdf"]) expect(html).toContain(t);
    expect(html).toContain('href="/supplier/projects/c1/documents/d1"');
    // The file download needs the page's form key, which the overview does not carry: the name is not a link here.
    expect(html).not.toContain("documents/file/f1");
    expect(html).not.toContain(">Others<");
  });

  it("held with the minutes not shared says so", () => {
    const html = card(view({ state: "HELD", stateLabel: "Held", tone: "ok", held: { heldOnText: "5 Nov 2026", attendance: { organisation: [], contractor: [], others: [] }, minutes: null } }));
    expect(html).toContain("Not shared");
  });
});
