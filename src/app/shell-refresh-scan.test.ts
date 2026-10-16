import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * GN-04 / AC-13: the badges beside My approvals and Inbox are drawn by the layout, so every act that moves a person's steps must draw the layout again
 * (`revalidatePath("/", "layout")`), or the number stays stale until the next navigation. Each action below is read from source: it must reach a carrier
 * (the helper every one of that file's acts finishes through), and each carrier must itself revalidate the layout.
 */
const ROOT = join(__dirname, "..", "..");
const read = (file: string) => readFileSync(join(ROOT, file), "utf8").replace(/\r\n/g, "\n");
const LAYOUT = /revalidatePath\("\/", "layout"\)/;

/// The source of a top-level function: from its declaration to its closing brace at column zero.
function fnSource(src: string, name: string): string {
  const m = new RegExp(String.raw`(?:export\s+)?(?:async\s+)?function\s+${name}\b`).exec(src);
  if (!m) throw new Error(`No function ${name}`);
  const end = src.indexOf("\n}\n", m.index);
  return src.slice(m.index, end < 0 ? undefined : end);
}

interface Entry {
  file: string;
  /// The step-changing actions: decide, send for approval, send back, recall, delegate, escalate, cite a committee's decision against a step.
  actions: string[];
  /// How an action reaches its carrier.
  via: RegExp;
  /// The helper(s) every act of the file finishes through, and the file each lives in.
  carriers: { file: string; fn: string }[];
}

const P = "src/app/projects/[id]";
const ENTRIES: Entry[] = [
  { file: "src/app/approvals/actions.ts", actions: ["escalateStep"], via: /\bescalateOne\(/, carriers: [{ file: "src/app/approvals/actions.ts", fn: "escalateOne" }] },
  { file: "src/app/requisitions/actions.ts", actions: ["submitRequisition", "recordDecision", "returnRequisition", "recallRequisition", "citeCommitteeDecision", "chooseWhereItGoes"], via: /\binRequisition\(|\brefresh\(/, carriers: [{ file: "src/app/requisitions/actions.ts", fn: "refresh" }] },
  { file: "src/app/awards/actions.ts", actions: ["submitAward", "recallAward", "chooseAwardRejection", "decideAppointmentStep", "citeAppointmentDecision"], via: /\binAward\(|\brefresh\(/, carriers: [{ file: "src/app/awards/actions.ts", fn: "refresh" }] },
  { file: `${P}/actions.ts`, actions: ["decideLegal", "recallCopy"], via: /\binContract\(/, carriers: [{ file: `${P}/actions.ts`, fn: "inContract" }] },
  { file: `${P}/variation-actions.ts`, actions: ["decideVariation", "sendVariationForApproval", "decideVariationApprovalStep", "citeVariationCommittee"], via: /\binContract\(/, carriers: [{ file: `${P}/variation-actions.ts`, fn: "inContract" }] },
  { file: `${P}/supervision-actions.ts`, actions: ["decideProgramme"], via: /\binContract\(/, carriers: [{ file: `${P}/supervision-actions.ts`, fn: "inContract" }] },
  { file: `${P}/matter-actions.ts`, actions: ["tableContractMatter", "citeContractMatterDecision", "decideContractMatterStep", "chooseContractMatterRejection"], via: /\brun\(|\binContract\(/, carriers: [{ file: "src/lib/matter/act.ts", fn: "afterAct" }] },
  { file: `${P}/certificates/[certId]/actions.ts`, actions: ["sendCertificateForRouting", "sendCertificateToSigning", "sendCertificateForApproval", "decideCertificateRouteStep"], via: /\binCertificate\(/, carriers: [{ file: `${P}/certificates/[certId]/actions.ts`, fn: "inCertificate" }] },
  { file: "src/app/sourcing/actions.ts", actions: ["recallNameApproval", "recordNameDecision", "citeNameDecision"], via: /\binExercise\(|\brefresh\(/, carriers: [{ file: "src/app/sourcing/actions.ts", fn: "refresh" }] },
  { file: "src/app/sourcing/[id]/documents/actions.ts", actions: ["submitPack", "recordTenderingDecision"], via: /\binPacks\(/, carriers: [{ file: "src/app/sourcing/[id]/documents/actions.ts", fn: "inPacks" }] },
  { file: "src/app/committees/actions.ts", actions: ["recordOutcome"], via: /\binSitting\w*\(|\brefresh\(/, carriers: [{ file: "src/app/committees/actions.ts", fn: "refresh" }] },
];

describe("every act that moves a person's steps redraws the layout, so the shell's badges follow (GN-04, AC-13)", () => {
  for (const e of ENTRIES) {
    it(`${e.file}`, () => {
      const src = read(e.file);
      for (const a of e.actions) {
        const body = fnSource(src, a);
        expect(`${a}: ${e.via.test(body) || LAYOUT.test(body)}`).toBe(`${a}: true`);
      }
      for (const c of e.carriers) expect(`${c.fn}: ${LAYOUT.test(fnSource(read(c.file), c.fn))}`).toBe(`${c.fn}: true`);
    });
  }

  it("the carriers that hand over to another helper do so", () => {
    expect(fnSource(read(`${P}/matter-actions.ts`), "inContract")).toMatch(/\bafterAct\(/);
    expect(fnSource(read(`${P}/time-actions.ts`), "inContract")).toMatch(/\bafterAct\(/);
  });

  it("the shell no longer counts the Dashboard: loadShell returns the organisation alone", () => {
    expect(read("src/lib/shell.ts")).not.toMatch(/db.committeeDecision|counts:/);
  });

  it("the Inbox's own act redraws the layout where notices are marked read", () => {
    const src = read("src/app/inbox/actions.ts");
    expect(LAYOUT.test(fnSource(src, "markNoticesRead"))).toBe(true);
    expect(LAYOUT.test(fnSource(src, "confirmBackdatingAction"))).toBe(true);
  });
});
