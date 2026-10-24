import { describe, expect, it } from "vitest";

import type { CommencementState } from "@/lib/award/commencement";
import type { GateItem } from "@/lib/award/readiness";
import { AWARD_STATUSES, type AwardStatus, type InstrumentKind } from "@/lib/award/types";

import { caseStage, type CaseStanding } from "./case-stage";
import {
  AWARD_ACTS,
  CASE_ACTION_NEXT,
  CASE_STEP_KEYS,
  CaseFactsError,
  caseSteps,
  defaultCaseStep,
  type AwardStepFacts,
  type BeforeSigningFacts,
  type CaseFacts,
  type CaseStep,
  type CaseStepKey,
  type SigningAct,
  type SigningFacts,
} from "./case-steps";
import { caseTabToStep } from "./case-tabs";
import { CONTRACT_STATUSES, type ContractStatus } from "./types";

// ------------------------------------------------------------------ fixtures

const award = (status: AwardStatus, over: Partial<AwardStepFacts> = {}): AwardStepFacts => ({
  status,
  instrumentKind: "LETTER_OF_ACCEPTANCE",
  submitBlocks: [],
  issueReady: false,
  issueFaults: [],
  despatchOpen: 0,
  returnOffered: false,
  returned: false,
  commencement: null,
  commencementOffered: false,
  ...over,
});
const item = (key: GateItem["key"], state: GateItem["state"]): GateItem => ({ key, state, detail: [] });
const gate = (returned: GateItem["state"], bond: GateItem["state"], insurance: GateItem["state"]) => {
  const items = [item("RETURNED", returned), item("BOND", bond), item("INSURANCE", insurance)];
  return { ready: items.every((i) => i.state === "MET"), items };
};
const before = (over: Partial<BeforeSigningFacts> = {}): BeforeSigningFacts => ({ readiness: gate("MET", "NOT_MET", "NOT_MET"), securitiesToVerify: 0, lodgeOffered: false, ...over });
const signing = (status: ContractStatus, act: SigningFacts["act"] = null): SigningFacts => ({ status, act });
const live = (stage: Extract<CaseStanding, { kind: "LIVE" }>["stage"]): CaseStanding => ({ kind: "LIVE", stage });

const facts = (over: Partial<CaseFacts>): CaseFacts => ({ visibility: "WHOLE", standing: live("AWARDING"), award: award("DRAFT"), beforeSigning: null, signing: null, ...over });
const step = (steps: CaseStep[], key: CaseStepKey) => steps.find((s) => s.key === key)!;
const actions = (steps: CaseStep[]) => steps.map((s) => s.action).filter((a) => a !== null);

// ------------------------------------------------------------------ a worked example, step by step

