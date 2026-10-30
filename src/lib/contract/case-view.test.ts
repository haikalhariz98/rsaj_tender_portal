import { describe, expect, it } from "vitest";

import type { AwardStatus, InstrumentKind } from "@/lib/award/types";

import { caseStage, type CaseStanding } from "./case-stage";
import { caseSteps, defaultCaseStep, type AwardStepFacts, type BeforeSigningFacts, type CaseFacts, type SigningFacts } from "./case-steps";
import { caseHistorySources, resolveCaseView } from "./case-view";
import type { ContractStatus } from "./types";

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
const before = (over: Partial<BeforeSigningFacts> = {}): BeforeSigningFacts => ({
  readiness: { ready: false, items: [{ key: "RETURNED", state: "MET", detail: [] }, { key: "BOND", state: "NOT_MET", detail: [] }] } as unknown as BeforeSigningFacts["readiness"],
  securitiesToVerify: 0,
  lodgeOffered: false,
  ...over,
});
const signing = (status: ContractStatus, act: SigningFacts["act"] = null): SigningFacts => ({ status, act });

/// A case as the page builds it: the standing from the same rule the lists use, the steps from the facts.
function open(over: { awardStatus: AwardStatus; contract: ContractStatus | null; kind?: InstrumentKind; commencedOn?: string | null; facts: Partial<CaseFacts>; tab?: string; stage?: string }) {
  const kind = over.kind ?? "LETTER_OF_ACCEPTANCE";
  const standing: CaseStanding = caseStage({ award: { status: over.awardStatus, instrumentKind: kind }, contract: over.contract ? { status: over.contract } : null, commencement: { commencedOn: over.commencedOn ?? null } });
  const steps = caseSteps({ visibility: "WHOLE", standing, award: award(over.awardStatus, { instrumentKind: kind }), beforeSigning: null, signing: null, ...over.facts });
  return resolveCaseView({ stage: over.stage, tab: over.tab, steps, standing, hasContract: !!over.contract, visibility: "WHOLE" });
}

describe("each kind of case opens on the right default step (C5 done-when 1)", () => {
  it("a pre-issue award: the Award stage, its first tab", () => {
    const v = open({ awardStatus: "DRAFT", contract: null, facts: {} });
    expect(v).toMatchObject({ stage: "award", tab: "overview", history: false, awardRefused: false, noContractYet: false });
  });

  it("an issued award with its contract: the Award stage while a copy is still to go", () => {
    const v = open({ awardStatus: "ISSUED", contract: "NUMBER_ALLOCATED", facts: { award: award("ISSUED", { despatchOpen: 1 }), beforeSigning: before(), signing: signing("NUMBER_ALLOCATED", { action: "START_PREPARATION", blocker: null }) } });
    expect(v.stage).toBe("award");
  });

  it("a signed contract waiting to be stamped: Signing, its first tab", () => {
    const v = open({ awardStatus: "ACCEPTED", contract: "EXECUTED", facts: { award: award("ACCEPTED"), beforeSigning: before(), signing: signing("EXECUTED", { action: "RECORD_STAMPING", blocker: null }) } });
    expect(v).toMatchObject({ stage: "signing", tab: "formation" });
  });

  it("an indent awaiting commencement (no contract is made for it): Project, with the contract stages saying what they wait for", () => {
    const v = open({ awardStatus: "ACCEPTED", contract: null, kind: "WORK_INDENT", facts: { award: award("ACCEPTED", { instrumentKind: "WORK_INDENT", commencementOffered: true }) } });
    expect(v).toMatchObject({ stage: "project", noContractYet: true });
  });

  it("an issued indent whose return is not yet recorded: the earliest step with an act is still Award, and Project carries Record commencement (AC-19, product-owner question)", () => {
    // The state the system reaches: an indent is ISSUED until its return completes, and commencement is offered from ISSUED (awards/[id]/page.tsx:303).
    const facts = { award: award("ISSUED", { instrumentKind: "WORK_INDENT", returnOffered: true, commencementOffered: true }) };
    const standing: CaseStanding = caseStage({ award: { status: "ISSUED", instrumentKind: "WORK_INDENT" }, contract: null, commencement: { commencedOn: null } });
    const steps = caseSteps({ visibility: "WHOLE", standing, beforeSigning: null, signing: null, ...facts });
    expect(steps.find((x) => x.key === "award")?.action).toBe("RECORD_RETURN");
    expect(steps.find((x) => x.key === "project")?.action).toBe("RECORD_COMMENCEMENT");
    expect(resolveCaseView({ stage: undefined, tab: undefined, steps, standing, hasContract: false, visibility: "WHOLE" }).stage).toBe("award");
    // Asked for, the Project stage is the one with the commencement button.
    expect(resolveCaseView({ stage: "project", tab: undefined, steps, standing, hasContract: false, visibility: "WHOLE" })).toMatchObject({ stage: "project", noContractYet: true });
  });

  it("a cancelled case: where it ended (F0-6), here the Award stage", () => {
    const v = open({ awardStatus: "CANCELLED", contract: null, facts: { award: award("CANCELLED") } });
    expect(v.stage).toBe("award");
  });

  it("a contract cancelled after issue opens on Signing, a terminated one on Project", () => {
    const cancelled = open({ awardStatus: "ACCEPTED", contract: "CANCELLED", facts: { award: award("ACCEPTED"), beforeSigning: before(), signing: signing("CANCELLED") } });
    expect(cancelled.stage).toBe("signing");
    const terminated = open({ awardStatus: "ACCEPTED", contract: "TERMINATED", facts: { award: award("ACCEPTED"), beforeSigning: before(), signing: signing("TERMINATED") } });
    expect(terminated.stage).toBe("project");
  });
});

