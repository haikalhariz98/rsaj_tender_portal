import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PortalIllustration } from "./portal-illustration";

const markup = renderToStaticMarkup(createElement(PortalIllustration));
const css = readFileSync("src/app/globals.css", "utf8");
const classes = [...new Set([...markup.matchAll(/portal-art-[a-z-]+/g)].map((m) => m[0]))];

describe("PortalIllustration", () => {
  it("is decorative and hidden from assistive technology", () => {
    expect(markup).toMatch(/^<svg[^>]*aria-hidden="true"/);
    expect(markup).toContain('focusable="false"');
    expect(markup).not.toContain("<title");
  });

  it("draws the finished picture, with nothing hidden in its own attributes", () => {
    expect(markup).not.toMatch(/opacity="0"/);
    expect(markup).not.toMatch(/scale\(0/);
    expect(markup).toContain(`stroke-dasharray="1"`);
  });

  it("loads nothing, runs no script and uses no literal colour", () => {
    expect(markup).not.toMatch(/https?:|<image|<script|<foreignObject|<text|href=|data:/i);
    expect(markup).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(markup).not.toMatch(/\bon[a-z]+=/i);
  });

  it("stays small", () => {
    expect(markup.length).toBeLessThan(25 * 1024);
  });

  it("has a rule in globals.css for every animation class, and each is switched off for reduced motion", () => {
    expect(classes.length).toBeGreaterThanOrEqual(6);
    const reduced = /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.portal-art-[^{]*\{\s*animation:\s*none;?\s*\}\s*\}/.exec(css)?.[0] ?? "";
    for (const c of classes) {
      expect(css, c).toContain(`.${c}`);
      expect(reduced, `${c} in the reduced-motion rule`).toContain(`.${c}`);
    }
  });

  it("plays once, in under five seconds", () => {
    expect(css).not.toMatch(/animation:[^;]*portal-art[^;]*infinite/);
    const float = /portal-art-float \{[^}]*animation: portal-art-float ([\d.]+)s [\w-]+ (\d+)/.exec(css);
    expect(Number(float?.[1]) * Number(float?.[2])).toBeLessThan(5);
    // The last one-shot ends with the tick: 3.1 s delay plus 0.5 s.
    expect(3.1 + 0.5).toBeLessThan(5);
  });
});
