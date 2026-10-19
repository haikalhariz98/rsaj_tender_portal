import { describe, expect, it } from "vitest";

import * as bidsLabels from "./labels";
import * as received from "./online/received";
import * as openingMatrix from "@/lib/opening/matrix";
import * as unpurchased from "@/lib/opening/unpurchased";

// Note 0005 R15 (2026-10-20): text a screen builds from a label map is not a JSX paragraph, so the paragraph rule in
// scripts/ui-text-rules.mjs cannot see it. Anything over 20 words is behind an information button (named here) or cut.
const LIMIT = 20;
const words = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

/// Behind an information button, never on the surface; the keys are the export path.
const BEHIND_A_BUTTON: Record<string, string> = {
  "REGISTER_STATEMENT.body": "popover of the Envelopes only chip",
  "RECEIVED_WORDS.ordinalNote.en": "information button beside the online count",
};

function strings(prefix: string, v: unknown, out: [string, string][]) {
  if (typeof v === "string") out.push([prefix, v]);
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) strings(`${prefix}.${k}`, x, out);
}

describe("bids and opening label maps stay within the paragraph budget", () => {
  const found: [string, string][] = [];
  for (const mod of [bidsLabels, received, openingMatrix, unpurchased]) for (const [name, v] of Object.entries(mod)) strings(name, v, found);
  it("reads some labels", () => expect(found.length).toBeGreaterThan(20));
  it("keeps every fixed label at 20 words or fewer, or names where it is hidden", () => {
    const over = found.filter(([k, t]) => words(t) > LIMIT && !(k in BEHIND_A_BUTTON)).map(([k, t]) => `${k} (${words(t)}): ${t}`);
    expect(over).toEqual([]);
  });
});
