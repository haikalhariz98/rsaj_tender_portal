import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

import type { Cell } from "@/components/data-list";
import { sortKeyOf, sulitCell, sulitText } from "@/components/sulit-cell";
import { historyAmount } from "@/lib/committee/matter-history";
import { matterAmountScope } from "@/lib/committee/matter-amount";
import { MATTER_KINDS } from "@/lib/committee/labels";
import { awardFindingText, awardFindingTextFor, findingsForReader, RECOMMENDATION_CLOSED_TEXT } from "@/lib/award/labels";
import { scopeOfOwner } from "@/lib/documents/owner-scope";
import { OWNER_KINDS } from "@/lib/documents/types";
import { RECOMMENDATION_FIELDS } from "@/lib/evaluation/recommendation-fields";
import { SULIT_FIELDS } from "@/lib/sulit-fields";

import { sulitGranted, sulitWithheld } from "./sulit-access";
import { sulitHistoryValue } from "./sulit-history";

/**
 * The rollout of the SULIT rule across the modules (Phase 3b), as small pure checks and as scans of the source. The scans match on the path with `/` whatever the platform,
 * so they hold on a developer's Windows machine as on the Linux suite.
 */

const granted = sulitGranted(true as const, "ORGANISATION_PERMISSION");
const withheld = sulitWithheld<true>("NOT_NAMED_PERMISSION_UNDECIDED", "requisition");

describe("a registered field's change in a trail (sulitHistoryValue)", () => {
  it("is null for a field that is not registered: the trail draws it as it always did", () => {
    expect(sulitHistoryValue("subject", "requisition", granted, "x")).toBeNull();
  });
  it("is the text, with the gate's basis, for a registered field the page's record carries, where the gate is granted", () => {
    expect(sulitHistoryValue("estimatedValue", "requisition", granted, "RM 5.00")).toEqual({ state: "GRANTED", value: "RM 5.00", basis: "ORGANISATION_PERMISSION" });
  });
  it("is withheld, carrying no text, where the gate is withheld", () => {
    const s = sulitHistoryValue("estimatedValue", "requisition", withheld, "RM 5.00")!;
    expect(s.state).toBe("WITHHELD");
    expect(JSON.stringify(s)).not.toContain("RM 5.00");
  });
  it("is withheld for a registered field the page's record does not carry, even when its gate is granted: nothing is shown on a guess", () => {
    const s = sulitHistoryValue("score", "requisition", granted, "88.50")!;
    expect(s.state).toBe("WITHHELD");
    expect(JSON.stringify(s)).not.toContain("88.50");
  });
});

describe("a matter's amount in a sitting's History (historyAmount)", () => {
  const base = { entity: "CommitteeDecision", entityId: "d1", known: true, text: "RM 9.00" };
  it("is not an amount: null", () => {
    expect(historyAmount({ ...base, field: "subject", gate: null })).toBeNull();
  });
  it("is held to the matter's gate where the matter's kind makes its amount SULIT", () => {
    expect(historyAmount({ ...base, field: "amount", gate: granted })).toEqual({ sulit: { state: "GRANTED", value: "RM 9.00", basis: "ORGANISATION_PERMISSION" } });
    const w = historyAmount({ ...base, field: "amount", gate: withheld })!;
    expect(w.sulit?.state).toBe("WITHHELD");
    expect(JSON.stringify(w)).not.toContain("RM 9.00");
  });
  it("is the text as it is for a matter whose amount is not SULIT (no gate)", () => {
    expect(historyAmount({ ...base, field: "amount", gate: null })).toEqual({ text: "RM 9.00" });
  });
  it("is withheld for a row about a matter this sitting no longer holds, and for an amount on another kind of record", () => {
    for (const odd of [{ known: false }, { entity: "Vote" }]) {
      const w = historyAmount({ ...base, ...odd, field: "amount", gate: null })!;
      expect(w.sulit?.state).toBe("WITHHELD");
      expect(JSON.stringify(w)).not.toContain("RM 9.00");
    }
  });
});

