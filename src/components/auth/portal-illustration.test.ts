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
    const rules = [...css.matchAll(/^\.(portal-art-[a-z-]+)\s*\{([^}]*)\}/gm)].map((m) => ({ name: m[1]!, body: m[2]! }));
    expect(rules.map((r) => r.name).sort()).toEqual([...classes].sort());
    // The fields and the password dots carry their own delay in the markup: the latest one starts the last fill.
    const inline = [...markup.matchAll(/animation-delay:\s*([\d.]+)s/g)].map((m) => Number(m[1]));
    expect(inline.length).toBeGreaterThan(0);
    let latest = 0;
    for (const r of rules) {
      const decl = /animation:\s*([^;]+);/.exec(r.body)?.[1];
      expect(decl, `${r.name} has an animation`).toBeTruthy();
      // Drop the timing function (cubic-bezier holds spaces), then read: duration, optional delay, optional iteration count.
      const tokens = decl!.replace(/cubic-bezier\([^)]*\)/g, "").trim().split(/\s+/);
      const times = tokens.filter((t) => /^[\d.]+s$/.test(t)).map((t) => parseFloat(t));
      const count = Number(tokens.find((t) => /^\d+$/.test(t)) ?? 1);
      const [duration = 0, delay = 0] = times;
      const extra = r.name === "portal-art-fill" ? Math.max(...inline) : 0;
      latest = Math.max(latest, delay + extra + duration * count);
    }
    expect(latest).toBeGreaterThan(0);
    expect(latest).toBeLessThan(5);
  });
});