describe("worked example: a works contract from approval to site", () => {
  it("approved, ready to issue: the Award step offers Issue, and the case opens there", () => {
    const steps = caseSteps(facts({ award: award("APPROVED", { issueReady: true }) }));
    expect(steps.map((s) => [s.key, s.state, s.action])).toEqual([
      ["award", "in-progress", "ISSUE"],
      ["before-signing", "waiting", null],
      ["signing", "waiting", null],
      ["project", "waiting", null],
      ["close-out", "parked", null],
    ]);
    expect(defaultCaseStep(steps, live("AWARDING"))).toBe("award");
  });

  it("issued, two copies still to go: Record despatch, before the return", () => {
    const steps = caseSteps(facts({ award: award("ISSUED", { despatchOpen: 2, returnOffered: true }), beforeSigning: before(), signing: signing("NUMBER_ALLOCATED", { action: "START_PREPARATION", blocker: null }) }));
    expect(step(steps, "award")).toEqual({ key: "award", state: "in-progress", next: "2 copies still to despatch", action: "RECORD_DESPATCH" });
    expect(defaultCaseStep(steps, live("AWARDING"))).toBe("award");
  });

  it("accepted, the bond lodged and not yet verified, the contract in preparation: Verify first", () => {
    const steps = caseSteps(
      facts({
        standing: live("SIGNING"),
        award: award("ACCEPTED", { returned: true }),
        beforeSigning: before({ readiness: gate("MET", "NOT_MET", "MET"), securitiesToVerify: 1, lodgeOffered: true }),
        signing: signing("IN_PREPARATION", { action: "SUBMIT_TO_LEGAL", blocker: null }),
      }),
    );
    expect(steps.map((s) => [s.key, s.state, s.action, s.next])).toEqual([
      ["award", "done", null, "The award is accepted"],
      ["before-signing", "in-progress", "VERIFY_SECURITY", "1 security lodged, waiting for verification"],
      ["signing", "in-progress", "SUBMIT_TO_LEGAL", CASE_ACTION_NEXT.SUBMIT_TO_LEGAL],
      ["project", "waiting", null, "Opens once the contract is in force"],
      ["close-out", "parked", null, "Parked until after go-live"],
    ]);
    expect(defaultCaseStep(steps, live("SIGNING"))).toBe("before-signing");
  });

  it("active: Award, Before signing and Signing done; Project in progress", () => {
    const steps = caseSteps(facts({ standing: live("ON_SITE"), award: award("ACCEPTED"), beforeSigning: before({ readiness: gate("MET", "MET", "MET") }), signing: signing("ACTIVE") }));
    expect(steps.map((s) => s.state)).toEqual(["done", "done", "done", "in-progress", "parked"]);
    expect(defaultCaseStep(steps, live("ON_SITE"))).toBe("project");
  });
});

// ------------------------------------------------------------------ Done when (C1)

describe("parallel states: Before signing and Signing both in progress (FR-CON-008)", () => {
  it("preparation runs while the conditions are red", () => {
    const steps = caseSteps(facts({ standing: live("SIGNING"), award: award("ACCEPTED"), beforeSigning: before({ readiness: gate("MET", "NOT_SET", "NOT_MET") }), signing: signing("IN_PREPARATION", { action: "SUBMIT_TO_LEGAL", blocker: null }) }));
    expect(step(steps, "before-signing").state).toBe("in-progress");
    expect(step(steps, "signing").state).toBe("in-progress");
  });

  it("even while the award is still being returned: Award, Before signing and Signing all in progress", () => {
    const steps = caseSteps(facts({ award: award("ISSUED", { returnOffered: true }), beforeSigning: before({ readiness: gate("NOT_MET", "NOT_MET", "NOT_MET") }), signing: signing("IN_PREPARATION") }));
    expect(steps.filter((s) => s.state === "in-progress").map((s) => s.key)).toEqual(["award", "before-signing", "signing"]);
  });
});

describe("Record commencement: offered on today's header condition, on the Project step (F0-2)", () => {
  const indent = (commencement: CommencementState | null, offered = true) =>
    facts({ standing: live("SIGNING"), award: award("ACCEPTED", { instrumentKind: "WORK_INDENT", commencement, commencementOffered: offered }), beforeSigning: before({ readiness: gate("MET", "MET", "MET") }), signing: signing("PENDING_LEGAL_ENDORSEMENT") });
  const states: (CommencementState | null)[] = [
    { state: "NOT_DUE", deadline: "2026-11-01" },
    { state: "LATE", deadline: "2026-10-01", consequence: "WARNING_LETTER" },
    { state: "NOT_SET" },
    { state: "NO_START_DATE" },
    null,
  ];

  for (const c of states) {
    it(`an indent whose commencement is ${c?.state ?? "not read"}: the main button is Record commencement`, () => {
      const steps = caseSteps(indent(c));
      expect(step(steps, "project")).toMatchObject({ state: "in-progress", action: "RECORD_COMMENCEMENT" });
      // No earlier step has an action here, so the case opens on Project and its button is the main one.
      expect(defaultCaseStep(steps, live("SIGNING"))).toBe("project");
    });
  }

  it("the commencement state never gates: not offered, NOT_DUE → no action", () => {
    const steps = caseSteps(indent({ state: "NOT_DUE", deadline: "2026-11-01" }, false));
    expect(step(steps, "project").action).toBeNull();
  });

  it("an issued indent: offered on Project while the Award step's despatch comes first", () => {
    const steps = caseSteps(facts({ award: award("ISSUED", { instrumentKind: "WORK_INDENT", despatchOpen: 1, commencementOffered: true }), beforeSigning: before(), signing: signing("NUMBER_ALLOCATED") }));
    expect(step(steps, "project").action).toBe("RECORD_COMMENCEMENT");
    expect(defaultCaseStep(steps, live("AWARDING"))).toBe("award");
  });

  it("a late indent says so", () => {
    expect(step(caseSteps(indent({ state: "LATE", deadline: "2026-10-01", consequence: null })), "project").next).toMatch(/not commenced within the grace period/);
  });
});

