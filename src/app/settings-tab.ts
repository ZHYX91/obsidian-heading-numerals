import { App, Modal, PluginSettingTab, Setting } from "obsidian";

import { createTranslator, type Translate } from "../config/i18n";
import {
  DEFAULT_SETTINGS,
  cloneSettings,
  type HeadingNumeralsSettings,
} from "../config/settings";
import type { SettingsSaveStatus } from "../config/settings-save-coordinator";
import { BUILT_IN_SCHEMES, isBuiltInSchemeId } from "../core/schemes";
import { compileTemplate, NUMBER_FORMATS, renderTemplate } from "../core/template-compiler";
import { BUILT_IN_SCHEME_IDS, type CustomNumberingScheme } from "../core/types";
import { createSettingsTabs, type SettingsTabId } from "../ui/settings/tabs";
import type HeadingNumeralsPlugin from "./plugin";
import type { SettingsImpact } from "./plugin";

const PREVIEW_COUNTERS = [2, 3, 4, 5, 6, 7] as [number, number, number, number, number, number];

function builtInName(id: string, t: Translate): string {
  return isBuiltInSchemeId(id) ? t(`scheme.${id}`) : id;
}

function customSchemeName(scheme: CustomNumberingScheme, t: Translate): string {
  return scheme.id === "custom-migrated" && scheme.name === "Migrated custom scheme"
    ? t("settings.scheme.migrated")
    : scheme.name;
}

function newCustomId(settings: HeadingNumeralsSettings): string {
  const prefix = `custom-${Date.now().toString(36)}`;
  let id = prefix;
  let suffix = 1;
  while (settings.customSchemes.some((scheme) => scheme.id === id)) id = `${prefix}-${suffix++}`;
  return id;
}

function archiveScheme(settings: HeadingNumeralsSettings, scheme: CustomNumberingScheme): void {
  const key = `${scheme.id}@${scheme.revision}`;
  if (settings.cleanupHistory.some((entry) => `${entry.schemeId}@${entry.revision}` === key)) return;
  settings.cleanupHistory.push({
    schemeId: scheme.id,
    schemeName: scheme.name,
    revision: scheme.revision,
    baseLevel: scheme.baseLevel,
    templates: [...scheme.templates],
  });
  settings.cleanupHistory = settings.cleanupHistory.slice(-100);
}

function firstAvailableScheme(settings: HeadingNumeralsSettings, excluding?: string): string {
  const custom = settings.customSchemes.find((scheme) => scheme.id !== excluding);
  if (custom != null) return custom.id;
  const builtIn = BUILT_IN_SCHEME_IDS.find((id) => (
    id !== excluding && !settings.hiddenBuiltInSchemeIds.includes(id)
  ));
  if (builtIn != null) return builtIn;
  settings.hiddenBuiltInSchemeIds = settings.hiddenBuiltInSchemeIds.filter((id) => id !== "hierarchical-h2");
  return "hierarchical-h2";
}

class ResetSettingsModal extends Modal {
  constructor(
    app: App,
    private readonly t: Translate,
    private readonly confirm: () => void,
  ) {
    super(app);
  }

  override onOpen(): void {
    this.setTitle(this.t("settings.reset"));
    this.contentEl.createEl("p", { text: this.t("settings.reset.desc") });
    new Setting(this.contentEl)
      .addButton((button) => button
        .setButtonText(this.t("preview.cancel"))
        .onClick(() => this.close()))
      .addButton((button) => button
        .setButtonText(this.t("settings.reset.button"))
        .setWarning()
        .onClick(() => {
          this.confirm();
          this.close();
        }));
  }
}

export class HeadingNumeralsSettingTab extends PluginSettingTab {
  private activeTab: SettingsTabId = "general";
  private cleanup: (() => void) | null = null;

  constructor(app: App, private readonly plugin: HeadingNumeralsPlugin) {
    super(app, plugin);
  }

  override hide(): void {
    this.cleanup?.();
    this.cleanup = null;
  }

