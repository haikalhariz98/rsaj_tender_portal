import { describe, expect, it } from "vitest";

import { assessMatter, type MatterBlocker, type MatterInput } from "./matter";
import { configurationGaps, subjectList, type GapMatter } from "./gaps";

/*
 * The banner on a sitting says how many matters the committee's configuration stops,
 * and which, from the same per-matter assessment the cards show (6.10 local review 2).
 */

const set = { quorum: 3, votingRule: "SIMPLE_MAJORITY" as const };
const pending = (id: string, subject = id): GapMatter => ({ id, subject, outcome: "PENDING", withdrawn: false });
const assessed = (by: Record<string, MatterBlocker[]>) => ({
  matters: Object.fromEntries(Object.entries(by).map(([id, blockers]) => [id, { blockers }])),
});

describe("configurationGaps", () => {
  // The demo Tender Board sitting in progress: three matters, a quorum and rule set,
  // and the alternate question unanswered. One member with an alternate recused on the
  // security renewal only, so the banner stops one matter of three — not the sitting.
  it("worked example: the alternate question stops 1 of 3 matters, named by subject", () => {
    const seats = [
      { seatId: "chair", holderId: "ceo" },
      { seatId: "fd", holderId: "fd" },
      { seatId: "ops", holderId: "ops", hasAlternate: true },
    ];
    const common: Omit<MatterInput, "recusedIds" | "votes"> = {
      ...set, act: "A", tabled: true, seats, occupants: [{ seatId: "chair", personId: "ceo" }, { seatId: "fd", personId: "fd" }],
      dependencyOutcome: null, alternateMayVoteForRecused: null,
    };
    const matters = [
      pending("d1", "Award of the head office cleaning contract"),
      pending("d6", "Renewal of the security services contract"),
      pending("d10", "Award of the pumping station refurbishment"),
    ];
    const assessment = {
      matters: {
        d1: assessMatter({ ...common, recusedIds: [], votes: [] }),
        d6: assessMatter({ ...common, recusedIds: ["ops"], votes: [] }),
        d10: assessMatter({ ...common, recusedIds: [], votes: [] }),
      },
    };
    const r = configurationGaps({ status: "IN_PROGRESS", rules: set, secretariatRoleCode: "SEC", matters, assessment })!;
    expect(r.affectedMatterIds).toEqual(["d6"]);
    expect(r.agendaCount).toBe(3);
    expect(r.title).toBe("This committee's configuration stops 1 of 3 matters from being decided");
    expect(r.gaps.map((g) => g.key)).toEqual(["ALTERNATE_FOR_RECUSED"]);
    expect(r.gaps[0].text).toContain("It stops “Renewal of the security services contract”.");
    expect(r.gaps[0].text).not.toContain("cleaning");
  });

  it("nothing unset: no banner", () => {
    const r = configurationGaps({
      status: "IN_PROGRESS", rules: set, secretariatRoleCode: "SEC",
      matters: [pending("a")], assessment: assessed({ a: ["VOTES_OUTSTANDING"] }),
    });
    expect(r).toBeNull();
  });

  it("a minuted or cancelled sitting decides nothing more: no banner", () => {
    for (const status of ["MINUTED", "CANCELLED"] as const) {
      expect(configurationGaps({
        status, rules: { quorum: null, votingRule: null }, secretariatRoleCode: null,
        matters: [pending("a")], assessment: assessed({ a: ["QUORUM_UNCONFIGURED"] }),
      })).toBeNull();
    }
  });

  it("an unset quorum and rule stop every pending matter; a decided or withdrawn one is not counted", () => {
    const r = configurationGaps({
      status: "IN_PROGRESS", rules: { quorum: null, votingRule: null }, secretariatRoleCode: "SEC",
      matters: [
        pending("a", "A"),
        pending("b", "B"),
        { id: "c", subject: "C", outcome: "CARRIED", withdrawn: false },
        { id: "w", subject: "W", outcome: "PENDING", withdrawn: true },
      ],
      assessment: assessed({
        a: ["QUORUM_UNCONFIGURED", "VOTING_RULE_UNCONFIGURED"],
        b: ["QUORUM_UNCONFIGURED", "VOTING_RULE_UNCONFIGURED"],
        c: [],
        w: ["QUORUM_UNCONFIGURED", "VOTING_RULE_UNCONFIGURED"],
      }),
    })!;
    // Counted once each, though two gaps stop them.
    expect(r.affectedMatterIds).toEqual(["a", "b"]);
    expect(r.agendaCount).toBe(3);
    expect(r.title).toBe("This committee's configuration stops 2 of 3 matters from being decided");
    expect(r.gaps.map((g) => g.key)).toEqual(["QUORUM", "VOTING_RULE"]);
    expect(r.gaps[0].text).toContain("It stops every matter not yet decided: “A” and “B”.");
  });

  it("every matter on the agenda stopped: says all, and the one", () => {
    const all = configurationGaps({
      status: "SCHEDULED", rules: { quorum: null, votingRule: set.votingRule }, secretariatRoleCode: "SEC",
      matters: [pending("a"), pending("b")], assessment: assessed({ a: ["QUORUM_UNCONFIGURED"], b: ["QUORUM_UNCONFIGURED"] }),
    })!;
    expect(all.title).toBe("This committee's configuration stops all 2 matters on the agenda from being decided");
    const one = configurationGaps({
      status: "SCHEDULED", rules: { quorum: null, votingRule: set.votingRule }, secretariatRoleCode: "SEC",
      matters: [pending("a")], assessment: assessed({ a: ["QUORUM_UNCONFIGURED"] }),
    })!;
    expect(one.title).toBe("This committee's configuration stops the one matter on the agenda from being decided");
  });

  it("nothing tabled yet: an unset quorum warns for what is to come, and counts nothing", () => {
    const r = configurationGaps({
      status: "SCHEDULED", rules: { quorum: null, votingRule: set.votingRule }, secretariatRoleCode: "SEC",
      matters: [], assessment: assessed({}),
    })!;
    expect(r.affectedMatterIds).toEqual([]);
    expect(r.title).toBe("This committee's configuration will stop any matter tabled at this sitting from being decided");
    expect(r.gaps[0].text).not.toContain("It stops");
  });

  it("an unset Secretariat stops tabling, and only the matters not yet tabled", () => {
    const onlySec = configurationGaps({
      status: "SCHEDULED", rules: set, secretariatRoleCode: null,
      matters: [pending("a")], assessment: assessed({ a: [] }),
    })!;
    expect(onlySec.affectedMatterIds).toEqual([]);
    expect(onlySec.title).toBe("This committee's configuration stops anyone tabling a matter at this sitting");

    const untabled = configurationGaps({
      status: "SCHEDULED", rules: set, secretariatRoleCode: null,
      matters: [pending("a", "A"), pending("b", "B")], assessment: assessed({ a: [], b: ["NOT_TABLED"] }),
    })!;
    expect(untabled.affectedMatterIds).toEqual(["b"]);
    expect(untabled.title).toBe("This committee's configuration stops 1 of 2 matters from being decided");
    expect(untabled.gaps[0].text).toContain("It stops “B”.");
  });

  it("the alternate question is a gap only where a matter raises it", () => {
    const r = configurationGaps({
      status: "IN_PROGRESS", rules: set, secretariatRoleCode: "SEC",
      matters: [pending("a")], assessment: assessed({ a: ["QUORUM_NOT_MET"] }),
    });
    expect(r).toBeNull();
  });
});

describe("subjectList", () => {
  it("joins subjects as a sentence reads them", () => {
    expect(subjectList([])).toBe("");
    expect(subjectList(["A"])).toBe("“A”");
    expect(subjectList(["A", "B"])).toBe("“A” and “B”");
    expect(subjectList(["A", "B", "C"])).toBe("“A”, “B” and “C”");
  });
});