describe("a pre-issue case offers no contract stage action", () => {
  for (const status of ["DRAFT", "PENDING_APPROVAL", "APPROVED"] as const) {
    for (const over of [{}, { issueReady: true }, { despatchOpen: 3, returnOffered: true, commencementOffered: false }]) {
      it(`${status} ${JSON.stringify(over)}`, () => {
        const steps = caseSteps(facts({ award: award(status, over) }));
        for (const k of ["before-signing", "signing", "project", "close-out"] as const) expect(step(steps, k).action).toBeNull();
        // AC-67: the words on Before signing are true of a stage that is open before issue.
        expect(step(steps, "before-signing")).toMatchObject({ state: "waiting", next: "Conditions are checked once the award is issued" });
        expect(step(steps, "signing")).toMatchObject({ state: "waiting", next: "Opens once the award is issued" });
      });
    }
  }
});

describe("the default step for an unknown tab is the earliest with something to do", () => {
  it("an unknown tab names no step, and the case opens on the earliest action", () => {
    const steps = caseSteps(facts({ standing: live("SIGNING"), award: award("ACCEPTED"), beforeSigning: before({ readiness: gate("MET", "NOT_MET", "MET"), lodgeOffered: true }), signing: signing("NUMBER_ALLOCATED", { action: "START_PREPARATION", blocker: null }) }));
    const asked = caseTabToStep("no-such-tab", true);
    expect(asked).toBeNull();
    const opened = asked && "stage" in asked ? asked.stage : defaultCaseStep(steps, live("SIGNING"));
    expect(opened).toBe("before-signing");
    expect(step(steps, "before-signing").action).toBe("LODGE_SECURITY");
  });

  it("no action anywhere: the last step in progress", () => {
    const steps = caseSteps(facts({ standing: live("SIGNING"), award: award("ACCEPTED"), beforeSigning: before({ readiness: gate("MET", "NOT_SET", "MET") }), signing: signing("PENDING_LEGAL_ENDORSEMENT") }));
    expect(actions(steps)).toEqual([]);
    expect(defaultCaseStep(steps, live("SIGNING"))).toBe("signing");
  });

  it("nothing in progress: the last step done", () => {
    const steps = caseSteps(facts({ standing: live("CLOSED"), award: award("ACCEPTED"), beforeSigning: before({ readiness: gate("MET", "MET", "MET") }), signing: signing("CLOSED") }));
    expect(defaultCaseStep(steps, live("CLOSED"))).toBe("project");
  });

  it("nothing in progress or done: Award", () => {
    const steps: CaseStep[] = CASE_STEP_KEYS.map((key) => ({ key, state: key === "close-out" ? "parked" : "waiting", next: "x", action: null }));
    expect(defaultCaseStep(steps, live("AWARDING"))).toBe("award");
  });
});

