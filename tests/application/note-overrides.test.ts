import { describe, expect, it } from "vitest";

import {
  NOTE_OVERRIDE_KEYS,
  applyNoteOverrideChange,
  readNoteControlSnapshot,
} from "../../src/application/note-overrides";
import { DEFAULT_SETTINGS } from "../../src/config/settings";

describe("current note overrides", () => {
  it("leaves an untouched note fully inherited without creating properties", () => {
    const values: Record<string, unknown> = {};
    const snapshot = readNoteControlSnapshot(values, DEFAULT_SETTINGS);

    expect(snapshot).toMatchObject({
      showVirtual: "inherit",
      concealStored: "inherit",
      schemeId: null,
      ignore: false,
      effectiveShowVirtual: DEFAULT_SETTINGS.showVirtualNumbers,
      effectiveConcealStored: DEFAULT_SETTINGS.concealStoredNumbers,
      effectiveSchemeId: DEFAULT_SETTINGS.selectedSchemeId,
      hasAnyOverride: false,
    });
    expect(applyNoteOverrideChange(values, { kind: "reset" })).toBe(false);
    expect(values).toEqual({});
  });

  it("stores the two display choices independently, including explicit false", () => {
    const values: Record<string, unknown> = {};
    expect(applyNoteOverrideChange(values, { kind: "show-virtual", value: "on" })).toBe(true);
    expect(applyNoteOverrideChange(values, { kind: "conceal-stored", value: "off" })).toBe(true);

    expect(values).toEqual({
      "heading-numerals-show-virtual": true,
      "heading-numerals-conceal-stored": false,
    });
    expect(readNoteControlSnapshot(values, DEFAULT_SETTINGS)).toMatchObject({
      showVirtual: "on",
      concealStored: "off",
      effectiveShowVirtual: true,
      effectiveConcealStored: false,
    });
  });

  it("deletes a property when its control returns to follow global", () => {
    const values = {
      "heading-numerals-show-virtual": false,
      unrelated: "kept",
    } as Record<string, unknown>;

    expect(applyNoteOverrideChange(values, { kind: "show-virtual", value: "inherit" })).toBe(true);
    expect(values).toEqual({ unrelated: "kept" });
  });

  it("migrates a legacy combined mode while preserving the unedited effect", () => {
    const values = { "heading-numerals": "show-conceal" } as Record<string, unknown>;

    expect(readNoteControlSnapshot(values, DEFAULT_SETTINGS)).toMatchObject({
      showVirtual: "on",
      concealStored: "on",
      usesLegacyDisplayProperty: true,
    });

    applyNoteOverrideChange(values, { kind: "show-virtual", value: "inherit" });

    expect(values).toEqual({ "heading-numerals-conceal-stored": true });
  });

  it("preserves an existing explicit counterpart while migrating legacy display", () => {
    const values = {
      "heading-numerals": "show",
      "heading-numerals-show-virtual": false,
    } as Record<string, unknown>;

    applyNoteOverrideChange(values, { kind: "conceal-stored", value: "on" });

    expect(values).toEqual({
      "heading-numerals-show-virtual": false,
      "heading-numerals-conceal-stored": true,
    });
  });

  it("removes the legacy inherit sentinel when an independent value is chosen", () => {
    const values = { "heading-numerals": "inherit" } as Record<string, unknown>;
    applyNoteOverrideChange(values, { kind: "conceal-stored", value: "off" });
    expect(values).toEqual({ "heading-numerals-conceal-stored": false });
  });

  it("migrates legacy off into ignore before changing an independent effect", () => {
    const values = { "heading-numerals": "off" } as Record<string, unknown>;

    applyNoteOverrideChange(values, { kind: "show-virtual", value: "on" });

    expect(values).toEqual({
      "heading-numerals-ignore": true,
      "heading-numerals-show-virtual": true,
    });
  });

  it("turns off legacy ignore by deleting its property instead of writing false", () => {
    const values = { "heading-numerals": "off" } as Record<string, unknown>;

    expect(applyNoteOverrideChange(values, { kind: "ignore", value: false })).toBe(true);
    expect(values).toEqual({});
  });

  it("writes explicit ignore once and treats an identical request as a no-op", () => {
    const values: Record<string, unknown> = {};
    expect(applyNoteOverrideChange(values, { kind: "ignore", value: true })).toBe(true);
    expect(applyNoteOverrideChange(values, { kind: "ignore", value: true })).toBe(false);
    expect(values).toEqual({ "heading-numerals-ignore": true });
  });

  it("uses only selectable scheme IDs and restores inheritance by deletion", () => {
    const values: Record<string, unknown> = {};
    applyNoteOverrideChange(values, { kind: "scheme", value: "legal" });
    expect(values).toEqual({ "heading-numerals-scheme": "legal" });
    applyNoteOverrideChange(values, { kind: "scheme", value: null });
    expect(values).toEqual({});
  });

  it("falls back to the global scheme when a stored scheme is unavailable", () => {
    const snapshot = readNoteControlSnapshot(
      { "heading-numerals-scheme": "missing-scheme" },
      DEFAULT_SETTINGS,
    );
    expect(snapshot.schemeId).toBe("missing-scheme");
    expect(snapshot.effectiveSchemeId).toBe(DEFAULT_SETTINGS.selectedSchemeId);
  });

  it("uses an available custom scheme as the effective note scheme", () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      customSchemes: [{
        id: "custom-one",
        name: "Custom one",
        revision: 1,
        baseLevel: 1,
        templates: ["{1.arabic}", "", "", "", "", ""],
        exclusions: [],
      }],
    };
    const snapshot = readNoteControlSnapshot(
      { "heading-numerals-scheme": "custom-one" },
      settings,
    );
    expect(snapshot.effectiveSchemeId).toBe("custom-one");
  });

  it("reset removes every plugin override and preserves unrelated Properties", () => {
    const values: Record<string, unknown> = Object.fromEntries(
      NOTE_OVERRIDE_KEYS.map((key) => [key, true]),
    );
    values["tags"] = ["keep"];

    expect(applyNoteOverrideChange(values, { kind: "reset" })).toBe(true);
    expect(values).toEqual({ tags: ["keep"] });
  });
});
