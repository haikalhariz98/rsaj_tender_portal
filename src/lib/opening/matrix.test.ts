import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { BidPartRule } from "@/lib/bids/online/types";

import type { ChecklistItem } from "./checklist";
import { openingFindingText } from "./labels";
import {
  ADDENDUM_DAY_HELD_TEXT,
  addendumCellText,
  CELL_WORDS,
  cellAnswerFaults,
  cellFacts,
  type CellFacts,
  type CellKind,
  columnBindingFaults,
  columnStatus,
  columnTally,
  type ColumnTally,
  confirmationStands,
  confirmFaults,
  EMPTY_TALLY_TEXT,
  MATRIX_FAULT_TEXT,
  matrixActorFaults,
  parseColumnBinding,
  standingConfirmations,
  tallyText,
} from "./matrix";
import { CHECKLIST_ANSWERS, type ChecklistAnswer } from "./types";

/**
 * SR-14's matrix (wave 3c plan §1.1 and §3.1; rulings 22, 23, 24; 20cn, 20co, 20cp, 20cv). Pure.
 *
 * Worked example, readable by hand. The frozen checklist has three items: the Form of Tender (FOT), the Summary and Rates (SAR) and Addendum 1. The frozen
 * rules mark only the Form of Tender as opened at the opening. Bid 1 sent one file for the Form of Tender and none for the Summary and Rates, and its
 * supplier acknowledged Addendum 1 on 13 Nov 2026. So its column reads:
 *   Form of Tender   → the officers open the file (CHECK_FILES)
 *   Summary and Rates → no file was received (NOT_RECEIVED): Present is refused, Absent or Not applicable is the officers' call
 *   Addendum 1       → "Acknowledged 13 Nov 2026"
 * The column starts at revision 0, and every answer changed and every decision recorded raises it by one (plan §1.3, §4.1). Step by step:
 *   1. The officers answer Present, Absent, Present (revisions 1, 2, 3). The column reads "2 of 3 present · 1 absent".
 *      Nobody may confirm yet: no decision is recorded.
 *   2. An officer records Reject (revision 4). Aminah confirms at revision 4.
 *   3. On a second look the officers record Pass instead (revision 5). Badrul confirms at revision 5.
 *   4. Aminah's confirmation was taken at revision 4, before the change, so it no longer counts: she is listed "confirm again" and the column awaits.
 *   5. Aminah confirms again at revision 5. Both named officers now confirm the column as it reads, so the decision, Pass, stands: CONFIRMED.
 */

const FOT: ChecklistItem = { key: "FOT", label: "Form of Tender", source: "PART" };
const SAR: ChecklistItem = { key: "SAR", label: "Summary and Rates", source: "PART" };
const DEC: ChecklistItem = { key: "DEC", label: "Declaration", source: "PART" };
const ADD1: ChecklistItem = { key: "addendum:1", label: "Addendum 1: Revised drawings", source: "ADDENDUM" };
const ADD2: ChecklistItem = { key: "addendum:2", label: "Addendum 2: Site visit", source: "ADDENDUM" };

const packParts = [
  { id: "pp-fot", partCode: "FOT" },
  { id: "pp-sar", partCode: "SAR" },
  { id: "pp-dec", partCode: "DEC" },
];
const rule = (packPartId: string, openingCheck: boolean): BidPartRule => ({ packPartId, label: packPartId, mandatory: true, returnedByBidder: true, acceptedMediaTypes: ["application/pdf"], maxBytes: "1000000", openingCheck });
/// The rules frozen at publication: only the Form of Tender is opened at the opening.
const frozen = [rule("pp-fot", true), rule("pp-sar", false), rule("pp-dec", false)];

const online = (over: Partial<Parameters<typeof cellFacts>[0]> = {}) =>
  cellFacts({ online: true, items: [FOT, SAR, ADD1], packParts, rules: frozen, files: [{ fileId: "f1", packPartId: "pp-fot" }], acknowledgements: new Map([[1, "2026-11-13"]]), ...over });