describe("whose figure a matter's amount is (matterAmountScope)", () => {
  it("a requisition's gate matter is the requisition's; a contract, variation or certificate matter the contract's; the awarded value is no one's", () => {
    expect(matterAmountScope("REQUISITION")).toBe("requisition");
    for (const k of ["CONTRACT", "VARIATION", "CERTIFICATE"] as const) expect(matterAmountScope(k)).toBe("contract");
    expect(matterAmountScope("EXERCISE")).toBeNull();
  });
  it("a manual matter and a kind not decided are read as SULIT, never as open", () => {
    expect(matterAmountScope(null)).toBe("requisition");
    expect(matterAmountScope("LATE_TENDER")).toBe("requisition");
  });
  it("every kind has an answer, and a kind that is not SULIT has none", () => {
    for (const k of MATTER_KINDS) expect(["requisition", "contract", null]).toContain(matterAmountScope(k));
    for (const k of ["SCOPE", "EVALUATION_STAGE", "SUPPLIER"] as const) expect(matterAmountScope(k)).toBeNull();
  });
});

describe("whose record judges a document's bytes (scopeOfOwner)", () => {
  it("an exercise's papers by the exercise, an evaluation's by the evaluation, a supplier's, a contract's and the rest by the permission alone", () => {
    expect(scopeOfOwner("bqVersion", "ex1")).toBe("exercise");
    expect(scopeOfOwner("award", "ex1")).toBe("exercise");
    expect(scopeOfOwner("evaluationBidder", "ex1")).toBe("evaluation");
    expect(scopeOfOwner("supplierDocument", null)).toBe("supplier");
    expect(scopeOfOwner("standingEvent", null)).toBe("supplier");
    expect(scopeOfOwner("contract", null)).toBe("contract");
    expect(scopeOfOwner("eotClaim", null)).toBe("contract");
    expect(scopeOfOwner("meeting", null)).toBe("requisition");
    expect(scopeOfOwner("delegation", null)).toBe("requisition");
  });
  it("every owner kind has a scope the document-bytes field is carried on", () => {
    const f = SULIT_FIELDS.find((x) => x.field === "documentBytes")!;
    const carried = new Set([f.scope, ...(f.alsoIn ?? [])]);
    for (const k of OWNER_KINDS) {
      expect(carried.has(scopeOfOwner(k, null)), k).toBe(true);
      expect(carried.has(scopeOfOwner(k, "some-exercise")), k).toBe(true);
    }
  });
});

describe("a Sulit value as a list cell", () => {
  const money = (v: string): Cell => ({ kind: "text", text: v });
  it("is the cell the value makes where granted, and 'SULIT · withheld' with the reason where not, carrying no figure", () => {
    expect(sulitCell(sulitGranted("RM 1.00", "NAMED_ON_RECORD"), money)).toEqual({ kind: "text", text: "RM 1.00" });
    const c = sulitCell(sulitWithheld<string>("NOT_NAMED_PERMISSION_UNDECIDED", "exercise"), money);
    expect(c.kind).toBe("withheld");
    expect(JSON.stringify(c)).not.toContain("1.00");
  });
  it("sulitText is a text cell where granted", () => {
    expect(sulitText(sulitGranted("RM 2.00", "NAMED_ON_RECORD"))).toMatchObject({ kind: "text", text: "RM 2.00" });
    expect(sulitText(sulitWithheld<string>("ADMINISTRATOR", "exercise")).kind).toBe("withheld");
  });
  it("gives a sort key only where the value is shown, or the order would give a withheld figure away", () => {
    expect(sortKeyOf(sulitGranted(5, "NAMED_ON_RECORD"))).toBe(5);
    expect(sortKeyOf(sulitWithheld<number>("ADMINISTRATOR", "exercise"))).toBeUndefined();
  });
});

