import { describe, expect, it } from "vitest";

import { certificateFaultWords } from "./fault-text";
import { formNeedFault, formNeeds, SET_AT_WORDS, templateNotSetWords, type FormNeed, type NeedsInput } from "./form-needs";
import { CERTIFICATE_KINDS } from "./types";

/**
 * 614b-C6 (BD-613-95): TEMPLATE_NOT_SET names the need and where its form is chosen, in English and Malay, in the screens'
 * own location words ("Configuration › Post-award controls" / "Konfigurasi › Kawalan selepas setuju terima"; "Configuration ›
 * Routing sheets" / "Konfigurasi › Helaian penghalaan"). It replaces "The module that raised it chooses the form".
 */

const none = { letter: null, notice: null };
const input: NeedsInput = { kinds: {}, delegation: { CONVENTIONAL: none, DESIGN_AND_BUILD: none }, sheets: [{ id: "s1", labelEn: "Interim sheet", labelMs: "Helaian interim", form: null }, { id: "s2", labelEn: "Delegation sheet", labelMs: null, form: null }] };
const needs: FormNeed[] = formNeeds(input);

describe("every need, refused for want of a form, reads its own need and where it is set (614b-C6)", () => {
  it("covers every kind (the delegation pair per variant) and every sheet", () => {
    expect(needs).toHaveLength(CERTIFICATE_KINDS.length - 2 + 4 + 2);
  });
  it.each(needs.map((n) => [n.key, n] as const))("%s", (_key, n) => {
    const f = formNeedFault(null, n.need, n.setAt)!;
    expect(f.code).toBe("TEMPLATE_NOT_SET");
    const words = certificateFaultWords(f);
    expect(words.en).toBe(`No form is chosen for “${n.need.en}”. Choose it under ${SET_AT_WORDS[n.setAt].en}.`);
    expect(words.ms).toBe(`Tiada borang dipilih bagi “${n.need.ms}”. Pilih di ${SET_AT_WORDS[n.setAt].ms}.`);
    expect(words.en).not.toMatch(/module that raised it/);
  });
  it("the screens' own location words, exactly", () => {
    expect(SET_AT_WORDS.POST_AWARD).toEqual({ en: "Configuration › Post-award controls", ms: "Konfigurasi › Kawalan selepas setuju terima" });
    expect(SET_AT_WORDS.ROUTING_SHEETS).toEqual({ en: "Configuration › Routing sheets", ms: "Konfigurasi › Helaian penghalaan" });
  });
  it("a sheet's need names its printed sheet in each language; one without a Malay label falls back to the English", () => {
    const s2 = needs.find((n) => n.key === "sheet:s2")!;
    expect(certificateFaultWords(formNeedFault(null, s2.need, s2.setAt)!).ms).toBe("Tiada borang dipilih bagi “Helaian bercetak Delegation sheet”. Pilih di Konfigurasi › Helaian penghalaan.");
  });
  it("a finding carrying no need (none is raised so) still says where, never a code", () => {
    // Faithful (BD-613-103 sent back, S-6, flagged 6.14): the quoted placeholder is gone; the quotes hold only a real label.
    expect(templateNotSetWords({}).en).toBe("No form is chosen. Choose it under Configuration › Post-award controls.");
    expect(templateNotSetWords({}).ms).toBe("Tiada borang dipilih. Pilih di Konfigurasi › Kawalan selepas setuju terima.");
    expect(templateNotSetWords({ need: "X" }).ms).toBe("Tiada borang dipilih bagi “X”. Pilih di Konfigurasi › Kawalan selepas setuju terima.");
  });
});
