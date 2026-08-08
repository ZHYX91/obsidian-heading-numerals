import {
  MarkdownView,
  Menu,
  Notice,
  Plugin,
  type TFile,
} from "obsidian";

import { BatchController } from "../commands/batch";
import { runCurrentNoteOperation } from "../commands/current-note";
import { createTranslator, type Translate } from "../config/i18n";
import {
  DEFAULT_SETTINGS,
  sanitizePluginData,
  type HeadingNumeralsSettings,
  type LastBatchSnapshot,
} from "../config/settings";
import type { DisplayMode, TransformOperation } from "../core/types";
import { HeadingDisplayController } from "../editor/heading-display-extension";
import { HeadingReadingProcessor } from "../reading/heading-postprocessor";
import { HeadingNumeralsSettingTab } from "./settings-tab";

export default class HeadingNumeralsPlugin extends Plugin {
  override settings: HeadingNumeralsSettings = { ...DEFAULT_SETTINGS };
  private lastBatch: LastBatchSnapshot | null = null;
  private displayController: HeadingDisplayController | null = null;
  private batchController: BatchController | null = null;

  override async onload(): Promise<void> {
    const data = sanitizePluginData(await this.loadData());
    this.settings = data.settings;
    this.lastBatch = data.lastBatch;

    this.displayController = new HeadingDisplayController(() => this.settings);
    this.registerEditorExtension(this.displayController.createExtension());
    const readingProcessor = new HeadingReadingProcessor(this.app, () => this.settings);
    this.registerMarkdownPostProcessor((element, context) => readingProcessor.process(element, context));

    this.batchController = new BatchController(
      this.app,
      () => this.settings,
      {
        getLastBatch: () => this.lastBatch,
        setLastBatch: async (snapshot) => {
          this.lastBatch = snapshot;
          await this.persistData();
        },
      },
    );

    this.addSettingTab(new HeadingNumeralsSettingTab(this.app, this));
    this.registerCommands();
    this.addRibbon();
    this.applyAppearance();
  }

  override onunload(): void {
    this.cleanupReadingDom();
    this.clearAppearance();
  }

  async saveSettings(): Promise<void> {
    await this.persistData();
    this.applyAppearance();
    this.displayController?.refreshAll();
    this.rerenderReadingViews();
  }

  private async persistData(): Promise<void> {
    await this.saveData({ settings: this.settings, lastBatch: this.lastBatch });
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
        callback: () => void this.setDisplayMode(mode),
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
          .onClick(() => void this.setDisplayMode(mode)));
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
    this.settings.displayMode = mode;
    await this.saveSettings();
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
