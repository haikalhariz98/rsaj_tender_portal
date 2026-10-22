import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { StepperStep } from "@/lib/ui/steps";

import { Stepper } from "./stepper";

/** Design note 0004 §6.2 (wave C step C2, ADR 0037 F0-10): parked, selected and linked steps. */
const render = (steps: StepperStep[], selected?: string) => renderToStaticMarkup(createElement(Stepper, { steps, label: "Flow", selected }));
const count = (html: string, s: string) => html.split(s).length - 1;

const plain: StepperStep[] = [
  { key: "a", label: "Submitted", state: "done" },
  { key: "b", label: "Head", sub: "waits", state: "current" },
  { key: "c", label: "Chief", state: "waiting" },
  { key: "d", label: "Refused", state: "rejected", tone: "warn" },
];

describe("Stepper", () => {
  it("without selected, marks every current step, as the five existing users render", () => {
    const html = render([...plain, { key: "e", label: "Also now", state: "current" }]);
    expect(count(html, 'aria-current="step"')).toBe(2);
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("border-dashed");
    expect(html).toContain("not reached yet");
    expect(html).toContain("waiting now");
  });

  it("draws a parked step dashed, greyed out and read as parked", () => {
    const html = render([{ key: "p", label: "Later", state: "parked" }]);
    expect(html).toContain("border-dashed");
    expect(html).toContain("text-ink-3");
    expect(html).toContain(", parked");
    expect(html).not.toContain('aria-current');
  });

  it("with selected, marks that step only, though several are current", () => {
    const steps: StepperStep[] = [
      { key: "x", label: "Before signing", state: "current" },
      { key: "y", label: "Signing", state: "current" },
    ];
    const html = render(steps, "y");
    expect(count(html, 'aria-current="step"')).toBe(1);
    expect(html).toMatch(/<li[^>]*aria-current="step"[^>]*>(?:(?!<\/li>).)*Signing/);
    expect(count(render(steps, "none"), "aria-current")).toBe(0);
  });

  it("with selected, sets the viewed step apart from the other in-progress steps, and draws nothing extra without it (AC-66)", () => {
    const steps: StepperStep[] = [
      { key: "x", label: "Before signing", state: "current" },
      { key: "y", label: "Signing", state: "current" },
    ];
    const html = render(steps, "y");
    expect(count(html, "outline-brand-600")).toBe(1);
    expect(count(html, "decoration-brand-600")).toBe(1);
    expect(html).toMatch(/outline-brand-600[^]*Signing/);
    expect(render(steps)).not.toContain("outline-brand-600");
    expect(render(steps, "none")).not.toContain("decoration-brand-600");
  });

  it("draws a step with an href as a link, and others as plain text", () => {
    const html = render([
      { key: "x", label: "Award", state: "done", href: "/projects/a1?stage=award" },
      { key: "y", label: "Signing", state: "parked" },
    ]);
    expect(html).toMatch(/<a [^>]*href="\/projects\/a1\?stage=award"[^>]*>Award<\/a>/);
    expect(count(html, "<a ")).toBe(1);
  });

  it("draws a step with onSelect as a button, never a link, and leaves the others as plain text (ADR 0041: the public form goes back to a step already done)", () => {
    const html = render([
      { key: "x", label: "Company Information", state: "done", onSelect: () => undefined },
      { key: "y", label: "Compliance Documents", state: "current" },
      { key: "z", label: "Work Codes", state: "waiting" },
    ]);
    expect(html).toMatch(/<button type="button"[^>]*>Company Information<\/button>/);
    expect(count(html, "<button")).toBe(1);
    expect(html).not.toContain("<a ");
  });
});
