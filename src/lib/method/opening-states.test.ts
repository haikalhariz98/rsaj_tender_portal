import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { exerciseAllowsBq } from "@/lib/scope/bq";
import { exerciseAllowsEstimate } from "@/lib/scope/estimate";
import { exerciseAllowsPanel } from "@/lib/scope/panel";
import { isPublishedStatus } from "@/lib/bids/types";
import { exerciseFrozen } from "@/lib/documents/attach";
import { windowEditFault } from "@/lib/window/edit";
import { inviteeEditFault } from "@/lib/window/invitees";
import { isPublished, windowPhase } from "@/lib/window/phase";

import { EXERCISE_TRANSITIONS, transitionFault } from "./exercise";
import { EXERCISE_STATUS_LABEL, EXERCISE_STATUS_TONE, findingText } from "./labels";

/**
 * 6.7 (X-6, X-8, §7.3.2): the opening's two states. Each arrived alone in its own migration; every
 * map decides them; the box is opened only by the unseal (two authorisations) and the exercise is
 * Opened only by the main opening's finalising; once opened it still reads as published, so its
 * window stays CLOSED and its pack, bill, invitee list and window stay frozen.
 */

const root = process.cwd();
const dir = join(root, "prisma/migrations");
const migrations = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
const sqlOf = (m: string) => readFileSync(join(dir, m, "migration.sql"), "utf8");
const statements = (m: string) => sqlOf(m).split("\n").filter((l) => l.trim() && !l.trim().startsWith("--"));
const today = "2026-11-17";
const codes = (fs: readonly { code: string }[]) => fs.map((f) => f.code);

describe("the opening's states (X-6)", () => {
  it.each(["OPENING_IN_PROGRESS", "OPENED"])("%s arrived alone in its own migration, before any use", (value) => {
    const own = migrations.filter((m) => new RegExp(`ALTER TYPE "ExerciseStatus" ADD VALUE '${value}'`).test(sqlOf(m)));
    expect(own).toHaveLength(1);
    expect(statements(own[0])).toHaveLength(1);
    for (const u of migrations.filter((m) => m !== own[0] && sqlOf(m).includes(`'${value}'`))) expect(own[0] < u).toBe(true);
  });

  it("have words and tones", () => {
    expect(EXERCISE_STATUS_LABEL.OPENING_IN_PROGRESS).toBe("Opening in progress");
    expect(EXERCISE_STATUS_LABEL.OPENED).toBe("Opened");
    expect(EXERCISE_STATUS_TONE.OPENED).toBe("ok");
  });
});

describe("only their acts make them (§7.3.2)", () => {
  it("published → opening in progress only by the unseal, on two authorisations", () => {
    for (const from of ["ADVERTISED", "INVITED"] as const) {
      expect(transitionFault(from, "OPENING_IN_PROGRESS", { today, via: "UNSEAL", authorisations: 2 })).toEqual([]);
      expect(codes(transitionFault(from, "OPENING_IN_PROGRESS", { today, via: "UNSEAL", authorisations: 1 }))).toEqual(["UNSEAL_NOT_AUTHORISED"]);
      expect(codes(transitionFault(from, "OPENING_IN_PROGRESS", { today }))).toEqual(["NOT_BY_THIS_ACT"]);
    }
    expect(findingText({ code: "UNSEAL_NOT_AUTHORISED", level: "block" })).toMatch(/two different panel members/);
  });

  it("opening in progress → opened only by finalising the main opening, with nothing blocking", () => {
    expect(transitionFault("OPENING_IN_PROGRESS", "OPENED", { today, via: "OPENING_FINALISED", finaliseFaults: 0 })).toEqual([]);
    expect(codes(transitionFault("OPENING_IN_PROGRESS", "OPENED", { today, via: "OPENING_FINALISED", finaliseFaults: 2 }))).toEqual(["OPENING_NOT_READY"]);
    expect(codes(transitionFault("OPENING_IN_PROGRESS", "OPENED", { today, via: "OPENING_FINALISED" }))).toEqual(["OPENING_NOT_READY"]);
    expect(codes(transitionFault("ADVERTISED", "OPENED", { today, via: "OPENING_FINALISED", finaliseFaults: 0 }))).toEqual(["NOT_ALLOWED"]);
  });

  it("cancelling either stays the window-change route's (C-9)", () => {
    expect(EXERCISE_TRANSITIONS.OPENING_IN_PROGRESS).toEqual(["OPENED", "CANCELLED"]);
    // 6.8 (X-8, flagged faithful update): opened now goes on to the evaluation; cancelling is unchanged.
    expect(EXERCISE_TRANSITIONS.OPENED).toEqual(["UNDER_EVALUATION", "CANCELLED"]);
    for (const from of ["OPENING_IN_PROGRESS", "OPENED"] as const) {
      expect(transitionFault(from, "CANCELLED", { today, via: "WINDOW_CANCELLATION", reason: "Every bid rejected" })).toEqual([]);
      expect(codes(transitionFault(from, "CANCELLED", { today, reason: "Every bid rejected" }))).toEqual(["NOT_BY_THIS_ACT"]);
    }
  });
});

describe("once opened, the exercise still reads as published (X-8)", () => {
  const W = { purchaseFromDay: new Date("2026-10-21T00:00:00Z"), purchaseCloseDay: new Date("2026-11-10T00:00:00Z"), closingAt: new Date("2026-11-17T06:30:00Z") };
  it.each(["OPENING_IN_PROGRESS", "OPENED"] as const)("%s: the window is CLOSED, the pack, bill and lists frozen", (status) => {
    expect(isPublished(status)).toBe(true);
    expect(isPublishedStatus(status)).toBe(true);
    expect(windowPhase({ status, ...W }, new Date("2026-11-18T01:00:00Z"), "Asia/Kuala_Lumpur").phase).toBe("CLOSED");
    expect(exerciseAllowsBq(status)).toBe("PACK_FROZEN");
    expect(exerciseAllowsPanel(status)).toBe("PACK_FROZEN");
    expect(exerciseAllowsEstimate(status)).toBe("OPEN");
    expect(windowEditFault(status, "TENDER")?.code).toBe("WINDOW_PUBLISHED");
    expect(inviteeEditFault(status)?.code).toBe("LIST_FROZEN");
    expect(exerciseFrozen(status)).toBe(false);
  });
});
