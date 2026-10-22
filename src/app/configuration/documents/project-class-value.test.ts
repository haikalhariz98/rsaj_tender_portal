import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ProjectClassValue } from "./project-class-value";

const classes = [{ id: "c1", nameEn: "Project files class" }];
const render = (classId: string | null) => renderToStaticMarkup(h(ProjectClassValue, { classId, classes }));

describe("Configuration, Documents: the class for project files row", () => {
  it("reads Not set, and what that blocks, on a fresh organisation", () => {
    expect(render(null)).toContain("Not set, nothing can be added to a project&#x27;s documents");
  });
  it("names the class once set, never its id", () => {
    const html = render("c1");
    expect(html).toContain("Project files class");
    expect(html).not.toContain("c1");
  });
});
