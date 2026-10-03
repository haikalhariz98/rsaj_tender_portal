import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { lex } from "@/lib/scan/source";

/**
 * The screens and the acts agree (6.13 Part A step 4): every refusal shown beside a variation's button is the act's own
 * rule, called on the screen and in the act. A screen that restated a rule would drift from it; these scans hold each
 * pair to the one function. And the certificate page's preview of a variation's application or order reads the same
 * approval-of-record rule the core's proceed-to-signing act runs.
 */

const ROOT = path.join(__dirname, "../../..");
const read = (f: string) => lex(readFileSync(path.join(ROOT, f), "utf8"));
const ACTS = read("src/app/projects/[id]/variation-actions.ts");
const PAGE = read("src/app/projects/[id]/variations/[variationId]/page.tsx");
const calls = (src: string, fn: string) => new RegExp(`\\b${fn}\\(`).test(src);

describe("a variation's page judges each button by the act's own rule", () => {
  for (const fn of ["submitFaults", "soDecisionFaults", "sendFaults", "closeFaults", "commenceFaults", "instructionFaults", "measurementFaults", "orderFaults"]) {
    it(fn, () => {
      expect(calls(PAGE, fn), `page calls ${fn}`).toBe(true);
      expect(calls(ACTS, fn) || calls(read("src/lib/variation/route-write.ts"), fn), `an act calls ${fn}`).toBe(true);
    });
  }

  it("the percentage on the page is the reading the send act freezes (variationReading over the same inputs)", () => {
    expect(calls(PAGE, "variationReading")).toBe(true);
    expect(calls(ACTS, "variationReading")).toBe(true);
  });

  it("the order's coverage on the page is the rule the core runs before signing", () => {
    expect(calls(PAGE, "orderApprovalFaults")).toBe(true);
    expect(calls(read("src/lib/variation/at-certificate.ts"), "orderApprovalFaults")).toBe(true);
  });
});

describe("the certificate page's preview and the core agree on a variation's approval of record", () => {
  it("both call approvalOfRecordFaults", () => {
    expect(calls(read("src/app/projects/[id]/certificates/[certId]/page.tsx"), "approvalOfRecordFaults")).toBe(true);
    expect(calls(read("src/lib/certificate/write.ts"), "approvalOfRecordFaults")).toBe(true);
  });
});

describe("no code reaches the screen", () => {
  it("the page renders codes only through their word maps, never a raw status, event or exemption", () => {
    // A raw enum interpolated into text (`${v.status}`, `{v.event}`) would put a code on screen.
    for (const field of ["status", "event", "exemption", "origin", "soDecision", "scheduleForm", "direction", "rateSource"]) {
      expect(PAGE, field).not.toMatch(new RegExp(`\\$\\{[a-z]+\\.${field}\\}`));
      expect(PAGE, field).not.toMatch(new RegExp(`>\\{[a-z]+\\.${field}\\}<`));
    }
  });
});