describe("the address names the view", () => {
  const base = { awardStatus: "ACCEPTED" as const, contract: "ACTIVE" as const, facts: { award: award("ACCEPTED"), beforeSigning: before(), signing: signing("ACTIVE") } };
  it("WRS-7: an old ?tab=documents address (a stored notice href) opens Documents at the Certificates section", () => {
    for (const stage of [undefined, "project"]) expect(open({ ...base, stage, tab: "documents" })).toMatchObject({ stage: "project", tab: "submissions", section: "certificates" });
  });
  it("?stage= with a tab of that stage opens it, with a foreign tab the stage's first (F0-5)", () => {
    expect(open({ ...base, stage: "project", tab: "site" })).toMatchObject({ stage: "project", tab: "site" });
    expect(open({ ...base, stage: "signing", tab: "site" })).toMatchObject({ stage: "signing", tab: "formation" });
  });
  it("the same word on two stages: ?stage=award&tab=overview is the award's, a bare ?tab=overview on a contract is the Project's", () => {
    expect(open({ ...base, stage: "award", tab: "overview" })).toMatchObject({ stage: "award", tab: "overview" });
    expect(open({ ...base, tab: "overview" })).toMatchObject({ stage: "project", tab: "overview" });
  });
  it("a persisted stage-less tab opens its one stage", () => {
    expect(open({ ...base, tab: "submissions" })).toMatchObject({ stage: "project", tab: "submissions" });
    expect(open({ ...base, tab: "securities" })).toMatchObject({ stage: "before-signing", tab: "securities" });
    expect(open({ ...base, tab: "formation" })).toMatchObject({ stage: "signing", tab: "formation" });
  });
  it("history is case-level and keeps the stage the address names", () => {
    expect(open({ ...base, tab: "history" })).toMatchObject({ history: true, tab: null });
    expect(open({ ...base, stage: "signing", tab: "history" })).toMatchObject({ history: true, stage: "signing" });
  });
  it("work is case-level: it keeps a stage that draws it, else the live one, else Project", () => {
    expect(open({ ...base, tab: "work" })).toMatchObject({ tab: "work", history: false, stage: "project" });
    expect(open({ ...base, stage: "close-out", tab: "work" })).toMatchObject({ tab: "work", stage: "close-out" });
    expect(open({ ...base, stage: "award", tab: "work" })).toMatchObject({ tab: "work", stage: "project" });
  });
  it("an unknown tab or stage falls back to the default step", () => {
    const standing: CaseStanding = { kind: "LIVE", stage: "ON_SITE" };
    const steps = caseSteps({ visibility: "WHOLE", standing, ...base.facts });
    const v = open({ ...base, tab: "nope", stage: "nope" });
    expect(v.stage).toBe(defaultCaseStep(steps, standing));
  });
  // Phase 2 close-out stage B (flagged, faithful): Close-out has its tabs now, and opens on the first.
  it("Close-out opens on Completion", () => {
    expect(open({ ...base, stage: "close-out" })).toMatchObject({ stage: "close-out", tab: "completion" });
  });
  it("a contract stage on a case with no contract yet is flagged, the award stage is not", () => {
    expect(open({ awardStatus: "DRAFT", contract: null, facts: {}, stage: "signing" }).noContractYet).toBe(true);
    expect(open({ awardStatus: "DRAFT", contract: null, facts: {}, stage: "award" }).noContractYet).toBe(false);
  });
  it("Before signing is open on an award with no contract yet: its conditions and bond requirement are entered there (FR-AWD-014)", () => {
    for (const awardStatus of ["DRAFT", "PENDING_APPROVAL", "APPROVED"] as const) {
      for (const tab of ["conditions", "securities"]) {
        expect(open({ awardStatus, contract: null, facts: {}, tab })).toMatchObject({ stage: "before-signing", tab, noContractYet: false, awardRefused: false });
        expect(open({ awardStatus, contract: null, facts: {}, stage: "before-signing", tab })).toMatchObject({ stage: "before-signing", tab, noContractYet: false });
      }
    }
  });
});

