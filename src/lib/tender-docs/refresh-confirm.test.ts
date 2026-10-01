import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CHANGED_SINCE_OPENED, changeListKey, confirmedChangesFault, flagChanges } from "./refresh";

/**
 * 64-C2: refreshing a draft's answers writes only the change list the officer confirmed. The
 * drawer carries the key of the list it showed; the act recomputes the list under the lock and
 * refuses on any difference.
 */

const p = (partCode: string, mandatory: boolean | null, inTableDocument: boolean | null) => ({ partCode, printedNumber: partCode.toUpperCase(), label: `Part ${partCode}`, mandatory, inTableDocument });
const c = (code: string, mandatory: boolean | null, inTableDocument: boolean | null) => ({ code, mandatory, inTableDocument });

const parts = [p("a", null, null), p("b", true, null)];
const opened = flagChanges(parts, [c("a", true, false), c("b", true, true)]);
const shown = changeListKey(opened);

describe("the confirmed list against the list computed under the lock", () => {
  it("the same configuration: the confirmed list is the list, and the refresh proceeds", () => {
    expect(confirmedChangesFault(shown, flagChanges(parts, [c("a", true, false), c("b", true, true)]))).toBeNull();
  });
  it("an answer's target changed since opening: refused with the fixed sentence", () => {
    const now = flagChanges(parts, [c("a", false, false), c("b", true, true)]);
    expect(confirmedChangesFault(shown, now)).toBe("Configuration changed since you opened this; review again.");
    expect(CHANGED_SINCE_OPENED).toBe("Configuration changed since you opened this; review again.");
  });
  it("a change added since opening is refused, not written unseen", () => {
    const now = flagChanges([...parts, p("c", null, null)], [c("a", true, false), c("b", true, true), c("c", true, true)]);
    expect(confirmedChangesFault(shown, now)).toBe(CHANGED_SINCE_OPENED);
  });
  it("a change gone since opening (configuration put back, or another refresh taken) is refused", () => {
    expect(confirmedChangesFault(shown, flagChanges(parts, [c("a", true, false), c("b", true, null)]))).toBe(CHANGED_SINCE_OPENED);
    expect(confirmedChangesFault(shown, [])).toBe(CHANGED_SINCE_OPENED);
  });
  it("the part's answer moved underneath (from differs, to the same) is refused", () => {
    const now = flagChanges([p("a", false, null), p("b", true, null)], [c("a", true, false), c("b", true, true)]);
    expect(confirmedChangesFault(shown, now)).toBe(CHANGED_SINCE_OPENED);
  });
  it("no confirmation, or an empty one, never matches a list with changes", () => {
    expect(confirmedChangesFault(null, opened)).toBe(CHANGED_SINCE_OPENED);
    expect(confirmedChangesFault(undefined, opened)).toBe(CHANGED_SINCE_OPENED);
    expect(confirmedChangesFault("", opened)).toBe(CHANGED_SINCE_OPENED);
  });
  it("the key is the effect, in part order: the order the rows come in does not matter", () => {
    expect(changeListKey([...opened].reverse())).toBe(shown);
  });
  it("the key tells mandatory from the Tender Table Document answer", () => {
    expect(changeListKey([{ partCode: "a", part: "A", mandatory: { from: null, to: true } }])).not.toBe(changeListKey([{ partCode: "a", part: "A", inTableDocument: { from: null, to: true } }]));
  });
});

describe("the act and the drawer carry the confirmed list (source scan)", () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
  it("refreshPartFlags compares the confirmed list with the one it computes inside the locked transaction, before writing", () => {
    const src = read("src/app/sourcing/[id]/documents/actions.ts");
    const i = src.indexOf("export async function refreshPartFlags(");
    const next = src.indexOf("\nexport async function ", i + 10);
    const body = src.slice(i, next === -1 ? undefined : next);
    expect(body).toMatch(/data\.get\("confirmedChanges"\)/);
    const locked = body.slice(body.indexOf("inPacks("));
    expect(locked).toMatch(/flagChanges\([\s\S]*loadConfiguredParts\([^\n]*tx\)[\s\S]*confirmedChangesFault\([\s\S]*return \{ ok: false, message: changed \}[\s\S]*tenderPackPart\.update/);
  });
  it("the drawer posts the key of the list it shows, computed from the same configuration", () => {
    expect(read("src/app/sourcing/[id]/documents/editors.tsx")).toMatch(/hidden\("confirmedChanges"\)/);
    expect(read("src/lib/tender-docs/read.ts")).toMatch(/refreshKey: [^\n]*changeListKey\(flagChanges\(p\.parts\.map\(partFactsOf\), c\.configured\)\)/);
    expect(read("src/app/sourcing/[id]/documents/workspace.tsx")).toMatch(/confirmedChanges=\{d\.pack\.refreshKey/);
  });
});
