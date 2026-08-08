import { App, PluginSettingTab, Setting } from "obsidian";

import { createTranslator } from "../config/i18n";
import { DEFAULT_SETTINGS, type HeadingNumeralsSettings } from "../config/settings";
import type HeadingNumeralsPlugin from "./plugin";

function replaceSettings(target: HeadingNumeralsSettings, source: HeadingNumeralsSettings): void {
  Object.assign(target, source, {
    customTemplates: [...source.customTemplates],
    excludedFolders: [...source.excludedFolders],
  });
}

export class HeadingNumeralsSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: HeadingNumeralsPlugin) {
    super(app, plugin);
  }

  override display(): void {
    const { containerEl } = this;
    const settings = this.plugin.settings;
    const t = createTranslator(settings.language);
    containerEl.empty();
    new Setting(containerEl).setName(t("settings.title")).setHeading();
    new Setting(containerEl).setName(t("settings.general")).setHeading();

    new Setting(containerEl)
      .setName(t("settings.language"))
      .setDesc(t("settings.language.desc"))
      .addDropdown((dropdown) => dropdown
        .addOption("auto", t("language.auto"))
        .addOption("en", t("language.en"))
        .addOption("zh", t("language.zh"))
        .setValue(settings.language)
        .onChange(async (value) => {
          settings.language = value as HeadingNumeralsSettings["language"];
          await this.plugin.saveSettings();
          this.display();
        }));

    new Setting(containerEl)
      .setName(t("settings.mode"))
      .setDesc(t("settings.mode.desc"))
      .addDropdown((dropdown) => dropdown
        .addOption("normal", t("mode.normal"))
        .addOption("show", t("mode.show"))
        .addOption("conceal", t("mode.conceal"))
        .setValue(settings.displayMode)
        .onChange(async (value) => {
          settings.displayMode = value as HeadingNumeralsSettings["displayMode"];
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName(t("settings.scheme"))
      .setDesc(t("settings.scheme.desc"))
      .addDropdown((dropdown) => dropdown
        .addOption("hierarchical", t("scheme.hierarchical"))
        .addOption("hierarchical-h2", t("scheme.hierarchical-h2"))
        .addOption("chinese-official", t("scheme.chinese-official"))
        .addOption("legal", t("scheme.legal"))
        .addOption("custom", t("scheme.custom"))
        .setValue(settings.scheme)
        .onChange(async (value) => {
          settings.scheme = value as HeadingNumeralsSettings["scheme"];
          await this.plugin.saveSettings();
          this.display();
        }));

    if (settings.scheme === "custom") {
      for (let index = 0; index < 6; index += 1) {
        new Setting(containerEl)
          .setName(`H${index + 1}`)
          .addText((text) => text
            .setValue(settings.customTemplates[index] ?? "")
            .onChange(async (value) => {
              settings.customTemplates[index] = value;
              await this.plugin.saveSettings();
            }));
      }
    }

    new Setting(containerEl)
      .setName(t("settings.maxLevel"))
      .addSlider((slider) => slider
        .setLimits(1, 6, 1)
        .setValue(settings.maxLevel)
        .onChange(async (value) => {
          settings.maxLevel = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName(t("settings.missing"))
      .addDropdown((dropdown) => dropdown
        .addOption("fill-one", t("missing.fill-one"))
        .addOption("current-only", t("missing.current-only"))
        .addOption("skip", t("missing.skip"))
        .setValue(settings.missingLevelStrategy)
        .onChange(async (value) => {
          settings.missingLevelStrategy = value as HeadingNumeralsSettings["missingLevelStrategy"];
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl).setName(t("settings.write")).setHeading();
    new Setting(containerEl)
      .setName(t("settings.markers"))
      .setDesc(t("settings.markers.desc"))
      .addToggle((toggle) => toggle
        .setValue(settings.writeMarkers)
        .onChange(async (value) => {
          settings.writeMarkers = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName(t("settings.cleanup"))
      .setDesc(t("settings.cleanup.desc"))
      .addDropdown((dropdown) => dropdown
        .addOption("plugin", t("confidence.plugin"))
        .addOption("high", t("confidence.high"))
        .addOption("medium", t("confidence.medium"))
        .setValue(settings.cleanupThreshold)
        .onChange(async (value) => {
          settings.cleanupThreshold = value as HeadingNumeralsSettings["cleanupThreshold"];
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName(t("settings.multiple"))
      .addToggle((toggle) => toggle
        .setValue(settings.removeMultiplePrefixes)
        .onChange(async (value) => {
          settings.removeMultiplePrefixes = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName(t("settings.normalize"))
      .addToggle((toggle) => toggle
        .setValue(settings.normalizeManualOnRenumber)
        .onChange(async (value) => {
          settings.normalizeManualOnRenumber = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl).setName(t("settings.views")).setHeading();
    new Setting(containerEl)
      .setName(t("settings.live"))
      .addToggle((toggle) => toggle
        .setValue(settings.enableLivePreview)
        .onChange(async (value) => {
          settings.enableLivePreview = value;
          await this.plugin.saveSettings();
        }));
    new Setting(containerEl)
      .setName(t("settings.reading"))
      .addToggle((toggle) => toggle
        .setValue(settings.enableReadingView)
        .onChange(async (value) => {
          settings.enableReadingView = value;
          await this.plugin.saveSettings();
        }));
    new Setting(containerEl)
      .setName(t("settings.source"))
      .setDesc(t("settings.source.desc"))
      .addToggle((toggle) => toggle
        .setValue(settings.enableSourceMode)
        .onChange(async (value) => {
          settings.enableSourceMode = value;
          await this.plugin.saveSettings();
        }));
    new Setting(containerEl)
      .setName(t("settings.reveal"))
      .addToggle((toggle) => toggle
        .setValue(settings.revealOnActiveLine)
        .onChange(async (value) => {
          settings.revealOnActiveLine = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl).setName(t("settings.appearance")).setHeading();
    new Setting(containerEl)
      .setName(t("settings.opacity"))
      .addSlider((slider) => slider
        .setLimits(0.15, 1, 0.05)
        .setValue(settings.virtualOpacity)
        .onChange(async (value) => {
          settings.virtualOpacity = value;
          await this.plugin.saveSettings();
        }));
    new Setting(containerEl)
      .setName(t("settings.gap"))
      .addSlider((slider) => slider
        .setLimits(0, 2, 0.05)
        .setValue(settings.virtualGapEm)
        .onChange(async (value) => {
          settings.virtualGapEm = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl).setName(t("settings.batch")).setHeading();
    new Setting(containerEl)
      .setName(t("settings.excluded"))
      .setDesc(t("settings.excluded.desc"))
      .addText((text) => text
        .setValue(settings.excludedFolders.join(", "))
        .onChange(async (value) => {
          settings.excludedFolders = value.split(",")
            .map((entry) => entry.trim().replace(/\\/gu, "/").replace(/^\/+|\/+$/gu, ""))
            .filter((entry, index, all) => entry.length > 0 && all.indexOf(entry) === index);
          await this.plugin.saveSettings();
        }));
    new Setting(containerEl)
      .setName(t("settings.backupLimit"))
      .addSlider((slider) => slider
        .setLimits(1, 100, 1)
        .setValue(settings.batchBackupLimitMb)
        .onChange(async (value) => {
          settings.batchBackupLimitMb = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName(t("settings.reset"))
      .setDesc(t("settings.reset.desc"))
      .addButton((button) => button
        .setButtonText(t("settings.reset.button"))
        .setWarning()
        .onClick(async () => {
          replaceSettings(settings, DEFAULT_SETTINGS);
          await this.plugin.saveSettings();
          this.display();
        }));
  }
}