describe("a reader who sees the contract stages only (AC-18)", () => {
  const standing: CaseStanding = { kind: "LIVE", stage: "ON_SITE" };
  const steps = caseSteps({ visibility: "CONTRACT_STAGES_ONLY", standing, award: null, beforeSigning: null, signing: { status: "ACTIVE", act: null } });
  const view = (stage?: string, tab?: string) => resolveCaseView({ stage, tab, steps, standing, hasContract: true, visibility: "CONTRACT_STAGES_ONLY" });
  it("the Award stage is refused, whatever tab names it", () => {
    expect(view("award").awardRefused).toBe(true);
    expect(view("award", "approval").awardRefused).toBe(true);
  });
  it("the contract stages render", () => {
    expect(view("project", "site").awardRefused).toBe(false);
    expect(view(undefined, "formation")).toMatchObject({ stage: "signing", awardRefused: false });
  });
  it("History is not the Award stage, and holds contract rows only", () => {
    expect(view(undefined, "history").awardRefused).toBe(false);
    expect(caseHistorySources({ hasContract: true, visibility: "CONTRACT_STAGES_ONLY" })).toEqual(["contract"]);
  });
});

describe("caseHistorySources", () => {
  it("a whole case reads the award's trail, and the contract's once there is one", () => {
    expect(caseHistorySources({ hasContract: false, visibility: "WHOLE" })).toEqual(["award"]);
    expect(caseHistorySources({ hasContract: true, visibility: "WHOLE" })).toEqual(["award", "contract"]);
  });
});

// Workspace 3b-ii step 11 (WS-5): the Certificates tab ("documents") folded into Documents ("submissions"); the old address still lands.
describe("the folded Certificates address", () => {
  const live = { awardStatus: "ISSUED", contract: "ACTIVE", facts: {} } as const;
  it("a stage-less ?tab=documents opens Documents in the Project stage", () => {
    expect(open({ ...live, tab: "documents" })).toMatchObject({ stage: "project", tab: "submissions", history: false });
  });
  it("?stage=project&tab=documents does the same, and another stage's name does not claim it", () => {
    expect(open({ ...live, stage: "project", tab: "documents" })).toMatchObject({ stage: "project", tab: "submissions" });
    expect(open({ ...live, stage: "signing", tab: "documents" }).tab).toBe("formation");
  });
  // The 3b-ii review (C7): the section the old address names is kept, on either form.
  it("keeps the Certificates section the old address names", () => {
    expect(open({ ...live, tab: "documents" }).section).toBe("certificates");
    expect(open({ ...live, stage: "project", tab: "documents" }).section).toBe("certificates");
    expect(open({ ...live, tab: "submissions" }).section).toBeNull();
  });
});