const kinds = (cs: readonly CellFacts[]) => cs.map((c) => c.kind);

describe("the worked example (a finance reader can follow it by hand)", () => {
  it("reads bid 1's column cell by cell, then its tally, then who must still confirm", () => {
    const cells = online();
    expect(cells).toEqual([
      { itemKey: "FOT", kind: "CHECK_FILES", fileIds: ["f1"], acknowledgedOn: null },
      { itemKey: "SAR", kind: "NOT_RECEIVED", fileIds: [], acknowledgedOn: null },
      { itemKey: "addendum:1", kind: "ADDENDUM", fileIds: [], acknowledgedOn: "2026-11-13" },
    ]);
    expect(addendumCellText(cells[2].acknowledgedOn)).toBe("Acknowledged 13 Nov 2026");
    expect(cellAnswerFaults(cells[1], "PRESENT").map((f) => f.code)).toEqual(["NO_FILE_RECEIVED"]);

    const answers = new Map<string, ChecklistAnswer>([["FOT", "PRESENT"], ["SAR", "ABSENT"], ["addendum:1", "PRESENT"]]);
    const tally = columnTally([FOT, SAR, ADD1], answers);
    expect(tallyText(tally)).toBe("2 of 3 present · 1 absent");
    // Step 1: answered, revision 3, no decision yet, so a confirmation is refused.
    expect(confirmFaults({ tally, verdict: null }).map((f) => f.code)).toEqual(["DECISION_NOT_RECORDED"]);
    const officers = [{ personId: "aminah", name: "Aminah" }, { personId: "badrul", name: "Badrul" }];
    const confirmation = (personId: string, columnRevision: number) => ({ personId, correctionNo: 0, columnRevision });
    // Step 2: Reject recorded, revision 4; Aminah confirms at 4.
    expect(confirmFaults({ tally, verdict: "REJECT" })).toEqual([]);
    const step2 = columnStatus({ online: true, tally, verdict: "REJECT", bid: { asReadCorrections: 0, columnRevision: 4 }, officers, confirmations: [confirmation("aminah", 4)] });
    expect(step2).toEqual({ status: "AWAITING_CONFIRMATION", confirmed: [{ personId: "aminah", name: "Aminah" }], awaiting: [{ personId: "badrul", name: "Badrul" }], stale: [] });
    // Steps 3 and 4: Pass recorded instead, revision 5; Badrul confirms at 5; Aminah's confirmation at 4 is stale.
    const bid = { asReadCorrections: 0, columnRevision: 5 };
    const step4 = columnStatus({ online: true, tally, verdict: "PASS", bid, officers, confirmations: [confirmation("aminah", 4), confirmation("badrul", 5)] });
    expect(step4).toEqual({ status: "AWAITING_CONFIRMATION", confirmed: [{ personId: "badrul", name: "Badrul" }], awaiting: [], stale: [{ personId: "aminah", name: "Aminah" }] });
    // Step 5: Aminah confirms again at 5. The decision stands.
    const step5 = columnStatus({ online: true, tally, verdict: "PASS", bid, officers, confirmations: [confirmation("aminah", 4), confirmation("badrul", 5), confirmation("aminah", 5)] });
    expect(step5.status).toBe("CONFIRMED");
  });
});

