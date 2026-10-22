/**
 * Test-only: builds a Project workspace document's facts by playing its acts in order, as the store (plan step 4) will write the rows: a version takes the
 * next number, answers the open request, and snapshots whether an approver was live; a removal keeps the row; a decision is on the latest version. It
 * judges nothing (the faults do); it lets a test read as the story a finance or contracts officer would tell. Imported by `*.test.ts` only.
 */

import { latestVersion, liveApprovers, nextVersionNumber } from "./state";
import type { DocKind, DocumentFacts, Outcome, Side } from "./types";

export const DAY = "2026-10-23";

export interface Story {
  readonly doc: DocumentFacts;
  /// A request to the document's side; returns its id.
  request(): string;
  /// A version from the document's side: a staff person (default "so") on an ORGANISATION document, a portal account ("acc") on a CONTRACTOR one.
  upload(o?: { personId?: string; accountId?: string; kind?: DocKind }): string;
  /// Names an approver; returns the approver row's id.
  addApprover(personId: string): string;
  removeApprover(approverId: string): void;
  /// A live approver's decision on the latest version.
  decide(personId: string, outcome: "APPROVED" | "REJECTED", remarks?: string): void;
  /// The mark on the latest version of a kind.
  mark(outcome: "TAKEN_UP" | "RETURNED", remarks?: string): void;
}

export function story(side: Side, kind: DocKind | null = null): Story {
  let d: DocumentFacts = { side, kind, versions: [], approvers: [], decisions: [], requests: [] };
  let seq = 0;
  const latestId = () => {
    const v = latestVersion(d);
    if (!v) throw new Error("story: no version to decide");
    return v.id;
  };
  const decision = (approverId: string | null, outcome: Outcome, remarks: string) => {
    d = { ...d, decisions: [...d.decisions, { versionId: latestId(), approverId, outcome, remarks }] };
  };
  return {
    get doc() {
      return d;
    },
    request() {
      const id = `r${++seq}`;
      d = { ...d, requests: [...d.requests, { id, toSide: d.side, answered: false }] };
      return id;
    },
    upload(o = {}) {
      const open = d.requests.find((r) => !r.answered) ?? null;
      const number = nextVersionNumber(d);
      const id = `v${number}`;
      d = {
        ...d,
        kind: d.kind ?? o.kind ?? null,
        versions: [
          ...d.versions,
          {
            id,
            number,
            uploaderPersonId: d.side === "ORGANISATION" ? (o.personId ?? "so") : null,
            uploaderAccountId: d.side === "CONTRACTOR" ? (o.accountId ?? "acc") : null,
            noApproversAtUpload: liveApprovers(d).length === 0,
            requestId: open?.id ?? null,
            uploadedOn: DAY,
          },
        ],
        requests: d.requests.map((r) => (r.id === open?.id ? { ...r, answered: true } : r)),
      };
      return id;
    },
    addApprover(personId) {
      const id = `ap${++seq}-${personId}`;
      d = { ...d, approvers: [...d.approvers, { id, personId, removed: false }] };
      return id;
    },
    removeApprover(approverId) {
      d = { ...d, approvers: d.approvers.map((a) => (a.id === approverId ? { ...a, removed: true } : a)) };
    },
    decide(personId, outcome, remarks = "") {
      const a = liveApprovers(d).find((x) => x.personId === personId);
      if (!a) throw new Error(`story: ${personId} is not a live approver`);
      decision(a.id, outcome, remarks);
    },
    mark(outcome, remarks = "") {
      decision(null, outcome, remarks);
    },
  };
}
