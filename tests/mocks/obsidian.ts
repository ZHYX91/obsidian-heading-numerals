export class App {}

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
