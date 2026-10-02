import { describe, expect, it } from "vitest";

import { EVALUATION_STAGE_DOMAIN, NEGOTIATION_DOMAIN } from "@/lib/evaluation/types";
import { matterLabel } from "@/lib/labels";

import { MATTER_KIND_LABEL, NEGOTIATION_NOT_TABLED_TEXT, recordTabledText, SITTING_TABLED_MATTER_KINDS, sittingTablesDomain, STAGE_ONE_TABLED_TEXT } from "./labels";

/**
 * 6.8 (flagged against accepted 6.10, new tests): a two-stage tender's first-stage matter names its
 * bidder by a typed key, so it is tabled only from the Evaluation tab; a negotiation is approved on its
 * own route, which takes no committee step, so no sitting decides it. Each is refused at the sitting
 * naming where it is decided, by the same check tableMatter already runs for the kinds and domains
 * tabled elsewhere (its source is scanned in labels.test.ts).
 */

describe("6.8: the first-stage matter and the negotiation at a sitting", () => {
  it("the first-stage kind and domain are tabled only from the Evaluation tab", () => {
    expect(MATTER_KIND_LABEL.EVALUATION_STAGE).toBe("Two-stage tender, first stage");
    expect(SITTING_TABLED_MATTER_KINDS).not.toContain("EVALUATION_STAGE");
    expect(sittingTablesDomain(EVALUATION_STAGE_DOMAIN)).toBe(false);
    expect(recordTabledText("EVALUATION_STAGE")).toBe(STAGE_ONE_TABLED_TEXT);
    expect(recordTabledText(EVALUATION_STAGE_DOMAIN)).toMatch(/Stages section of Evaluation/);
  });
  it("a negotiation is never tabled: its refusal names its route", () => {
    expect(sittingTablesDomain(NEGOTIATION_DOMAIN)).toBe(false);
    expect(recordTabledText(NEGOTIATION_DOMAIN)).toBe(NEGOTIATION_NOT_TABLED_TEXT);
    expect(NEGOTIATION_NOT_TABLED_TEXT).toMatch(/Meetings and letters/);
  });
  it("both domains have their words in English and Malay", () => {
    expect(matterLabel(EVALUATION_STAGE_DOMAIN)).toBe("Two-stage tender, first stage");
    expect(matterLabel(EVALUATION_STAGE_DOMAIN, "ms")).toBe("Tender dua peringkat, peringkat pertama");
    expect(matterLabel(NEGOTIATION_DOMAIN, "ms")).toBe("Rundingan");
  });
});
