import { describe, expect, it } from "vitest";

import { inspectImage, inspectLogo, inspectSignInImage, signInImageFaultText, LOGO_MAX_BYTES, SIGN_IN_IMAGE_MAX_BYTES } from "./logo";
import { initialsLogo } from "./png";

const png = () => initialsLogo("AB", [67, 56, 202], 96);

describe("accepting a sign-in image by its bytes", () => {
  it("judges it as the logo is judged: by its bytes, a PNG, JPEG or WebP only", () => {
    expect(inspectSignInImage(png())).toMatchObject({ ok: true, mediaType: "image/png", width: 96, height: 96 });
    expect(inspectSignInImage(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toMatchObject({ ok: false, fault: "SVG" });
    expect(inspectSignInImage(new Uint8Array([1, 2, 3, 4]))).toMatchObject({ ok: false, fault: "UNSUPPORTED" });
    expect(inspectSignInImage(new Uint8Array(0))).toMatchObject({ ok: false, fault: "EMPTY" });
  });

  it("refuses a file over its own limit, in its own words", () => {
    const big = new Uint8Array(SIGN_IN_IMAGE_MAX_BYTES + 1);
    big.set(png());
    const r = inspectSignInImage(big);
    expect(r).toMatchObject({ ok: false, fault: "TOO_LARGE" });
    expect(signInImageFaultText("TOO_LARGE", big.length)).toBe(`The image is ${Math.ceil(big.length / 1024)} KB. The limit is ${SIGN_IN_IMAGE_MAX_BYTES / 1024} KB.`);
  });

  it("the limit is a parameter: the same bytes pass a larger one and fail a smaller one", () => {
    const bytes = png();
    expect(inspectImage(bytes, bytes.length)).toMatchObject({ ok: true });
    expect(inspectImage(bytes, bytes.length - 1)).toMatchObject({ ok: false, fault: "TOO_LARGE" });
  });

  it("is the logo's check with another limit, and keeps the logo's own message", () => {
    expect(inspectLogo(png())).toEqual(inspectImage(png(), LOGO_MAX_BYTES));
  });
});