describe("CONTRACT_STAGES_ONLY: no Award-stage action, no lodging or verifying (AC-18, F0-4)", () => {
  // Facts that would offer every award act, to prove the rule is applied after the steps, not only by zeroed inputs.
  const tempting = (contract: ContractStatus, act: SigningFacts["act"]): CaseFacts => ({
    visibility: "CONTRACT_STAGES_ONLY",
    standing: caseStage({ award: { status: "ACCEPTED", instrumentKind: "WORK_INDENT" }, contract: { status: contract }, commencement: { commencedOn: null } }),
    award: null,
    beforeSigning: { readiness: gate("MET", "NOT_MET", "NOT_MET"), securitiesToVerify: 2, lodgeOffered: true },
    signing: signing(contract, act),
  });

  it("verify and lodge facts set: neither is offered, and Before signing is read-only", () => {
    const steps = caseSteps(tempting("IN_PREPARATION", { action: "SUBMIT_TO_LEGAL", blocker: null }));
    for (const s of steps) expect(AWARD_ACTS).not.toContain(s.action);
    expect(step(steps, "before-signing")).toMatchObject({ state: "in-progress", action: null });
    expect(step(steps, "award")).toMatchObject({ state: "waiting", action: null });
    expect(step(steps, "award").next).toMatch(/restricted/);
    // The contract's own act stays offered: it is not behind withLockedAwardFor.
    expect(step(steps, "signing").action).toBe("SUBMIT_TO_LEGAL");
  });

  it("lodge only (nothing to verify): not offered", () => {
    const f = tempting("NUMBER_ALLOCATED", null);
    const steps = caseSteps({ ...f, beforeSigning: { ...f.beforeSigning!, securitiesToVerify: 0 } });
    expect(actions(steps)).toEqual([]);
  });

  it("the same facts seen whole do offer them", () => {
    const f = tempting("IN_PREPARATION", null);
    expect(step(caseSteps({ ...f, visibility: "WHOLE", award: award("ACCEPTED") }), "before-signing").action).toBe("VERIFY_SECURITY");
    expect(step(caseSteps({ ...f, visibility: "WHOLE", award: award("ACCEPTED"), beforeSigning: { ...f.beforeSigning!, securitiesToVerify: 0 } }), "before-signing").action).toBe("LODGE_SECURITY");
  });

  it("the readiness gate unread: Before signing says why", () => {
    const steps = caseSteps({ ...tempting("IN_PREPARATION", null), beforeSigning: { readiness: null, securitiesToVerify: 0, lodgeOffered: false } });
    expect(step(steps, "before-signing")).toMatchObject({ state: "in-progress", action: null });
    expect(step(steps, "before-signing").next).toMatch(/restricted/);
  });

  it("signed: Before signing is done", () => {
    expect(step(caseSteps(tempting("EXECUTED", null)), "before-signing").state).toBe("done");
  });
});

// ------------------------------------------------------------------ each step, line by line