describe("the award's findings that quote the department estimate", () => {
  const exceeds = { code: "EXCEEDS_APPROVED_VALUE", level: "block" as const, data: { approved: "RM 900,000.00", together: "RM 1,200,000.00", others: 1 } };
  const above = { code: "ABOVE_ESTIMATE", level: "warn" as const, data: { estimate: "RM 480,000.00", difference: "RM 20,000.00" } };
  it("name the figures for a reader who may read them", () => {
    expect(awardFindingTextFor(exceeds, true)).toContain("RM 900,000.00");
    expect(awardFindingTextFor(above, true)).toContain("RM 480,000.00");
    expect(awardFindingTextFor(above, true)).toBe(awardFindingText(above));
  });
  it("say what is wrong without a figure for one who may not", () => {
    for (const f of [exceeds, above]) {
      const t = awardFindingTextFor(f, false);
      expect(t, f.code).not.toMatch(/RM\s?\d/);
      expect(t.length).toBeGreaterThan(40);
    }
  });
  it("leave every other finding as it was", () => {
    const other = { code: "VALUE_NOT_POSITIVE", level: "block" as const };
    expect(awardFindingTextFor(other, false)).toBe(awardFindingText(other));
  });
});

// ------------------------------------------------------------------ the scans

const root = process.cwd();
const posix = (p: string) => p.split(sep).join("/");
function sources(dir: string, pattern: RegExp): string[] {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const p = join(dir, name);
    const full = join(root, p);
    if (statSync(full).isDirectory()) return name === "generated" || name === "node_modules" ? [] : sources(p, pattern);
    return pattern.test(name) ? [posix(p)] : [];
  });
}
const SRC = [...sources("src", /\.(ts|tsx)$/), ...sources("prisma", /\.(ts|prisma)$/).filter((f) => !f.includes("/migrations/"))].filter((f) => !/\.test\.(ts|tsx)$/.test(f));
const read = (f: string) => readFileSync(join(root, f), "utf8");

describe("nothing in the source says a SULIT value is not restricted, or draws one that nothing judged", () => {
  it("no screen draws the children form of SulitValue", () => {
    const bad = SRC.filter((f) => f.endsWith(".tsx") && /<SulitValue>/.test(read(f)));
    expect(bad).toEqual([]);
  });
  it("the constants that said 'not restricted until sign-in' are gone", () => {
    const retired = /\b(VALUE_SULIT_LABEL|SULIT_PRICE_CHIP|SULIT_CHIP|NOT_RESTRICTED_CHIP|EPAYMENT_SULIT_CHIP)\b/;
    expect(SRC.filter((f) => retired.test(read(f)))).toEqual([]);
  });
  it("no sentence, comment included, pairs SULIT with 'until sign-in' or 'not restricted' (the schema's comments flow into the generated client)", () => {
    const bad: string[] = [];
    for (const f of SRC) {
      read(f).split("\n").forEach((line, i) => {
        if (/SULIT/.test(line) && /until sign-in|not restricted until|not downloadable until/i.test(line)) bad.push(`${f}:${i + 1}`);
        if (/not restricted until sign-in/i.test(line)) bad.push(`${f}:${i + 1}`);
      });
    }
    expect(bad).toEqual([]);
  });
});

