import { describe, expect, it } from "vitest";

import { myBidOpenedWords, myBidOpeningState, receiptRoll, type MyBidOpeningState } from "./roll";

const D = (c: string) => c.repeat(64);

describe("the opening roll (H2)", () => {
  it("freezes every standing submission's sequence, receipt digest and late flag, in sequence order, with a digest of its own", () => {
    const roll = receiptRoll([
      { sequence: 4, receiptDigest: D("4"), late: false, status: "SUBMITTED" },
      { sequence: 1, receiptDigest: D("1"), late: false, status: "SUBMITTED" },
      { sequence: 2, receiptDigest: D("2"), late: false, status: "REPLACED" },
      { sequence: 3, receiptDigest: D("3"), late: false, status: "WITHDRAWN" },
      { sequence: 5, receiptDigest: D("5"), late: true, status: "SUBMITTED" },
    ]);
    expect(roll.v).toBe(1);
    expect(roll.entries).toEqual([
      { sequence: 1, receiptDigest: D("1"), late: false },
      { sequence: 4, receiptDigest: D("4"), late: false },
      { sequence: 5, receiptDigest: D("5"), late: true },
    ]);
    expect(roll.rollDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("its digest changes with any entry, and not with the order the rows were read in", () => {
    const rows = [
      { sequence: 1, receiptDigest: D("1"), late: false, status: "SUBMITTED" as const },
      { sequence: 2, receiptDigest: D("2"), late: true, status: "SUBMITTED" as const },
    ];
    const d = receiptRoll(rows).rollDigest;
    expect(receiptRoll([...rows].reverse()).rollDigest).toBe(d);
    expect(receiptRoll([{ ...rows[0], receiptDigest: D("9") }, rows[1]]).rollDigest).not.toBe(d);
    expect(receiptRoll([rows[0], { ...rows[1], late: false }]).rollDigest).not.toBe(d);
  });
});

describe("where a supplier's own bid stands, from the opening's start (20s)", () => {
  const s = (over: Partial<Parameters<typeof myBidOpeningState>[0]>) => myBidOpeningState({ status: "SUBMITTED", openingStarted: true, unsealed: false, rollEntry: { late: false }, opened: false, ...over });
  it("nothing before the start", () => expect(s({ openingStarted: false })).toBeNull());
  it("listed, not opened, between the start and the unseal", () => expect(s({})).toBe("LISTED_NOT_OPENED"));
  it("opened, at the unseal or at a supplementary opening", () => {
    expect(s({ unsealed: true, opened: true, status: "OPENED" })).toBe("OPENED");
    expect(s({ rollEntry: { late: true }, unsealed: true, opened: true, status: "OPENED" })).toBe("OPENED");
  });
  it("late in the roll, so not opened at the main opening", () => expect(s({ rollEntry: { late: true }, unsealed: true })).toBe("LATE_IN_ROLL"));
  it("not in the roll", () => expect(s({ rollEntry: null })).toBe("NOT_IN_ROLL"));
  it("replaced or withdrawn: not opened, as expected", () => {
    expect(s({ status: "REPLACED", rollEntry: null })).toBe("REPLACED_OR_WITHDRAWN");
    expect(s({ status: "WITHDRAWN", rollEntry: null })).toBe("REPLACED_OR_WITHDRAWN");
  });
  it("listed, in time, unsealed and still not opened reads as listed and not opened, whose words ask the supplier to contact the organisation", () => {
    expect(s({ unsealed: true })).toBe("LISTED_NOT_OPENED");
    const words = myBidOpenedWords({ state: "LISTED_NOT_OPENED", digest: D("a"), organisationName: "Jabatan Kerja Raya Negeri" }).detail;
    expect(words.en).toMatch(/still not shown as opened, contact Jabatan Kerja Raya Negeri now/);
    expect(words.ms).toMatch(/hubungi Jabatan Kerja Raya Negeri sekarang/);
  });
});

/// Ruling 20ab: the words are `Words`, in English and Malay, so every check reads both. The Malay's "signed", "proof" and "verified" are scanned too.
const NEVER_EN = /\b(verified|verify|signed|signature|proof|proves|confirmed)\b/i;
const NEVER_MS = /tandatangan|bukti|disahkan|mengesahkan|pengesahan/i;

describe("the words of each state (20s, 20j, ruling 25)", () => {
  const STATES: MyBidOpeningState[] = ["LISTED_NOT_OPENED", "OPENED", "LATE_IN_ROLL", "NOT_IN_ROLL", "REPLACED_OR_WITHDRAWN"];
  const digest = "3f".repeat(32);
  const ORG = "Lembaga Contoh Daerah";

  it.each(STATES)("%s carries the digest in full, in both languages, and never says verified, signed or proof", (state) => {
    const w = myBidOpenedWords({ state, digest, organisationName: ORG });
    expect(w.digest).toBe(digest);
    expect(w.detail.en).toContain(digest);
    expect(w.detail.ms).toContain(digest);
    for (const text of [w.headline.en, w.detail.en]) expect(text).not.toMatch(NEVER_EN);
    for (const text of [w.headline.ms, w.detail.ms]) expect(text).not.toMatch(NEVER_MS);
    expect(w.headline.en.length).toBeGreaterThan(5);
    expect(w.headline.ms.length).toBeGreaterThan(5);
  });

  it("listed and opened ask the supplier to compare the digest with the receipt it kept", () => {
    for (const state of ["LISTED_NOT_OPENED", "OPENED", "LATE_IN_ROLL"] as const) {
      const w = myBidOpenedWords({ state, digest, organisationName: ORG }).detail;
      expect(w.en).toMatch(/Compare it with the receipt you printed or saved when you submitted/);
      expect(w.ms).toMatch(/Bandingkan dengan resit yang anda cetak atau simpan/);
    }
  });

  it("OPENED keeps ruling 25's words, and gives no verdict", () => {
    const w = myBidOpenedWords({ state: "OPENED", digest, organisationName: ORG });
    expect(w.headline.en).toBe("Opened; the result follows the evaluation");
    expect(w.detail.en).not.toMatch(/\b(won|lost|rejected|passed|failed|lowest|highest|rank)\b/i);
    expect(w.detail.ms).not.toMatch(/\b(menang|kalah|ditolak|lulus|gagal|terendah|tertinggi|kedudukan)\b/i);
  });

  // Security audit 8: the supplier may hold other receipts that are in the list, so the words speak of this submission only.
  it("NOT_IN_ROLL speaks of this submission, names the organisation from configuration and asks the supplier to contact it now, quoting its receipt", () => {
    const w = myBidOpenedWords({ state: "NOT_IN_ROLL", digest, organisationName: ORG });
    expect(w.detail.en).toMatch(/^This submission is not in the list/);
    expect(w.detail.en).not.toMatch(/None of your receipts/);
    expect(w.detail.en).toMatch(new RegExp(`Contact ${ORG} now, quoting the receipt you kept`));
    expect(w.detail.ms).toMatch(/^Penyerahan ini tiada dalam senarai/);
    expect(w.detail.ms).toMatch(new RegExp(`Hubungi ${ORG} sekarang`));
    expect(myBidOpenedWords({ state: "NOT_IN_ROLL", digest, organisationName: "Pejabat Lain" }).detail.en).toMatch(/Contact Pejabat Lain now/);
    expect(myBidOpenedWords({ state: "NOT_IN_ROLL", digest, organisationName: "  " }).detail).toMatchObject({ en: expect.stringMatching(/Contact the procurement office now/), ms: expect.stringMatching(/Hubungi pejabat perolehan sekarang/) });
  });

  it("replaced and withdrawn say they were not opened, as expected", () => {
    expect(myBidOpenedWords({ state: "REPLACED_OR_WITHDRAWN", digest, organisationName: ORG }).headline).toEqual({ en: "Not opened, as expected", ms: "Tidak dibuka, seperti yang dijangka" });
  });

  it("with no digest recorded the words say so, and show none", () => {
    const w = myBidOpenedWords({ state: "OPENED", digest: null, organisationName: ORG });
    expect(w.digest).toBeNull();
    expect(w.detail.en).toMatch(/No receipt digest is recorded/);
    expect(w.detail.ms).toMatch(/Tiada cincangan resit direkodkan/);
  });
});
