import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { approvedWords, cancellationEndedWords, NEW_APPLICATION_WAY_BACK, supplierFaultText, withdrawnWords } from "./labels";

/**
 * 6.13 Part B Run 1a, Should 2 (flagged 6.15a): four strings the Run 0 fix round wrote in English only now come from
 * labels.ts with Malay beside them, and the screen and the acts read them from there.
 *
 * Worked example: a registration cancelled from 03 Oct 2026, the supplier registered again on 04 Oct 2026.
 */

describe("the words, in English and Malay", () => {
  it("an ended cancellation's chip is the CANCELLATION_ENDED note itself (one source)", () => {
    const words = cancellationEndedWords("2026-10-03", "2026-10-04");
    expect(words).toEqual({
      en: "The registration cancelled from 03 Oct 2026 ended when the supplier registered again on 04 Oct 2026.",
      ms: "Pendaftaran yang dibatalkan mulai 03 Oct 2026 tamat apabila pembekal berdaftar semula pada 04 Oct 2026.",
    });
    const note = { code: "CANCELLATION_ENDED", level: "info" as const, data: { since: "2026-10-03", registeredOn: "2026-10-04" } };
    expect(supplierFaultText(note, "en")).toBe(words.en);
    expect(supplierFaultText(note, "ms")).toBe(words.ms);
  });

  it("the approval's message: registered again, registered, or approved", () => {
    expect(approvedWords("NEW", { since: "2026-10-03" }, "2026-10-04")).toEqual({
      en: "Approved: the supplier is registered again from 04 Oct 2026; the registration cancelled from 03 Oct 2026 no longer stands. The notice to the supplier is shown, not sent.",
      ms: "Diluluskan: pembekal berdaftar semula mulai 04 Oct 2026; pendaftaran yang dibatalkan mulai 03 Oct 2026 tidak lagi berkuat kuasa. Notis kepada pembekal dipaparkan, tidak dihantar.",
    });
    expect(approvedWords("NEW", null, "2026-10-04")).toEqual({
      en: "Approved: the supplier is registered. The notice to the supplier is shown, not sent.",
      ms: "Diluluskan: pembekal didaftarkan. Notis kepada pembekal dipaparkan, tidak dihantar.",
    });
    expect(approvedWords("RENEWAL", null, "2026-10-04")).toEqual({
      en: "Approved: the application is approved. The notice to the supplier is shown, not sent.",
      ms: "Diluluskan: permohonan diluluskan. Notis kepada pembekal dipaparkan, tidak dihantar.",
    });
  });

  it("the withdrawal's message: the standing it changed to, in each language, or none where it did not change", () => {
    const notRevisited = { en: "Not revisited.", ms: "Tidak disemak semula." };
    expect(withdrawnWords({ en: "Active", ms: "Aktif" }, notRevisited)).toEqual({
      en: "Withdrawn as recorded in error. It stays on the record, marked withdrawn with why; the supplier's standing no longer reads it (now active). Not revisited.",
      ms: "Ditarik balik kerana direkodkan secara tersilap. Ia kekal dalam rekod, ditanda ditarik balik beserta sebabnya; kedudukan pembekal tidak lagi membacanya (kini aktif). Tidak disemak semula.",
    });
    expect(withdrawnWords(null, notRevisited)).toEqual({
      en: "Withdrawn as recorded in error. It stays on the record, marked withdrawn with why; the supplier's standing no longer reads it. Not revisited.",
      ms: "Ditarik balik kerana direkodkan secara tersilap. Ia kekal dalam rekod, ditanda ditarik balik beserta sebabnya; kedudukan pembekal tidak lagi membacanya. Tidak disemak semula.",
    });
  });

  it("the drawer's way back: a new application", () => {
    expect(NEW_APPLICATION_WAY_BACK).toEqual({
      en: "A cancellation that stood is not withdrawn: the supplier registers again, by a new application on the Applications tab, which ends it once approved.",
      ms: "Pembatalan yang telah berkuat kuasa tidak ditarik balik: pembekal mendaftar semula melalui permohonan baharu di tab Permohonan, yang menamatkannya setelah diluluskan.",
    });
  });
});

describe("the screen and the acts read them from labels.ts (source)", () => {
  const panels = readFileSync("src/app/suppliers/[id]/standing-panels.tsx", "utf8");
  const editors = readFileSync("src/app/suppliers/[id]/standing-editors.tsx", "utf8");
  const actions = readFileSync("src/app/suppliers/actions.ts", "utf8");
  const standingActs = readFileSync("src/app/suppliers/standing-actions.ts", "utf8");

  it("the Recorded card's ended chip renders the note's words, no literal of its own", () => {
    expect(panels).not.toMatch(/Ended: registered again/);
    expect(panels).toMatch(/cancellationEndedWords\(storedDay\(e\.effectiveOn\), day\(s\.registeredOn\)\)\.en/);
  });

  it("the approval and the withdrawal return their messages from the words", () => {
    expect(actions).not.toMatch(/registered again from \$\{/);
    expect(actions).toMatch(/message: approvedWords\(a\.kind, again, today\)\.en/);
    expect(standingActs).not.toMatch(/\(now \$\{/);
    expect(standingActs).toMatch(/message: withdrawnWords\(/);
  });

  it("the withdrawal drawer's way back comes from the words", () => {
    expect(editors).not.toMatch(/the supplier registers again, by a new application/);
    expect(editors).toMatch(/NEW_APPLICATION_WAY_BACK\.en/);
  });
});
