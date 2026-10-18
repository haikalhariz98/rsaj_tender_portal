import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// NFR-LNG-001 (ADR 0040): the switch is drawn inside RecordEditor's own <form>, so it must never submit, carry a formAction or be a form.
const read = (rel: string) => readFileSync(path.join(__dirname, "../..", rel), "utf8");

describe("the language switch never submits the form it sits in", () => {
  const source = read("components/shell/language-switch.tsx").replace(/\/\*[\s\S]*?\*\//g, "");
  it("has no <form>, no formAction and no submit button", () => {
    expect(source).not.toMatch(/<form\b/);
    expect(source).not.toMatch(/formAction/);
    expect(source).not.toMatch(/type=["']submit["']/);
  });
  it("calls the action from a transition, not from a form", () => {
    expect(source).toMatch(/startTransition\(/);
    expect(source).not.toMatch(/app\/_auth/);
    expect(source).toMatch(/setLanguage\(/);
  });
  it("is the shared toggle, whose buttons are type=button", () => {
    expect(source).toMatch(/<Toggle\b/);
    expect(read("components/ui/toggle.tsx")).toMatch(/type="button"/);
  });
  it("sits in the shared DrawerHeader and in the top bar", () => {
    expect(read("components/ui/drawer-header.tsx")).toMatch(/<LanguageSwitch\b/);
    expect(read("components/shell/topbar.tsx")).toMatch(/<LanguageSwitch\b/);
  });
});
