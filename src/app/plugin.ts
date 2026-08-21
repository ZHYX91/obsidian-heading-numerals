import {
  MarkdownView,
  Notice,
  Plugin,
} from "obsidian";

import { openObsidianPluginSettings } from "../adapters/obsidian/plugin-settings";
import { RecoveryStore } from "../adapters/obsidian/recovery-store";
import {
  updateDisplayPreferences,
  type DisplayPreferenceAction,
} from "../application/display-preferences";
import { BatchController } from "../commands/batch";
import { runCurrentNoteOperation } from "../commands/current-note";
import { createTranslator, type Translate } from "../config/i18n";
import {
  DEFAULT_SETTINGS,
  cloneSettings,
  sanitizePluginData,
  sanitizeSettings,
  type HeadingNumeralsSettings,
  type LastBatchSnapshot,
} from "../config/settings";
import {
  SettingsSaveCoordinator,
  type SettingsSaveStatus,
} from "../config/settings-save-coordinator";
import {
  type DisplayMode,
  type TransformOperation,
} from "../core/types";
import { HeadingDisplayController } from "../editor/heading-display-extension";
import { HeadingReadingProcessor } from "../reading/heading-postprocessor";
import { NoteControlModal } from "../ui/note-control-modal";
import { HeadingNumeralsSettingTab } from "./settings-tab";
import type { SettingsImpact } from "./settings-impact";

export default class HeadingNumeralsPlugin extends Plugin {
  override settings: HeadingNumeralsSettings = { ...DEFAULT_SETTINGS };
  private lastBatch: LastBatchSnapshot | null = null;
  private displayController: HeadingDisplayController | null = null;
  private batchController: BatchController | null = null;
  private recoveryStore: RecoveryStore | null = null;
  private settingsCoordinator: SettingsSaveCoordinator<HeadingNumeralsSettings> | null = null;
  private readingProcessor: HeadingReadingProcessor | null = null;

  override async onload(): Promise<void> {
    const data = sanitizePluginData(await this.loadData());
    this.settings = data.settings;
    this.recoveryStore = new RecoveryStore(this.app, this.manifest);
    const recoveredBatch = await this.recoveryStore.load();
    this.lastBatch = recoveredBatch ?? data.lastBatch;
    if (data.lastBatch != null && recoveredBatch == null) {
      await this.recoveryStore.save(data.lastBatch);
    }
    this.settingsCoordinator = new SettingsSaveCoordinator(async (snapshot) => {
      await this.saveData({ schemaVersion: 5, settings: snapshot });
    });
    await this.settingsCoordinator.save(cloneSettings(this.settings)).catch((error: unknown) => {
      console.error("Heading Numerals: initial settings migration remains pending", error);
    });

    this.displayController = new HeadingDisplayController(() => this.settings);
    this.registerEditorExtension(this.displayController.createExtension());
    this.readingProcessor = new HeadingReadingProcessor(this.app, () => this.settings);
    this.registerMarkdownPostProcessor((element, context) => this.readingProcessor?.process(element, context));

    this.batchController = new BatchController(
      this.app,
      () => this.settings,
      {
        getLastBatch: () => this.lastBatch,
        setLastBatch: async (snapshot) => {
          if (this.recoveryStore == null) throw new Error("Recovery store is unavailable.");
          await this.recoveryStore.save(snapshot);
          this.lastBatch = snapshot;
        },
      },
    );

    this.addSettingTab(new HeadingNumeralsSettingTab(this.app, this));
    this.registerCommands();
    this.addRibbon();
    this.applyAppearance();
  }

  override onunload(): void {
    void this.settingsCoordinator?.flush().catch((error: unknown) => {
      console.error("Heading Numerals: failed to flush settings", error);
    });
    this.cleanupReadingDom();
    this.clearAppearance();
  }

  scheduleSettings(settings: HeadingNumeralsSettings, impact: SettingsImpact = "all"): void {
    this.settings = sanitizeSettings(settings);
    this.applySettingsImpact(impact);
    this.settingsCoordinator?.schedule(cloneSettings(this.settings));
  }

  async saveSettings(
    settings: HeadingNumeralsSettings = this.settings,
    impact: SettingsImpact = "all",
  ): Promise<void> {
    this.settings = sanitizeSettings(settings);
    this.applySettingsImpact(impact);
    if (this.settingsCoordinator == null) throw new Error("Settings coordinator is unavailable.");
    await this.settingsCoordinator.save(cloneSettings(this.settings));
  }

  settingsSaveStatus(): SettingsSaveStatus {
    return this.settingsCoordinator?.snapshot() ?? { state: "saved", error: null };
  }

  subscribeSettingsSaveStatus(listener: (status: SettingsSaveStatus) => void): () => void {
    return this.settingsCoordinator?.subscribe(listener) ?? (() => undefined);
  }

  retrySettingsSave(): Promise<void> {
    return this.settingsCoordinator?.retry() ?? Promise.resolve();
  }

  private translate(): Translate {
    return createTranslator(this.settings.language);
  }