describe("cellFacts: what each cell offers (§1.2, G1)", () => {
  it("paper: every cell is PAPER, with no files and no acknowledgement day, whatever the inputs say", () => {
    const cells = cellFacts({ online: false, items: [FOT, SAR, ADD1], packParts, rules: frozen, files: [{ fileId: "f1", packPartId: "pp-fot" }], acknowledgements: new Map([[1, "2026-11-13"]]) });
    expect(cells).toEqual([FOT, SAR, ADD1].map((it) => ({ itemKey: it.key, kind: "PAPER", fileIds: [], acknowledgedOn: null })));
  });
  it("every CellKind is reachable", () => {
    const seen = new Set<CellKind>([
      ...kinds(online({ items: [FOT, SAR, DEC, ADD1], files: [{ fileId: "f1", packPartId: "pp-fot" }, { fileId: "f3", packPartId: "pp-dec" }] })),
      ...kinds(cellFacts({ online: false, items: [FOT], packParts, rules: frozen, files: [], acknowledgements: new Map() })),
    ]);
    expect([...seen].sort()).toEqual(["ADDENDUM", "CHECK_FILES", "NOT_RECEIVED", "PAPER", "RECEIVED_NOT_CHECKED"]);
  });
  it("CHECK_FILES: the part's frozen rule says openingCheck and the bid holds its files, listed in upload order", () => {
    const [fot] = online({ items: [FOT], files: [{ fileId: "f2", packPartId: "pp-fot" }, { fileId: "x", packPartId: "pp-sar" }, { fileId: "f1", packPartId: "pp-fot" }] });
    expect(fot).toEqual({ itemKey: "FOT", kind: "CHECK_FILES", fileIds: ["f2", "f1"], acknowledgedOn: null });
  });
  it("RECEIVED_NOT_CHECKED: a returned part not marked openingCheck, with a file received", () => {
    expect(online({ items: [SAR], files: [{ fileId: "s1", packPartId: "pp-sar" }] })).toEqual([{ itemKey: "SAR", kind: "RECEIVED_NOT_CHECKED", fileIds: ["s1"], acknowledgedOn: null }]);
  });
  it("NOT_RECEIVED: a part with no file, flagged for opening or not (20cn: the row stays)", () => {
    expect(kinds(online({ items: [FOT, SAR], files: [] }))).toEqual(["NOT_RECEIVED", "NOT_RECEIVED"]);
  });
  it("a part with no frozen rule: NOT_RECEIVED with no file, RECEIVED_NOT_CHECKED with one (the narrower use, as grantPlan)", () => {
    expect(kinds(online({ items: [FOT], rules: [], files: [] }))).toEqual(["NOT_RECEIVED"]);
    expect(online({ items: [FOT], rules: [], files: [{ fileId: "f1", packPartId: "pp-fot" }] })[0]).toMatchObject({ kind: "RECEIVED_NOT_CHECKED", fileIds: ["f1"] });
  });
  it("a part code not in the pack: no file can be matched to it, so NOT_RECEIVED", () => {
    const ghost: ChecklistItem = { key: "GHOST", label: "Not in the pack", source: "PART" };
    expect(online({ items: [ghost], files: [{ fileId: "f1", packPartId: "pp-fot" }] })).toEqual([{ itemKey: "GHOST", kind: "NOT_RECEIVED", fileIds: [], acknowledgedOn: null }]);
  });
  it("G1: the live configuration is ignored. Only the frozen rules passed in decide; a rule with the flag off reads as not opened even if the part is flagged today", () => {
    // `rules` is the only place openingCheck is read: the same files under rules with the flag off give RECEIVED_NOT_CHECKED.
    const off = online({ items: [FOT], rules: [rule("pp-fot", false)] });
    expect(off[0].kind).toBe("RECEIVED_NOT_CHECKED");
    const src = readFileSync(join(process.cwd(), "src/lib/opening/matrix.ts"), "utf8");
    expect(src).not.toMatch(/from "@\/lib\/db"|prisma|tenderDocumentPart|TenderDocumentPart/);
    const reads = [...src.matchAll(/\.openingCheck\b/g)].length;
    expect(reads).toBe(1);
    expect(src).toMatch(/i\.rules\.some\(\(r\) => r\.packPartId === part\.id && r\.openingCheck\)/);
  });
  it("an alternative's column reads its own files: the parent's files, passed for the parent, do not appear in it", () => {
    const parent = online({ items: [FOT, SAR], files: [{ fileId: "p-fot", packPartId: "pp-fot" }, { fileId: "p-sar", packPartId: "pp-sar" }] });
    const alternative = online({ items: [FOT, SAR], files: [{ fileId: "a-fot", packPartId: "pp-fot" }] });
    expect(parent.map((c) => c.fileIds)).toEqual([["p-fot"], ["p-sar"]]);
    expect(alternative).toEqual([
      { itemKey: "FOT", kind: "CHECK_FILES", fileIds: ["a-fot"], acknowledgedOn: null },
      { itemKey: "SAR", kind: "NOT_RECEIVED", fileIds: [], acknowledgedOn: null },
    ]);
  });
  it("addenda: acknowledged gives the day, not acknowledged gives null, and the words say each", () => {
    const cells = online({ items: [ADD1, ADD2], acknowledgements: new Map([[1, "2026-11-13"]]) });
    expect(cells.map((c) => [c.kind, c.acknowledgedOn])).toEqual([["ADDENDUM", "2026-11-13"], ["ADDENDUM", null]]);
    expect(addendumCellText(null)).toBe("Not acknowledged");
    expect(ADDENDUM_DAY_HELD_TEXT).toMatch(/opening officers/);
  });
  it("an addendum item whose key is not addendum:<n> reads as not acknowledged rather than guessing a number", () => {
    const odd: ChecklistItem = { key: "addendum:one", label: "Addendum", source: "ADDENDUM" };
    expect(online({ items: [odd], acknowledgements: new Map([[1, "2026-11-13"]]) })[0]).toMatchObject({ kind: "ADDENDUM", acknowledgedOn: null });
  });
  it("cells come back one per item, in the checklist's order", () => {
    expect(online({ items: [ADD1, SAR, FOT] }).map((c) => c.itemKey)).toEqual(["addendum:1", "SAR", "FOT"]);
  });
});

