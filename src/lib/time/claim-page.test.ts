import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { EOT_CLAIM_STATES, EOT_NEXT } from "./claim-state";

/** Plan closeout-plan.md §3.1, A4: the claim page renders one primary action per state, the one `eotNext` names (source). */

const page = readFileSync("src/app/projects/[id]/eot/[claimId]/page.tsx", "utf8");

describe("the claim page's one primary action", () => {
  it("each action eotNext can name is drawn once, from `next`, and nothing else decides it", () => {
    const actions = [...new Set(EOT_CLAIM_STATES.map((s) => EOT_NEXT[s]).filter((a): a is NonNullable<typeof a> => a != null))];
    for (const a of actions) expect(page.split(`if (next === "${a}"`).length - 1, a).toBe(1);
    expect(page).toMatch(/const next = eotNext\(state\);/);
    expect(page).toMatch(/const state = eotClaimState\(claimStateFactsOf\(m\)\);/);
  });
});
