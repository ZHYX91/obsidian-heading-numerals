import type { DocumentNumberingSettings } from "../config/settings";
import {
  DISPLAY_MODES,
  displayModeToPreferences,
  type DisplayMode,
} from "../core/types";
import { isBuiltInSchemeId } from "../core/schemes";

export const NOTE_OVERRIDE_KEYS = [
  "document-numbering",
  "document-numbering-ignore",
  "document-numbering-show-virtual",
  "document-numbering-conceal-stored",
  "document-numbering-scheme",
  "document-numbering-clean-scope",
  "document-numbering-clean-confidence",
  "document-numbering-start",
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
  const value = values["document-numbering"];
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
  settings: DocumentNumberingSettings,
): NoteControlSnapshot {
  const legacy = legacyMode(values);
  const legacyPreferences = legacy == null ? null : displayModeToPreferences(legacy);
  const showVirtual = explicitTriState(values["document-numbering-show-virtual"])
    ?? (legacyPreferences == null ? "inherit" : legacyPreferences.showVirtualNumbers ? "on" : "off");
  const concealStored = explicitTriState(values["document-numbering-conceal-stored"])
    ?? (legacyPreferences == null ? "inherit" : legacyPreferences.concealStoredNumbers ? "on" : "off");
  const rawScheme = values["document-numbering-scheme"];
  const schemeId = typeof rawScheme === "string" && rawScheme.length > 0 ? rawScheme : null;
  const schemeExists = schemeId != null && (
    settings.customSchemes.some((scheme) => scheme.id === schemeId)
    || isBuiltInSchemeId(schemeId)
  );
  const ignore = values["document-numbering-ignore"] === true || values["document-numbering"] === "off";

  return {
    showVirtual,
    concealStored,
    schemeId,
    ignore,
    effectiveShowVirtual: stateValue(showVirtual, settings.showVirtualNumbers),
    effectiveConcealStored: stateValue(concealStored, settings.concealStoredNumbers),
    effectiveSchemeId: schemeExists && schemeId != null ? schemeId : settings.selectedSchemeId,
    effectiveIgnore: ignore,
    usesLegacyDisplayProperty: legacy != null || values["document-numbering"] === "off",
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
    const otherKey = editedKey === "document-numbering-show-virtual"
      ? "document-numbering-conceal-stored"
      : "document-numbering-show-virtual";
    if (!hasOwn(values, otherKey)) {
      changed = assign(
        values,
        otherKey,
        otherKey === "document-numbering-show-virtual"
          ? preferences.showVirtualNumbers
          : preferences.concealStoredNumbers,
      ) || changed;
    }
    changed = remove(values, "document-numbering") || changed;
  } else if (values["document-numbering"] === "off") {
    changed = assign(values, "document-numbering-ignore", true) || changed;
    changed = remove(values, "document-numbering") || changed;
  } else if (values["document-numbering"] === "inherit") {
    changed = remove(values, "document-numbering") || changed;
  }
  return changed;
}

function applyTriState(
  values: Record<string, unknown>,
  key: "document-numbering-show-virtual" | "document-numbering-conceal-stored",
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
      return applyTriState(values, "document-numbering-show-virtual", change.value);
    case "conceal-stored":
      return applyTriState(values, "document-numbering-conceal-stored", change.value);
    case "scheme":
      return change.value == null
        ? remove(values, "document-numbering-scheme")
        : assign(values, "document-numbering-scheme", change.value);
    case "ignore": {
      let changed = change.value
        ? assign(values, "document-numbering-ignore", true)
        : remove(values, "document-numbering-ignore");
      if (values["document-numbering"] === "off") {
        changed = remove(values, "document-numbering") || changed;
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
