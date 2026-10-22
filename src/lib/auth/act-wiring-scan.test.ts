import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { lex, spans } from "@/lib/scan/source";

import { ACT_SLOTS, slotKey } from "./act-slots";
import { posixRelative, toPosix } from "@/lib/scan/files";

/**
 * Every act's person slot is written through `beginAct` (ADR 0034 D12, Phase 2b, closes F1). The registry (`act-slots.ts`) says which slots there are; this
 * scan holds the code to it, as a ratchet: a slot is either wired (its key is a literal in a `beginAct(` or `writeAlso(` call, in a file that writes it inside the act's own
 * transaction with `.write(tx`), or no act writes its column yet and it is listed with the reason. A listed column that gains a writer
 * fails, so the act is wired the day it is built.
 */

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");

/// Slots whose column no act writes yet: the increment that builds the act has not been built (6.13 Part B, later runs; the split-check override; cancelling an
/// evaluation). Each is accounted for here with the reason, and `NO_WRITER_YET` below fails when one gains a writer, so the act is wired the day it exists.
const NOT_BUILT: Readonly<Record<string, { why: string; writer: RegExp }>> = {
  "RequisitionSplitCheck.overriddenBy": { why: "The split-check override has no act yet: the check is read, and an override is only seeded.", writer: /requisitionSplitCheck\.(?:create|update|upsert)/ },
  "Evaluation.cancelledBy": { why: "No act cancels an evaluation yet.", writer: /cancelledByPersonId/ },
  // ADR 0041: the three slots step 1 registered (sending an online application, checking its certificates and its bank details) are wired since step 4 (`portal-actions.ts`), so they leave this list.
  "ExtensionOfTime.person": { why: "The extension of time granted on a determined claim is a later 6.13 Part B increment: no act writes it.", writer: /\.extensionOfTime\.(?:create|update|upsert)/ },
  "PeriodExtension.person": { why: "The extension of the contract period is a later 6.13 Part B increment: no act writes it.", writer: /\.periodExtension\.(?:create|update|upsert)/ },
  "PeriodAgreement.person": { why: "The agreement on the contract period is a later 6.13 Part B increment: no act writes it.", writer: /\.periodAgreement\.(?:create|update|upsert)/ },
  "LadWaiver.person": { why: "Waiving liquidated damages is a later 6.13 Part B increment: no act writes it.", writer: /\.ladWaiver\.(?:create|update|upsert)/ },
  "LossExpenseClaim.valuedBy": { why: "Valuing a loss-and-expense claim is a later 6.13 Part B increment: no act writes the valuation.", writer: /valuedByPersonId/ },
  // Wave 3b (SR-13): the two attestations of the bid sealing policy are wired since step 7 (`bid-sealing/core.ts`), so they leave this list.
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "generated" || name === "node_modules") continue;
      walk(p, out);
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(toPosix(p));
  }
  return out;
}

const FILES = walk(SRC).map((p) => ({ file: posixRelative(ROOT, p), text: readFileSync(p, "utf8") }));
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

/// Entry points that begin an act only to have the sign-in password asked again, and write no attribution (nothing is signed). Each says why, and the scan below holds them to never calling `write`.
const PASSWORD_CHECK_ONLY: Readonly<Record<string, string>> = {
  "src/app/api/opening/sealed-file/route.ts": "wave 3b step 14 (ADR 0036 D4, ruling 20n): the officer's download asks the sign-in password every time, as checkUnlock does, and signs nothing; its record is the sealed access log",
};

