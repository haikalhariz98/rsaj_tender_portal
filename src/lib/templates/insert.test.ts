import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { insertSnippet } from "./insert";

describe("inserting a merge field at the cursor", () => {
  it("puts a field inline at the cursor and leaves the cursor after it", () => {
    expect(insertSnippet("Obtain the  before work.", 11, 11, "{{permit.type}}", false)).toEqual({ text: "Obtain the {{permit.type}} before work.", cursor: 26 });
  });
  it("replaces a selection", () => {
    expect(insertSnippet("A [x] B", 2, 5, "{{a.b}}", false).text).toBe("A {{a.b}} B");
  });
  it("puts a clause on a paragraph of its own: a blank line before and after", () => {
    expect(insertSnippet("First paragraph.\n\nLast.", 18, 18, "{{clause:c}}", true).text).toBe("First paragraph.\n\n{{clause:c}}\n\nLast.");
    expect(insertSnippet("First paragraph.\n\nLast.", 16, 16, "{{clause:c}}", true).text).toBe("First paragraph.\n\n{{clause:c}}\n\nLast.");
    expect(insertSnippet("Words", 5, 5, "{{clause:c}}", true).text).toBe("Words\n\n{{clause:c}}");
    expect(insertSnippet("Words\n", 6, 6, "{{clause:c}}", true).text).toBe("Words\n\n{{clause:c}}");
  });
  it("adds no padding in an empty text or between paragraphs already apart", () => {
    expect(insertSnippet("", 0, 0, "{{clause:c}}", true)).toEqual({ text: "{{clause:c}}", cursor: 12 });
    expect(insertSnippet("One.\n\nTwo.", 6, 6, "{{clause:c}}", true).text).toBe("One.\n\n{{clause:c}}\n\nTwo.");
  });
  it("clamps a cursor outside the text", () => {
    expect(insertSnippet("ab", 9, 12, "{{x}}", false).text).toBe("ab{{x}}");
    expect(insertSnippet("ab", -3, 1, "{{x}}", false).text).toBe("{{x}}b");
  });
});

describe("the template editor offers the pack's fields and a clause picker (source scan, U1)", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
  const editors = read("src/app/configuration/templates/editors.tsx");
  const tools = read("src/app/configuration/templates/insert-tools.tsx");
  it("lists the pack's merge fields in a group of their own, apart from the award's", () => {
    expect(editors).toContain("PACK_MERGE_FIELDS");
    expect(editors).toMatch(/group\("Tender documents"[^\n]*PACK_MERGE_FIELDS\)/);
    expect(editors).toMatch(/group\("Awards and agreements", null, MERGE_FIELDS\)/);
  });
  it("writes the clause's citation into the text and shows its title, never its code", () => {
    expect(tools).toMatch(/`\{\{clause:\$\{clause\.code\}\}\}`/);
    expect(tools).toMatch(/<Option key=\{c\.code\} value=\{c\.code\}>\s*\{c\.title\}\s*<\/Option>/);
    expect(tools).not.toMatch(/\{c\.code\}\s*<\/Option>/);
  });
  it("is given the live clauses by the page, in both the add and the edit drawer", () => {
    const page = read("src/app/configuration/templates/page.tsx");
    expect(page).toMatch(/<AddTemplate classes=\{classes\} clauses=\{clauses\}/);
    expect(page).toMatch(/<EditTemplate row=\{t\} classes=\{classes\} clauses=\{clauses\}/);
    expect(page).toMatch(/liveClauses\(/);
  });
});