describe("the evaluation's content is built only for a reader it is open to", () => {
  const read2 = read("src/lib/evaluation/read.ts");
  it("the detail is built in the granted branch alone", () => {
    expect(read2).toMatch(/detail: gate\.state === "GRANTED" \? sulitGranted\(await detailOf\(\), gate\.basis\) : gate,/);
    expect(read2.match(/detailOf\(\)/g)?.length).toBe(1);
  });
  it("the tab asks the evaluation's gate before it asks for the view, and every evaluation act asks the write rule", () => {
    const ws = read("src/app/sourcing/[id]/evaluation/workspace.tsx");
    expect(ws.indexOf("sulitGate(actor")).toBeGreaterThan(-1);
    expect(ws.indexOf("sulitGate(actor")).toBeLessThan(ws.indexOf("evaluationTabView("));
    expect(read("src/app/sourcing/[id]/evaluation/shared.ts")).toMatch(/sulitWriteRefusal\(tx, actor, \{ scope: "evaluation"/);
  });
});

describe("the writes that change what a reader may not read ask the write rule", () => {
  const mustAsk: [string, RegExp][] = [
    ["src/app/sourcing/[id]/opening/actions.ts", /prices: actor/],
    ["src/app/sourcing/[id]/scope/actions.ts", /bq: actor/],
    ["src/app/requisitions/actions.ts", /sulitWriteRefusal\(tx, actor, \{ scope: "requisition"/],
    ["src/app/awards/actions.ts", /sulitWriteRefusal\(tx, actor, \{ scope: "exercise", exerciseId: a\.exerciseId \}, \["icNumber"\]\)/],
    ["src/app/suppliers/actions.ts", /sulitWriteRefusal\(tx, actor, \{ scope: "supplier"/],
    ["src/app/projects/[id]/actions.ts", /sulitWriteRefusal\(c\.tx, actor, \{ scope: "contract"/],
    ["src/app/projects/[id]/actions.ts", /Nothing was removed: this is SULIT and is closed to you/],
    ["src/app/committees/actions.ts", /sulitWriteRefusal\(tx, input\.typedBy, \{ scope: "requisition"/],
  ];
  for (const [file, pattern] of mustAsk) it(file, () => expect(read(file)).toMatch(pattern));

  // Review of Phase 3b: taking a priced line off changes the SULIT total as adding one does, so the deletions ask as the additions do.
  it("every bill of quantities act that changes a priced line, deleting included, passes the reader to the exercise lock", () => {
    const actions = read("src/app/sourcing/[id]/scope/actions.ts");
    for (const fn of ["saveBqItem", "removeBqItem", "removeBqSection", "finaliseBq", "importBqCsv"]) {
      const body = actions.slice(actions.indexOf(`export async function ${fn}(`)).split(/\nexport async function /)[0];
      expect(body, fn).toMatch(/\{ bq: actor \}/);
    }
  });
  it("the contract's check does not offer to take off a line to a reader the working is withheld from", () => {
    const panels = read("src/app/projects/[id]/formation-panels.tsx");
    expect(panels.match(/<RemoveLineDrawer /g)).toHaveLength(2);
    expect(panels.match(/sulit\.state === "GRANTED" && <RemoveLineDrawer /g)).toHaveLength(2);
  });
});

describe("the history action returns configuration only (review of Phase 3b)", () => {
  const history = read("src/app/configuration/history.ts");
  const entities = history.slice(history.indexOf("const ENTITIES = new Set(["), history.indexOf("]);", history.indexOf("const ENTITIES = new Set([")));
  it("a committee decision and a requisition, whose trails hold the matter's amount and the estimate, are not on the set", () => {
    expect(entities).not.toMatch(/"CommitteeDecision"|"Requisition"/);
  });
  it("what it does return is withheld by the registered field of that entity, as the audit export does, and not by the bare field name", () => {
    expect(history).toMatch(/sulitFieldOf\(r\.entity, c\.field\)/);
    expect(history).not.toMatch(/isSulitField\(/);
  });
});

describe("a document is attached only by someone who may already open it (OD-2, review of Phase 3b)", () => {
  it("both ways a version gets a new owner by a reader's naming it ask, before anything is written, and read as a document that is not there", () => {
    const docs = read("src/app/documents/actions.ts");
    const attach = docs.slice(docs.indexOf("export async function attachDocument("));
    expect(attach.indexOf("sulitAttachRefused(tx, actor, doc.id)")).toBeGreaterThan(-1);
    expect(attach.indexOf("sulitAttachRefused(tx, actor, doc.id)")).toBeLessThan(attach.indexOf("documentAttachment.create"));
    expect(attach).toMatch(/hiddenExerciseOfDocument\(doc\.id/);
    const users = read("src/app/configuration/users/core.ts");
    expect(users).toMatch(/recommendationRefused\(actor, recommendationVersionId\)/);
    expect(users).toMatch(/sulitAttachRefused\(db, actor, v\.documentId\)/);
  });
  it("no other app source writes an attachment: the rest carry a part's own files forward, or attach the file the same act just uploaded (the loaders in prisma/ are not a reader)", () => {
    const creators = SRC.filter((f) => f.startsWith("src/") && /documentAttachment\.create\(/.test(read(f))).sort();
    expect(creators).toEqual(
      [
        "src/app/configuration/users/core.ts",
        "src/app/documents/actions.ts",
        "src/app/sourcing/[id]/documents/actions.ts",
        "src/app/sourcing/[id]/scope/actions.ts",
        // Wave 3b step 15 (ADR 0036 D10): the mover attaches the file it has just stored, in that store's own transaction, to the online bid file it came from. No officer attaches: the owner is
        // the sealed file the opening finalised, and the document is SULIT, judged by the exercise it hangs on (`hidden.ts`, `owner-scope.ts`).
        "src/lib/sealing/online-file-mover.ts",
        // Changed for Phase 4b: a signed-in supplier attaches the file its own upload just stored (to its draft, or as its bank statement) in the upload's transaction, and sending the registration moves
        // those same versions onto the supplier's documents. Both are the supplier's own files: no officer attaches, and the documents' bytes are judged by the records they then hang on.
        "src/lib/portal/registration/submit-store.ts",
        "src/lib/portal/registration/upload-store.ts",
        // Changed for Phase 4c: a registered supplier attaches the file its own upload just stored, in that upload's transaction: a replacement document to the document it lodges
        // (`replace-store.ts`), and a bank statement to the new version of its bank details (`bank-store.ts`). Both are the supplier's own files, as above.
        "src/lib/portal/company/bank-store.ts",
        "src/lib/portal/company/replace-store.ts",
      ].sort(),
    );
  });
  it("a document's grant is judged by the records it hangs on now: a detached attachment is not one", () => {
    expect(read("src/lib/documents/entitlement.ts")).toMatch(/where: \{ version: \{ documentId \}, detachedAt: null \}/);
  });
});

describe("a page that shows a record's figures names them, and a field read on one path is named by that path", () => {
  it("no page asks the whole of a scope for a field it does not show: the contextual fields are in no scope's list", () => {
    const contextual = SULIT_FIELDS.filter((f) => f.contextual).map((f) => f.field).sort();
    expect(contextual).toEqual(["bidderIdentity", "documentBytes", "icNumber", "matterAmount", "waitingValue"]);
  });
  it("every screen that asks for a scope's whole list is one that shows those figures: the requisition, contract, supplier and evaluation pages and their prints", () => {
    const users = SRC.filter((f) => /fieldsOfScope\(/.test(read(f)) && !f.endsWith("sulit-fields.ts")).sort();
    expect(users).toEqual(
      [
        // Changed for Phase 4b: a supplier's creditor profile has its own scope, and the creditor tab shows the whole of it at once, so it asks for the scope's whole list through the one
        // module that judges it (`creditor-access-store.ts`), like the other pages that show a record's figures.
        "src/lib/auth/creditor-access-store.ts",
        "src/app/projects/[id]/certificates/[certId]/page.tsx",
        "src/app/projects/[id]/page.tsx",
        "src/app/requisitions/[id]/edit/page.tsx",
        "src/app/requisitions/[id]/page.tsx",
        "src/app/requisitions/[id]/pr.pdf/route.ts",
        "src/app/sourcing/[id]/evaluation/proposal/page.tsx",
        "src/app/sourcing/[id]/evaluation/report/page.tsx",
        "src/app/sourcing/[id]/evaluation/shared.ts",
        "src/app/sourcing/[id]/evaluation/workspace.tsx",
      ].sort(),
    );
    expect(relative(root, join(root, "src")).length).toBeGreaterThan(0);
  });
});

describe("the award is judged against a recommendation that is SULIT (FR-EVL-014, Phase 3b review)", () => {
  const src = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
  it("the fields asked are registered evaluation fields", () => {
    for (const f of RECOMMENDATION_FIELDS) expect(SULIT_FIELDS.find((x) => x.field === f)?.scope).toBe("evaluation");
  });
  // Changed with the review of Phase 3b: the scan pinned two acts (create and update), which left the other two that judge the award against the recommendation, sending it for approval and
  // issuing it, to tell a refused reader how the awardee, value and period compare. All four ask now, through one helper, and each before it compares.
  it("all four award acts that judge the award against the recommendation refuse a reader it is closed to, before anything compares", () => {
    const actions = src("src/app/awards/actions.ts");
    expect([...actions.matchAll(/sulitWriteRefusal\(tx, actor, \{ scope: "evaluation", exerciseId \}, RECOMMENDATION_FIELDS\)/g)]).toHaveLength(1);
    const body = (fn: string) => actions.slice(actions.indexOf(`export async function ${fn}(`)).split(/\nexport async function /)[0];
    for (const [fn, compares] of [["createAward", "recommendationRefusal(evaluation,"], ["updateAwardDetails", "recommendationRefusal(evaluation,"], ["submitAward", "evaluateAward("], ["issueAward", "evaluateAward("]] as const) {
      const b = body(fn);
      expect(b, fn).toMatch(/recommendationClosed\(/);
      expect(b.indexOf("recommendationClosed("), fn).toBeLessThan(b.indexOf(compares));
    }
  });
  it("the page puts the comparison findings into one sentence for a reader the recommendation is closed to, whatever the list", () => {
    // C-2 (wave C step C5): the award page's composition moved to award-view.tsx, which /awards/[id] and the case page share; the scan reads it there.
    const page = src("src/app/projects/[id]/award/award-view.tsx");
    expect(page.match(/recommendation=\{recommendationShown\}/g)).toHaveLength(2);
    // The warnings (a value above the ceiling, a value or period that differs) are filtered and worded the same way.
    expect(page).toMatch(/findingsForReader\(ev\.valueFaults\.filter\(\(x\) => x\.level === "warn"\), recommendationShown\)/);
    expect(page).toMatch(/awardFindingTextFor\(x, sulit\.state === "GRANTED", recommendationShown\)/);
    expect(page).not.toMatch(/awardFindingTextFor\(x, sulit\.state === "GRANTED"\)/);
    const compare = [
      { code: "AWARDEE_NOT_RECOMMENDED", level: "block" },
      { code: "VALUE_DIFFERS_REASON_REQUIRED", level: "block" },
      { code: "VALUE_ABOVE_CEILING", level: "block" },
      { code: "EXCEEDS_APPROVED_VALUE", level: "block" },
    ] as never[];
    const closed = findingsForReader(compare, false);
    expect(closed.map((f: { code: string }) => f.code)).toEqual(["AWARDEE_NOT_RECOMMENDED", "EXCEEDS_APPROVED_VALUE"]);
    expect(awardFindingTextFor(closed[0], true, false)).toBe(RECOMMENDATION_CLOSED_TEXT);
    expect(RECOMMENDATION_CLOSED_TEXT).not.toMatch(/RM|\d/);
    expect(findingsForReader(compare, true)).toHaveLength(4);
    expect(awardFindingTextFor(compare[0], true, true)).toBe(awardFindingText(compare[0]));
  });
  it("the pages show the recommendation, and pre-fill from it, only when the gate is granted", () => {
    const open = src("src/app/awards/new/page.tsx");
    expect(open).toMatch(/sulitExerciseGate\(actor, ex\.id, "evaluation", RECOMMENDATION_FIELDS\)/);
    expect(open).not.toMatch(/evaluation\.recommended\.party|evaluation\.recommended\.price/);
    // C-2 (wave C step C5): the award page's composition moved to award-view.tsx, which /awards/[id] and the case page share; the scan reads it there.
    const page = src("src/app/projects/[id]/award/award-view.tsx");
    expect(page).toMatch(/recommendation = await sulitExerciseGate\(actor, award\.exerciseId, "evaluation", RECOMMENDATION_FIELDS\)/);
    expect(page).toMatch(/recommendation=\{recommendationShown \?/);
  });
});
