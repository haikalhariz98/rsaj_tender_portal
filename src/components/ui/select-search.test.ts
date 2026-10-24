import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { SEARCH_THRESHOLD, filterOptions, wantsSearch } from "@/lib/ui/select-logic";

const read = (p: string) => readFileSync(p, "utf8");
const opts = (n: number) => Array.from({ length: n }, (_, i) => ({ value: `v${i}`, label: `Option ${i}` }));

describe("searchable select", () => {
  it("searches long lists on its own, and honours an explicit switch", () => {
    expect(SEARCH_THRESHOLD).toBeLessThanOrEqual(12);
    expect(wantsSearch(opts(13))).toBe(true);
    expect(wantsSearch(opts(3))).toBe(false);
    expect(wantsSearch(opts(3), true)).toBe(true);
    expect(wantsSearch(opts(30), false)).toBe(false);
  });

  it("filters by typed text", () => {
    expect(filterOptions(opts(13), "Option 12").map((o) => o.value)).toEqual(["v12"]);
  });

  it("the shared Select is a labelled combobox that posts a value, and RecordEditor passes `searchable` to it", () => {
    const select = read("src/components/ui/select.tsx");
    expect(select).toContain('role="combobox"');
    expect(select).toContain('role="listbox"');
    expect(select).toContain("aria-activedescendant");
    expect(select).toContain("name={name}");
    const editor = read("src/components/record-editor.tsx");
    expect(editor).toContain("searchable={field.searchable}");
  });
});