describe("the Award step", () => {
  it("DRAFT with nothing blocking: Send for approval", () => {
    expect(step(caseSteps(facts({ award: award("DRAFT") })), "award")).toMatchObject({ state: "in-progress", action: "SEND_FOR_APPROVAL" });
  });
  it("DRAFT blocked: no action, the first finding's words", () => {
    const s = step(caseSteps(facts({ award: award("DRAFT", { submitBlocks: [{ code: "NO_ISSUE_IN_FORCE", level: "block" }] }) })), "award");
    expect(s).toMatchObject({ state: "in-progress", action: null });
    expect(s.next).toMatch(/No approval matrix in force/); // shortened by note 0005, founder 2026-10-19
  });
  it("PENDING_APPROVAL: waiting for approval", () => {
    expect(step(caseSteps(facts({ award: award("PENDING_APPROVAL") })), "award")).toEqual({ key: "award", state: "in-progress", next: "Waiting for approval", action: null });
  });
  it("APPROVED, not ready, with a fault: its words", () => {
    const s = step(caseSteps(facts({ award: award("APPROVED", { issueFaults: [{ code: "NO_ISSUE_IN_FORCE", level: "block" }] }) })), "award");
    expect(s.action).toBeNull();
    expect(s.next).toMatch(/No approval matrix/);
  });
  it("APPROVED, not ready, with no fault (the signatory unresolved): says so", () => {
    expect(step(caseSteps(facts({ award: award("APPROVED") })), "award")).toMatchObject({ action: null, next: "Signatory not resolved" }); // 0005 R15, 2026-10-20: the stepper already names the step
  });
  it("a finding that quotes the approved value is worded without its figures (SULIT)", () => {
    const f = { code: "EXCEEDS_APPROVED_VALUE", level: "block" as const, data: { approved: "RM 987,654.32", together: "RM 1,234,567.89", others: 0 } };
    const s = step(caseSteps(facts({ award: award("APPROVED", { issueFaults: [f] }) })), "award");
    expect(s.next).not.toMatch(/987|1,234|RM/);
    expect(s.next).toMatch(/closed to you/);
  });
  it("a finding that compares with the recommendation is not worded for this line (SULIT)", () => {
    const s = step(caseSteps(facts({ award: award("DRAFT", { submitBlocks: [{ code: "AWARDEE_NOT_RECOMMENDED", level: "block" }] }) })), "award");
    expect(s.next).toMatch(/SULIT and closed to you/);
  });
  it("ISSUED, every copy sent, the return offered: Record the return", () => {
    expect(step(caseSteps(facts({ award: award("ISSUED", { returnOffered: true }) })), "award")).toMatchObject({ action: "RECORD_RETURN", next: CASE_ACTION_NEXT.RECORD_RETURN });
  });
  it("ISSUED, a part-recorded return: still offered, and the words say so", () => {
    expect(step(caseSteps(facts({ award: award("ISSUED", { returnOffered: true, returned: true }) })), "award")).toMatchObject({ action: "RECORD_RETURN", next: "The return is recorded, waiting for acceptance" });
  });
  it("ISSUED, the return panel closed to this reader: no action", () => {
    expect(step(caseSteps(facts({ award: award("ISSUED") })), "award")).toMatchObject({ state: "in-progress", action: null, next: "Waiting for the contractor's return" });
  });
  it("ISSUED, a return sent online waits: no link of its own (Verify is the header's action), even with copies to send", () => {
    expect(step(caseSteps(facts({ award: award("ISSUED", { returnOffered: true, despatchOpen: 2, onlineReturnWaiting: true }) })), "award")).toMatchObject({ state: "in-progress", action: null, next: "A return sent online waits to be verified" });
  });
  it("one copy to send: singular", () => {
    expect(step(caseSteps(facts({ award: award("ISSUED", { despatchOpen: 1 }) })), "award").next).toBe("1 copy still to despatch");
  });
  it("ACCEPTED: done, even with despatch or return facts set", () => {
    expect(step(caseSteps(facts({ award: award("ACCEPTED", { despatchOpen: 1, returnOffered: true }) })), "award")).toMatchObject({ state: "done", action: null });
  });
  it("CANCELLED (live, a pair no act writes): waiting, no action", () => {
    expect(step(caseSteps(facts({ award: award("CANCELLED") })), "award")).toMatchObject({ state: "waiting", action: null });
  });
  it("seen whole with no award facts: a typed error naming the rule", () => {
    expect(() => caseSteps(facts({ award: null }))).toThrow(CaseFactsError);
    try {
      caseSteps(facts({ award: null }));
    } catch (e) {
      expect((e as CaseFactsError).rule).toBe("AWARD_FACTS_REQUIRED");
    }
  });
});

