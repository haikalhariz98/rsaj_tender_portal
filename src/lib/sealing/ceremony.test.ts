import { describe, expect, it } from "vitest";

import type { BidPartRule } from "@/lib/bids/online/types";

import { keyState, PASSPHRASE_WORDS, passphraseFaults, publishSealingFaults, publishSealingWords, rekeyFaults } from "./ceremony";
import { onlineSubmissionAllowed } from "./switch";

const ROSTER = ["r1", "r2"];
const rule = (over: Partial<BidPartRule> = {}): BidPartRule => ({ packPartId: "p1", label: "Grand Summary", mandatory: true, returnedByBidder: true, acceptedMediaTypes: ["application/pdf"], maxBytes: "5242880", openingCheck: true, ...over });
const ONLINE_OK = onlineSubmissionAllowed("LIVE", { demoAllowed: false, liveAllowed: true }, "PUBLISH");
const LIVE_KEY = keyState({ liveOfficerRowIds: ROSTER, officersWithKey: ROSTER, liveKey: { shareHolderRowIds: ROSTER } });
const base: Parameters<typeof publishSealingFaults>[0] = { channel: "ONLINE", online: ONLINE_OK, key: LIVE_KEY, rules: [rule()], alternativesPermitted: false, pepperRequired: true, pepperConfigured: true };
const codes = (over: Partial<typeof base>) => publishSealingFaults({ ...base, ...over }).map((f) => f.code);

describe("the key's state (D3, 20k)", () => {
  it("awaits the officers until a live key exists, naming who has not set a share", () => {
    expect(keyState({ liveOfficerRowIds: ROSTER, officersWithKey: ["r1"], liveKey: null })).toEqual({ state: "AWAITING_OFFICERS", missing: ["r2"], stale: false });
    expect(keyState({ liveOfficerRowIds: ROSTER, officersWithKey: [], liveKey: null })).toEqual({ state: "AWAITING_OFFICERS", missing: ["r1", "r2"], stale: false });
  });

  it("is LIVE and not stale when its holders are exactly the live roster, each with a live key of their own", () => {
    expect(LIVE_KEY).toEqual({ state: "LIVE", missing: [], stale: false });
    expect(keyState({ liveOfficerRowIds: ROSTER, officersWithKey: ROSTER, liveKey: { shareHolderRowIds: ["r2", "r1"] } }).stale).toBe(false);
  });

  it("is stale when the roster has changed, or a holder's own key was replaced", () => {
    expect(keyState({ liveOfficerRowIds: ["r1", "r3"], officersWithKey: ["r1", "r3"], liveKey: { shareHolderRowIds: ROSTER } }).stale).toBe(true);
    expect(keyState({ liveOfficerRowIds: ["r1", "r2", "r3"], officersWithKey: ["r1", "r2", "r3"], liveKey: { shareHolderRowIds: ROSTER } }).stale).toBe(true);
    expect(keyState({ liveOfficerRowIds: ROSTER, officersWithKey: ["r1"], liveKey: { shareHolderRowIds: ROSTER } })).toEqual({ state: "LIVE", missing: ["r2"], stale: true });
  });
});

describe("a re-key (20g, 20p)", () => {
  const closing = new Date("2026-11-10T04:00:00Z");
  it("is allowed before the closing with no submission, the closing second included", () => {
    expect(rekeyFaults({ submissions: 0, now: new Date("2026-11-10T03:59:59Z"), closing })).toEqual([]);
    expect(rekeyFaults({ submissions: 0, now: new Date("2026-11-10T04:00:00.999Z"), closing })).toEqual([]);
  });
  it("is refused from the next second after the closing, as the key trigger judges it", () => {
    expect(rekeyFaults({ submissions: 0, now: new Date("2026-11-10T04:00:01Z"), closing })).toEqual(["AFTER_CLOSING"]);
  });
  it("is refused once any submission exists, and while no closing is set", () => {
    expect(rekeyFaults({ submissions: 1, now: new Date("2026-11-01T00:00:00Z"), closing })).toEqual(["SUBMISSIONS_EXIST"]);
    expect(rekeyFaults({ submissions: 0, now: new Date("2026-11-01T00:00:00Z"), closing: null })).toEqual(["CLOSING_NOT_SET"]);
    expect(rekeyFaults({ submissions: 3, now: new Date("2026-12-01T00:00:00Z"), closing })).toEqual(["SUBMISSIONS_EXIST", "AFTER_CLOSING"]);
  });
});

