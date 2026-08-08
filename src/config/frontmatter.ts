import type { HeadingNumeralsSettings } from "./settings";
import { DISPLAY_MODES, SCHEME_IDS, type CleanupThreshold, type DisplayMode, type SchemeId } from "../core/types";

export interface NoteOverrides {
  disabled: boolean;
  displayMode: DisplayMode | null;
  scheme: SchemeId | null;
  cleanupThreshold: CleanupThreshold | null;
  starts: Partial<Record<1 | 2 | 3 | 4 | 5 | 6, number>>;
}

export interface EffectiveNoteSettings {
  disabled: boolean;
  displayMode: DisplayMode;
  scheme: SchemeId;
  cleanupThreshold: CleanupThreshold;
  starts: Partial<Record<1 | 2 | 3 | 4 | 5 | 6, number>>;
}

const EMPTY_OVERRIDES: NoteOverrides = {
  disabled: false,
  displayMode: null,
  scheme: null,
  cleanupThreshold: null,
  starts: {},
};

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value != null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function positiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1
    ? value
    : null;
}

export function parseNoteOverrides(frontmatter: unknown): NoteOverrides {
  const data = record(frontmatter);
  if (data == null) {
    return { ...EMPTY_OVERRIDES, starts: {} };
  }
  const modeValue = data["heading-numerals"];
  const ignore = data["heading-numerals-ignore"] === true || modeValue === "off";
  const displayMode = typeof modeValue === "string" && DISPLAY_MODES.includes(modeValue as DisplayMode)
    ? modeValue as DisplayMode
    : null;
  const schemeValue = data["heading-numerals-scheme"];
  const scheme = typeof schemeValue === "string" && SCHEME_IDS.includes(schemeValue as SchemeId)
    ? schemeValue as SchemeId
    : null;
  const confidenceValue = data["heading-numerals-clean-confidence"];
  const cleanupThreshold = confidenceValue === "plugin" || confidenceValue === "high" || confidenceValue === "medium"
    ? confidenceValue
    : null;
  const startsData = record(data["heading-numerals-start"]);
  const starts: Partial<Record<1 | 2 | 3 | 4 | 5 | 6, number>> = {};
  if (startsData != null) {
    for (let level = 1; level <= 6; level += 1) {
      const value = positiveInteger(startsData[`h${level}`]);
      if (value != null) {
        starts[level as 1 | 2 | 3 | 4 | 5 | 6] = value;
      }
    }
  }
  return { disabled: ignore, displayMode, scheme, cleanupThreshold, starts };
}

export function resolveNoteSettings(
  settings: HeadingNumeralsSettings,
  overrides: NoteOverrides,
): EffectiveNoteSettings {
  return {
    disabled: overrides.disabled,
    displayMode: overrides.displayMode ?? settings.displayMode,
    scheme: overrides.scheme ?? settings.scheme,
    cleanupThreshold: overrides.cleanupThreshold ?? settings.cleanupThreshold,
    starts: { ...overrides.starts },
  };
}
