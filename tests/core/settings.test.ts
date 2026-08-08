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
    expect(settings.displayMode).toBe(DEFAULT_SETTINGS.displayMode);
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
      displayMode: "conceal",
      schemeId: "legal",
      cleanupScope: "common",
      starts: { 2: 3 },
    });
  });

  it("treats off and ignore as a full opt-out", () => {
    expect(parseNoteOverrides({ "heading-numerals": "off" }).disabled).toBe(true);
    expect(parseNoteOverrides({ "heading-numerals-ignore": true }).disabled).toBe(true);
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
