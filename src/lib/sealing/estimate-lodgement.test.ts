import { describe, expect, it } from "vitest";

import { lodgeFaults, type EstimateFacts } from "@/lib/scope/estimate";

import { estimateLodgedOn, needsRelodgement, sealedLodgementFaults, SEALED_LODGEMENT_WORDS, type StandingLodgement } from "./estimate-lodgement";

const standing = (keyId: string): StandingLodgement => ({ keyId, versionNo: 1, lodgedByPersonId: "p1" });
const facts = (over: Partial<EstimateFacts> = {}): EstimateFacts => ({ state: "LODGED", preparerPersonId: "p1", currentVersionNo: 1, classification: "SULIT", lodgedVersionNo: 1, retainedVersionNo: null, ...over });
const now = new Date("2026-11-20T04:00:00.000Z");
const base = { liveKeyId: "k2", again: false, reason: "", personId: "p1", lodgingOfficerId: "p1", closing: new Date("2026-11-21T04:00:00.000Z"), now };

describe("the estimate is lodged on both channels (ESTIMATE_NOT_LODGED)", () => {
  it("paper reads the state alone", () => {
    expect(estimateLodgedOn({ channel: "PAPER", state: "LODGED", liveKeyId: null, standing: null })).toBe(true);
    expect(estimateLodgedOn({ channel: "PAPER", state: "DRAFT", liveKeyId: null, standing: null })).toBe(false);
    expect(estimateLodgedOn({ channel: null, state: "LODGED", liveKeyId: null, standing: null })).toBe(true);
  });
  it("online needs a sealed copy under the live key", () => {
    expect(estimateLodgedOn({ channel: "ONLINE", state: "LODGED", liveKeyId: "k1", standing: standing("k1") })).toBe(true);
    expect(estimateLodgedOn({ channel: "ONLINE", state: "LODGED", liveKeyId: "k2", standing: standing("k1") })).toBe(false);
    expect(estimateLodgedOn({ channel: "ONLINE", state: "LODGED", liveKeyId: "k1", standing: null })).toBe(false);
    expect(estimateLodgedOn({ channel: "ONLINE", state: "LODGED", liveKeyId: null, standing: standing("k1") })).toBe(false);
    expect(estimateLodgedOn({ channel: "ONLINE", state: "DRAFT", liveKeyId: "k1", standing: standing("k1") })).toBe(false);
  });
  it("needs lodging again only online, lodged, and not under the live key", () => {
    expect(needsRelodgement({ channel: "ONLINE", state: "LODGED", liveKeyId: "k2", standing: standing("k1") })).toBe(true);
    expect(needsRelodgement({ channel: "ONLINE", state: "LODGED", liveKeyId: "k1", standing: standing("k1") })).toBe(false);
    expect(needsRelodgement({ channel: "PAPER", state: "LODGED", liveKeyId: null, standing: null })).toBe(false);
    expect(needsRelodgement({ channel: "ONLINE", state: "DRAFT", liveKeyId: "k1", standing: null })).toBe(false);
  });
});

describe("lodging the same version again", () => {
  it("is refused as already lodged unless the sealed copy is missing", () => {
    expect(lodgeFaults(facts(), { personId: "p1" }, "ADVERTISED").map((f) => f.code)).toEqual(["ALREADY_LODGED"]);
    expect(lodgeFaults(facts(), { personId: "p1" }, "ADVERTISED", true)).toEqual([]);
    // Paper's rule is unchanged for a version amended since.
    expect(lodgeFaults(facts({ currentVersionNo: 2 }), { personId: "p1" }, "ADVERTISED")).toEqual([]);
  });
});

describe("sealedLodgementFaults", () => {
  it("passes a first lodgement under a live key before the closing", () => {
    expect(sealedLodgementFaults(base)).toEqual([]);
  });
  it("needs the live key", () => {
    expect(sealedLodgementFaults({ ...base, liveKeyId: null }).map((f) => f.code)).toEqual(["SEALED_KEY_NOT_READY"]);
  });
  it("lodging again needs a reason and the officer who lodged it", () => {
    expect(sealedLodgementFaults({ ...base, again: true }).map((f) => f.code)).toEqual(["RELODGE_REASON_REQUIRED"]);
    expect(sealedLodgementFaults({ ...base, again: true, reason: "  " }).map((f) => f.code)).toEqual(["RELODGE_REASON_REQUIRED"]);
    expect(sealedLodgementFaults({ ...base, again: true, reason: "Key changed", personId: "p2" }).map((f) => f.code)).toEqual(["NOT_LODGING_OFFICER"]);
    expect(sealedLodgementFaults({ ...base, again: true, reason: "Key changed" })).toEqual([]);
    // A new version is judged as any lodgement is.
    expect(sealedLodgementFaults({ ...base, personId: "p2" })).toEqual([]);
  });
  it("is closed after the closing second, and open in it", () => {
    const closing = new Date("2026-11-20T04:00:00.000Z");
    expect(sealedLodgementFaults({ ...base, closing, now: new Date("2026-11-20T04:00:00.900Z") })).toEqual([]);
    expect(sealedLodgementFaults({ ...base, closing, now: new Date("2026-11-20T04:00:01.000Z") }).map((f) => f.code)).toEqual(["LODGEMENT_CLOSED"]);
    expect(sealedLodgementFaults({ ...base, closing, liveKeyId: null, again: true, now: new Date("2026-11-20T04:00:01.000Z") }).map((f) => f.code)).toEqual(["LODGEMENT_CLOSED"]);
  });
  it("says each refusal in words, never a figure", () => {
    for (const w of Object.values(SEALED_LODGEMENT_WORDS)) expect(w).not.toMatch(/\d{3}/);
  });
});