  override display(): void {
    this.cleanup?.();
    const { containerEl } = this;
    const settings = this.plugin.settings;
    const t = createTranslator(settings.language);
    containerEl.empty();
    containerEl.addClass("heading-numerals-settings");
    new Setting(containerEl).setName(t("settings.title")).setHeading();
    const statusCleanup = this.renderSaveStatus(containerEl, t);
    const tabs = [
      { id: "general", label: t("settings.tab.general") },
      { id: "schemes", label: t("settings.tab.schemes") },
      { id: "cleanup", label: t("settings.tab.cleanup") },
      { id: "views", label: t("settings.tab.views") },
    ] as const;
    const layout = createSettingsTabs(containerEl, tabs, this.activeTab, t("settings.tabs.label"), (id) => {
      this.activeTab = id;
      this.display();
      const target = this.containerEl.querySelector<HTMLElement>(`#heading-numerals-settings-tab-${id}`);
      target?.focus();
    });
    if (this.activeTab === "general") this.renderGeneral(layout.panel, t);
    else if (this.activeTab === "schemes") this.renderSchemes(layout.panel, t);
    else if (this.activeTab === "cleanup") this.renderCleanup(layout.panel, t);
    else this.renderViews(layout.panel, t);
    this.cleanup = () => {
      layout.cleanup();
      statusCleanup();
      containerEl.removeClass("heading-numerals-settings");
    };
  }

  private renderSaveStatus(container: HTMLElement, t: Translate): () => void {
    const row = container.ownerDocument.createElement("div");
    row.className = "heading-numerals-settings-save-status";
    const message = row.ownerDocument.createElement("span");
    const retry = row.ownerDocument.createElement("button");
    retry.type = "button";
    retry.textContent = t("settings.save.retry");
    retry.addEventListener("click", () => {
      retry.disabled = true;
      void this.plugin.retrySettingsSave().catch(() => undefined);
    });
    row.append(message, retry);
    container.append(row);
    const update = (status: SettingsSaveStatus): void => {
      row.hidden = status.state === "saved";
      row.setAttribute("role", status.state === "pending" ? "alert" : "status");
      row.setAttribute("aria-live", status.state === "pending" ? "assertive" : "polite");
      message.textContent = status.state === "scheduled"
        ? t("settings.save.scheduled")
        : status.state === "saving" ? t("settings.save.saving") : t("settings.save.pending");
      retry.hidden = status.state !== "pending";
      retry.disabled = status.state !== "pending";
    };
    const unsubscribe = this.plugin.subscribeSettingsSaveStatus(update);
    return () => {
      unsubscribe();
      retry.replaceWith(retry.cloneNode(true));
      row.remove();
    };
  }

  private commit(
    update: (settings: HeadingNumeralsSettings) => void,
    impact: SettingsImpact,
    immediate = false,
    rerender = false,
  ): void {
    const next = cloneSettings(this.plugin.settings);
    update(next);
    if (immediate) {
      void this.plugin.saveSettings(next, impact).catch((error: unknown) => {
        console.error("Heading Numerals: failed to save settings", error);
      });
    } else {
      this.plugin.scheduleSettings(next, impact);
    }
    if (rerender) this.display();
  }

  private renderGeneral(container: HTMLElement, t: Translate): void {
    new Setting(container).setName(t("settings.general")).setHeading();
    new Setting(container)
      .setName(t("settings.language"))
      .setDesc(t("settings.language.desc"))
      .addDropdown((dropdown) => dropdown
        .addOption("auto", t("language.auto"))
        .addOption("en", t("language.en"))
        .addOption("zh", t("language.zh"))
        .setValue(this.plugin.settings.language)
        .onChange((value) => this.commit((settings) => {
          settings.language = value as HeadingNumeralsSettings["language"];
        }, "none", true, true)));
    new Setting(container)
      .setName(t("settings.mode"))
      .setDesc(t("settings.mode.desc"))
      .addDropdown((dropdown) => dropdown
        .addOption("normal", t("mode.normal"))
        .addOption("show", t("mode.show"))
        .addOption("conceal", t("mode.conceal"))
        .setValue(this.plugin.settings.displayMode)
        .onChange((value) => this.commit((settings) => {
          settings.displayMode = value as HeadingNumeralsSettings["displayMode"];
        }, "display", true)));
    new Setting(container)
      .setName(t("settings.maxLevel"))
      .addSlider((slider) => slider.setLimits(1, 6, 1).setDynamicTooltip()
        .setValue(this.plugin.settings.maxLevel)
        .onChange((value) => this.commit((settings) => { settings.maxLevel = value; }, "display")));
    new Setting(container)
      .setName(t("settings.missing"))
      .addDropdown((dropdown) => dropdown
        .addOption("fill-one", t("missing.fill-one"))
        .addOption("current-only", t("missing.current-only"))
        .addOption("skip", t("missing.skip"))
        .setValue(this.plugin.settings.missingLevelStrategy)
        .onChange((value) => this.commit((settings) => {
          settings.missingLevelStrategy = value as HeadingNumeralsSettings["missingLevelStrategy"];
        }, "display", true)));
    new Setting(container)
      .setName(t("settings.reset"))
      .setDesc(t("settings.reset.desc"))
      .addButton((button) => button.setButtonText(t("settings.reset.button")).setWarning().onClick(() => {
        new ResetSettingsModal(this.app, t, () => {
          void this.plugin.saveSettings(cloneSettings(DEFAULT_SETTINGS), "all")
            .then(() => this.display())
            .catch((error: unknown) => {
              console.error("Heading Numerals: failed to reset settings", error);
            });
        }).open();
      }));
  }

