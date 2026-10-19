import { describe, expect, it } from "vitest";

import * as labels from "./labels";
import { OPENING_FINDING_CODES, openingFindingText } from "./labels";

// Note 0005 R14, R15 (2026-10-20): text a screen builds from a label map is not a JSX paragraph, so the paragraph rule in
// scripts/ui-text-rules.mjs cannot see it. This does. Anything over 20 words is either a MoreText elsewhere or named here with its reason.
const LIMIT = 20;
const words = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

/// Texts allowed past the limit: the keys are the export and the entry.
const EXEMPT: Record<string, string> = {
  // Shared word for word with the key derivation, and pinned there (online-unseal.test.ts). It is a refusal that names who can act (R4).
  "finding.PEPPER_NOT_HELD": "operator refusal, shared with kdf.ts",
};

function strings(prefix: string, v: unknown, out: [string, string][]) {
  if (typeof v === "string") out.push([prefix, v]);
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) strings(`${prefix}.${k}`, x, out);
}

describe("opening label maps stay within the paragraph budget", () => {
  const found: [string, string][] = [];
  for (const [name, v] of Object.entries(labels)) strings(name, v, found);
  it("reads some labels", () => expect(found.length).toBeGreaterThan(20));
  it("keeps every fixed label at 20 words or fewer, or names the exemption", () => {
    const over = found.filter(([k, t]) => words(t) > LIMIT && !(k in EXEMPT)).map(([k, t]) => `${k} (${words(t)})`);
    expect(over).toEqual([]);
  });
});

describe("opening finding texts", () => {
  it("keeps every finding at 20 words or fewer, with the figures a finding carries counted as one word each", () => {
    const over = OPENING_FINDING_CODES.flatMap((code) =>
      [{ code, level: "block" as const }, { code, level: "block" as const, data: { online: 1, required: 3, sitting: 1, n: 2, count: 2 } }]
        .map((f) => [code, openingFindingText(f)] as const)
        .filter(([c, t]) => words(t) > LIMIT && !(`finding.${c}` in EXEMPT))
        .map(([c, t]) => `${c} (${words(t)}): ${t}`),
    );
    expect(over).toEqual([]);
  });
});