describe("the Before signing step", () => {
  const at = (b: BeforeSigningFacts, contract: ContractStatus = "IN_PREPARATION") => step(caseSteps(facts({ standing: live("SIGNING"), award: award("ACCEPTED"), beforeSigning: b, signing: signing(contract) })), "before-signing");

  it("ready: done", () => {
    expect(at(before({ readiness: gate("MET", "MET", "MET") }))).toMatchObject({ state: "done", action: null });
  });
  it("BOND NOT_SET, lodging offered: no Lodge (only NOT_MET is lodged against), the item's words", () => {
    expect(at(before({ readiness: gate("MET", "NOT_SET", "MET"), lodgeOffered: true }))).toEqual({ key: "before-signing", state: "in-progress", action: null, next: "Performance bond lodged and verified: not set" });
  });
  it("INSURANCE NOT_MET, lodging offered: Lodge", () => {
    expect(at(before({ readiness: gate("MET", "MET", "NOT_MET"), lodgeOffered: true }))).toMatchObject({ action: "LODGE_SECURITY", next: "Every required policy lodged and verified: not met" });
  });
  it("NOT_MET, lodging not offered: no action, the item's words", () => {
    expect(at(before({ readiness: gate("NOT_MET", "NOT_MET", "MET") }))).toMatchObject({ action: null, next: "Instrument returned signed: not met" });
  });
  it("never words the gate's detail (it carries sums)", () => {
    const readiness = { ready: false, items: [item("RETURNED", "MET"), item("BOND", "MET"), { key: "INSURANCE" as const, state: "NOT_MET" as const, detail: ["SHORT:WORKS:12345600:STATED:100"] }] };
    expect(at(before({ readiness })).next).not.toMatch(/\d/);
  });
  it("two to verify: plural", () => {
    expect(at(before({ securitiesToVerify: 2 })).next).toBe("2 securities lodged, waiting for verification");
  });

  // Edges of "the contract is EXECUTED or later".
  const signed: ContractStatus[] = ["EXECUTED", "STAMPED", "ACTIVE", "PRACTICALLY_COMPLETE", "MAKING_GOOD_COMPLETE", "FINAL_CERTIFICATE_ISSUED", "CLOSED", "TERMINATED"];
  for (const c of CONTRACT_STATUSES) {
    it(`contract ${c}, gate not ready: ${signed.includes(c) ? "done" : "in progress"}`, () => {
      expect(at(before({ readiness: gate("MET", "NOT_MET", "MET") }), c).state).toBe(signed.includes(c) ? "done" : "in-progress");
    });
  }
});

describe("the Signing step (F0-11)", () => {
  const at = (s: SigningFacts) => step(caseSteps(facts({ standing: live("SIGNING"), award: award("ACCEPTED"), beforeSigning: before(), signing: s })), "signing");
  const acts: [ContractStatus, SigningAct][] = [
    ["NUMBER_ALLOCATED", "START_PREPARATION"],
    ["IN_PREPARATION", "SUBMIT_TO_LEGAL"],
    ["RETURNED_FOR_AMENDMENT", "SUBMIT_TO_LEGAL"],
    ["LEGALLY_ENDORSED", "RECORD_SIGNATURE"],
    ["EXECUTED", "RECORD_STAMPING"],
    ["STAMPED", "RECORD_POSSESSION"],
  ];
  for (const [status, action] of acts) {
    it(`${status}: ${action} when unblocked`, () => {
      expect(at(signing(status, { action, blocker: null }))).toMatchObject({ state: "in-progress", action, next: CASE_ACTION_NEXT[action] });
    });
    it(`${status}: blocked → no action, the blocker's words`, () => {
      expect(at(signing(status, { action, blocker: "The contractor's signature is not recorded." }))).toMatchObject({ state: "in-progress", action: null, next: "The contractor's signature is not recorded." });
    });
  }
  it("PENDING_LEGAL_ENDORSEMENT: with the legal office", () => {
    expect(at(signing("PENDING_LEGAL_ENDORSEMENT"))).toMatchObject({ state: "in-progress", action: null, next: "With the legal office" });
  });
  it("STAMPED, the possession's office hidden: no action", () => {
    expect(at(signing("STAMPED"))).toMatchObject({ state: "in-progress", action: null });
  });
  for (const c of ["ACTIVE", "PRACTICALLY_COMPLETE", "MAKING_GOOD_COMPLETE", "FINAL_CERTIFICATE_ISSUED", "CLOSED", "TERMINATED"] as const) {
    it(`${c}: done, and an act handed in is not offered`, () => {
      expect(at(signing(c, { action: "RECORD_POSSESSION", blocker: null }))).toMatchObject({ state: "done", action: null });
    });
  }
  it("CANCELLED: waiting", () => {
    expect(at(signing("CANCELLED", { action: "START_PREPARATION", blocker: null }))).toMatchObject({ state: "waiting", action: null });
  });
});

