import { describe, expect, it } from "vitest";

import { showsNameBesideLogo } from "./details";
import { inspectLogo, logoFaultText, LOGO_MAX_BYTES } from "./logo";
import { initialsLogo } from "./png";

const bytes = (...n: number[]) => Uint8Array.from(n);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];

const png = () => initialsLogo("AB", [67, 56, 202], 96);

/// A minimal JPEG: SOI, one APP0, a frame header for 40 wide by 30 high.
const jpeg = () => bytes(0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, 0, 30, 0, 40, 1, 1, 0x11, 0);

/// RIFF/WEBP with a VP8X chunk for 200 x 100 (stored minus one, 24 bits each).
const webp = () => bytes(...ascii("RIFF"), 22, 0, 0, 0, ...ascii("WEBP"), ...ascii("VP8X"), 10, 0, 0, 0, 0, 0, 0, 0, 199, 0, 0, 99, 0, 0);

describe("accepting a logo by its bytes", () => {
  it("accepts a PNG and reads its size and fingerprint", () => {
    const r = inspectLogo(png());
    expect(r).toMatchObject({ ok: true, mediaType: "image/png", width: 96, height: 96 });
    expect(r.ok && r.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("accepts a JPEG and a WebP", () => {
    expect(inspectLogo(jpeg())).toMatchObject({ ok: true, mediaType: "image/jpeg", width: 40, height: 30 });
    expect(inspectLogo(webp())).toMatchObject({ ok: true, mediaType: "image/webp", width: 200, height: 100 });
  });

  it("gives the same fingerprint for the same bytes and another for other bytes", () => {
    const a = inspectLogo(png());
    const b = inspectLogo(png());
    const c = inspectLogo(initialsLogo("CD", [67, 56, 202], 96));
    expect(a.ok && b.ok && c.ok && a.sha256 === b.sha256 && a.sha256 !== c.sha256).toBe(true);
  });

  it("refuses SVG, however it is written, with its own message", () => {
    for (const svg of [
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"/>',
      '﻿  <SVG width="1"/>',
    ]) {
      const r = inspectLogo(new TextEncoder().encode(svg));
      expect(r).toMatchObject({ ok: false, fault: "SVG" });
    }
    expect(logoFaultText("SVG", 0)).toBe("Use a PNG, JPEG or WebP image. SVG is not accepted.");
  });

  it("judges by the bytes, not by what the file claims to be", () => {
    // Markup posing as a PNG is still markup.
    expect(inspectLogo(new TextEncoder().encode("<svg/>"))).toMatchObject({ ok: false, fault: "SVG" });
    // A GIF is neither.
    expect(inspectLogo(bytes(...ascii("GIF89a"), 1, 0, 1, 0, 0, 0))).toMatchObject({ ok: false, fault: "UNSUPPORTED" });
    // HTML is not an image.
    expect(inspectLogo(new TextEncoder().encode("<html><body>hi</body></html>"))).toMatchObject({ ok: false, fault: "UNSUPPORTED" });
  });

  it("refuses a file that starts like an image but cannot be read", () => {
    expect(inspectLogo(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3))).toMatchObject({ ok: false, fault: "UNREADABLE" });
    expect(inspectLogo(bytes(0xff, 0xd8, 0xff, 0xd9))).toMatchObject({ ok: false, fault: "UNREADABLE" });
    // A zero-sized PNG header.
    const zero = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...be32(13), ...ascii("IHDR"), ...be32(0), ...be32(0), 8, 2, 0, 0, 0]);
    expect(inspectLogo(zero)).toMatchObject({ ok: false, fault: "UNREADABLE" });
  });

  it("refuses an empty file and one over 512 KB, saying how big it was", () => {
    expect(inspectLogo(new Uint8Array(0))).toMatchObject({ ok: false, fault: "EMPTY" });
    const big = new Uint8Array(LOGO_MAX_BYTES + 1);
    big.set(png().subarray(0, 8));
    const r = inspectLogo(big);
    expect(r).toMatchObject({ ok: false, fault: "TOO_LARGE" });
    expect(logoFaultText("TOO_LARGE", LOGO_MAX_BYTES + 1)).toBe("The logo is 513 KB. The limit is 512 KB.");
    // Exactly at the limit is accepted on size.
    const at = new Uint8Array(LOGO_MAX_BYTES);
    expect(inspectLogo(at)).toMatchObject({ ok: false, fault: "UNSUPPORTED" });
  });

  it("puts the short name beside a logo narrower than 2 to 1", () => {
    expect(showsNameBesideLogo(100, 100)).toBe(true);
    expect(showsNameBesideLogo(199, 100)).toBe(true);
    expect(showsNameBesideLogo(200, 100)).toBe(false);
    expect(showsNameBesideLogo(300, 100)).toBe(false);
  });
});