  private renderSchemes(container: HTMLElement, t: Translate): void {
    new Setting(container).setName(t("settings.scheme")).setHeading();
    const settings = this.plugin.settings;
    const visibleBuiltIns = BUILT_IN_SCHEME_IDS.filter((id) => !settings.hiddenBuiltInSchemeIds.includes(id));
    new Setting(container)
      .setName(t("settings.scheme"))
      .setDesc(t("settings.scheme.desc"))
      .addDropdown((dropdown) => {
        for (const id of visibleBuiltIns) dropdown.addOption(id, builtInName(id, t));
        for (const scheme of settings.customSchemes) dropdown.addOption(scheme.id, customSchemeName(scheme, t));
        return dropdown.setValue(settings.selectedSchemeId).onChange((value) => this.commit((next) => {
          next.selectedSchemeId = value;
        }, "display", true, true));
      })
      .addButton((button) => button.setButtonText(t("settings.scheme.add")).setCta().onClick(() => {
        this.commit((next) => {
          const scheme: CustomNumberingScheme = {
            id: newCustomId(next),
            name: `${t("settings.scheme.custom")} ${next.customSchemes.length + 1}`,
            revision: 1,
            baseLevel: 1,
            templates: ["{1.arabic}", "{1.arabic}.{2.arabic}", "", "", "", ""],
          };
          next.customSchemes.push(scheme);
          next.selectedSchemeId = scheme.id;
        }, "display", true, true);
      }));
    this.renderPlaceholderHelp(container, t);
    for (const id of visibleBuiltIns) this.renderBuiltInScheme(container, id, t);
    for (const scheme of settings.customSchemes) this.renderCustomScheme(container, scheme, t);
    new Setting(container).setName(t("settings.scheme.hidden")).setHeading();
    if (settings.hiddenBuiltInSchemeIds.length === 0) {
      container.createEl("p", { cls: "setting-item-description", text: t("settings.scheme.noneHidden") });
    }
    for (const id of settings.hiddenBuiltInSchemeIds) {
      new Setting(container).setName(builtInName(id, t)).addButton((button) => button
        .setButtonText(t("settings.scheme.restore"))
        .onClick(() => this.commit((next) => {
          next.hiddenBuiltInSchemeIds = next.hiddenBuiltInSchemeIds.filter((hidden) => hidden !== id);
        }, "none", true, true)));
    }
  }

  private renderPlaceholderHelp(container: HTMLElement, t: Translate): void {
    const details = container.createEl("details", { cls: "heading-numerals-placeholder-help" });
    details.createEl("summary", { text: t("settings.scheme.placeholderHelp") });
    const list = details.createEl("ul");
    for (const format of NUMBER_FORMATS) {
      list.createEl("li").append(
        details.ownerDocument.createElement("code"),
        details.ownerDocument.createTextNode(` — ${t(`format.${format}`)}`),
      );
      const code = list.lastElementChild?.querySelector("code");
      if (code != null) code.textContent = `{1.${format}}`;
    }
  }

  private renderBuiltInScheme(container: HTMLElement, id: typeof BUILT_IN_SCHEME_IDS[number], t: Translate): void {
    const scheme = BUILT_IN_SCHEMES[id];
    const details = container.createEl("details", { cls: "heading-numerals-scheme-card" });
    details.createEl("summary", { text: `${builtInName(id, t)} · ${t("settings.scheme.builtin")}` });
    this.renderReadOnlyTemplates(details, scheme.templates, t);
    new Setting(details)
      .addButton((button) => button.setButtonText(t("settings.scheme.copy")).onClick(() => {
        this.commit((settings) => {
          const copy: CustomNumberingScheme = {
            id: newCustomId(settings),
            name: `${builtInName(id, t)} ${t("settings.scheme.copySuffix")}`,
            revision: 1,
            baseLevel: scheme.baseLevel,
            templates: [...scheme.templates],
          };
          settings.customSchemes.push(copy);
          settings.selectedSchemeId = copy.id;
        }, "display", true, true);
      }))
      .addButton((button) => button.setButtonText(t("settings.scheme.hide")).setWarning().onClick(() => {
        this.commit((settings) => {
          if (!settings.hiddenBuiltInSchemeIds.includes(id)) settings.hiddenBuiltInSchemeIds.push(id);
          if (settings.selectedSchemeId === id) settings.selectedSchemeId = firstAvailableScheme(settings, id);
        }, "display", true, true);
      }));
  }