describe("the Project step", () => {
  const at = (standing: CaseStanding, contract: ContractStatus) => step(caseSteps(facts({ standing, award: award("ACCEPTED"), beforeSigning: before(), signing: signing(contract) })), "project");
  it("ON_SITE: in progress", () => expect(at(live("ON_SITE"), "ACTIVE")).toMatchObject({ state: "in-progress", action: null, next: "On site" }));
  it("COMPLETED: in progress (the close-out records stay here, F-3)", () => expect(at(live("COMPLETED"), "PRACTICALLY_COMPLETE").state).toBe("in-progress"));
  it("COMPLETED: the words follow the status, and never say a step already taken is still to come", () => {
    expect(at(live("COMPLETED"), "PRACTICALLY_COMPLETE").next).toBe("The works are practically complete");
    expect(at(live("COMPLETED"), "MAKING_GOOD_COMPLETE").next).toBe("Making good of defects is complete");
    expect(at(live("COMPLETED"), "FINAL_CERTIFICATE_ISSUED").next).toBe("The final certificate is issued");
    for (const c of ["MAKING_GOOD_COMPLETE", "FINAL_CERTIFICATE_ISSUED"] as const) expect(at(live("COMPLETED"), c).next).not.toMatch(/follow|to come|still/);
  });
  it("CLOSED: done", () => expect(at(live("CLOSED"), "CLOSED").state).toBe("done"));
  it("SIGNING, no commencement offered: waiting", () => expect(at(live("SIGNING"), "STAMPED").state).toBe("waiting"));
});

describe("ended cases (F0-6)", () => {
  const ended: [Extract<CaseStanding, { kind: "ENDED" }>["ended"], CaseStepKey, CaseFacts][] = [
    ["CANCELLED_BEFORE_ISSUE", "award", facts({ award: award("CANCELLED") })],
    ["CONTRACT_CANCELLED", "signing", facts({ award: award("ACCEPTED", { commencementOffered: true }), beforeSigning: before({ securitiesToVerify: 1, lodgeOffered: true }), signing: signing("CANCELLED", { action: "START_PREPARATION", blocker: null }) })],
    ["TERMINATED", "project", facts({ award: award("ACCEPTED"), beforeSigning: before({ readiness: gate("MET", "MET", "MET") }), signing: signing("TERMINATED") })],
  ];
  for (const [kind, where, f] of ended) {
    it(`${kind}: opens on ${where}, offers nothing, nothing in progress`, () => {
      const standing: CaseStanding = { kind: "ENDED", ended: kind };
      const steps = caseSteps({ ...f, standing });
      expect(defaultCaseStep(steps, standing)).toBe(where);
      expect(actions(steps)).toEqual([]);
      expect(steps.some((s) => s.state === "in-progress")).toBe(false);
      expect(step(steps, where).next).toMatch(/cancelled|terminated/);
    });
  }
});

// ------------------------------------------------------------------ invariants over every case the rules can see

