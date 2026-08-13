import type { NumberingScheme } from "./types";

function effectiveLegacyMaximum(scheme: NumberingScheme, maxLevel: number): number {
  const normalized = Number.isFinite(maxLevel) ? Math.trunc(maxLevel) : 6;
  return Math.min(6, Math.max(scheme.baseLevel, normalized));
}

export function legacyMaxLevelAffectsScheme(scheme: NumberingScheme, maxLevel: number): boolean {
  const maximum = effectiveLegacyMaximum(scheme, maxLevel);
  return scheme.templates.some((template, index) => index + 1 > maximum && template.trim().length > 0);
}

/**
 * Preserves the pre-template-only maximum-level behavior at the configuration boundary.
 * Keeping the persisted setting separate from the core makes this compatibility layer
 * removable later without changing the template-driven numbering contract.
 */
export function applyLegacyMaxLevel(scheme: NumberingScheme, maxLevel: number): NumberingScheme {
  if (!legacyMaxLevelAffectsScheme(scheme, maxLevel)) return scheme;
  const maximum = effectiveLegacyMaximum(scheme, maxLevel);
  return {
    ...scheme,
    templates: scheme.templates.map((template, index) => index + 1 <= maximum ? template : ""),
    recognitionTemplates: scheme.recognitionTemplates ?? scheme.templates,
  };
}
