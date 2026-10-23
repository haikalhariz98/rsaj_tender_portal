import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/requisitions", useRouter: () => ({ push: () => undefined }) }));

import { Sidebar } from "./sidebar";

const org = { name: "RSAJ Procurement Department", logo: null } as never;
const render = (props: Record<string, unknown> = {}) => renderToStaticMarkup(createElement(Sidebar, { organisation: org, counts: {}, ...props }));

describe("the sidebar (plan 6.1)", () => {
  it("draws the four groups, headings only for groups of more than one, and the organisation's name not at all", () => {
    const out = render();
    for (const h of ["Work", "Buying", "Records"]) expect(out).toContain(`>${h}</div>`);
    expect(out).not.toContain(">Settings</div>");
    expect(out).toContain("Tenders &amp; quotations");
    expect(out).toContain('aria-current="page"');
    expect(out).not.toContain("RSAJ Procurement");
  });
  it("leaves Settings out for someone who may not open it (SP-21)", () => {
    expect(render({ showSettings: false })).not.toContain('href="/configuration"');
    expect(render()).toContain('href="/configuration"');
  });
});
