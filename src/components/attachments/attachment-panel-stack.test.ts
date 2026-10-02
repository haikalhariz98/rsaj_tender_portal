import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DataList, type Column } from "@/components/data-list";

/**
 * Phase 1 carry D5: the attachment table (document, classification, version and scan, received on,
 * actions) scrolled inside its card at 1024, where a record's content column is 688px beside the
 * sidebar and the table needs about 752px. Like the other wide lists (7534900), it stacks below xl
 * and is a table from xl, so it never scrolls sideways at 1024 or 390.
 */

describe("the attachment lists stack below xl (D5)", () => {
  it("both of the panel's lists, the attached and the taken off, ask for it (source scan)", () => {
    const src = readFileSync(join(process.cwd(), "src/components/attachments/attachment-panel.tsx"), "utf8");
    const lists = src.match(/<DataList\b[\s\S]*?(\/>|>)/g) ?? [];
    expect(lists.length).toBe(2);
    for (const l of lists) expect(l).toMatch(/stackBelow="xl"/);
  });

  it("stackBelow xl renders the stacked list hidden from xl and the table shown from xl", () => {
    const columns: Column[] = [{ key: "doc", label: "Document", mobile: "primary" }];
    const html = renderToStaticMarkup(createElement(DataList, { columns, rows: [{ id: "a", search: "Signed minutes", cells: { doc: { kind: "text", text: "Signed minutes" } } }], selectable: false, stackBelow: "xl" }));
    expect(html).toContain("xl:hidden");
    expect(html).toContain("hidden xl:block");
  });
});
