import type { HeadingNumeralsSettings } from "../config/settings";
import {
  DISPLAY_MODES,
  displayModeToPreferences,
  type DisplayMode,
} from "../core/types";
import { isBuiltInSchemeId } from "../core/schemes";

export const NOTE_OVERRIDE_KEYS = [
  "heading-numerals",
  "heading-numerals-ignore",
  "heading-numerals-show-virtual",
  "heading-numerals-conceal-stored",
  "heading-numerals-scheme",
  "heading-numerals-clean-scope",
  "heading-numerals-clean-confidence",
  "heading-numerals-start",
] as const;

export type TriState = "inherit" | "on" | "off";

export type NoteOverrideChange =
  | { readonly kind: "show-virtual"; readonly value: TriState }
  | { readonly kind: "conceal-stored"; readonly value: TriState }
  | { readonly kind: "scheme"; readonly value: string | null }
  | { readonly kind: "ignore"; readonly value: boolean }
  | { readonly kind: "reset" };

export interface NoteControlSnapshot {
  readonly showVirtual: TriState;
  readonly concealStored: TriState;
  readonly schemeId: string | null;
  readonly ignore: boolean;
  readonly effectiveShowVirtual: boolean;
  readonly effectiveConcealStored: boolean;
  readonly effectiveSchemeId: string;
  readonly effectiveIgnore: boolean;
  readonly usesLegacyDisplayProperty: boolean;
  readonly hasAnyOverride: boolean;
}

function hasOwn(values: Readonly<Record<string, unknown>>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(values, key);
}

function legacyMode(values: Readonly<Record<string, unknown>>): DisplayMode | null {
  const value = values["heading-numerals"];
  return typeof value === "string" && DISPLAY_MODES.includes(value as DisplayMode)
    ? value as DisplayMode
    : null;
}

function explicitTriState(value: unknown): TriState | null {
  return typeof value === "boolean" ? (value ? "on" : "off") : null;
}

function stateValue(value: TriState, fallback: boolean): boolean {
  return value === "inherit" ? fallback : value === "on";
}

export function readNoteControlSnapshot(
  values: Readonly<Record<string, unknown>>,
  settings: HeadingNumeralsSettings,
): NoteControlSnapshot {
  const legacy = legacyMode(values);
  const legacyPreferences = legacy == null ? null : displayModeToPreferences(legacy);
  const showVirtual = explicitTriState(values["heading-numerals-show-virtual"])
    ?? (legacyPreferences == null ? "inherit" : legacyPreferences.showVirtualNumbers ? "on" : "off");
  const concealStored = explicitTriState(values["heading-numerals-conceal-stored"])
    ?? (legacyPreferences == null ? "inherit" : legacyPreferences.concealStoredNumbers ? "on" : "off");
  const rawScheme = values["heading-numerals-scheme"];
  const schemeId = typeof rawScheme === "string" && rawScheme.length > 0 ? rawScheme : null;
  const schemeExists = schemeId != null && (
    settings.customSchemes.some((scheme) => scheme.id === schemeId)
    || isBuiltInSchemeId(schemeId)
  );
  const ignore = values["heading-numerals-ignore"] === true || values["heading-numerals"] === "off";

  return {
    showVirtual,
    concealStored,
    schemeId,
    ignore,
    effectiveShowVirtual: stateValue(showVirtual, settings.showVirtualNumbers),
    effectiveConcealStored: stateValue(concealStored, settings.concealStoredNumbers),
    effectiveSchemeId: schemeExists && schemeId != null ? schemeId : settings.selectedSchemeId,
    effectiveIgnore: ignore,
    usesLegacyDisplayProperty: legacy != null || values["heading-numerals"] === "off",
    hasAnyOverride: NOTE_OVERRIDE_KEYS.some((key) => hasOwn(values, key)),
  };
}

function assign(values: Record<string, unknown>, key: string, value: unknown): boolean {
  if (hasOwn(values, key) && Object.is(values[key], value)) return false;
  values[key] = value;
  return true;
}

function remove(values: Record<string, unknown>, key: string): boolean {
  if (!hasOwn(values, key)) return false;
  delete values[key];
  return true;
}

function migrateLegacyDisplay(values: Record<string, unknown>, editedKey: string): boolean {
  const legacy = legacyMode(values);
  let changed = false;
  if (legacy != null) {
    const preferences = displayModeToPreferences(legacy);
    const otherKey = editedKey === "heading-numerals-show-virtual"
      ? "heading-numerals-conceal-stored"
      : "heading-numerals-show-virtual";
    if (!hasOwn(values, otherKey)) {
      changed = assign(
        values,
        otherKey,
        otherKey === "heading-numerals-show-virtual"
          ? preferences.showVirtualNumbers
          : preferences.concealStoredNumbers,
      ) || changed;
    }
    changed = remove(values, "heading-numerals") || changed;
  } else if (values["heading-numerals"] === "off") {
    changed = assign(values, "heading-numerals-ignore", true) || changed;
    changed = remove(values, "heading-numerals") || changed;
  } else if (values["heading-numerals"] === "inherit") {
    changed = remove(values, "heading-numerals") || changed;
  }
  return changed;
}

function applyTriState(
  values: Record<string, unknown>,
  key: "heading-numerals-show-virtual" | "heading-numerals-conceal-stored",
  value: TriState,
): boolean {
  let changed = migrateLegacyDisplay(values, key);
  changed = value === "inherit"
    ? remove(values, key) || changed
    : assign(values, key, value === "on") || changed;
  return changed;
}

export function applyNoteOverrideChange(
  values: Record<string, unknown>,
  change: NoteOverrideChange,
): boolean {
  switch (change.kind) {
    case "show-virtual":
      return applyTriState(values, "heading-numerals-show-virtual", change.value);
    case "conceal-stored":
      return applyTriState(values, "heading-numerals-conceal-stored", change.value);
    case "scheme":
      return change.value == null
        ? remove(values, "heading-numerals-scheme")
        : assign(values, "heading-numerals-scheme", change.value);
    case "ignore": {
      let changed = change.value
        ? assign(values, "heading-numerals-ignore", true)
        : remove(values, "heading-numerals-ignore");
      if (values["heading-numerals"] === "off") {
        changed = remove(values, "heading-numerals") || changed;
      }
      return changed;
    }
    case "reset": {
      let changed = false;
      for (const key of NOTE_OVERRIDE_KEYS) changed = remove(values, key) || changed;
      return changed;
    }
  }
}
