import { App, MarkdownView, Notice, TFile, type TFolder } from "obsidian";

import type { Translate } from "../config/i18n";
import type {
  HeadingNumeralsSettings,
  LastBatchSnapshot,
} from "../config/settings";
import type { TransformOperation } from "../core/types";
import { digestText } from "../core/text-digest";
import { BatchOperationModal, FolderScopeModal, type BatchScope } from "../ui/batch-modals";
import { ChangePreviewModal, type PreviewDocument } from "../ui/preview-modal";
import { createSourcePlan } from "./transform-options";

export interface BatchPersistence {
  getLastBatch(): LastBatchSnapshot | null;
  setLastBatch(snapshot: LastBatchSnapshot | null): Promise<void>;
}

function pathInFolder(path: string, folder: TFolder | null): boolean {
  return folder == null || path.startsWith(`${folder.path}/`);
}

function isExcluded(path: string, excludedFolders: readonly string[]): boolean {
  return excludedFolders.some((folder) => path === folder || path.startsWith(`${folder}/`));
}

function snapshotSizeBytes(snapshot: LastBatchSnapshot): number {
  return new TextEncoder().encode(JSON.stringify(snapshot)).byteLength;
}

export class BatchController {
  constructor(
    private readonly app: App,
    private readonly getSettings: () => HeadingNumeralsSettings,
    private readonly persistence: BatchPersistence,
  ) {}

  open(translate: Translate): void {
    new FolderScopeModal(this.app, translate, (scope) => {
      const files = this.filesForScope(scope);
      new BatchOperationModal(this.app, translate, files.length, (operation) => {
        void this.preview(scope, operation, translate).catch((error: unknown) => {
          console.error("Heading Numerals batch preview failed", error);
          new Notice(translate("notice.batchFailed"));
        });
      }).open();
    }).open();
  }

  async undo(translate: Translate): Promise<void> {
    const snapshot = this.persistence.getLastBatch();
    if (snapshot == null) {
      new Notice(translate("notice.noBatch"));
      return;
    }
    await this.saveOpenMarkdownViews();
    const preflight: Array<{ file: TFile; current: string; before: string }> = [];
    for (const item of snapshot.files) {
      const file = this.app.vault.getAbstractFileByPath(item.path);
      if (!(file instanceof TFile)) {
        new Notice(translate("notice.undoConflict"));
        return;
      }
      const current = await this.app.vault.cachedRead(file);
      const matchesAfter = item.legacyAfter != null
        ? current === item.legacyAfter
        : await digestText(current) === item.afterHash;
      if (current !== item.before && !matchesAfter) {
        new Notice(translate("notice.undoConflict"));
        return;
      }
      preflight.push({ file, current, before: item.before });
    }
    const restored: Array<{ file: TFile; after: string }> = [];
    try {
      for (const item of preflight) {
        if (item.current !== item.before) {
          await this.app.vault.modify(item.file, item.before);
          restored.push({ file: item.file, after: item.current });
        }
      }
      await this.persistence.setLastBatch(null);
      new Notice(translate("notice.undoDone", { count: restored.length }));
    } catch (error) {
      console.error("Heading Numerals batch restore failed", error);
      for (const item of restored.reverse()) {
        try {
          await this.app.vault.modify(item.file, item.after);
        } catch (rollbackError) {
          console.error("Heading Numerals restore rollback failed", rollbackError);
        }
      }
      new Notice(translate("notice.batchFailed"));
    }
  }

  private filesForScope(scope: BatchScope): TFile[] {
    const settings = this.getSettings();
    return this.app.vault.getMarkdownFiles()
      .filter((file) => pathInFolder(file.path, scope.folder))
      .filter((file) => !isExcluded(file.path, settings.excludedFolders))
      .sort((left, right) => left.path.localeCompare(right.path));
  }

  private async saveOpenMarkdownViews(): Promise<void> {
    const saves: Promise<void>[] = [];
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.view instanceof MarkdownView && leaf.view.file != null) {
        saves.push(leaf.view.save());
      }
    });
    await Promise.all(saves);
  }

  private async preview(
    scope: BatchScope,
    operation: TransformOperation,
    translate: Translate,
  ): Promise<void> {
    await this.saveOpenMarkdownViews();
    const documents: PreviewDocument[] = [];
    let invalidFrontmatter = 0;
    for (const file of this.filesForScope(scope)) {
      const source = await this.app.vault.cachedRead(file);
      const result = createSourcePlan(source, operation, this.getSettings());
      if (result.status === "invalid-frontmatter") {
        invalidFrontmatter += 1;
      }
      if (result.status === "ready" && result.plan != null && result.plan.changes.length > 0) {
        documents.push({ path: file.path, plan: result.plan });
      }
    }
    if (invalidFrontmatter > 0) {
      new Notice(translate("notice.batchSkippedInvalid", { count: invalidFrontmatter }));
    }
    if (documents.length === 0) {
      new Notice(translate("notice.batchNone"));
      return;
    }
    new ChangePreviewModal({
      app: this.app,
      operation,
      documents,
      translate,
      onConfirm: async () => this.apply(documents, operation, translate),
    }).open();
  }

  private async apply(
    documents: readonly PreviewDocument[],
    operation: TransformOperation,
    translate: Translate,
  ): Promise<void> {
    const files: Array<{ file: TFile; before: string; after: string }> = [];
    for (const document of documents) {
      const file = this.app.vault.getAbstractFileByPath(document.path);
      if (!(file instanceof TFile)) {
        new Notice(translate("notice.batchChanged"));
        return;
      }
      const current = await this.app.vault.cachedRead(file);
      if (current !== document.plan.source) {
        new Notice(translate("notice.batchChanged"));
        return;
      }
      files.push({ file, before: current, after: document.plan.result });
    }
    const snapshot: LastBatchSnapshot = {
      createdAt: new Date().toISOString(),
      operation,
      status: "pending",
      files: await Promise.all(files.map(async (item) => ({
        path: item.file.path,
        before: item.before,
        afterHash: await digestText(item.after),
      }))),
    };
    const limit = this.getSettings().batchBackupLimitMb;
    if (snapshotSizeBytes(snapshot) > limit * 1024 * 1024) {
      new Notice(translate("notice.batchTooLarge", { limit }));
      return;
    }
    const modified: Array<{ file: TFile; before: string }> = [];
    try {
      await this.persistence.setLastBatch(snapshot);
      for (const item of files) {
        const current = await this.app.vault.cachedRead(item.file);
        if (current !== item.before) {
          throw new Error(`File changed before batch write: ${item.file.path}`);
        }
        await this.app.vault.modify(item.file, item.after);
        modified.push({ file: item.file, before: item.before });
      }
      snapshot.status = "applied";
      await this.persistence.setLastBatch(snapshot);
      new Notice(translate("notice.batchApplied", { count: modified.length }));
    } catch (error) {
      console.error("Heading Numerals batch failed", error);
      let rollbackComplete = true;
      for (const item of modified.reverse()) {
        try {
          await this.app.vault.modify(item.file, item.before);
        } catch (rollbackError) {
          rollbackComplete = false;
          console.error("Heading Numerals batch rollback failed", rollbackError);
        }
      }
      if (rollbackComplete) {
        try {
          await this.persistence.setLastBatch(null);
        } catch (persistenceError) {
          console.error("Heading Numerals could not clear the recovery snapshot", persistenceError);
        }
      }
      new Notice(translate("notice.batchFailed"));
    }
  }
}
