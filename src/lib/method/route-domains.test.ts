import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import {
  EXERCISE_ROUTE_DOMAINS,
  EXERCISE_ROUTES_WHERE,
  exerciseRouteMatter,
  exerciseRoutesOf,
  invitationFault,
  nameRoutesOf,
  routesByDomain,
  tenderingRoutesOf,
} from "./approval";
import { SPEC_METHODS } from "./fixture";
import { APPOINTMENT_DOMAIN, NAME_APPROVAL_DOMAIN, TENDERING_APPROVAL_DOMAIN, WINDOW_CHANGE_DOMAIN, type Method } from "./types";
import { NEGOTIATION_DOMAIN } from "@/lib/evaluation/types";

/**
 * Ruling X-5: an exercise's own routes are told apart by domain, never by `awardId`
 * alone. Proved by behaviour (the splitter, and an approved tendering route that must
 * not satisfy the name gate) and by a scan of the source.
 */

type Route = { id: string; domain: string; awardId: string | null; status: "PENDING" | "APPROVED" | "REJECTED" | "RECALLED"; openedAt: Date };
const r = (id: string, domain: string, status: Route["status"], awardId: string | null = null, day = "2026-09-01"): Route => ({ id, domain, awardId, status, openedAt: new Date(day) });
const m = (code: string): Method => SPEC_METHODS.find((x) => x.code === code)!;

describe("the by-domain splitter", () => {
  const routes = [
    r("n1", NAME_APPROVAL_DOMAIN, "REJECTED"),
    r("t1", TENDERING_APPROVAL_DOMAIN, "APPROVED"),
    r("a1", APPOINTMENT_DOMAIN, "PENDING", "award1"),
    r("n2", NAME_APPROVAL_DOMAIN, "PENDING"),
    r("x1", "some_other_domain", "PENDING"),
  ];

  it("puts each route under its own domain, in the order given", () => {
    const by = routesByDomain(routes);
    expect(by[NAME_APPROVAL_DOMAIN].map((x) => x.id)).toEqual(["n1", "n2"]);
    expect(by[TENDERING_APPROVAL_DOMAIN].map((x) => x.id)).toEqual(["t1"]);
    expect(Object.keys(by).sort()).toEqual([...EXERCISE_ROUTE_DOMAINS].sort());
  });

  it("an award's route and a route of a domain the exercise does not own are in none of them", () => {
    expect(exerciseRoutesOf(routes).map((x) => x.id)).toEqual(["n1", "t1", "n2"]);
    // Even a name-domain route that belongs to an award is the award's.
    expect(nameRoutesOf([r("odd", NAME_APPROVAL_DOMAIN, "APPROVED", "award1")])).toEqual([]);
  });

  it("the shorthands agree with the splitter", () => {
    expect(nameRoutesOf(routes)).toEqual(routesByDomain(routes)[NAME_APPROVAL_DOMAIN]);
    expect(tenderingRoutesOf(routes)).toEqual(routesByDomain(routes)[TENDERING_APPROVAL_DOMAIN]);
  });

  it("the database filter names both the award and the domains", () => {
    // 6.5 (X-5, faithful update, flagged): the window_change domain joins the exercise's own.
    // 6.8 (X-5, faithful update, flagged): so does the negotiation's.
    expect(EXERCISE_ROUTES_WHERE).toEqual({ awardId: null, domain: { in: [NAME_APPROVAL_DOMAIN, TENDERING_APPROVAL_DOMAIN, WINDOW_CHANGE_DOMAIN, NEGOTIATION_DOMAIN] } });
  });
});

describe("an approved tendering route is not an approved name (plan 6.4 test 9, regression for the domain filter)", () => {
  it("with only an approved tendering route, the name is still not requested", () => {
    const routes = [r("t1", TENDERING_APPROVAL_DOMAIN, "APPROVED")];
    expect(invitationFault(m("selected_tender"), nameRoutesOf(routes))?.code).toBe("NAME_NOT_REQUESTED");
  });

  it("a later approved tendering route does not mask a pending name route", () => {
    const routes = [r("n1", NAME_APPROVAL_DOMAIN, "PENDING", null, "2026-09-01"), r("t1", TENDERING_APPROVAL_DOMAIN, "APPROVED", null, "2026-09-05")];
    expect(invitationFault(m("selected_tender"), nameRoutesOf(routes))?.code).toBe("NAME_NOT_APPROVED");
  });

  it("the approved name route still satisfies the gate beside a tendering route", () => {
    const routes = [r("n1", NAME_APPROVAL_DOMAIN, "APPROVED"), r("t1", TENDERING_APPROVAL_DOMAIN, "PENDING", null, "2026-09-05")];
    expect(invitationFault(m("selected_tender"), nameRoutesOf(routes))).toBeNull();
  });
});

