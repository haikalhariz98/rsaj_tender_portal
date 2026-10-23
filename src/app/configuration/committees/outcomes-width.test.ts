import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ActionsCol } from "@/components/ui/table";

const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const widthOf = (props: { icons?: number; labelled?: number }) => Number(/width:(\d+)px/.exec(renderToStaticMarkup(createElement(ActionsCol, props)))?.[1]);

describe("the Committees lists at 1440 and 1280", () => {
  it("the outcomes actions column holds an Edit icon beside a labelled Stop using button (it clipped at 1440)", () => {
    // 32px icon, a ~90px "Stop using" button, the gap between them and the cell padding.
    const widest = 32 + 90 + 4 + 40;
    const outcomes = page.slice(page.indexOf('<Th>Outcome</Th>') - 400, page.indexOf('<Th>Outcome</Th>'));
    const cols = /<ActionsCol icons=\{(\d)\} labelled=\{(\d)\} \/>/.exec(outcomes);
    expect(cols).not.toBeNull();
    expect(widthOf({ icons: Number(cols![1]), labelled: Number(cols![2]) })).toBeGreaterThanOrEqual(widest);
  });

  it("a name wraps rather than truncating, and the In use state is not in the actions cell", () => {
    expect(page).not.toContain("truncate");
    for (const block of page.split("<RowActions>").slice(1)) expect(block.split("</RowActions>")[0]).not.toContain("In use");
  });
});
