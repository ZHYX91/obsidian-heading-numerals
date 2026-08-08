import type { HeadingNumeralsSettings } from "./settings";
import {
  DISPLAY_MODES,
  displayModeToPreferences,
  type CleanupScope,
  type DisplayMode,
} from "../core/types";
import { isBuiltInSchemeId } from "../core/schemes";

export interface NoteOverrides {
  disabled: boolean;
  showVirtualNumbers: boolean | null;
  concealStoredNumbers: boolean | null;
  schemeId: string | null;
  cleanupScope: CleanupScope | null;
  starts: Partial<Record<1 | 2 | 3 | 4 | 5 | 6, number>>;
}

export interface EffectiveNoteSettings {
  disabled: boolean;
  showVirtualNumbers: boolean;
  concealStoredNumbers: boolean;
  schemeId: string;
  cleanupScope: CleanupScope;
  starts: Partial<Record<1 | 2 | 3 | 4 | 5 | 6, number>>;
}

const EMPTY_OVERRIDES: NoteOverrides = {
  disabled: false,
  showVirtualNumbers: null,
  concealStoredNumbers: null,
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
  const legacyDisplay = displayMode == null ? null : displayModeToPreferences(displayMode);
  const showValue = data["heading-numerals-show-virtual"];
  const concealValue = data["heading-numerals-conceal-stored"];
  const showVirtualNumbers = typeof showValue === "boolean"
    ? showValue
    : legacyDisplay?.showVirtualNumbers ?? null;
  const concealStoredNumbers = typeof concealValue === "boolean"
    ? concealValue
    : legacyDisplay?.concealStoredNumbers ?? null;
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
  return { disabled: ignore, showVirtualNumbers, concealStoredNumbers, schemeId, cleanupScope, starts };
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
    showVirtualNumbers: overrides.showVirtualNumbers ?? settings.showVirtualNumbers,
    concealStoredNumbers: overrides.concealStoredNumbers ?? settings.concealStoredNumbers,
    schemeId: schemeExists && requestedScheme != null ? requestedScheme : settings.selectedSchemeId,
    cleanupScope: overrides.cleanupScope ?? settings.cleanupScope,
    starts: { ...overrides.starts },
  };
}
