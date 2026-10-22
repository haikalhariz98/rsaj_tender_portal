import { describe, expect, it } from "vitest";

import { STAGED_FOR_DELEGATION, STAGED_FOR_PROJECT_DOCUMENT } from "@/lib/documents/staged-for";

import { PROJECT_BYTES_PER_WINDOW, PROJECT_FILES_PER_VERSION, PROJECT_FILES_PER_WINDOW, PROJECT_UPLOAD_WINDOW_MINUTES, stagedFileFaults, windowFaults, type StagedFile } from "./bounds";
import type { Actor } from "./types";

/** The technical bounds (PW-15, PW-32; plan §3.1) on each side of each boundary, and the staged-file checks (ADR 0042 D8). */

const NOW = new Date("2026-10-23T10:00:00.000Z");
const ago = (minutes: number, seconds = 0) => new Date(NOW.getTime() - minutes * 60_000 - seconds * 1000);
const MiB = 1024n * 1024n;
const files = (n: number, at: (i: number) => Date, bytes = 1n) => Array.from({ length: n }, (_, i) => ({ at: at(i), bytes }));

describe("the constants are the plan's (§3.1), technical and not configuration", () => {
  it("20 files a version; 60 files and 256 MiB a portal account in a rolling 60 minutes", () => {
    expect(PROJECT_FILES_PER_VERSION).toBe(20);
    expect(PROJECT_UPLOAD_WINDOW_MINUTES).toBe(60);
    expect(PROJECT_FILES_PER_WINDOW).toBe(60);
    expect(PROJECT_BYTES_PER_WINDOW).toBe(268_435_456n);
  });
});

describe("windowFaults: files", () => {
  it("59 in the window accepts the 60th; 60 refuses the 61st", () => {
    expect(windowFaults({ staged: files(59, () => ago(1)), incomingBytes: 1n, now: NOW })).toEqual([]);
    expect(windowFaults({ staged: files(60, () => ago(1)), incomingBytes: 1n, now: NOW }).map((f) => f.code)).toEqual(["TOO_MANY_FILES_IN_WINDOW"]);
  });

  it("the window is rolling and half-open: a file staged exactly 60 minutes ago has left it, one a second younger has not", () => {
    const sixty = [...files(59, () => ago(1)), { at: ago(60), bytes: 1n }];
    expect(windowFaults({ staged: sixty, incomingBytes: 1n, now: NOW })).toEqual([]);
    const younger = [...files(59, () => ago(1)), { at: ago(59, 59), bytes: 1n }];
    expect(windowFaults({ staged: younger, incomingBytes: 1n, now: NOW })).toHaveLength(1);
  });

  it("names the limit and when to retry: when the oldest counted file leaves, in whole minutes, at least one", () => {
    // 60 files, the oldest 50 minutes ago: it leaves in 10 minutes, and then 59 remain.
    const staged = files(60, (i) => (i === 0 ? ago(50) : ago(1)));
    expect(windowFaults({ staged, incomingBytes: 1n, now: NOW })).toEqual([{ code: "TOO_MANY_FILES_IN_WINDOW", level: "block", data: { limit: 60, minutes: 60, retryInMinutes: 10 } }]);
    // 62 files (staged in a race): the third oldest must leave too.
    const raced = files(62, (i) => ago(59 - i));
    expect(windowFaults({ staged: raced, incomingBytes: 1n, now: NOW })[0]?.data?.retryInMinutes).toBe(3);
    // Seconds round up; a file about to leave still says one minute.
    expect(windowFaults({ staged: files(60, () => ago(59, 50)), incomingBytes: 1n, now: NOW })[0]?.data?.retryInMinutes).toBe(1);
  });

  it("a row stamped after now still counts", () => {
    expect(windowFaults({ staged: files(60, () => new Date(NOW.getTime() + 1000)), incomingBytes: 1n, now: NOW })).toHaveLength(1);
  });
});

