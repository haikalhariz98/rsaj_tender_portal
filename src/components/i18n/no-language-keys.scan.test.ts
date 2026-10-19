import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { posixRelative, toPosix } from "@/lib/scan/files";

// NFR-LNG-001 (ADR 0040): switching language must lose no entered data, so nothing in the tree is keyed on the language. A `key` that changes on
// the switch remounts its subtree and throws its state (a half-typed drawer) away. The switch refreshes the page in place instead.

const ROOT = path.join(__dirname, "../..");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sources(full);
    return /\.tsx$/.test(name) ? [toPosix(full)] : [];
  });
}

/// The text of every `key={...}` in a source, braces balanced.
function keyExpressions(text: string): string[] {
  const found: string[] = [];
  const re = /\bkey=\{/g;
  while (re.exec(text)) {
    let depth = 1;
    let i = re.lastIndex;
    while (i < text.length && depth > 0) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}") depth--;
      i++;
    }
    found.push(text.slice(re.lastIndex, i - 1));
  }
  return found;
}

const MENTIONS_LANGUAGE = /\b(language|lang|uiLanguage|useSay|useLanguage|sayWith|say)\b|\.ms\b|\bLANGUAGE/;

/// Two keys name the languages of a document's own text (a printed certificate's English and Malay copies, a tender document's two texts). They
/// identify list items and are the same whichever language the screen is read in, so they cannot remount anything on a switch.
const DOCUMENT_LANGUAGE_KEYS = new Set(["app/projects/[id]/certificates/[certId]/page.tsx: key={lang}", "components/tender-document.tsx: key={t.language}"]);

describe("no key in the app or the shared components mentions the language", () => {
  const files = [...sources(path.join(ROOT, "app")), ...sources(path.join(ROOT, "components"))];

  it("walks the app's and the components' sources", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  /* eslint-disable no-template-curly-in-string -- the detector is shown source text, which holds template strings */
  it("finds the keys it is looking for (the detector itself)", () => {
    expect(keyExpressions("<a key={`x-${nested({ a: 1 })}`} /><b key={row.id}>")).toEqual(["`x-${nested({ a: 1 })}`", "row.id"]);
    expect(MENTIONS_LANGUAGE.test("`${language}-x`")).toBe(true);
    expect(MENTIONS_LANGUAGE.test("say(item.label)")).toBe(true);
    expect(MENTIONS_LANGUAGE.test("group.label.ms")).toBe(true);
    expect(MENTIONS_LANGUAGE.test("row.id")).toBe(false);
  });
  /* eslint-enable no-template-curly-in-string */

  it("holds no key built from the language, or from words that change with it", () => {
    const offenders = files.flatMap((file) =>
      keyExpressions(readFileSync(file, "utf8"))
        .filter((k) => MENTIONS_LANGUAGE.test(k))
        .map((k) => `${posixRelative(ROOT, file)}: key={${k}}`),
    );
    expect(offenders.filter((o) => !DOCUMENT_LANGUAGE_KEYS.has(o))).toEqual([]);
  });
});
