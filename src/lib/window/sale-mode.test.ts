import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { windowWhitelist, windowFieldValues, renderInstrument, type WindowFieldContext } from "./fields";
import { howToBuyText, onlinePaymentAvailable, pinSaleMode, saleModeFault, saleModeWords, takeSaleModeFaults } from "./sale-mode";

describe("the pin (G1)", () => {
  it("takes the organisation's setting as it is, set or not", () => {
    expect(pinSaleMode("ONLINE")).toBe("ONLINE");
    expect(pinSaleMode(null)).toBeNull();
    expect(saleModeWords(null)).toBe("Not set");
  });
  it("an unset pin is refused in a finding that names it", () => {
    expect(saleModeFault(null)).toMatchObject({ code: "SALE_MODE_NOT_SET", level: "block" });
    expect(saleModeFault("COUNTER")).toBeNull();
  });
  it("may be taken only while unset, before publication, from a setting that is set, on an exercise not cancelled", () => {
    const ok = { status: "DRAFT" as const, published: false, pin: null, setting: "ONLINE" as const, releaseOnline: true as boolean | null };
    expect(takeSaleModeFaults(ok)).toEqual([]);
    // SR-10 review S3: an exercise does not take an online setting when the organisation does not release documents online.
    // Ruling 17a lifted the earlier M1 refusal (ONLINE_RESTRICTED): a restricted tender takes the online setting, since its restriction is evidenced from the supplier register. `takeSaleModeFaults` no longer even asks whether the tender is restricted.
    expect(takeSaleModeFaults({ ...ok, releaseOnline: null }).map((f) => f.code)).toEqual(["ONLINE_NEEDS_RELEASE"]);
    expect(takeSaleModeFaults({ ...ok, releaseOnline: false }).map((f) => f.code)).toEqual(["ONLINE_NEEDS_RELEASE"]);
    // Ruling 17a: the online setting is taken, with no fault at all, by an exercise that is restricted. The function is given no restriction to refuse on (its only inputs are the status, the pin, the setting and the release setting),
    // and the two callers pass none, so nothing about a restricted tender can stop the take.
    expect(takeSaleModeFaults({ ...ok })).toEqual([]);
    for (const caller of ["src/app/sourcing/[id]/window/actions.ts", "src/lib/window/read.ts"]) {
      const src = readFileSync(caller, "utf8");
      const call = src.slice(src.indexOf("takeSaleModeFaults({"), src.indexOf("})", src.indexOf("takeSaleModeFaults({")));
      expect(call, caller).not.toMatch(/restrict/i);
    }
    // The counter has no such limit.
    expect(takeSaleModeFaults({ ...ok, setting: "COUNTER", releaseOnline: null })).toEqual([]);
    expect(takeSaleModeFaults({ ...ok, pin: "COUNTER" }).map((f) => f.code)).toEqual(["NOTHING_TO_TAKE"]);
    expect(takeSaleModeFaults({ ...ok, published: true }).map((f) => f.code)).toEqual(["ALREADY_PUBLISHED"]);
    expect(takeSaleModeFaults({ ...ok, setting: null }).map((f) => f.code)).toEqual(["SETTING_NOT_SET"]);
    expect(takeSaleModeFaults({ ...ok, status: "CANCELLED" }).map((f) => f.code)).toEqual(["EXERCISE_CANCELLED"]);
  });
});

describe("the notice never promises online payment that is not switched on", () => {
  it("promises it only with the simulator on and a method configured", () => {
    expect(onlinePaymentAvailable({ simulatorOn: true, methods: ["Card"] })).toBe(true);
    for (const f of [{ simulatorOn: null, methods: ["Card"] }, { simulatorOn: false, methods: ["Card"] }, { simulatorOn: true, methods: [] }]) {
      expect(onlinePaymentAvailable(f)).toBe(false);
      expect(howToBuyText(f)).toMatch(/Online payment is not available/);
      expect(howToBuyText(f)).not.toMatch(/pay there/);
    }
    expect(howToBuyText({ simulatorOn: true, methods: ["Card"] })).toMatch(/pay there/);
  });
});

describe("the merge fields by how the documents are sold (SR-10)", () => {
  const ctx = (saleMode: WindowFieldContext["saleMode"], simulatorOn: boolean | null): WindowFieldContext => ({
    organisationName: "O", exerciseReference: "R", exerciseTitle: "T", requirements: [], advertisementDay: null, closingAt: null, timeZone: "Asia/Kuala_Lumpur",
    inspectionPlace: "", purchasePlace: "", inspectionHours: "", purchaseFromDay: null, purchaseCloseDay: null, fee: null, feePaymentMethods: "", submissionPlace: "",
    events: [], mandatoryPermitted: null, saleMode, onlinePayment: { simulatorOn, methods: ["Card"] },
  });
  const tpl = (body: string) => ({ id: "t", code: "n", nameEn: "N", bodyEn: body, bodyMs: null, primaryLanguage: null, bodyVersion: 1 });
  it("retires the five physical fields for an online exercise: a template naming one reads them as fields the portal does not fill", () => {
    const r = renderInstrument("NOTICE", tpl("Buy at {{window.purchasePlace}}."), (l) => windowFieldValues(ctx("ONLINE", true), l), null, "ONLINE");
    expect(r.unknown).toEqual(["window.purchasePlace"]);
    expect(windowWhitelist("NOTICE", "ONLINE").has("window.feePaymentMethods")).toBe(false);
    expect(windowWhitelist("NOTICE", "COUNTER").has("window.feePaymentMethods")).toBe(true);
  });
  it("offers 'how to buy' only online, and fills it from what is switched on", () => {
    expect(windowWhitelist("NOTICE", "ONLINE").has("window.howToBuy")).toBe(true);
    // SR-10 review S4: the field is known on a counter exercise too, and blank there without being missing, so one template serves both ways of selling (it was unknown there before).
    expect(windowWhitelist("NOTICE", "COUNTER").has("window.howToBuy")).toBe(true);
    const counter = renderInstrument("NOTICE", tpl("Fee {{window.fee}}.\n\n{{window.howToBuy}}"), (l) => windowFieldValues(ctx("COUNTER", null), l), null, "COUNTER");
    expect(counter.unknown).toEqual([]);
    expect(counter.missing).not.toContain("window.howToBuy");
    const off = renderInstrument("NOTICE", tpl("{{window.howToBuy}}"), (l) => windowFieldValues(ctx("ONLINE", null), l), null, "ONLINE");
    expect(off.text).toMatch(/Online payment is not available/);
    const on = renderInstrument("NOTICE", tpl("{{window.howToBuy}}"), (l) => windowFieldValues(ctx("ONLINE", true), l), null, "ONLINE");
    expect(on.text).toMatch(/pay there/);
  });
});

describe("the how-to-buy field (SR-10 review S4 and S5)", () => {
  it("has a Malay text as well as an English one, and each follows whether online payment is on", () => {
    const on = { simulatorOn: true, methods: ["Card"] };
    const off = { simulatorOn: false, methods: [] };
    expect(howToBuyText(on, "MS")).toMatch(/dalam talian/);
    expect(howToBuyText(on, "MS")).not.toBe(howToBuyText(on, "EN"));
    expect(howToBuyText(off, "MS")).toMatch(/tidak disediakan/);
    expect(howToBuyText(on)).toBe(howToBuyText(on, "EN"));
  });
});
