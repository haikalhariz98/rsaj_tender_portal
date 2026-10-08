import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  brightestUnder,
  contrastRatio,
  GRAPHIC_CONTRAST_MIN,
  ICON_FILL_ALPHA,
  ICON_RING_ALPHA,
  iconGlyphContrast,
  iconRingContrast,
  rgbOfHex,
  shadeStyle,
  SHADE_FEATHER_PX,
  SHADE_FEATHER_SIDE_PX,
  TAGLINE_SHADE_ALPHA,
  TEXT_CONTRAST_MIN,
  TEXT_SHADE_ALPHA,
  whiteTextContrast,
} from "./sign-in-shading";

/// The shade is the design system's `ink`, read from the stylesheet so that a changed token is judged here too.
const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
const ink = rgbOfHex(/--color-ink:\s*(#[0-9a-fA-F]{6})/.exec(css)![1]);

describe("contrast arithmetic", () => {
  it("agrees with the published extremes", () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
    expect(contrastRatio([255, 255, 255], [255, 255, 255])).toBeCloseTo(1, 5);
    // #777777 on white is the classic 4.48:1.
    expect(contrastRatio([0x77, 0x77, 0x77], [255, 255, 255])).toBeCloseTo(4.48, 2);
  });
});

describe("the shading is enough by itself, for any photograph", () => {
  it("white text over the brightest possible pixel under the text block reaches 4.5:1", () => {
    expect(whiteTextContrast(ink, TEXT_SHADE_ALPHA)).toBeGreaterThanOrEqual(TEXT_CONTRAST_MIN);
  });

  it("so does the tagline, under its own shade", () => {
    expect(whiteTextContrast(ink, TAGLINE_SHADE_ALPHA)).toBeGreaterThanOrEqual(TEXT_CONTRAST_MIN);
  });

  it("and not by a hair: a shade that only just reached 4.5 would fail on a rounding", () => {
    expect(whiteTextContrast(ink, TEXT_SHADE_ALPHA)).toBeGreaterThanOrEqual(TEXT_CONTRAST_MIN + 0.3);
  });

  it("a weaker shade would not have been enough (the number is not slack)", () => {
    expect(whiteTextContrast(ink, 0.5)).toBeLessThan(TEXT_CONTRAST_MIN);
  });

  it("the brightest pixel under the shade is darker than white", () => {
    const [r, g, b] = brightestUnder(ink, TEXT_SHADE_ALPHA);
    expect(Math.max(r, g, b)).toBeLessThan(255);
  });
});

describe("the round highlight icons", () => {
  it("their ring reaches 3:1 against what is behind them, in the worst case", () => {
    expect(iconRingContrast(ink, TEXT_SHADE_ALPHA)).toBeGreaterThanOrEqual(GRAPHIC_CONTRAST_MIN);
  });

  it("their white drawing reaches 3:1 against the circle's own fill, in the worst case", () => {
    expect(iconGlyphContrast(ink, TEXT_SHADE_ALPHA)).toBeGreaterThanOrEqual(GRAPHIC_CONTRAST_MIN);
  });

  it("the old half-strength ring would not have", () => {
    expect(iconRingContrast(ink, TEXT_SHADE_ALPHA, 0.5)).toBeLessThan(GRAPHIC_CONTRAST_MIN);
  });

  it("the stated alphas are in range", () => {
    for (const a of [ICON_FILL_ALPHA, ICON_RING_ALPHA, TEXT_SHADE_ALPHA, TAGLINE_SHADE_ALPHA]) {
      expect(a).toBeGreaterThan(0);
      expect(a).toBeLessThan(1);
    }
  });
});

describe("the shading as drawn", () => {
  it("is the design system's ink, at the strength tested above", () => {
    expect(shadeStyle(TEXT_SHADE_ALPHA, { bottom: true }).backgroundColor).toBe(`color-mix(in srgb, var(--color-ink) ${Math.round(TEXT_SHADE_ALPHA * 100)}%, transparent)`);
  });

  it("holds its full strength to the edge of the block and fades only beyond it, on the edges that fade", () => {
    const s = shadeStyle(TEXT_SHADE_ALPHA, { bottom: true, right: true });
    expect(s.maskImage).toContain(`linear-gradient(to bottom, #000 calc(100% - ${SHADE_FEATHER_PX}px)`);
    expect(s.maskImage).toContain(`linear-gradient(to right, #000 calc(100% - ${SHADE_FEATHER_SIDE_PX}px)`);
    expect(s.maskImage).not.toContain("to top");
    expect(s.maskComposite).toBe("intersect");
  });

  it("a shade with no fading edge has no mask at all", () => {
    expect(shadeStyle(TEXT_SHADE_ALPHA, {}).maskImage).toBeUndefined();
  });
});
