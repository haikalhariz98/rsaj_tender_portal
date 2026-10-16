import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

import { lex } from "@/lib/scan/source";

/**
 * Wave 3b step 19 (ruling 20j, 20s, 20ab): the cross-cutting scan of `words.test.ts` extended from the words constants to the components and pages that render them, with the
 * same Malay terms. JSX text is scanned as well as string literals (comments only are blanked), so a sentence typed straight into a screen is read.
 *
 * Scope, with the reason for each edge:
 * - the supplier's online-bid screens in full: every `.ts` and `.tsx` under `src/app/supplier` that imports the online-bid or the sealing modules. No bid, receipt or submission is
 *   called signed, proof or verified in either language. Other supplier screens (company, registration, projects) are not bid screens: "signed with your password" there is the
 *   truthful name of a real password-attributed act, so they stay out of this scan;
 * - the officers' sealed screens (the opening workspace, the key section, the sealed-file download, the opening's online words and the bid-sealing configuration): the same, except
 *   that an officer's signature on the opening schedule is a real act made with a sign-in password, so the phrases listed in OFFICER_ACT are allowed there and nothing else.
 */

const root = process.cwd();
const FORBIDDEN_EN = /\b(signed|proof|verified)\b/i;
const FORBIDDEN_MS = /tandatangan|bukti|disahkan|mengesahkan|pengesahan/i;

/// Phrases that are about a person or an act, never about a bid or a receipt, each with its reason.
const PERSON_STATE: Readonly<Record<string, RegExp>> = {
  "a person who is signed in or signed out (a session, not a claim about a bid)": /\bsigned (?:in|out)\b/gi,
};
const OFFICER_ACT: Readonly<Record<string, RegExp>> = {
  "an officer's signature on the opening schedule, made with their sign-in password": /\b(?:signed (?:the )?schedule|signed by|have signed|the signed schedule|signed in as themselves|the paper the panel signed)\b/gi,
  "a property of the code (the count of officers who have signed), never text on a screen": /\.signed\b/g,
  "the message after an officer signs the schedule (ONLINE_SIGNED), an act of the officer": /^\s*(?:export const ONLINE_SIGNED = )?"Signed\. Every named officer signs[^"]*";?/gim,
};

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}
const posix = (p: string) => relative(root, p).split(sep).join("/");

/// The claims a file makes, with the allowed phrases taken out first. A line is reported with its place.
export function claims(text: string, allowed: readonly RegExp[]): string[] {
  const hits: string[] = [];
  lex(text, { only: "comments" })
    .split("\n")
    .forEach((line, i) => {
      let rest = line;
      for (const a of allowed) rest = rest.replace(a, " ");
      if (FORBIDDEN_EN.test(rest) || FORBIDDEN_MS.test(rest)) hits.push(`line ${i + 1}: ${line.trim().slice(0, 100)}`);
    });
  return hits;
}

const supplierScreens = files(join(root, "src", "app", "supplier"))
  .map((p) => ({ path: posix(p), text: readFileSync(p, "utf8") }))
  .filter((s) => /from "@\/lib\/(?:bids\/online|sealing)[/"]/.test(s.text) || /from "@\/lib\/bids\/online"/.test(s.text));

const OFFICER_SCREENS = [
  "src/app/sourcing/[id]/opening/workspace.tsx",
  "src/app/sourcing/[id]/opening/online-words.ts",
  "src/app/sourcing/[id]/scope/key-section.tsx",
  "src/components/sealed-file-download.tsx",
  "src/app/configuration/bid-sealing/page.tsx",
];

