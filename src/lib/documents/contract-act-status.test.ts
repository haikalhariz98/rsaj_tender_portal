import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { actStatusFault, actStatusText, ACT_STATUS } from "@/lib/contract/act-status";
import { CONTRACT_STATUSES, type ContractStatus } from "@/lib/contract/types";

import { attachFault, CONTRACT_PURPOSE_FAMILY, detachFault, ownerState, type OwnerFacts } from "./attach";
import { documentFaultText, EXIT_TEXT, exitWords } from "./labels";
import { attachTargets } from "./targets";
import { ATTACHMENT_PURPOSES, PURPOSE_OWNER, type AttachmentPurpose } from "./types";

/**
 * BD-613-115, as ruled and brought forward into the Run 1a fix round (review S6). Every contract attachment purpose reads
 * its owning family's ACT_STATUS row first (one table, BD-613-99), then its own rule. The site records (pipe log,
 * as-built, diary photographs) read SUPERVISION and are kept from possession, so as-built evidence can be attached at
 * practical completion (FR-PAY-021, FR-SUP-009). CLOSED freezes every purpose (FR-FIN-014). The attach screen and the
 * store give the same answer for each purpose in each state.
 */

const CONTRACT_PURPOSES = ATTACHMENT_PURPOSES.filter((p) => PURPOSE_OWNER[p] === "contract" || PURPOSE_OWNER[p] === "variationInstruction");
const SITE: readonly AttachmentPurpose[] = ["PIPE_LOG", "AS_BUILT", "DIARY_PHOTO"];

const factsFor = (p: AttachmentPurpose, status: ContractStatus): OwnerFacts =>
  PURPOSE_OWNER[p] === "variationInstruction"
    ? { kind: "variationInstruction", contractStatus: status, certificateStatus: "ISSUED", variationClosed: false }
    : { kind: "contract", status, legalSubmitted: true, contractorSigned: false };

describe("BD-613-115: a contract's attachments read the act x status table first", () => {
  it("every purpose a contract (or its instruction) keeps names its owning family", () => {
    expect(Object.keys(CONTRACT_PURPOSE_FAMILY).sort()).toEqual([...CONTRACT_PURPOSES].sort());
    for (const p of ["COMPANY_RESOLUTION", "LEGAL_SUBMISSION", "LEGAL_COMMENTS", "RECONCILIATION", "SIGNED_CONTRACT", "STAMPING_CERTIFICATE"] as const) expect(CONTRACT_PURPOSE_FAMILY[p], p).toBe("FORMATION");
    for (const p of ["PROGRAMME", "PIPE_LOG", "AS_BUILT", "DIARY_PHOTO"] as const) expect(CONTRACT_PURPOSE_FAMILY[p], p).toBe("SUPERVISION");
    expect(CONTRACT_PURPOSE_FAMILY.INSTRUCTION_SKETCH).toBe("VARIATION");
  });

  it("wherever the family's row refuses, the purpose is not open, in the table's words (cancelled keeps its own)", () => {
    for (const p of CONTRACT_PURPOSES) {
      const family = CONTRACT_PURPOSE_FAMILY[p as keyof typeof CONTRACT_PURPOSE_FAMILY];
      for (const s of CONTRACT_STATUSES) {
        const f = actStatusFault(family, s);
        if (!f) continue;
        const st = ownerState(p, factsFor(p, s));
        expect(st.state, `${p} ${s}`).not.toBe("OPEN");
        if (st.state === "OPEN") continue;
        expect(exitWords(st), `${p} ${s}`).toBe(f.code === "CONTRACT_CANCELLED" ? EXIT_TEXT.CONTRACT_CANCELLED : actStatusText(f));
      }
    }
  });

  it("the site records are kept from possession: open active, practically complete and making good complete; refused before", () => {
    for (const p of SITE) {
      for (const s of ["ACTIVE", "PRACTICALLY_COMPLETE", "MAKING_GOOD_COMPLETE"] as const) expect(ownerState(p, factsFor(p, s)), `${p} ${s}`).toEqual({ state: "OPEN" });
      for (const s of ["IN_PREPARATION", "LEGALLY_ENDORSED", "EXECUTED", "STAMPED"] as const) {
        const st = ownerState(p, factsFor(p, s));
        expect(st, `${p} ${s}`).toEqual({ state: "NOT_READY", exit: "POSSESSION_NOT_RECORDED" });
        expect(exitWords(st as { exit: "POSSESSION_NOT_RECORDED" })).toBe("This is kept from possession of site, recorded on the contract's Site tab.");
      }
      for (const s of ["FINAL_CERTIFICATE_ISSUED", "TERMINATED", "CLOSED"] as const) expect(ownerState(p, factsFor(p, s)).state, `${p} ${s}`).toBe("FROZEN");
    }
  });

  it("as-built evidence attaches at practical completion (no dead end for the 50% retention release)", () => {
    const f = attachFault({ purpose: "AS_BUILT", owner: factsFor("AS_BUILT", "PRACTICALLY_COMPLETE"), version: { withdrawnAt: null }, documentClass: { classification: "INTERNAL" } });
    expect(f.filter((x) => x.level === "block")).toEqual([]);
  });

  it("CLOSED freezes every purpose, and nothing comes off a closed contract", () => {
    for (const p of CONTRACT_PURPOSES) {
      const st = ownerState(p, factsFor(p, "CLOSED"));
      expect(st.state, p).toBe("FROZEN");
      expect(detachFault({ purpose: p, owner: factsFor(p, "CLOSED"), reason: "wrong file", reliedOn: null }).map((x) => x.code), p).toEqual(["OWNER_FROZEN"]);
    }
    expect(ACT_STATUS.FORMATION.CLOSED).toBe("REFUSED");
    expect(ACT_STATUS.SUPERVISION.CLOSED).toBe("REFUSED");
    expect(ACT_STATUS.VARIATION.CLOSED).toBe("REFUSED");
  });

  it("the attach screen and the store give the same answer for each purpose in each state", () => {
    for (const p of CONTRACT_PURPOSES) {
      for (const s of CONTRACT_STATUSES) {
        const facts = factsFor(p, s);
        const screen = attachTargets([{ id: "x", label: "x", facts }])[0].purposes.find((x) => x.value === p)!;
        const store = attachFault({ purpose: p, owner: facts, version: { withdrawnAt: null }, documentClass: { classification: "INTERNAL" } }).filter((x) => x.code === "OWNER_NOT_READY" || x.code === "OWNER_FROZEN");
        expect(screen.open, `${p} ${s}`).toBe(store.length === 0);
        expect(screen.reason, `${p} ${s}`).toBe(store.length ? documentFaultText(store[0]) : null);
      }
    }
  });

  it("the owner page and the target list say a closed state's reason by exitWords, never by the bare exit (source)", () => {
    for (const f of ["src/lib/documents/read.ts", "src/lib/documents/targets.ts"]) {
      const src = readFileSync(f, "utf8");
      expect(src, f).toMatch(/exitWords\(st\)/);
      expect(src, f).not.toMatch(/EXIT_TEXT\[st\.exit\]/);
    }
  });
});