describe("cellAnswerFaults: Present needs a file received (20cv)", () => {
  const cell = (kind: CellKind): CellFacts => ({ itemKey: "k", kind, fileIds: [], acknowledgedOn: null });
  it("online, Present on NOT_RECEIVED is refused; Absent and Not applicable stay the officers' judgement", () => {
    expect(cellAnswerFaults(cell("NOT_RECEIVED"), "PRESENT")).toEqual([{ code: "NO_FILE_RECEIVED", level: "block" }]);
    expect(cellAnswerFaults(cell("NOT_RECEIVED"), "ABSENT")).toEqual([]);
    expect(cellAnswerFaults(cell("NOT_RECEIVED"), "NOT_APPLICABLE")).toEqual([]);
  });
  it("paper and every other kind: no fault for any answer", () => {
    for (const kind of ["PAPER", "CHECK_FILES", "RECEIVED_NOT_CHECKED", "ADDENDUM"] as const) for (const a of CHECKLIST_ANSWERS) expect(cellAnswerFaults(cell(kind), a)).toEqual([]);
  });
  it("paper is never refused: a paper column has no NOT_RECEIVED cell to refuse", () => {
    const cells = cellFacts({ online: false, items: [FOT, SAR], packParts, rules: frozen, files: [], acknowledgements: new Map() });
    expect(cells.flatMap((c) => cellAnswerFaults(c, "PRESENT"))).toEqual([]);
  });
});

