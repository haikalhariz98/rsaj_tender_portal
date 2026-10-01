import { describe, expect, it } from "vitest";

import {
  CLEAR_LABEL,
  SEARCH_THRESHOLD,
  emptyOptionRole,
  isPromptLabel,
  planChoices,
  filterOptions,
  joinValues,
  moveActive,
  resultsAnnouncement,
  splitValues,
  toggleValue,
  typeahead,
  wantsSearch,
  type Opt,
} from "./select-logic";

const opts = (...labels: string[]): Opt[] => labels.map((l) => ({ value: l.toLowerCase(), label: l }));

describe("wantsSearch", () => {
  it("shows search only above the threshold, not counting the empty option", () => {
    const seven = opts(...Array.from({ length: SEARCH_THRESHOLD }, (_, i) => `Option ${i}`));
    expect(wantsSearch(seven)).toBe(false);
    expect(wantsSearch([{ value: "", label: "Not set" }, ...seven])).toBe(false);
    expect(wantsSearch([...seven, { value: "x", label: "One more" }])).toBe(true);
  });
  it("lets the caller decide", () => {
    expect(wantsSearch(opts("A"), true)).toBe(true);
    expect(wantsSearch(opts(...Array.from({ length: 20 }, (_, i) => `O${i}`)), false)).toBe(false);
  });
});

describe("filterOptions", () => {
  const list: Opt[] = [
    { value: "a", label: "Tender Board", sub: "Above RM 5 million" },
    { value: "b", label: "Quotation Committee" },
    { value: "c", label: "Évaluation panel" },
  ];
  it("keeps everything for an empty query", () => {
    expect(filterOptions(list, "  ")).toHaveLength(3);
  });
  it("matches case-insensitively, by any word order, in label or second line", () => {
    expect(filterOptions(list, "board tender").map((o) => o.value)).toEqual(["a"]);
    expect(filterOptions(list, "MILLION").map((o) => o.value)).toEqual(["a"]);
  });
  it("ignores accents", () => {
    expect(filterOptions(list, "evaluation").map((o) => o.value)).toEqual(["c"]);
  });
  it("returns nothing when no option matches", () => {
    expect(filterOptions(list, "zzz")).toEqual([]);
  });
});

describe("moveActive", () => {
  const list: Opt[] = [
    { value: "a", label: "A" },
    { value: "b", label: "B", disabled: true },
    { value: "c", label: "C" },
    { value: "d", label: "D" },
  ];
  it("skips disabled options", () => {
    expect(moveActive(list, 0, "ArrowDown")).toBe(2);
    expect(moveActive(list, 2, "ArrowUp")).toBe(0);
  });
  it("starts from the top going down and the bottom going up", () => {
    expect(moveActive(list, -1, "ArrowDown")).toBe(0);
    expect(moveActive(list, -1, "ArrowUp")).toBe(3);
  });
  it("stays at either end", () => {
    expect(moveActive(list, 3, "ArrowDown")).toBe(3);
    expect(moveActive(list, 0, "ArrowUp")).toBe(0);
  });
  it("jumps with Home and End to choosable options", () => {
    const edge: Opt[] = [{ value: "x", label: "X", disabled: true }, ...list];
    expect(moveActive(edge, 2, "Home")).toBe(1);
    expect(moveActive(edge, 1, "End")).toBe(4);
  });
  it("answers -1 when nothing is choosable", () => {
    expect(moveActive([{ value: "x", label: "X", disabled: true }], -1, "ArrowDown")).toBe(-1);
    expect(moveActive([], -1, "End")).toBe(-1);
  });
  it("pages through a long list", () => {
    const long = opts(...Array.from({ length: 30 }, (_, i) => `Item ${i}`));
    expect(moveActive(long, 0, "PageDown")).toBe(8);
    expect(moveActive(long, 29, "PageDown")).toBe(29);
    expect(moveActive(long, 20, "PageUp")).toBe(12);
    expect(moveActive(long, 3, "PageUp")).toBe(0);
  });
});

describe("typeahead", () => {
  const list = opts("Apple", "Avocado", "Banana", "Blueberry");
  it("finds the next option starting with the letter, wrapping", () => {
    expect(typeahead(list, "b", -1)).toBe(2);
    expect(typeahead(list, "b", 2)).toBe(3);
    expect(typeahead(list, "b", 3)).toBe(2);
  });
  it("matches a longer prefix from the current option", () => {
    expect(typeahead(list, "bl", 2)).toBe(3);
    expect(typeahead(list, "av", 0)).toBe(1);
  });
  it("cycles on a repeated letter", () => {
    expect(typeahead(list, "aa", 0)).toBe(1);
  });
  it("skips disabled options and reports no match", () => {
    expect(typeahead([{ value: "a", label: "Apple", disabled: true }], "a", -1)).toBe(-1);
    expect(typeahead(list, "z", -1)).toBe(-1);
    expect(typeahead(list, "", 0)).toBe(-1);
  });
});

