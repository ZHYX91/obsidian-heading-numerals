import { createScheme, renderCurrentLevel, renderTemplate } from "./schemes";
import type {
  Counters,
  NumberedHeading,
  NumberingOptions,
  ParsedHeading,
} from "./types";

function normalizedStart(options: NumberingOptions, level: number): number {
  const key = level as 1 | 2 | 3 | 4 | 5 | 6;
  const value = options.starts[key];
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 ? value : 1;
}

function cloneCounters(counters: Counters): Counters {
  return [...counters] as Counters;
}

export function numberHeadings(
  headings: readonly ParsedHeading[],
  options: NumberingOptions,
): NumberedHeading[] {
  const scheme = createScheme(options.scheme, options.customTemplates, options.customBaseLevel);
  const maxLevel = Math.min(6, Math.max(scheme.baseLevel, Math.trunc(options.maxLevel)));
  const starts = Array.from({ length: 6 }, (_unused, index) => normalizedStart(options, index + 1));
  const counters = starts.map((start) => start - 1) as Counters;
  const seen = [false, false, false, false, false, false];
  const output: NumberedHeading[] = [];

  for (const heading of headings) {
    const index = heading.level - 1;
    const currentCounter = seen[index] ? (counters[index] ?? 0) : (starts[index] ?? 1) - 1;
    counters[index] = currentCounter + 1;
    seen[index] = true;
    for (let lower = index + 1; lower < 6; lower += 1) {
      counters[lower] = (starts[lower] ?? 1) - 1;
      seen[lower] = false;
    }

    if (heading.level < scheme.baseLevel || heading.level > maxLevel) {
      output.push({ heading, label: null, counters: cloneCounters(counters), warning: null });
      continue;
    }

    const missing: number[] = [];
    for (let parent = scheme.baseLevel - 1; parent < index; parent += 1) {
      if (!seen[parent]) {
        missing.push(parent);
      }
    }
    if (missing.length > 0 && options.missingLevelStrategy === "skip") {
      output.push({
        heading,
        label: null,
        counters: cloneCounters(counters),
        warning: "missing-parent",
      });
      continue;
    }
    if (missing.length > 0 && options.missingLevelStrategy === "fill-one") {
      for (const parent of missing) {
        counters[parent] = starts[parent] ?? 1;
        seen[parent] = true;
      }
    }

    const template = scheme.templates[index] ?? "";
    const currentCounters = cloneCounters(counters);
    const label = missing.length > 0 && options.missingLevelStrategy === "current-only"
      ? renderCurrentLevel(template, heading.level, currentCounters)
      : renderTemplate(template, currentCounters);
    output.push({
      heading,
      label: label.trim().length === 0 ? null : label,
      counters: currentCounters,
      warning: null,
    });
  }

  return output;
}
