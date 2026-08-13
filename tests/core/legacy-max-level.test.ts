import { describe, expect, it } from "vitest";

import { parseNoteOverrides, resolveNoteSettings } from "../../src/config/frontmatter";
import {
  DEFAULT_SETTINGS,
  probeMaxLevelRemoval,
  toNumberingOptions,
  type HeadingNumeralsSettings,
} from "../../src/config/settings";
import { parseAtxHeadings } from "../../src/core/heading-parser";
import { numberHeadings } from "../../src/core/numbering-engine";

function labels(source: string, settings: HeadingNumeralsSettings, schemeId?: string): Array<string | null> {
  return numberHeadings(
    parseAtxHeadings(source),
    toNumberingOptions(settings, schemeId == null ? {} : { schemeId }),
  ).map((item) => item.label);
}

describe("legacy maximum heading level", () => {
  it("caps an H1-rooted built-in scheme without stopping deeper counters", () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      selectedSchemeId: "hierarchical",
      maxLevel: 2,
    };

    const numbered = numberHeadings(
      parseAtxHeadings("# A\n## B\n### C\n#### D"),
      toNumberingOptions(settings),
    );

    expect(numbered.map((item) => item.label)).toEqual(["1", "1.1", null, null]);
    expect(numbered[2]?.counters).toEqual([1, 1, 1, 0, 0, 0]);
    expect(numbered[3]?.counters).toEqual([1, 1, 1, 1, 0, 0]);
  });

  it("raises a legacy cap below an H2-rooted built-in scheme to its base level", () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      selectedSchemeId: "hierarchical-h2",
      maxLevel: 1,
    };

    expect(labels("# Document\n## Part\n### Detail", settings)).toEqual([null, "1", null]);
  });

  it("does not introduce skipped-level warnings above the legacy cap", () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      selectedSchemeId: "hierarchical",
      maxLevel: 2,
      missingLevelStrategy: "skip" as const,
    };

    expect(numberHeadings(
      parseAtxHeadings("# A\n### Deep"),
      toNumberingOptions(settings),
    )[1]).toMatchObject({ label: null, warning: null });
  });

  it("caps a custom scheme selected by a per-note override", () => {
    const settings: HeadingNumeralsSettings = {
      ...DEFAULT_SETTINGS,
      selectedSchemeId: "hierarchical",
      maxLevel: 2,
      customSchemes: [{
        id: "custom-note",
        name: "Note scheme",
        revision: 1,
        baseLevel: 1,
        templates: [
          "Article {1.arabic}",
          "Section {1.arabic}.{2.arabic}",
          "Clause {1.arabic}.{2.arabic}.{3.arabic}",
          "",
          "",
          "",
        ],
        exclusions: [],
      }],
    };
    const effective = resolveNoteSettings(settings, parseNoteOverrides({
      "heading-numerals-scheme": "custom-note",
    }));

    expect(effective.schemeId).toBe("custom-note");
    expect(labels("# A\n## B\n### C", settings, effective.schemeId)).toEqual([
      "Article 1",
      "Section 1.1",
      null,
    ]);
  });

  it("retains original templates for exclusion matching above the legacy cap", () => {
    const settings: HeadingNumeralsSettings = {
      ...DEFAULT_SETTINGS,
      selectedSchemeId: "custom-exclusion-compatibility",
      maxLevel: 2,
      customSchemes: [{
        id: "custom-exclusion-compatibility",
        name: "Exclusion compatibility",
        revision: 1,
        baseLevel: 1,
        templates: [
          "Part {1.arabic}",
          "Section {1.arabic}.{2.arabic}",
          "Clause {1.arabic}.{2.arabic}.{3.arabic}",
          "",
          "",
          "",
        ],
        exclusions: [{ title: "References", scope: "heading" }],
      }],
    };

    const numbered = numberHeadings(
      parseAtxHeadings("# A\n## B\n### Clause 1.1.1 References"),
      toNumberingOptions(settings),
    );
    expect(numbered[2]).toMatchObject({
      label: null,
      exclusion: "heading",
      counters: [1, 1, 0, 0, 0, 0],
    });
  });

  it("reports every selectable scheme whose output still depends on the legacy cap", () => {
    const settings: HeadingNumeralsSettings = {
      ...DEFAULT_SETTINGS,
      maxLevel: 2,
      customSchemes: [{
        id: "custom-probe",
        name: "Probe",
        revision: 1,
        baseLevel: 1,
        templates: ["{1.arabic}", "{2.arabic}", "{3.arabic}", "", "", ""],
        exclusions: [],
      }],
    };

    expect(probeMaxLevelRemoval(settings)).toEqual({
      legacyMaxLevel: 2,
      affectedSchemeIds: [
        "hierarchical",
        "hierarchical-h2",
        "chinese-official",
        "legal",
        "custom-probe",
      ],
      semanticallyInvalidCustomSchemeIds: [],
      safeToRemove: false,
    });
  });

  it("allows removal only when neither output nor legacy custom semantics need compatibility", () => {
    expect(probeMaxLevelRemoval({ ...DEFAULT_SETTINGS, maxLevel: 6 })).toEqual({
      legacyMaxLevel: 6,
      affectedSchemeIds: [],
      semanticallyInvalidCustomSchemeIds: [],
      safeToRemove: true,
    });

    const legacyCustom: HeadingNumeralsSettings = {
      ...DEFAULT_SETTINGS,
      maxLevel: 6,
      customSchemes: [{
        id: "custom-legacy",
        name: "Legacy",
        revision: 1,
        baseLevel: 1,
        templates: ["{1.arabic}", "Part {1.arabic}", "", "", "", ""],
        exclusions: [],
      }],
    };
    expect(probeMaxLevelRemoval(legacyCustom)).toMatchObject({
      affectedSchemeIds: [],
      semanticallyInvalidCustomSchemeIds: ["custom-legacy"],
      safeToRemove: false,
    });
  });
});
