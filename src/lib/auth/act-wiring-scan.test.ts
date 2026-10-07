import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { lex, spans } from "@/lib/scan/source";

import { ACT_SLOTS, slotKey } from "./act-slots";

/**
 * Every act's person slot is written through `beginAct` (ADR 0034 D12, Phase 2b, closes F1). The registry (`act-slots.ts`) says which slots there are; this
 * scan holds the code to it, as a ratchet: a slot is either wired (its key is a literal in a `beginAct(` or `writeAlso(` call, in a file that writes it inside the act's own
 * transaction with `.write(tx`), or it is owned by Phase 2c, or no act writes its column yet and it is listed with the reason. A listed column that gains a writer
 * fails, so the act is wired the day it is built.
 */

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");

/// Slots whose lifecycle is Phase 2c's (the matrix issue, the two-person configuration change): wired there, with their screens.
const OWNED_BY_2C: Readonly<Record<string, string>> = {
  "AuthorityMatrix.issuedByPerson": "Issuing a matrix is wired with its maker-checker step in 2c (`issue.ts`): the password, the makers and the adopt act.",
  "ConfigurationChange.proposedBy": "The proposal of a two-person change is written when the change exists, in 2c.",
  "ConfigurationChange.decidedBy": "The checker's decision is made when the change exists, in 2c.",
};

/// Slots whose column no act writes yet: the increment that builds the act has not been built (6.13 Part B, later runs; the split-check override; cancelling an
/// evaluation). Each is accounted for here with the reason, and `NO_WRITER_YET` below fails when one gains a writer, so the act is wired the day it exists.
const NOT_BUILT: Readonly<Record<string, { why: string; writer: RegExp }>> = {
  "RequisitionSplitCheck.overriddenBy": { why: "The split-check override has no act yet: the check is read, and an override is only seeded.", writer: /requisitionSplitCheck\.(?:create|update|upsert)/ },
  "Evaluation.cancelledBy": { why: "No act cancels an evaluation yet.", writer: /cancelledByPersonId/ },
  "ExtensionOfTime.person": { why: "The extension of time granted on a determined claim is a later 6.13 Part B increment: no act writes it.", writer: /\.extensionOfTime\.(?:create|update|upsert)/ },
  "PeriodExtension.person": { why: "The extension of the contract period is a later 6.13 Part B increment: no act writes it.", writer: /\.periodExtension\.(?:create|update|upsert)/ },
  "PeriodAgreement.person": { why: "The agreement on the contract period is a later 6.13 Part B increment: no act writes it.", writer: /\.periodAgreement\.(?:create|update|upsert)/ },
  "LadWaiver.person": { why: "Waiving liquidated damages is a later 6.13 Part B increment: no act writes it.", writer: /\.ladWaiver\.(?:create|update|upsert)/ },
  "LossExpenseClaim.valuedBy": { why: "Valuing a loss-and-expense claim is a later 6.13 Part B increment: no act writes the valuation.", writer: /valuedByPersonId/ },
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "generated" || name === "node_modules") continue;
      walk(p, out);
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

const FILES = walk(SRC).map((p) => ({ file: path.relative(ROOT, p).split(path.sep).join("/"), text: readFileSync(p, "utf8") }));
const ACT_SOURCES = FILES.filter((f) => /\b(?:beginAct(?:From)?|writeAlso)\(/.test(f.text) && !f.file.endsWith("src/app/_auth/act.ts"));

/// The text of each call of `name(` in a source, to its closing parenthesis.
function callsOf(text: string, name: RegExp): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(name)) {
    let depth = 0;
    let i = m.index! + m[0].length - 1;
    const from = i;
    for (; i < text.length; i++) {
      if (text[i] === "(") depth++;
      else if (text[i] === ")" && --depth === 0) break;
    }
    out.push(text.slice(from, i + 1));
  }
  return out;
}