describe("invariants over every award status × contract status × instrument × visibility", () => {
  const kinds: InstrumentKind[] = ["LETTER_OF_ACCEPTANCE", "WORK_INDENT"];
  const contracts: (ContractStatus | null)[] = [null, ...CONTRACT_STATUSES];
  const CODE = /\b[A-Z]+_[A-Z_]+\b/;
  let n = 0;
  for (const status of AWARD_STATUSES)
    for (const contract of contracts)
      for (const kind of kinds)
        for (const commencedOn of [null, "2026-10-01"])
          for (const visibility of ["WHOLE", "CONTRACT_STAGES_ONLY"] as const) {
            if (visibility === "CONTRACT_STAGES_ONLY" && !contract) continue; // HIDDEN before issue: the page has answered 404
            n++;
            const standing = caseStage({ award: { status, instrumentKind: kind }, contract: contract ? { status: contract } : null, commencement: { commencedOn } });
            const offered = ["ISSUED", "ACCEPTED"].includes(status) && kind === "WORK_INDENT" && !commencedOn;
            const f: CaseFacts = {
              visibility,
              standing,
              award: visibility === "WHOLE" ? award(status, { instrumentKind: kind, issueReady: status === "APPROVED", despatchOpen: 1, returnOffered: true, commencementOffered: offered }) : null,
              beforeSigning: contract ? before({ securitiesToVerify: 1, lodgeOffered: true, readiness: visibility === "WHOLE" ? gate("MET", "NOT_MET", "NOT_MET") : null }) : null,
              signing: contract ? signing(contract, { action: "START_PREPARATION", blocker: null }) : null,
            };
            const steps = caseSteps(f);
            const label = `${status}/${contract ?? "none"}/${kind}/${commencedOn ?? "-"}/${visibility}`;
            it(label, () => {
              expect(steps.map((s) => s.key)).toEqual(CASE_STEP_KEYS);
              expect(step(steps, "close-out")).toEqual({ key: "close-out", state: "parked", next: "Parked until after go-live", action: null });
              for (const s of steps) {
                expect(s.next.length).toBeGreaterThan(0);
                expect(s.next).not.toMatch(CODE);
              }
              if (standing.kind === "ENDED") {
                expect(actions(steps)).toEqual([]);
                expect(steps.some((s) => s.state === "in-progress")).toBe(false);
              }
              if (visibility === "CONTRACT_STAGES_ONLY") for (const a of actions(steps)) expect(AWARD_ACTS).not.toContain(a);
              if (!contract) for (const k of ["before-signing", "signing"] as const) expect(step(steps, k).state).toBe("waiting");
              // the default step always names one of the five
              expect(CASE_STEP_KEYS).toContain(defaultCaseStep(steps, standing));
            });
          }
  it("covers every combination", () => {
    expect(n).toBe(AWARD_STATUSES.length * contracts.length * kinds.length * 2 * 2 - AWARD_STATUSES.length * kinds.length * 2);
  });
});

// 0005 R15, 2026-10-20: the line under the step bar reads "Next: {next}", so every literal that can become a `next` is 12 words or fewer.
describe("next-line literals", () => {
  it("none of the words written in case-steps.ts is longer than 12 words", async () => {
    const ts = (await import("typescript")).default;
    const { readFileSync } = await import("node:fs");
    const file = new URL("./case-steps.ts", import.meta.url);
    const sf = ts.createSourceFile("case-steps.ts", readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    const long: string[] = [];
    const count = (t: string) => t.split(/\s+/).filter(Boolean).length;
    const visit = (n: import("typescript").Node) => {
      if (ts.isImportDeclaration(n)) return;
      // A developer error thrown for a page that breaks the rule is never shown.
      if (ts.isNewExpression(n)) return;
      if (ts.isStringLiteralLike(n)) {
        if (count(n.text) > 12) long.push(n.text);
      } else if (ts.isTemplateExpression(n)) {
        // An inserted value counts as one word.
        const text = n.head.text + n.templateSpans.map((s) => "X" + s.literal.text).join("");
        if (count(text) > 12) long.push(text);
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
    expect(long).toEqual([]);
  });
});
