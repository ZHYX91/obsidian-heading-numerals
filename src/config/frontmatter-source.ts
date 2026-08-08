import { getFrontMatterInfo, parseYaml } from "obsidian";

import { parseNoteOverrides, type NoteOverrides } from "./frontmatter";

export function parseNoteOverridesFromSource(source: string): NoteOverrides | null {
  try {
    const info = getFrontMatterInfo(source);
    return info.exists
      ? parseNoteOverrides(parseYaml(info.frontmatter))
      : parseNoteOverrides(null);
  } catch {
    return null;
  }
}
