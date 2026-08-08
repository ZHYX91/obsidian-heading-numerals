import { describe, expect, it } from "vitest";

import { parseNoteOverrides, resolveNoteSettings } from "../../src/config/frontmatter";
import { DEFAULT_SETTINGS, sanitizePluginData, sanitizeSettings } from "../../src/config/settings";

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
      scheme: "legal",
      cleanupThreshold: "medium",
      starts: { 2: 3 },
    });
  });

  it("treats off and ignore as a full opt-out", () => {
    expect(parseNoteOverrides({ "heading-numerals": "off" }).disabled).toBe(true);
    expect(parseNoteOverrides({ "heading-numerals-ignore": true }).disabled).toBe(true);
  });
});