describe("columnTally and tallyText", () => {
  const t = (present: number, absent: number, notApplicable: number, unanswered: number): ColumnTally => ({ present, absent, notApplicable, unanswered, total: present + absent + notApplicable + unanswered });
  it("counts each answer against the checklist's own items; an answer to a key not on it is not counted", () => {
    const answers = new Map<string, ChecklistAnswer>([["FOT", "PRESENT"], ["SAR", "NOT_APPLICABLE"], ["OLD", "ABSENT"]]);
    expect(columnTally([FOT, SAR, ADD1], answers)).toEqual({ present: 1, absent: 0, notApplicable: 1, unanswered: 1, total: 3 });
  });
  it("the plan's examples, literally", () => {
    expect(tallyText(t(3, 0, 0, 0))).toBe("3 of 3 present");
    expect(tallyText(t(2, 1, 0, 0))).toBe("2 of 3 present · 1 absent");
    expect(tallyText(t(0, 0, 0, 1))).toBe("1 not answered");
    // "1 of 3 not applicable" as the lead of a column whose other two items are not answered yet.
    expect(tallyText(t(0, 0, 1, 2))).toBe("1 of 3 not applicable · 2 not answered");
  });
  it("each mix: the first answered count says 'of' the total, the rest do not, and 'not answered' never does", () => {
    expect(tallyText(t(0, 3, 0, 0))).toBe("3 of 3 absent");
    expect(tallyText(t(1, 1, 1, 0))).toBe("1 of 3 present · 1 absent · 1 not applicable");
    expect(tallyText(t(0, 2, 1, 0))).toBe("2 of 3 absent · 1 not applicable");
    expect(tallyText(t(2, 0, 0, 1))).toBe("2 of 3 present · 1 not answered");
    expect(tallyText(t(0, 0, 0, 3))).toBe("3 not answered");
  });
  it("an empty checklist says so rather than a blank or a zero count", () => {
    expect(tallyText(columnTally([], new Map()))).toBe(EMPTY_TALLY_TEXT);
  });
  it("property: for every tally of up to five items, the counts in the words add up to the total", () => {
    for (let total = 1; total <= 5; total++)
      for (let p = 0; p <= total; p++)
        for (let a = 0; a <= total - p; a++)
          for (let n = 0; n <= total - p - a; n++) {
            const text = tallyText(t(p, a, n, total - p - a - n));
            const counts = [...text.matchAll(/(?:^|· )(\d+)/g)].map((m) => Number(m[1]));
            expect(counts.reduce((x, y) => x + y, 0)).toBe(total);
          }
  });
});

describe("the overclaim scan: no tally or cell word says Pass, Fail or Lulus (plan §1.1, step 2)", () => {
  const forbidden = [/\bpass/i, /\bfail/i, /lulus/i, /gagal/i];
  it("tallyText, over every tally of up to five items", () => {
    for (let total = 0; total <= 5; total++)
      for (let p = 0; p <= total; p++)
        for (let a = 0; a <= total - p; a++)
          for (let n = 0; n <= total - p - a; n++) {
            const text = tallyText({ present: p, absent: a, notApplicable: n, unanswered: total - p - a - n, total });
            for (const re of forbidden) expect(text).not.toMatch(re);
          }
  });
  it("CELL_WORDS, the addendum lines and the held line", () => {
    for (const w of [...Object.values(CELL_WORDS), addendumCellText("2026-11-13"), addendumCellText(null), ADDENDUM_DAY_HELD_TEXT, EMPTY_TALLY_TEXT]) for (const re of forbidden) expect(w).not.toMatch(re);
  });
  it("the scan itself catches the word", () => {
    expect(forbidden.some((re) => re.test("3 of 3 Pass"))).toBe(true);
    expect(forbidden.some((re) => re.test("Lulus"))).toBe(true);
  });
});

describe("confirmationStands: the current reading and the current column revision (ruling 22, 20cp, §1.3)", () => {
  it("paper: a confirmation on the current reading and revision stands; one before a correction or before a column change does not", () => {
    const bid = { asReadCorrections: 1, columnRevision: 2 };
    expect(confirmationStands(false, bid, { correctionNo: 1, columnRevision: 2 })).toBe(true);
    expect(confirmationStands(false, bid, { correctionNo: 0, columnRevision: 2 })).toBe(false);
    // The decision was cleared and recorded again after this paper initial: it must not count (both channels, 20cp).
    expect(confirmationStands(false, bid, { correctionNo: 1, columnRevision: 1 })).toBe(false);
  });
  it("paper rows from before the revision existed stand at revision 0 until the column next changes", () => {
    expect(confirmationStands(false, { asReadCorrections: 0, columnRevision: 0 }, { correctionNo: 0, columnRevision: 0 })).toBe(true);
    expect(confirmationStands(false, { asReadCorrections: 0, columnRevision: 1 }, { correctionNo: 0, columnRevision: 0 })).toBe(false);
  });
  it("online: the reading and the revision both decide", () => {
    const bid = { asReadCorrections: 0, columnRevision: 4 };
    expect(confirmationStands(true, bid, { correctionNo: 0, columnRevision: 4 })).toBe(true);
    expect(confirmationStands(true, bid, { correctionNo: 0, columnRevision: 3 })).toBe(false);
    expect(confirmationStands(true, { asReadCorrections: 1, columnRevision: 4 }, { correctionNo: 0, columnRevision: 4 })).toBe(false);
  });
  it("standingConfirmations keeps the standing ones, with their own fields, in order", () => {
    const cs = [{ personId: "a", correctionNo: 0, columnRevision: 2, extra: 1 }, { personId: "b", correctionNo: 0, columnRevision: 1, extra: 2 }, { personId: "c", correctionNo: 0, columnRevision: 2, extra: 3 }];
    expect(standingConfirmations(true, { asReadCorrections: 0, columnRevision: 2 }, cs).map((c) => [c.personId, c.extra])).toEqual([["a", 1], ["c", 3]]);
    expect(standingConfirmations(false, { asReadCorrections: 0, columnRevision: 2 }, cs).map((c) => c.personId)).toEqual(["a", "c"]);
  });
});