describe("windowFaults: bytes", () => {
  it("exactly 256 MiB in all accepts; one byte more refuses", () => {
    const staged = [{ at: ago(5), bytes: 200n * MiB }];
    expect(windowFaults({ staged, incomingBytes: 56n * MiB, now: NOW })).toEqual([]);
    expect(windowFaults({ staged, incomingBytes: 56n * MiB + 1n, now: NOW })).toEqual([{ code: "TOO_MANY_BYTES_IN_WINDOW", level: "block", data: { limitMiB: 256, minutes: 60, retryInMinutes: 55 } }]);
  });

  it("the retry is when enough of the oldest bytes have left for this file to fit", () => {
    const staged = [
      { at: ago(50), bytes: 100n * MiB },
      { at: ago(30), bytes: 100n * MiB },
      { at: ago(10), bytes: 50n * MiB },
    ];
    // 250 MiB in; 200 more needs the two oldest gone (50 + 200 fits, 150 + 200 does not): the second leaves in 30 minutes.
    expect(windowFaults({ staged, incomingBytes: 200n * MiB, now: NOW })[0]?.data?.retryInMinutes).toBe(30);
    // 100 more needs only the oldest gone (150 + 100 fits): 10 minutes.
    expect(windowFaults({ staged, incomingBytes: 100n * MiB, now: NOW })[0]?.data?.retryInMinutes).toBe(10);
    // 10 more needs only the oldest gone: 10 minutes.
    expect(windowFaults({ staged, incomingBytes: 10n * MiB, now: NOW })[0]?.data?.retryInMinutes).toBe(10);
  });

  it("a file larger than the whole bound can never fit: no retry is promised", () => {
    expect(windowFaults({ staged: [], incomingBytes: PROJECT_BYTES_PER_WINDOW + 1n, now: NOW })).toEqual([{ code: "TOO_MANY_BYTES_IN_WINDOW", level: "block", data: { limitMiB: 256, minutes: 60, retryInMinutes: null } }]);
    expect(windowFaults({ staged: [], incomingBytes: PROJECT_BYTES_PER_WINDOW, now: NOW })).toEqual([]);
  });

  it("bytes may bind before files, and both are returned when both bind", () => {
    expect(windowFaults({ staged: files(3, () => ago(1), 100n * MiB), incomingBytes: 1n, now: NOW }).map((f) => f.code)).toEqual(["TOO_MANY_BYTES_IN_WINDOW"]);
    expect(windowFaults({ staged: files(60, () => ago(1), 5n * MiB), incomingBytes: 1n, now: NOW }).map((f) => f.code)).toEqual(["TOO_MANY_FILES_IN_WINDOW", "TOO_MANY_BYTES_IN_WINDOW"]);
  });

  it("files that left the window weigh nothing", () => {
    expect(windowFaults({ staged: files(100, () => ago(61), 100n * MiB), incomingBytes: 256n * MiB, now: NOW })).toEqual([]);
  });
});

describe("stagedFileFaults (ADR 0042 D8)", () => {
  const officer: Actor = { side: "ORGANISATION", personId: "so", authorityToday: true };
  const account: Actor = { side: "CONTRACTOR", accountId: "acc" };
  const mine: StagedFile = { versionId: "dv1", stagedFor: STAGED_FOR_PROJECT_DOCUMENT, recordedByPersonId: "so", recordedBySupplierAccountId: null, attachments: 0, withdrawn: false, documentClassId: "class-p" };
  const theirs: StagedFile = { ...mine, recordedByPersonId: null, recordedBySupplierAccountId: "acc" };

  it("accepts the actor's own unattached files, staged for a project document, of the project class", () => {
    expect(stagedFileFaults([mine, { ...mine, versionId: "dv2" }], officer, "class-p")).toEqual([]);
    expect(stagedFileFaults([theirs], account, "class-p")).toEqual([]);
  });

  it("refuses another actor's file: another person, another account, or the other side", () => {
    expect(stagedFileFaults([{ ...mine, recordedByPersonId: "clerk" }], officer, "class-p")).toEqual([{ code: "NOT_YOURS", level: "block", data: { file: 1 } }]);
    expect(stagedFileFaults([{ ...theirs, recordedBySupplierAccountId: "acc2" }], account, "class-p").map((f) => f.code)).toEqual(["NOT_YOURS"]);
    expect(stagedFileFaults([theirs], officer, "class-p").map((f) => f.code)).toEqual(["NOT_YOURS"]);
    expect(stagedFileFaults([mine], account, "class-p").map((f) => f.code)).toEqual(["NOT_YOURS"]);
  });

  it("refuses a file not staged for a project, already attached, withdrawn, of another class, or named twice; every fault of every file", () => {
    const f = stagedFileFaults(
      [
        { ...mine, stagedFor: null },
        { ...mine, versionId: "dv2", stagedFor: STAGED_FOR_DELEGATION, attachments: 1 },
        { ...mine, versionId: "dv3", withdrawn: true, documentClassId: "class-x" },
        { ...mine, stagedFor: STAGED_FOR_PROJECT_DOCUMENT },
      ],
      officer,
      "class-p",
    );
    expect(f.map((x) => [x.code, x.data?.file])).toEqual([
      ["NOT_STAGED_FOR_PROJECT", 1],
      ["NOT_STAGED_FOR_PROJECT", 2],
      ["ALREADY_ATTACHED", 2],
      ["WITHDRAWN", 3],
      ["WRONG_CLASS", 3],
      ["DUPLICATE", 4],
    ]);
  });
});
