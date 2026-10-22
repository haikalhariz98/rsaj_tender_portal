import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { SUBMISSION_KINDS } from "@/lib/portal/projects/types";

import { BEING_PREPARED, STATE_WORDS, faultText, kindWords, markActionWords, outcomeWords, refusalText, sideWords, stateWords, takenUpLink, versionLabel, waitsOnWords } from "./labels";
import { DOCUMENT_STATES } from "./state";
import { takenUpWhere } from "./taken-up";
import { OUTCOMES, type Finding } from "./types";

/** The workspace's words: English, no code on screen, "Noted" on defects rectified (PW-24), and every refusal worded. */

const CODE = /\b[A-Z]{3,}_[A-Z_]+\b/;
const ORG = "Jabatan Contoh";

describe("states and outcomes", () => {
  it("the base words of every state", () => {
    expect(STATE_WORDS).toEqual({ REQUESTED: "Asked for", WAITING_FOR_APPROVAL: "Waiting for approval", APPROVED: "Approved", REJECTED: "Rejected", SHARED: "Shared", RECEIVED: "Received", TAKEN_UP: "Taken up", RETURNED: "Returned" });
    expect(Object.keys(STATE_WORDS).sort()).toEqual([...DOCUMENT_STATES].sort());
  });

  it("on defects rectified the mark reads Noted, as state, outcome and button; every other kind reads Taken up (PW-24)", () => {
    expect(stateWords("TAKEN_UP", "DEFECTS_RECTIFIED")).toBe("Noted");
    expect(outcomeWords("TAKEN_UP", "DEFECTS_RECTIFIED")).toBe("Noted");
    expect(markActionWords("TAKEN_UP", "DEFECTS_RECTIFIED")).toBe("Mark noted");
    for (const k of SUBMISSION_KINDS.filter((k) => k !== "DEFECTS_RECTIFIED")) {
      expect(stateWords("TAKEN_UP", k), k).toBe("Taken up");
      expect(outcomeWords("TAKEN_UP", k), k).toBe("Taken up");
      expect(markActionWords("TAKEN_UP", k), k).toBe("Mark taken up");
    }
    expect(markActionWords("RETURNED", "DEFECTS_RECTIFIED")).toBe("Return");
  });

  it("the kind changes no other word", () => {
    for (const s of DOCUMENT_STATES.filter((s) => s !== "TAKEN_UP")) for (const k of [null, ...SUBMISSION_KINDS]) expect(stateWords(s, k)).toBe(STATE_WORDS[s]);
    for (const o of OUTCOMES.filter((o) => o !== "TAKEN_UP")) for (const k of [null, ...SUBMISSION_KINDS]) expect(outcomeWords(o, k)).toBe(outcomeWords(o, null));
    expect(OUTCOMES.map((o) => outcomeWords(o, null))).toEqual(["Approved", "Rejected", "Taken up", "Returned"]);
  });

  it("every kind has a name, with no code in it", () => {
    for (const k of SUBMISSION_KINDS) expect(kindWords(k)).not.toMatch(CODE);
  });
});

