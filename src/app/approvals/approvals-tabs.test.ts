import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { mayReadQueue } from "@/lib/auth/configuration-change";
import type { PermissionKey } from "@/lib/auth/types";

const src = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const held = (...k: PermissionKey[]) => new Set<PermissionKey>(k);

describe("the Settings changes tab of My approvals (plan 5.7, NFR-SEC-004, FR-APR-020)", () => {
  it("is hidden from a reader who holds no permission that reads the queue", () => {
    expect(mayReadQueue(held())).toBe(false);
  });
  it("is shown to a decider of a kind and to a reader of the audit trail", () => {
    expect(mayReadQueue(held("security.policy"))).toBe(true);
    expect(mayReadQueue(held("audit.read"))).toBe(true);
  });
  it("is built only behind that gate, and only read while it is the open tab", () => {
    const page = src("src/app/approvals/page.tsx");
    expect(page).toContain("const showQueue = mayReadQueue(actor.permissions)");
    expect(page).toContain("...(showQueue ?");
    expect(page).toContain('tab === "changes"');
  });
  it("the old address redirects there, and the decisions keep their own server checks", () => {
    expect(src("src/app/configuration/changes/page.tsx")).toContain('redirect("/approvals?tab=changes")');
    expect(src("src/app/configuration/changes/actions.ts")).toContain("guard");
  });
});
