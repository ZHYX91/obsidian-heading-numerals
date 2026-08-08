export class App {}

export function getLanguage(): string {
  return "en";
}

export class PluginSettingTab {
  containerEl: HTMLElement;

  constructor(public app: App, public plugin: unknown) {
    this.containerEl = typeof document === "undefined"
      ? {} as HTMLElement
      : document.createElement("div");
  }

  display(): void {}

  hide(): void {}

  update(): void {}
}

export class Modal {
  contentEl: HTMLElement;

  constructor(public app: App) {
    this.contentEl = typeof document === "undefined"
      ? {} as HTMLElement
      : document.createElement("div");
  }

  setTitle(_title: string): void {}

  open(): void {}

  close(): void {}
}

export class Setting {
  settingEl: HTMLElement;

  constructor(containerEl: HTMLElement) {
    this.settingEl = containerEl;
  }

  setName(_name: string): this { return this; }

  setDesc(_desc: string): this { return this; }

  setHeading(): this { return this; }
}

export class TFile {
  path: string;
  extension: string;

  constructor(path: string) {
    this.path = path;
    this.extension = path.split(".").pop() ?? "";
  }
}

export function normalizePath(path: string): string {
  return path;
}