describe("columnStatus through its four states", () => {
  const officers = [{ personId: "aminah", name: "Aminah" }, { personId: "badrul", name: "Badrul" }];
  const bid = { asReadCorrections: 0, columnRevision: 5 };
  const done: ColumnTally = { present: 2, absent: 0, notApplicable: 0, unanswered: 0, total: 2 };
  const c = (personId: string, columnRevision: number) => ({ personId, correctionNo: 0, columnRevision });
  it("ANSWERING while any item is unanswered, even with a decision and confirmations", () => {
    expect(columnStatus({ online: true, tally: { ...done, present: 1, unanswered: 1 }, verdict: "PASS", bid, officers, confirmations: [c("aminah", 5), c("badrul", 5)] }).status).toBe("ANSWERING");
  });
  it("AWAITING_DECISION once answered with no decision", () => {
    expect(columnStatus({ online: true, tally: done, verdict: null, bid, officers, confirmations: [] }).status).toBe("AWAITING_DECISION");
  });
  it("AWAITING_CONFIRMATION with a stale confirmation: the officer is listed as stale, not confirmed and not awaiting", () => {
    const r = columnStatus({ online: true, tally: done, verdict: "REJECT", bid, officers, confirmations: [c("aminah", 4)] });
    expect(r).toEqual({ status: "AWAITING_CONFIRMATION", confirmed: [], stale: [{ personId: "aminah", name: "Aminah" }], awaiting: [{ personId: "badrul", name: "Badrul" }] });
  });
  it("CONFIRMED when every named officer's confirmation stands; a stale one beside a standing one counts as confirmed", () => {
    const r = columnStatus({ online: false, tally: done, verdict: "PASS", bid, officers, confirmations: [c("aminah", 4), c("aminah", 5), c("badrul", 5)] });
    expect(r.status).toBe("CONFIRMED");
    expect(r.confirmed.map((o) => o.name)).toEqual(["Aminah", "Badrul"]);
    expect(r.stale).toEqual([]);
  });
  it("a confirmation by someone not named is ignored, and a duplicated officer is listed once", () => {
    const r = columnStatus({ online: true, tally: done, verdict: "PASS", bid, officers: [...officers, officers[0]], confirmations: [c("stranger", 5), c("aminah", 5)] });
    expect(r).toEqual({ status: "AWAITING_CONFIRMATION", confirmed: [{ personId: "aminah", name: "Aminah" }], stale: [], awaiting: [{ personId: "badrul", name: "Badrul" }] });
  });
  it("with no named officer the column is never CONFIRMED: an empty panel is a gap, not a decision that stands", () => {
    expect(columnStatus({ online: true, tally: done, verdict: "PASS", bid, officers: [], confirmations: [c("aminah", 5)] }).status).toBe("AWAITING_CONFIRMATION");
  });
  it("property: every officer is in exactly one of confirmed, stale and awaiting", () => {
    const revs = [null, 4, 5] as const;
    for (const ra of revs)
      for (const rb of revs) {
        const confirmations = [...(ra === null ? [] : [c("aminah", ra)]), ...(rb === null ? [] : [c("badrul", rb)])];
        const r = columnStatus({ online: true, tally: done, verdict: "PASS", bid, officers, confirmations });
        const all = [...r.confirmed, ...r.stale, ...r.awaiting].map((o) => o.personId).sort();
        expect(all).toEqual(["aminah", "badrul"]);
        expect(r.status === "CONFIRMED").toBe(ra === 5 && rb === 5);
      }
  });
});