  private registerCommands(): void {
    const commandNames: ReadonlyArray<readonly [
      Exclude<DisplayMode, "show-conceal">,
      Parameters<Translate>[0],
    ]> = [
      ["normal", "command.mode.normal"],
      ["show", "command.mode.show"],
      ["conceal", "command.mode.conceal"],
    ];
    for (const [mode, key] of commandNames) {
      this.addCommand({
        id: `set-view-mode-${mode}`,
        name: this.translate()(key),
        callback: () => void this.updateDisplayPreference(mode).catch((error: unknown) => {
          console.error("Heading Numerals: failed to save view mode", error);
        }),
      });
    }

    const operations: ReadonlyArray<readonly [TransformOperation, Parameters<Translate>[0], string]> = [
      ["write", "command.write.current", "write-numbers-current-note"],
      ["remove", "command.remove.current", "remove-numbers-current-note"],
      ["renumber", "command.renumber.current", "renumber-current-note"],
      ["strip-markers", "command.strip.current", "strip-source-markers-current-note"],
    ];
    for (const [operation, key, id] of operations) {
      this.addCommand({
        id,
        name: this.translate()(key),
        checkCallback: (checking) => {
          const view = this.app.workspace.getActiveViewOfType(MarkdownView);
          const available = view?.file != null && view.getMode() === "source";
          if (!checking && available) {
            this.runCurrent(operation);
          }
          return available;
        },
      });
    }

    this.addCommand({
      id: "process-folder-or-vault",
      name: this.translate()("command.batch.folder"),
      callback: () => this.batchController?.open(this.translate()),
    });
    this.addCommand({
      id: "undo-last-batch",
      name: this.translate()("command.batch.undo"),
      checkCallback: (checking) => {
        const available = this.lastBatch != null;
        if (!checking && available) {
          void this.batchController?.undo(this.translate());
        }
        return available;
      },
    });
    this.addCommand({
      id: "open-current-note-controls",
      name: this.translate()("command.note.controls"),
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        const available = file?.extension.toLowerCase() === "md";
        if (!checking && available) this.openCurrentNotePanel();
        return available;
      },
    });
  }

  private addRibbon(): void {
    this.addRibbonIcon("list-ordered", this.translate()("panel.ribbon"), () => {
      this.openCurrentNotePanel();
    });
  }

  private openCurrentNotePanel(): void {
    const file = this.app.workspace.getActiveFile();
    if (file == null || file.extension.toLowerCase() !== "md") {
      new Notice(this.translate()("notice.noActiveNote"));
      return;
    }
    const t = this.translate();
    new NoteControlModal(this.app, file, () => this.settings, t, {
      refreshDisplay: () => {
        this.readingProcessor?.invalidate();
        this.displayController?.refreshAll();
        this.rerenderReadingViews();
      },
      runCurrent: (operation) => this.runCurrent(operation),
      openBatch: () => this.batchController?.open(this.translate()),
      openGlobalSettings: () => {
        if (!openObsidianPluginSettings(this.app, this.manifest.id)) {
          new Notice(t("panel.settingsUnavailable"));
        }
      },
    }).open();
  }

  private runCurrent(operation: TransformOperation): void {
    runCurrentNoteOperation(this.app, this.settings, operation, this.translate());
  }

  private async updateDisplayPreference(mode: DisplayPreferenceAction): Promise<void> {
    const next = cloneSettings(this.settings);
    const update = updateDisplayPreferences(next, mode);
    next.showVirtualNumbers = update.showVirtualNumbers;
    next.concealStoredNumbers = update.concealStoredNumbers;
    await this.saveSettings(next, "display");
    new Notice(this.translate()(update.noticeKey));
  }

  private rerenderReadingViews(): void {
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.view instanceof MarkdownView) {
        leaf.view.previewMode.rerender(true);
      }
    });
  }

  private applySettingsImpact(impact: SettingsImpact): void {
    if (impact === "appearance" || impact === "all") this.applyAppearance();
    if (impact === "display" || impact === "all") {
      this.readingProcessor?.invalidate();
      this.displayController?.refreshAll();
      this.rerenderReadingViews();
    }
  }

  private ownerDocuments(): Document[] {
    const documents = new Set<Document>();
    if (typeof document !== "undefined") {
      documents.add(document);
    }
    this.app.workspace.iterateAllLeaves((leaf) => {
      documents.add(leaf.view.containerEl.ownerDocument);
    });
    return [...documents];
  }

  private applyAppearance(): void {
    for (const ownerDocument of this.ownerDocuments()) {
      ownerDocument.body.style.setProperty(
        "--heading-numerals-virtual-opacity",
        String(this.settings.virtualOpacity),
      );
      ownerDocument.body.style.setProperty(
        "--heading-numerals-virtual-gap",
        `${this.settings.virtualGapEm}em`,
      );
    }
  }

  private clearAppearance(): void {
    for (const ownerDocument of this.ownerDocuments()) {
      ownerDocument.body.style.removeProperty("--heading-numerals-virtual-opacity");
      ownerDocument.body.style.removeProperty("--heading-numerals-virtual-gap");
    }
  }

  private cleanupReadingDom(): void {
    for (const ownerDocument of this.ownerDocuments()) {
      for (const virtual of ownerDocument.querySelectorAll<HTMLElement>(
        ".markdown-reading-view .heading-numerals-virtual",
      )) {
        const original = virtual.dataset.headingNumeralsOriginal;
        if (original != null) virtual.replaceWith(original);
        else virtual.remove();
      }
      for (const anchor of ownerDocument.querySelectorAll<HTMLElement>(
        ".markdown-reading-view [data-heading-numerals-reference]",
      )) delete anchor.dataset.headingNumeralsReference;
      for (const concealed of ownerDocument.querySelectorAll<HTMLElement>(
        ".markdown-reading-view .heading-numerals-concealed",
      )) {
        concealed.replaceWith(...concealed.childNodes);
      }
    }
  }
}
