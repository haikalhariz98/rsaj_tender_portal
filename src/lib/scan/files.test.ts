import path from "node:path";
import { describe, expect, it } from "vitest";
import { posixRelative, toPosix } from "./files";

describe("toPosix", () => {
  it("turns a Windows absolute path into a / path", () => {
    expect(toPosix("C:\\repo\\src\\lib\\a.ts", path.win32.sep)).toBe("C:/repo/src/lib/a.ts");
  });

  it("turns a recursive readdir entry into a / path", () => {
    expect(toPosix("a\\b.tsx", path.win32.sep)).toBe("a/b.tsx");
  });

  it("leaves an already-posix path unchanged under both separators", () => {
    expect(toPosix("src/lib/a.ts", path.posix.sep)).toBe("src/lib/a.ts");
    expect(toPosix("src/lib/a.ts", path.win32.sep)).toBe("src/lib/a.ts");
    expect(toPosix("/repo/src/a.ts", path.posix.sep)).toBe("/repo/src/a.ts");
  });

  it("defaults to the running platform's separator", () => {
    expect(toPosix(["a", "b", "c.ts"].join(path.sep))).toBe("a/b/c.ts");
  });
});

describe("posixRelative", () => {
  it("gives a / path under win32", () => {
    expect(posixRelative("C:\\repo", "C:\\repo\\src\\app\\page.tsx", path.win32)).toBe("src/app/page.tsx");
  });

  it("gives a / path under posix", () => {
    expect(posixRelative("/repo", "/repo/src/app/page.tsx", path.posix)).toBe("src/app/page.tsx");
  });

  it("keeps a parent step as ..", () => {
    expect(posixRelative("C:\\repo\\src", "C:\\repo\\docs\\a.md", path.win32)).toBe("../docs/a.md");
    expect(posixRelative("/repo/src", "/repo/docs/a.md", path.posix)).toBe("../docs/a.md");
  });

  it("matches the running platform by default", () => {
    const root = path.resolve("x");
    expect(posixRelative(root, path.join(root, "a", "b.ts"))).toBe("a/b.ts");
  });
});
