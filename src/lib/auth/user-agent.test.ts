import { describe, expect, it } from "vitest";

import { describeUserAgent } from "./user-agent";

describe("describeUserAgent", () => {
  it("names the browser and the system a person would recognise", () => {
    expect(describeUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")).toBe("Chrome on Windows");
    expect(describeUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0")).toBe("Edge on Windows");
    expect(describeUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15")).toBe("Safari on macOS");
    expect(describeUserAgent("Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0")).toBe("Firefox on Linux");
    expect(describeUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.0.0 Mobile/15E148 Safari/604.1")).toBe("Chrome on iOS");
    expect(describeUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/154.0.0.0 Safari/537.36")).toBe("Chrome on Windows");
    expect(describeUserAgent("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36")).toBe("Chrome on Android");
  });

  it("says so where it does not recognise the string, and never invents a browser", () => {
    expect(describeUserAgent("")).toBe("A device not recognised");
    expect(describeUserAgent("curl/8.4.0")).toBe("A device not recognised");
    expect(describeUserAgent("SomeTool (Windows NT 10.0)")).toBe("A browser on Windows");
  });
});
