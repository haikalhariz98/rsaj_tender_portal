import { describe, expect, it } from "vitest";

import { DOCUMENT_STATES } from "@/lib/project-docs/state";

import { gateNote, STATE_TONE } from "./document-words";

const open = { allowed: true, reasons: [] };
const shut = (...reasons: string[]) => ({ allowed: false, reasons });

describe("the one line that says why acts are blocked", () => {
  it("is nothing where nothing is blocked", () => {
    expect(gateNote([{ label: "Approve", gate: open }])).toBeNull();
    expect(gateNote([])).toBeNull();
  });

  it("is the bare reason when every act shares it", () => {
    expect(gateNote([{ label: "Approve", gate: shut("Closed.") }, { label: "Reject", gate: shut("Closed.") }])).toBe("Closed.");
  });

  it("names the acts that share a reason, and each other reason with its own acts", () => {
    expect(gateNote([{ label: "Upload", gate: shut("Waiting.") }, { label: "Ask", gate: shut("Waiting.") }, { label: "Approve", gate: open }, { label: "Reject", gate: shut("Not yours.") }])).toBe("Upload, Ask: Waiting. Reject: Not yours.");
  });

  it("names the one blocked act when others are open", () => {
    expect(gateNote([{ label: "Approve", gate: open }, { label: "Reject", gate: shut("Not yours.") }])).toBe("Reject: Not yours.");
  });

  it("joins an act's several reasons", () => {
    expect(gateNote([{ label: "Upload", gate: shut("A.", "B.") }])).toBe("A. B.");
  });
});

describe("the badge's tone", () => {
  it("is set for every state, and an approval reads as done and a rejection as wrong", () => {
    expect(Object.keys(STATE_TONE).sort()).toEqual([...DOCUMENT_STATES].sort());
    expect(STATE_TONE.APPROVED).toBe("ok");
    expect(STATE_TONE.REJECTED).toBe("err");
  });
});
