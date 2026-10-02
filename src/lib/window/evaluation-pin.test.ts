import { describe, expect, it } from "vitest";

import { evaluationFindingText } from "@/lib/evaluation/labels";
import { chooseFaults, pinFaults, type PinInput } from "@/lib/evaluation/pin";

import { evaluationPin } from "./publish";
import { windowFindingText } from "./labels";

/**
 * 6.8 E-2 at the 6.5 publication (flagged, against accepted 6.5): the model is chosen on the Window
 * card and judged with the publication, so the card and the act give the same reason in the same
 * words. Pinned once: a pinned model is never pinned again.
 */

const model = { id: "m1", code: "M", version: 2, nameEn: "Works", status: "ISSUED" as const, route: "TRADITIONAL" as const, contentSnapshot: {} };
const data = (m: typeof model | null, basis: { nameEn: string; evaluationRoute: "TRADITIONAL" | "TWO_STAGE" | null } | null) => ({ evaluation: { model: m, basis, models: [], suggested: null } });
const codes = (i: PinInput) => pinFaults(i).map((f) => f.code);

describe("the pin as the publication judges it (evaluationPin)", () => {
  it("an issued model of the basis's route, not pinned: nothing blocks", () => {
    const i = evaluationPin(data(model, { nameEn: "Lump sum", evaluationRoute: "TRADITIONAL" }), { evaluationModelPinnedAt: null, contractBasisCode: "LS" });
    expect(i).toEqual({ model: { status: "ISSUED", route: "TRADITIONAL", name: "Works, version 2" }, basis: { name: "Lump sum", route: "TRADITIONAL" }, pinned: false });
    expect(codes(i)).toEqual([]);
  });
  it("no model chosen: EVALUATION_MODEL_NOT_SET", () => {
    expect(codes(evaluationPin(data(null, { nameEn: "Lump sum", evaluationRoute: "TRADITIONAL" }), { evaluationModelPinnedAt: null, contractBasisCode: "LS" }))).toEqual(["EVALUATION_MODEL_NOT_SET"]);
  });
  it("no basis on the exercise: CONTRACT_BASIS_NOT_SET", () => {
    expect(codes(evaluationPin(data(model, null), { evaluationModelPinnedAt: null, contractBasisCode: null }))).toEqual(["CONTRACT_BASIS_NOT_SET"]);
  });
  it("a basis code no longer configured reads as a basis with no route, never as a match", () => {
    expect(codes(evaluationPin(data(model, null), { evaluationModelPinnedAt: null, contractBasisCode: "GONE" }))).toEqual(["EVALUATION_ROUTE_NOT_SET"]);
  });
  it("the basis's route not set: EVALUATION_ROUTE_NOT_SET", () => {
    expect(codes(evaluationPin(data(model, { nameEn: "Lump sum", evaluationRoute: null }), { evaluationModelPinnedAt: null, contractBasisCode: "LS" }))).toEqual(["EVALUATION_ROUTE_NOT_SET"]);
  });
  it("a model of the other route: EVALUATION_ROUTE_MISMATCH", () => {
    expect(codes(evaluationPin(data(model, { nameEn: "Design and build", evaluationRoute: "TWO_STAGE" }), { evaluationModelPinnedAt: null, contractBasisCode: "DB" }))).toEqual(["EVALUATION_ROUTE_MISMATCH"]);
  });
  it("a draft or a retired model blocks, each named", () => {
    const b = { nameEn: "Lump sum", evaluationRoute: "TRADITIONAL" as const };
    expect(codes(evaluationPin(data({ ...model, status: "DRAFT" as never }, b), { evaluationModelPinnedAt: null, contractBasisCode: "LS" }))).toEqual(["EVALUATION_MODEL_NOT_ISSUED"]);
    expect(codes(evaluationPin(data({ ...model, status: "RETIRED" as never }, b), { evaluationModelPinnedAt: null, contractBasisCode: "LS" }))).toEqual(["EVALUATION_MODEL_RETIRED"]);
  });
  it("already pinned: EVALUATION_MODEL_PINNED alone", () => {
    expect(codes(evaluationPin(data(model, { nameEn: "Lump sum", evaluationRoute: "TRADITIONAL" }), { evaluationModelPinnedAt: new Date("2026-10-01T02:00:00Z"), contractBasisCode: "LS" }))).toEqual(["EVALUATION_MODEL_PINNED"]);
  });
});

describe("the card and the act give the same words", () => {
  it.each(["EVALUATION_MODEL_NOT_SET", "EVALUATION_MODEL_NOT_ISSUED", "EVALUATION_MODEL_RETIRED", "EVALUATION_ROUTE_NOT_SET", "EVALUATION_ROUTE_MISMATCH", "EVALUATION_MODEL_PINNED", "EVALUATION_MODEL_FROZEN", "CONTRACT_BASIS_NOT_SET"])("%s reads through the window's labels as evaluation's", (code) => {
    const f = { code, level: "block" as const, data: { model: "Works, version 2", basis: "Lump sum" } };
    expect(windowFindingText(f)).toBe(evaluationFindingText(f));
    expect(windowFindingText(f)).not.toMatch(/[A-Z]{3,}_[A-Z]/);
  });
});

describe("choosing on the card (chooseFaults)", () => {
  const issued = { status: "ISSUED" as const, name: "Works, version 2" };
  it("unpublished, not cancelled, an issued model: allowed", () => expect(chooseFaults({ published: false, cancelled: false, model: issued })).toEqual([]));
  it("published or cancelled: frozen, whatever is chosen", () => {
    expect(chooseFaults({ published: true, cancelled: false, model: issued }).map((f) => f.code)).toEqual(["EVALUATION_MODEL_FROZEN"]);
    expect(chooseFaults({ published: false, cancelled: true, model: issued }).map((f) => f.code)).toEqual(["EVALUATION_MODEL_FROZEN"]);
  });
  it("a draft or retired version is never chosen", () => {
    expect(chooseFaults({ published: false, cancelled: false, model: { status: "DRAFT", name: "x" } }).map((f) => f.code)).toEqual(["EVALUATION_MODEL_NOT_ISSUED"]);
    expect(chooseFaults({ published: false, cancelled: false, model: { status: "RETIRED", name: "x" } }).map((f) => f.code)).toEqual(["EVALUATION_MODEL_RETIRED"]);
  });
});
