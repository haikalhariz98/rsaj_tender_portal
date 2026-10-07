import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { lex, spans } from "@/lib/scan/source";

/**
 * The two-person rules are held where they are written (ADR 0034 D15, Phase 2c; threat model F7 and B12). A source scan, in the manner of
 * `act-wiring-scan.test.ts`, so that a later editor cannot go round them:
 *
 * - every edit of a draft of the approval matrix makes its maker, after what it changed is written, and the exceptions are named with their reasons;
 * - issuing is asked of the makers under the draft's lock, after the password, and writes its issuer;
 * - each table a two-person change writes has one writer: the permission grants, the security policy, the change itself, the makers, and the administrator flag;
 * - a change's status is never written as a literal, only as a transition of the declared machine;
 * - the order of the locks: the organisation, then the change's row, then the account, then the Person, then what is read.
 */

const ROOT = process.cwd();
const walk = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "generated" || name === "node_modules") continue;
      walk(p, out);
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
};
const rel = (p: string) => path.relative(ROOT, p).split(path.sep).join("/");
const FILES = [...walk(path.join(ROOT, "src")), ...walk(path.join(ROOT, "prisma")), ...walk(path.join(ROOT, "scripts"))].map((p) => ({ file: rel(p), text: readFileSync(p, "utf8") }));
const SRC = FILES.filter((f) => f.file.startsWith("src/") && !f.file.startsWith("src/lib/test-db/") && !f.file.startsWith("src/lib/test-support/"));
const read = (file: string) => FILES.find((f) => f.file === file)!.text;

const MATRIX = "src/app/configuration/approval-matrix/actions.ts";
const STORE = "src/lib/auth/change-store.ts";

