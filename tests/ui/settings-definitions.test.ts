// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";

import { App } from "obsidian";

import { HeadingNumeralsSettingTab } from "../../src/app/settings-tab";
import { cloneSettings, DEFAULT_SETTINGS } from "../../src/config/settings";

function createHost() {
  const host = {
    settings: cloneSettings(DEFAULT_SETTINGS),
    saveSettings: vi.fn(async (next) => {
      host.settings = cloneSettings(next);
    }),
    scheduleSettings: vi.fn((next) => {
      host.settings = cloneSettings(next);
    }),
    settingsSaveStatus: () => ({ state: "saved" as const, error: null }),
    subscribeSettingsSaveStatus: vi.fn(() => () => undefined),
    retrySettingsSave: vi.fn(async () => undefined),
  };
  return host;
}

describe("Obsidian 1.13 settings definitions", () => {
  it("exposes four native pages instead of a custom tablist", () => {
    const host = createHost();
    const tab = new HeadingNumeralsSettingTab(new App(), host as never);
    const definitions = tab.getSettingDefinitions();

    expect(definitions.map((definition) => "type" in definition ? definition.type : undefined)).toEqual([
      "page",
      "page",
      "page",
      "page",
    ]);
    expect(definitions.map((definition) => "name" in definition ? definition.name : "")).toEqual([
      "General",
      "Numbering schemes",
      "Write and cleanup",
      "Display and batch",
    ]);
    expect(tab.containerEl.querySelector("[role=tablist]")).toBeNull();
  });

  it("persists native control changes through the plugin host", async () => {
    const host = createHost();
    const tab = new HeadingNumeralsSettingTab(new App(), host as never);

    expect(tab.getControlValue("general.language")).toBe("auto");
    await tab.setControlValue("general.language", "zh");
    await tab.setControlValue("views.excludedFolders", "Private, /Archive/, Private");

    expect(host.settings.language).toBe("zh");
    expect(host.settings.excludedFolders).toEqual(["Private", "Archive"]);
    expect(host.saveSettings).toHaveBeenCalledTimes(1);
    expect(host.scheduleSettings).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid values instead of silently persisting them", async () => {
    const host = createHost();
    const tab = new HeadingNumeralsSettingTab(new App(), host as never);

    await expect(tab.setControlValue("general.language", "automatic")).rejects.toThrow(
      "Invalid value",
    );
    await expect(tab.setControlValue("general.maxLevel", 7)).rejects.toThrow("Invalid value");
    expect(host.saveSettings).not.toHaveBeenCalled();
    expect(host.scheduleSettings).not.toHaveBeenCalled();
  });
});