/// The slot keys named as literals in the files that call `beginAct` (the key may sit in a conditional) or `writeAlso`.
function wiredSlots(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  const known = new Set(ACT_SLOTS.map((s) => slotKey(s.entity, s.field)));
  for (const f of ACT_SOURCES) {
    for (const call of [...callsOf(f.text, /\bbeginAct(?:From)?\(/g), ...callsOf(f.text, /\bwriteAlso\(/g)]) {
      for (const m of call.matchAll(/"([A-Z]\w+\.\w+)"/g)) if (known.has(m[1])) found.set(m[1], [...(found.get(m[1]) ?? []), f.file]);
    }
  }
  return found;
}

const WIRED = wiredSlots();
const KEYS = ACT_SLOTS.map((s) => slotKey(s.entity, s.field));

describe("every person slot of an act is written through beginAct, or is on the list of what is not", () => {
  it("each slot is wired, owned by 2c, or has no act yet", () => {
    const accounted = new Set([...WIRED.keys(), ...Object.keys(OWNED_BY_2C), ...Object.keys(NOT_BUILT)]);
    expect(KEYS.filter((k) => !accounted.has(k))).toEqual([]);
  });

  it("a slot with no act yet is not also wired, and says why", () => {
    expect(Object.keys(NOT_BUILT).filter((k) => WIRED.has(k))).toEqual([]);
    for (const [k, n] of Object.entries(NOT_BUILT)) expect(n.why.length, k).toBeGreaterThan(30);
  });

  it("NO_WRITER_YET: nothing in the app writes a column listed as having no act", () => {
    const written: string[] = [];
    for (const [k, n] of Object.entries(NOT_BUILT)) for (const f of FILES) if (!f.file.startsWith("src/lib/auth/") && n.writer.test(f.text)) written.push(`${k}: ${f.file}`);
    expect(written).toEqual([]);
  });

  it("the lists name only slots of the registry, and none twice", () => {
    const known = new Set(KEYS);
    expect([...Object.keys(NOT_BUILT), ...Object.keys(OWNED_BY_2C)].filter((k) => !known.has(k))).toEqual([]);
    for (const [k, why] of Object.entries(OWNED_BY_2C)) expect(why.length, k).toBeGreaterThan(30);
  });

  it("a wired slot's file writes it inside the act's own transaction, or hands the act to the writer that does", () => {
    const wrong: string[] = [];
    for (const [key, files] of WIRED) {
      for (const file of new Set(files)) {
        const text = FILES.find((f) => f.file === file)!.text;
        const writesItself = /\.(?:write|writeAlso)\(\s*(?:\w+\.)?(?:tx|t|trx)\b/.test(text);
        const handsItOn = /[,{(]\s*act\s*[,})]|\bact:\s*\w+|\bact,/.test(text.replace(/const act = begun\.act;/g, ""));
        if (!writesItself && !handsItOn) wrong.push(`${key}: ${file} neither writes the attribution in a transaction nor hands the act to a writer`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it("every write of an attribution by library code is made on a transaction, never on the global client", () => {
    const wrong: string[] = [];
    for (const f of FILES.filter((x) => x.file.startsWith("src/lib/") && !x.file.startsWith("src/lib/auth/"))) {
      for (const m of f.text.matchAll(/\b(?:act|o\.act|i\.act|input\.act)\.(?:write|writeAlso)\(\s*([^,)]+)/g)) {
        if (!/(?:^|\.)(?:tx|t|trx)$/.test(m[1].trim())) wrong.push(`${f.file}: ${m[0]}`);
      }
    }
    expect(wrong).toEqual([]);
  });
});

describe("an act that is begun is used", () => {
  it("every function that begins an act writes its own slot, or hands the act to the code that does", () => {
    const unused: string[] = [];
    for (const f of ACT_SOURCES.filter((x) => !x.file.startsWith("src/lib/auth/"))) {
      for (const sp of spans(lex(f.text))) {
        const body = f.text.slice(sp.from, sp.to);
        for (const m of body.matchAll(/const (\w+) = begun\.act;/g)) {
          const rest = body.replace(m[0], "");
          // Written itself (`act.write(`), or handed on bare to the code that writes it (`{ ..., act }`, `, act)`). `writeAlso` alone leaves the act's own slot unwritten.
          const writes = new RegExp(String.raw`\b${m[1]}\.write\(`).test(rest);
          const handedOn = new RegExp(String.raw`(?<![.\w])${m[1]}(?=\s*[,})])`).test(rest);
          if (!writes && !handedOn) unused.push(`${f.file}#${sp.name}: ${m[1]}`);
        }
      }
    }
    expect(unused).toEqual([]);
  });
});

describe("a refused attribution is a message, never a crash", () => {
  it("every action file that writes an attribution catches the refusal the writer can raise in the act's transaction", () => {
    // The writer throws `AttributionRefused` to roll the act back (a race the pre-flight could not see). The file's own frame turns it into the form's message: its own
    // catch, `thrownState`, or one of the frames that catch it (`inWindow` and `inEvaluation` of the sourcing exercise, `inSupplier` of the register).
    const bare = ACT_SOURCES.filter((f) => f.file.startsWith("src/app/") && !f.file.startsWith("src/app/_auth/") && /\b(?:act|act0)\.(?:write|writeAlso)\(|\.write\(\s*(?:\w+\.)?tx\b/.test(f.text) && !/attributionRefusalState|AttributionRefused|thrownState/.test(f.text) && !/\b(?:inWindow|inEvaluation|inSupplier)\(/.test(f.text));
    expect(bare.map((f) => f.file)).toEqual([]);
  });
});

describe("a signature-class act asks the password where it is signed", () => {
  it("each entry point the registry names for a signature slot calls beginAct for it, which asks the password (beginAct is the only caller of stepUp)", () => {
    const wrong: string[] = [];
    for (const s of ACT_SLOTS.filter((x) => x.signatureClass && x.entryPoints)) {
      const key = slotKey(s.entity, s.field);
      if (!WIRED.has(key)) continue;
      for (const entry of s.entryPoints!) {
        const [file, fn] = entry.split("#");
        const abs = path.join(ROOT, file);
        if (!existsSync(abs)) continue;
        const raw = readFileSync(abs, "utf8");
        const m = lex(raw);
        const span = spans(m).find((sp) => sp.name === fn);
        if (!span) continue;
        if (!new RegExp(String.raw`beginAct(?:From)?\(\s*[\w.]+,\s*[\w.]+,\s*"${key.replace(".", "\.")}"`).test(raw.slice(span.from, span.to))) wrong.push(`${entry} does not call beginAct for ${key}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it("beginAct asks the password for exactly the acts that need it, before the act's transaction, and nowhere else is stepUp called", () => {
    const begin = FILES.find((f) => f.file === "src/lib/auth/act-begin.ts")!.text;
    expect(begin).toMatch(/if \(intent\.passwordRequired\) \{\s*const asked = await deps\.stepUp\(/);
    const callers = FILES.filter((f) => /\bstepUp\(/.test(lex(f.text)) && f.file !== "src/app/_auth/actor.ts").map((f) => f.file);
    expect(callers).toEqual(["src/lib/auth/act-begin.ts"]);
    // The server binds the real password check to it, and nothing else.
    expect(FILES.find((f) => f.file === "src/app/_auth/act.ts")!.text).toMatch(/\n  stepUp,\n/);
  });
});
