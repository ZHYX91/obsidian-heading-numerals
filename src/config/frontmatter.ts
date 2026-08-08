import type { HeadingNumeralsSettings } from "./settings";
import { DISPLAY_MODES, type CleanupScope, type DisplayMode } from "../core/types";
import { isBuiltInSchemeId } from "../core/schemes";

export interface NoteOverrides {
  disabled: boolean;
  displayMode: DisplayMode | null;
  schemeId: string | null;
  cleanupScope: CleanupScope | null;
  starts: Partial<Record<1 | 2 | 3 | 4 | 5 | 6, number>>;
}

export interface EffectiveNoteSettings {
  disabled: boolean;
  displayMode: DisplayMode;
  schemeId: string;
  cleanupScope: CleanupScope;
  starts: Partial<Record<1 | 2 | 3 | 4 | 5 | 6, number>>;
}

const EMPTY_OVERRIDES: NoteOverrides = {
  disabled: false,
  displayMode: null,
  schemeId: null,
  cleanupScope: null,
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
  const schemeId = typeof schemeValue === "string" && /^[a-z0-9][a-z0-9-]{0,63}$/u.test(schemeValue)
    ? schemeValue
    : null;
  const scopeValue = data["heading-numerals-clean-scope"];
  const confidenceValue = data["heading-numerals-clean-confidence"];
  const cleanupScope = scopeValue === "plugin" || scopeValue === "templates" || scopeValue === "common"
    ? scopeValue
    : confidenceValue === "plugin" ? "plugin"
      : confidenceValue === "medium" ? "common"
        : confidenceValue === "high" ? "templates" : null;
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
  return { disabled: ignore, displayMode, schemeId, cleanupScope, starts };
}

export function resolveNoteSettings(
  settings: HeadingNumeralsSettings,
  overrides: NoteOverrides,
): EffectiveNoteSettings {
  const requestedScheme = overrides.schemeId;
  const schemeExists = requestedScheme != null && (
    isBuiltInSchemeId(requestedScheme)
    || settings.customSchemes.some((scheme) => scheme.id === requestedScheme)
  );
  return {
    disabled: overrides.disabled,
    displayMode: overrides.displayMode ?? settings.displayMode,
    schemeId: schemeExists && requestedScheme != null ? requestedScheme : settings.selectedSchemeId,
    cleanupScope: overrides.cleanupScope ?? settings.cleanupScope,
    starts: { ...overrides.starts },
  };
}