describe("multi values", () => {
  it("toggles in order chosen", () => {
    expect(toggleValue(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleValue(["a", "b"], "a")).toEqual(["b"]);
  });
  it("joins into ONE newline-separated field and splits back", () => {
    const values = ["TENDER_BOARD", "QUOTE, CTTE", "x"];
    expect(joinValues(values)).toBe("TENDER_BOARD\nQUOTE, CTTE\nx");
    expect(splitValues(joinValues(values))).toEqual(values);
  });
  it("keeps 'nothing chosen' distinct from absent only by being empty", () => {
    expect(joinValues([])).toBe("");
    expect(splitValues("")).toEqual([]);
    expect(splitValues(null)).toEqual([]);
    expect(splitValues(undefined)).toEqual([]);
  });
  it("tolerates CRLF, padding and blank lines, and ignores files", () => {
    expect(splitValues(" a \r\n\r\n b\n")).toEqual(["a", "b"]);
    expect(splitValues(new File([], "x") as unknown as FormDataEntryValue)).toEqual([]);
  });
  it("reads what a form posts", () => {
    const form = new FormData();
    form.set("roles", joinValues(["one", "two"]));
    expect(splitValues(form.get("roles"))).toEqual(["one", "two"]);
  });
});

describe("resultsAnnouncement", () => {
  it("reads counts for a live region", () => {
    expect(resultsAnnouncement(0)).toBe("No matches");
    expect(resultsAnnouncement(1)).toBe("1 option");
    expect(resultsAnnouncement(12)).toBe("12 options");
  });
});

describe("the empty option: placeholder or choice", () => {
  const withEmpty = (label: string): Opt[] => [{ value: "", label }, ...opts("Alpha", "Beta")];

  it("knows a generic prompt from a named state", () => {
    for (const l of ["Choose", "choose", "Select…", "Select...", "Select an option", "Choose one", " Pick one "]) {
      expect(isPromptLabel(l), l).toBe(true);
    }
    for (const l of ["None", "Not set", "Nobody", "Any", "Not on file", "—", "No section in this department", "Not decided", "Choose wisely or not"]) {
      expect(isPromptLabel(l), l).toBe(false);
    }
  });

  it("is a placeholder when the field is required, whatever it says", () => {
    expect(emptyOptionRole(withEmpty("Not set"), { required: true })).toBe("placeholder");
    expect(emptyOptionRole(withEmpty("None"), { required: true })).toBe("placeholder");
  });

  it("is a placeholder when optional but worded as a prompt", () => {
    expect(emptyOptionRole(withEmpty("Choose"))).toBe("placeholder");
    expect(emptyOptionRole(withEmpty("Select an option"))).toBe("placeholder");
  });

  it("stays a choice when optional and it names a state", () => {
    for (const l of ["None", "Not set", "Nobody", "No section in this department", "Not on file", "All records"]) {
      expect(emptyOptionRole(withEmpty(l)), l).toBe("choice");
    }
  });

  it("has no role without an empty option, or in a multiple select", () => {
    expect(emptyOptionRole(opts("A"), { required: true })).toBe("none");
    expect(emptyOptionRole(withEmpty("Choose"), { multiple: true })).toBe("none");
  });

  it("takes a placeholder out of the rows and keeps a choice in", () => {
    const p = planChoices(withEmpty("Choose"), { required: true, hasValue: false });
    expect(p.rows.map((o) => o.label)).toEqual(["Alpha", "Beta"]);
    expect(p.placeholder).toBe("Choose");
    const c = planChoices(withEmpty("None"), { hasValue: true });
    expect(c.rows.map((o) => o.label)).toEqual(["None", "Alpha", "Beta"]);
    expect(c.clear).toBe(false);
  });

  it("offers Clear selection only when optional, a placeholder, and a value is chosen", () => {
    expect(CLEAR_LABEL).toBe("Clear selection");
    expect(planChoices(withEmpty("Choose"), { hasValue: true }).clear).toBe(true);
    expect(planChoices(withEmpty("Choose"), { hasValue: false }).clear).toBe(false);
    expect(planChoices(withEmpty("Choose"), { required: true, hasValue: true }).clear).toBe(false);
  });
});