  private renderReadOnlyTemplates(container: HTMLElement, templates: readonly string[], t: Translate): void {
    for (let index = 0; index < 6; index += 1) {
      const template = templates[index] ?? "";
      new Setting(container)
        .setName(`H${index + 1}`)
        .setDesc(template.length === 0
          ? t("settings.scheme.disabled")
          : t("settings.scheme.preview", { value: renderTemplate(template, PREVIEW_COUNTERS) }))
        .addText((text) => text.setValue(template).setDisabled(true));
    }
  }

  private renderCustomScheme(container: HTMLElement, scheme: CustomNumberingScheme, t: Translate): void {
    const details = container.createEl("details", { cls: "heading-numerals-scheme-card" });
    details.open = this.plugin.settings.selectedSchemeId === scheme.id;
    const displayName = customSchemeName(scheme, t);
    details.createEl("summary", { text: `${displayName} · ${t("settings.scheme.custom")}` });
    const draft = { ...scheme, name: displayName, templates: [...scheme.templates] };
    new Setting(details).setName(t("settings.scheme.name")).addText((text) => text
      .setValue(draft.name)
      .onChange((value) => { draft.name = value.slice(0, 80); }));
    new Setting(details).setName(t("settings.scheme.base")).addDropdown((dropdown) => {
      for (let level = 1; level <= 6; level += 1) dropdown.addOption(String(level), `H${level}`);
      return dropdown.setValue(String(draft.baseLevel)).onChange((value) => {
        draft.baseLevel = Number(value);
      });
    });
    const validation = details.createDiv({ cls: "heading-numerals-template-validation" });
    validation.setAttribute("role", "alert");
    const previewElements: HTMLElement[] = [];
    const updateValidation = (): boolean => {
      const invalid = draft.templates.some((template) => compileTemplate(template).diagnostics.length > 0);
      validation.hidden = !invalid;
      validation.textContent = invalid ? t("settings.scheme.invalid") : "";
      draft.templates.forEach((template, index) => {
        const preview = previewElements[index];
        if (preview != null) preview.textContent = template.length === 0
          ? t("settings.scheme.disabled")
          : t("settings.scheme.preview", { value: renderTemplate(template, PREVIEW_COUNTERS) });
      });
      return !invalid && draft.name.trim().length > 0;
    };
    for (let index = 0; index < 6; index += 1) {
      const preview = details.createDiv({ cls: "heading-numerals-template-preview" });
      previewElements.push(preview);
      new Setting(details).setName(`H${index + 1}`).addText((text) => text
        .setValue(draft.templates[index] ?? "")
        .onChange((value) => {
          draft.templates[index] = value.slice(0, 300);
          updateValidation();
        }));
    }
    updateValidation();
    new Setting(details)
      .addButton((button) => button.setButtonText(t("settings.scheme.save")).setCta().onClick(() => {
        if (!updateValidation()) return;
        this.commit((settings) => {
          const current = settings.customSchemes.find((item) => item.id === scheme.id);
          if (current == null) return;
          const changed = current.name !== draft.name.trim()
            || current.baseLevel !== draft.baseLevel
            || current.templates.some((template, index) => template !== draft.templates[index]);
          if (!changed) return;
          archiveScheme(settings, current);
          Object.assign(current, {
            name: draft.name.trim(),
            baseLevel: draft.baseLevel,
            templates: [...draft.templates],
            revision: current.revision + 1,
          });
        }, "display", true, true);
      }))
      .addButton((button) => button.setButtonText(t("settings.scheme.delete")).setWarning().onClick(() => {
        this.commit((settings) => {
          const current = settings.customSchemes.find((item) => item.id === scheme.id);
          if (current != null) archiveScheme(settings, current);
          settings.customSchemes = settings.customSchemes.filter((item) => item.id !== scheme.id);
          if (settings.selectedSchemeId === scheme.id) {
            settings.selectedSchemeId = firstAvailableScheme(settings, scheme.id);
          }
        }, "display", true, true);
      }));
  }

