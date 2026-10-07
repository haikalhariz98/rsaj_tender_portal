/**
 * Accepting a logo.
 *
 * What the file is is decided by its own bytes, never by its name or the type the
 * browser declared. PNG, JPEG and WebP only. SVG is refused outright: it can carry
 * script, and there is no sanitiser here. A file that sniffs as one of the three but
 * whose header cannot be read is refused as unreadable.
 */
import { createHash } from "node:crypto";

import { LOGO_MAX_BYTES, SIGN_IN_IMAGE_MAX_BYTES } from "./logo-limits";

export { LOGO_MAX_BYTES, LOGO_SUGGESTED_HEIGHT, SIGN_IN_IMAGE_MAX_BYTES, SIGN_IN_IMAGE_SUGGESTED_WIDTH } from "./logo-limits";

export type LogoMediaType = "image/png" | "image/jpeg" | "image/webp";

export type LogoFault = "EMPTY" | "TOO_LARGE" | "SVG" | "UNSUPPORTED" | "UNREADABLE";

export type LogoCheck =
  | { ok: true; mediaType: LogoMediaType; width: number; height: number; sizeBytes: number; sha256: string }
  | { ok: false; fault: LogoFault; sizeBytes: number };

/// What the person is told. Never a code. `noun` is what the file is for ("logo", "image"), `maxBytes` the limit it was judged against.
export function imageFaultText(fault: LogoFault, sizeBytes: number, noun: string, maxBytes: number): string {
  switch (fault) {
    case "EMPTY":
      return "Choose an image file.";
    case "TOO_LARGE":
      return `The ${noun} is ${Math.ceil(sizeBytes / 1024)} KB. The limit is ${maxBytes / 1024} KB.`;
    case "SVG":
      return "Use a PNG, JPEG or WebP image. SVG is not accepted.";
    case "UNSUPPORTED":
      return "Use a PNG, JPEG or WebP image.";
    case "UNREADABLE":
      return "This file is not a readable image.";
  }
}

export const logoFaultText = (fault: LogoFault, sizeBytes: number) => imageFaultText(fault, sizeBytes, "logo", LOGO_MAX_BYTES);
export const signInImageFaultText = (fault: LogoFault, sizeBytes: number) => imageFaultText(fault, sizeBytes, "image", SIGN_IN_IMAGE_MAX_BYTES);

const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u32be = (b: Uint8Array, i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const u16le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u24le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);

type Size = { width: number; height: number } | null;

function pngSize(b: Uint8Array): Size {
  // Signature, then IHDR as the first chunk: length 13, "IHDR", width, height.
  if (b.length < 24 || u32be(b, 8) !== 13 || ascii(b, 12, 16) !== "IHDR") return null;
  return { width: u32be(b, 16), height: u32be(b, 20) };
}

function jpegSize(b: Uint8Array): Size {
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    // Markers with no length: standalone and restart markers.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      i += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null;
    const length = u16be(b, i + 2);
    if (length < 2) return null;
    // Start of frame, excluding DHT (c4), JPG (c8) and DAC (cc).
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      if (i + 9 > b.length) return null;
      return { height: u16be(b, i + 5), width: u16be(b, i + 7) };
    }
    i += 2 + length;
  }
  return null;
}

function webpSize(b: Uint8Array): Size {
  if (b.length < 30) return null;
  const kind = ascii(b, 12, 16);
  if (kind === "VP8X") return { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
  if (kind === "VP8 ") {
    // Frame tag (3 bytes), start code 9d 01 2a, then 14-bit width and height.
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
  }
  if (kind === "VP8L") {
    if (b[20] !== 0x2f) return null;
    const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] * 2 ** 24);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  return null;
}

/// The text near the start of a file, for spotting an SVG or other markup.
function looksLikeSvg(b: Uint8Array): boolean {
  const head = new TextDecoder("utf-8", { fatal: false }).decode(b.subarray(0, 2048)).replace(/^﻿/, "").trimStart().toLowerCase();
  return head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg")) || head.startsWith("<!doctype svg") || (head.startsWith("<") && head.includes("<svg"));
}

/// Check a file's bytes against a size limit, and say what it is. The logo and the sign-in image are judged the same way, by their own limits.
export function inspectImage(bytes: Uint8Array, maxBytes: number): LogoCheck {
  const sizeBytes = bytes.length;
  const refuse = (fault: LogoFault): LogoCheck => ({ ok: false, fault, sizeBytes });
  if (sizeBytes === 0) return refuse("EMPTY");
  if (sizeBytes > maxBytes) return refuse("TOO_LARGE");

  let mediaType: LogoMediaType | null = null;
  let size: Size = null;
  if (sizeBytes >= 8 && bytes[0] === 0x89 && ascii(bytes, 1, 4) === "PNG" && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    mediaType = "image/png";
    size = pngSize(bytes);
  } else if (sizeBytes >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    mediaType = "image/jpeg";
    size = jpegSize(bytes);
  } else if (sizeBytes >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") {
    mediaType = "image/webp";
    size = webpSize(bytes);
  }

  if (!mediaType) return refuse(looksLikeSvg(bytes) ? "SVG" : "UNSUPPORTED");
  if (!size || size.width < 1 || size.height < 1 || size.width > 16384 || size.height > 16384) return refuse("UNREADABLE");

  return { ok: true, mediaType, ...size, sizeBytes, sha256: createHash("sha256").update(bytes).digest("hex") };
}

/// Check a logo's bytes, and say what it is.
export const inspectLogo = (bytes: Uint8Array): LogoCheck => inspectImage(bytes, LOGO_MAX_BYTES);

/// Check a sign-in image's bytes, and say what it is.
export const inspectSignInImage = (bytes: Uint8Array): LogoCheck => inspectImage(bytes, SIGN_IN_IMAGE_MAX_BYTES);