describe("the worklist labels an exercise route by its domain", () => {
  it("name and tendering routes read and open differently", () => {
    expect(exerciseRouteMatter(NAME_APPROVAL_DOMAIN)).toEqual({ kind: "Approval of the name", tab: "name", auditNoun: "name approval" });
    expect(exerciseRouteMatter(TENDERING_APPROVAL_DOMAIN)).toEqual({ kind: "Approval for tendering", tab: "documents", auditNoun: "approval for tendering" });
  });
  it("a domain the product does not know never reads as a name approval", () => {
    const x = exerciseRouteMatter("some_other_domain");
    expect(x.kind).not.toMatch(/name/i);
    expect(x.tab).toBeNull();
  });
});

describe("no exercise-route reader filters on awardId alone (source scan, ruling X-5)", () => {
  const ROOT = process.cwd();
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) return f === "generated" || f === "node_modules" ? [] : walk(p);
      return /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : [];
    });
  const files = [...walk(join(ROOT, "src")), ...readdirSync(join(ROOT, "prisma")).filter((f) => /\.ts$/.test(f)).map((f) => join(ROOT, "prisma", f))];
  const text = (p: string) => readFileSync(p, "utf8");

  // Where `awardId: null` may stand without a domain, and why. Each is a demo-wipe
  // safety net that must catch every non-award route whatever its domain, not a reader.
  const ALLOWED: { file: string; line: RegExp; why: string }[] = [
    { file: "prisma/demo.ts", line: /approvalInstances: \{ some: \{ awardId: null, steps:/, why: "wipe: any own route of an exercise relying on a screen-made act" },
    { file: "prisma/demo.ts", line: /requisitionId: null, NOT: \{ exerciseId: demoRef \}, awardId: null,/, why: "wipe: any other route snapshotted under demo rows" },
  ];

  // The object literal a match sits in: from its opening brace to the matching close.
  const enclosing = (src: string, at: number): string => {
    let depth = 0;
    let open = at;
    for (; open >= 0; open--) {
      if (src[open] === "}") depth++;
      else if (src[open] === "{") {
        if (depth === 0) break;
        depth--;
      }
    }
    depth = 0;
    let close = at;
    for (; close < src.length; close++) {
      if (src[close] === "{") depth++;
      else if (src[close] === "}") {
        if (depth === 0) break;
        depth--;
      }
    }
    return src.slice(Math.max(open, 0), close + 1);
  };

  it("every `awardId: null` filter names a domain in the same object, or is an allowed wipe net", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const rel = relative(ROOT, f);
      const src = text(f);
      for (const hit of src.matchAll(/awardId:\s*(null|\{\s*equals:\s*null)/g)) {
        const obj = enclosing(src, hit.index!);
        if (/\bdomain\b/.test(obj)) continue;
        const line = src.slice(src.lastIndexOf("\n", hit.index!) + 1, src.indexOf("\n", hit.index!));
        if (ALLOWED.some((a) => a.file === rel && a.line.test(line))) continue;
        offenders.push(`${rel}: ${line.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the exercise loaders read routes through the domain filter", () => {
    const repo = text(join(ROOT, "src/lib/method/repo.ts"));
    expect(repo.match(/approvalInstances: \{[^]*?where: EXERCISE_ROUTES_WHERE/g)?.length).toBe(2);
  });

  it("no reader decides on an exercise's routes without the splitter", () => {
    // An exercise's loaded routes are read through nameRoutesOf / tenderingRoutesOf /
    // exerciseRoutesOf / routesByDomain. The history's id list (every route is history)
    // is the one direct read.
    // The routes may be reached through the locked context (`l.ex.approvalInstances`).
    const SPLIT = /(nameRoutesOf|tenderingRoutesOf|windowChangeRoutesOf|exerciseRoutesOf|routesByDomain)\(\s*(?:\w+\.)?$/;
    const offenders: string[] = [];
    for (const f of files) {
      const rel = relative(ROOT, f);
      const src = text(f);
      const re = rel === "src/app/sourcing/page.tsx" ? /\b(?:ex|exercise|r)\.approvalInstances\b/g : /\b(?:ex|exercise)\.approvalInstances\b/g;
      for (const hit of src.matchAll(re)) {
        const before = src.slice(Math.max(0, hit.index! - 40), hit.index!);
        const after = src.slice(hit.index! + hit[0].length, hit.index! + hit[0].length + 12);
        if (SPLIT.test(before)) continue;
        if (rel === "src/lib/method/repo.ts" && after.startsWith(".flatMap(")) continue;
        if (rel.startsWith("prisma/")) continue;
        offenders.push(`${rel}: …${before.slice(-30)}${hit[0]}${after}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the worklist labels exercise routes by domain, with no fixed name label", () => {
    const load = text(join(ROOT, "src/lib/approvals/load.ts"));
    expect(load).toMatch(/exerciseRouteMatter\(r\.domain\)/);
    expect(load).not.toMatch(/"Approval of the name"/);
    expect(load).not.toMatch(/\?tab=name/);
  });
});