describe("matrixActorFaults: only the named officers, each for themselves (ruling 22, 3c-Q3, 20cp)", () => {
  const officers = ["aminah", "badrul"];
  const codes = (over: Partial<Parameters<typeof matrixActorFaults>[0]>) =>
    matrixActorFaults({ online: true, act: "ANSWER", administrator: false, actorPersonId: "aminah", subjectPersonId: "aminah", officers, ...over }).map((f) => f.code);
  it("a named officer acting for themselves: no fault, on both channels, for every act", () => {
    for (const on of [true, false]) for (const act of ["ANSWER", "DECIDE", "CONFIRM"] as const) expect(codes({ online: on, act })).toEqual([]);
  });
  it("an administrator is refused, even one who is also named, and on both channels", () => {
    expect(codes({ administrator: true })).toEqual(["ADMINISTRATOR"]);
    expect(codes({ administrator: true, online: false, act: "CONFIRM" })).toEqual(["ADMINISTRATOR"]);
  });
  it("a person not named is refused, on both channels", () => {
    for (const on of [true, false]) for (const act of ["ANSWER", "DECIDE", "CONFIRM"] as const) expect(codes({ online: on, act, actorPersonId: "clerk", subjectPersonId: "clerk" })).toEqual(["NOT_A_NAMED_OFFICER"]);
  });
  it("on behalf: refused online for every act, and on paper for answers and decisions", () => {
    for (const act of ["ANSWER", "DECIDE", "CONFIRM"] as const) expect(codes({ online: true, act, subjectPersonId: "badrul" })).toEqual(["NOT_OWN_ACT"]);
    for (const act of ["ANSWER", "DECIDE"] as const) expect(codes({ online: false, act, subjectPersonId: "badrul" })).toEqual(["NOT_OWN_ACT"]);
  });
  it("20cp: a paper confirmation recorded by one present panel member for another is allowed", () => {
    expect(codes({ online: false, act: "CONFIRM", actorPersonId: "aminah", subjectPersonId: "badrul" })).toEqual([]);
  });
  it("20cp: a paper confirmation recorded on behalf by someone who is not a present panel member is refused, as is one for a person not named", () => {
    expect(codes({ online: false, act: "CONFIRM", actorPersonId: "clerk", subjectPersonId: "badrul" })).toEqual(["NOT_A_NAMED_OFFICER"]);
    expect(codes({ online: false, act: "CONFIRM", actorPersonId: "aminah", subjectPersonId: "stranger" })).toEqual(["NOT_A_NAMED_OFFICER"]);
  });
  it("faults accumulate, and NOT_A_NAMED_OFFICER is said once", () => {
    expect(codes({ administrator: true, actorPersonId: "admin", subjectPersonId: "stranger" })).toEqual(["ADMINISTRATOR", "NOT_A_NAMED_OFFICER", "NOT_OWN_ACT"]);
  });
});

describe("confirmFaults: an officer confirms a complete column", () => {
  const tally = (unanswered: number): ColumnTally => ({ present: 2 - unanswered, absent: 0, notApplicable: 0, unanswered, total: 2 });
  it("refused while any item is unanswered, or no decision is recorded; both are said", () => {
    expect(confirmFaults({ tally: tally(1), verdict: "PASS" })).toEqual([{ code: "COLUMN_NOT_ANSWERED", level: "block", data: { count: 1 } }]);
    expect(confirmFaults({ tally: tally(0), verdict: null }).map((f) => f.code)).toEqual(["DECISION_NOT_RECORDED"]);
    expect(confirmFaults({ tally: tally(2), verdict: null }).map((f) => f.code)).toEqual(["COLUMN_NOT_ANSWERED", "DECISION_NOT_RECORDED"]);
  });
  it("a complete column with a decision, Pass or Reject, has no fault", () => {
    expect(confirmFaults({ tally: tally(0), verdict: "PASS" })).toEqual([]);
    expect(confirmFaults({ tally: tally(0), verdict: "REJECT" })).toEqual([]);
  });
});

