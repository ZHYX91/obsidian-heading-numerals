import {
  MarkdownView,
  Menu,
  Notice,
  Plugin,
  type TFile,
} from "obsidian";

import { RecoveryStore } from "../adapters/obsidian/recovery-store";
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
import type { DisplayMode, TransformOperation } from "../core/types";
import { HeadingDisplayController } from "../editor/heading-display-extension";
import { HeadingReadingProcessor } from "../reading/heading-postprocessor";
import { HeadingNumeralsSettingTab } from "./settings-tab";

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
      await this.saveData({ schemaVersion: 2, settings: snapshot });
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
    const commandNames: ReadonlyArray<readonly [DisplayMode, Parameters<Translate>[0]]> = [
      ["normal", "command.mode.normal"],
      ["show", "command.mode.show"],
      ["conceal", "command.mode.conceal"],
    ];
    for (const [mode, key] of commandNames) {
      this.addCommand({
        id: `set-view-mode-${mode}`,
        name: this.translate()(key),
        callback: () => void this.setDisplayMode(mode).catch((error: unknown) => {
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
          const available = this.app.workspace.getActiveViewOfType(MarkdownView)?.file != null;
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
      id: "cycle-current-note-view-mode",
      name: this.translate()("command.note.cycle"),
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        const available = file?.extension.toLowerCase() === "md";
        if (!checking && available && file != null) {
          void this.cycleNoteMode(file);
        }
        return available;
      },
    });
  }

  private addRibbon(): void {
    this.addRibbonIcon("list-ordered", "Heading Numerals", (event) => {
      const menu = new Menu();
      for (const mode of ["normal", "show", "conceal"] as const) {
        menu.addItem((item) => item
          .setTitle(this.translate()(`mode.${mode}`))
          .setChecked(this.settings.displayMode === mode)
          .onClick(() => void this.setDisplayMode(mode).catch((error: unknown) => {
            console.error("Heading Numerals: failed to save view mode", error);
          })));
      }
      menu.addSeparator();
      for (const operation of ["write", "remove", "renumber", "strip-markers"] as const) {
        const key = operation === "strip-markers"
          ? "command.strip.current"
          : `command.${operation}.current` as const;
        menu.addItem((item) => item
          .setTitle(this.translate()(key))
          .onClick(() => this.runCurrent(operation)));
      }
      menu.addSeparator();
      menu.addItem((item) => item
        .setTitle(this.translate()("command.batch.folder"))
        .onClick(() => this.batchController?.open(this.translate())));
      menu.showAtMouseEvent(event);
    });
  }

  private runCurrent(operation: TransformOperation): void {
    runCurrentNoteOperation(this.app, this.settings, operation, this.translate());
  }

  private async setDisplayMode(mode: DisplayMode): Promise<void> {
    const next = cloneSettings(this.settings);
    next.displayMode = mode;
    await this.saveSettings(next, "display");
    new Notice(this.translate()("notice.mode", { mode: this.translate()(`mode.${mode}`) }));
  }

  private async cycleNoteMode(file: TFile): Promise<void> {
    let nextMode: "show" | "conceal" | "normal" | "inherit" = "show";
    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      const values = frontmatter as Record<string, unknown>;
      const current = values["heading-numerals"];
      nextMode = current === "show"
        ? "conceal"
        : current === "conceal" ? "normal"
          : current === "normal" ? "inherit" : "show";
      if (nextMode === "inherit") {
        delete values["heading-numerals"];
      } else {
        values["heading-numerals"] = nextMode;
      }
    });
    this.displayController?.refreshAll();
    this.rerenderReadingViews();
    const resolvedMode = nextMode as "show" | "conceal" | "normal" | "inherit";
    const label = resolvedMode === "inherit"
      ? this.translate()(`mode.${this.settings.displayMode}`)
      : this.translate()(`mode.${resolvedMode}`);
    new Notice(this.translate()("notice.mode", { mode: label }));
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
        virtual.remove();
      }
      for (const concealed of ownerDocument.querySelectorAll<HTMLElement>(
        ".markdown-reading-view .heading-numerals-concealed",
      )) {
        concealed.replaceWith(...concealed.childNodes);
      }
    }
  }
}

export type SettingsImpact = "none" | "appearance" | "display" | "all";
