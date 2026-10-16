import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

import { enclosingFn, lex, spans } from "@/lib/scan/source";

/**
 * Wave 3b step 19 (build plan step 19, ADR 0036 D12): which code can take a seal apart, who may read the data keys the finalise needs, and what the sealed doors write to the
 * server log. The column scans live in `src/lib/bids/sealed.test.ts`; these pin the doors. Each is a source scan with a self-test, so a scan that stopped matching would fail.
 */

const root = process.cwd();
const posix = (p: string) => relative(root, p).split(sep).join("/");
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}
const sources = [...files(join(root, "src", "app")), ...files(join(root, "src", "lib"))].map((p) => ({ path: posix(p), text: readFileSync(p, "utf8") }));
/// Code with comments, strings and template text blanked: a call is found in code only.
const code = sources.map((s) => ({ ...s, code: lex(s.text) }));
const callers = (name: string) => code.filter((s) => new RegExp(`(?<![\\w.])${name}\\s*\\(`).test(s.code)).map((s) => s.path).sort();

describe("every decryption goes through open.ts (ADR 0036 D12)", () => {
  it("hpkeOpen and gcmOpen are defined in open.ts and nowhere else", () => {
    const defining = code.filter((s) => /export\s+(?:async\s+)?function\s+(?:hpkeOpen|gcmOpen)\s*\(/.test(s.code)).map((s) => s.path);
    expect(defining).toEqual(["src/lib/sealing/open.ts"]);
  });

  it("no code outside src/lib/sealing calls either, and inside it only the two modules that open a stored seal do", () => {
    for (const name of ["hpkeOpen", "gcmOpen"]) {
      const from = callers(name);
      expect(from.filter((p) => !p.startsWith("src/lib/sealing/")), name).toEqual([]);
      // open.ts is where the name is defined, so it is not a caller.
      expect(from.filter((p) => p !== "src/lib/sealing/open.ts"), name).toEqual(["src/lib/sealing/file-seal.ts", "src/lib/sealing/unseal-seal.ts"].filter((p) => from.includes(p)));
    }
  });

  it("the primitives under them are reached only through open.ts, with one named exception: kdf.ts's unwrap of an officer's own key under their passphrase", () => {
    // The exception is the key derived from the passphrase opening the officer's private key: it decrypts a key, never a bid, a file or a figure, and the DB tests that spy on
    // open.ts record every decryption of bid material. Anything else calling a primitive directly would escape that record.
    expect(callers("hpkeOpenWithin")).toEqual(["src/lib/sealing/hpke.ts", "src/lib/sealing/open.ts"].filter((p) => callers("hpkeOpenWithin").includes(p)));
    expect(callers("hpkeOpenWithin")).toContain("src/lib/sealing/open.ts");
    const gcm = callers("gcmOpenWithin");
    expect(gcm.filter((p) => !["src/lib/sealing/aead.ts", "src/lib/sealing/open.ts", "src/lib/sealing/kdf.ts"].includes(p))).toEqual([]);
    expect(gcm).toContain("src/lib/sealing/open.ts");
    const kdf = code.find((s) => s.path === "src/lib/sealing/kdf.ts")!;
    const sp = spans(kdf.code);
    const calls = [...kdf.code.matchAll(/(?<![\w.])gcmOpenWithin\s*\(/g)].map((m) => enclosingFn(sp, m.index!));
    expect(calls).toEqual(["unwrapKey"]);
  });

  it("the scan reads calls in code only, never a name in a comment or a string", () => {
    const text = lex('// hpkeOpen(x)\nconst a = "gcmOpen(y)";\nfoo.gcmOpen(z);\nhpkeOpen(k);');
    expect(/(?<![\w.])hpkeOpen\s*\(/.test(text)).toBe(true);
    expect(/(?<![\w.])gcmOpen\s*\(/.test(text)).toBe(false);
  });
});

describe("a FINALISE grant is read only by the finalise (ADR 0036 D10, H3, M5)", () => {
  const readers = sources
    .filter((s) => /(?<![\w])officerDekGrant\.(?:find\w*|count|aggregate|groupBy)\(/.test(lex(s.text)) || /(?:FROM|JOIN)\s+"OfficerDekGrant"/.test(lex(s.text, { only: "comments" })))
    .map((s) => s.path)
    .sort();

  it("exactly two modules read the grants: the finalise's gather, and the download's single-file read", () => {
    expect(readers).toEqual(["src/lib/opening/online-finalise-store.ts", "src/lib/opening/sealed-file-store.ts"]);
  });

  it("the gather that reads every grant is called from finaliseOnline and nowhere else", () => {
    expect(callers("gatherFinaliseMaterial").filter((p) => p !== "src/lib/opening/online-finalise-store.ts")).toEqual(["src/app/sourcing/[id]/opening/online-finalise-actions.ts"]);
    const f = code.find((s) => s.path === "src/app/sourcing/[id]/opening/online-finalise-actions.ts")!;
    const sp = spans(f.code);
    const calls = [...f.code.matchAll(/(?<![\w.])gatherFinaliseMaterial\s*\(/g)].map((m) => enclosingFn(sp, m.index!));
    expect(calls).toEqual(["finaliseOnline"]);
  });

  it("the download reads one file's grant and opens it only as an OPENING_CHECK grant, so a FINALISE grant fails the binding", () => {
    const store = sources.find((s) => s.path === "src/lib/opening/sealed-file-store.ts")!;
    expect(store.text).toMatch(/officerDekGrant\.findFirst\(\{ where: \{[^}]*subject: "FILE", recordId: f\.id/);
    const route = sources.find((s) => s.path === "src/app/api/opening/sealed-file/route.ts")!;
    const opens = [...route.text.matchAll(/officerGrantAad\(\{[^}]*\}\)/g)].map((m) => m[0]);
    expect(opens.length).toBeGreaterThan(0);
    for (const o of opens) expect(o).toContain('use: "OPENING_CHECK"');
  });

  it("openGrant is called by the finalise's gather and the download route only", () => {
    expect(callers("openGrant").filter((p) => p !== "src/lib/sealing/unseal-seal.ts")).toEqual(["src/app/api/opening/sealed-file/route.ts", "src/lib/opening/online-finalise-store.ts"]);
  });

  it("the grants are written only by the unseal's transaction", () => {
    const writers = code.filter((s) => /\bofficerDekGrant\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\(/.test(s.code)).map((s) => s.path);
    expect(writers).toEqual(["src/lib/opening/unseal-store.ts"]);
  });
});

describe("no sealed door logs a body, a buffer or a secret (build plan step 19)", () => {
  const SEALED_DIRS = ["src/app/api/opening", "src/app/supplier/bids", "src/lib/sealing", "src/lib/bids/online", "src/lib/opening", "src/app/sourcing/[id]/opening", "src/app/sourcing/[id]/scope"];
  /// What a log line must not carry: the request body, a buffer, a data key, a passphrase or a password, sealed or plain bid material.
  const FORBIDDEN_ARG = /\b(?:body|buffer|bytes|dek|passphrase|password|pass|secret|formData|form|payload|sealed\w*|cipher\w*|plain\w*|manifest|declaration|price\w*|figure|request|req|data|json|text|content|blob|key|share\w*|private\w*)\b/i;

  /// Each `console.<level>(…)` call: the text between its parentheses, with strings blanked, so only the expressions it prints remain.
  const consoleCalls = (src: string): string[] => {
    const m = lex(src);
    const out: string[] = [];
    for (const x of m.matchAll(/\bconsole\s*\.\s*\w+\s*\(/g)) {
      let depth = 0;
      let i = x.index! + x[0].length - 1;
      const start = i + 1;
      for (; i < m.length; i++) {
        if (m[i] === "(") depth++;
        else if (m[i] === ")" && --depth === 0) break;
      }
      out.push(m.slice(start, i));
    }
    return out;
  };

  it("every console call in the sealed paths prints words and a state, never material", () => {
    const hits: string[] = [];
    let seen = 0;
    for (const s of sources) {
      if (!SEALED_DIRS.some((d) => s.path.startsWith(d + "/"))) continue;
      for (const arg of consoleCalls(s.text)) {
        seen++;
        if (FORBIDDEN_ARG.test(arg)) hits.push(`${s.path}: ${arg.trim().slice(0, 80)}`);
      }
    }
    expect(seen).toBeGreaterThan(0);
    expect(hits).toEqual([]);
  });

  it("the sealed paths use no other logger and write nothing to the process streams", () => {
    const hits = sources.filter((s) => SEALED_DIRS.some((d) => s.path.startsWith(d + "/"))).filter((s) => /\bprocess\.(?:stdout|stderr)\.write\b|\bdebugger\b/.test(lex(s.text))).map((s) => s.path);
    expect(hits).toEqual([]);
  });

  it("the scan reads a printed expression and ignores the words in a string", () => {
    const dollar = "$";
    const calls = consoleCalls(["console.error(`refused: " + dollar + "{state}`);", 'console.log("body", req.body);', "console.warn(`the passphrase is wrong`);"].join("\n"));
    expect(calls.map((c) => FORBIDDEN_ARG.test(c))).toEqual([false, true, false]);
  });
});