describe("words: no code reaches a screen", () => {
  it("every matrix fault has its own sentence, and the opening's words read it", () => {
    for (const [code, text] of Object.entries(MATRIX_FAULT_TEXT)) {
      expect(text).not.toMatch(/\b[A-Z]{3,}_[A-Z_]+\b/);
      expect(text.length).toBeGreaterThan(20);
      if (code !== "ADMINISTRATOR") expect(openingFindingText({ code, level: "block" })).toBe(text);
    }
  });
  it("every cell kind has words, none of them a code", () => {
    for (const k of ["PAPER", "CHECK_FILES", "RECEIVED_NOT_CHECKED", "NOT_RECEIVED", "ADDENDUM"] as const) {
      expect(CELL_WORDS[k]).not.toMatch(/\b[A-Z]{3,}_[A-Z_]+\b/);
      expect(CELL_WORDS[k].length).toBeGreaterThan(10);
    }
  });
});

describe("COLUMN_STATUS_TEXT (step 5)", () => {
  it("has words for every status and never says passed or approved", async () => {
    const { COLUMN_STATUS_TEXT } = await import("./matrix");
    expect(Object.keys(COLUMN_STATUS_TEXT).sort()).toEqual(["ANSWERING", "AWAITING_CONFIRMATION", "AWAITING_DECISION", "CONFIRMED"]);
    for (const t of Object.values(COLUMN_STATUS_TEXT)) expect(t).not.toMatch(/\b(?:pass(?:ed)?|approved|signed)\b/i);
  });
});

describe("the column a confirmation or a decision is bound to (security audit, ruling 22)", () => {
  const get = (o: Record<string, unknown[]>) => (n: string) => o[n] ?? [];
  it("parses each field once as a whole number, and says which is missing or wrong", () => {
    expect(parseColumnBinding(get({ columnRevision: ["3"], asReadCorrections: ["0"] }))).toEqual({ ok: true, value: { columnRevision: 3, asReadCorrections: 0 } });
    expect(parseColumnBinding(get({}))).toMatchObject({ ok: false, fields: { columnRevision: expect.any(String), asReadCorrections: expect.any(String) } });
    expect(parseColumnBinding(get({ columnRevision: ["3", "4"], asReadCorrections: ["-1"] }))).toMatchObject({ ok: false, fields: { columnRevision: "Send this field once.", asReadCorrections: "Not a valid number." } });
    expect(parseColumnBinding(get({ columnRevision: ["03"], asReadCorrections: [3] }))).toMatchObject({ ok: false });
  });
  it("is a fault when either the revision or the as-read corrections differ from the column now, and none when both match", () => {
    const now = { columnRevision: 5, asReadCorrections: 1 };
    expect(columnBindingFaults({ seen: now, current: now })).toEqual([]);
    expect(columnBindingFaults({ seen: { ...now, columnRevision: 4 }, current: now }).map((f) => f.code)).toEqual(["COLUMN_CHANGED"]);
    expect(columnBindingFaults({ seen: { ...now, asReadCorrections: 0 }, current: now }).map((f) => f.code)).toEqual(["COLUMN_CHANGED"]);
    // The refusal opens with "Nothing was saved:" itself, so the sentence does not say it again.
    expect(MATRIX_FAULT_TEXT.COLUMN_CHANGED).not.toMatch(/Nothing was saved/);
    expect(MATRIX_FAULT_TEXT.COLUMN_CHANGED).toMatch(/Reload/);
  });
});