  private renderCleanup(container: HTMLElement, t: Translate): void {
    new Setting(container).setName(t("settings.write")).setHeading();
    new Setting(container)
      .setName(t("settings.markers"))
      .setDesc(t("settings.markers.desc"))
      .addToggle((toggle) => toggle.setValue(this.plugin.settings.writeMarkers).onChange((value) => {
        this.commit((settings) => { settings.writeMarkers = value; }, "none", true);
      }));
    new Setting(container)
      .setName(t("settings.cleanup"))
      .setDesc(t("settings.cleanup.desc"))
      .addDropdown((dropdown) => dropdown
        .addOption("plugin", t("cleanup.plugin"))
        .addOption("templates", t("cleanup.templates"))
        .addOption("common", t("cleanup.common"))
        .setValue(this.plugin.settings.cleanupScope)
        .onChange((value) => this.commit((settings) => {
          settings.cleanupScope = value as HeadingNumeralsSettings["cleanupScope"];
        }, "display", true)));
    new Setting(container).setName(t("settings.multiple")).addToggle((toggle) => toggle
      .setValue(this.plugin.settings.removeMultiplePrefixes)
      .onChange((value) => this.commit((settings) => { settings.removeMultiplePrefixes = value; }, "none", true)));
    new Setting(container).setName(t("settings.normalize")).addToggle((toggle) => toggle
      .setValue(this.plugin.settings.normalizeManualOnRenumber)
      .onChange((value) => this.commit((settings) => { settings.normalizeManualOnRenumber = value; }, "none", true)));
    new Setting(container).setName(t("settings.scheme.history")).setDesc(t("settings.scheme.history.desc")).setHeading();
    if (this.plugin.settings.cleanupHistory.length === 0) {
      container.createEl("p", { cls: "setting-item-description", text: t("settings.scheme.history.empty") });
    } else {
      for (const item of this.plugin.settings.cleanupHistory) {
        new Setting(container).setName(`${item.schemeName} · v${item.revision}`)
          .setDesc(item.templates.filter((template) => template.length > 0).join(" · "));
      }
      new Setting(container).addButton((button) => button
        .setButtonText(t("settings.scheme.history.clear"))
        .setWarning()
        .onClick(() => this.commit((settings) => { settings.cleanupHistory = []; }, "display", true, true)));
    }
  }

  private renderViews(container: HTMLElement, t: Translate): void {
    new Setting(container).setName(t("settings.views")).setHeading();
    const toggle = (name: Parameters<Translate>[0], key: "enableLivePreview" | "enableReadingView" | "enableSourceMode" | "revealOnActiveLine", description?: Parameters<Translate>[0]): void => {
      const setting = new Setting(container).setName(t(name));
      if (description != null) setting.setDesc(t(description));
      setting.addToggle((component) => component.setValue(this.plugin.settings[key]).onChange((value) => {
        this.commit((settings) => { settings[key] = value; }, "display", true);
      }));
    };
    toggle("settings.live", "enableLivePreview");
    toggle("settings.reading", "enableReadingView");
    toggle("settings.source", "enableSourceMode", "settings.source.desc");
    toggle("settings.reveal", "revealOnActiveLine");
    new Setting(container).setName(t("settings.appearance")).setHeading();
    new Setting(container).setName(t("settings.opacity")).addSlider((slider) => slider
      .setLimits(0.15, 1, 0.05).setDynamicTooltip().setValue(this.plugin.settings.virtualOpacity)
      .onChange((value) => this.commit((settings) => { settings.virtualOpacity = value; }, "appearance")));
    new Setting(container).setName(t("settings.gap")).addSlider((slider) => slider
      .setLimits(0, 2, 0.05).setDynamicTooltip().setValue(this.plugin.settings.virtualGapEm)
      .onChange((value) => this.commit((settings) => { settings.virtualGapEm = value; }, "appearance")));
    new Setting(container).setName(t("settings.batch")).setHeading();
    new Setting(container).setName(t("settings.excluded")).setDesc(t("settings.excluded.desc"))
      .addText((text) => text.setValue(this.plugin.settings.excludedFolders.join(", ")).onChange((value) => {
        this.commit((settings) => {
          settings.excludedFolders = value.split(",")
            .map((entry) => entry.trim().replace(/\\/gu, "/").replace(/^\/+|\/+$/gu, ""))
            .filter((entry, index, all) => entry.length > 0 && all.indexOf(entry) === index);
        }, "none");
      }));
    new Setting(container).setName(t("settings.backupLimit")).addSlider((slider) => slider
      .setLimits(1, 100, 1).setDynamicTooltip().setValue(this.plugin.settings.batchBackupLimitMb)
      .onChange((value) => this.commit((settings) => { settings.batchBackupLimitMb = value; }, "none")));
  }
}
