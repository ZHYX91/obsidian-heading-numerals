import { describe, expect, it } from "vitest";

import { parseNoteOverrides, resolveNoteSettings } from "../../src/config/frontmatter";
import {
  DEFAULT_SETTINGS,
  cleanupTemplateSources,
  sanitizePluginData,
  sanitizeSettings,
} from "../../src/config/settings";

describe("settings", () => {
  it("falls back safely from malformed persisted data", () => {
    const settings = sanitizeSettings({
      displayMode: "invalid",
      maxLevel: 99,
      virtualOpacity: -2,
      excludedFolders: ["/Private/", "Private", 12],
    });
    expect(settings.showVirtualNumbers).toBe(DEFAULT_SETTINGS.showVirtualNumbers);
    expect(settings.concealStoredNumbers).toBe(DEFAULT_SETTINGS.concealStoredNumbers);
    expect(settings.maxLevel).toBe(6);
    expect(settings.virtualOpacity).toBe(0.15);
    expect(settings.excludedFolders).toEqual(["Private"]);
    expect(sanitizePluginData(null).lastBatch).toBeNull();
  });

  it("parses and resolves per-note overrides", () => {
    const overrides = parseNoteOverrides({
      "heading-numerals": "conceal",
      "heading-numerals-scheme": "legal",
      "heading-numerals-clean-confidence": "medium",
      "heading-numerals-start": { h2: 3, h7: 9 },
    });
    expect(resolveNoteSettings(DEFAULT_SETTINGS, overrides)).toMatchObject({
      disabled: false,
      showVirtualNumbers: false,
      concealStoredNumbers: true,
      schemeId: "legal",
      cleanupScope: "common",
      starts: { 2: 3 },
    });
  });

  it("treats off and ignore as a full opt-out", () => {
    expect(parseNoteOverrides({ "heading-numerals": "off" }).disabled).toBe(true);
    expect(parseNoteOverrides({ "heading-numerals-ignore": true }).disabled).toBe(true);
  });

  it("migrates legacy modes and supports independent persisted display preferences", () => {
    expect(sanitizeSettings({ displayMode: "show" })).toMatchObject({
      showVirtualNumbers: true,
      concealStoredNumbers: false,
    });
    expect(sanitizeSettings({ displayMode: "conceal" })).toMatchObject({
      showVirtualNumbers: false,
      concealStoredNumbers: true,
    });
    expect(sanitizeSettings({
      displayMode: "normal",
      showVirtualNumbers: true,
      concealStoredNumbers: true,
    })).toMatchObject({
      schemaVersion: 4,
      showVirtualNumbers: true,
      concealStoredNumbers: true,
    });
  });

  it("migrates the old virtual appearance defaults without overwriting custom values", () => {
    expect(sanitizeSettings({
      schemaVersion: 3,
      virtualOpacity: 0.62,
      virtualGapEm: 0.35,
    })).toMatchObject({ virtualOpacity: 0.82, virtualGapEm: 0.32 });
    expect(sanitizeSettings({
      schemaVersion: 3,
      virtualOpacity: 0.7,
      virtualGapEm: 0.5,
    })).toMatchObject({ virtualOpacity: 0.7, virtualGapEm: 0.5 });
  });

  it("accepts the combined legacy frontmatter mode and explicit per-feature overrides", () => {
    expect(resolveNoteSettings(DEFAULT_SETTINGS, parseNoteOverrides({
      "heading-numerals": "show-conceal",
    }))).toMatchObject({
      showVirtualNumbers: true,
      concealStoredNumbers: true,
    });
    expect(resolveNoteSettings({
      ...DEFAULT_SETTINGS,
      showVirtualNumbers: true,
      concealStoredNumbers: false,
    }, parseNoteOverrides({
      "heading-numerals": "show",
      "heading-numerals-show-virtual": false,
      "heading-numerals-conceal-stored": true,
    }))).toMatchObject({
      showVirtualNumbers: false,
      concealStoredNumbers: true,
    });
  });

  it("migrates a 0.1 custom template without inventing one for untouched defaults", () => {
    const migrated = sanitizeSettings({
      scheme: "custom",
      customBaseLevel: 2,
      customTemplates: ["", "第{2.chinese_lower}章"],
    });
    expect(migrated.selectedSchemeId).toBe("custom-migrated");
    expect(migrated.customSchemes[0]).toMatchObject({
      id: "custom-migrated",
      baseLevel: 2,
    });
    expect(migrated.customSchemes[0]?.templates.slice(0, 2)).toEqual(["", "第{2.chinese_lower}章"]);
    expect(sanitizeSettings({ scheme: "hierarchical-h2" }).customSchemes).toEqual([]);
  });

  it("keeps current and retired custom templates available to cleanup", () => {
    const configured = sanitizeSettings({
      selectedSchemeId: "custom-guide",
      customSchemes: [{
        id: "custom-guide",
        name: "Guide",
        revision: 2,
        baseLevel: 1,
        templates: ["Part {1.arabic}", "", "", "", "", ""],
      }],
      cleanupHistory: [{
        schemeId: "custom-guide",
        schemeName: "Guide",
        revision: 1,
        baseLevel: 1,
        templates: ["Old {1.roman_upper}", "", "", "", "", ""],
      }],
    });
    const sources = cleanupTemplateSources(configured);
    expect(sources.some((source) => source.schemeId === "custom-guide" && source.revision === 2)).toBe(true);
    expect(sources.some((source) => source.schemeId === "custom-guide" && source.revision === 1)).toBe(true);
  });

  it("sanitizes exact custom-scheme exclusions and migrates old schemes to an empty list", () => {
    const configured = sanitizeSettings({
      customSchemes: [{
        id: "custom-guide",
        name: "Guide",
        revision: 1,
        baseLevel: 1,
        templates: ["{1.arabic}", "", "", "", "", ""],
        exclusions: [
          { title: "  References  ", scope: "heading" },
          { title: "References", scope: "subtree" },
          { title: "Appendix", scope: "invalid" },
          { title: "", scope: "heading" },
        ],
      }],
    });
    expect(configured.schemaVersion).toBe(4);
    expect(configured.customSchemes[0]?.exclusions).toEqual([
      { title: "References", scope: "heading" },
      { title: "Appendix", scope: "subtree" },
    ]);
    expect(sanitizeSettings({
      customSchemes: [{
        id: "custom-old",
        name: "Old",
        revision: 1,
        baseLevel: 1,
        templates: ["{1.arabic}", "", "", "", "", ""],
      }],
    }).customSchemes[0]?.exclusions).toEqual([]);
  });

  it("does not silently discard older cleanup templates", () => {
    const cleanupHistory = Array.from({ length: 101 }, (_unused, index) => ({
      schemeId: "custom-guide",
      schemeName: "Guide",
      revision: index + 1,
      baseLevel: 1,
      templates: [`Part ${index + 1} {1.arabic}`, "", "", "", "", ""],
    }));
    const configured = sanitizeSettings({ cleanupHistory });
    expect(configured.cleanupHistory).toHaveLength(101);
    expect(cleanupTemplateSources(configured).some((source) => source.revision === 1)).toBe(true);
  });

  it("never hides the selected built-in scheme during sanitization", () => {
    const configured = sanitizeSettings({
      selectedSchemeId: "legal",
      hiddenBuiltInSchemeIds: ["legal", "legal", "hierarchical"],
    });
    expect(configured.hiddenBuiltInSchemeIds).toEqual(["hierarchical"]);
  });

  it("accepts a 0.1 batch snapshot only as explicit legacy recovery data", () => {
    const data = sanitizePluginData({
      settings: {},
      lastBatch: {
        createdAt: "2026-08-06T00:00:00.000Z",
        operation: "write",
        status: "applied",
        files: [{ path: "note.md", before: "# A", after: "# 1 A" }],
      },
    });
    expect(data.lastBatch?.files[0]).toEqual({
      path: "note.md",
      before: "# A",
      afterHash: "legacy-exact",
      legacyAfter: "# 1 A",
    });
  });
});
