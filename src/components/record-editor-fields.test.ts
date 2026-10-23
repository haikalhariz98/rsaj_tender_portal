import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RecordEditor, type Field } from "./record-editor";

const render = (fields: Field[]) =>
  renderToStaticMarkup(h(RecordEditor, { title: "A form", fields, action: async () => ({ ok: true }), trigger: { label: "Open" }, defaultOpen: true }));

describe("the time field", () => {
  it("is the native time input, bound to its label, posting HH:MM", () => {
    const html = render([{ kind: "time", name: "meetsTime", label: "Time", required: true }]);
    expect(html).toMatch(/<input[^>]*type="time"[^>]*name="meetsTime"|<input[^>]*name="meetsTime"[^>]*type="time"/);
    expect(html).toContain('for="field-meetsTime"');
  });
});

describe("a checks field with information behind it", () => {
  const options = [{ value: "a1", label: "Portal account", description: "Active" }];
  it("puts the reason behind an information button, not in the form's prose", () => {
    const html = render([{ kind: "checks", name: "attendeeAccountId", label: "For the contractor", options, info: "You may not read contact names." }]);
    expect(html).toContain("About For the contractor");
    expect(html).toContain("You may not read contact names.");
  });

  it("has no button without it", () => {
    expect(render([{ kind: "checks", name: "x", label: "For the contractor", options }])).not.toContain("About For the contractor");
  });
});