describe("no screen calls a bid, a receipt or a submission signed, proof or verified, in either language (20j, 20s, 20ab)", () => {
  it("finds the supplier's online-bid screens by what they import, and there are several", () => {
    const names = supplierScreens.map((s) => s.path);
    expect(names.length).toBeGreaterThanOrEqual(8);
    for (const must of ["src/app/supplier/bids/[id]/receipt-card.tsx", "src/app/supplier/bids/[id]/bid-panel.tsx", "src/app/supplier/bids/[id]/submit/bid-form.tsx", "src/app/supplier/bids/[id]/submissions-list.tsx"]) {
      expect(names, must).toContain(must);
    }
  });

  it.each(supplierScreens.map((s) => [s.path, s.text]))("%s", (_path, text) => {
    expect(claims(text, Object.values(PERSON_STATE))).toEqual([]);
  });

  it.each(OFFICER_SCREENS)("the officers' screen %s", (path) => {
    expect(claims(readFileSync(join(root, path), "utf8"), [...Object.values(PERSON_STATE), ...Object.values(OFFICER_ACT)])).toEqual([]);
  });

  it("every allowed phrase has a reason", () => {
    for (const why of [...Object.keys(PERSON_STATE), ...Object.keys(OFFICER_ACT)]) expect(why.length).toBeGreaterThan(20);
  });

  it("the scan reads JSX text and string literals in both languages, and skips comments", () => {
    const allowed = Object.values(PERSON_STATE);
    expect(claims("<p>Your receipt is proof of delivery</p>", allowed)).toHaveLength(1);
    expect(claims('const a = "Bida anda telah disahkan";', allowed)).toHaveLength(1);
    expect(claims("<p>Resit yang ditandatangani</p>", allowed)).toHaveLength(1);
    expect(claims("<p>Your bid is verified</p>", allowed)).toHaveLength(1);
    expect(claims("<p>You are signed in</p>\n// the bid is verified here\n/* proof */", allowed)).toEqual([]);
    expect(claims("<p>Your bid is signed</p>", allowed)).toHaveLength(1);
  });
});

/**
 * Review of wave 3b (S15, F10): the sealing screens and the acts' returned messages and audit values must not say more than the design does. A share or a key "destroyed" is true of the live
 * copy only, and a database backup taken earlier still holds it; an estimate version is not "sealed" while its figure is plain in the database. So in the files below a line that says destroyed
 * must also say it is the live copy or that a backup holds it, nothing says a copy "cannot be recovered", and the estimate version is never said to be sealed as the lodged copy.
 */
const SEALING_WORDS = [
  "src/app/sourcing/[id]/scope/key-editors.tsx",
  "src/app/sourcing/[id]/scope/key-actions.ts",
  "src/app/sourcing/[id]/scope/substitution-actions.ts",
  "src/app/sourcing/[id]/scope/editors.tsx",
  "src/app/sourcing/[id]/scope/estimate-section.tsx",
  "src/app/sourcing/[id]/opening/online-finalise-actions.ts",
  "src/app/sourcing/[id]/opening/online-words.ts",
];

export function overclaims(text: string): string[] {
  const hits: string[] = [];
  lex(text, { only: "comments" })
    .split("\n")
    .forEach((line, i) => {
      const bad =
        (/\bdestroyed\b/i.test(line) && !/\b(?:live copy|backup)\b/i.test(line)) ||
        /\b(?:copy|share|key)\b[^.]*cannot be recovered/i.test(line) ||
        /\bis sealed under the exercise's key as the lodged copy\b/i.test(line);
      if (bad) hits.push(`line ${i + 1}: ${line.trim().slice(0, 100)}`);
    });
  return hits;
}

describe("the sealing screens and the acts' messages never overclaim (S15, F10)", () => {
  it.each(SEALING_WORDS)("%s", (path) => {
    expect(overclaims(readFileSync(join(root, path), "utf8"))).toEqual([]);
  });

  it("reads a returned message and an audit value, and passes the honest wording", () => {
    expect(overclaims('return { ok: true, message: "your own copy is destroyed" };')).toHaveLength(1);
    expect(overclaims("<p>Your own copy is then destroyed and cannot be recovered.</p>")).toHaveLength(1);
    expect(overclaims("{ share: `Released to X and destroyed` }")).toHaveLength(1);
    expect(overclaims("<p>The live copy is destroyed. A database backup taken before now still holds it.</p>")).toEqual([]);
  });
});