describe("Taken up and where it is recorded (PW-24)", () => {
  it("words only with a link, and none where no screen records the kind", () => {
    expect(takenUpLink("WORK_PROGRAMME")).toEqual({ words: "Recorded under Site › Possession and progress", where: { stage: "project", tab: "site", section: "start" } });
    expect(takenUpLink("INTERIM_CLAIM")?.words).toBe("Recorded under Payments › Valuations");
    for (const k of SUBMISSION_KINDS) {
      const link = takenUpLink(k);
      expect(link === null, k).toBe(takenUpWhere(k) === null);
      if (link) expect(link.where, k).toEqual(takenUpWhere(k));
    }
    for (const k of ["DELAY_NOTICE", "DEFECTS_RECTIFIED", "STATUTORY_DECLARATION"] as const) expect(takenUpLink(k)).toBeNull();
  });

  it("no other word in the file says where a thing is recorded", () => {
    const src = readFileSync(path.join(__dirname, "labels.ts"), "utf8");
    // A template expression is written «…» here (lint: no template syntax in a plain string).
    const said = [...src.matchAll(/["`]([^"`]*\b[Rr]ecorded (?:in|under|on)\b[^"`]*)["`]/g)].map((m) => m[1]!.replace(/\$\{(\w+)\}/g, "«$1»"));
    expect(said).toEqual(["Recorded under «tab» › «section»", "Recorded under «tab»"]);
  });
});

describe("who it waits on, the sides, and the fixed phrases", () => {
  it("the contractor, the organisation by its configured name, or nobody", () => {
    expect(waitsOnWords({ waitsOn: "CONTRACTOR" }, ORG)).toBe("Waiting on the contractor");
    expect(waitsOnWords({ waitsOn: "ORGANISATION" }, ORG)).toBe("Waiting on Jabatan Contoh");
    expect(waitsOnWords({ waitsOn: null }, ORG)).toBeNull();
    expect(sideWords("CONTRACTOR", ORG)).toBe("The contractor");
    expect(sideWords("ORGANISATION", ORG)).toBe(ORG);
    expect(BEING_PREPARED(ORG)).toBe("Being prepared by Jabatan Contoh");
    expect(versionLabel(2)).toBe("Version 2");
  });
});

describe("every refusal is worded", () => {
  const sources = ["faults.ts", "bounds.ts"].map((f) => readFileSync(path.join(__dirname, f), "utf8")).join("\n");
  const codes = new Set<string>();
  for (const m of sources.matchAll(/export type \w+Fault =([^;]+);/g)) for (const c of m[1]!.matchAll(/"([A-Z][A-Z_]+)"/g)) codes.add(c[1]!);

  /// Each variant of the data a fault is raised with.
  const samples: Record<string, Finding["data"][]> = {
    NOTE_TOO_LONG: [{ field: "document", limit: 2000 }, { field: "version", limit: 2000 }, { field: "request", limit: 2000 }],
    TOO_MANY_FILES: [{ limit: 20, files: 21 }],
    TITLE_TOO_LONG: [{ limit: 200 }],
    REASON_TOO_LONG: [{ limit: 2000 }],
    REMARKS_TOO_LONG: [{ limit: 4000 }],
    NOT_YOUR_SIDE: [{ side: "CONTRACTOR" }, { side: "ORGANISATION" }],
    ALREADY_WAITING: [{ side: "CONTRACTOR", state: "REJECTED", kind: null }, { side: "ORGANISATION", state: "REQUESTED", kind: null }],
    FINAL: [{ state: "APPROVED", kind: null }, { state: "TAKEN_UP", kind: "WORK_PROGRAMME" }, { state: "TAKEN_UP", kind: "DEFECTS_RECTIFIED" }],
    UNDER_REVIEW: [{ state: "WAITING_FOR_APPROVAL", kind: null }, { state: "RECEIVED", kind: "INTERIM_CLAIM" }],
    NOT_WAITING: [{ state: "REJECTED", kind: null }, { state: "APPROVED", kind: null }, { state: "REQUESTED", kind: null }, { state: "SHARED", kind: null }, { state: "RECEIVED", kind: "DELAY_NOTICE" }],
    REMARKS_REQUIRED: [{ outcome: "REJECTED" }, { outcome: "RETURNED" }],
    APPROVER_NO_AUTHORITY: [{ personId: "cl1x9" }],
    APPROVER_TWICE: [{ personId: "cl1x9" }],
    TOO_MANY_FILES_IN_WINDOW: [{ limit: 60, minutes: 60, retryInMinutes: 12 }, { limit: 60, minutes: 60, retryInMinutes: 1 }],
    TOO_MANY_BYTES_IN_WINDOW: [{ limitMiB: 256, minutes: 60, retryInMinutes: 55 }, { limitMiB: 256, minutes: 60, retryInMinutes: null }],
    NOT_STAGED_FOR_PROJECT: [{ file: 2 }],
    NOT_YOURS: [{ file: 2 }],
    ALREADY_ATTACHED: [{ file: 2 }],
    WITHDRAWN: [{ file: 2 }],
    WRONG_CLASS: [{ file: 2 }],
    DUPLICATE: [{ file: 2 }],
    ALREADY_MARKED: [{ kind: "DEFECTS_RECTIFIED" }],
  };

  it("the scan finds the faults of every act", () => {
    expect(codes.size).toBeGreaterThan(40);
    for (const c of ["LAST_APPROVER", "WOULD_APPROVE", "UNDER_REVIEW", "DECLARATION_NOT_SIGNED", "TOO_MANY_BYTES_IN_WINDOW", "DUPLICATE"]) expect(codes).toContain(c);
  });

  it("no code falls through to 'Refused.', none names a code or an id, and none reads an empty value", () => {
    for (const code of codes) {
      for (const data of samples[code] ?? [undefined]) {
        const words = faultText({ code, level: "block", data }, ORG);
        expect(words, code).not.toBe("Refused.");
        expect(words, code).not.toMatch(CODE);
        expect(words, code).not.toMatch(/undefined|null|NaN|cl1x9|\{|\}/);
        expect(words.length, code).toBeGreaterThan(10);
      }
    }
  });

  it("the words that turn on the data, as written", () => {
    expect(faultText({ code: "FINAL", level: "block", data: { state: "TAKEN_UP", kind: "DEFECTS_RECTIFIED" } })).toBe("This document is noted, so it is closed. A later change is a new document.");
    expect(faultText({ code: "FINAL", level: "block", data: { state: "APPROVED", kind: null } })).toBe("This document is approved, so it is closed. A later change is a new document.");
    expect(faultText({ code: "NOT_YOUR_SIDE", level: "block", data: { side: "ORGANISATION" } }, ORG)).toBe("Only Jabatan Contoh uploads versions of this document.");
    expect(faultText({ code: "TOO_MANY_FILES_IN_WINDOW", level: "block", data: { limit: 60, minutes: 60, retryInMinutes: 1 } })).toBe("This account has uploaded 60 files in the last 60 minutes, the most allowed. Try again in 1 minute.");
    expect(faultText({ code: "TOO_MANY_BYTES_IN_WINDOW", level: "block", data: { limitMiB: 256, minutes: 60, retryInMinutes: 55 } })).toBe("This file would take this account past 256 MiB uploaded in the last 60 minutes, the most allowed. Try again in 55 minutes.");
    expect(faultText({ code: "LAST_APPROVER", level: "block" })).toMatch(/add the new approver first, then remove this one/);
    expect(faultText({ code: "NOTE_TOO_LONG", level: "block", data: { field: "request", limit: 2000 } })).toBe("The request's note is longer than 2000 characters. Shorten it.");
  });

  it("an unknown code fails closed; a refusal reads the lead and each fault", () => {
    expect(faultText({ code: "NOT_A_CODE", level: "block" })).toBe("Refused.");
    expect(refusalText("Not sent:", [{ code: "NO_FILES", level: "block" }, { code: "TITLE_REQUIRED", level: "block" }])).toBe("Not sent: Add at least one file. Give the document a title.");
  });

  it("the organisation is named by its configured name, defaulting to plain words, never an abbreviation of a customer's", () => {
    const src = readFileSync(path.join(__dirname, "labels.ts"), "utf8");
    expect(src).not.toMatch(/RSAJ|Malay|\bms\b:/);
    expect(faultText({ code: "NOT_ORGANISATION", level: "block" })).toBe("Only the organisation can do this.");
  });
});