describe("publication's sealing refusals (D1, D3, D7, 20h, 20o, 20v)", () => {
  it("none when everything is in place; none for a paper exercise; an unset channel refuses", () => {
    expect(codes({})).toEqual([]);
    expect(codes({ channel: "PAPER", key: keyState({ liveOfficerRowIds: ROSTER, officersWithKey: [], liveKey: null }), rules: null, alternativesPermitted: null })).toEqual([]);
    expect(codes({ channel: null })).toEqual(["CHANNEL_NOT_SET"]);
  });

  it("refuses, each in its own words: no key, a stale key, the mode unset or not allowed, a rule unset, alternatives unstated, the pepper missing under LIVE", () => {
    expect(codes({ key: keyState({ liveOfficerRowIds: ROSTER, officersWithKey: ["r1"], liveKey: null }) })).toEqual(["KEY_NOT_SET"]);
    expect(codes({ key: keyState({ liveOfficerRowIds: ["r1", "r3"], officersWithKey: ["r1", "r3"], liveKey: { shareHolderRowIds: ROSTER } }) })).toEqual(["KEY_STALE"]);
    expect(codes({ online: onlineSubmissionAllowed(null, { demoAllowed: true, liveAllowed: true }, "PUBLISH") })).toEqual(["ONLINE_NOT_SET"]);
    expect(codes({ online: onlineSubmissionAllowed("LIVE", { demoAllowed: true, liveAllowed: false }, "PUBLISH") })).toEqual(["ONLINE_NOT_ALLOWED"]);
    expect(codes({ rules: null })).toEqual(["RULES_NOT_SET"]);
    expect(codes({ rules: [rule({ acceptedMediaTypes: [] })] })).toEqual(["PART_TYPES_NOT_SET"]);
    expect(codes({ rules: [rule({ maxBytes: "" })] })).toEqual(["PART_SIZE_NOT_SET"]);
    expect(codes({ rules: [rule({ maxBytes: "0" })] })).toEqual(["PART_SIZE_NOT_SET"]);
    expect(codes({ alternativesPermitted: null })).toEqual(["ALTERNATIVES_NOT_STATED"]);
    expect(codes({ pepperConfigured: false })).toEqual(["PEPPER_NOT_SET"]);
    expect(codes({ pepperRequired: false, pepperConfigured: false })).toEqual([]);
    const words = new Set(["KEY_NOT_SET", "KEY_STALE", "ONLINE_NOT_SET", "ONLINE_NOT_ALLOWED", "RULES_NOT_SET", "PART_TYPES_NOT_SET", "PART_SIZE_NOT_SET", "ALTERNATIVES_NOT_STATED", "PEPPER_NOT_SET", "CHANNEL_NOT_SET"].map((code) => publishSealingWords({ code, level: "block", data: { label: "Grand Summary", missing: 1 } })));
    expect(words.size).toBe(10);
  });

  // Ruling 20z: the channel unset says why and where, as the sale mode's words do, so the refusal is never a dead end (ruling 13).
  it("the channel not set says why, and where to take it or set it", () => {
    const text = publishSealingWords({ code: "CHANNEL_NOT_SET", level: "block" });
    expect(text).toMatch(/because the organisation had not set it when the exercise was made/);
    expect(text).toMatch(/Take the organisation's setting under Notice and fee on Scope and estimate/);
    expect(text).toMatch(/two people set it under Configuration, Invitation/);
  });

  it("a rule unset is named by its part, and a part the bidder does not return is not judged", () => {
    const fs = publishSealingFaults({ ...base, rules: [rule({ acceptedMediaTypes: [], label: "Surat Akuan Pembida" }), rule({ packPartId: "p2", returnedByBidder: false, acceptedMediaTypes: [], maxBytes: "" })] });
    expect(fs).toEqual([{ code: "PART_TYPES_NOT_SET", level: "block", data: { label: "Surat Akuan Pembida" } }]);
    expect(publishSealingWords(fs[0])).toMatch(/Surat Akuan Pembida/);
    expect(publishSealingWords({ code: "KEY_NOT_SET", level: "block", data: { missing: 1 } })).toMatch(/Every named officer is needed/);
  });
});

describe("the unseal passphrase (D4)", () => {
  it("needs the organisation's minimum set, met, typed twice the same, and not the sign-in password", () => {
    expect(passphraseFaults("a long passphrase", "a long passphrase", 12, false)).toEqual([]);
    expect(passphraseFaults("a long passphrase", "a long passphrase", null, false)).toEqual(["MIN_LENGTH_NOT_SET"]);
    expect(passphraseFaults("short", "short", 12, false)).toEqual(["TOO_SHORT"]);
    expect(passphraseFaults("", "", 12, false)).toEqual(["TOO_SHORT"]);
    expect(passphraseFaults("a long passphrase", "a long passphrasf", 12, false)).toEqual(["NOT_REPEATED"]);
    expect(passphraseFaults("a long passphrase", "a long passphrase", 12, true)).toEqual(["SAME_AS_SIGN_IN"]);
  });

  it("counts characters, not bytes, and reads both typings in normal form C", () => {
    expect(passphraseFaults("kata laluan café!", "kata laluan café!", 17, false)).toEqual([]);
    expect(passphraseFaults("ééééééééééé", "ééééééééééé", 12, false)).toEqual(["TOO_SHORT"]);
    expect(passphraseFaults("éééééééééééé", "éééééééééééé", 12, false)).toEqual([]);
  });

  it("says why, never in codes", () => {
    for (const w of Object.values(PASSPHRASE_WORDS)) expect(w).not.toMatch(/[A-Z]{3,}_[A-Z_]+/);
  });
});
