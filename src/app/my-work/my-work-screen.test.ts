import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { lex } from "@/lib/scan/source";

/** My work (3b-ii step 8), read from the code: what the page asks, how it is addressed, and that every work act refreshes it. */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const page = read("src/app/my-work/page.tsx");
const panel = read("src/app/my-work/item-panel.tsx");
const actions = read("src/app/projects/[id]/work-actions.ts");

describe("My work screen", () => {
  it("reads the signed-in person's rows for the actor's organisation, and states no grouping or arithmetic of its own", () => {
    expect(page).toMatch(/loadMyWork\(\{ organisationId: actor\.organisationId, personId: actor\.personId, today \}\)/);
    expect(page).toContain("const actor = await requireStaff();");
    expect(lex(page)).not.toMatch(/dayPlus|\.filter\(\(r\) => r\.dueOn|new Date\(/);
  });

  it("each row opens its item with the contract in the address, and the panel is asked that one contract by the organisation", () => {
    expect(page).toMatch(/href: myWorkHref\(\{ contract: r\.contractId, item: r\.ref \}\)/);
    expect(panel).toMatch(/loadWorkContext\(\{ organisationId, contractId, now: new Date\(\) \}\)/);
    expect(panel).toContain("actStatusBlocker(\"WORK_ITEM\"");
  });

  it("shows words, not codes: the status through STATUS_WORDS, the group through MY_WORK_WORDS", () => {
    expect(page).toContain("STATUS_WORDS[r.status].en");
    expect(page).toContain("MY_WORK_WORDS[g.section]");
    expect(lex(page)).not.toMatch(/\{r\.(?:status|type|group)\}/);
  });

  it("every work act refreshes /my-work, a refusal included; the shell counts nothing for it", () => {
    const helper = actions.slice(actions.indexOf("async function inContract("), actions.indexOf("const stateWords"));
    expect((helper.match(/revalidatePath\("\/my-work"\)/g) ?? []).length).toBe(2);
    expect(read("src/app/_auth/worklist.ts")).not.toContain("/my-work");
  });
});
