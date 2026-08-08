import { resolveNoteSettings } from "../config/frontmatter";
import { parseNoteOverridesFromSource } from "../config/frontmatter-source";
import { toNumberingOptions, type HeadingNumeralsSettings } from "../config/settings";
import { planHeadingTransform } from "../core/transform";
import type { TransformOperation, TransformPlan } from "../core/types";

export interface SourcePlanResult {
  status: "ready" | "disabled" | "invalid-frontmatter";
  plan: TransformPlan | null;
}

export function createSourcePlan(
  source: string,
  operation: TransformOperation,
  settings: HeadingNumeralsSettings,
): SourcePlanResult {
  const overrides = parseNoteOverridesFromSource(source);
  if (overrides == null) {
    return { status: "invalid-frontmatter", plan: null };
  }
  const effective = resolveNoteSettings(settings, overrides);
  if (effective.disabled) {
    return { status: "disabled", plan: null };
  }
  return {
    status: "ready",
    plan: planHeadingTransform(source, operation, {
      numbering: toNumberingOptions(settings, {
        scheme: effective.scheme,
        starts: effective.starts,
      }),
      writeMarkers: settings.writeMarkers,
      cleanupThreshold: effective.cleanupThreshold,
      removeMultiplePrefixes: settings.removeMultiplePrefixes,
      normalizeManualOnRenumber: settings.normalizeManualOnRenumber,
    }),
  };
}