const fnBody = (file: string, name: string): string => {
  const text = read(file);
  const sp = spans(lex(text)).find((s) => s.name === name);
  if (!sp) throw new Error(`${file} has no ${name}`);
  return text.slice(sp.from, sp.to);
};
const exportsOf = (text: string) => [...text.matchAll(/^export async function (\w+)\(/gm)].map((m) => m[1]);

/// The marks of a source in the order they must come, each found after the one before; the index of each, -1 where one is missing.
function order(src: string, marks: string[]): number[] {
  const at: number[] = [];
  let from = 0;
  for (const m of marks) {
    const i = src.indexOf(m, from);
    at.push(i);
    if (i < 0) break;
    from = i + m.length;
  }
  return at;
}
const inOrder = (src: string, marks: string[]) => {
  const at = order(src, marks);
  expect(at.length === marks.length && at.every((x) => x > -1), `${marks.join(" | ")} -> ${at}`).toBe(true);
};

describe("every edit of a draft of the approval matrix makes its maker", () => {
  /// The exports of the matrix editor that are not an edit of one draft's content, each with its reason.
  const NOT_AN_EDIT: Readonly<Record<string, string>> = {
    issueDraft: "Issuing is its own act, signed with a password, and the issuer must not be a maker: it never makes one.",
    adoptDraft: "Adopting makes its maker in its own way: it refuses a draft that already has one, and writes its own audit row (it is checked below).",
    discardDraft: "A discarded draft is gone, and its makers with it: there is nothing left to be a maker of.",
    saveRejectionDestination: "Where a rejected matter goes is dated configuration of its own, not an edit of a draft; Phase 5 moves it onto the two-person change.",
    endRejectionDestination: "As saveRejectionDestination: dated configuration of its own, not an edit of a draft.",
  };
  const EDITS = exportsOf(read(MATRIX)).filter((n) => !NOT_AN_EDIT[n]);

  it("finds the edits, and every exception still exists with a reason", () => {
    expect(EDITS.length).toBeGreaterThanOrEqual(11);
    for (const [name, why] of Object.entries(NOT_AN_EDIT)) {
      expect(exportsOf(read(MATRIX)), name).toContain(name);
      expect(why.length, name).toBeGreaterThan(30);
    }
  });

  it("each calls noteMaker on the draft, after something is written in its transaction, so a refused edit makes nobody a maker", () => {
    const wrong: string[] = [];
    for (const name of EDITS) {
      const body = lex(fnBody(MATRIX, name));
      const note = body.indexOf("noteMaker(tx");
      const write = Math.min(...[".create(", ".update(", ".delete(", ".createMany(", "writeAudit("].map((w) => body.indexOf(w)).filter((i) => i > -1));
      if (note < 0) wrong.push(`${name}: never calls noteMaker`);
      else if (!(write < note)) wrong.push(`${name}: calls noteMaker before it writes anything`);
    }
    expect(wrong).toEqual([]);
  });

  it("the maker is the signed-in person: noteMaker is handed the actor, never a person a form names", () => {
    for (const name of [...EDITS, "adoptDraft"]) {
      const calls = [...lex(fnBody(MATRIX, name), { only: "comments" }).matchAll(/noteMaker\(tx,\s*\{([^}]*)\}/g)];
      expect(calls.length, name).toBeGreaterThan(0);
      for (const c of calls) expect(c[1], name).toMatch(/\bactor\b/);
    }
    const store = read("src/lib/authority/maker-store.ts");
    expect(store).toMatch(/if \(input\.actor\.system\) return false;/);
    expect(store).toMatch(/personId: input\.actor\.personId/);
  });

  it("adopting is for a draft with nobody on record, makes the actor its maker, and is audited", () => {
    const body = lex(fnBody(MATRIX, "adoptDraft"), { only: "comments" });
    inOrder(body, ["staffForPermission(\"configuration.draft\")", "lockIssue(tx, id)", "loadMakers(tx", "noteMaker(tx", "writeAudit("]);
    expect(body).toMatch(/makers\.personIds\.length > 0/);
  });
});

describe("issuing a draft", () => {
  const body = lex(fnBody(MATRIX, "issueDraft"), { only: "comments" });

  it("asks the permission first, refuses a maker before it asks the password, asks the password before the transaction, and judges the makers again under the lock", () => {
    inOrder(body, [
      'staffForPermission("configuration.issue")',
      "makerCheckerFault(",
      'beginAct(actor, data, "AuthorityMatrix.issuedByPerson"',
      "db.$transaction(",
      "lockIssue(tx, id)",
      "loadMakers(tx, draft.id)",
      "makerCheckerFault(",
      "tx.authorityMatrix.update(",
      "act.write(tx, draft.id",
    ]);
  });

  it("writes who issued it, as the signed-in person", () => {
    expect(body).toContain("issuedByPersonId: actor.personId");
    expect(body).toMatch(/document: \{ entity: "AuthorityMatrix", id: draft\.id \}/);
  });

  it("is the one place an approval matrix is put into force by an update", () => {
    const writers = SRC.filter((f) => /authorityMatrix\.update\(/.test(lex(f.text)) && /\bissuedAt\s*:/.test(lex(f.text, { only: "comments" })) && !f.file.endsWith(".test.ts")).map((f) => f.file);
    // The editor, and the code that reads the issue: `issuedAt` named in a filter is not a write.
    const putsInForce = SRC.filter((f) => /authorityMatrix\.update\([^;]*issuedAt:\s*now/.test(lex(f.text, { only: "comments" }).replace(/\n/g, " "))).map((f) => f.file);
    expect(putsInForce).toEqual([MATRIX]);
    expect(writers.length).toBeGreaterThan(0);
  });
});

describe("each table a two-person change writes has one writer", () => {
  const callsOf = (text: string, re: RegExp): string[] => {
    const m = lex(text, { only: "comments" });
    return [...m.matchAll(re)].map((x) => x[0]);
  };
  const writersOf = (re: RegExp) => SRC.filter((f) => callsOf(f.text, re).length > 0).map((f) => f.file).sort();

  it("a role's decision on a permission is written only by applying a change", () => {
    expect(writersOf(/\brolePermission\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\(/g)).toEqual([STORE]);
  });

  it("the organisation's sign-in settings are written only by applying a change, and by the bootstrap command that sets the first", () => {
    expect(writersOf(/\bsecurityPolicy\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\(/g)).toEqual([STORE, "src/lib/auth/bootstrap.ts"].sort());
  });

  it("a change is written only by the store that proposes and decides it", () => {
    expect(writersOf(/\bconfigurationChange\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\(/g)).toEqual([STORE]);
  });

  it("a maker is written only by noteMaker", () => {
    expect(writersOf(/\bauthorityMatrixMaker\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\(/g)).toEqual(["src/lib/authority/maker-store.ts"]);
  });

  it("an account's administrator flag is written only by applying a change, and by the bootstrap command that makes the first", () => {
    const writers = SRC.filter((f) => {
      const m = lex(f.text, { only: "comments" });
      return [...m.matchAll(/\bstaffAccount\.(?:create|createMany|update|updateMany|upsert)\(/g)].some((x) => {
        let depth = 0;
        let i = x.index! + x[0].length - 1;
        const from = i;
        for (; i < m.length; i++) {
          if (m[i] === "(") depth++;
          else if (m[i] === ")" && --depth === 0) break;
        }
        return /\bisAdministrator\s*:\s*(?!false\b)\S/.test(m.slice(from, i));
      });
    })
      .map((f) => f.file)
      .sort();
    expect(writers).toEqual([STORE, "src/lib/auth/bootstrap.ts"].sort());
  });

  it("a one-time code for an office holder's account is made only by deciding a change: the direct issue refuses one", () => {
    const direct = lex(read("src/lib/auth/administration.ts"), { only: "comments" });
    expect(direct).toMatch(/if \(officeHolderNotice\(holdings\)\) return refuse\(\[OFFICE_HOLDER_NEEDS_SECOND_PERSON\]\);/);
    // The refusal is judged under the Person's lock, before the code is made.
    // (The scan's span finder stops at a type in a return type, so the function is cut by its own first and last line.)
    const text = read("src/lib/auth/administration.ts");
    const issue = text.slice(text.indexOf("export async function issueCode("), text.indexOf("\n}\n", text.indexOf("export async function issueCode(")));
    inOrder(issue, ["lockAccount(tx", "lockPersons(tx", "holdingsOf(tx", "OFFICE_HOLDER_NEEDS_SECOND_PERSON", "tx.oneTimeCode.create("]);
  });
});

describe("a change moves only along the declared machine, under its locks", () => {
  const store = lex(read(STORE), { only: "comments" });

  it("its status is never written as a literal: only as the transition the machine names", () => {
    const updates = [...store.matchAll(/tx\.configurationChange\.update\(\{[^)]*\)/g)].map((x) => x[0]);
    expect(updates.length).toBe(3);
    for (const u of updates) expect(u).not.toMatch(/status:\s*"/);
    expect(store).toMatch(/nextStatus\("PROPOSED"/);
  });

  it("proposing: the organisation, the account and Person, then the live values, then the rules, then the second person, then the write", () => {
    inOrder(lex(fnBody(STORE, "proposeChange"), { only: "comments" }), ["lockOrganisation(tx", "lockTarget(tx", "readLive(tx", "planChange(", "secondPersonFault(", "tx.configurationChange.create(", "act.write(tx"]);
  });

  it("deciding: the organisation, the change's own row, the account and Person, then the live values, then staleness, then the rules, then applying, then the decision", () => {
    inOrder(lex(fnBody(STORE, "decideChange"), { only: "comments" }), [
      "lockOrganisation(tx",
      'FROM "ConfigurationChange"',
      "FOR UPDATE",
      "lockTarget(tx",
      "readLive(tx",
      "isStale(",
      "planChange(",
      "applyChange(tx",
      "tx.configurationChange.update(",
      "act.write(tx",
    ]);
  });

  it("a stale change is written before the refusal is returned, not thrown: the decision is kept", () => {
    const body = lex(fnBody(STORE, "decideChange"), { only: "comments" });
    const stale = body.slice(body.indexOf("isStale("), body.indexOf("planChange("));
    inOrder(stale, ['nextStatus("PROPOSED", "STALE")', "tx.configurationChange.update(", "act.write(tx", 'kind: "STALE"']);
    expect(stale).not.toMatch(/\bthrow\b/);
  });

  it("the proposer and the decider are compared by Person, and a withdrawal is the proposer's alone", () => {
    const body = lex(fnBody(STORE, "decideChange"), { only: "comments" });
    expect(body).toMatch(/decisionFaults\(/);
    expect(body).toMatch(/row\.proposedByPersonId !== actor\.personId/);
  });

  it("every lookup of a change or an account is within the actor's organisation", () => {
    expect(store).toMatch(/\{ id: input\.changeId, organisationId: actor\.organisationId \}/);
    expect(store).toMatch(/"organisationId" = \$\{actor\.organisationId\}/);
    for (const m of store.matchAll(/staffAccount\.findFirst\(\{ where: \{([^}]*)\}/g)) expect(m[1]).toContain("organisationId");
  });

  it("a code is made by the person who decided, never by the proposer, and is never written to a row but as its hash", () => {
    const apply = lex(fnBody(STORE, "applyChange"), { only: "comments" });
    expect(apply).toMatch(/issuedByPersonId: actor\.personId/);
    expect(apply).toMatch(/codeHash: hashCode\(code\)/);
    expect(apply).not.toMatch(/\bcode:\s*code\b|reason:[^,]*\bcode\b/);
  });
});