describe("every person slot of an act is written through beginAct, or is on the list of what is not", () => {
  it("each slot is wired, or has no act yet", () => {
    const accounted = new Set([...WIRED.keys(), ...Object.keys(NOT_BUILT)]);
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
    expect(Object.keys(NOT_BUILT).filter((k) => !known.has(k))).toEqual([]);
  });

  it("a wired slot's file writes it inside the act's own transaction, or hands the act to the writer that does", () => {
    const wrong: string[] = [];
    for (const [key, files] of WIRED) {
      for (const file of new Set(files)) {
        const text = FILES.find((f) => f.file === file)!.text;
        if (file in PASSWORD_CHECK_ONLY) {
          expect(PASSWORD_CHECK_ONLY[file].length, file).toBeGreaterThan(40);
          expect(/\bact\.write(?:Also)?\(/.test(text), `${file} writes an attribution`).toBe(false);
          continue;
        }
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

describe("a slot written beside an act can be recorded the way the act is", () => {
  /// A `writeAlso` target written in a function that is handed its act (a library writer, a helper): the main act, verified by hand, and why it is safe. The target is
  /// either paper-capable or the main act is always the signed-in officer's own (`onBehalf: false` at its `beginAct`, which the test reads).
  const HANDED: Readonly<Record<string, { target: string; main: string; mainFile: string; mainFn: string }[]>> = {
    "src/lib/bids/lodgement.ts": [{ target: "BidEnvelope.receivedBy", main: "EstimateEvent.person", mainFile: "src/app/sourcing/[id]/scope/actions.ts", mainFn: "lodgeEstimate" }],
    "src/lib/evaluation/versions.ts": [{ target: "Evaluation.startedBy", main: "EstimateEvent.person", mainFile: "src/app/sourcing/[id]/opening/actions.ts", mainFn: "finaliseOpening" }],
  };
  const paperCapable = (key: string) => ACT_SLOTS.find((s) => slotKey(s.entity, s.field) === key)?.onBehalf === true;
  /// The `beginAct` calls of a source text, each with the slot it is for and whether it narrows the slot to the officer's own.
  const mainsOf = (text: string) =>
    callsOf(text, /\bbeginAct(?:From)?\(/g)
      .map((call) => ({ key: [...call.matchAll(/"([A-Z]\w+\.\w+)"/g)].map((m) => m[1]).find((k) => ACT_SLOTS.some((s) => slotKey(s.entity, s.field) === k)), own: /\bonBehalf:\s*false/.test(call) }))
      .filter((m): m is { key: string; own: boolean } => !!m.key);

  it("every slot written beside an act that may be recorded from paper may be recorded from paper itself (writeAlso would refuse it, and the act with it)", () => {
    const wrong: string[] = [];
    let checked = 0;
    for (const f of ACT_SOURCES.filter((x) => x.file.startsWith("src/app/") && !x.file.startsWith("src/app/_auth/"))) {
      const fns = spans(lex(f.text));
      for (const call of f.text.matchAll(/\bwriteAlso\(\s*[\w.]+,\s*"([A-Z]\w+\.\w+)"/g)) {
        checked++;
        const outer = fns.filter((sp) => sp.from <= call.index! && call.index! <= sp.to).sort((a, b) => a.from - b.from)[0];
        const body = outer ? f.text.slice(outer.from, outer.to) : f.text;
        // The act is the function's first (`const act = begun.act;`): a function that begins a second (a late estimate's override) writes that one's own slot with its own `write`.
        const main = mainsOf(body)[0];
        if (!main) {
          wrong.push(`${f.file}: writeAlso("${call[1]}") is in a function that begins no act: name its main act in HANDED`);
          continue;
        }
        if (!main.own && paperCapable(main.key) && !paperCapable(call[1])) wrong.push(`${f.file}#${outer?.name ?? "?"}: ${call[1]} is written beside ${main.key}, which may be recorded from paper, and it cannot be`);
      }
    }
    expect(checked).toBeGreaterThan(8);
    expect(wrong).toEqual([]);
  });

  it("a slot written by a library function is paper-capable, or its main act is the officer's own where the act is begun", () => {
    const wrong: string[] = [];
    for (const [file, list] of Object.entries(HANDED)) {
      const text = FILES.find((f) => f.file === file)!.text;
      for (const h of list) {
        expect(text, `${file} writes ${h.target} beside an act`).toContain(`writeAlso(tx, "${h.target}"`);
        if (paperCapable(h.target)) continue;
        const mainText = FILES.find((f) => f.file === h.mainFile)!.text;
        const fn = spans(lex(mainText)).find((sp) => sp.name === h.mainFn);
        expect(fn, `${h.mainFile} has ${h.mainFn}`).toBeTruthy();
        const main = mainsOf(mainText.slice(fn!.from, fn!.to)).filter((m) => m.key === h.main);
        if (main.length === 0 || main.some((m) => !m.own)) wrong.push(`${file}: ${h.target} is not paper-capable, and ${h.main} (${h.mainFile}#${h.mainFn}) is not always the officer's own`);
      }
    }
    expect(wrong).toEqual([]);
    // Every library writer of a second slot is on the list or writes a slot that may be recorded from paper.
    const unlisted = FILES.filter((f) => f.file.startsWith("src/lib/") && !f.file.startsWith("src/lib/auth/") && /\.writeAlso\(/.test(f.text) && !HANDED[f.file]).filter((f) => [...f.text.matchAll(/writeAlso\(\s*[\w.]+,\s*"([A-Z]\w+\.\w+)"/g)].some((m) => !paperCapable(m[1])));
    expect(unlisted.map((f) => f.file)).toEqual([]);
  });
});

describe("a refused attribution is a message, never a crash", () => {
  it("every action file that writes an attribution catches the refusal the writer can raise in the act's transaction", () => {
    // The writer throws `AttributionRefused` to roll the act back (a race the pre-flight could not see). The file's own frame turns it into the form's message: its own
    // catch, `thrownState`, or one of the frames that catch it (`inWindow` and `inEvaluation` of the sourcing exercise, `inOpening` (in-opening.ts, a frame over `inWindow`, shared by the paper acts and the online unseal), `inSupplier` of the register).
    const bare = ACT_SOURCES.filter((f) => f.file.startsWith("src/app/") && !f.file.startsWith("src/app/_auth/") && /\b(?:act|act0)\.(?:write|writeAlso)\(|\.write\(\s*(?:\w+\.)?tx\b/.test(f.text) && !/attributionRefusalState|AttributionRefused|thrownState/.test(f.text) && !/\b(?:inWindow|inOpening|inEvaluation|inSupplier)\(/.test(f.text));
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

  it("every signature-class act names the exact document or record it signs, in its options or in what its function writes (the writer refuses a signature that names none)", () => {
    const signature = new Set(ACT_SLOTS.filter((s) => s.signatureClass).map((s) => slotKey(s.entity, s.field)));
    const without: string[] = [];
    let checked = 0;
    for (const f of ACT_SOURCES.filter((x) => !x.file.startsWith("src/lib/auth/") && x.file !== "src/app/_auth/act.ts")) {
      const m = lex(f.text);
      const fns = spans(m);
      for (const call of f.text.matchAll(/\bbeginAct(?:From)?\(/g)) {
        const text = callsOf(f.text.slice(call.index!), /^beginAct(?:From)?\(/g)[0];
        const key = [...text.matchAll(/"([A-Z]\w+\.\w+)"/g)].map((k) => k[1]).find((k) => signature.has(k));
        if (!key) continue;
        checked++;
        const fn = fns.filter((sp) => sp.from <= call.index! && call.index! <= sp.to).sort((a, b) => b.from - a.from)[0];
        const body = fn ? f.text.slice(fn.from, fn.to) : text;
        if (!/\bdocument:\s*(?:\{|\w)/.test(text) && !/\bdocument:\s*(?:\{|\w)/.test(body)) without.push(`${f.file}#${fn?.name ?? "?"}: ${key}`);
      }
    }
    expect(checked).toBeGreaterThan(20);
    expect(without).toEqual([]);
  });

  /// The signature-class acts whose record is the document they decide (the decision is made on it: an award issued, a programme decided, a claim determined, a variation
  /// decided, a non-completion decided, an approval matrix issued, a two-person change decided: Phase 2c), so naming it is naming the document. Every other signature creates a row that only records the signing, and names what it signs.
  // Phase 5a: an evaluation model is issued as the matrix is, so the model is the record the issue decides.
  // Phase 4b: a creditor profile's check is the decision made on it (checked and in order, or not in order), by one officer, so the record it names is the profile itself.
  const DECIDES_ITS_OWN_RECORD = new Set(["Award", "NonCompletion", "WorkProgramme", "EotClaim", "Variation", "AuthorityMatrix", "ConfigurationChange", "CreditorProfile", "EvaluationModel"]);

  it("no signature names itself as the document it signs: the document is the record that was signed, not the attribution's own row", () => {
    // `document: { entity: "DiaryEndorsement", id: row.id }` on a `DiaryEndorsement.person` act is the signature naming the signature (review of Phase 2b).
    const signature = ACT_SLOTS.filter((s) => s.signatureClass);
    const selfNamed: string[] = [];
    for (const f of ACT_SOURCES.filter((x) => !x.file.startsWith("src/lib/auth/") && x.file !== "src/app/_auth/act.ts")) {
      const fns = spans(lex(f.text));
      for (const call of f.text.matchAll(/\bbeginAct(?:From)?\(/g)) {
        const text = callsOf(f.text.slice(call.index!), /^beginAct(?:From)?\(/g)[0];
        const key = [...text.matchAll(/"([A-Z]\w+\.\w+)"/g)].map((k) => k[1]).find((k) => signature.some((s) => slotKey(s.entity, s.field) === k));
        if (!key) continue;
        const entity = key.split(".")[0];
        if (DECIDES_ITS_OWN_RECORD.has(entity)) continue;
        const fn = fns.filter((sp) => sp.from <= call.index! && call.index! <= sp.to).sort((a, b) => b.from - a.from)[0];
        const body = fn ? f.text.slice(fn.from, fn.to) : text;
        if (new RegExp(String.raw`document:\s*\{\s*entity:\s*"${entity}"`).test(body)) selfNamed.push(`${f.file}#${fn?.name ?? "?"}: ${key} names a ${entity} as the document it signs`);
      }
    }
    expect(selfNamed).toEqual([]);
  });

  /// The signature-class acts that do not record the office the signer held, each with the reason (NFR-SIG-001 asks for the role). An act not on this list passes `roleCode`, or
  /// records its capacity in a column of its own (below). The list is empty since the product owner's ruling of 2026-10-07: "a reasoned list that leaves the role out is not a
  /// standing exemption". An entry added here needs its reason, and a ruling.
  const NO_OFFICE_RECORDED: Readonly<Record<string, string>> = {};

  /// The signature-class acts whose capacity is not an office of the roster: a panel member signs in a seat of the opening's panel, which the act keeps as a column of its own
  /// (the opening's `OpeningPanelMember`, whose label is what a screen reads). The column named must be written by the act and must exist on the model.
  const CAPACITY_COLUMN: Readonly<Record<string, string>> = {
    "OpeningAuthorisation.person": "panelMemberId",
    // Wave 3b step 8 (ADR 0036 D4): an officer sets their share in the capacity of the roster row they were named on. A re-key has no column of its own and writes the seat as its role.
    "OfficerExerciseKey.person": "openingOfficerId",
    "OpeningSignature.person": "panelMemberId",
    // FR-EST-005 (Phase 3d): a specification panel's column is verified in the capacity of that column, which is the row's own `columnCode` (written with its label as it was). The column is
    // required on the row, not nullable like the opening's seat, which is new and has no backfill: the check below accepts either.
    "SpecPanelVerification.person": "columnCode",
  };

  it("every signature-class act records the office the signer held, or is on the list of those that do not, with the reason (NFR-SIG-001)", () => {
    const signature = new Set(ACT_SLOTS.filter((s) => s.signatureClass).map((s) => slotKey(s.entity, s.field)));
    const without: string[] = [];
    const wired = new Set<string>();
    for (const f of ACT_SOURCES.filter((x) => !x.file.startsWith("src/lib/auth/") && x.file !== "src/app/_auth/act.ts")) {
      const fns = spans(lex(f.text));
      for (const call of f.text.matchAll(/\bbeginAct(?:From)?\(/g)) {
        const text = callsOf(f.text.slice(call.index!), /^beginAct(?:From)?\(/g)[0];
        const key = [...text.matchAll(/"([A-Z]\w+\.\w+)"/g)].map((k) => k[1]).find((k) => signature.has(k));
        if (!key) continue;
        wired.add(key);
        const fn = fns.filter((sp) => sp.from <= call.index! && call.index! <= sp.to).sort((a, b) => b.from - a.from)[0];
        const body = fn ? f.text.slice(fn.from, fn.to) : text;
        // An act handed to a library writer (it never calls `.write(` itself) is held by the writers' own check below.
        if (!/\bact\??\.write\(/.test(body)) continue;
        const column = CAPACITY_COLUMN[key];
        if (!/\broleCode\b/.test(body) && !(column && new RegExp(String.raw`\b${column}\b`).test(body)) && !NO_OFFICE_RECORDED[key]) without.push(`${f.file}#${fn?.name ?? "?"}: ${key}`);
      }
    }
    expect(without).toEqual([]);
    // The library writers that write a signature handed to them record the office too.
    for (const file of ["src/lib/certificate/route-write.ts", "src/lib/matter/route-write.ts", "src/lib/variation/route-write.ts", "src/app/suppliers/routes.ts", "src/lib/certificate/write.ts"]) {
      expect(FILES.find((f) => f.file === file)!.text, `${file} writes the office held`).toMatch(/\.write\([^;]*roleCode/);
    }
    // The list names only signatures that are wired and still need it: an act that gains its office comes off the list.
    expect(Object.keys(NO_OFFICE_RECORDED).filter((k) => !wired.has(k))).toEqual([]);
    for (const [k, why] of Object.entries(NO_OFFICE_RECORDED)) expect(why.length, k).toBeGreaterThan(40);
    // A capacity column is named only for a wired signature, and exists on its model in the schema.
    const schema = readFileSync(path.join(ROOT, "prisma", "schema.prisma"), "utf8");
    for (const [k, column] of Object.entries(CAPACITY_COLUMN)) {
      expect(wired.has(k), `${k} is wired`).toBe(true);
      const model = new RegExp(String.raw`\nmodel ${k.split(".")[0]} \{([\s\S]*?)\n\}`).exec(schema)?.[1] ?? "";
      expect(model, `${k.split(".")[0]}.${column} is a column`).toMatch(new RegExp(String.raw`\n\s+${column}\s+String\??\s`));
    }
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
