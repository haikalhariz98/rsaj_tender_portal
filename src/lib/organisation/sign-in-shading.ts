/**
 * The shading behind the words on the sign-in page's picture, and the arithmetic that says it is enough.
 *
 * The picture is any photograph an organisation uploads, so it can be anything up to pure white behind a word. The shading therefore does the whole
 * job by itself: white text over the brightest possible pixel, once shaded, must still reach 4.5:1 (WCAG AA, for all text including the large headline),
 * and the round highlight icons must reach 3:1 (WCAG 1.4.11). Nothing here looks at the photograph, and nothing needs to.
 *
 * Pure. The screen builds its backgrounds from these numbers, and the test holds the numbers to the contrast, reading the shade's colour from the design
 * system's own token.
 */

export type Rgb = readonly [number, number, number];

/// What white text must reach against the brightest pixel under it, once shaded (WCAG AA for text, large or small).
export const TEXT_CONTRAST_MIN = 4.5;
/// What the round icons must reach against what is behind them (WCAG 1.4.11, non-text contrast).
export const GRAPHIC_CONTRAST_MIN = 3;

/// The shade is the design system's `ink` token. How opaque it is behind the text block and behind the tagline: enough for 4.5:1 over pure white, with room to spare.
export const TEXT_SHADE_ALPHA = 0.64;
export const TAGLINE_SHADE_ALPHA = 0.64;
/// The round icons: a faint white fill with a white ring, both over the shade. The ring is what the 3:1 is measured on; the drawing in white is measured against the fill.
export const ICON_FILL_ALPHA = 0.1;
export const ICON_RING_ALPHA = 0.9;
/// How far the shade runs on past the text block it belongs to before it is gone, in pixels. Text never sits in the fade: the fade is outside its box.
export const SHADE_FEATHER_PX = 112;
/// The same, sideways: longer, so the shade melts into the picture rather than ending in a line down it.
export const SHADE_FEATHER_SIDE_PX = 220;

const WHITE: Rgb = [255, 255, 255];

/// `#rrggbb` as numbers. Throws on anything else, so a token that changes shape fails loudly in the test.
export function rgbOfHex(hex: string): Rgb {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) throw new Error(`Not a six-digit hex colour: ${hex}`);
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

/// WCAG relative luminance.
export function luminance([r, g, b]: Rgb): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/// WCAG contrast ratio, 1 to 21.
export function contrastRatio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/// `top` laid over `under` at `alpha`, as a browser blends in sRGB.
export function over(top: Rgb, alpha: number, under: Rgb): Rgb {
  return [under[0] * (1 - alpha) + top[0] * alpha, under[1] * (1 - alpha) + top[1] * alpha, under[2] * (1 - alpha) + top[2] * alpha];
}

/// The brightest pixel there can be under a shaded text block, once shaded: pure white under the shade.
export const brightestUnder = (shade: Rgb, alpha: number): Rgb => over(shade, alpha, WHITE);

/// White text against the brightest possible pixel under its shade.
export const whiteTextContrast = (shade: Rgb, alpha: number): number => contrastRatio(WHITE, brightestUnder(shade, alpha));

/// The icon's ring against what is behind it (worst case: the brightest shaded pixel).
export function iconRingContrast(shade: Rgb, shadeAlpha: number, ringAlpha = ICON_RING_ALPHA): number {
  const behind = brightestUnder(shade, shadeAlpha);
  return contrastRatio(over(WHITE, ringAlpha, behind), behind);
}

/// The icon's white drawing against its own fill (worst case as above).
export function iconGlyphContrast(shade: Rgb, shadeAlpha: number, fillAlpha = ICON_FILL_ALPHA): number {
  const behind = brightestUnder(shade, shadeAlpha);
  return contrastRatio(WHITE, over(WHITE, fillAlpha, behind));
}

/// The shade as CSS: the `ink` token at `alpha`.
export const shadeColour = (alpha: number): string => `color-mix(in srgb, var(--color-ink) ${Math.round(alpha * 100)}%, transparent)`;

/// Which edges of a shade fade out. A shade is drawn as large as the block of words it belongs to plus `SHADE_FEATHER_PX` past every edge that fades, so the
/// words always sit inside the full-strength part and the fade is only ever outside their box.
export interface ShadeFades {
  top?: boolean;
  bottom?: boolean;
  right?: boolean;
}

/// The shade as inline style: the `ink` token at `alpha`, with the faded edges cut by a mask. Keys are CSS properties in the camelCase React takes.
export function shadeStyle(alpha: number, fades: ShadeFades): Record<string, string> {
  const edge = (to: string, px: number) => `linear-gradient(to ${to}, #000 calc(100% - ${px}px), transparent 100%)`;
  const layers = [fades.bottom && edge("bottom", SHADE_FEATHER_PX), fades.top && edge("top", SHADE_FEATHER_PX), fades.right && edge("right", SHADE_FEATHER_SIDE_PX)].filter((l): l is string => !!l);
  const style: Record<string, string> = { backgroundColor: shadeColour(alpha) };
  if (layers.length > 0) {
    const mask = layers.join(", ");
    style.maskImage = mask;
    style.WebkitMaskImage = mask;
    // Every layer must be present for a pixel to show: that is what lets one edge fade without the others caring.
    style.maskComposite = "intersect";
    style.WebkitMaskComposite = "source-in";
  }
  return style;
}

/// The icon circle's own backgrounds, as CSS.
export const ICON_CIRCLE_STYLE = {
  background: `rgb(255 255 255 / ${ICON_FILL_ALPHA})`,
  boxShadow: `0 0 0 1.5px rgb(255 255 255 / ${ICON_RING_ALPHA})`,
} as const;
