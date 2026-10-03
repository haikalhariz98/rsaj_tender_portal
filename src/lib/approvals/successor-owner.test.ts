import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A successor route (ADR 0009) continues on the same matter: every typed owner key a route can carry is copied from the
 * rejected route, so the continued approval still names what it approves (6.13 Part A step 4: a variation's route).
 */

const src = readFileSync(path.join(__dirname, "rejection-store.ts"), "utf8");
const body = src.slice(src.indexOf("export async function openSuccessor"));

describe("openSuccessor copies every owner of the route", () => {
  it.each(["requisitionId", "exerciseId", "awardId", "certificateId", "variationId", "submittedByPersonId", "matterKind"])("%s", (key) => {
    expect(body).toMatch(new RegExp(`\\b${key}: r\\.${key},`));
  });
});
