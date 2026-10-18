// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { LanguageProvider } from "@/components/i18n/language-context";
import { COMPONENT_WORDS } from "@/lib/i18n/catalogues/components";
import type { Language } from "@/lib/i18n/language";

import { DataList, type Column, type Row } from "./data-list";

// NFR-LNG-001: a converted screen's shared list writes no English of its own (the provenance tag, the SULIT lock and caption), and a switch
// leaves no filter holding a word the cells no longer show.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

const columns: Column[] = [
  { key: "name", label: "Name" },
  { key: "stage", label: "Stage" },
  { key: "value", label: "Value", sulit: true },
];
const stageText = (language: Language, en: string, ms: string) => ({ kind: "text" as const, text: language === "ms" ? ms : en });
const rowsIn = (language: Language): Row[] => [
  { id: "1", search: "one", cells: { name: { kind: "text", text: "One" }, stage: stageText(language, "Signing", "Menandatangani"), value: { kind: "withheld", words: "Reason" } } },
  { id: "2", search: "two", cells: { name: { kind: "chips", items: [{ text: "In delay", provenance: "ASSUMED" }] }, stage: stageText(language, "Drafting", "Menyediakan draf"), value: { kind: "withheld", words: "Reason" } } },
];

function draw(language: Language) {
  root!.render(createElement(LanguageProvider, { language, choice: language, canSwitch: false }, createElement(DataList, { columns, rows: rowsIn(language), filters: [{ key: "stage", label: "Stage" }] })));
}
function mount(language: Language) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => draw(language));
  return host;
}

describe("the shared list in Malay", () => {
  it("writes the provenance tag, the withheld caption and the column lock in Malay", () => {
    const host = mount("ms");
    const text = host.textContent ?? "";
    expect(text).toContain(COMPONENT_WORDS.provAssumed.ms);
    expect(text).not.toContain(COMPONENT_WORDS.provAssumed.en);
    expect(text).toContain(COMPONENT_WORDS.sulitWithheld.ms);
    expect(text).not.toContain("withheld");
    expect(host.innerHTML).toContain(COMPONENT_WORDS.sulitColumn.ms);
    expect(host.innerHTML).not.toContain(COMPONENT_WORDS.sulitColumn.en);
  });

  it("keeps the English words in English", () => {
    const host = mount("en");
    expect(host.textContent).toContain(COMPONENT_WORDS.sulitWithheld.en);
    expect(host.innerHTML).toContain(COMPONENT_WORDS.sulitColumn.en);
  });

  it("a filter chosen in English does not empty the list after a switch to Malay", () => {
    const host = mount("en");
    const select = host.querySelector("select[aria-label*='Stage'], select") as HTMLSelectElement;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select, "Signing");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(host.textContent).not.toContain("In delay");
    act(() => draw("ms"));
    expect(host.textContent).toContain("Menandatangani");
    expect(host.textContent).toContain("Menyediakan draf");
    expect(host.textContent).toContain(COMPONENT_WORDS.provAssumed.ms);
  });
});
