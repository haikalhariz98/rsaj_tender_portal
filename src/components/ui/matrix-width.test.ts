import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { COLUMN_MIN, HEAD_WIDTH, matrixMinWidth } from "./matrix";

// The 1440 content box, from named numbers. Each is tied to the class that makes it, asserted below, so a change to the shell or the card fails here and not on a screen.
const VIEWPORT = 1440;
const SCROLLBAR = 17; // a classic Windows scrollbar
const SIDEBAR = 272; // lg:pl-68 (68 * 4)
const MAIN_PADDING = 64; // lg:px-8 on each side (32 * 2)
const CARD_BORDER = 2;
const CARD_BODY_PADDING = 48; // sm:px-6 on each side (24 * 2)
const CONTENT_BOX = VIEWPORT - SCROLLBAR - SIDEBAR - MAIN_PADDING - CARD_BORDER - CARD_BODY_PADDING;

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

describe("the shared Matrix width at 1440", () => {
  it("the shell and card classes behind the arithmetic are still there", () => {
    const shell = read("../shell/app-shell.tsx");
    expect(shell).toContain("lg:pl-68");
    expect(shell).toContain("lg:px-8");
    expect(read("./card.tsx")).toContain("sm:px-6");
    expect(CONTENT_BOX).toBe(1037);
  });

  it("four subject columns fit the content box without a sideways scroll", () => {
    expect(matrixMinWidth(4)).toBe(HEAD_WIDTH + 4 * COLUMN_MIN);
    expect(matrixMinWidth(4)).toBeLessThanOrEqual(CONTENT_BOX);
  });

  it("no columns is the width of one", () => {
    expect(matrixMinWidth(0)).toBe(matrixMinWidth(1));
  });
});
